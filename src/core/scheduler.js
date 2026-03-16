/**
 * Route scheduler with weighted traffic distribution.
 *
 * Supports three configuration modes:
 *   1. Single URL mode   – backwards compatible with v1 config.url
 *   2. Multi-route mode   – config.routes[]
 *   3. Scenario mode      – config.scenarios[]
 *
 * Traffic weights are read from config.trafficDistribution.
 */
export class Scheduler {
  /**
   * @param {object} config - full test configuration
   */
  constructor(config) {
    this.config = config;
    this.routes = this._buildRoutes();
    this.scenarios = config.scenarios || [];
    this.weights = this._buildWeights();
    this.roundRobinIndex = 0;
  }

  // ── Route resolution ───────────────────────────────────────────────

  /**
   * Normalise every configuration shape into a unified routes array.
   * Each entry: { path, method, headers, payload }
   */
  _buildRoutes() {
    const cfg = this.config;

    // Multi-route mode
    if (Array.isArray(cfg.routes) && cfg.routes.length > 0) {
      return cfg.routes.map((r) => ({
        path: r.path || r.url || '/',
        method: (r.method || 'GET').toUpperCase(),
        headers: r.headers || {},
        payload: r.payload ?? r.body ?? null,
      }));
    }

    // Single URL mode (v1 backwards compat)
    if (cfg.url) {
      let parsedPath = '/';
      try {
        const url = new URL(cfg.url);
        parsedPath = url.pathname + url.search;
      } catch {
        // If URL is not absolute (e.g. just a path), use it as-is
        parsedPath = cfg.url;
      }
      return [
        {
          path: parsedPath,
          method: (cfg.method || 'GET').toUpperCase(),
          headers: cfg.headers || {},
          payload: cfg.payload ?? cfg.body ?? null,
        },
      ];
    }

    return [];
  }

  // ── Weight table ───────────────────────────────────────────────────

  /**
   * Build a cumulative-weight table for weighted random selection.
   * Falls back to null if no trafficDistribution is defined.
   */
  _buildWeights() {
    const dist = this.config.trafficDistribution;
    if (!Array.isArray(dist) || dist.length === 0) {
      return null;
    }

    // Map route identifiers → route indices
    const routeIndex = new Map(
      this.routes.map((r, i) => [r.path, i]),
    );

    let cumulative = 0;
    const table = [];
    for (const entry of dist) {
      const idx = routeIndex.get(entry.route);
      if (idx === undefined) continue; // skip unknown routes
      cumulative += entry.weight;
      table.push({ index: idx, cumulative });
    }

    if (table.length === 0) return null;

    // Normalise so cumulative max = 1
    const total = cumulative;
    for (const row of table) {
      row.cumulative /= total;
    }

    return table;
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Return the next route to execute.
   *
   * Uses weighted random selection when trafficDistribution is provided,
   * otherwise falls back to simple round-robin.
   *
   * @returns {object} { path, method, headers, payload }
   */
  getNextRoute() {
    if (this.routes.length === 0) {
      return { path: '/', method: 'GET', headers: {}, payload: null };
    }

    if (this.weights) {
      return this.routes[this._weightedRandom()];
    }

    // Round-robin fallback
    const route = this.routes[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.routes.length;
    return route;
  }

  /**
   * Pick a route index via weighted random selection.
   */
  _weightedRandom() {
    const r = Math.random();
    for (const entry of this.weights) {
      if (r <= entry.cumulative) {
        return entry.index;
      }
    }
    // Fallback (floating-point edge case) – return last entry
    return this.weights[this.weights.length - 1].index;
  }

  /**
   * Get a named scenario.
   * @param {string} name
   * @returns {object|undefined}
   */
  getScenario(name) {
    return this.scenarios.find((s) => s.name === name);
  }

  /**
   * For scenario mode, return the steps array of the first scenario.
   * @returns {Array}
   */
  getScenarioSteps() {
    if (this.scenarios.length === 0) return [];
    return this.scenarios[0].steps || [];
  }
}
