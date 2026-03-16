import { cpus } from 'node:os';

/**
 * Lightweight metrics collector.
 * Stores only aggregate counters to avoid memory bloat at high concurrency.
 */
export class MetricsCollector {
  constructor() {
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0; // sum of ms
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = Date.now();
  }

  stop() {
    this.endTime = Date.now();
  }

  /** Record one completed request */
  record(responseTimeMs, isError) {
    this.totalRequests++;
    this.totalResponseTime += responseTimeMs;
    if (isError) {
      this.errorCount++;
    } else {
      this.successCount++;
    }
  }

  /** Merge counters from a worker thread's partial result */
  merge(partial) {
    this.totalRequests += partial.totalRequests || 0;
    this.successCount += partial.successCount || 0;
    this.errorCount += partial.errorCount || 0;
    this.totalResponseTime += partial.totalResponseTime || 0;
  }

  /** Capture current CPU & memory usage */
  static getResourceUsage() {
    const mem = process.memoryUsage();
    // CPU usage averaged across cores (percentage over a brief sample)
    const cpuArray = cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpuArray) {
      const { user, nice, sys, idle, irq } = cpu.times;
      totalTick += user + nice + sys + idle + irq;
      totalIdle += idle;
    }
    const cpuPercent = ((1 - totalIdle / totalTick) * 100).toFixed(1);
    const memoryMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    return { cpuPercent, memoryMB };
  }

  /** Build the final summary object */
  getSummary() {
    const elapsed = (this.endTime - this.startTime) / 1000 || 1;
    const rps = (this.totalRequests / elapsed).toFixed(0);
    const avgResponse =
      this.totalRequests > 0
        ? (this.totalResponseTime / this.totalRequests).toFixed(0)
        : 0;
    const errorRate =
      this.totalRequests > 0
        ? ((this.errorCount / this.totalRequests) * 100).toFixed(1)
        : '0.0';
    const successRate =
      this.totalRequests > 0
        ? ((this.successCount / this.totalRequests) * 100).toFixed(1)
        : '0.0';

    const { cpuPercent, memoryMB } = MetricsCollector.getResourceUsage();

    const passed = parseFloat(errorRate) < 5;

    return {
      totalRequests: this.totalRequests,
      requestsPerSec: Number(rps),
      avgResponseTime: Number(avgResponse),
      errorRate: parseFloat(errorRate),
      successRate: parseFloat(successRate),
      cpuPercent,
      memoryMB,
      result: passed ? 'PASSED' : 'FAILED',
      elapsedSeconds: elapsed.toFixed(1),
    };
  }
}
