/**
 * High-performance HTTP engine using undici connection pooling.
 *
 * Provides keep-alive, pipelining, and precise response-time tracking
 * via process.hrtime.bigint().
 */
async function ensureWebStreamsGlobals() {
  if (typeof globalThis.ReadableStream !== 'undefined') return;
  try {
    const web = await import('node:stream/web');
    if (web.ReadableStream && typeof globalThis.ReadableStream === 'undefined') {
      globalThis.ReadableStream = web.ReadableStream;
    }
    if (web.WritableStream && typeof globalThis.WritableStream === 'undefined') {
      globalThis.WritableStream = web.WritableStream;
    }
    if (web.TransformStream && typeof globalThis.TransformStream === 'undefined') {
      globalThis.TransformStream = web.TransformStream;
    }
  } catch {
    // ignore
  }
}

let cachedUndici = null;
async function getUndici() {
  if (cachedUndici) return cachedUndici;
  await ensureWebStreamsGlobals();
  cachedUndici = await import('undici');
  return cachedUndici;
}

const CONTROL_CHARS_REGEX = /[\0\r\n]/g;
const MAX_WARNED_HEADER_VALUES = 100;

export class HttpEngine {
  /**
   * @param {object} options
   * @param {string} options.baseUrl      - Base URL (origin) for the pool
   * @param {number} [options.connections] - Max concurrent sockets (default 100)
   * @param {number} [options.pipelining]  - Requests pipelined per socket (default 10)
   * @param {number} [options.timeout]     - Request timeout in ms (default 30 000)
   * @param {object} [options.headers]     - Default headers sent with every request
   */
  constructor(options = {}) {
    const {
      baseUrl,
      connections = 100,
      pipelining = 10,
      timeout = 30_000,
      headers = {},
    } = options;

    if (!baseUrl) {
      throw new Error('HttpEngine requires a baseUrl');
    }

    this.baseUrl = baseUrl;
    this.defaultHeaders = headers;
    this.timeout = timeout;
    this.invalidHeaderWarningCache = { map: new Map(), queue: [] };

    this.pool = null;
    this.poolPromise = null;
    this.poolOptions = {
      connections,
      pipelining,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      headersTimeout: timeout,
      bodyTimeout: timeout,
    };
  }

  async ensurePool() {
    if (this.pool) return this.pool;
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const { Pool } = await getUndici();
        this.pool = new Pool(this.baseUrl, this.poolOptions);
        return this.pool;
      })();
    }
    return this.poolPromise;
  }

  /**
   * Execute an HTTP request through the pool.
   *
   * @param {object} opts
   * @param {string} [opts.method]  - HTTP method (default GET)
   * @param {string} [opts.path]    - Request path (default /)
   * @param {object} [opts.headers] - Per-request headers (merged with defaults)
   * @param {string|Buffer|null} [opts.body] - Request body
   * @returns {Promise<{ statusCode: number, headers: object, body: string, responseTime: number }>}
   */
  async request({ method = 'GET', path = '/', headers = {}, body = null } = {}) {
    const pool = await this.ensurePool();
    const mergedHeaders = normalizeHeaders(
      { ...this.defaultHeaders, ...headers },
      this.invalidHeaderWarningCache,
    );

    const start = process.hrtime.bigint();

    const { statusCode, headers: resHeaders, body: resBody } = await pool.request({
      method: method.toUpperCase(),
      path,
      headers: mergedHeaders,
      body,
      headersTimeout: this.timeout,
      bodyTimeout: this.timeout,
    });

    // Consume the body fully (undici requirement to free the socket)
    // Drain via async iteration to avoid depending on Web Streams globals.
    if (resBody) {
      try {
        for await (const _chunk of resBody) {
          // discard
        }
      } catch {
        // ignore body drain errors
      }
    }

    const end = process.hrtime.bigint();
    // Convert nanoseconds → milliseconds (floating point)
    const responseTime = Number(end - start) / 1e6;

    return {
      statusCode,
      headers: resHeaders,
      body: '',
      responseTime,
    };
  }

  /**
   * Gracefully close the connection pool.
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      return;
    }
    if (this.poolPromise) {
      const pool = await this.poolPromise;
      if (pool && typeof pool.close === 'function') {
        await pool.close();
      }
    }
  }
}

function normalizeHeaders(headers, warningCache) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedKey === null) {
      continue;
    }
    if (Array.isArray(value)) {
      const cleaned = [];
      for (const entry of value) {
        if (entry === undefined || entry === null) {
          continue;
        }
        if (isValidHeaderValue(entry)) {
          const cleanedEntry = normalizeHeaderValue(entry);
          if (cleanedEntry !== null) {
            cleaned.push(cleanedEntry);
          }
        } else {
          warnInvalidHeaderValue(normalizedKey, entry, warningCache);
        }
      }
      if (cleaned.length > 0) {
        normalized[normalizedKey] = cleaned;
      }
      continue;
    }

    if (!isValidHeaderValue(value)) {
      warnInvalidHeaderValue(normalizedKey, value, warningCache);
      continue;
    }

    const cleanedValue = normalizeHeaderValue(value);
    if (cleanedValue === null) {
      continue;
    }
    normalized[normalizedKey] = cleanedValue;
  }
  return normalized;
}

function normalizeHeaderKey(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.replace(CONTROL_CHARS_REGEX, '');
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeHeaderValue(value) {
  if (typeof value === 'string') {
    const cleaned = value.replace(CONTROL_CHARS_REGEX, '');
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function isValidHeaderValue(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function warnInvalidHeaderValue(key, value, warningCache) {
  const type = typeof value;
  const safeKey = key;
  const signature = `${safeKey}::${type}`;
  if (warningCache.map.has(signature)) {
    return;
  }
  warningCache.map.set(signature, true);
  warningCache.queue.push(signature);
  if (warningCache.queue.length > MAX_WARNED_HEADER_VALUES) {
    const oldest = warningCache.queue.shift();
    if (oldest) {
      warningCache.map.delete(oldest);
    }
  }
  process.stderr.write(
    `[HttpEngine] Dropping header "${safeKey}" with unsupported value type "${type}".\n`,
  );
}
