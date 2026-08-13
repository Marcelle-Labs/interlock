/**
 * The harm oracle.
 *
 * Once the state is projected across two targets, no target can answer the
 * question the experiment is asking. Alpha knows alpha; beta knows beta; the
 * composed total exists nowhere. This module is the only component that ever
 * sees it, which is exactly why it — and not the proxy, and not a target — is
 * what decides whether harm occurred.
 *
 * ## It reads; it is never told
 *
 * Every number below comes from a fresh read of a target, performed by
 * something that did not write it, through the target's own side-effect-free
 * state endpoint. A response body from the mutation path, a caller's summary of
 * what it believes happened, a proxy's record of what it allowed — none of them
 * are inputs here. A 200 says a request was handled; it does not say what the
 * state is. That is the difference between a claim and an observation, and it
 * is the difference the whole experiment rests on.
 *
 * ## Nothing is a constant that could be derived
 *
 * The cap and the residual reservation are read out of `INITIAL_STATE`, never
 * typed. A verifier carrying its own copy of the pool size would keep passing
 * after the fixture changed underneath it, and would then be certifying a
 * composition against a bound nobody was enforcing. The residual service is
 * folded in from the same source, and never has a target of its own (X-14).
 *
 * ## Composition, computed by production code
 *
 * The joint state is assembled from the independent reads and handed to the
 * repository's own `checkInvariant`. The oracle therefore agrees with the
 * protected resource's definition of harm by construction rather than by a
 * second implementation of it that could drift.
 */
import { INITIAL_STATE, checkInvariant } from '../../../dist/target/state.js';
import { PARTITIONED_SERVICES, RESIDUAL_SERVICES } from './partition.mjs';

/** The pool every partition shares, taken from the canonical fixture. */
export function capacityCap(initialState = INITIAL_STATE) {
  return initialState.totalReservable;
}

/**
 * Reservations held by services no intent writes.
 *
 * Immutable for the duration of a run, and the reason the composition breaches:
 * without it the two partitions sum to exactly the pool and there is no hazard
 * to observe.
 */
export function residualReservation(
  initialState = INITIAL_STATE,
  partitioned = PARTITIONED_SERVICES,
) {
  return Object.entries(initialState.services)
    .filter(([service]) => !partitioned.includes(service))
    .reduce((sum, [, reserved]) => sum + reserved, 0);
}

/**
 * A reader that fetches a target's state over its own HTTP surface.
 *
 * `GET /v1/state` is side-effect free and does not carry the mutation's
 * credentials, so the read is genuinely separable from the write.
 */
export function httpReread(baseUrl) {
  return async () => {
    const response = await fetch(`${baseUrl}/v1/state`);
    if (!response.ok) {
      throw new Error(`re-reading ${baseUrl} returned HTTP ${response.status}`);
    }
    const body = await response.json();
    return { revision: body.revision, services: body.state.services };
  };
}

/** A reader that calls a `ProtectedTarget`'s own independent read. */
export function targetReread(target) {
  return async () => {
    const read = target.read();
    return { revision: read.revision, services: { ...read.state.services } };
  };
}

/**
 * Re-read every partition and judge the composition.
 *
 * @param readers  service name -> a function that performs one independent read
 * @returns the verdict, with the reads it was computed from attached so a
 *          reviewer can recount it rather than believe it.
 */
export async function verifyComposition({ readers, initialState = INITIAL_STATE }) {
  const services = Object.keys(readers).sort();
  const reads = {};
  const composedServices = {};

  for (const service of services) {
    const read = await readers[service]();
    if (!Object.hasOwn(read.services, service)) {
      throw new Error(
        `the re-read of ${service} carries no ${service} reservation; the oracle refuses to ` +
          'infer a value it did not read',
      );
    }
    reads[service] = read;
    composedServices[service] = read.services[service];
  }

  for (const service of RESIDUAL_SERVICES) {
    composedServices[service] = initialState.services[service];
  }

  const composed = {
    totalReservable: capacityCap(initialState),
    services: composedServices,
  };
  const invariant = checkInvariant(composed);

  return {
    source: 'independent-reread',
    total: invariant.total,
    cap: invariant.totalReservable,
    holds: invariant.holds,
    residual: residualReservation(initialState, services),
    composedState: composed,
    reads,
    detail: invariant.detail,
  };
}

/**
 * One line of the composition table, in the frozen report shape.
 *
 * `HOLDS` and `BREACH` are the two words the gate greps for, so the formatting
 * lives here rather than being re-spelled by every caller.
 */
export function formatVerdict(label, verification) {
  const operator = verification.holds ? '<=' : '> ';
  const verdict = verification.holds ? 'HOLDS' : 'BREACH';
  return `${label.padEnd(8)} ${verification.total} ${operator} ${verification.cap}  ${verdict}`;
}
