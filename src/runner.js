import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MetricsCollector } from './metrics.js';
import { log, writeReport } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'worker.js');

// Max workers = number of CPU cores (minus 1 for main thread, min 1)
const DEFAULT_NUM_WORKERS = Math.max(1, cpus().length - 1);
// Max tasks dispatched per batch per worker to avoid overloading event loop
const BATCH_SIZE = 200;

/**
 * Main test runner.
 *
 * Spawns worker threads and distributes request tasks across them
 * for the configured duration. Collects metrics and writes a report.
 *
 * @param {object} config - stress test configuration
 * @param {object} [options] - optional overrides
 * @param {string} [options.reportPath] - custom report file path
 * @returns {Promise<object>} summary metrics
 */
export async function runStressTest(config, options = {}) {
  // ── Validate ──────────────────────────────────────────────────────
  if (!config || !config.url) {
    throw new Error('config.url is required');
  }
  const concurrency = config.concurrency || 1;
  const duration = config.duration || 10; // seconds

  log(`Starting stress test → ${config.url}`);
  log(`Concurrency: ${concurrency} | Duration: ${duration}s`);

  // ── Decide worker count ───────────────────────────────────────────
  const numWorkers = Math.min(DEFAULT_NUM_WORKERS, concurrency);
  const metrics = new MetricsCollector();

  // ── Spawn workers ─────────────────────────────────────────────────
  const workers = [];
  for (let i = 0; i < numWorkers; i++) {
    const w = new Worker(WORKER_PATH, { workerData: config });
    workers.push(w);
  }

  // Listen for partial metrics from workers
  for (const w of workers) {
    w.on('message', (msg) => {
      if (msg.type === 'result') {
        metrics.merge(msg.metrics);
      }
    });
    w.on('error', (err) => {
      log(`Worker error: ${err.message}`);
    });
  }

  // ── Dispatch loop ─────────────────────────────────────────────────
  // We send batches of task indices to workers in round-robin fashion
  // until the duration expires.
  metrics.start();
  const endAt = Date.now() + duration * 1000;
  let taskIndex = 0;

  while (Date.now() < endAt) {
    const batchPromises = [];

    for (const w of workers) {
      const tasks = [];
      const batchLimit = Math.min(
        BATCH_SIZE,
        Math.ceil(concurrency / numWorkers)
      );
      for (let j = 0; j < batchLimit; j++) {
        tasks.push(taskIndex++);
      }
      // Wrap in a promise that resolves when the worker replies
      const p = new Promise((resolve) => {
        const handler = (msg) => {
          if (msg.type === 'result') {
            w.removeListener('message', handler);
            resolve();
          }
        };
        w.on('message', handler);
        w.postMessage({ type: 'batch', tasks });
      });
      batchPromises.push(p);
    }

    // Wait for all workers to finish this round before dispatching next
    await Promise.all(batchPromises);
  }

  metrics.stop();

  // ── Teardown workers ──────────────────────────────────────────────
  const termPromises = workers.map(
    (w) =>
      new Promise((resolve) => {
        w.on('exit', resolve);
        w.postMessage({ type: 'stop' });
      })
  );
  await Promise.all(termPromises);

  // ── Report ────────────────────────────────────────────────────────
  const summary = metrics.getSummary();
  writeReport(config, summary, options.reportPath);

  return summary;
}
