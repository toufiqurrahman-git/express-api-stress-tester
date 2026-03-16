/**
 * Worker thread manager.
 *
 * Spawns a pool of worker_threads and dispatches request batches
 * to them in round-robin fashion.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'worker.js');

export class WorkerManager {
  /**
   * @param {object} config     - stress test configuration (forwarded to workers)
   * @param {number} numWorkers - number of worker threads to spawn
   */
  constructor(config, numWorkers) {
    this.config = config;
    this.numWorkers = numWorkers;
    this.workers = [];
    this.currentIndex = 0;
    this.metricsCallbacks = [];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Spawn all worker threads and wait until they are online.
   */
  async start() {
    const onlinePromises = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const w = new Worker(WORKER_PATH, { workerData: this.config });

      // Forward metrics messages to registered callbacks
      w.on('message', (msg) => {
        if (msg.type === 'result') {
          for (const cb of this.metricsCallbacks) {
            cb(msg.metrics);
          }
        }
      });

      w.on('error', (err) => {
        process.stderr.write(`[WorkerManager] worker error: ${err.message}\n`);
      });

      const online = new Promise((resolve) => {
        w.once('online', resolve);
      });
      onlinePromises.push(online);
      this.workers.push(w);
    }

    await Promise.all(onlinePromises);
  }

  /**
   * Dispatch a batch of work to the next worker (round-robin).
   *
   * @param {object} batch - message to post, e.g. { type: 'batch', tasks, routes }
   * @returns {Promise<void>} resolves when the worker reports back
   */
  async dispatch(batch) {
    if (this.workers.length === 0) {
      throw new Error('No workers are running. Call start() first.');
    }

    const worker = this.workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.workers.length;

    return new Promise((resolve) => {
      const handler = (msg) => {
        if (msg.type === 'result') {
          worker.removeListener('message', handler);
          resolve(msg);
        }
      };
      worker.on('message', handler);
      worker.postMessage(batch);
    });
  }

  /**
   * Send stop signal to all workers and wait for them to exit.
   */
  async stop() {
    const exitPromises = this.workers.map(
      (w) =>
        new Promise((resolve) => {
          w.once('exit', resolve);
          w.postMessage({ type: 'stop' });
        }),
    );
    await Promise.all(exitPromises);
    this.workers = [];
    this.currentIndex = 0;
  }

  // ── Callbacks ──────────────────────────────────────────────────────

  /**
   * Register a callback that fires whenever a worker reports metrics.
   * @param {function} callback - receives the metrics object
   */
  onMetrics(callback) {
    this.metricsCallbacks.push(callback);
  }
}
