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
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PluginManager } from '../plugins/pluginManager.js';
import { HttpEngine } from './httpEngine.js';
import { DatasetLoader } from '../payload/datasetLoader.js';

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
const pluginManager = new PluginManager();
const engineCache = new Map();
let datasetLoader = null;
let datasetIndex = 0;

async function loadPlugins() {
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  for (const entry of plugins) {
    let moduleId = null;
    try {
      moduleId = typeof entry === 'string' ? entry : null;
      if (!moduleId) continue;
      const isPath = moduleId.startsWith('.') || moduleId.startsWith('/');
      const pluginPath = resolve(process.cwd(), moduleId);
      const resolved = isPath ? pathToFileURL(pluginPath).href : moduleId;
      const mod = await import(resolved);
      const pluginExport = mod.default || mod.plugin || mod.plugins;
      if (Array.isArray(pluginExport)) {
        for (const plugin of pluginExport) {
          pluginManager.registerPlugin(plugin);
        }
      } else if (pluginExport) {
        pluginManager.registerPlugin(pluginExport);
      }
    } catch (err) {
      process.stderr.write(`[Worker] Failed to load plugin ${moduleId}: ${err.message}\n`);
    }
  }
}

await loadPlugins();

if (config.payloadFile) {
  datasetLoader = new DatasetLoader(config.payloadFile);
  await datasetLoader.load();
}

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
let minLatency = Infinity;
let maxLatency = -Infinity;
const statusCodes = {};
const perEndpoint = {};

/**
 * Resolve the full URL for a route.
 */
function resolveUrl(route) {
  const base = route.baseUrl || config.baseUrl || config.url || '';
  const path = route.path || route.url || '';
  try {
    if (path) {
      return new URL(path, base).toString();
    }
    if (base) {
      return new URL(base).toString();
    }
  } catch {
    // ignore
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanBase ? `${cleanBase}${cleanPath}` : path;
}

function getEngine(baseUrl) {
  if (!engineCache.has(baseUrl)) {
    engineCache.set(
      baseUrl,
      new HttpEngine({
        baseUrl,
        connections: config.connections,
        pipelining: config.pipelining,
        timeout: config.timeout,
        headers: config.headers || {},
      }),
    );
  }
  return engineCache.get(baseUrl);
}

function resolveEndpointKey(method, url, route) {
  const path = route?.path || route?.url;
  if (path && !path.startsWith('http://') && !path.startsWith('https://')) {
    const cleanPath = path.split('?')[0];
    return `${method} ${cleanPath}`;
  }
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}

function getEndpointMetrics(endpoint) {
  if (!perEndpoint[endpoint]) {
    perEndpoint[endpoint] = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      minLatency: Infinity,
      maxLatency: -Infinity,
      responseTimes: [],
      sampleCount: 0,
    };
  }
  return perEndpoint[endpoint];
}

function recordEndpoint(endpoint, elapsedMs, isError) {
  const metrics = getEndpointMetrics(endpoint);
  metrics.totalRequests++;
  metrics.totalResponseTime += elapsedMs;
  if (elapsedMs < metrics.minLatency) metrics.minLatency = elapsedMs;
  if (elapsedMs > metrics.maxLatency) metrics.maxLatency = elapsedMs;
  if (isError) {
    metrics.errorCount++;
  } else {
    metrics.successCount++;
  }
  metrics.sampleCount++;
  if (metrics.responseTimes.length < MAX_SAMPLE_SIZE) {
    metrics.responseTimes.push(elapsedMs);
  } else {
    const idx = Math.floor(Math.random() * metrics.sampleCount);
    if (idx < MAX_SAMPLE_SIZE) {
      metrics.responseTimes[idx] = elapsedMs;
    }
  }
}

function recordRequestMetrics({ endpointKey, elapsedMs, isError, status }) {
  totalRequests++;
  totalResponseTime += elapsedMs;
  reservoirSample(elapsedMs);
  if (elapsedMs < minLatency) minLatency = elapsedMs;
  if (elapsedMs > maxLatency) maxLatency = elapsedMs;

  if (status) {
    statusCodes[status] = (statusCodes[status] || 0) + 1;
  }

  if (isError) {
    errorCount++;
  } else {
    successCount++;
  }

  recordEndpoint(endpointKey, elapsedMs, isError);
}

async function applyHeaderPlugins(headers) {
  const plugins = [
    ...pluginManager.getPlugins('authProvider'),
    ...pluginManager.getPlugins('headerProvider'),
  ];
  for (const plugin of plugins) {
    try {
      const extra = await plugin.handler();
      if (extra && typeof extra === 'object') {
        Object.assign(headers, extra);
      }
    } catch (err) {
      process.stderr.write(`[Worker] Header plugin error: ${err.message}\n`);
    }
  }
}

async function applyPayloadPlugins(payload) {
  let merged = payload;
  const plugins = pluginManager.getPlugins('payloadGenerator');
  for (const plugin of plugins) {
    try {
      const generated = await plugin.handler();
      if (generated !== undefined && generated !== null) {
        if (merged && typeof merged === 'object' && typeof generated === 'object') {
          merged = { ...merged, ...generated };
        } else if (merged === null || merged === undefined) {
          merged = generated;
        }
      }
    } catch (err) {
      process.stderr.write(`[Worker] Payload plugin error: ${err.message}\n`);
    }
  }
  return merged;
}

async function applyRequestInterceptors(context) {
  let ctx = { ...context };
  const plugins = pluginManager.getPlugins('requestInterceptor');
  for (const plugin of plugins) {
    try {
      const result = await plugin.handler(ctx);
      if (result && typeof result === 'object') {
        ctx = { ...ctx, ...result };
      }
    } catch (err) {
      process.stderr.write(`[Worker] Request interceptor error: ${err.message}\n`);
    }
  }
  return ctx;
}

async function applyMetricsPlugins(data) {
  const plugins = pluginManager.getPlugins('metricsCollector');
  for (const plugin of plugins) {
    try {
      await plugin.handler(data);
    } catch (err) {
      process.stderr.write(`[Worker] Metrics plugin error: ${err.message}\n`);
    }
  }
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

  await applyHeaderPlugins(headers);

  let payload = route.payload ?? null;
  if (payload == null && datasetLoader) {
    payload = datasetLoader.getRecord(datasetIndex++);
  }
  payload = await applyPayloadPlugins(payload);

  let body = null;
  if (payload != null && method !== 'GET' && method !== 'HEAD') {
    const resolved = resolvePayload(payload);
    body = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  }

  const context = await applyRequestInterceptors({
    url,
    method,
    headers,
    body,
    route,
  });

  const targetUrl = context.url || url;
  const targetMethod = (context.method || method).toUpperCase();
  const targetHeaders = context.headers || headers;
  const targetBody = context.body ?? body;

  const startNs = process.hrtime.bigint();
  let isError = false;
  let status = 0;

  try {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      try {
        parsed = new URL(targetUrl, config.baseUrl || config.url);
      } catch (err) {
        throw new Error(
          `Failed to resolve URL "${targetUrl}" with base "${config.baseUrl || config.url}": ${err.message}`,
        );
      }
    }
    const engine = getEngine(parsed.origin);
    const res = await engine.request({
      method: targetMethod,
      path: `${parsed.pathname}${parsed.search}`,
      headers: targetHeaders,
      body: targetBody,
    });

    status = res.statusCode;

    if (status >= 400) {
      isError = true;
    }
  } catch {
    isError = true;
  }

  const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;

  const endpointKey = resolveEndpointKey(targetMethod, targetUrl, route);
  recordRequestMetrics({ endpointKey, elapsedMs, isError, status });
  await applyMetricsPlugins({
    responseTime: elapsedMs,
    statusCode: status,
    isError,
    route,
    url: targetUrl,
    method: targetMethod,
  });
}

async function executeScenario(task) {
  const steps = task.steps || [];
  for (const step of steps) {
    await executeRequest({ route: step });
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
    minLatency = Infinity;
    maxLatency = -Infinity;
    // Keep the reservoir across batches for better sampling
    Object.keys(statusCodes).forEach((k) => { statusCodes[k] = 0; });
    Object.keys(perEndpoint).forEach((k) => { delete perEndpoint[k]; });

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
    await Promise.all(tasks.map((task) => {
      if (Array.isArray(task.steps)) {
        return executeScenario(task);
      }
      return executeRequest(task);
    }));

    // Report metrics back to the main thread
    parentPort.postMessage({
      type: 'result',
      metrics: {
        totalRequests,
        successCount,
        errorCount,
        totalResponseTime,
        responseTimes: [...reservoir],
        minLatency: minLatency === Infinity ? 0 : minLatency,
        maxLatency: maxLatency === -Infinity ? 0 : maxLatency,
        statusCodes: { ...statusCodes },
        perEndpoint: Object.fromEntries(
          Object.entries(perEndpoint).map(([key, metrics]) => [
            key,
            {
              ...metrics,
              minLatency: metrics.minLatency === Infinity ? 0 : metrics.minLatency,
              maxLatency: metrics.maxLatency === -Infinity ? 0 : metrics.maxLatency,
            },
          ]),
        ),
      },
    });
  }

  if (msg.type === 'stop') {
    process.exit(0);
  }
});
