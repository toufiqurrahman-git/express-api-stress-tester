import { resolveValue } from './dynamicGenerators.js';

/**
 * Deep-clone a plain object/array and resolve every dynamic placeholder.
 * Works recursively so nested payloads are supported.
 */
export function parsePayload(template) {
  if (template === null || template === undefined) return template;

  if (Array.isArray(template)) {
    return template.map(parsePayload);
  }

  if (typeof template === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = parsePayload(value);
    }
    return result;
  }

  return resolveValue(template);
}

/**
 * Given a config, return a resolved payload for a single request.
 * Supports both single payload and bulk payloads (round-robin).
 */
export function getPayload(config, requestIndex) {
  // Bulk mode: config.payloads is an array of payload objects
  if (Array.isArray(config.payloads) && config.payloads.length > 0) {
    const template = config.payloads[requestIndex % config.payloads.length];
    return parsePayload(template);
  }

  // Single payload mode
  if (config.payload) {
    return parsePayload(config.payload);
  }

  return undefined;
}
