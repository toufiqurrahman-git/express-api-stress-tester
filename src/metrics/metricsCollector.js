/**
 * Enhanced metrics collector with percentile support (v2).
 * Backward-compatible with v1 API, adds reservoir sampling for latency percentiles.
 */
import { cpus } from 'node:os';

const RESERVOIR_SIZE = 10_000;

export class MetricsCollector {
  constructor() {
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.minLatency = Infinity;
    this.maxLatency = -Infinity;
    // Reservoir sampling for percentile calculation
    this.responseTimes = [];
    this._sampleCount = 0;
  }

  start() {
    this.startTime = Date.now();
  }

  stop() {
    this.endTime = Date.now();
  }

  record(responseTimeMs, isError) {
    this.totalRequests++;
    this.totalResponseTime += responseTimeMs;

    if (responseTimeMs < this.minLatency) this.minLatency = responseTimeMs;
    if (responseTimeMs > this.maxLatency) this.maxLatency = responseTimeMs;

    if (isError) {
      this.errorCount++;
    } else {
      this.successCount++;
    }

    // Reservoir sampling (Algorithm R)
    this._sampleCount++;
    if (this.responseTimes.length < RESERVOIR_SIZE) {
      this.responseTimes.push(responseTimeMs);
    } else {
      const j = Math.floor(Math.random() * this._sampleCount);
      if (j < RESERVOIR_SIZE) {
        this.responseTimes[j] = responseTimeMs;
      }
    }
  }

  merge(partial) {
    this.totalRequests += partial.totalRequests || 0;
    this.successCount += partial.successCount || 0;
    this.errorCount += partial.errorCount || 0;
    this.totalResponseTime += partial.totalResponseTime || 0;

    if (partial.minLatency !== undefined && partial.minLatency < this.minLatency) {
      this.minLatency = partial.minLatency;
    }
    if (partial.maxLatency !== undefined && partial.maxLatency > this.maxLatency) {
      this.maxLatency = partial.maxLatency;
    }

    if (partial.responseTimes) {
      this.mergeResponseTimes(partial.responseTimes);
    }
  }

  mergeResponseTimes(times) {
    if (!Array.isArray(times) || times.length === 0) return;
    for (const t of times) {
      this._sampleCount++;
      if (this.responseTimes.length < RESERVOIR_SIZE) {
        this.responseTimes.push(t);
      } else {
        const j = Math.floor(Math.random() * this._sampleCount);
        if (j < RESERVOIR_SIZE) {
          this.responseTimes[j] = t;
        }
      }
    }
  }

  static getResourceUsage() {
    const mem = process.memoryUsage();
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

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getSummary(thresholds) {
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

    // Percentile calculations from reservoir
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const p95 = this._percentile(sorted, 95);
    const p99 = this._percentile(sorted, 99);

    const minLat = this.minLatency === Infinity ? 0 : this.minLatency;
    const maxLat = this.maxLatency === -Infinity ? 0 : this.maxLatency;

    // Determine pass/fail
    const errRateNum = parseFloat(errorRate);
    const rpsNum = Number(rps);
    const avgNum = Number(avgResponse);

    let passed;
    if (thresholds) {
      passed = true;
      if (thresholds.maxErrorRate !== undefined && errRateNum > thresholds.maxErrorRate) {
        passed = false;
      }
      if (thresholds.maxAvgLatency !== undefined && avgNum > thresholds.maxAvgLatency) {
        passed = false;
      }
      if (thresholds.minRPS !== undefined && rpsNum < thresholds.minRPS) {
        passed = false;
      }
    } else {
      passed = errRateNum < 5;
    }

    return {
      totalRequests: this.totalRequests,
      requestsPerSec: rpsNum,
      avgResponseTime: avgNum,
      p95,
      p99,
      minLatency: minLat,
      maxLatency: maxLat,
      errorRate: errRateNum,
      successRate: parseFloat(successRate),
      cpuPercent,
      memoryMB,
      result: passed ? 'PASSED' : 'FAILED',
      elapsedSeconds: elapsed.toFixed(1),
    };
  }
}
