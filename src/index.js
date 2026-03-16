/**
 * express-api-stress-tester v2 – public API
 *
 * Usage:
 *   import { stressTest } from 'express-api-stress-tester';
 *   const result = await stressTest({ url: '...', concurrency: 5000, duration: 30 });
 */

// Core
export { runStressTest } from './core/runner.js';
export { runStressTest as stressTest } from './core/runner.js';
export { HttpEngine } from './core/httpEngine.js';
export { Scheduler } from './core/scheduler.js';
export { WorkerManager } from './core/workerManager.js';
export { MasterNode, WorkerNode } from './core/distributedCoordinator.js';

// Payload (backward compat + v2)
export { parsePayload, getPayload } from './payloadParser.js';
export { generators, resolveValue } from './payload/dynamicGenerator.js';
export { DatasetLoader } from './payload/datasetLoader.js';

// Metrics
export { MetricsCollector } from './metrics/metricsCollector.js';
export { ApiMetrics } from './metrics/apiMetrics.js';
export { SystemMetrics } from './metrics/systemMetrics.js';

// Reporting
export { ReportWriter, writeReport, log } from './reporting/reportWriter.js';

// Dashboard
export { CliDashboard } from './dashboard/cliDashboard.js';

// Plugins
export { PluginManager, createPlugin } from './plugins/pluginManager.js';

// Express integration
export { analyzeExpressApp, testExpressApp } from './express/routeAnalyzer.js';
