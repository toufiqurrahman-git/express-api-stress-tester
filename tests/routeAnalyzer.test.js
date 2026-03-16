/**
 * Tests for the route analyzer (Express app analysis).
 */
import { analyzeExpressApp } from '../src/express/routeAnalyzer.js';

describe('analyzeExpressApp', () => {
  test('returns empty array with no argument', () => {
    expect(analyzeExpressApp(null)).toEqual([]);
    expect(analyzeExpressApp(undefined)).toEqual([]);
  });

  test('returns empty array with no _router', () => {
    expect(analyzeExpressApp({})).toEqual([]);
    expect(analyzeExpressApp({ _router: null })).toEqual([]);
  });

  test('returns empty array with empty stack', () => {
    expect(analyzeExpressApp({ _router: { stack: [] } })).toEqual([]);
  });

  test('analyzes direct routes on mock Express app', () => {
    const mockApp = {
      _router: {
        stack: [
          {
            route: {
              path: '/api/users',
              methods: { get: true },
              stack: [{ handle: () => {} }],
            },
          },
          {
            route: {
              path: '/api/items',
              methods: { post: true, put: true },
              stack: [{ handle: () => {} }, { handle: () => {} }],
            },
          },
        ],
      },
    };

    const routes = analyzeExpressApp(mockApp);
    expect(routes).toHaveLength(3);

    expect(routes[0]).toEqual({ path: '/api/users', method: 'GET', middlewareCount: 1 });
    expect(routes[1]).toEqual({ path: '/api/items', method: 'POST', middlewareCount: 2 });
    expect(routes[2]).toEqual({ path: '/api/items', method: 'PUT', middlewareCount: 2 });
  });

  test('analyzes nested router', () => {
    const mockApp = {
      _router: {
        stack: [
          {
            name: 'router',
            path: '/api',
            handle: {
              stack: [
                {
                  route: {
                    path: '/health',
                    methods: { get: true },
                    stack: [{ handle: () => {} }],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const routes = analyzeExpressApp(mockApp);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/api/health');
    expect(routes[0].method).toBe('GET');
  });

  test('skips non-route layers', () => {
    const mockApp = {
      _router: {
        stack: [
          { name: 'query', handle: () => {} },
          { name: 'expressInit', handle: () => {} },
          {
            route: {
              path: '/only',
              methods: { get: true },
              stack: [],
            },
          },
        ],
      },
    };

    const routes = analyzeExpressApp(mockApp);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/only');
  });

  test('handles route with no stack property', () => {
    const mockApp = {
      _router: {
        stack: [
          {
            route: {
              path: '/no-stack',
              methods: { delete: true },
            },
          },
        ],
      },
    };

    const routes = analyzeExpressApp(mockApp);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({ path: '/no-stack', method: 'DELETE', middlewareCount: 0 });
  });
});
