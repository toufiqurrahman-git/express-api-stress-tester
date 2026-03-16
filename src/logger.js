import { appendFileSync } from 'node:fs';

const REPORT_FILE = 'stress-test-report.txt';

/**
 * Write a structured log line to stdout.
 */
export function log(message) {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${message}\n`);
}

/**
 * Write the final report to the report file and also to stdout.
 */
export function writeReport(config, summary, reportPath) {
  const filePath = reportPath || REPORT_FILE;
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
    `Error Rate:         ${summary.errorRate}%`,
    `Success Rate:       ${summary.successRate}%`,
    `CPU Usage:          ${summary.cpuPercent}%`,
    `Memory Usage:       ${summary.memoryMB}MB`,
    `Result:             ${summary.result}`,
    divider,
    '',
  ];
  const report = lines.join('\n');

  // Append to file
  try {
    appendFileSync(filePath, report + '\n');
  } catch (err) {
    process.stderr.write(`Failed to write report: ${err.message}\n`);
  }

  // Also print to stdout
  process.stdout.write(report + '\n');

  return report;
}
