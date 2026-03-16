/**
 * Real-time CLI dashboard for stress test monitoring.
 * Uses cli-table3 for table formatting and ANSI escape codes for display.
 */
import Table from 'cli-table3';

const CLEAR_SCREEN = '\x1b[2J\x1b[H';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const MAX_HISTORY = 60;
const BAR_CHART_WIDTH = 30;

export class CliDashboard {
  constructor() {
    this.metrics = {
      activeUsers: 0,
      requestsPerSec: 0,
      avgLatency: 0,
      errorRate: 0,
      cpuPercent: 0,
      memoryMB: 0,
      totalRequests: 0,
      p95: 0,
      p99: 0,
      perEndpoint: {},
    };
    this.rpsHistory = [];
    this.startTime = null;
    this.intervalId = null;
  }

  update(metrics) {
    this.metrics = { ...this.metrics, ...metrics };
    this.rpsHistory.push(this.metrics.requestsPerSec || 0);
    if (this.rpsHistory.length > MAX_HISTORY) {
      this.rpsHistory.shift();
    }
  }

  start() {
    this.startTime = Date.now();
    this.intervalId = setInterval(() => this._render(), 1000);
    this._render();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._render();
    process.stdout.write(`\n${BOLD}${GREEN}Dashboard stopped. Final state shown above.${RESET}\n`);
  }

  _render() {
    const m = this.metrics;
    const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;

    const table = new Table({
      head: [`${CYAN}Metric${RESET}`, `${CYAN}Value${RESET}`],
      colWidths: [22, 24],
      style: { head: [], border: [] },
    });

    table.push(
      ['Active Users', `${BOLD}${m.activeUsers}${RESET}`],
      ['Requests/sec', `${BOLD}${colorByThreshold(m.requestsPerSec, 100, 10)}${RESET}`],
      ['Avg Latency', `${formatLatency(m.avgLatency)}ms`],
      ['P95 Latency', `${formatLatency(m.p95)}ms`],
      ['P99 Latency', `${formatLatency(m.p99)}ms`],
      ['Error Rate', `${colorErrorRate(m.errorRate)}%`],
      ['CPU Usage', `${colorCpu(m.cpuPercent)}%`],
      ['Memory', `${m.memoryMB}MB`],
    );

    let output = CLEAR_SCREEN;
    output += `${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}\n`;
    output += `${BOLD}  Express API Stress Tester v2 - Live Dashboard${RESET}\n`;
    output += `${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}\n`;
    output += `${DIM}  Elapsed: ${elapsed}s${RESET}\n\n`;
    output += table.toString() + '\n\n';
    output += this._renderEndpointTable();
    output += this._renderBarChart();
    output += `\n  ${BOLD}Total Requests:${RESET} ${m.totalRequests}\n`;

    process.stdout.write(output);
  }

  _renderBarChart() {
    const history = this.rpsHistory.slice(-BAR_CHART_WIDTH);
    if (history.length === 0) return '';

    const maxRps = Math.max(...history, 1);
    const chartHeight = 8;
    let chart = `  ${DIM}RPS History (last ${history.length}s)${RESET}\n`;

    for (let row = chartHeight; row >= 1; row--) {
      const threshold = (row / chartHeight) * maxRps;
      const label = row === chartHeight ? String(Math.round(maxRps)).padStart(6) : '      ';
      let line = `  ${DIM}${label}${RESET} │`;
      for (const rps of history) {
        line += rps >= threshold ? `${GREEN}█${RESET}` : ' ';
      }
      chart += line + '\n';
    }

    chart += `  ${DIM}     0${RESET} └${'─'.repeat(history.length)}\n`;
    return chart;
  }

  _renderEndpointTable() {
    const endpoints = this.metrics.perEndpoint || {};
    const entries = Object.entries(endpoints);
    if (entries.length === 0) return '';

    const table = new Table({
      head: [
        `${CYAN}Endpoint${RESET}`,
        `${CYAN}RPS${RESET}`,
        `${CYAN}Avg Lat${RESET}`,
        `${CYAN}Errors${RESET}`,
      ],
      colWidths: [30, 8, 12, 10],
      style: { head: [], border: [] },
    });

    const sorted = entries.sort(
      (a, b) => (b[1].requestsPerSec || 0) - (a[1].requestsPerSec || 0),
    );

    for (const [endpoint, metrics] of sorted.slice(0, 10)) {
      table.push([
        endpoint,
        metrics.requestsPerSec || 0,
        `${metrics.avgResponseTime || 0}ms`,
        `${metrics.errorRate || 0}%`,
      ]);
    }

    return `${BOLD}${CYAN}Per-Endpoint Metrics${RESET}\n${table.toString()}\n\n`;
  }
}

function formatLatency(val) {
  const n = Number(val) || 0;
  if (n < 100) return `${GREEN}${n}${RESET}`;
  if (n < 500) return `${YELLOW}${n}${RESET}`;
  return `${RED}${n}${RESET}`;
}

function colorErrorRate(rate) {
  const n = Number(rate) || 0;
  if (n < 1) return `${GREEN}${n}`;
  if (n < 5) return `${YELLOW}${n}`;
  return `${RED}${n}`;
}

function colorCpu(cpu) {
  const n = Number(cpu) || 0;
  if (n < 50) return `${GREEN}${n}`;
  if (n < 80) return `${YELLOW}${n}`;
  return `${RED}${n}`;
}

function colorByThreshold(val, good, bad) {
  const n = Number(val) || 0;
  if (n >= good) return `${GREEN}${n}`;
  if (n >= bad) return `${YELLOW}${n}`;
  return `${RED}${n}`;
}
