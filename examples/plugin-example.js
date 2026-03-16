/**
 * Plugin system example for express-api-stress-tester v2
 *
 * Demonstrates how to create and register custom plugins.
 *
 * Run: node examples/plugin-example.js
 */

import { PluginManager, createPlugin } from 'express-api-stress-tester';

// --- Auth Provider Plugin ---
// Injects authentication headers into every request
const authPlugin = createPlugin(
  'myAuth',
  'authProvider',
  () => ({
    Authorization: 'Bearer token123',
    'X-API-Key': 'my-secret-key',
  })
);

// --- Custom Header Provider Plugin ---
// Adds custom tracking headers
const headerPlugin = createPlugin(
  'requestTracker',
  'headerProvider',
  () => ({
    'X-Request-ID': crypto.randomUUID(),
    'X-Client-Version': '2.0.0',
  })
);

// --- Payload Generator Plugin ---
// Generates custom payloads dynamically
const payloadPlugin = createPlugin(
  'customPayload',
  'payloadGenerator',
  () => ({
    timestamp: Date.now(),
    randomValue: Math.random(),
    source: 'stress-test',
  })
);

// --- Request Interceptor Plugin ---
// Logs or modifies requests before they are sent
const interceptorPlugin = createPlugin(
  'requestLogger',
  'requestInterceptor',
  (context) => {
    console.log(`[Interceptor] ${context.method} ${context.url}`);
    return context;
  }
);

// --- Metrics Collector Plugin ---
// Collect custom metrics during the test
const metricsPlugin = createPlugin(
  'customMetrics',
  'metricsCollector',
  (data) => {
    if (data.responseTime > 500) {
      console.log(`[Slow Request] ${data.responseTime}ms`);
    }
  }
);

// --- Register and use plugins ---
const pm = new PluginManager();

pm.registerPlugin(authPlugin);
pm.registerPlugin(headerPlugin);
pm.registerPlugin(payloadPlugin);
pm.registerPlugin(interceptorPlugin);
pm.registerPlugin(metricsPlugin);

// Check registered plugins
console.log('Has authProvider:        ', pm.has('authProvider'));
console.log('Has headerProvider:      ', pm.has('headerProvider'));
console.log('Has payloadGenerator:    ', pm.has('payloadGenerator'));
console.log('Has requestInterceptor:  ', pm.has('requestInterceptor'));
console.log('Has metricsCollector:    ', pm.has('metricsCollector'));

// Retrieve plugins by type
const authPlugins = pm.getPlugins('authProvider');
console.log('\nAuth plugins registered:', authPlugins.length);

// Execute plugin hooks
console.log('\n--- Executing authProvider hook ---');
const authHeaders = authPlugins[0].handler();
console.log('Auth headers:', authHeaders);

console.log('\n--- Executing payloadGenerator hook ---');
const payloadPlugins = pm.getPlugins('payloadGenerator');
const payload = payloadPlugins[0].handler();
console.log('Generated payload:', payload);

console.log('\nPlugin system demo complete!');
