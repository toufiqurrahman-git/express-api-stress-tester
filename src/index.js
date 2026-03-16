/**
 * api-stress-tester – public API
 *
 * Usage:
 *   import { stressTest } from 'api-stress-tester';
 *   const result = await stressTest({ url: '...', concurrency: 5000, duration: 30 });
 */
export { runStressTest as stressTest } from './runner.js';
export { parsePayload, getPayload } from './payloadParser.js';
export { generators, resolveValue } from './dynamicGenerators.js';
export { MetricsCollector } from './metrics.js';
