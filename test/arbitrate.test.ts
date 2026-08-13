/**
 * The deterministic decision, driven by the real HAC-330 evidence artifact.
 *
 * The central assertion of this file is negative: **no guard failure produces
 * ALLOW_PARALLEL.** Every way of not knowing — store down, evidence missing,
 * malformed, unversioned, unmined, misattributed, unpinned, stale — must land on
 * `INSUFFICIENT_EVIDENCE`. That is the "missing is not green" property, and it is
 * asserted exhaustively rather than sampled.
 */
import { describe, expect, it } from 'vitest';

import type { ArbitrationInput } from '../src/broker/pairing/arbitrate.js';
import { Decision, Reason, arbitrate, pairKey } from '../src/broker/pairing/arbitrate.js';
import type { PendingIntent } from '../src/broker/pairing/store.js';
import { ALPHA, BASELINE_BASIS, BASELINE_EVIDENCE, BETA, GAMMA } from './support/s2.js';

const intent = (correlationId: string, targets: readonly string[]): PendingIntent => ({
  correlationId,
  agent: `${correlationId}@example.test`,
  operation: 'set_reservation',
  targets,
  intentDigest: `sha256:${correlationId}`,
  recordedAt: '2026-08-13T12:00:00.000Z',
  expiresAt: '2026-08-13T12:01:00.000Z',
});

function input(overrides: Partial<ArbitrationInput> = {}): ArbitrationInput {
  return {
    candidate: intent('ilk-aaaaaaaa', [ALPHA]),
    others: { ok: true, value: [] },
    evidence: BASELINE_EVIDENCE,
    sourceRevision: BASELINE_BASIS,
    ...overrides,
  };
}

/** Deep-clone the evidence so a mutation in one test cannot leak into another. */
const evidenceCopy = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(BASELINE_EVIDENCE)) as Record<string, unknown>;

describe('arbitrate — the permissive answer', () => {
  it('allows an intent that is alone in flight', () => {
    const verdict = arbitrate(input());

    expect(verdict.decision).toBe(Decision.ALLOW_PARALLEL);
    expect(verdict.reasonCode).toBe(Reason.NO_QUALIFYING_COUPLING);
  });

  it('allows a genuinely independent pair: alpha and gamma never co-changed', () => {
    const verdict = arbitrate(
      input({ others: { ok: true, value: [intent('ilk-bbbbbbbb', [GAMMA])] } }),
    );

    expect(verdict.decision).toBe(Decision.ALLOW_PARALLEL);
    expect(verdict.couplings).toHaveLength(0);
  });

  it('carries the evidence it decided from, so an allow is auditable too', () => {
    const verdict = arbitrate(input());

    expect(verdict.evidenceRefs).toContain(`basis:${BASELINE_BASIS}`);
    expect(verdict.evidenceRefs.some((ref) => ref.startsWith('artifact:sha256:'))).toBe(true);
  });
});

describe('arbitrate — the unsafe composed pair', () => {
  /** A candidate that does not hold precedence against `ilk-aaaaaaaa`. */
  const laterCandidate = intent('ilk-zzzzzzzz', [ALPHA]);

  it('withholds alpha against beta, which real history shows co-changing', () => {
    const verdict = arbitrate(
      input({
        candidate: laterCandidate,
        others: { ok: true, value: [intent('ilk-aaaaaaaa', [BETA])] },
      }),
    );

    expect(verdict.decision).toBe(Decision.WITHHOLD_SERIALIZE);
    expect(verdict.reasonCode).toBe(Reason.COUPLING_OBSERVED);
  });

  it('names the coupling, its support, and both correlation ids in the rationale', () => {
    const verdict = arbitrate(
      input({
        candidate: laterCandidate,
        others: { ok: true, value: [intent('ilk-aaaaaaaa', [BETA])] },
      }),
    );

    const [coupling] = verdict.couplings;
    expect(coupling).toBeDefined();
    expect(coupling?.files).toEqual([ALPHA, BETA]);
    // Support 8 is what the pinned miner actually observed in the fixture
    // history — not a number this test chose.
    expect(coupling?.support).toBe(8);
    expect(coupling?.correlationIds).toEqual(['ilk-zzzzzzzz', 'ilk-aaaaaaaa']);
  });

  it('admits exactly one member of a coupled set, so serialization makes progress', () => {
    // Without precedence, two simultaneous coupled intents each observe the
    // other and both withhold — safe, but nothing ever proceeds.
    const leader = intent('ilk-aaaaaaaa', [ALPHA]);
    const follower = intent('ilk-zzzzzzzz', [BETA]);

    const leaderVerdict = arbitrate(
      input({ candidate: leader, others: { ok: true, value: [follower] } }),
    );
    const followerVerdict = arbitrate(
      input({ candidate: follower, others: { ok: true, value: [leader] } }),
    );

    expect(leaderVerdict.decision).toBe(Decision.ALLOW_SERIALIZED);
    expect(leaderVerdict.reasonCode).toBe(Reason.SERIALIZED_PRECEDENCE);
    expect(followerVerdict.decision).toBe(Decision.WITHHOLD_SERIALIZE);
  });

  it('breaks a timestamp tie deterministically, so both sides pick the same leader', () => {
    // Millisecond collisions happen precisely under the contention this rule
    // exists for. Two intents that each believed they led would compose the pair
    // the decision just refused.
    const sameInstant = '2026-08-13T12:00:00.000Z';
    const left = { ...intent('ilk-aaaaaaaa', [ALPHA]), recordedAt: sameInstant };
    const right = { ...intent('ilk-bbbbbbbb', [BETA]), recordedAt: sameInstant };

    const leftVerdict = arbitrate(input({ candidate: left, others: { ok: true, value: [right] } }));
    const rightVerdict = arbitrate(input({ candidate: right, others: { ok: true, value: [left] } }));

    expect([leftVerdict.decision, rightVerdict.decision].sort()).toEqual([
      Decision.ALLOW_SERIALIZED,
      Decision.WITHHOLD_SERIALIZE,
    ]);
  });

  it('gives precedence to the earlier intent regardless of correlation id order', () => {
    const earlier = { ...intent('ilk-zzzzzzzz', [ALPHA]), recordedAt: '2026-08-13T12:00:00.000Z' };
    const later = { ...intent('ilk-aaaaaaaa', [BETA]), recordedAt: '2026-08-13T12:00:05.000Z' };

    expect(arbitrate(input({ candidate: earlier, others: { ok: true, value: [later] } })).decision).toBe(
      Decision.ALLOW_SERIALIZED,
    );
    expect(arbitrate(input({ candidate: later, others: { ok: true, value: [earlier] } })).decision).toBe(
      Decision.WITHHOLD_SERIALIZE,
    );
  });

  it('ignores a coupling that lies inside a single intent', () => {
    // One intent writing both halves of a coupled pair is atomic, so it is not a
    // composition hazard. Only pairs straddling two writers matter.
    const verdict = arbitrate(input({ candidate: intent('ilk-aaaaaaaa', [ALPHA, BETA]) }));

    expect(verdict.decision).toBe(Decision.ALLOW_PARALLEL);
  });

  it('does not qualify a pair below the support threshold', () => {
    const evidence = evidenceCopy();
    const selection = evidence['selection'] as { pairs: { files: string[]; support: number }[] };
    selection.pairs = [{ files: [ALPHA, BETA], support: 2 }];

    const verdict = arbitrate(
      input({ evidence, others: { ok: true, value: [intent('ilk-bbbbbbbb', [BETA])] } }),
    );

    expect(verdict.decision).toBe(Decision.ALLOW_PARALLEL);
  });

  it('honours a policy that raises the threshold above the observed support', () => {
    const verdict = arbitrate(
      input({
        others: { ok: true, value: [intent('ilk-bbbbbbbb', [BETA])] },
        policy: { couplingMinSupport: 9 },
      }),
    );

    expect(verdict.decision).toBe(Decision.ALLOW_PARALLEL);
  });

  it('skips malformed pair entries without treating the artifact as clean', () => {
    const evidence = evidenceCopy();
    const selection = evidence['selection'] as { pairs: unknown[] };
    selection.pairs = [
      'not-a-pair',
      { files: [ALPHA] },
      { files: [ALPHA, 42] },
      { files: [ALPHA, BETA], support: 'many' },
      { files: [ALPHA, BETA], support: 8 },
    ];

    const verdict = arbitrate(
      input({
        evidence,
        candidate: intent('ilk-zzzzzzzz', [ALPHA]),
        others: { ok: true, value: [intent('ilk-aaaaaaaa', [BETA])] },
      }),
    );

    expect(verdict.decision).toBe(Decision.WITHHOLD_SERIALIZE);
    expect(verdict.couplings[0]?.occurrences).toBe(0);
  });
});

describe('arbitrate — missing is never green', () => {
  it('refuses when the pending-intent store cannot answer', () => {
    // The most dangerous omission: a store failure that fell through to "nothing
    // else in flight" would turn an outage into a permit.
    const verdict = arbitrate(input({ others: { ok: false, detail: 'connection refused' } }));

    expect(verdict.decision).toBe(Decision.INSUFFICIENT_EVIDENCE);
    expect(verdict.reasonCode).toBe(Reason.STORE_UNAVAILABLE);
  });

  it.each([
    ['absent', null, Reason.EVIDENCE_ABSENT],
    ['undefined', undefined, Reason.EVIDENCE_ABSENT],
    ['not an object', 'evidence', Reason.EVIDENCE_MALFORMED],
    ['carrying no selection', {}, Reason.EVIDENCE_MALFORMED],
  ])('refuses evidence that is %s', (_label, evidence, reasonCode) => {
    const verdict = arbitrate(input({ evidence }));

    expect(verdict.decision).toBe(Decision.INSUFFICIENT_EVIDENCE);
    expect(verdict.reasonCode).toBe(reasonCode);
  });

  it('refuses a selection missing completeness or pairs', () => {
    const evidence = evidenceCopy();
    delete (evidence['selection'] as Record<string, unknown>)['completeness'];

    const verdict = arbitrate(input({ evidence }));
    expect(verdict.reasonCode).toBe(Reason.EVIDENCE_MALFORMED);
  });

  it('refuses an unsupported selection version', () => {
    const evidence = evidenceCopy();
    (evidence['selection'] as Record<string, unknown>)['l0SelectionVersion'] = 2;

    const verdict = arbitrate(input({ evidence }));
    expect(verdict.reasonCode).toBe(Reason.EVIDENCE_VERSION_UNSUPPORTED);
  });

  it('refuses a history that was never mined, however few pairs it reports', () => {
    const evidence = evidenceCopy();
    const selection = evidence['selection'] as Record<string, unknown>;
    selection['completeness'] = { state: 'NOT_A_REPOSITORY', reason: 'X', detail: 'Y' };
    selection['pairs'] = [];

    const verdict = arbitrate(input({ evidence }));
    expect(verdict.decision).toBe(Decision.INSUFFICIENT_EVIDENCE);
    expect(verdict.reasonCode).toBe(Reason.HISTORY_NOT_MINED);
  });

  it('distinguishes evidence-unavailable from never-mined', () => {
    const evidence = evidenceCopy();
    (evidence['selection'] as Record<string, unknown>)['completeness'] = {
      state: 'EVIDENCE_UNAVAILABLE',
      reason: 'X',
      detail: 'Y',
    };

    expect(arbitrate(input({ evidence })).reasonCode).toBe(Reason.HISTORY_EVIDENCE_UNAVAILABLE);
  });

  it('refuses evidence mined from a different repository than the one requested', () => {
    // The HAC-330 finding: git walks up to the nearest repository, so a
    // well-formed MINED result can be about the wrong subject entirely.
    const evidence = evidenceCopy();
    (evidence['source'] as Record<string, unknown>)['isRequestedRepository'] = false;

    const verdict = arbitrate(input({ evidence }));
    expect(verdict.reasonCode).toBe(Reason.EVIDENCE_REPOSITORY_MISMATCH);
  });

  it('refuses evidence with no source attribution at all', () => {
    const evidence = evidenceCopy();
    delete evidence['source'];

    expect(arbitrate(input({ evidence })).reasonCode).toBe(Reason.EVIDENCE_REPOSITORY_MISMATCH);
  });

  it('refuses an unpinned observation', () => {
    const evidence = evidenceCopy();
    delete (evidence['selection'] as Record<string, unknown>)['scoringBasis'];

    expect(arbitrate(input({ evidence })).reasonCode).toBe(Reason.NO_BASIS_PIN);
  });

  it('refuses evidence pinned to a revision other than the one being mutated', () => {
    const verdict = arbitrate(input({ sourceRevision: '0000000000000000000000000000000000000000' }));

    expect(verdict.decision).toBe(Decision.INSUFFICIENT_EVIDENCE);
    expect(verdict.reasonCode).toBe(Reason.STALE_BASIS);
    // Still reports what it read, so the denial is actionable.
    expect(verdict.evidenceRefs).toContain(`basis:${BASELINE_BASIS}`);
  });

  it('never returns ALLOW_PARALLEL from any guard failure', () => {
    const brokenEvidence = evidenceCopy();
    delete brokenEvidence['source'];

    const failures: ArbitrationInput[] = [
      input({ others: { ok: false, detail: 'down' } }),
      input({ evidence: null }),
      input({ evidence: 'x' }),
      input({ evidence: {} }),
      input({ evidence: brokenEvidence }),
      input({ sourceRevision: 'drifted' }),
    ];

    for (const failure of failures) {
      expect(arbitrate(failure).decision).toBe(Decision.INSUFFICIENT_EVIDENCE);
    }
  });
});

describe('pairKey', () => {
  it('is order independent', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });

  it('cannot be collided by a path containing the separator', () => {
    // The separator is NUL precisely because no path can contain it.
    expect(pairKey('a/b', 'c')).not.toBe(pairKey('a', 'b/c'));
  });
});
