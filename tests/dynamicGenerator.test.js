/**
 * Tests for the enhanced dynamic generator (v2).
 */
import { generators, resolveValue, parsePayload } from '../src/payload/dynamicGenerator.js';

describe('dynamicGenerator (v2)', () => {
  // ── New v2 generators ──────────────────────────────────────────────────

  test('{randomInt} generates integers 0-999999', () => {
    for (let i = 0; i < 50; i++) {
      const val = generators['{randomInt}']();
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1_000_000);
    }
  });

  test('{randomString} generates alphanumeric strings 8-16 chars', () => {
    for (let i = 0; i < 50; i++) {
      const val = generators['{randomString}']();
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThanOrEqual(8);
      expect(val.length).toBeLessThanOrEqual(16);
      expect(val).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  // ── Backward compatibility ─────────────────────────────────────────────

  test('{name} still works — produces first + last', () => {
    const val = generators['{name}']();
    expect(typeof val).toBe('string');
    expect(val.split(' ')).toHaveLength(2);
  });

  test('{email} still works — contains @', () => {
    const val = generators['{email}']();
    expect(val).toContain('@');
  });

  test('{uuid} still works — valid UUID v4', () => {
    const val = generators['{uuid}']();
    expect(val).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test('{number} still works — non-negative integer', () => {
    const val = generators['{number}']();
    expect(Number.isInteger(val)).toBe(true);
    expect(val).toBeGreaterThanOrEqual(0);
  });

  test('{timestamp} still works — positive number', () => {
    const val = generators['{timestamp}']();
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThan(0);
  });

  // ── resolveValue ───────────────────────────────────────────────────────

  test('resolveValue works for full token', () => {
    const result = resolveValue('{randomInt}');
    expect(typeof result).toBe('number');
  });

  test('resolveValue works for embedded tokens', () => {
    const result = resolveValue('id-{randomInt}-end');
    expect(typeof result).toBe('string');
    expect(result).not.toContain('{randomInt}');
    expect(result).toMatch(/^id-\d+-end$/);
  });

  test('resolveValue returns non-strings unchanged', () => {
    expect(resolveValue(42)).toBe(42);
    expect(resolveValue(null)).toBeNull();
    expect(resolveValue(true)).toBe(true);
  });

  test('resolveValue leaves unknown placeholders untouched', () => {
    expect(resolveValue('{unknown}')).toBe('{unknown}');
  });

  // ── parsePayload (re-exported) ─────────────────────────────────────────

  test('parsePayload resolves nested objects', () => {
    const result = parsePayload({
      user: {
        name: '{name}',
        meta: { id: '{uuid}' },
      },
    });
    expect(typeof result.user.name).toBe('string');
    expect(result.user.name).not.toBe('{name}');
    expect(result.user.meta.id).not.toBe('{uuid}');
  });

  test('parsePayload handles arrays', () => {
    const result = parsePayload(['{randomInt}', '{randomString}']);
    expect(Array.isArray(result)).toBe(true);
    // parsePayload uses v1 resolveValue which stringifies, so both are strings
    expect(typeof result[0]).toBe('string');
    expect(typeof result[1]).toBe('string');
  });

  test('parsePayload returns null/undefined as-is', () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload(undefined)).toBeUndefined();
  });
});
