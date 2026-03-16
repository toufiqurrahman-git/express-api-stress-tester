/**
 * Tests for the Scheduler class (route scheduling with weighted traffic).
 */
import { Scheduler } from '../src/core/scheduler.js';

describe('Scheduler', () => {
  test('constructor with single URL config produces 1 route', () => {
    const s = new Scheduler({ url: 'http://localhost:3000/api/users', method: 'GET' });
    expect(s.routes).toHaveLength(1);
    expect(s.routes[0].path).toBe('/api/users');
    expect(s.routes[0].method).toBe('GET');
  });

  test('constructor parses path from absolute URL correctly', () => {
    const s = new Scheduler({ url: 'http://example.com/api/v2/items?limit=10' });
    expect(s.routes[0].path).toBe('/api/v2/items?limit=10');
  });

  test('constructor with relative URL uses it as-is', () => {
    const s = new Scheduler({ url: '/health' });
    expect(s.routes[0].path).toBe('/health');
  });

  test('constructor defaults method to GET and payload to null', () => {
    const s = new Scheduler({ url: '/test' });
    expect(s.routes[0].method).toBe('GET');
    expect(s.routes[0].payload).toBeNull();
    expect(s.routes[0].headers).toEqual({});
  });

  test('constructor with multi-route config produces correct routes', () => {
    const s = new Scheduler({
      routes: [
        { path: '/api/a', method: 'GET' },
        { path: '/api/b', method: 'POST', payload: { x: 1 } },
        { path: '/api/c', method: 'put', headers: { 'X-Custom': 'yes' } },
      ],
    });
    expect(s.routes).toHaveLength(3);
    expect(s.routes[0]).toEqual({ path: '/api/a', method: 'GET', headers: {}, payload: null });
    expect(s.routes[1]).toEqual({ path: '/api/b', method: 'POST', headers: {}, payload: { x: 1 } });
    expect(s.routes[2].method).toBe('PUT');
    expect(s.routes[2].headers).toEqual({ 'X-Custom': 'yes' });
  });

  test('multi-route supports url alias for path', () => {
    const s = new Scheduler({ routes: [{ url: '/legacy', method: 'GET' }] });
    expect(s.routes[0].path).toBe('/legacy');
  });

  test('getNextRoute() returns routes in round-robin when no weights', () => {
    const s = new Scheduler({
      routes: [
        { path: '/a', method: 'GET' },
        { path: '/b', method: 'GET' },
        { path: '/c', method: 'GET' },
      ],
    });

    expect(s.getNextRoute().path).toBe('/a');
    expect(s.getNextRoute().path).toBe('/b');
    expect(s.getNextRoute().path).toBe('/c');
    // wraps around
    expect(s.getNextRoute().path).toBe('/a');
    expect(s.getNextRoute().path).toBe('/b');
  });

  test('getNextRoute() with trafficDistribution returns weighted results', () => {
    const s = new Scheduler({
      routes: [
        { path: '/heavy', method: 'GET' },
        { path: '/light', method: 'GET' },
      ],
      trafficDistribution: [
        { route: '/heavy', weight: 90 },
        { route: '/light', weight: 10 },
      ],
    });

    const counts = { '/heavy': 0, '/light': 0 };
    const iterations = 10_000;
    for (let i = 0; i < iterations; i++) {
      counts[s.getNextRoute().path]++;
    }

    // With 90/10 distribution, /heavy should get ~90% of requests
    const heavyRatio = counts['/heavy'] / iterations;
    expect(heavyRatio).toBeGreaterThan(0.8);
    expect(heavyRatio).toBeLessThan(0.98);
  });

  test('getNextRoute() returns default route when config has no routes', () => {
    const s = new Scheduler({});
    const route = s.getNextRoute();
    expect(route).toEqual({ path: '/', method: 'GET', headers: {}, payload: null });
  });

  test('getScenario() returns a named scenario', () => {
    const s = new Scheduler({
      scenarios: [
        { name: 'login', steps: [{ path: '/auth' }] },
        { name: 'browse', steps: [{ path: '/items' }] },
      ],
    });
    const scenario = s.getScenario('browse');
    expect(scenario).toBeDefined();
    expect(scenario.name).toBe('browse');
    expect(scenario.steps[0].path).toBe('/items');
  });

  test('getScenario() returns undefined for unknown name', () => {
    const s = new Scheduler({ scenarios: [{ name: 'x', steps: [] }] });
    expect(s.getScenario('nope')).toBeUndefined();
  });

  test('getScenarioSteps() returns steps from first scenario', () => {
    const s = new Scheduler({
      scenarios: [
        { name: 'first', steps: [{ path: '/a' }, { path: '/b' }] },
        { name: 'second', steps: [{ path: '/c' }] },
      ],
    });
    const steps = s.getScenarioSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0].path).toBe('/a');
  });

  test('getScenarioSteps() returns empty array when no scenarios', () => {
    const s = new Scheduler({});
    expect(s.getScenarioSteps()).toEqual([]);
  });

  test('handles empty config gracefully', () => {
    const s = new Scheduler({});
    expect(s.routes).toEqual([]);
    expect(s.scenarios).toEqual([]);
    expect(s.weights).toBeNull();
  });

  test('trafficDistribution ignores unknown routes', () => {
    const s = new Scheduler({
      routes: [{ path: '/known', method: 'GET' }],
      trafficDistribution: [
        { route: '/known', weight: 50 },
        { route: '/unknown', weight: 50 },
      ],
    });
    // Should still work — only /known is valid
    for (let i = 0; i < 20; i++) {
      expect(s.getNextRoute().path).toBe('/known');
    }
  });
});
