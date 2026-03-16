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
import { CliDashboard } from '../dashboard/cliDashboard.js';

const BATCH_SIZE = 200;
const DEFAULT_NUM_WORKERS = Math.max(1, cpus().length - 1);
const DEFAULT_ADAPTIVE_STEP_PERCENT = 0.05;

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

  const maxUsers = config.concurrency || config.maxUsers || 1;
  const concurrency = maxUsers;
  const duration = config.duration || 10;

  const target = config.url || (hasRoutes ? `${config.routes.length} routes` : 'scenarios');
  log(`Starting stress test → ${target}`);
  log(`Concurrency: ${concurrency} | Duration: ${duration}s`);

  // ── Setup ─────────────────────────────────────────────────────────
  const numWorkers = Math.min(DEFAULT_NUM_WORKERS, concurrency);
  const startConcurrency = config.startConcurrency || 1;
  const rampUp = config.rampUp || 0;
  const rampDown = config.rampDown || 0;
  const targetRPS = config.targetRPS;
  const burst = config.burst || null;
  const adaptiveStep = Math.max(
    1,
    Math.floor((config.adaptiveStep || maxUsers * DEFAULT_ADAPTIVE_STEP_PERCENT)),
  );
  const adaptiveIntervalMs = config.adaptiveIntervalMs || 1000;
  let currentConcurrency = Math.min(maxUsers, startConcurrency);
  let lastAdjustAt = 0;
  const scheduler = new Scheduler(config);
  const metrics = new MetricsCollector();

  const manager = new WorkerManager(config, numWorkers);

  // Merge worker metrics as they arrive
  manager.onMetrics((partial) => {
    metrics.merge(partial);
  });

  await manager.start();

  // ── Live dashboard ────────────────────────────────────────────────
  let dashboardInterval = null;
  let dashboard = null;
  if (options.dashboard) {
    dashboard = new CliDashboard();
    dashboard.start();
    dashboardInterval = setInterval(() => {
      const snap = metrics.getSummary();
      dashboard.update({
        activeUsers: currentConcurrency,
        requestsPerSec: snap.requestsPerSec,
        avgLatency: snap.avgResponseTime,
        errorRate: snap.errorRate,
        cpuPercent: snap.cpuPercent,
        memoryMB: snap.memoryMB,
        totalRequests: snap.totalRequests,
        p95: snap.p95,
        p99: snap.p99,
        perEndpoint: snap.perEndpoint,
      });
    }, 1000);
  }

  // ── Dispatch loop ─────────────────────────────────────────────────
  metrics.start();
  const endAt = Date.now() + duration * 1000;

  while (Date.now() < endAt) {
    const batchPromises = [];

    const now = Date.now();
    const elapsedSeconds = (now - metrics.startTime) / 1000;
    const { current, maxAllowed } = calculateConcurrency({
      elapsedSeconds,
      duration,
      startConcurrency,
      maxUsers,
      rampUp,
      rampDown,
      burst,
    });
    currentConcurrency = current;

    if (targetRPS && now - lastAdjustAt >= adaptiveIntervalMs) {
      const elapsed = (Date.now() - metrics.startTime) / 1000 || 1;
      const currentRps = Math.floor(metrics.totalRequests / elapsed);
      if (currentRps < targetRPS * 0.98) {
        currentConcurrency = Math.min(maxAllowed, currentConcurrency + adaptiveStep);
      } else if (currentRps > targetRPS * 1.02) {
        currentConcurrency = Math.max(1, currentConcurrency - adaptiveStep);
      }
      lastAdjustAt = now;
    }

    const batchLimit = Math.min(BATCH_SIZE, Math.ceil(currentConcurrency / numWorkers));

    for (let w = 0; w < numWorkers; w++) {
      // Build route assignments for this batch
      const routes = [];
      const tasks = [];
      for (let j = 0; j < batchLimit; j++) {
        if (hasScenarios) {
          const scenario = scheduler.getNextScenario();
          tasks.push({
            steps: scenario.steps || [],
            scenarioName: scenario.name,
          });
        } else {
          const route = scheduler.getNextRoute();
          routes.push(route);
          tasks.push(j);
        }
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
  }
  if (dashboard) {
    dashboard.stop();
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

function calculateConcurrency({
  elapsedSeconds,
  duration,
  startConcurrency,
  maxUsers,
  rampUp,
  rampDown,
  burst,
}) {
  let desired = maxUsers;
  const isBurstConfig = burst && typeof burst === 'object';
  const burstStart = isBurstConfig ? (burst.start || 0) : 0;
  const burstDuration = isBurstConfig ? (burst.duration || 0) : 0;
  const burstMultiplier = isBurstConfig ? (burst.multiplier || 1) : 1;
  const burstMax = isBurstConfig
    ? burst.maxUsers || Math.round(maxUsers * burstMultiplier)
    : maxUsers;
  const inBurst =
    isBurstConfig &&
    elapsedSeconds >= burstStart &&
    elapsedSeconds <= burstStart + burstDuration;
  const maxAllowed = inBurst ? burstMax : maxUsers;
  if (rampUp && elapsedSeconds < rampUp) {
    const progress = elapsedSeconds / rampUp;
    desired = Math.max(
      1,
      Math.round(startConcurrency + (maxUsers - startConcurrency) * progress),
    );
  }

  if (rampDown && elapsedSeconds > duration - rampDown) {
    const remaining = Math.max(0, duration - elapsedSeconds);
    const progress = remaining / rampDown;
    desired = Math.max(1, Math.round(startConcurrency + (maxUsers - startConcurrency) * progress));
  }

  if (inBurst) {
    desired = Math.min(burstMax, Math.round(desired * burstMultiplier));
  }

  return { current: Math.min(maxAllowed, Math.max(1, desired)), maxAllowed };
}
