# express-api-stress-tester

> High-performance distributed API stress testing platform for Express.js APIs.
> Simulate up to **10,000,000 concurrent virtual users** using distributed load generation.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- 🚀 **High-performance HTTP engine** — [undici](https://github.com/nodejs/undici) with connection pooling and HTTP pipelining
- 🔀 **Distributed architecture** — master/worker TCP coordination for horizontal scaling
- 📊 **Real-time terminal dashboard** — live RPS, latency, error rate, CPU, and memory graphs
- 🎯 **Multi-route testing** — test multiple endpoints with weighted traffic distribution
- 🧭 **Per-endpoint analytics** — separate metrics per API route
- 🎭 **Scenario testing** — simulate real user flows across sequential API calls
- 📈 **Advanced metrics** — P95, P99, min, max latency with reservoir sampling
- 📶 **Adaptive load engine** — ramp-up, ramp-down, target RPS, burst traffic
- 📝 **Multi-format reports** — TXT, JSON, and HTML reports with pass/fail status
- 🔌 **Plugin system** — payload generators, auth providers, header providers, interceptors, and custom metrics collectors
- 🧪 **Express integration** — auto-detect routes and stress test Express apps directly
- 💾 **Dataset mode** — load payloads from CSV or JSON files
- ⚡ **Worker threads + async pipelines** — maximum throughput on every CPU core
- 🎛️ **Thresholds** — set pass/fail criteria for error rate, latency, and RPS

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Multi-Route Testing](#multi-route-testing)
- [Scenario Testing](#scenario-testing)
- [Dynamic Payloads](#dynamic-payloads)
- [Dataset Mode](#dataset-mode)
- [Thresholds](#thresholds)
- [Distributed Mode](#distributed-mode)
- [Express Integration](#express-integration)
- [Plugin System](#plugin-system)
- [Real-Time Dashboard](#real-time-dashboard)
- [Reports](#reports)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Performance Goals](#performance-goals)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Running Tests](#running-tests)
- [License](#license)

---

## Installation

```bash
npm install express-api-stress-tester
```

Or run directly with `npx`:

```bash
npx express-api-stress-tester run config.json
```

**Requirements:** Node.js ≥ 18.0.0

---

## Quick Start

### CLI Usage

Create a config file and run:

```bash
# Basic stress test
npx express-api-stress-tester run config.json

# With real-time dashboard
npx express-api-stress-tester run config.json --dashboard

# Generate an HTML report
npx express-api-stress-tester run config.json --format html --output report.html

# Generate a JSON report
npx express-api-stress-tester run config.json --format json --output results.json
```

**Minimal `config.json`:**

```json
{
  "url": "https://api.example.com/users",
  "method": "GET",
  "concurrency": 50,
  "duration": 10
}
```

### Programmatic Usage

```js
import { stressTest } from 'express-api-stress-tester';

const result = await stressTest({
  url: 'https://api.example.com/users',
  method: 'GET',
  concurrency: 50,
  duration: 10,
});

console.log(result);
// {
//   totalRequests: 12400,
//   requestsPerSec: 1240,
//   avgResponseTime: 38,
//   p95: 85,
//   p99: 142,
//   minLatency: 12,
//   maxLatency: 320,
//   errorRate: 0.3,
//   successRate: 99.7,
//   cpuPercent: '28.0',
//   memoryMB: '180.0',
//   result: 'PASSED'
// }
```

---

## Configuration

### All Configuration Options

| Option                | Type     | Default   | Description                                                     |
| --------------------- | -------- | --------- | --------------------------------------------------------------- |
| `url`                 | string   | —         | Target API URL (required for single-URL mode)                   |
| `baseUrl`             | string   | —         | Base URL for multi-route mode                                   |
| `method`              | string   | `GET`     | HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)           |
| `headers`             | object   | `{}`      | Default request headers                                         |
| `payload`             | object   | —         | Request body template (supports dynamic placeholders)           |
| `payloads`            | array    | —         | Bulk payloads — array of objects distributed round-robin        |
| `payloadFile`         | string   | —         | Path to a CSV or JSON dataset file                              |
| `concurrency`         | number   | `1`       | Number of concurrent virtual users                              |
| `maxUsers`            | number   | —         | Alias for `concurrency` when using adaptive ramping             |
| `startConcurrency`    | number   | `1`       | Initial concurrency for ramp-up                                 |
| `rampUp`              | number   | `0`       | Ramp-up time in seconds (linear)                                |
| `rampDown`            | number   | `0`       | Ramp-down time in seconds (linear)                              |
| `targetRPS`           | number   | —         | Adaptive target requests/sec                                    |
| `burst`               | object   | —         | Burst traffic config: `{ start, duration, multiplier, maxUsers }` |
| `duration`            | number   | `10`      | Test duration in seconds                                        |
| `routes`              | array    | —         | Array of route objects for multi-route testing                  |
| `trafficDistribution` | array    | —         | Weighted traffic distribution across routes                     |
| `scenarios`           | array    | —         | Scenario definitions for user flow simulation                   |
| `thresholds`          | object   | —         | Pass/fail thresholds                                            |
| `plugins`             | array    | —         | Plugin module paths to load in worker threads                   |

### Single URL Config

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "concurrency": 100,
  "duration": 30,
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_TOKEN"
  },
  "payload": {
    "username": "{name}",
    "email": "{email}"
  }
}
```

---

## Multi-Route Testing

Test multiple API endpoints simultaneously with optional weighted traffic distribution.

```json
{
  "baseUrl": "https://api.example.com",
  "concurrency": 50,
  "duration": 10,
  "routes": [
    { "path": "/posts", "method": "GET" },
    { "path": "/users", "method": "GET" },
    {
      "path": "/posts",
      "method": "POST",
      "headers": { "Content-Type": "application/json" },
      "payload": { "title": "{name}", "body": "{randomString}" }
    }
  ],
  "trafficDistribution": [
    { "route": "/posts", "weight": 50 },
    { "route": "/users", "weight": 30 },
    { "route": "/posts", "weight": 20 }
  ]
}
```

**How it works:**

- Without `trafficDistribution` — routes are selected round-robin.
- With `trafficDistribution` — routes are selected via weighted random distribution. Weights are relative (they don't need to sum to 100).

---

## Per-Endpoint Metrics

When multiple routes or scenarios are tested, the report and dashboard include **separate metrics per API endpoint** (RPS, latency, error rate).

Example snippet from the TXT report:

```
Per-Endpoint Metrics:
Endpoint                               RPS   Avg(ms)   P95(ms)   Errors(%)
----------------------------------------------------------------------------
GET /login                             5200     120       210      0.5
POST /orders                           3100     210       410      1.3
```

---

## Scenario Testing

Simulate real user flows by defining sequential steps that execute in order.

```json
{
  "url": "https://api.example.com",
  "concurrency": 20,
  "duration": 10,
  "scenarios": [
    {
      "name": "userFlow",
      "steps": [
        { "url": "/users", "method": "GET" },
        { "url": "/posts", "method": "GET" },
        {
          "url": "/posts",
          "method": "POST",
          "headers": { "Content-Type": "application/json" },
          "payload": { "title": "{name}", "body": "{randomString}" }
        }
      ]
    }
  ]
}
```

Each virtual user executes the steps sequentially, simulating a realistic browsing or API consumption pattern.

---

## Adaptive Load & Burst Traffic

Use ramp-up, ramp-down, target RPS, and burst windows to shape traffic patterns.

```json
{
  "baseUrl": "https://api.example.com",
  "routes": [{ "path": "/login", "method": "POST" }],
  "maxUsers": 100000,
  "startConcurrency": 1000,
  "rampUp": 30,
  "rampDown": 10,
  "targetRPS": 50000,
  "burst": { "start": 20, "duration": 5, "multiplier": 2 }
}
```

---

## Dynamic Payloads

Use placeholders in your payload values. They are replaced with fresh random data for **every request**.

### Placeholder Reference

| Placeholder      | Description                     | Example Output                         |
| ---------------- | ------------------------------- | -------------------------------------- |
| `{name}`         | Random full name                | `Alice Johnson`                        |
| `{email}`        | Random email address            | `alice4231@example.com`                |
| `{uuid}`         | UUID v4                         | `550e8400-e29b-41d4-a716-446655440000` |
| `{number}`       | Random 6-digit number           | `483291`                               |
| `{timestamp}`    | Current Unix timestamp (ms)     | `1710547200000`                        |
| `{botName}`      | Random bot name                 | `AlphaBot`                             |
| `{randomInt}`    | Random integer (0–999,999)      | `742518`                               |
| `{randomString}` | Random alphanumeric (8–16 chars)| `aB3xKm9pQ2`                           |

### Usage Examples

**As field values:**

```json
{
  "payload": {
    "name": "{name}",
    "email": "{email}",
    "id": "{uuid}",
    "score": "{randomInt}",
    "token": "{randomString}"
  }
}
```

**Embedded in strings:**

```json
{
  "payload": {
    "greeting": "Hello {name}, your ID is {uuid}",
    "body": "Stress test payload {timestamp}"
  }
}
```

### Bulk Payload Mode

Send multiple different payloads. They are distributed across requests in round-robin order.

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "concurrency": 100,
  "duration": 10,
  "headers": { "Content-Type": "application/json" },
  "payloads": [
    { "name": "Alice", "role": "admin" },
    { "name": "Bob", "role": "user" },
    { "name": "Charlie", "role": "moderator" }
  ]
}
```

---

## Dataset Mode

Load payloads from external CSV or JSON files using the `payloadFile` option or the `DatasetLoader` class.

### CSV File (`users.csv`)

```csv
id,name,email,role,age
1,Alice Johnson,alice@example.com,admin,32
2,Bob Smith,bob@example.com,user,28
3,Charlie Brown,charlie@example.com,user,45
```

### JSON File (`users.json`)

```json
[
  { "id": 1, "name": "Alice Johnson", "email": "alice@example.com" },
  { "id": 2, "name": "Bob Smith", "email": "bob@example.com" },
  { "id": 3, "name": "Charlie Brown", "email": "charlie@example.com" }
]
```

### Using in Config

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "concurrency": 50,
  "duration": 10,
  "headers": { "Content-Type": "application/json" },
  "payloadFile": "./dataset/users.csv"
}
```

### Programmatic DatasetLoader

```js
import { DatasetLoader } from 'express-api-stress-tester';

const loader = new DatasetLoader('./dataset/users.csv');
await loader.load();

console.log(loader.length);             // 10
console.log(loader.getRecord(0));        // { id: '1', name: 'Alice Johnson', ... }
console.log(loader.getRandomRecord());   // random row from the dataset
```

---

## Thresholds

Define pass/fail criteria. The test result will be `PASSED` or `FAILED` based on these thresholds.

```json
{
  "url": "https://api.example.com/posts",
  "method": "GET",
  "concurrency": 100,
  "duration": 15,
  "thresholds": {
    "maxErrorRate": 5,
    "maxAvgLatency": 300,
    "minRPS": 50
  }
}
```

| Threshold       | Type   | Description                                 |
| --------------- | ------ | ------------------------------------------- |
| `maxErrorRate`  | number | Maximum allowed error rate (%). Fail if exceeded.  |
| `maxAvgLatency` | number | Maximum average response time (ms). Fail if exceeded. |
| `minRPS`        | number | Minimum requests per second. Fail if below.        |

When thresholds are set, the summary `result` field returns `PASSED` or `FAILED`. Without thresholds, the default rule is: error rate < 5% → `PASSED`.

---

## Distributed Mode

Scale horizontally across multiple machines using the built-in TCP-based master/worker coordination.

### CLI Usage

```bash
# Start master with config
npx express-api-stress-tester master config.json --port 7654 --workers 3

# Start workers (run on other machines)
npx express-api-stress-tester worker --host 127.0.0.1 --port 7654
```

### Master Node

```js
import { MasterNode } from 'express-api-stress-tester';

const master = new MasterNode({ port: 7654 });
await master.start();

// Wait for workers to connect, then distribute work
const config = {
  url: 'https://api.example.com/users',
  method: 'GET',
  concurrency: 10000,
  duration: 60,
};

const results = await master.distributeWork(config);
const combined = await master.collectResults(results);

console.log('Combined results:', combined);
await master.stop();
```

### Worker Node

```js
import { WorkerNode } from 'express-api-stress-tester';

const worker = new WorkerNode({
  masterHost: '192.168.1.100',
  masterPort: 7654,
});

await worker.connect();
// Worker automatically receives work and reports results
```

### How It Works

```
┌─────────────────┐
│   Master Node   │
│   (port 7654)   │
└────────┬────────┘
         │  TCP (newline-delimited JSON)
    ┌────┴─────┬───────────┐
    ▼          ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Worker 1│ │Worker 2│ │Worker 3│
│Machine │ │Machine │ │Machine │
└────────┘ └────────┘ └────────┘
```

1. Workers connect to the master via TCP.
2. Master distributes the test configuration evenly across workers.
3. Each worker runs the stress test locally using worker threads.
4. Workers report results back to the master.
5. Master aggregates all results into a combined summary.

---

## Express Integration

Automatically discover routes from your Express app and stress test them.

### Auto-Detect and Test

```js
import express from 'express';
import { testExpressApp } from 'express-api-stress-tester';

const app = express();
app.get('/users', (req, res) => res.json([]));
app.get('/posts', (req, res) => res.json([]));
app.post('/posts', (req, res) => res.status(201).json({}));

const { routes, summary } = await testExpressApp(app, {
  concurrency: 10,
  duration: 5,
});

console.log('Discovered routes:', routes);
// [
//   { path: '/users', method: 'GET', middlewareCount: 1 },
//   { path: '/posts', method: 'GET', middlewareCount: 1 },
//   { path: '/posts', method: 'POST', middlewareCount: 1 },
// ]

console.log('Test result:', summary.result);
```

### Analyze Routes Only

```js
import { analyzeExpressApp } from 'express-api-stress-tester';

const routes = analyzeExpressApp(app);
console.log(routes);
// [{ path: '/users', method: 'GET', middlewareCount: 1 }, ...]
```

`testExpressApp` automatically:

1. Discovers all registered routes (including nested routers)
2. Starts a server on a random available port
3. Runs the stress test against all discovered routes
4. Shuts down the server
5. Returns the routes and test summary

---

## Plugin System

Extend the stress tester with custom plugins for authentication, payload generation, request interception, and more.

### Plugin Types

| Type                 | Description                             | Handler Signature                |
| -------------------- | --------------------------------------- | -------------------------------- |
| `authProvider`       | Inject authentication headers           | `() => headerObject`             |
| `headerProvider`     | Add custom headers to requests          | `() => headerObject`             |
| `payloadGenerator`   | Generate custom request payloads        | `() => payloadObject`            |
| `requestInterceptor` | Intercept and modify requests           | `(context) => modifiedContext`   |
| `metricsCollector`   | Collect custom metrics during tests     | `(data) => void`                 |

### Creating Plugins

```js
import { PluginManager, createPlugin } from 'express-api-stress-tester';

const pm = new PluginManager();

// Auth provider — injects Bearer token
pm.registerPlugin(
  createPlugin('myAuth', 'authProvider', () => ({
    Authorization: 'Bearer my-secret-token',
  }))
);

// Payload generator — custom dynamic data
pm.registerPlugin(
  createPlugin('customPayload', 'payloadGenerator', () => ({
    timestamp: Date.now(),
    randomValue: Math.random(),
  }))
);

// Request interceptor — log or modify requests
pm.registerPlugin(
  createPlugin('logger', 'requestInterceptor', (ctx) => {
    console.log(`${ctx.method} ${ctx.url}`);
    return ctx;
  })
);

// Check plugin availability
console.log(pm.has('authProvider'));       // true
console.log(pm.has('payloadGenerator'));   // true

// Retrieve plugins by type
const authPlugins = pm.getPlugins('authProvider');
const headers = authPlugins[0].handler();
console.log(headers); // { Authorization: 'Bearer my-secret-token' }
```

### Loading Plugins via Config

```json
{
  "url": "https://api.example.com/users",
  "method": "GET",
  "concurrency": 100,
  "duration": 10,
  "plugins": ["./plugins/authPlugin.js", "./plugins/requestLogger.js"]
}
```

---

## Real-Time Dashboard

Enable the live terminal dashboard for real-time monitoring during tests.

```bash
npx express-api-stress-tester run config.json --dashboard
```

The dashboard displays:

| Metric         | Description                         |
| -------------- | ----------------------------------- |
| Active Users   | Current number of concurrent users  |
| Requests/sec   | Live throughput                      |
| Avg Latency    | Average response time               |
| P95 Latency    | 95th percentile response time       |
| Error Rate     | Percentage of failed requests       |
| CPU Usage      | System CPU utilization              |
| Memory Usage   | Process memory consumption          |

**Features:**

- Updates every 1 second
- Color-coded indicators: 🟢 green (healthy), 🟡 yellow (warning), 🔴 red (critical)
- 60-second RPS history with ASCII bar chart
- Per-endpoint table with live RPS, latency, and error rate
- Clean exit on test completion

---

## Reports

Generate reports in multiple formats to analyze results.

### CLI Report Options

```bash
# Text report (default)
npx express-api-stress-tester run config.json --format txt --output report.txt

# JSON report
npx express-api-stress-tester run config.json --format json --output results.json

# HTML report
npx express-api-stress-tester run config.json --format html --output report.html
```

### Text Report

```
==================================================
  API Stress Test Report
==================================================
API URL:            https://api.example.com/users
Method:             POST
Concurrent Users:   100
Duration (s):       15.0
Total Requests:     18600
Requests/sec:       1240
Avg Response Time:  38ms
P95 Latency:        85ms
P99 Latency:        142ms
Min Latency:        12ms
Max Latency:        320ms
Error Rate:         0.3%
Success Rate:       99.7%
CPU Usage:          28.0%
Memory Usage:       180.0MB
Result:             PASSED
==================================================
```

### JSON Report

```json
{
  "config": {
    "url": "https://api.example.com/users",
    "method": "POST",
    "concurrency": 100,
    "duration": 15
  },
  "summary": {
    "totalRequests": 18600,
    "requestsPerSec": 1240,
    "avgResponseTime": 38,
    "p95": 85,
    "p99": 142,
    "minLatency": 12,
    "maxLatency": 320,
    "errorRate": 0.3,
    "successRate": 99.7,
    "result": "PASSED",
    "perEndpoint": {
      "GET /users": {
        "requestsPerSec": 620,
        "avgResponseTime": 35,
        "p95": 80,
        "errorRate": 0.2
      }
    }
  }
}
```

### HTML Report

The HTML report is a self-contained file with:

- Status badge (✓ PASSED or ✗ FAILED)
- Test configuration table
- Results summary table with all metrics
- Latency, request rate, and error distribution charts
- Per-endpoint metrics table
- Timestamp of generation
- Embedded CSS — no external dependencies

### Programmatic Report Writing

```js
import { ReportWriter } from 'express-api-stress-tester';

const writer = new ReportWriter(config, summary);
writer.writeTxt('report.txt');
writer.writeJson('results.json');
writer.writeHtml('report.html');
```

---

## Project Structure

```
express-api-stress-tester/
├── src/
│   ├── index.js                          # Public API exports
│   ├── cli.js                            # CLI entry point (commander)
│   │
│   ├── core/
│   │   ├── httpEngine.js                 # undici connection pool + pipelining
│   │   ├── scheduler.js                  # Route scheduling (round-robin / weighted)
│   │   ├── workerManager.js              # Worker thread orchestration
│   │   ├── worker.js                     # Worker thread – executes HTTP requests
│   │   ├── runner.js                     # Main orchestrator (spawn, dispatch, collect)
│   │   └── distributedCoordinator.js     # MasterNode / WorkerNode (TCP)
│   │
│   ├── payload/
│   │   ├── dynamicGenerator.js           # Placeholder generators ({name}, {uuid}, etc.)
│   │   └── datasetLoader.js              # CSV/JSON dataset loading
│   │
│   ├── metrics/
│   │   ├── metricsCollector.js           # Metrics aggregation + percentiles
│   │   ├── apiMetrics.js                 # Per-endpoint metrics collector
│   │   └── systemMetrics.js              # CPU & memory monitoring
│   │
│   ├── reporting/
│   │   ├── reportWriter.js               # TXT / JSON / HTML report dispatcher
│   │   └── htmlReport.js                 # Self-contained HTML report generator
│   │
│   ├── dashboard/
│   │   └── cliDashboard.js              # Real-time terminal dashboard
│   │
│   ├── plugins/
│   │   └── pluginManager.js             # Plugin registration & lifecycle
│   │
│   └── express/
│       └── routeAnalyzer.js             # Express app route discovery & testing
│
├── examples/
│   ├── basic-config.json                 # Simple single-URL test
│   ├── multi-route-config.json           # Multi-route with traffic distribution
│   ├── scenario-config.json              # Scenario-based user flow
│   ├── thresholds-config.json            # Pass/fail thresholds
│   ├── programmatic-usage.js             # Programmatic API examples
│   ├── plugin-example.js                 # Plugin system examples
│   └── dataset/
│       ├── users.json                    # Sample JSON dataset
│       └── users.csv                     # Sample CSV dataset
│
├── tests/
│   ├── payload.test.js
│   └── stress.test.js
│
├── package.json
├── example-config.json
└── README.md
```

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           CLI / Programmatic         │
                    │         (cli.js / stressTest())      │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │            Runner                    │
                    │  (config validation, orchestration)  │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼────────┐ ┌────────▼─────────┐ ┌────────▼─────────┐
    │  Worker Thread 1 │ │  Worker Thread 2 │ │  Worker Thread N │
    │   ┌───────────┐  │ │   ┌───────────┐  │ │   ┌───────────┐  │
    │   │HttpEngine │  │ │   │HttpEngine │  │ │   │HttpEngine │  │
    │   │(undici)   │  │ │   │(undici)   │  │ │   │(undici)   │  │
    │   └───────────┘  │ │   └───────────┘  │ │   └───────────┘  │
    │   ┌───────────┐  │ │   ┌───────────┐  │ │   ┌───────────┐  │
    │   │Scheduler  │  │ │   │Scheduler  │  │ │   │Scheduler  │  │
    │   └───────────┘  │ │   └───────────┘  │ │   └───────────┘  │
    └──────────┬───────┘ └────────┬─────────┘ └────────┬─────────┘
               │                  │                     │
               └──────────────────┼─────────────────────┘
                                  │
                    ┌─────────────▼──────────────────────┐
                    │        MetricsCollector             │
                    │  (aggregate, percentiles, summary)  │
                    └─────────────┬──────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                    │
    ┌─────────▼───────┐ ┌────────▼────────┐ ┌────────▼────────┐
    │  TXT Report     │ │  JSON Report    │ │  HTML Report    │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Distributed Mode Architecture

```
┌─────────────────────────────────────┐
│           Master Node               │
│         (port 7654)                 │
│  ┌────────────────────────────┐     │
│  │  Distribute config evenly  │     │
│  │  Aggregate results         │     │
│  └────────────────────────────┘     │
└──────────────┬──────────────────────┘
               │  TCP (newline-delimited JSON)
     ┌─────────┼─────────┐
     ▼         ▼         ▼
┌─────────┐┌─────────┐┌─────────┐
│Worker   ││Worker   ││Worker   │
│Node 1   ││Node 2   ││Node 3   │
│         ││         ││         │
│ Threads ││ Threads ││ Threads │
│ 1..N    ││ 1..N    ││ 1..N    │
└─────────┘└─────────┘└─────────┘
```

---

## Performance Goals

| Metric                | Target                          |
| --------------------- | ------------------------------- |
| Requests/sec (single) | **100,000+** per node           |
| Virtual users (dist.) | **10,000,000** via distributed  |
| Latency overhead      | < 1ms per request               |
| Memory efficiency     | Reservoir sampling (10K max)    |
| Scaling               | Linear horizontal scaling       |

### Why It's Fast

- **undici** — Node.js native HTTP client, 2-5× faster than `axios` or `node-fetch`
- **Connection pooling** — reuse sockets with configurable pool size
- **HTTP pipelining** — multiple requests per socket connection
- **Worker threads** — distribute load across all CPU cores
- **Batch dispatching** — 200 requests per worker per dispatch cycle
- **Nanosecond timing** — `process.hrtime.bigint()` for precise latency measurement
- **Reservoir sampling** — O(1) memory for percentile calculation

---

## API Reference

### Core Functions

```js
import {
  stressTest,          // Main entry point — run a stress test
  runStressTest,       // Alias for stressTest
  testExpressApp,      // Auto-test an Express app
  analyzeExpressApp,   // Discover Express routes
} from 'express-api-stress-tester';
```

### Classes

```js
import {
  HttpEngine,          // undici-based HTTP connection pool
  Scheduler,           // Route selection (round-robin / weighted)
  WorkerManager,       // Worker thread orchestration
  MetricsCollector,    // Metrics aggregation + percentiles
  DatasetLoader,       // CSV/JSON dataset loading
  PluginManager,       // Plugin registration and lifecycle
  ReportWriter,        // Multi-format report generation
  CliDashboard,        // Real-time terminal dashboard
  MasterNode,          // Distributed mode — master coordinator
  WorkerNode,          // Distributed mode — worker client
} from 'express-api-stress-tester';
```

### Utilities

```js
import {
  generators,          // Dynamic placeholder generators
  resolveValue,        // Resolve placeholders in a string
  writeReport,         // Quick report writing function
  createPlugin,        // Plugin factory function
  log,                 // Internal logging utility
} from 'express-api-stress-tester';
```

### `stressTest(config, options?)` → `Promise<Summary>`

**Config:** See [Configuration](#configuration) for all options.

**Options:**

| Option         | Type    | Default | Description                    |
| -------------- | ------- | ------- | ------------------------------ |
| `reportPath`   | string  | —       | File path to write the report  |
| `reportFormat` | string  | `txt`   | Report format: `txt`, `json`, `html` |
| `dashboard`    | boolean | `false` | Enable real-time CLI dashboard |

**Returns:** `Summary` object with all metrics (see [Quick Start](#quick-start)).

---

## Examples

The [`examples/`](./examples/) directory contains ready-to-use configurations and scripts:

| File                                                    | Description                         |
| ------------------------------------------------------- | ----------------------------------- |
| [`basic-config.json`](./examples/basic-config.json)     | Simple single-URL POST test         |
| [`multi-route-config.json`](./examples/multi-route-config.json) | Multi-route with traffic weights |
| [`scenario-config.json`](./examples/scenario-config.json)       | User flow scenario testing    |
| [`thresholds-config.json`](./examples/thresholds-config.json)   | Pass/fail threshold criteria  |
| [`programmatic-usage.js`](./examples/programmatic-usage.js)     | Programmatic API examples     |
| [`plugin-example.js`](./examples/plugin-example.js)             | Plugin system examples        |
| [`dataset/users.json`](./examples/dataset/users.json)           | Sample JSON dataset           |
| [`dataset/users.csv`](./examples/dataset/users.csv)             | Sample CSV dataset            |

**Run an example:**

```bash
# Config-based
npx express-api-stress-tester run examples/basic-config.json

# With dashboard
npx express-api-stress-tester run examples/multi-route-config.json --dashboard

# Programmatic
node examples/programmatic-usage.js
```

---

## Running Tests

```bash
npm test
```

---

## License

MIT
