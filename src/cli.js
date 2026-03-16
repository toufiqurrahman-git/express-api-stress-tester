#!/usr/bin/env node

/**
 * CLI entry point for api-stress-tester.
 *
 * Usage:
 *   npx api-stress-tester config.json
 *   node src/cli.js config.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runStressTest } from './runner.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
  api-stress-tester – High-performance API stress testing tool

  Usage:
    api-stress-tester <config.json>

  Options:
    --help, -h    Show this help message

  Example config.json:
    {
      "url": "https://api.example.com/users",
      "method": "POST",
      "concurrency": 5000,
      "duration": 30,
      "headers": { "Content-Type": "application/json" },
      "payload": { "name": "{name}", "email": "{email}" }
    }
    `);
    process.exit(0);
  }

  const configPath = resolve(args[0]);

  let config;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading config file: ${err.message}`);
    process.exit(1);
  }

  try {
    const summary = await runStressTest(config);
    process.exit(summary.result === 'PASSED' ? 0 : 1);
  } catch (err) {
    console.error(`Stress test failed: ${err.message}`);
    process.exit(1);
  }
}

main();
