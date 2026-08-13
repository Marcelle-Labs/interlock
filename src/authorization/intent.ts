/**
 * The intent — what the caller asked to have done — and its digest.
 *
 * This is the pivot of the whole enforcement model. The proxy decides about an
 * intent and signs a digest of it; the target recomputes that digest from the
 * request *it* received and refuses to execute unless the two agree. Neither
 * side trusts the other's summary of what was requested, which is what makes a
 * receipt non-transferable to a different operation or a different argument set.
 *
 * The digest deliberately covers the operation and the arguments and nothing
 * else. Correlation, revision, caller and expiry are bound separately in the
 * receipt claims, so a mismatch names exactly one thing rather than reporting a
 * single opaque "does not match".
 */
import type { CanonicalValue } from './canonical.js';
import { canonicalDigest } from './canonical.js';

/** A protected operation and the arguments it was asked to run with. */
export interface Intent {
  /** Tool/operation identifier, e.g. `set_reservation`. */
  readonly operation: string;
  /** Arguments exactly as the caller supplied them. */
  readonly arguments: { readonly [key: string]: CanonicalValue };
}

/**
 * The digest bound into a receipt and recomputed by the target.
 *
 * Domain-separated by an explicit `kind`: a bare digest of `{operation,
 * arguments}` could collide with some other structure that happens to
 * canonicalize identically, and the tag costs nothing.
 */
export function intentDigest(intent: Intent): string {
  return canonicalDigest({
    kind: 'interlock.intent/1',
    operation: intent.operation,
    arguments: intent.arguments,
  });
}

/**
 * Read an untrusted value as an intent.
 *
 * Returns `null` rather than throwing because every caller of this is a request
 * handler that must answer with a structured rejection, not a stack trace.
 */
export function readIntent(value: unknown): Intent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const operation = source['operation'];
  const args = source['arguments'];

  if (typeof operation !== 'string' || operation === '') return null;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return null;

  return {
    operation,
    arguments: args as { readonly [key: string]: CanonicalValue },
  };
}
