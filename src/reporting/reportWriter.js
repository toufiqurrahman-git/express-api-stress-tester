/**
 * Multi-format report writer (v2).
 * Backward-compatible v1 exports + new ReportWriter class.
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { generateHtmlReport } from './htmlReport.js';

const REPORT_FILE = 'stress-test-report.txt';

export function log(message) {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${message}\n`);
}

export function writeReport(config, summary, reportPath) {
  const filePath = reportPath || REPORT_FILE;
  const report = buildTxtReport(config, summary);
  try {
    appendFileSync(filePath, report + '\n');
  } catch (err) {
    process.stderr.write(`Failed to write report: ${err.message}\n`);
  }
  process.stdout.write(report + '\n');
  return report;
}

function buildTxtReport(config, summary) {
  const divider = '='.repeat(50);
  const lines = [
    divider,
    `  API Stress Test Report`,
    divider,
    `API URL:            ${config.url}`,
    `Method:             ${(config.method || 'GET').toUpperCase()}`,
    `Concurrent Users:   ${config.concurrency || 1}`,
    `Duration (s):       ${summary.elapsedSeconds}`,
    `Total Requests:     ${summary.totalRequests}`,
    `Requests/sec:       ${summary.requestsPerSec}`,
    `Avg Response Time:  ${summary.avgResponseTime}ms`,
    ...(summary.p95 !== undefined ? [`P95 Latency:        ${summary.p95}ms`] : []),
    ...(summary.p99 !== undefined ? [`P99 Latency:        ${summary.p99}ms`] : []),
    ...(summary.minLatency !== undefined ? [`Min Latency:        ${summary.minLatency}ms`] : []),
    ...(summary.maxLatency !== undefined ? [`Max Latency:        ${summary.maxLatency}ms`] : []),
    `Error Rate:         ${summary.errorRate}%`,
    `Success Rate:       ${summary.successRate}%`,
    `CPU Usage:          ${summary.cpuPercent}%`,
    `Memory Usage:       ${summary.memoryMB}MB`,
    `Result:             ${summary.result}`,
    divider,
    ...(buildEndpointLines(summary.perEndpoint) || []),
    '',
  ];
  return lines.join('\n');
}

function buildEndpointLines(perEndpoint) {
  if (!perEndpoint || Object.keys(perEndpoint).length === 0) {
    return [];
  }

  const lines = [];
  lines.push('Per-Endpoint Metrics:');

  const entries = Object.entries(perEndpoint).sort(
    (a, b) => (b[1].requestsPerSec || 0) - (a[1].requestsPerSec || 0),
  );
  const maxEndpointLength = Math.min(
    50,
    Math.max(8, ...entries.map(([endpoint]) => endpoint.length)),
  );
  lines.push(
    `${'Endpoint'.padEnd(maxEndpointLength)}  RPS   Avg(ms)   P95(ms)   Errors(%)`,
  );
  lines.push('-'.repeat(maxEndpointLength + 38));
  for (const [endpoint, metrics] of entries) {
    const displayEndpoint =
      endpoint.length > maxEndpointLength
        ? `${endpoint.slice(0, maxEndpointLength - 3)}...`
        : endpoint;
    const rps = String(metrics.requestsPerSec ?? 0).padStart(5);
    const avg = String(metrics.avgResponseTime ?? 0).padStart(7);
    const p95 = String(metrics.p95 ?? 0).padStart(7);
    const errValue =
      typeof metrics.errorRate === 'string'
        ? parseFloat(metrics.errorRate)
        : (metrics.errorRate ?? 0);
    const err = `${errValue.toFixed(1)}%`.padStart(8);
    lines.push(
      `${displayEndpoint.padEnd(maxEndpointLength)} ${rps} ${avg} ${p95} ${err}`,
    );
  }
  lines.push('');
  return lines;
}

export class ReportWriter {
  constructor(config, summary) {
    this.config = config;
    this.summary = summary;
  }

  writeTxt(filePath) {
    const report = buildTxtReport(this.config, this.summary);
    try {
      writeFileSync(filePath, report);
    } catch (err) {
      process.stderr.write(`Failed to write TXT report: ${err.message}\n`);
    }
    return report;
  }

  writeJson(filePath) {
    const report = JSON.stringify({ config: this.config, summary: this.summary }, null, 2);
    try {
      writeFileSync(filePath, report);
    } catch (err) {
      process.stderr.write(`Failed to write JSON report: ${err.message}\n`);
    }
    return report;
  }

  writeHtml(filePath) {
    const html = generateHtmlReport(this.config, this.summary);
    try {
      writeFileSync(filePath, html);
    } catch (err) {
      process.stderr.write(`Failed to write HTML report: ${err.message}\n`);
    }
    return html;
  }

  write(filePath, format) {
    switch (format) {
      case 'json':
        return this.writeJson(filePath);
      case 'html':
        return this.writeHtml(filePath);
      case 'txt':
      default:
        return this.writeTxt(filePath);
    }
  }
}
