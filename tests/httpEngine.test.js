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
});
