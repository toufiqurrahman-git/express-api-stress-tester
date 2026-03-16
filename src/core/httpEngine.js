/**
 * High-performance HTTP engine using undici connection pooling.
 *
 * Provides keep-alive, pipelining, and precise response-time tracking
 * via process.hrtime.bigint().
 */
import { Pool } from 'undici';

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
    this.warnedHeaderValues = new Set();

    this.pool = new Pool(baseUrl, {
      connections,
      pipelining,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      headersTimeout: timeout,
      bodyTimeout: timeout,
    });
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
    const mergedHeaders = normalizeHeaders(
      { ...this.defaultHeaders, ...headers },
      this.warnedHeaderValues,
    );

    const start = process.hrtime.bigint();

    const { statusCode, headers: resHeaders, body: resBody } = await this.pool.request({
      method: method.toUpperCase(),
      path,
      headers: mergedHeaders,
      body,
      headersTimeout: this.timeout,
      bodyTimeout: this.timeout,
    });

    // Consume the body fully (undici requirement to free the socket)
    const text = await resBody.text();

    const end = process.hrtime.bigint();
    // Convert nanoseconds → milliseconds (floating point)
    const responseTime = Number(end - start) / 1e6;

    return {
      statusCode,
      headers: resHeaders,
      body: text,
      responseTime,
    };
  }

  /**
   * Gracefully close the connection pool.
   */
  async close() {
    await this.pool.close();
  }
}

function normalizeHeaders(headers, warnedHeaderValues) {
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
          warnInvalidHeaderValue(normalizedKey, entry, warnedHeaderValues);
        }
      }
      if (cleaned.length > 0) {
        normalized[normalizedKey] = cleaned;
      }
      continue;
    }

    if (!isValidHeaderValue(value)) {
      warnInvalidHeaderValue(normalizedKey, value, warnedHeaderValues);
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
  const cleaned = value.replace(/[\0\r\n]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeHeaderValue(value) {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[\0\r\n]/g, '');
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

function warnInvalidHeaderValue(key, value, warnedHeaderValues) {
  if (!warnedHeaderValues) {
    return;
  }
  const type = typeof value;
  const safeKey = typeof key === 'string' ? key.replace(/[\0\r\n]/g, '') : 'unknown';
  const signature = `${safeKey}:${type}`;
  if (warnedHeaderValues.has(signature)) {
    return;
  }
  warnedHeaderValues.add(signature);
  process.stderr.write(
    `[HttpEngine] Dropping header "${safeKey}" with unsupported value type "${type}".\n`,
  );
}
