#!/usr/bin/env node

/**
 * CLI entry point for express-api-stress-tester v2.
 *
 * Usage:
 *   express-api-stress-tester run <config.json> [--dashboard] [--format json] [--output report.json]
 *   express-api-stress-tester <config.json>   (backward-compatible)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import chalk from 'chalk';
import { runStressTest } from './core/runner.js';
import { MasterNode, WorkerNode } from './core/distributedCoordinator.js';
import { ReportWriter } from './reporting/reportWriter.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function loadConfig(configPath) {
  const fullPath = resolve(configPath);
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(chalk.red(`Error reading config file: ${err.message}`));
    process.exit(1);
  }
}

function printSummary(summary) {
  console.log('');
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold('  Stress Test Results'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(`  Total Requests:  ${chalk.bold(summary.totalRequests)}`);
  console.log(`  Requests/sec:    ${chalk.bold(summary.requestsPerSec)}`);
  console.log(`  Avg Latency:     ${chalk.bold(`${summary.avgResponseTime}ms`)}`);
  if (summary.p95 !== undefined) console.log(`  P95 Latency:     ${chalk.bold(`${summary.p95}ms`)}`);
  if (summary.p99 !== undefined) console.log(`  P99 Latency:     ${chalk.bold(`${summary.p99}ms`)}`);
  console.log(`  Error Rate:      ${chalk.bold(`${summary.errorRate}%`)}`);
  console.log(`  CPU Usage:       ${chalk.bold(`${summary.cpuPercent}%`)}`);
  console.log(`  Memory Usage:    ${chalk.bold(`${summary.memoryMB}MB`)}`);
  const resultColor = summary.result === 'PASSED' ? chalk.green.bold : chalk.red.bold;
  console.log(`  Result:          ${resultColor(summary.result)}`);
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log('');
}

async function runCommand(configPath, opts) {
  const config = loadConfig(configPath);

  try {
    const summary = await runStressTest(config, {
      reportPath: opts.output || 'stress-test-report.txt',
      reportFormat: opts.format || 'txt',
      dashboard: opts.dashboard,
    });

    printSummary(summary);
    process.exit(summary.result === 'PASSED' ? 0 : 1);
  } catch (err) {
    console.error(chalk.red(`Stress test failed: ${err.message}`));
    process.exit(1);
  }
}

async function masterCommand(configPath, opts) {
  const config = loadConfig(configPath);
  const master = new MasterNode({ port: Number(opts.port) || 7654 });
  await master.start();
  console.log(chalk.green(`Master listening on port ${master.port}`));

  const expected = Number(opts.workers || config.distributed?.workers || 0);
  if (expected > 0) {
    await waitForWorkers(master, expected, opts.timeout ? Number(opts.timeout) * 1000 : 60_000);
  }

  const results = await master.distributeWork(config);
  const summary = await master.collectResults(results);
  summary.result = applyThresholds(summary, config.thresholds);

  const reportPath = opts.output || 'stress-test-report.txt';
  const reportFormat = opts.format || 'txt';
  const writer = new ReportWriter(config, summary);
  writer.write(reportPath, reportFormat);

  printSummary(summary);
  await master.stop();
  process.exit(summary.result === 'PASSED' ? 0 : 1);
}

async function workerCommand(opts) {
  const worker = new WorkerNode({
    masterHost: opts.host || '127.0.0.1',
    masterPort: Number(opts.port) || 7654,
  });
  await worker.connect();
  console.log(chalk.green(`Worker connected to ${worker.masterHost}:${worker.masterPort}`));
  await new Promise((resolve) => {
    if (worker.socket) {
      worker.socket.on('close', resolve);
    } else {
      resolve();
    }
  });
  process.exit(0);
}

async function waitForWorkers(master, count, timeoutMs) {
  const start = Date.now();
  while (master.workers.size < count) {
    if (timeoutMs && Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${count} workers to connect`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function applyThresholds(summary, thresholds) {
  if (!thresholds) {
    return summary.errorRate < 5 ? 'PASSED' : 'FAILED';
  }

  if (
    thresholds.maxErrorRate != null &&
    summary.errorRate > thresholds.maxErrorRate
  ) {
    return 'FAILED';
  }

  if (
    thresholds.maxAvgLatency != null &&
    summary.avgResponseTime > thresholds.maxAvgLatency
  ) {
    return 'FAILED';
  }

  if (
    thresholds.minRPS != null &&
    summary.requestsPerSec < thresholds.minRPS
  ) {
    return 'FAILED';
  }

  return 'PASSED';
}

async function main() {
  const program = new Command();

  program
    .name('express-api-stress-tester')
    .description('High-performance API stress testing tool')
    .version(pkg.version);

  program
    .command('run <config>')
    .description('Run a stress test from a JSON config file')
    .option('--dashboard', 'Enable live CLI dashboard')
    .option('--format <format>', 'Report format: txt, json, html', 'txt')
    .option('--output <path>', 'Report output file path')
    .action(runCommand);

  program
    .command('master <config>')
    .description('Run a distributed master and coordinate connected workers')
    .option('--port <port>', 'Master listen port', '7654')
    .option('--workers <count>', 'Number of workers to wait for')
    .option('--timeout <seconds>', 'Wait timeout for workers', '60')
    .option('--format <format>', 'Report format: txt, json, html', 'txt')
    .option('--output <path>', 'Report output file path')
    .action(masterCommand);

  program
    .command('worker')
    .description('Start a worker node and connect to a master')
    .option('--host <host>', 'Master host', '127.0.0.1')
    .option('--port <port>', 'Master port', '7654')
    .action(workerCommand);

  // Backward compatibility: if first arg is not a known command, treat as config path
  const args = process.argv.slice(2);
  const knownCommands = [
    'run',
    'master',
    'worker',
    'help',
    '--help',
    '-h',
    '--version',
    '-V',
  ];
  if (args.length > 0 && !knownCommands.includes(args[0])) {
    // Rewrite argv to include 'run' subcommand
    const configArg = args[0];
    const restArgs = args.slice(1);
    process.argv = [...process.argv.slice(0, 2), 'run', configArg, ...restArgs];
  }

  await program.parseAsync(process.argv);
}

main();
