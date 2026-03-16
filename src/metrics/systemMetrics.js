/**
 * System metrics collector.
 * Captures periodic CPU, memory, and network snapshots.
 */
import { cpus, networkInterfaces } from 'node:os';

export class SystemMetrics {
  constructor() {
    this._history = [];
    this._interval = null;
    this._prevCpu = null;
    this._prevNet = null;
  }

  snapshot() {
    const mem = process.memoryUsage();
    const cpuPercent = this._getCpuPercent();
    const net = this._getNetworkBytes();

    let networkRx = 0;
    let networkTx = 0;
    if (this._prevNet) {
      networkRx = Math.max(0, net.rx - this._prevNet.rx);
      networkTx = Math.max(0, net.tx - this._prevNet.tx);
    }
    this._prevNet = net;

    return {
      cpuPercent,
      memoryMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(1),
      rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
      networkRx,
      networkTx,
    };
  }

  startMonitoring(intervalMs = 1000) {
    this.stopMonitoring();
    // Take an initial snapshot to prime CPU/network baselines
    this._initBaselines();
    this._interval = setInterval(() => {
      this._history.push({ ...this.snapshot(), timestamp: Date.now() });
    }, intervalMs);
    // Prevent the interval from keeping the process alive
    if (this._interval.unref) this._interval.unref();
  }

  stopMonitoring() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  getHistory() {
    return [...this._history];
  }

  _initBaselines() {
    this._prevCpu = this._getCpuTimes();
    this._prevNet = this._getNetworkBytes();
  }

  _getCpuTimes() {
    const cpuArray = cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpuArray) {
      const { user, nice, sys, idle: i, irq } = cpu.times;
      const sum = user + nice + sys + i + irq;
      total += sum;
      idle += i;
    }
    return { idle, total };
  }

  _getCpuPercent() {
    const current = this._getCpuTimes();
    if (!this._prevCpu) {
      this._prevCpu = current;
      // First call — return instantaneous estimate
      return +((1 - current.idle / current.total) * 100).toFixed(1);
    }
    const idleDiff = current.idle - this._prevCpu.idle;
    const totalDiff = current.total - this._prevCpu.total;
    this._prevCpu = current;
    if (totalDiff === 0) return 0;
    return +((1 - idleDiff / totalDiff) * 100).toFixed(1);
  }

  /**
   * Get current network byte counters.
   * Note: Node.js os.networkInterfaces() does not expose rx/tx byte counters
   * in most environments, so this will typically return 0. The method is
   * included for forward compatibility with environments that do expose them.
   */
  _getNetworkBytes() {
    const ifaces = networkInterfaces();
    let rx = 0;
    let tx = 0;
    for (const addrs of Object.values(ifaces)) {
      for (const addr of addrs) {
        // Node's networkInterfaces doesn't expose byte counters directly,
        // so we track what's available. In environments without counters,
        // return 0.
        if (addr.internal) continue;
        // Node >=18.8.0 does not expose rx/tx bytes on networkInterfaces
        // We include them if available
        rx += addr.rx_bytes || 0;
        tx += addr.tx_bytes || 0;
      }
    }
    return { rx, tx };
  }
}
