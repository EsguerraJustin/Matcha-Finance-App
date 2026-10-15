/**
 * Text identifiers.
 *
 * Every table uses a **text UUID** primary key (brief Section 8). Ids are
 * generated on-device; nothing is ever fetched from a server.
 */

import * as Crypto from 'expo-crypto';

const HEX = '0123456789abcdef';

/** Fallback UUIDv4 for non-native environments (Jest, node scripts). */
function fallbackUUID(): string {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += HEX[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    } else {
      out += HEX[Math.floor(Math.random() * 16)];
    }
  }
  return out;
}

export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return fallbackUUID();
  }
}

/** Deterministic ids keep re-seeding idempotent. */
export function seededId(namespace: string, key: string): string {
  return `${namespace}_${hashKey(`${namespace}:${key}`)}`;
}

export function hashKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(36);
}

/** Normalises free text for the grocery price-memory lookups. */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}