/**
 * The experiment-local lifecycle schema.
 *
 * `src/observation/events.ts` freezes eight states and is not touched by this
 * experiment (X-17). This is a separate, smaller vocabulary for what HAC-316
 * can actually witness, and its one rule is that a state is emitted **only when
 * the boundary it names was directly observed**. A schema that lists a state it
 * never emits is worse than one that omits it: the gap disappears into the
 * vocabulary and stops being a finding.
 *
 * ## ACCEPTED is the honest gap
 *
 * The frozen target answers a mutation with a single response carrying either
 * `EXECUTED` or a 403. There is no separately observable moment at which it
 * accepted the receipt and had not yet applied the mutation, so there is nothing
 * to witness. `ACCEPTED` stays in the vocabulary and is never emitted; `emit`
 * refuses it outright and `acceptedAvailability()` records why. Manufacturing it
 * — from a 200, from a receipt id coming back, from anything short of a
 * transition somebody watched — is the failure this module exists to prevent
 * (X-18). It is deferred to HAC-317, not quietly dropped.
 *
 * ## OBSERVED has exactly one producer
 *
 * A response is a statement about a request, not about the state. Only an
 * independent re-read produces `OBSERVED`, and `emit` enforces that by refusing
 * any other producer rather than trusting callers to be careful.
 *
 * Dependency-free and free of top-level await on purpose: the gate loads this
 * module through CommonJS `require`, which cannot resolve a module that awaits
 * at the top level.
 */

/** The seven states this experiment uses. */
export const ExperimentState = Object.freeze({
  REQUESTED: 'REQUESTED',
  WITHHELD: 'WITHHELD',
  AUTHORIZED: 'AUTHORIZED',
  ACCEPTED: 'ACCEPTED',
  EXECUTED: 'EXECUTED',
  OBSERVED: 'OBSERVED',
  FAILED: 'FAILED',
});

/** The only producer entitled to assert `OBSERVED`. */
export const INDEPENDENT_REREAD = 'independent-reread';

/** States no component may assert about its own work. */
const NOT_SELF_ASSERTABLE = Object.freeze([ExperimentState.OBSERVED]);

/** States this deployment cannot witness at all. */
const UNOBSERVABLE = Object.freeze([ExperimentState.ACCEPTED]);

/** Thrown when a caller tries to emit a state it did not observe. */
export class UnobservedBoundaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnobservedBoundaryError';
  }
}

/**
 * Record one lifecycle event, if the boundary was genuinely observed.
 *
 * @throws UnobservedBoundaryError for `ACCEPTED`, and for `OBSERVED` claimed by
 *         anything other than an independent re-read.
 */
export function emit(event) {
  const { correlationId, state, at, producedBy, detail } = event;

  if (!Object.hasOwn(ExperimentState, state)) {
    throw new UnobservedBoundaryError(`${state} is not a state of this schema`);
  }

  if (UNOBSERVABLE.includes(state)) {
    throw new UnobservedBoundaryError(
      `${state} has no observable boundary against the frozen target, which answers a mutation ` +
        'with one response carrying EXECUTED or a 403. Recording it would be manufacturing a ' +
        'transition nobody watched; see acceptedAvailability().',
    );
  }

  if (NOT_SELF_ASSERTABLE.includes(state) && producedBy !== INDEPENDENT_REREAD) {
    throw new UnobservedBoundaryError(
      `${state} may be produced only by ${INDEPENDENT_REREAD}, not by ${producedBy}. A response ` +
        'to the caller reports that a request was handled; it does not report what the state is.',
    );
  }

  if (typeof correlationId !== 'string' || correlationId === '') {
    throw new UnobservedBoundaryError('every event must carry the correlation id it belongs to');
  }

  return { correlationId, state, at, producedBy, detail };
}

/** Why `ACCEPTED` is absent, in the shape the packet records it. */
export function acceptedAvailability() {
  return {
    state: ExperimentState.ACCEPTED,
    emitted: false,
    status: 'unavailable',
    reason:
      'the frozen target returns a single response whose status is EXECUTED or a 403; there is ' +
      'no separately observable acceptance transition to witness',
    citation: 'src/target/http.ts:89',
    deferredTo: 'HAC-317',
  };
}

/** A collected, ordered timeline for one run. */
export class Timeline {
  constructor() {
    this.events = [];
  }

  /** Emit and retain. Refusals propagate; they are findings, not noise. */
  record(event) {
    const emitted = emit(event);
    this.events.push(emitted);
    return emitted;
  }

  /**
   * Record an attempt that could not be emitted, without emitting it.
   *
   * Used for boundaries this deployment cannot witness. The distinction between
   * "did not happen" and "could not be observed" survives into the packet.
   */
  notEmitted(state, why) {
    return { state, emitted: false, status: 'unavailable', why };
  }

  states() {
    return this.events.map((event) => event.state);
  }
}
