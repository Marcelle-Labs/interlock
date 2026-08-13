import { describe, expect, it } from 'vitest';

import {
  CanonicalizationError,
  canonicalDigest,
  canonicalize,
} from '../src/authorization/canonical.js';
import { intentDigest, readIntent } from '../src/authorization/intent.js';

describe('canonicalize', () => {
  it('is independent of key insertion order', () => {
    // The property the whole intent binding rests on: two objects that differ
    // only in construction order must digest identically, or an attacker
    // reorders keys and the binding evaporates.
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalDigest({ b: 1, a: 2 })).toBe(canonicalDigest({ a: 2, b: 1 }));
  });

  it('sorts keys recursively', () => {
    expect(canonicalize({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
  });

  it('preserves array order, which is semantic', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it('serializes scalars', () => {
    expect(canonicalize({ s: 'x', n: 1.5, t: true, f: false, z: null })).toBe(
      '{"f":false,"n":1.5,"s":"x","t":true,"z":null}',
    );
  });

  it('normalizes -0 to 0, which JSON cannot distinguish', () => {
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize(0)).toBe('0');
  });

  it('refuses non-finite numbers rather than emitting null', () => {
    expect(() => canonicalize(Number.NaN)).toThrow(CanonicalizationError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('refuses a present-but-undefined member rather than dropping it', () => {
    // JSON.stringify would silently omit this, changing the digest of a value
    // that a reader would consider unchanged.
    expect(() => canonicalize({ a: undefined } as never)).toThrow(/present but undefined/);
  });

  it('refuses values with no JSON representation', () => {
    expect(() => canonicalize((() => 0) as never)).toThrow(/function/);
    expect(() => canonicalize(10n as never)).toThrow(/bigint/);
  });

  it('names the path to the offending member', () => {
    try {
      canonicalize({ outer: [{ inner: Number.NaN }] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CanonicalizationError).path).toBe('/outer/0/inner');
    }
  });

  it('carries its algorithm in the digest string', () => {
    expect(canonicalDigest({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('intentDigest', () => {
  it('is stable across argument ordering', () => {
    expect(intentDigest({ operation: 'op', arguments: { a: 1, b: 2 } })).toBe(
      intentDigest({ operation: 'op', arguments: { b: 2, a: 1 } }),
    );
  });

  it('changes when the operation changes', () => {
    expect(intentDigest({ operation: 'a', arguments: {} })).not.toBe(
      intentDigest({ operation: 'b', arguments: {} }),
    );
  });

  it('changes when any argument changes', () => {
    expect(intentDigest({ operation: 'op', arguments: { reserved: 60 } })).not.toBe(
      intentDigest({ operation: 'op', arguments: { reserved: 61 } }),
    );
  });
});

describe('readIntent', () => {
  it('reads a well-formed intent', () => {
    expect(readIntent({ operation: 'op', arguments: { a: 1 } })).toEqual({
      operation: 'op',
      arguments: { a: 1 },
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'op'],
    ['a missing operation', { arguments: {} }],
    ['an empty operation', { operation: '', arguments: {} }],
    ['missing arguments', { operation: 'op' }],
    ['array arguments', { operation: 'op', arguments: [] }],
  ])('rejects %s', (_label, value) => {
    expect(readIntent(value)).toBeNull();
  });
});
