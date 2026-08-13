/**
 * Target state revisions.
 *
 * A revision is the target's answer to "which state was this authorization
 * decided against?". It is what makes a receipt refuse to apply twice, and what
 * makes the second half of an unsafe pair fail even if the proxy is wrong,
 * bypassed, or replaced.
 *
 * Revisions are a hash chain rather than a counter. A counter says only *how
 * many* mutations happened, so two targets that applied different mutations in
 * the same number of steps agree on their revision and a receipt for one is
 * accepted by the other. Chaining each revision over its predecessor and the
 * mutation that produced it means a revision names one specific history.
 *
 * The chain is not a security boundary against a compromised target — a target
 * that lies about its own revision is already the thing being protected. It is a
 * correctness boundary against *staleness*, which is the failure S2 tests.
 */
import { canonicalDigest } from '../../authorization/canonical.js';
import type { CanonicalValue } from '../../authorization/canonical.js';

/** The revision of a target that has never been mutated. */
export function genesisRevision(targetId: string, initialState: CanonicalValue): string {
  return canonicalDigest({
    kind: 'interlock.revision.genesis/1',
    targetId,
    state: initialState,
  });
}

/**
 * The revision that results from applying one mutation to `previous`.
 *
 * Both the mutation and the resulting state are folded in: the mutation so that
 * two different requests never produce the same revision, and the state so that
 * a revision cannot be predicted without knowing what the target actually holds.
 */
export function nextRevision(
  previous: string,
  mutation: CanonicalValue,
  resultingState: CanonicalValue,
): string {
  return canonicalDigest({
    kind: 'interlock.revision.step/1',
    previous,
    mutation,
    state: resultingState,
  });
}
