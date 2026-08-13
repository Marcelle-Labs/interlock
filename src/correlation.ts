/**
 * The correlation identifier, and the rules for carrying it.
 *
 * One identifier travels caller → proxy → decision → receipt → target →
 * mutation event, so that a later independent verifier can assemble the whole
 * story of one request without joining on timestamps and hoping.
 *
 * ## Why this is defined here rather than adopted from the platform
 *
 * HAC-325 established that the preferred Agent Gateway path does not deliver a
 * usable request to an extension at all, so no platform-supplied trace field can
 * be assumed. Anything Google-specific would also make the verifier depend on a
 * surface Interlock does not control, and the verifier is the component whose
 * independence is the entire point. So the field is ours, it is explicit, and it
 * is propagated by the application.
 *
 * ## Rules
 *
 * - the caller MAY supply one; the proxy MUST accept a well-formed one so a
 *   caller can correlate its own retries;
 * - the proxy MUST mint one when the caller supplies none or supplies a
 *   malformed one — a request without correlation is unauditable, so this never
 *   fails the request;
 * - a supplied identifier is never trusted for authorization. It is a join key,
 *   not a credential, and nothing downstream grants anything on the strength of
 *   it. A caller that forges another caller's correlation id corrupts its own
 *   trace and gains nothing.
 */
import { randomUUID } from 'node:crypto';

/** Wire header carrying the correlation identifier, on both HTTP hops. */
export const CORRELATION_HEADER = 'interlock-correlation-id';

/** Wire header carrying the signed authorization receipt, proxy → target. */
export const RECEIPT_HEADER = 'interlock-receipt';

/**
 * Accepted shape: `ilk-` and 8–64 URL-safe characters.
 *
 * Bounded and restricted on purpose. This value is written into logs, receipts
 * and evidence artifacts, so an unbounded or punctuation-rich identifier is a log
 * injection and a canonicalization hazard rather than a convenience.
 */
const CORRELATION_PATTERN = /^ilk-[A-Za-z0-9_-]{8,64}$/;

/** Mint a fresh correlation identifier. */
export function newCorrelationId(): string {
  return `ilk-${randomUUID().replaceAll('-', '')}`;
}

/** Whether a value is a correlation identifier this system will carry. */
export function isCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_PATTERN.test(value);
}

/**
 * The correlation identifier for an inbound request.
 *
 * Never fails: a malformed supplied value is replaced rather than rejected, and
 * the substitution is reported so the proxy can record that the caller's own
 * identifier was not carried.
 */
export function resolveCorrelationId(supplied: unknown): {
  readonly correlationId: string;
  readonly supplied: boolean;
} {
  if (isCorrelationId(supplied)) {
    return { correlationId: supplied, supplied: true };
  }
  return { correlationId: newCorrelationId(), supplied: false };
}
