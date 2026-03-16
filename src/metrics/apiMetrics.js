/**
 * Per-endpoint metrics collector with percentile support.
 */
const RESERVOIR_SIZE = 5_000;

export class ApiMetrics {
  constructor() {
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
    this.minLatency = Infinity;
    this.maxLatency = -Infinity;
    this.responseTimes = [];
    this._sampleCount = 0;
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

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getSummary(elapsedSeconds = 1) {
    const elapsed = elapsedSeconds || 1;
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

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const p95 = this._percentile(sorted, 95);
    const p99 = this._percentile(sorted, 99);

    const minLat = this.minLatency === Infinity ? 0 : this.minLatency;
    const maxLat = this.maxLatency === -Infinity ? 0 : this.maxLatency;

    return {
      totalRequests: this.totalRequests,
      requestsPerSec: Number(rps),
      avgResponseTime: Number(avgResponse),
      p95,
      p99,
      minLatency: minLat,
      maxLatency: maxLat,
      errorRate: parseFloat(errorRate),
      successRate: parseFloat(successRate),
    };
  }
}
