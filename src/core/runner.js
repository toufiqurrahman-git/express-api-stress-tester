/**
 * Main stress-test runner (v2).
 *
 * Orchestrates the test lifecycle:
 *   1. Validate & normalise configuration
 *   2. Spawn worker threads via WorkerManager
 *   3. Use Scheduler to plan per-batch route assignments
 *   4. Dispatch batches for the configured duration
 *   5. Aggregate metrics, apply thresholds, generate report
 */
import { cpus } from 'node:os';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { ReportWriter, log } from '../reporting/reportWriter.js';
import { WorkerManager } from './workerManager.js';
import { Scheduler } from './scheduler.js';

const BATCH_SIZE = 200;
const DEFAULT_NUM_WORKERS = Math.max(1, cpus().length - 1);

/**
 * Run a stress test.
 *
 * @param {object} config  - test configuration
 * @param {object} [options]
 * @param {string} [options.reportPath]   - output file path
 * @param {string} [options.reportFormat] - 'txt' | 'json' | 'html'
 * @param {boolean} [options.dashboard]   - enable live dashboard (placeholder)
 * @returns {Promise<object>} summary metrics
 */
export async function runStressTest(config, options = {}) {
  // ── Validate ──────────────────────────────────────────────────────
  if (!config) {
    throw new Error('config is required');
  }

  const hasUrl = Boolean(config.url);
  const hasRoutes = Array.isArray(config.routes) && config.routes.length > 0;
  const hasScenarios = Array.isArray(config.scenarios) && config.scenarios.length > 0;

  if (!hasUrl && !hasRoutes && !hasScenarios) {
    throw new Error(
      'config.url, config.routes, or config.scenarios is required',
    );
  }

  // Normalise base URL for worker threads
  if (hasUrl && !config.baseUrl) {
    try {
      const parsed = new URL(config.url);
      config.baseUrl = parsed.origin;
    } catch {
      log(`Warning: could not parse "${config.url}" as URL, using as-is for baseUrl`);
      config.baseUrl = config.url;
    }
  }

  const concurrency = config.concurrency || 1;
  const duration = config.duration || 10;

  const target = config.url || (hasRoutes ? `${config.routes.length} routes` : 'scenarios');
  log(`Starting stress test → ${target}`);
  log(`Concurrency: ${concurrency} | Duration: ${duration}s`);

  // ── Setup ─────────────────────────────────────────────────────────
  const numWorkers = Math.min(DEFAULT_NUM_WORKERS, concurrency);
  const scheduler = new Scheduler(config);
  const metrics = new MetricsCollector();

  const manager = new WorkerManager(config, numWorkers);

  // Merge worker metrics as they arrive
  manager.onMetrics((partial) => {
    metrics.merge(partial);
  });

  await manager.start();

  // ── Live dashboard (placeholder) ──────────────────────────────────
  let dashboardInterval = null;
  if (options.dashboard) {
    dashboardInterval = setInterval(() => {
      const snap = metrics.getSummary();
      process.stdout.write(
        `\r  RPS: ${snap.requestsPerSec} | Avg: ${snap.avgResponseTime}ms | Errors: ${snap.errorRate}%`,
      );
    }, 1000);
  }

  // ── Dispatch loop ─────────────────────────────────────────────────
  metrics.start();
  const endAt = Date.now() + duration * 1000;
  const batchLimit = Math.min(BATCH_SIZE, Math.ceil(concurrency / numWorkers));

  while (Date.now() < endAt) {
    const batchPromises = [];

    for (let w = 0; w < numWorkers; w++) {
      // Build route assignments for this batch
      const routes = [];
      const tasks = [];
      for (let j = 0; j < batchLimit; j++) {
        const route = scheduler.getNextRoute();
        routes.push(route);
        tasks.push(j);
      }

      batchPromises.push(
        manager.dispatch({ type: 'batch', tasks, routes }),
      );
    }

    await Promise.all(batchPromises);
  }

  metrics.stop();

  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    process.stdout.write('\n');
  }

  // ── Teardown ──────────────────────────────────────────────────────
  await manager.stop();

  // ── Thresholds ────────────────────────────────────────────────────
  const summary = metrics.getSummary();
  summary.result = applyThresholds(summary, config.thresholds);

  // ── Report ────────────────────────────────────────────────────────
  const reportPath = options.reportPath || 'stress-test-report.txt';
  const reportFormat = options.reportFormat || 'txt';
  const writer = new ReportWriter(config, summary);
  writer.write(reportPath, reportFormat);

  return summary;
}

/**
 * Evaluate threshold rules and return 'PASSED' or 'FAILED'.
 */
function applyThresholds(summary, thresholds) {
  if (!thresholds) {
    // Default: fail if error rate ≥ 5 %
    return summary.errorRate < 5 ? 'PASSED' : 'FAILED';
  }

  if (
    thresholds.maxErrorRate != null &&
    summary.errorRate > thresholds.maxErrorRate
  ) {
    log(`Threshold FAILED: errorRate ${summary.errorRate}% > ${thresholds.maxErrorRate}%`);
    return 'FAILED';
  }

  if (
    thresholds.maxAvgLatency != null &&
    summary.avgResponseTime > thresholds.maxAvgLatency
  ) {
    log(`Threshold FAILED: avgLatency ${summary.avgResponseTime}ms > ${thresholds.maxAvgLatency}ms`);
    return 'FAILED';
  }

  if (
    thresholds.minRPS != null &&
    summary.requestsPerSec < thresholds.minRPS
  ) {
    log(`Threshold FAILED: RPS ${summary.requestsPerSec} < ${thresholds.minRPS}`);
    return 'FAILED';
  }

  return 'PASSED';
}
