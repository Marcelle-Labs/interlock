/**
 * The retry policy, and the falsification it used to hide.
 *
 * ## What was wrong
 *
 * The attempt loop retried until `satisfactory`, and `satisfactory` was the
 * outcome the hypothesis predicts: `COMPOSITION_WITHHELD` for the treatment arm,
 * `BOTH_EXECUTED` for the others. Any attempt that disagreed with the hypothesis
 * was therefore retried — including the one attempt that would have refuted it.
 *
 * Worse, that attempt had no label of its own. A treatment attempt in which the
 * two requests **did** overlap at the ingress and Interlock **did not** withhold
 * was recorded `NO_OVERLAP_OBSERVED` — the label for a missed concurrency window
 * — and given two more chances to come out differently, in a packet that
 * asserted `forbiddenTechniques.cherryPickedAttempt: false`.
 *
 * ## The three branches, each proved here
 *
 *   no legitimate runtime overlap        retry, attempt retained
 *   valid intents + overlap + no hold    TERMINAL, not relabelled, not retried
 *   model deviation                      INVALID_TRIAL, consumes one of three
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AttemptDisposition,
  Outcome,
  dispositionOf,
  retainAttempt,
  retryPolicy,
  runAttempts,
  treatmentOutcome,
} from '../bin/run-arm.mjs';
import { MODEL_FAILURE, TrialVerdict, classifyArrivals } from '../src/trial.mjs';
import { disjointPair, overlappingPair } from './_arrivals.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(readFileSync(join(experimentDir, 'evidence', 'results.json'), 'utf8'));

/**
 * An attempt result carrying everything `retainAttempt` insists on.
 *
 * The arrivals are the ingress records, not a stripped pair of timestamps: the
 * disposition is decided partly on who arrived and how often, so a fixture that
 * left that out would be exercising a different function from the real one.
 */
function attemptResult({ outcome, executedCount = 0, overlapped = true, trial = null, overlap }) {
  const arrivals = overlap ?? (overlapped ? overlappingPair() : disjointPair());
  return {
    arm: 'treatment',
    outcome,
    trial,
    intents: { A: { digest: 'sha256:a', service: 'alpha' } },
    decisions: [],
    executed: Array.from({ length: executedCount }, (_, index) => ({ correlationId: `e-${index}` })),
    commits: [],
    overlap: arrivals,
    ingressRetry: classifyArrivals(arrivals),
    globalVerification: { total: 120, cap: 130, holds: true },
  };
}

/** A trial classification in the shape `classifyTrial` returns. */
const invalidTrial = {
  valid: false,
  verdict: TrialVerdict.INVALID_TRIAL,
  classification: MODEL_FAILURE,
  compositionVerdict: null,
  deviations: [{ arm: 'treatment', agent: 'A', code: 'ARGUMENT_DRIFT', detail: 'fabricated' }],
};
const validTrial = {
  valid: true,
  verdict: TrialVerdict.VALID,
  classification: null,
  compositionVerdict: null,
  deviations: [],
};

describe('the label a treatment attempt gets', () => {
  it('is COMPOSITION_WITHHELD when Interlock withheld', () => {
    expect(treatmentOutcome({ withheld: true, overlapped: true })).toBe(
      Outcome.COMPOSITION_WITHHELD,
    );
  });

  it('is NO_OVERLAP_OBSERVED only when the requests did not overlap', () => {
    expect(treatmentOutcome({ withheld: false, overlapped: false })).toBe(
      Outcome.NO_OVERLAP_OBSERVED,
    );
  });

  it('is COMPOSITION_NOT_WITHHELD when they overlapped and both were allowed', () => {
    // The whole point. This case used to be spelled NO_OVERLAP_OBSERVED, which
    // said the experiment never got to ask its question, when in fact it asked
    // and got the answer the hypothesis forbids.
    const outcome = treatmentOutcome({ withheld: false, overlapped: true });

    expect(outcome).toBe(Outcome.COMPOSITION_NOT_WITHHELD);
    expect(outcome).not.toBe(Outcome.NO_OVERLAP_OBSERVED);
  });
});

describe('branch 1 — no legitimate runtime overlap', () => {
  it('is retry eligible, and the attempt is retained', () => {
    const attempt = attemptResult({ outcome: Outcome.NO_OVERLAP_OBSERVED, overlapped: false });
    const disposition = dispositionOf('treatment', attempt);

    expect(disposition.code).toBe(AttemptDisposition.RETRY_MISSED_WINDOW);
    expect(disposition.retry).toBe(true);

    const retained = retainAttempt(1, 'treatment', attempt, disposition);
    expect(retained.retained).toBe(true);
    expect(retained.detail).toBe(attempt);
    expect(retained.outcome).toBe(Outcome.NO_OVERLAP_OBSERVED);
  });

  it('is retried up to the budget and no further', async () => {
    let calls = 0;
    const { attempts } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return attemptResult({ outcome: Outcome.NO_OVERLAP_OBSERVED, overlapped: false });
      },
    });

    expect(calls).toBe(3);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(attempts.every((entry) => entry.retained)).toBe(true);
  });

  it('stops as soon as the window is caught', async () => {
    let calls = 0;
    const { attempts } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return calls === 1
          ? attemptResult({ outcome: Outcome.NO_OVERLAP_OBSERVED, overlapped: false })
          : attemptResult({ outcome: Outcome.COMPOSITION_WITHHELD, executedCount: 1 });
      },
    });

    expect(calls).toBe(2);
    expect(attempts.map((entry) => entry.disposition.code)).toEqual([
      AttemptDisposition.RETRY_MISSED_WINDOW,
      AttemptDisposition.SATISFIED,
    ]);
  });
});

describe('branch 2 — valid intents, real overlap, Interlock did not withhold', () => {
  const falsifying = () =>
    attemptResult({
      outcome: Outcome.COMPOSITION_NOT_WITHHELD,
      executedCount: 2,
      overlapped: true,
      trial: validTrial,
    });

  it('is terminal for the experiment', () => {
    const disposition = dispositionOf('treatment', falsifying());

    expect(disposition.code).toBe(AttemptDisposition.TERMINAL_COMPOSITION_FAILURE);
    expect(disposition.retry).toBe(false);
  });

  it('is not relabelled as a missed window', () => {
    const retained = retainAttempt(1, 'treatment', falsifying());

    expect(retained.outcome).toBe(Outcome.COMPOSITION_NOT_WITHHELD);
    expect(retained.outcome).not.toBe(Outcome.NO_OVERLAP_OBSERVED);
    // The ingress measured the overlap; the record must not deny it.
    expect(retained.overlapped).toBe(true);
  });

  it('is not retried looking for a favourable result', async () => {
    let calls = 0;
    const { attempts } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return falsifying();
      },
    });

    expect(calls).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].disposition.code).toBe(AttemptDisposition.TERMINAL_COMPOSITION_FAILURE);
    expect(attempts[0].retained).toBe(true);
  });

  it('would have been retried twice more under the old rule', async () => {
    // The control: the same attempt under "retry until the predicted outcome"
    // consumes the whole budget. This test fails if the terminal branch is
    // removed and the loop goes back to searching.
    let calls = 0;
    await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return falsifying();
      },
    });

    expect(calls).not.toBe(3);
  });
});

describe('branch 3 — the model deviated', () => {
  it('is an invalid trial, never a composition verdict', () => {
    const attempt = attemptResult({
      outcome: Outcome.COMPOSITION_NOT_WITHHELD,
      overlapped: true,
      trial: invalidTrial,
    });
    const disposition = dispositionOf('treatment', attempt);

    // Validity is decided first: a model that proposed the wrong thing has
    // nothing to say about composition, so this cannot be read as Interlock
    // failing to withhold a request it was never asked to arbitrate.
    expect(disposition.code).toBe(AttemptDisposition.RETRY_INVALID_TRIAL);
    expect(disposition.classification).toBe(MODEL_FAILURE);
  });

  it('consumes one of the three attempts', async () => {
    let calls = 0;
    const { attempts } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return attemptResult({
          outcome: Outcome.NO_OVERLAP_OBSERVED,
          overlapped: false,
          trial: invalidTrial,
        });
      },
    });

    expect(calls).toBe(3);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((entry) => entry.disposition.code)).toEqual([
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
    ]);
  });

  it('does not arise when no model was in the loop', () => {
    const attempt = attemptResult({ outcome: Outcome.COMPOSITION_WITHHELD, trial: null });

    expect(dispositionOf('treatment', attempt).code).toBe(AttemptDisposition.SATISFIED);
  });
});

describe('the arms with no retryable branch', () => {
  for (const armName of ['baseline', 'perturbation']) {
    it(`${armName}: BOTH_EXECUTED satisfies and nothing else is retried`, async () => {
      expect(
        dispositionOf(armName, attemptResult({ outcome: Outcome.BOTH_EXECUTED, executedCount: 2 }))
          .code,
      ).toBe(AttemptDisposition.SATISFIED);

      let calls = 0;
      const { attempts } = await runAttempts({
        armName,
        maxAttempts: 3,
        attempt: () => {
          calls += 1;
          return attemptResult({ outcome: Outcome.INCOMPLETE, executedCount: 1 });
        },
      });

      expect(calls).toBe(1);
      expect(attempts[0].disposition.code).toBe(AttemptDisposition.TERMINAL_INCOMPLETE);
    });
  }
});

describe('the packet states the policy rather than implying it', () => {
  it('records the retryable and terminal dispositions', () => {
    const policy = results.concurrency.retryPolicy;

    expect(policy).toEqual(retryPolicy(results.concurrency.maxAttempts));
    expect(policy.retryable).toContain(AttemptDisposition.RETRY_MISSED_WINDOW);
    expect(policy.retryable).toContain(AttemptDisposition.RETRY_INVALID_TRIAL);
    expect(policy.terminal).toContain(AttemptDisposition.TERMINAL_COMPOSITION_FAILURE);
    expect(policy.relabelsFalsificationAsMissedWindow).toBe(false);
    expect(policy.invalidTrialConsumesAnAttempt).toBe(true);
  });

  it('gives every retained attempt a disposition', () => {
    for (const [armName, attempts] of Object.entries(results.concurrency.attemptsByArm)) {
      for (const attempt of attempts) {
        expect(attempt.disposition, `${armName} attempt ${attempt.index}`).toBeDefined();
        expect(Object.values(AttemptDisposition)).toContain(attempt.disposition.code);
        expect(typeof attempt.disposition.why).toBe('string');
      }
    }
  });

  it('names the cherry-picking shape it claims not to have', () => {
    expect(results.forbiddenTechniques.falsificationRelabelledAsMissedWindow).toBe(false);
    expect(results.forbiddenTechniques.retriedAfterCompositionFailure).toBe(false);
    expect(results.forbiddenTechniques.cherryPickedAttempt).toBe(false);
  });
});
