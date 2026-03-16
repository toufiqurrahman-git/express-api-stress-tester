/**
 * Plugin system for extending stress tester functionality.
 */

const VALID_TYPES = new Set([
  'payloadGenerator',
  'authProvider',
  'headerProvider',
  'metricsCollector',
  'requestInterceptor',
]);

export class PluginManager {
  constructor() {
    this._plugins = new Map();
    for (const type of VALID_TYPES) {
      this._plugins.set(type, []);
    }
  }

  /**
   * Register a plugin. Plugin shape: { name, type, handler, [hooks] }
   */
  registerPlugin(plugin) {
    if (!plugin || !plugin.name || !plugin.type || !plugin.handler) {
      throw new Error('Plugin must have name, type, and handler properties');
    }
    if (!VALID_TYPES.has(plugin.type)) {
      throw new Error(
        `Invalid plugin type "${plugin.type}". Valid types: ${[...VALID_TYPES].join(', ')}`,
      );
    }
    this._plugins.get(plugin.type).push(plugin);
  }

  /**
   * Get all plugins of a given type.
   */
  getPlugins(type) {
    return this._plugins.get(type) || [];
  }

  /**
   * Check if any plugin of this type is registered.
   */
  has(type) {
    const plugins = this._plugins.get(type);
    return plugins != null && plugins.length > 0;
  }

  /**
   * Execute a named hook across all registered plugins.
   * Each plugin may optionally define a `hooks` object with hook functions.
   */
  async executeHook(hookName, context) {
    const results = [];
    for (const [, plugins] of this._plugins) {
      for (const plugin of plugins) {
        if (plugin.hooks && typeof plugin.hooks[hookName] === 'function') {
          results.push(await plugin.hooks[hookName](context));
        }
      }
    }
    return results;
  }
}

/**
 * Helper to create a plugin object.
 */
export function createPlugin(name, type, handler) {
  return { name, type, handler };
}
