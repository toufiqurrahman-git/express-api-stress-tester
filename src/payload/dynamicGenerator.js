/**
 * Enhanced dynamic value generator (v2).
 * Re-exports everything from v1 and adds new generators.
 */
import { generators as v1Generators, resolveValue as v1ResolveValue } from '../dynamicGenerators.js';
export { parsePayload, getPayload } from '../payloadParser.js';

const ALPHA_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const generators = {
  ...v1Generators,
  '{randomInt}': () => Math.floor(Math.random() * 1_000_000),
  '{randomString}': () => {
    const len = 8 + Math.floor(Math.random() * 9); // 8–16 inclusive
    let s = '';
    for (let i = 0; i < len; i++) {
      s += ALPHA_NUM[Math.floor(Math.random() * ALPHA_NUM.length)];
    }
    return s;
  },
};

export function resolveValue(value) {
  if (typeof value !== 'string') return value;

  // Fast path: value is exactly a token
  if (generators[value] !== undefined) {
    return generators[value]();
  }

  // Slow path: replace all embedded tokens
  let result = value;
  for (const [token, gen] of Object.entries(generators)) {
    while (result.includes(token)) {
      result = result.replace(token, String(gen()));
    }
  }
  return result;
}
