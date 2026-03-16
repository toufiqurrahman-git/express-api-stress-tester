/**
 * Distributed testing coordinator using TCP.
 *
 * MasterNode – listens for WorkerNode connections over TCP, distributes
 *   test configuration, and aggregates results.
 * WorkerNode – connects to a master, receives work, runs a local
 *   stress test, and reports results back.
 *
 * Wire protocol: newline-delimited JSON (ndjson).
 */
import { createServer, createConnection } from 'node:net';
import { runStressTest } from './runner.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Send a JSON message over a TCP socket (newline-delimited).
 */
function sendMessage(socket, msg) {
  socket.write(JSON.stringify(msg) + '\n');
}

/**
 * Create a line-based message parser for an ndjson stream.
 * Calls `onMessage(parsed)` for every complete JSON line received.
 */
function createMessageParser(socket, onMessage) {
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) fragment
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim().length === 0) continue;
      try {
        onMessage(JSON.parse(line));
      } catch {
        // Ignore malformed messages
      }
    }
  });
}

// ═════════════════════════════════════════════════════════════════════
//  MasterNode
// ═════════════════════════════════════════════════════════════════════

export class MasterNode {
  /**
   * @param {object} [options]
   * @param {number} [options.port] - TCP listen port (default 7654)
   */
  constructor(options = {}) {
    this.port = options.port || 7654;
    this.server = null;
    this.workers = new Map(); // id → { socket, ready }
    this.nextId = 1;
    this._resultResolvers = new Map(); // id → resolve fn
  }

  /**
   * Start the TCP server and listen for worker connections.
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.registerWorker(socket);
      });

      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  /**
   * Track a newly connected worker socket.
   */
  registerWorker(socket) {
    const id = this.nextId++;
    this.workers.set(id, { socket, ready: true });

    createMessageParser(socket, (msg) => {
      this._handleWorkerMessage(id, msg);
    });

    socket.on('close', () => {
      this.workers.delete(id);
    });

    socket.on('error', () => {
      this.workers.delete(id);
    });

    // Notify the worker of its assigned ID
    sendMessage(socket, { type: 'registered', workerId: id });
  }

  /**
   * Distribute work across all connected workers.
   *
   * The test configuration is split so each worker runs for the full
   * duration but with concurrency divided evenly.
   *
   * @param {object} config - full test configuration
   * @returns {Promise<object[]>} array of result objects from each worker
   */
  async distributeWork(config) {
    const workerEntries = [...this.workers.entries()];
    if (workerEntries.length === 0) {
      throw new Error('No workers connected');
    }

    const perWorkerConcurrency = Math.max(
      1,
      Math.floor((config.concurrency || 1) / workerEntries.length),
    );

    const promises = workerEntries.map(([id, { socket }]) => {
      const workerConfig = {
        ...config,
        concurrency: perWorkerConcurrency,
      };

      sendMessage(socket, { type: 'work', config: workerConfig });

      return new Promise((resolve) => {
        this._resultResolvers.set(id, resolve);
      });
    });

    return Promise.all(promises);
  }

  /**
   * Aggregate results from all workers into a single summary.
   * @param {object[]} results - array of per-worker summaries
   * @returns {object} combined summary
   */
  async collectResults(results) {
    const combined = {
      totalRequests: 0,
      requestsPerSec: 0,
      avgResponseTime: 0,
      errorRate: 0,
      successRate: 0,
      result: 'PASSED',
      perEndpoint: {},
    };

    let totalResponseTimeWeighted = 0;

    for (const r of results) {
      combined.totalRequests += r.totalRequests || 0;
      combined.requestsPerSec += r.requestsPerSec || 0;
      totalResponseTimeWeighted += (r.avgResponseTime || 0) * (r.totalRequests || 0);
      if (r.perEndpoint) {
        mergeEndpointSummaries(combined.perEndpoint, r.perEndpoint);
      }
    }

    if (combined.totalRequests > 0) {
      combined.avgResponseTime = Math.round(
        totalResponseTimeWeighted / combined.totalRequests,
      );

      let totalErrors = 0;
      for (const r of results) {
        totalErrors +=
          ((r.errorRate || 0) / 100) * (r.totalRequests || 0);
      }
      combined.errorRate = parseFloat(
        ((totalErrors / combined.totalRequests) * 100).toFixed(1),
      );
      combined.successRate = parseFloat(
        (100 - combined.errorRate).toFixed(1),
      );

      if (combined.errorRate >= 5) {
        combined.result = 'FAILED';
      }
    }

    return combined;
  }

  /**
   * Handle an incoming message from a worker.
   */
  _handleWorkerMessage(id, msg) {
    if (msg.type === 'result') {
      const resolve = this._resultResolvers.get(id);
      if (resolve) {
        this._resultResolvers.delete(id);
        resolve(msg.summary);
      }
    }
  }

  /**
   * Gracefully shut down the server and all connections.
   */
  async stop() {
    // Notify workers to disconnect
    for (const [, { socket }] of this.workers) {
      sendMessage(socket, { type: 'stop' });
      socket.end();
    }
    this.workers.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// ═════════════════════════════════════════════════════════════════════
//  WorkerNode
// ═════════════════════════════════════════════════════════════════════

export class WorkerNode {
  /**
   * @param {object} [options]
   * @param {string} [options.masterHost] - master hostname (default 127.0.0.1)
   * @param {number} [options.masterPort] - master port (default 7654)
   */
  constructor(options = {}) {
    this.masterHost = options.masterHost || '127.0.0.1';
    this.masterPort = options.masterPort || 7654;
    this.socket = null;
    this.workerId = null;
  }

  /**
   * Connect to the master node via TCP.
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(
        { host: this.masterHost, port: this.masterPort },
        () => {
          // Set up message parsing
          createMessageParser(this.socket, (msg) => {
            this._handleMessage(msg);
          });
          resolve();
        },
      );

      this.socket.on('error', reject);
    });
  }

  /**
   * Handle messages from the master.
   */
  async _handleMessage(msg) {
    if (msg.type === 'registered') {
      this.workerId = msg.workerId;
    }

    if (msg.type === 'work') {
      const summary = await this.runWork(msg.config);
      await this.reportResults(summary);
    }

    if (msg.type === 'stop') {
      await this.disconnect();
    }
  }

  /**
   * Execute a local stress test with the received configuration.
   * @param {object} config - test config from master
   * @returns {Promise<object>} summary
   */
  async runWork(config) {
    return runStressTest(config);
  }

  /**
   * Send results back to the master.
   * @param {object} results - summary object
   */
  async reportResults(results) {
    if (this.socket && !this.socket.destroyed) {
      sendMessage(this.socket, { type: 'result', summary: results });
    }
  }

  /**
   * Close the TCP connection.
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.end(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

function mergeEndpointSummaries(target, source) {
  for (const [endpoint, metrics] of Object.entries(source)) {
    if (!target[endpoint]) {
      target[endpoint] = {
        totalRequests: 0,
        requestsPerSec: 0,
        avgResponseTime: 0,
        errorRate: 0,
        successRate: 0,
        p95: 0,
        p99: 0,
        minLatency: metrics.minLatency ?? 0,
        maxLatency: metrics.maxLatency ?? 0,
      };
    }

    const current = target[endpoint];
    const totalBefore = current.totalRequests;
    const totalAfter = totalBefore + (metrics.totalRequests || 0);

    current.totalRequests = totalAfter;
    current.requestsPerSec += metrics.requestsPerSec || 0;
    current.avgResponseTime =
      totalAfter > 0
        ? Math.round(
          ((current.avgResponseTime || 0) * totalBefore +
            (metrics.avgResponseTime || 0) * (metrics.totalRequests || 0)) / totalAfter,
        )
        : 0;
    current.errorRate =
      totalAfter > 0
        ? parseFloat(
          (
            (((current.errorRate || 0) / 100) * totalBefore +
              ((metrics.errorRate || 0) / 100) * (metrics.totalRequests || 0)) /
              totalAfter *
              100
          ).toFixed(1),
        )
        : 0;
    current.successRate = parseFloat((100 - current.errorRate).toFixed(1));
    current.p95 = Math.max(current.p95 || 0, metrics.p95 || 0);
    current.p99 = Math.max(current.p99 || 0, metrics.p99 || 0);
    current.minLatency = Math.min(current.minLatency ?? Infinity, metrics.minLatency ?? Infinity);
    current.maxLatency = Math.max(current.maxLatency ?? 0, metrics.maxLatency ?? 0);
  }
}
