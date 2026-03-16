/**
 * Tests for SystemMetrics (CPU, memory, network monitoring).
 */
import { SystemMetrics } from '../src/metrics/systemMetrics.js';

describe('SystemMetrics', () => {
  test('snapshot() returns all expected properties', () => {
    const sm = new SystemMetrics();
    const snap = sm.snapshot();

    expect(snap).toHaveProperty('cpuPercent');
    expect(snap).toHaveProperty('memoryMB');
    expect(snap).toHaveProperty('heapUsedMB');
    expect(snap).toHaveProperty('heapTotalMB');
    expect(snap).toHaveProperty('rssMB');
    expect(snap).toHaveProperty('networkRx');
    expect(snap).toHaveProperty('networkTx');

    expect(typeof snap.cpuPercent).toBe('number');
    expect(typeof snap.memoryMB).toBe('number');
    expect(snap.memoryMB).toBeGreaterThan(0);
    expect(snap.heapUsedMB).toBeGreaterThan(0);
    expect(snap.rssMB).toBeGreaterThan(0);
  });

  test('snapshot() network values are non-negative', () => {
    const sm = new SystemMetrics();
    sm.snapshot(); // prime baselines
    const snap = sm.snapshot();
    expect(snap.networkRx).toBeGreaterThanOrEqual(0);
    expect(snap.networkTx).toBeGreaterThanOrEqual(0);
  });

  test('startMonitoring/stopMonitoring lifecycle', async () => {
    const sm = new SystemMetrics();
    sm.startMonitoring(50); // 50ms interval for fast test

    // Wait for a few snapshots
    await new Promise((resolve) => setTimeout(resolve, 200));

    sm.stopMonitoring();
    const history = sm.getHistory();
    expect(history.length).toBeGreaterThan(0);

    // Each entry should have timestamp
    for (const entry of history) {
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('cpuPercent');
      expect(entry).toHaveProperty('memoryMB');
    }
  });

  test('stopMonitoring() is safe to call multiple times', () => {
    const sm = new SystemMetrics();
    expect(() => {
      sm.stopMonitoring();
      sm.stopMonitoring();
    }).not.toThrow();
  });

  test('getHistory() returns array of snapshots', () => {
    const sm = new SystemMetrics();
    expect(sm.getHistory()).toEqual([]);
  });

  test('getHistory() returns a copy (not reference)', async () => {
    const sm = new SystemMetrics();
    sm.startMonitoring(50);
    await new Promise((resolve) => setTimeout(resolve, 150));
    sm.stopMonitoring();

    const h1 = sm.getHistory();
    const h2 = sm.getHistory();
    expect(h1).toEqual(h2);
    expect(h1).not.toBe(h2); // different array reference
  });

  test('startMonitoring() resets any previous interval', async () => {
    const sm = new SystemMetrics();
    sm.startMonitoring(50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Calling start again should clear previous interval
    sm.startMonitoring(50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    sm.stopMonitoring();
    // Should not throw or cause double intervals
    expect(sm.getHistory().length).toBeGreaterThan(0);
  });
});
