/**
 * Express route analyzer and integrated test runner.
 */
import { runStressTest } from '../core/runner.js';

/**
 * Analyze an Express app and return its registered routes.
 * @param {object} app - Express application instance
 * @returns {Array<{ path: string, method: string, middlewareCount: number }>}
 */
export function analyzeExpressApp(app) {
  const routes = [];

  if (!app || !app._router || !app._router.stack) {
    return routes;
  }

  for (const layer of app._router.stack) {
    if (layer.route) {
      // Direct route on the app
      const routePath = layer.route.path;
      const methods = Object.keys(layer.route.methods);
      for (const method of methods) {
        routes.push({
          path: routePath,
          method: method.toUpperCase(),
          middlewareCount: layer.route.stack ? layer.route.stack.length : 0,
        });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Nested router
      const prefix = extractPrefix(layer);
      for (const nestedLayer of layer.handle.stack) {
        if (nestedLayer.route) {
          const routePath = nestedLayer.route.path;
          const fullPath = normalizePath(prefix + routePath);
          const methods = Object.keys(nestedLayer.route.methods);
          for (const method of methods) {
            routes.push({
              path: fullPath,
              method: method.toUpperCase(),
              middlewareCount: nestedLayer.route.stack ? nestedLayer.route.stack.length : 0,
            });
          }
        }
      }
    }
  }

  return routes;
}

/**
 * Start an Express app on a random port, stress test it, then close.
 * @param {object} app - Express application instance
 * @param {object} [options] - Stress test options
 * @returns {Promise<object>} Test results summary
 */
export async function testExpressApp(app, options = {}) {
  const routes = analyzeExpressApp(app);

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(0, () => resolve(srv));
    srv.on('error', reject);
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const config = {
      url: baseUrl,
      concurrency: options.concurrency || 10,
      duration: options.duration || 5,
      method: options.method || 'GET',
      ...options,
      // Build route configs from analyzed routes if none provided
      ...(routes.length > 0 && !options.routes && !options.url
        ? {
            routes: routes.map((r) => ({
              path: r.path,
              method: r.method,
              ...(options.headers ? { headers: options.headers } : {}),
            })),
          }
        : {}),
    };

    // Ensure baseUrl is set for route-based configs
    if (config.routes) {
      config.baseUrl = baseUrl;
    }

    const summary = await runStressTest(config, {
      reportPath: options.reportPath || 'stress-test-report.txt',
      reportFormat: options.reportFormat || 'txt',
    });

    return { routes, summary };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function extractPrefix(layer) {
  if (layer.keys && layer.keys.length === 0 && layer.regexp) {
    const match = layer.regexp.source.match(/^\^\\(\/[^?]*)/);
    if (match) {
      return match[1].replace(/\\\//g, '/');
    }
  }
  // Express 4.x stores path in layer.path for mounted routers
  if (layer.path) {
    return layer.path;
  }
  return '';
}

function normalizePath(path) {
  return ('/' + path).replace(/\/+/g, '/');
}
