/**
 * HTML report template generator.
 * Returns a self-contained HTML string with embedded CSS.
 */

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateHtmlReport(config, summary) {
  const passed = summary.result === 'PASSED';
  const badgeColor = passed ? '#22c55e' : '#ef4444';
  const badgeText = passed ? '✓ PASSED' : '✗ FAILED';

  const metricRows = [
    ['Total Requests', summary.totalRequests],
    ['Requests/sec', summary.requestsPerSec],
    ['Avg Response Time', `${summary.avgResponseTime} ms`],
    ...(summary.p95 !== undefined ? [['P95 Latency', `${summary.p95} ms`]] : []),
    ...(summary.p99 !== undefined ? [['P99 Latency', `${summary.p99} ms`]] : []),
    ...(summary.minLatency !== undefined ? [['Min Latency', `${summary.minLatency} ms`]] : []),
    ...(summary.maxLatency !== undefined ? [['Max Latency', `${summary.maxLatency} ms`]] : []),
    ['Error Rate', `${summary.errorRate}%`],
    ['Success Rate', `${summary.successRate}%`],
    ['CPU Usage', `${summary.cpuPercent}%`],
    ['Memory Usage', `${summary.memoryMB} MB`],
    ['Duration', `${summary.elapsedSeconds} s`],
  ];

  const configRows = [
    ['API URL', config.url || 'N/A'],
    ['Method', (config.method || 'GET').toUpperCase()],
    ['Concurrent Users', config.concurrency || 1],
    ...(config.duration ? [['Duration', `${config.duration}s`]] : []),
    ...(config.totalRequests ? [['Total Requests', config.totalRequests]] : []),
  ];

  const perEndpointRows = Object.entries(summary.perEndpoint || {}).map(
    ([endpoint, metrics]) => [
      endpoint,
      metrics.requestsPerSec ?? 0,
      `${metrics.avgResponseTime ?? 0} ms`,
      `${metrics.p95 ?? 0} ms`,
      `${metrics.errorRate ?? 0}%`,
    ],
  );

  const successRate = summary.successRate || 0;
  const errorRate = summary.errorRate || 0;
  const maxLatency = Math.max(summary.p99 || 0, summary.maxLatency || 0, 1);
  const maxRps = Math.max(
    summary.requestsPerSec || 0,
    ...perEndpointRows.map(([, rps]) => Number(rps) || 0),
    1,
  );
  const latencyBars = [
    { label: 'Avg', value: summary.avgResponseTime || 0 },
    { label: 'P95', value: summary.p95 || 0 },
    { label: 'P99', value: summary.p99 || 0 },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Stress Test Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; padding: 2rem; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; color: #fff; font-weight: 600; font-size: 0.875rem; background: ${badgeColor}; margin-bottom: 1.5rem; }
  .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .section h2 { font-size: 1.125rem; margin-bottom: 1rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; }
  th { font-weight: 600; color: #64748b; width: 40%; }
  td { color: #1e293b; font-variant-numeric: tabular-nums; }
  tr:last-child th, tr:last-child td { border-bottom: none; }
  .chart { margin-top: 1rem; }
  .chart h3 { font-size: 1rem; color: #334155; margin: 0.75rem 0; }
  .bar { display: flex; align-items: center; margin-bottom: 0.5rem; gap: 0.5rem; }
  .bar-label { width: 60px; font-size: 0.85rem; color: #64748b; }
  .bar-track { flex: 1; height: 10px; background: #e2e8f0; border-radius: 9999px; overflow: hidden; }
  .bar-fill { height: 100%; background: #38bdf8; }
  .bar-fill.error { background: #f87171; }
  .bar-fill.success { background: #22c55e; }
  .timestamp { color: #94a3b8; font-size: 0.8rem; margin-top: 1rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>API Stress Test Report</h1>
  <span class="badge">${badgeText}</span>

  <div class="section">
    <h2>Test Configuration</h2>
    <table>
${configRows.map(([k, v]) => `      <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
    </table>
  </div>

  <div class="section">
    <h2>Results Summary</h2>
    <table>
${metricRows.map(([k, v]) => `      <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
    </table>
    <div class="chart">
      <h3>Latency Graph</h3>
${latencyBars.map((bar) => `
      <div class="bar">
        <div class="bar-label">${esc(bar.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (bar.value / maxLatency) * 100)}%"></div></div>
      </div>`).join('')}
    </div>
    <div class="chart">
      <h3>Request Rate</h3>
      <div class="bar">
        <div class="bar-label">RPS</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (summary.requestsPerSec / maxRps) * 100)}%"></div></div>
      </div>
    </div>
    <div class="chart">
      <h3>Error Distribution</h3>
      <div class="bar">
        <div class="bar-label">Success</div>
        <div class="bar-track"><div class="bar-fill success" style="width:${Math.min(100, successRate)}%"></div></div>
      </div>
      <div class="bar">
        <div class="bar-label">Error</div>
        <div class="bar-track"><div class="bar-fill error" style="width:${Math.min(100, errorRate)}%"></div></div>
      </div>
    </div>
  </div>

  ${perEndpointRows.length > 0 ? `
  <div class="section">
    <h2>Per-Endpoint Metrics</h2>
    <table>
      <tr><th>Endpoint</th><th>RPS</th><th>Avg Latency</th><th>P95</th><th>Error Rate</th></tr>
${perEndpointRows.map(([endpoint, rps, avg, p95, err]) => `
      <tr><td>${esc(endpoint)}</td><td>${esc(rps)}</td><td>${esc(avg)}</td><td>${esc(p95)}</td><td>${esc(err)}</td></tr>`).join('\n')}
    </table>
  </div>` : ''}

  <p class="timestamp">Generated at ${new Date().toISOString()}</p>
</div>
</body>
</html>`;
}
