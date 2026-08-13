/**
 * The lifecycle of one protected request, and the line between
 * *acknowledged* and *observed*.
 *
 * These are four different claims, and collapsing them is the most consequential
 * honesty failure available to a system like this:
 *
 * | Claim | What actually happened |
 * | -- | -- |
 * | `RECEIPT_ISSUED` | Interlock authorized a mutation |
 * | `TARGET_ACCEPTED` | the target validated the receipt and agreed to act |
 * | `MUTATION_EXECUTED` | the target believes it applied the change |
 * | `OBSERVED` | someone *re-read the state* and found the change there |
 *
 * A `200 OK` establishes the third at most. It is a statement made by the same
 * component that performed the write, over a channel that can lie by omission: a
 * response can be lost after the write, a write can be lost after the response,
 * and a proxy in between can synthesize either. Treating an acknowledgement as an
 * observation is how a system comes to report success for a mutation that is not
 * in the state.
 *
 * So `OBSERVED` is unreachable from an acknowledgement *by construction*. The
 * only function that produces it demands an independent read, and there is no
 * path from an HTTP response to that state. HAC-317 owns the real independent
 * verifier; this module's job is to make sure the states stay separable until it
 * exists, so that the verifier has something to verify against.
 */
import type { CanonicalValue } from '../authorization/canonical.js';
import { canonicalDigest } from '../authorization/canonical.js';

/** Lifecycle states of one protected request, in the order they can occur. */
export const LifecycleState = {
  /** The proxy received an intent. */
  INTENT_RECEIVED: 'INTENT_RECEIVED',
  /** The deterministic decision was made. */
  DECIDED: 'DECIDED',
  /** An ALLOW receipt was minted and signed. */
  RECEIPT_ISSUED: 'RECEIPT_ISSUED',
  /** The target validated the receipt and admitted the request. */
  TARGET_ACCEPTED: 'TARGET_ACCEPTED',
  /** The target reports it applied the mutation. Its own claim about itself. */
  MUTATION_EXECUTED: 'MUTATION_EXECUTED',
  /** The caller received a response. Says nothing about state. */
  CALLER_ACKNOWLEDGED: 'CALLER_ACKNOWLEDGED',
  /** An independent read found the expected state. The only claim about reality. */
  OBSERVED: 'OBSERVED',
  /** An independent read did NOT find the expected state. */
  OBSERVATION_MISMATCH: 'OBSERVATION_MISMATCH',
} as const;

export type LifecycleStateCode = (typeof LifecycleState)[keyof typeof LifecycleState];

/** One recorded step in a request's life. */
export interface LifecycleEvent {
  readonly correlationId: string;
  readonly state: LifecycleStateCode;
  readonly at: string;
  readonly detail: string;
  /** Component that recorded it: `proxy`, `target`, `caller`, `verifier`. */
  readonly recordedBy: string;
}

/**
 * States a component may assert about itself.
 *
 * `OBSERVED` and `OBSERVATION_MISMATCH` are absent on purpose — no component may
 * claim its own work was observed. They are produced only by `observe` below.
 */
const SELF_ASSERTABLE: readonly LifecycleStateCode[] = Object.freeze([
  LifecycleState.INTENT_RECEIVED,
  LifecycleState.DECIDED,
  LifecycleState.RECEIPT_ISSUED,
  LifecycleState.TARGET_ACCEPTED,
  LifecycleState.MUTATION_EXECUTED,
  LifecycleState.CALLER_ACKNOWLEDGED,
]);

/** Thrown when a component tries to assert a state it is not entitled to assert. */
export class UnassertableStateError extends Error {
  public constructor(state: LifecycleStateCode) {
    super(
      `${state} cannot be asserted by a participant; it is produced only by an independent read ` +
        'via observe(). An acknowledgement is not an observation.',
    );
    this.name = 'UnassertableStateError';
  }
}

/** Record a state a component is entitled to assert about its own work. */
export function record(
  event: Omit<LifecycleEvent, 'state'> & { readonly state: LifecycleStateCode },
): LifecycleEvent {
  if (!SELF_ASSERTABLE.includes(event.state)) {
    throw new UnassertableStateError(event.state);
  }
  return event;
}

export interface ObservationInput {
  readonly correlationId: string;
  /** State read back from the target by something that did not write it. */
  readonly readState: CanonicalValue;
  /** State the mutation was expected to produce. */
  readonly expectedState: CanonicalValue;
  readonly at: string;
  /** Who performed the read. Never the component that performed the write. */
  readonly recordedBy: string;
}

/**
 * Compare an independent read against what was expected.
 *
 * This is the only producer of `OBSERVED`, and it cannot be called without a
 * state that was actually read. That is the structural guarantee: there is no
 * argument you can pass to make it report an observation from a response code.
 */
export function observe(input: ObservationInput): LifecycleEvent {
  const read = canonicalDigest(input.readState);
  const expected = canonicalDigest(input.expectedState);
  const matched = read === expected;

  return {
    correlationId: input.correlationId,
    state: matched ? LifecycleState.OBSERVED : LifecycleState.OBSERVATION_MISMATCH,
    at: input.at,
    recordedBy: input.recordedBy,
    detail: matched
      ? `independent read matches the expected state (${read})`
      : `independent read is ${read}, expected ${expected}`,
  };
}

/**
 * Whether a trace establishes that a mutation reached the state.
 *
 * Deliberately strict: `MUTATION_EXECUTED` is not enough, however many
 * components agreed on it. Only an `OBSERVED` event counts, which is what stops
 * a report from being assembled out of acknowledgements.
 */
export function isObserved(events: readonly LifecycleEvent[]): boolean {
  return events.some((event) => event.state === LifecycleState.OBSERVED);
}
