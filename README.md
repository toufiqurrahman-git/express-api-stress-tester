# api-stress-tester

High-performance API stress testing and load testing tool for Node.js.  
Simulate up to **100,000 concurrent users** sending requests to your APIs.

---

## Features

- **High concurrency** – powered by [undici](https://github.com/nodejs/undici) and `worker_threads`
- **Dynamic payloads** – auto-generate names, emails, UUIDs, and more
- **Bulk payload mode** – send different bodies across requests
- **Detailed reports** – requests/sec, response times, error rates, CPU & memory
- **CLI & programmatic API** – use from the terminal or inside your Node.js app
- **Streaming architecture** – minimal memory footprint at scale

---

## Installation

```bash
npm install api-stress-tester
```

Or run directly with `npx`:

```bash
npx api-stress-tester config.json
```

---

## CLI Usage

Create a `config.json` file:

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "concurrency": 5000,
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

Run the test:

```bash
npx api-stress-tester config.json
```

The tool will print a summary to stdout and append it to `stress-test-report.txt`.

---

## Programmatic Usage

```js
import { stressTest } from "api-stress-tester";

const summary = await stressTest({
  url: "https://api.example.com/users",
  method: "POST",
  concurrency: 5000,
  duration: 30,
  headers: {
    "Content-Type": "application/json",
  },
  payload: {
    name: "{name}",
    email: "{email}",
  },
});

console.log(summary);
// {
//   totalRequests: 252000,
//   requestsPerSec: 8400,
//   avgResponseTime: 120,
//   errorRate: 1.2,
//   successRate: 98.8,
//   cpuPercent: '45.0',
//   memoryMB: '320.0',
//   result: 'PASSED'
// }
```

---

## Configuration Options

| Option        | Type     | Required | Default | Description                             |
| ------------- | -------- | -------- | ------- | --------------------------------------- |
| `url`         | string   | yes      | –       | Target API URL                          |
| `method`      | string   | no       | `GET`   | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `headers`     | object   | no       | `{}`    | Request headers                         |
| `payload`     | object   | no       | –       | Single payload template (supports dynamic placeholders) |
| `payloads`    | array    | no       | –       | Bulk payloads – array of payload objects distributed round-robin |
| `concurrency` | number   | no       | `1`     | Number of concurrent users (up to 100k) |
| `duration`    | number   | no       | `10`    | Test duration in seconds                |

---

## Dynamic Payload Placeholders

Use placeholders in your payload values. They are replaced with fresh random data for every request.

| Placeholder    | Example Output               |
| -------------- | ---------------------------- |
| `{name}`       | `Alice Johnson`              |
| `{botName}`    | `AlphaBot`                   |
| `{email}`      | `alice4231@example.com`      |
| `{uuid}`       | `550e8400-e29b-41d4-a716-...`|
| `{number}`     | `483291`                     |
| `{timestamp}`  | `1710547200000`              |

**Example:**

```json
{
  "payload": {
    "name": "{name}",
    "botName": "{botName}",
    "email": "{email}",
    "uuid": "{uuid}",
    "age": "{number}",
    "createdAt": "{timestamp}"
  }
}
```

Placeholders also work inside larger strings:

```json
{ "greeting": "Hello {name}, your ID is {uuid}" }
```

---

## Bulk Payload Mode

Send multiple different payloads. They are distributed across requests in round-robin order.

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "concurrency": 100,
  "duration": 10,
  "headers": { "Content-Type": "application/json" },
  "payloads": [
    { "name": "Alice" },
    { "name": "Bob" },
    { "name": "Charlie" }
  ]
}
```

---

## Report Output

After each test, a report is appended to `stress-test-report.txt`:

```
==================================================
  API Stress Test Report
==================================================
API URL:            https://api.example.com/users
Method:             POST
Concurrent Users:   5000
Duration (s):       30.0
Total Requests:     252000
Requests/sec:       8400
Avg Response Time:  120ms
Error Rate:         1.2%
Success Rate:       98.8%
CPU Usage:          45.0%
Memory Usage:       320.0MB
Result:             PASSED
==================================================
```

**Result rules:**
- `PASSED` → error rate < 5%
- `FAILED` → error rate ≥ 5%

---

## Project Structure

```
api-stress-tester/
├── src/
│   ├── index.js             # Public API exports
│   ├── runner.js            # Main orchestrator (spawns workers, collects metrics)
│   ├── worker.js            # Worker thread – executes HTTP requests via undici
│   ├── payloadParser.js     # Payload template resolver (single & bulk)
│   ├── dynamicGenerators.js # Random data generators for placeholders
│   ├── metrics.js           # MetricsCollector – aggregates counters
│   ├── logger.js            # Streaming logger & report writer
│   └── cli.js               # CLI entry point
├── tests/
│   ├── payload.test.js      # Payload & generator tests
│   └── stress.test.js       # Metrics, report, and runner tests
├── package.json
├── example-config.json
└── README.md
```

---

## Running Tests

```bash
npm test
```

---

## Performance Notes

- Uses **undici** for HTTP – significantly faster than `axios` or `node-fetch`
- **Worker threads** distribute load across CPU cores
- Controlled **batch dispatching** prevents event loop starvation
- Metrics use **aggregate counters** (not per-request arrays) to minimise memory
- Report writing uses **appendFileSync** – no large in-memory buffers

---

## How to Publish

```bash
npm login
npm publish
```

---

## License

MIT
