/**
 * Tests for the HttpEngine (undici connection pooling).
 */
import { HttpEngine } from '../src/core/httpEngine.js';

describe('HttpEngine', () => {
  test('constructor requires baseUrl', () => {
    expect(() => new HttpEngine()).toThrow('HttpEngine requires a baseUrl');
    expect(() => new HttpEngine({})).toThrow('HttpEngine requires a baseUrl');
  });

  test('constructor creates pool with options', () => {
    const engine = new HttpEngine({
      baseUrl: 'http://localhost:9999',
      connections: 50,
      pipelining: 5,
      timeout: 10_000,
      headers: { Authorization: 'Bearer token' },
    });

    expect(engine.baseUrl).toBe('http://localhost:9999');
    expect(engine.defaultHeaders).toEqual({ Authorization: 'Bearer token' });
    expect(engine.timeout).toBe(10_000);
    expect(engine.pool).toBeDefined();

    // Clean up
    engine.pool.close();
  });

  test('constructor uses defaults for missing options', () => {
    const engine = new HttpEngine({ baseUrl: 'http://localhost:9999' });
    expect(engine.timeout).toBe(30_000);
    expect(engine.defaultHeaders).toEqual({});

    engine.pool.close();
  });

  test('close() does not throw', async () => {
    const engine = new HttpEngine({ baseUrl: 'http://localhost:9999' });
    await expect(engine.close()).resolves.not.toThrow();
  });

  test('request strips newline characters from headers', async () => {
    const engine = new HttpEngine({
      baseUrl: 'http://localhost:9999',
      headers: { 'Authorization\r\n': 'Bearer token\r\n' },
    });
    let capturedHeaders;
    engine.pool.request = async (opts) => {
      capturedHeaders = opts.headers;
      return {
        statusCode: 200,
        headers: {},
        body: { text: async () => '' },
      };
    };

    await engine.request({
      headers: {
        'X-Test': 'line1\nline2',
        'X-Multi': ['one\r', 'two\nthree', 'null\0value'],
        'X-Null\0Key': 'value\0here',
      },
    });

    expect(capturedHeaders).toEqual({
      Authorization: 'Bearer token',
      'X-Test': 'line1line2',
      'X-Multi': ['one', 'twothree', 'nullvalue'],
      'X-NullKey': 'valuehere',
    });

    await engine.close();
  });
});
