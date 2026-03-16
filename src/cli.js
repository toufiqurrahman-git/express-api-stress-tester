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
import { CliDashboard } from './dashboard/cliDashboard.js';

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

  let dashboard = null;
  if (opts.dashboard) {
    dashboard = new CliDashboard();
    dashboard.start();
  }

  try {
    const summary = await runStressTest(config, {
      reportPath: opts.output || 'stress-test-report.txt',
      reportFormat: opts.format || 'txt',
      dashboard: opts.dashboard,
    });

    if (dashboard) {
      dashboard.stop();
    }

    printSummary(summary);
    process.exit(summary.result === 'PASSED' ? 0 : 1);
  } catch (err) {
    if (dashboard) dashboard.stop();
    console.error(chalk.red(`Stress test failed: ${err.message}`));
    process.exit(1);
  }
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

  // Backward compatibility: if first arg is not a known command, treat as config path
  const args = process.argv.slice(2);
  const knownCommands = ['run', 'help', '--help', '-h', '--version', '-V'];
  if (args.length > 0 && !knownCommands.includes(args[0])) {
    // Rewrite argv to include 'run' subcommand
    const configArg = args[0];
    const restArgs = args.slice(1);
    process.argv = [...process.argv.slice(0, 2), 'run', configArg, ...restArgs];
  }

  await program.parseAsync(process.argv);
}

main();
