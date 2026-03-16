/**
 * Tests for metrics collection, report generation, and runner validation.
 */
import { MetricsCollector } from '../src/metrics.js';
import { writeReport } from '../src/logger.js';
import { unlinkSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── MetricsCollector ──────────────────────────────────────────────────────

describe('MetricsCollector', () => {
  test('starts with zeroed counters', () => {
    const m = new MetricsCollector();
    expect(m.totalRequests).toBe(0);
    expect(m.successCount).toBe(0);
    expect(m.errorCount).toBe(0);
  });

  test('record() increments counters correctly', () => {
    const m = new MetricsCollector();
    m.record(100, false);
    m.record(200, true);
    m.record(50, false);

    expect(m.totalRequests).toBe(3);
    expect(m.successCount).toBe(2);
    expect(m.errorCount).toBe(1);
    expect(m.totalResponseTime).toBe(350);
  });

  test('merge() combines partial metrics', () => {
    const m = new MetricsCollector();
    m.merge({ totalRequests: 10, successCount: 8, errorCount: 2, totalResponseTime: 500 });
    m.merge({ totalRequests: 5, successCount: 5, errorCount: 0, totalResponseTime: 250 });

    expect(m.totalRequests).toBe(15);
    expect(m.successCount).toBe(13);
    expect(m.errorCount).toBe(2);
    expect(m.totalResponseTime).toBe(750);
  });

  test('getSummary() computes correct rates', () => {
    const m = new MetricsCollector();
    m.start();
    m.record(100, false);
    m.record(200, false);
    m.record(300, true);
    // Simulate small elapsed time
    m.endTime = m.startTime + 1000; // 1 second

    const summary = m.getSummary();
    expect(summary.totalRequests).toBe(3);
    expect(summary.requestsPerSec).toBe(3);
    expect(summary.avgResponseTime).toBe(200); // (100+200+300)/3
    expect(summary.errorRate).toBeCloseTo(33.3, 0);
    expect(summary.successRate).toBeCloseTo(66.7, 0);
    expect(summary.result).toBe('FAILED'); // error rate > 5%
  });

  test('getSummary() returns PASSED when error rate < 5%', () => {
    const m = new MetricsCollector();
    m.start();
    for (let i = 0; i < 100; i++) m.record(50, false);
    m.record(50, true); // 1 out of 101 ≈ 0.99%
    m.endTime = m.startTime + 1000;

    const summary = m.getSummary();
    expect(summary.result).toBe('PASSED');
  });

  test('getResourceUsage() returns cpu and memory', () => {
    const usage = MetricsCollector.getResourceUsage();
    expect(usage).toHaveProperty('cpuPercent');
    expect(usage).toHaveProperty('memoryMB');
    expect(parseFloat(usage.memoryMB)).toBeGreaterThan(0);
  });
});

// ─── Report Generation ─────────────────────────────────────────────────────

describe('writeReport', () => {
  const testReportPath = join(process.cwd(), 'test-report-output.txt');

  afterEach(() => {
    try { unlinkSync(testReportPath); } catch { /* ignore */ }
  });

  test('writes report file with correct content', () => {
    const config = {
      url: 'https://api.example.com/test',
      method: 'POST',
      concurrency: 100,
    };
    const summary = {
      totalRequests: 500,
      requestsPerSec: 50,
      avgResponseTime: 120,
      errorRate: 2.0,
      successRate: 98.0,
      cpuPercent: '30.5',
      memoryMB: '128.0',
      result: 'PASSED',
      elapsedSeconds: '10.0',
    };

    writeReport(config, summary, testReportPath);

    expect(existsSync(testReportPath)).toBe(true);
    const content = readFileSync(testReportPath, 'utf-8');
    expect(content).toContain('https://api.example.com/test');
    expect(content).toContain('POST');
    expect(content).toContain('PASSED');
    expect(content).toContain('500');
    expect(content).toContain('120ms');
  });

  test('appends to existing report file', () => {
    const config = { url: 'https://a.com', method: 'GET', concurrency: 1 };
    const summary = {
      totalRequests: 10,
      requestsPerSec: 10,
      avgResponseTime: 5,
      errorRate: 0,
      successRate: 100,
      cpuPercent: '10',
      memoryMB: '50',
      result: 'PASSED',
      elapsedSeconds: '1.0',
    };

    writeReport(config, summary, testReportPath);
    writeReport(config, summary, testReportPath);

    const content = readFileSync(testReportPath, 'utf-8');
    // Should appear twice
    const matches = content.match(/https:\/\/a\.com/g);
    expect(matches).toHaveLength(2);
  });
});

// ─── Runner config validation ──────────────────────────────────────────────

describe('runner validation', () => {
  test('runStressTest rejects missing url', async () => {
    // Dynamic import to avoid issues with worker thread paths in test
    const { runStressTest } = await import('../src/runner.js');
    await expect(runStressTest({})).rejects.toThrow('config.url is required');
    await expect(runStressTest(null)).rejects.toThrow('config.url is required');
  });
});
