/**
 * Tests for the enhanced MetricsCollector v2 (percentiles, reservoir, thresholds).
 */
import { MetricsCollector } from '../src/metrics/metricsCollector.js';

describe('MetricsCollector (v2)', () => {
  test('constructor starts with zeroed counters', () => {
    const m = new MetricsCollector();
    expect(m.totalRequests).toBe(0);
    expect(m.successCount).toBe(0);
    expect(m.errorCount).toBe(0);
    expect(m.totalResponseTime).toBe(0);
    expect(m.minLatency).toBe(Infinity);
    expect(m.maxLatency).toBe(-Infinity);
    expect(m.responseTimes).toEqual([]);
  });

  test('record() tracks min/max latency', () => {
    const m = new MetricsCollector();
    m.record(200, false);
    m.record(50, false);
    m.record(500, false);

    expect(m.minLatency).toBe(50);
    expect(m.maxLatency).toBe(500);
  });

  test('record() adds to reservoir', () => {
    const m = new MetricsCollector();
    m.record(10, false);
    m.record(20, false);
    m.record(30, true);

    expect(m.responseTimes).toHaveLength(3);
    expect(m.responseTimes).toContain(10);
    expect(m.responseTimes).toContain(20);
    expect(m.responseTimes).toContain(30);
  });

  test('record() correctly tracks success vs error', () => {
    const m = new MetricsCollector();
    m.record(100, false);
    m.record(200, true);
    m.record(50, false);

    expect(m.totalRequests).toBe(3);
    expect(m.successCount).toBe(2);
    expect(m.errorCount).toBe(1);
    expect(m.totalResponseTime).toBe(350);
  });

  test('merge() combines partial metrics including responseTimes', () => {
    const m = new MetricsCollector();
    m.record(10, false);

    m.merge({
      totalRequests: 5,
      successCount: 4,
      errorCount: 1,
      totalResponseTime: 500,
      minLatency: 5,
      maxLatency: 300,
      responseTimes: [5, 100, 200, 250, 300],
    });

    expect(m.totalRequests).toBe(6);
    expect(m.successCount).toBe(5);
    expect(m.errorCount).toBe(1);
    expect(m.totalResponseTime).toBe(510);
    expect(m.minLatency).toBe(5);
    expect(m.maxLatency).toBe(300);
    // Original 1 + merged 5
    expect(m.responseTimes).toHaveLength(6);
  });

  test('merge() aggregates per-endpoint metrics', () => {
    const m = new MetricsCollector();
    m.start();
    m.merge({
      totalRequests: 2,
      successCount: 2,
      errorCount: 0,
      totalResponseTime: 200,
      perEndpoint: {
        'GET /users': {
          totalRequests: 2,
          successCount: 2,
          errorCount: 0,
          totalResponseTime: 200,
          minLatency: 90,
          maxLatency: 110,
          responseTimes: [90, 110],
        },
      },
    });
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary.perEndpoint).toHaveProperty('GET /users');
    expect(summary.perEndpoint['GET /users'].totalRequests).toBe(2);
  });

  test('merge() updates min/max when partial has better values', () => {
    const m = new MetricsCollector();
    m.record(50, false); // min=50, max=50

    m.merge({ totalRequests: 1, successCount: 1, errorCount: 0, totalResponseTime: 10, minLatency: 10 });
    expect(m.minLatency).toBe(10);

    m.merge({ totalRequests: 1, successCount: 1, errorCount: 0, totalResponseTime: 999, maxLatency: 999 });
    expect(m.maxLatency).toBe(999);
  });

  test('getSummary() computes correct percentiles (p95, p99)', () => {
    const m = new MetricsCollector();
    m.start();
    // Add 100 records: 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      m.record(i, false);
    }
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary.p95).toBe(95);
    expect(summary.p99).toBe(99);
    expect(summary.minLatency).toBe(1);
    expect(summary.maxLatency).toBe(100);
  });

  test('getSummary() computes correct avgResponseTime', () => {
    const m = new MetricsCollector();
    m.start();
    m.record(100, false);
    m.record(200, false);
    m.record(300, false);
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary.avgResponseTime).toBe(200);
  });

  test('getSummary() respects thresholds — PASSED when within limits', () => {
    const m = new MetricsCollector();
    m.start();
    for (let i = 0; i < 100; i++) m.record(50, false);
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary({
      maxErrorRate: 5,
      maxAvgLatency: 200,
      minRPS: 10,
    });
    expect(summary.result).toBe('PASSED');
  });

  test('getSummary() FAILED when error rate exceeds maxErrorRate', () => {
    const m = new MetricsCollector();
    m.start();
    for (let i = 0; i < 90; i++) m.record(50, false);
    for (let i = 0; i < 10; i++) m.record(50, true); // 10% error rate
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary({ maxErrorRate: 5 });
    expect(summary.result).toBe('FAILED');
  });

  test('getSummary() FAILED when avg latency exceeds maxAvgLatency', () => {
    const m = new MetricsCollector();
    m.start();
    for (let i = 0; i < 10; i++) m.record(500, false);
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary({ maxAvgLatency: 100 });
    expect(summary.result).toBe('FAILED');
  });

  test('getSummary() FAILED when RPS below minRPS', () => {
    const m = new MetricsCollector();
    m.start();
    m.record(50, false);
    m.endTime = m.startTime + 10_000; // 10 seconds → 0.1 RPS

    const summary = m.getSummary({ minRPS: 100 });
    expect(summary.result).toBe('FAILED');
  });

  test('getSummary() returns PASSED/FAILED based on default 5% threshold', () => {
    const m1 = new MetricsCollector();
    m1.start();
    for (let i = 0; i < 100; i++) m1.record(50, false);
    m1.endTime = m1.startTime + 1000;
    expect(m1.getSummary().result).toBe('PASSED');

    const m2 = new MetricsCollector();
    m2.start();
    for (let i = 0; i < 90; i++) m2.record(50, false);
    for (let i = 0; i < 10; i++) m2.record(50, true);
    m2.endTime = m2.startTime + 1000;
    expect(m2.getSummary().result).toBe('FAILED');
  });

  test('getSummary() includes all expected fields', () => {
    const m = new MetricsCollector();
    m.start();
    m.record(100, false);
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary).toHaveProperty('totalRequests');
    expect(summary).toHaveProperty('requestsPerSec');
    expect(summary).toHaveProperty('avgResponseTime');
    expect(summary).toHaveProperty('p95');
    expect(summary).toHaveProperty('p99');
    expect(summary).toHaveProperty('minLatency');
    expect(summary).toHaveProperty('maxLatency');
    expect(summary).toHaveProperty('errorRate');
    expect(summary).toHaveProperty('successRate');
    expect(summary).toHaveProperty('cpuPercent');
    expect(summary).toHaveProperty('memoryMB');
    expect(summary).toHaveProperty('result');
    expect(summary).toHaveProperty('elapsedSeconds');
  });

  test('getResourceUsage() returns cpu and memory', () => {
    const usage = MetricsCollector.getResourceUsage();
    expect(usage).toHaveProperty('cpuPercent');
    expect(usage).toHaveProperty('memoryMB');
    expect(parseFloat(usage.memoryMB)).toBeGreaterThan(0);
  });

  test('backward compatibility: same basic API as v1', () => {
    const m = new MetricsCollector();
    // v1 API: start/stop/record/merge/getSummary
    expect(typeof m.start).toBe('function');
    expect(typeof m.stop).toBe('function');
    expect(typeof m.record).toBe('function');
    expect(typeof m.merge).toBe('function');
    expect(typeof m.getSummary).toBe('function');
  });

  test('getSummary() handles zero requests gracefully', () => {
    const m = new MetricsCollector();
    m.start();
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.avgResponseTime).toBe(0);
    expect(summary.minLatency).toBe(0);
    expect(summary.maxLatency).toBe(0);
    expect(summary.p95).toBe(0);
    expect(summary.p99).toBe(0);
  });
});
