/**
 * Tests for the ReportWriter (multi-format report generation).
 */
import { ReportWriter, writeReport, log } from '../src/reporting/reportWriter.js';
import { readFileSync, unlinkSync, existsSync, mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sampleConfig = {
  url: 'http://localhost:3000/api/test',
  method: 'POST',
  concurrency: 50,
  duration: 10,
};

const sampleSummary = {
  totalRequests: 1000,
  requestsPerSec: 100,
  avgResponseTime: 85,
  p95: 150,
  p99: 250,
  minLatency: 10,
  maxLatency: 500,
  errorRate: 1.5,
  successRate: 98.5,
  cpuPercent: '45.2',
  memoryMB: '256.0',
  result: 'PASSED',
  elapsedSeconds: '10.0',
  perEndpoint: {
    'GET /users': {
      totalRequests: 500,
      requestsPerSec: 50,
      avgResponseTime: 40,
      p95: 80,
      p99: 120,
      minLatency: 10,
      maxLatency: 200,
      errorRate: 1.0,
      successRate: 99.0,
    },
  },
};

let tempDir;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'report-test-'));
});

afterAll(() => {
  try {
    for (const f of readdirSync(tempDir)) {
      try { unlinkSync(join(tempDir, f)); } catch { /* ignore */ }
    }
    rmdirSync(tempDir);
  } catch { /* ignore */ }
});

describe('ReportWriter', () => {
  test('writeTxt() creates correct format', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'report.txt');
    const report = rw.writeTxt(filePath);

    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('API Stress Test Report');
    expect(content).toContain('http://localhost:3000/api/test');
    expect(content).toContain('POST');
    expect(content).toContain('1000');
    expect(content).toContain('85ms');
    expect(content).toContain('PASSED');
    expect(content).toContain('P95 Latency');
    expect(content).toContain('P99 Latency');
    expect(content).toContain('Min Latency');
    expect(content).toContain('Max Latency');
    expect(content).toContain('Per-Endpoint Metrics');
    expect(content).toContain('GET /users');
    expect(report).toBe(content);
  });

  test('writeJson() creates valid JSON', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'report.json');
    const report = rw.writeJson(filePath);

    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.config).toEqual(sampleConfig);
    expect(parsed.summary).toEqual(sampleSummary);
    expect(report).toBe(content);
  });

  test('writeHtml() creates HTML with metrics', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'report.html');
    const html = rw.writeHtml(filePath);

    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('API Stress Test Report');
    expect(content).toContain('PASSED');
    expect(content).toContain('1000');
    expect(content).toContain('http://localhost:3000/api/test');
    expect(content).toContain('Per-Endpoint Metrics');
    expect(html).toBe(content);
  });

  test('write() dispatches to txt writer by default', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'dispatch-default.txt');
    const report = rw.write(filePath);

    expect(existsSync(filePath)).toBe(true);
    expect(report).toContain('API Stress Test Report');
  });

  test('write() dispatches to json writer', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'dispatch.json');
    const report = rw.write(filePath, 'json');

    expect(existsSync(filePath)).toBe(true);
    expect(JSON.parse(report)).toHaveProperty('config');
  });

  test('write() dispatches to html writer', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'dispatch.html');
    const report = rw.write(filePath, 'html');

    expect(existsSync(filePath)).toBe(true);
    expect(report).toContain('<!DOCTYPE html>');
  });

  test('write() dispatches to txt for explicit txt format', () => {
    const rw = new ReportWriter(sampleConfig, sampleSummary);
    const filePath = join(tempDir, 'dispatch-txt.txt');
    const report = rw.write(filePath, 'txt');

    expect(report).toContain('API Stress Test Report');
  });
});

describe('backward compat: writeReport() and log()', () => {
  test('writeReport() creates a report file', () => {
    const filePath = join(tempDir, 'compat-report.txt');
    const report = writeReport(sampleConfig, sampleSummary, filePath);

    expect(existsSync(filePath)).toBe(true);
    expect(report).toContain('API Stress Test Report');
    expect(report).toContain('PASSED');
  });

  test('log() writes to stdout without throwing', () => {
    // Just verify it doesn't throw
    expect(() => log('test message')).not.toThrow();
  });

  test('writeReport() and log() are functions', () => {
    expect(typeof writeReport).toBe('function');
    expect(typeof log).toBe('function');
  });
});
