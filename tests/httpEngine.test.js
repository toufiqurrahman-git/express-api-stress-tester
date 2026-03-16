/**
 * Tests for the HttpEngine (undici connection pooling).
 */
import { jest } from '@jest/globals';
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
    expect(engine.pool).toBeNull();
    expect(engine.poolOptions).toMatchObject({
      connections: 50,
      pipelining: 5,
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });
  });

  test('constructor uses defaults for missing options', () => {
    const engine = new HttpEngine({ baseUrl: 'http://localhost:9999' });
    expect(engine.timeout).toBe(30_000);
    expect(engine.defaultHeaders).toEqual({});
    expect(engine.pool).toBeNull();
    expect(engine.poolOptions).toMatchObject({
      connections: 100,
      pipelining: 10,
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    });
  });

  test('close() does not throw', async () => {
    const engine = new HttpEngine({ baseUrl: 'http://localhost:9999' });
    // No pool created yet; close should be a no-op
    await expect(engine.close()).resolves.not.toThrow();
  });

  test('request strips newline characters from headers', async () => {
    const engine = new HttpEngine({
      baseUrl: 'http://localhost:9999',
      headers: { 'Authorization\r\n': 'Bearer token\r\n' },
    });
    let capturedHeaders;
    const pool = {
      request: async (opts) => {
      capturedHeaders = opts.headers;
      return {
        statusCode: 200,
        headers: {},
          body: { async *[Symbol.asyncIterator]() {} },
      };
      },
      close: async () => {},
    };
    engine.ensurePool = async () => pool;

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

  test('warns on unsupported header value types', async () => {
    const engine = new HttpEngine({ baseUrl: 'http://localhost:9999' });
    const pool = {
      request: async () => ({
        statusCode: 200,
        headers: {},
        body: { async *[Symbol.asyncIterator]() {} },
      }),
      close: async () => {},
    };
    engine.ensurePool = async () => pool;
    const writes = [];
    const writeSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((...args) => {
        writes.push(String(args[0]));
        return true;
      });

    try {
      await engine.request({
        headers: { 'X-Invalid': { nested: true } },
      });
    } finally {
      writeSpy.mockRestore();
      await engine.close();
    }

    expect(
      writes.some((msg) => msg.includes('X-Invalid') && msg.includes('object')),
    ).toBe(true);
  });
});
