/**
 * Tests for dynamic generators and payload parsing.
 */
import { resolveValue, generators } from '../src/dynamicGenerators.js';
import { parsePayload, getPayload } from '../src/payloadParser.js';

// ─── Dynamic Generators ────────────────────────────────────────────────────

describe('dynamicGenerators', () => {
  test('{name} produces a string with two parts (first + last)', () => {
    const name = generators['{name}']();
    expect(typeof name).toBe('string');
    expect(name.split(' ')).toHaveLength(2);
  });

  test('{botName} produces a non-empty string', () => {
    const bot = generators['{botName}']();
    expect(typeof bot).toBe('string');
    expect(bot.length).toBeGreaterThan(0);
  });

  test('{email} contains @', () => {
    const email = generators['{email}']();
    expect(email).toContain('@');
  });

  test('{uuid} is a valid UUID v4 format', () => {
    const id = generators['{uuid}']();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('{number} is a non-negative integer', () => {
    const num = generators['{number}']();
    expect(Number.isInteger(num)).toBe(true);
    expect(num).toBeGreaterThanOrEqual(0);
  });

  test('{timestamp} is a positive number', () => {
    const ts = generators['{timestamp}']();
    expect(typeof ts).toBe('number');
    expect(ts).toBeGreaterThan(0);
  });
});

// ─── resolveValue ──────────────────────────────────────────────────────────

describe('resolveValue', () => {
  test('returns non-string values unchanged', () => {
    expect(resolveValue(42)).toBe(42);
    expect(resolveValue(null)).toBe(null);
    expect(resolveValue(true)).toBe(true);
  });

  test('resolves a known placeholder token', () => {
    const result = resolveValue('{uuid}');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('{uuid}');
  });

  test('resolves embedded placeholders in a larger string', () => {
    const result = resolveValue('user-{uuid}-test');
    expect(typeof result).toBe('string');
    expect(result).not.toContain('{uuid}');
    expect(result).toContain('user-');
    expect(result).toContain('-test');
  });

  test('leaves unknown placeholders untouched', () => {
    expect(resolveValue('{unknown}')).toBe('{unknown}');
  });
});

// ─── parsePayload ──────────────────────────────────────────────────────────

describe('parsePayload', () => {
  test('resolves placeholders in a flat object', () => {
    const result = parsePayload({ name: '{name}', email: '{email}' });
    expect(typeof result.name).toBe('string');
    expect(result.name).not.toBe('{name}');
    expect(result.email).toContain('@');
  });

  test('handles nested objects', () => {
    const result = parsePayload({ user: { id: '{uuid}' } });
    expect(result.user.id).not.toBe('{uuid}');
  });

  test('handles arrays', () => {
    const result = parsePayload(['{name}', '{email}']);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).not.toBe('{name}');
    expect(result[1]).toContain('@');
  });

  test('returns null/undefined as-is', () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload(undefined)).toBeUndefined();
  });
});

// ─── getPayload ────────────────────────────────────────────────────────────

describe('getPayload', () => {
  test('single payload mode resolves template', () => {
    const config = { payload: { x: '{number}' } };
    const result = getPayload(config, 0);
    expect(typeof result.x).toBe('number');
  });

  test('bulk payloads mode round-robins', () => {
    const config = {
      payloads: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
    };
    expect(getPayload(config, 0).name).toBe('Alice');
    expect(getPayload(config, 1).name).toBe('Bob');
    expect(getPayload(config, 2).name).toBe('Charlie');
    // Wraps around
    expect(getPayload(config, 3).name).toBe('Alice');
  });

  test('returns undefined when no payload configured', () => {
    expect(getPayload({}, 0)).toBeUndefined();
  });
});
