/**
 * Configuration reading.
 *
 * Worth testing rather than trusting: every one of these values is the
 * difference between a service that enforces and a service that starts up
 * looking healthy while enforcing nothing. A missing verification key map, in
 * particular, must stop the target from starting at all — a target with no keys
 * would refuse every receipt, which reads as "very secure" right up to the
 * moment someone disables the check to make the demo work.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import {
  ConfigurationError,
  ENV,
  optional,
  readDurationMs,
  readFlag,
  readKeyMap,
  readPort,
  required,
} from '../src/config.js';

const publicPem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();

describe('required', () => {
  it('returns a trimmed value', () => {
    expect(required({ A: '  x  ' }, 'A')).toBe('x');
  });

  it.each([
    ['unset', {}],
    ['empty', { A: '' }],
    ['whitespace only', { A: '   ' }],
  ])('throws when %s', (_label, env) => {
    expect(() => required(env, 'A')).toThrow(ConfigurationError);
  });
});

describe('optional', () => {
  it('falls back when unset or blank', () => {
    expect(optional({}, 'A', 'fallback')).toBe('fallback');
    expect(optional({ A: '  ' }, 'A', 'fallback')).toBe('fallback');
  });

  it('prefers a supplied value', () => {
    expect(optional({ A: 'x' }, 'A', 'fallback')).toBe('x');
  });
});

describe('readPort', () => {
  it('falls back when PORT is unset, which is the local case', () => {
    expect(readPort({}, 8080)).toBe(8080);
  });

  it('reads the port Cloud Run supplies', () => {
    expect(readPort({ [ENV.PORT]: '8080' }, 1)).toBe(8080);
  });

  it.each([['not-a-number'], ['-1'], ['70000'], ['8080.5']])('rejects %s', (value) => {
    expect(() => readPort({ [ENV.PORT]: value }, 1)).toThrow(ConfigurationError);
  });
});

describe('readDurationMs', () => {
  it('falls back when unset', () => {
    expect(readDurationMs({}, 'D', 2_000)).toBe(2_000);
  });

  it('reads a positive integer', () => {
    expect(readDurationMs({ D: '500' }, 'D', 1)).toBe(500);
  });

  it.each([['0'], ['-5'], ['abc'], ['1.5']])('rejects %s', (value) => {
    expect(() => readDurationMs({ D: value }, 'D', 1)).toThrow(ConfigurationError);
  });
});

describe('readFlag', () => {
  it('is true only for an explicit true', () => {
    expect(readFlag({ F: 'true' }, 'F')).toBe(true);
    expect(readFlag({ F: 'TRUE' }, 'F')).toBe(true);
  });

  it.each([['false'], ['1'], ['yes'], ['']])('is false for %s', (value) => {
    // A flag that enables enforcement must not be enabled by a typo, and a flag
    // that disables it must not be disabled by one either.
    expect(readFlag({ F: value }, 'F')).toBe(false);
  });

  it('is false when unset', () => {
    expect(readFlag({}, 'F')).toBe(false);
  });
});

describe('readKeyMap', () => {
  it('reads a keyId -> PEM map', () => {
    const map = readKeyMap({ K: JSON.stringify({ 'key-1': publicPem }) }, 'K');

    expect(Object.keys(map)).toEqual(['key-1']);
  });

  it('supports more than one key, so rotation is not a flag day', () => {
    const map = readKeyMap({ K: JSON.stringify({ old: publicPem, new: publicPem }) }, 'K');

    expect(Object.keys(map)).toHaveLength(2);
  });

  it.each([
    ['absent', undefined],
    ['not JSON', 'nonsense'],
    ['a JSON array', '[]'],
    ['a JSON string', '"x"'],
    ['an empty object', '{}'],
    ['a value that is not a PEM public key', '{"key-1":"hunter2"}'],
  ])('throws when the map is %s', (_label, value) => {
    expect(() => readKeyMap(value === undefined ? {} : { K: value }, 'K')).toThrow(ConfigurationError);
  });
});
