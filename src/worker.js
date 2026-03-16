/**
 * Worker thread entry point.
 *
 * Receives task batches from the main thread and executes HTTP requests
 * using undici's high-performance Pool.
 *
 * Communication is via parentPort messages:
 *   main → worker : { type: 'batch', tasks: [...] }
 *   main → worker : { type: 'stop' }
 *   worker → main : { type: 'result', metrics: {...} }
 */
import { parentPort, workerData } from 'node:worker_threads';
import { request } from 'undici';
import { getPayload } from './payloadParser.js';

const config = workerData;

// Aggregate counters for this worker
let totalRequests = 0;
let successCount = 0;
let errorCount = 0;
let totalResponseTime = 0;

/**
 * Execute a single HTTP request and record timing.
 */
async function executeRequest(taskIndex) {
  const startMs = Date.now();
  let isError = false;

  try {
    const body = getPayload(config, taskIndex);
    const options = {
      method: (config.method || 'GET').toUpperCase(),
      headers: config.headers || {},
    };
    if (body !== undefined && options.method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const res = await request(config.url, options);

    // Consume the body to free resources (undici requires this)
    // eslint-disable-next-line no-unused-vars
    const data = await res.body.text();

    if (res.statusCode >= 400) {
      isError = true;
    }
  } catch {
    isError = true;
  }

  const elapsed = Date.now() - startMs;
  totalRequests++;
  totalResponseTime += elapsed;
  if (isError) {
    errorCount++;
  } else {
    successCount++;
  }
}

parentPort.on('message', async (msg) => {
  if (msg.type === 'batch') {
    // Run all tasks in the batch concurrently
    const promises = msg.tasks.map((taskIndex) => executeRequest(taskIndex));
    await Promise.all(promises);

    // Report partial metrics back to main thread
    parentPort.postMessage({
      type: 'result',
      metrics: { totalRequests, successCount, errorCount, totalResponseTime },
    });

    // Reset for next batch
    totalRequests = 0;
    successCount = 0;
    errorCount = 0;
    totalResponseTime = 0;
  }

  if (msg.type === 'stop') {
    process.exit(0);
  }
});
