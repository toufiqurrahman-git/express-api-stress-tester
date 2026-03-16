/**
 * Tests for the PluginManager (registration, hooks, validation).
 */
import { PluginManager, createPlugin } from '../src/plugins/pluginManager.js';

describe('PluginManager', () => {
  test('registerPlugin() with valid plugin', () => {
    const pm = new PluginManager();
    const plugin = { name: 'myGen', type: 'payloadGenerator', handler: () => ({}) };
    pm.registerPlugin(plugin);
    expect(pm.getPlugins('payloadGenerator')).toHaveLength(1);
    expect(pm.getPlugins('payloadGenerator')[0].name).toBe('myGen');
  });

  test('registerPlugin() accepts all valid types', () => {
    const types = ['payloadGenerator', 'authProvider', 'headerProvider', 'metricsCollector', 'requestInterceptor'];
    const pm = new PluginManager();
    for (const type of types) {
      pm.registerPlugin({ name: `plugin-${type}`, type, handler: () => {} });
    }
    for (const type of types) {
      expect(pm.getPlugins(type)).toHaveLength(1);
    }
  });

  test('registerPlugin() rejects invalid type', () => {
    const pm = new PluginManager();
    expect(() => {
      pm.registerPlugin({ name: 'bad', type: 'invalidType', handler: () => {} });
    }).toThrow('Invalid plugin type');
  });

  test('registerPlugin() rejects missing name', () => {
    const pm = new PluginManager();
    expect(() => {
      pm.registerPlugin({ type: 'payloadGenerator', handler: () => {} });
    }).toThrow('Plugin must have name, type, and handler');
  });

  test('registerPlugin() rejects missing type', () => {
    const pm = new PluginManager();
    expect(() => {
      pm.registerPlugin({ name: 'x', handler: () => {} });
    }).toThrow('Plugin must have name, type, and handler');
  });

  test('registerPlugin() rejects missing handler', () => {
    const pm = new PluginManager();
    expect(() => {
      pm.registerPlugin({ name: 'x', type: 'payloadGenerator' });
    }).toThrow('Plugin must have name, type, and handler');
  });

  test('registerPlugin() rejects null/undefined', () => {
    const pm = new PluginManager();
    expect(() => pm.registerPlugin(null)).toThrow();
    expect(() => pm.registerPlugin(undefined)).toThrow();
  });

  test('getPlugins() returns empty array for type with no plugins', () => {
    const pm = new PluginManager();
    expect(pm.getPlugins('authProvider')).toEqual([]);
  });

  test('getPlugins() returns empty array for unknown type', () => {
    const pm = new PluginManager();
    expect(pm.getPlugins('nonexistent')).toEqual([]);
  });

  test('has() returns true when plugin registered', () => {
    const pm = new PluginManager();
    expect(pm.has('payloadGenerator')).toBe(false);
    pm.registerPlugin({ name: 'gen', type: 'payloadGenerator', handler: () => {} });
    expect(pm.has('payloadGenerator')).toBe(true);
  });

  test('has() returns false for unregistered type', () => {
    const pm = new PluginManager();
    expect(pm.has('authProvider')).toBe(false);
  });

  test('executeHook() runs hook functions and returns results', async () => {
    const pm = new PluginManager();
    pm.registerPlugin({
      name: 'hook1',
      type: 'requestInterceptor',
      handler: () => {},
      hooks: {
        beforeRequest: (ctx) => `modified-${ctx.url}`,
      },
    });
    pm.registerPlugin({
      name: 'hook2',
      type: 'payloadGenerator',
      handler: () => {},
      hooks: {
        beforeRequest: (ctx) => `also-${ctx.url}`,
      },
    });

    const results = await pm.executeHook('beforeRequest', { url: '/test' });
    expect(results).toHaveLength(2);
    // Map iteration order: payloadGenerator comes before requestInterceptor
    expect(results).toContain('modified-/test');
    expect(results).toContain('also-/test');
  });

  test('executeHook() returns empty array when no hooks match', async () => {
    const pm = new PluginManager();
    pm.registerPlugin({ name: 'nohooks', type: 'payloadGenerator', handler: () => {} });
    const results = await pm.executeHook('beforeRequest', {});
    expect(results).toEqual([]);
  });

  test('executeHook() handles async hook functions', async () => {
    const pm = new PluginManager();
    pm.registerPlugin({
      name: 'asyncHook',
      type: 'requestInterceptor',
      handler: () => {},
      hooks: {
        afterResponse: async (ctx) => {
          return `async-${ctx.status}`;
        },
      },
    });

    const results = await pm.executeHook('afterResponse', { status: 200 });
    expect(results).toEqual(['async-200']);
  });

  test('createPlugin() helper creates correct shape', () => {
    const plugin = createPlugin('myPlugin', 'authProvider', () => 'token');
    expect(plugin.name).toBe('myPlugin');
    expect(plugin.type).toBe('authProvider');
    expect(typeof plugin.handler).toBe('function');
    expect(plugin.handler()).toBe('token');
  });
});
