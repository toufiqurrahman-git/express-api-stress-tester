/**
 * Worker thread entry point (v2).
 *
 * Receives task batches from the main thread, executes HTTP requests
 * using undici, and reports back per-batch metrics with reservoir-sampled
 * response times for accurate percentile calculation.
 *
 * Message protocol:
 *   main → worker : { type: 'batch', tasks: [...], routes: [...] }
 *   main → worker : { type: 'stop' }
 *   worker → main : { type: 'result', metrics: { ... } }
 */
import { parentPort, workerData } from 'node:worker_threads';
import { request } from 'undici';

// Dynamic payload generation (best-effort import; fall back to identity)
let resolvePayload = (v) => v;
try {
  const mod = await import('../payload/dynamicGenerator.js');
  if (mod.parsePayload) {
    resolvePayload = mod.parsePayload;
  }
} catch {
  // dynamicGenerator not available — payloads are sent as-is
}

const config = workerData || {};

// ── Reservoir sampling ─────────────────────────────────────────────
const MAX_SAMPLE_SIZE = 1000;
let reservoir = [];
let sampleCount = 0;

function reservoirSample(value) {
  sampleCount++;
  if (reservoir.length < MAX_SAMPLE_SIZE) {
    reservoir.push(value);
  } else {
    // Replace an existing element with decreasing probability
    const idx = Math.floor(Math.random() * sampleCount);
    if (idx < MAX_SAMPLE_SIZE) {
      reservoir[idx] = value;
    }
  }
}

// ── Per-batch counters ─────────────────────────────────────────────
let totalRequests = 0;
let successCount = 0;
let errorCount = 0;
let totalResponseTime = 0;
const statusCodes = {};

/**
 * Resolve the full URL for a route.
 */
function resolveUrl(route) {
  const base = route.baseUrl || config.baseUrl || config.url || '';
  const path = route.path || '';

  // If path is already a full URL, use it directly
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // If base already contains a path component and route.path is relative
  if (base && path) {
    // Strip trailing slash from base, ensure leading slash on path
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  return base || path;
}

/**
 * Execute a single HTTP request and record timing.
 */
async function executeRequest(task) {
  const route = task.route || {
    path: '',
    method: config.method || 'GET',
    headers: config.headers || {},
    payload: config.payload || null,
  };

  const url = resolveUrl(route);
  const method = (route.method || config.method || 'GET').toUpperCase();
  const headers = { ...(config.headers || {}), ...(route.headers || {}) };

  let body = null;
  if (route.payload != null && method !== 'GET' && method !== 'HEAD') {
    const resolved = resolvePayload(route.payload);
    body = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  }

  const startNs = process.hrtime.bigint();
  let isError = false;
  let status = 0;

  try {
    const res = await request(url, {
      method,
      headers,
      body,
    });

    status = res.statusCode;
    // Consume body to free the socket (undici requirement)
    await res.body.text();

    if (status >= 400) {
      isError = true;
    }
  } catch {
    isError = true;
  }

  const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;

  totalRequests++;
  totalResponseTime += elapsedMs;
  reservoirSample(elapsedMs);

  if (status) {
    statusCodes[status] = (statusCodes[status] || 0) + 1;
  }

  if (isError) {
    errorCount++;
  } else {
    successCount++;
  }
}

// ── Message handler ────────────────────────────────────────────────
parentPort.on('message', async (msg) => {
  if (msg.type === 'batch') {
    // Reset per-batch counters
    totalRequests = 0;
    successCount = 0;
    errorCount = 0;
    totalResponseTime = 0;
    // Keep the reservoir across batches for better sampling
    Object.keys(statusCodes).forEach((k) => { statusCodes[k] = 0; });

    // Build task objects from the incoming message
    const tasks = (msg.tasks || []).map((t, i) => {
      if (typeof t === 'object' && t !== null) return t;

      // Legacy numeric task indices — pair with routes if available
      const routes = msg.routes || [];
      if (routes.length > 0) {
        const route = routes[i % routes.length];
        return { route };
      }

      // Fallback: use default config
      return { route: null };
    });

    // Execute all tasks concurrently
    await Promise.all(tasks.map((task) => executeRequest(task)));

    // Report metrics back to the main thread
    parentPort.postMessage({
      type: 'result',
      metrics: {
        totalRequests,
        successCount,
        errorCount,
        totalResponseTime,
        responseTimes: [...reservoir],
        statusCodes: { ...statusCodes },
      },
    });
  }

  if (msg.type === 'stop') {
    process.exit(0);
  }
});
