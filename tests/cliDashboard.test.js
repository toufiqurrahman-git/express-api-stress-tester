/**
 * Tests for CliDashboard (real-time metrics display).
 */
import { CliDashboard } from '../src/dashboard/cliDashboard.js';

describe('CliDashboard', () => {
  test('constructor initialises with default metrics', () => {
    const dash = new CliDashboard();
    expect(dash.metrics.activeUsers).toBe(0);
    expect(dash.metrics.requestsPerSec).toBe(0);
    expect(dash.metrics.avgLatency).toBe(0);
    expect(dash.metrics.errorRate).toBe(0);
    expect(dash.metrics.totalRequests).toBe(0);
    expect(dash.metrics.p95).toBe(0);
    expect(dash.metrics.p99).toBe(0);
    expect(dash.metrics.perEndpoint).toEqual({});
    expect(dash.rpsHistory).toEqual([]);
  });

  test('update() stores metrics', () => {
    const dash = new CliDashboard();
    dash.update({
      activeUsers: 50,
      requestsPerSec: 200,
      avgLatency: 42,
      errorRate: 1.2,
      totalRequests: 5000,
    });

    expect(dash.metrics.activeUsers).toBe(50);
    expect(dash.metrics.requestsPerSec).toBe(200);
    expect(dash.metrics.avgLatency).toBe(42);
    expect(dash.metrics.errorRate).toBe(1.2);
    expect(dash.metrics.totalRequests).toBe(5000);
  });

  test('update() merges partial metrics without losing others', () => {
    const dash = new CliDashboard();
    dash.update({ activeUsers: 10, requestsPerSec: 100 });
    dash.update({ errorRate: 2.5 });

    expect(dash.metrics.activeUsers).toBe(10);
    expect(dash.metrics.requestsPerSec).toBe(100);
    expect(dash.metrics.errorRate).toBe(2.5);
  });

  test('update() maintains rpsHistory', () => {
    const dash = new CliDashboard();
    dash.update({ requestsPerSec: 100 });
    dash.update({ requestsPerSec: 200 });
    dash.update({ requestsPerSec: 150 });

    expect(dash.rpsHistory).toEqual([100, 200, 150]);
  });

  test('update() caps rpsHistory at MAX_HISTORY (60)', () => {
    const dash = new CliDashboard();
    for (let i = 0; i < 70; i++) {
      dash.update({ requestsPerSec: i });
    }
    expect(dash.rpsHistory).toHaveLength(60);
    // Should have shifted older entries — last entry is 69
    expect(dash.rpsHistory[dash.rpsHistory.length - 1]).toBe(69);
    // First entry should be 10 (entries 0-9 were shifted out)
    expect(dash.rpsHistory[0]).toBe(10);
  });

  test('update() pushes 0 when requestsPerSec is not set', () => {
    const dash = new CliDashboard();
    dash.update({ activeUsers: 5 });
    expect(dash.rpsHistory).toEqual([0]);
  });

  test('start/stop lifecycle does not throw', () => {
    const dash = new CliDashboard();
    // Suppress stdout to avoid cluttering test output
    const origWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      dash.start();
      expect(dash.startTime).not.toBeNull();
      expect(dash.intervalId).not.toBeNull();
      dash.stop();
      expect(dash.intervalId).toBeNull();
    } finally {
      process.stdout.write = origWrite;
    }
  });
});
