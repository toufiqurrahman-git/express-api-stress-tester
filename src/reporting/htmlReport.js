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
  </div>

  <p class="timestamp">Generated at ${new Date().toISOString()}</p>
</div>
</body>
</html>`;
}
