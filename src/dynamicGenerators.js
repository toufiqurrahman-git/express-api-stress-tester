import { randomUUID } from 'node:crypto';

// Pre-computed pools for fast random selection
const FIRST_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
  'Ivy', 'Jack', 'Karen', 'Leo', 'Mona', 'Nick', 'Olivia', 'Paul',
  'Quinn', 'Rita', 'Sam', 'Tina', 'Uma', 'Vince', 'Wendy', 'Xander',
  'Yara', 'Zane', 'Aria', 'Ben', 'Cleo', 'Derek'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

const BOT_PREFIXES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Nova', 'Turbo',
  'Hyper', 'Ultra', 'Mega', 'Giga', 'Nano', 'Cyber', 'Robo', 'Auto'
];

const BOT_SUFFIXES = [
  'Bot', 'Agent', 'Helper', 'Runner', 'Worker', 'Pilot', 'Guard', 'Scout'
];

const EMAIL_DOMAINS = [
  'example.com', 'test.io', 'mail.org', 'demo.net', 'sample.dev'
];

/**
 * Pick a random element from an array.
 * Uses Math.random for speed (no need for crypto-grade randomness here).
 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Map of placeholder tokens to generator functions.
 * Each generator returns a fresh random value on every call.
 */
export const generators = {
  '{name}': () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  '{botName}': () => `${pick(BOT_PREFIXES)}${pick(BOT_SUFFIXES)}`,
  '{email}': () => {
    const user = `${pick(FIRST_NAMES).toLowerCase()}${Math.floor(Math.random() * 10000)}`;
    return `${user}@${pick(EMAIL_DOMAINS)}`;
  },
  '{uuid}': () => randomUUID(),
  '{number}': () => Math.floor(Math.random() * 1_000_000),
  '{timestamp}': () => Date.now(),
};

/**
 * Resolve a single placeholder string.
 * Returns the generator output if the entire value is a known token,
 * otherwise replaces all occurrences within the string.
 */
export function resolveValue(value) {
  if (typeof value !== 'string') return value;

  // Fast path: value is exactly a token
  if (generators[value] !== undefined) {
    return generators[value]();
  }

  // Slow path: replace all embedded tokens
  let result = value;
  for (const [token, gen] of Object.entries(generators)) {
    if (result.includes(token)) {
      // Replace all occurrences – each gets a unique value
      while (result.includes(token)) {
        result = result.replace(token, String(gen()));
      }
    }
  }
  return result;
}
