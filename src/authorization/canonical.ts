/**
 * Canonical serialization for anything that gets signed or digested.
 *
 * Every binding in an Interlock authorization receipt is ultimately a claim that
 * two byte strings match — the arguments the caller sent to the proxy, and the
 * arguments the target was asked to execute. That claim is only as strong as the
 * serialization underneath it: if `{"a":1,"b":2}` and `{"b":2,"a":1}` can digest
 * differently, an attacker reorders keys and the intent binding evaporates while
 * every signature still verifies.
 *
 * `JSON.stringify` is not sufficient. It preserves insertion order, so the same
 * logical object reaches different digests depending on how it was built, and it
 * silently drops `undefined` members rather than rejecting them.
 *
 * The rules here are deliberately narrow, because a canonicalizer that accepts
 * more shapes has more ways to be ambiguous:
 *
 * - object keys are emitted in code-unit order, recursively;
 * - arrays keep their order, which is semantic, not incidental;
 * - only JSON scalars are accepted — non-finite numbers, `undefined`, functions,
 *   symbols and bigints throw rather than serialize to something lossy;
 * - `-0` normalizes to `0`, since JSON cannot express the difference and a digest
 *   that depends on it would be unstable across a round trip.
 */
import { createHash } from 'node:crypto';

/** A value this module is willing to canonicalize. */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * Thrown when a value cannot be canonicalized without losing information.
 *
 * Loud by design: the alternative is a digest computed over a silently altered
 * value, which is the failure mode this whole module exists to prevent.
 */
export class CanonicalizationError extends Error {
  public constructor(
    message: string,
    /** JSON-pointer-ish path to the offending member, for a readable failure. */
    public readonly path: string,
  ) {
    super(`${message} (at ${path === '' ? '<root>' : path})`);
    this.name = 'CanonicalizationError';
  }
}

function canonicalizeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      `non-finite number ${String(value)} has no JSON representation`,
      path,
    );
  }
  // `Object.is` distinguishes -0 from 0, which `===` does not. JSON cannot carry
  // the distinction, so it is normalized here rather than left to the reader.
  return Object.is(value, -0) ? '0' : JSON.stringify(value);
}

function canonicalizeValue(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return canonicalizeNumber(value, path);
    case 'object':
      break;
    default:
      throw new CanonicalizationError(`values of type ${typeof value} cannot be canonicalized`, path);
  }

  if (Array.isArray(value)) {
    const members = value.map((member, index) => canonicalizeValue(member, `${path}/${index}`));
    return `[${members.join(',')}]`;
  }

  const source = value as Record<string, unknown>;
  // Sorted by code unit, which is what `Array.prototype.sort` does by default and
  // what every other canonical-JSON implementation agrees on.
  const keys = Object.keys(source).sort();
  const members = keys.map((key) => {
    const member = source[key];
    if (member === undefined) {
      throw new CanonicalizationError(
        `key ${JSON.stringify(key)} is present but undefined; drop the key or give it a value`,
        path,
      );
    }
    return `${JSON.stringify(key)}:${canonicalizeValue(member, `${path}/${key}`)}`;
  });
  return `{${members.join(',')}}`;
}

/** Serialize a value to its canonical JSON form. */
export function canonicalize(value: CanonicalValue): string {
  return canonicalizeValue(value, '');
}

/** UTF-8 bytes of the canonical form — what actually gets signed. */
export function canonicalBytes(value: CanonicalValue): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}

/**
 * `sha256:<hex>` over the canonical form.
 *
 * The algorithm is carried in the string rather than assumed by the reader, so a
 * later change of hash is visible in every artifact that recorded one instead of
 * silently comparing equal-length hex from two different functions.
 */
export function canonicalDigest(value: CanonicalValue): string {
  return `sha256:${createHash('sha256').update(canonicalBytes(value)).digest('hex')}`;
}
