/**
 * Programmatic usage of express-api-stress-tester v2
 *
 * Run: node examples/programmatic-usage.js
 */

import { stressTest, MetricsCollector } from 'express-api-stress-tester';

// --- Basic GET stress test ---
async function basicExample() {
  console.log('=== Basic GET Stress Test ===\n');

  const result = await stressTest({
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'GET',
    concurrency: 10,
    duration: 5,
  });

  console.log('Total Requests:', result.totalRequests);
  console.log('Requests/sec:  ', result.requestsPerSec);
  console.log('Avg Latency:   ', result.avgResponseTime, 'ms');
  console.log('P95 Latency:   ', result.p95, 'ms');
  console.log('P99 Latency:   ', result.p99, 'ms');
  console.log('Error Rate:    ', result.errorRate, '%');
  console.log('Result:        ', result.result);
  console.log();
}

// --- POST with dynamic payloads ---
async function postExample() {
  console.log('=== POST with Dynamic Payloads ===\n');

  const result = await stressTest({
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'POST',
    concurrency: 20,
    duration: 5,
    headers: { 'Content-Type': 'application/json' },
    payload: {
      title: '{name}',
      body: 'Stress test {uuid}',
      userId: '{randomInt}',
    },
  });

  console.log('Total Requests:', result.totalRequests);
  console.log('Requests/sec:  ', result.requestsPerSec);
  console.log('Error Rate:    ', result.errorRate, '%');
  console.log();
}

// --- Multi-route with traffic distribution ---
async function multiRouteExample() {
  console.log('=== Multi-Route Stress Test ===\n');

  const result = await stressTest({
    baseUrl: 'https://jsonplaceholder.typicode.com',
    concurrency: 30,
    duration: 5,
    routes: [
      { path: '/posts', method: 'GET' },
      { path: '/users', method: 'GET' },
      { path: '/comments', method: 'GET' },
    ],
    trafficDistribution: [
      { route: '/posts', weight: 50 },
      { route: '/users', weight: 30 },
      { route: '/comments', weight: 20 },
    ],
  });

  console.log('Total Requests:', result.totalRequests);
  console.log('Requests/sec:  ', result.requestsPerSec);
  console.log();
}

// --- With thresholds (pass/fail) ---
async function thresholdsExample() {
  console.log('=== Stress Test with Thresholds ===\n');

  const result = await stressTest({
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'GET',
    concurrency: 10,
    duration: 5,
    thresholds: {
      maxErrorRate: 5,
      maxAvgLatency: 500,
      minRPS: 10,
    },
  });

  console.log('Result:', result.result); // 'PASSED' or 'FAILED'
  console.log();
}

// --- Using MetricsCollector directly ---
function metricsExample() {
  console.log('=== MetricsCollector Standalone ===\n');

  const metrics = new MetricsCollector();
  metrics.start();

  // Simulate recording response times
  for (let i = 0; i < 1000; i++) {
    const responseTime = Math.random() * 200 + 10;
    const isError = Math.random() < 0.02; // 2% error rate
    metrics.record(responseTime, isError);
  }

  metrics.stop();
  const summary = metrics.getSummary();

  console.log('Total Requests:', summary.totalRequests);
  console.log('Avg Latency:   ', summary.avgResponseTime, 'ms');
  console.log('P95:           ', summary.p95, 'ms');
  console.log('P99:           ', summary.p99, 'ms');
  console.log('Error Rate:    ', summary.errorRate, '%');
  console.log();
}

// --- Run all examples ---
async function main() {
  try {
    metricsExample();
    await basicExample();
    await postExample();
    await multiRouteExample();
    await thresholdsExample();
    console.log('All examples completed!');
  } catch (err) {
    console.error('Example failed:', err.message);
  }
}

main();
