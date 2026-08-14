/**
 * B1 — the driver survives its own retry detector firing.
 *
 * ## What was wrong
 *
 * The ingress answers a refused duplicate with `{ correlationId, duplicateArrival:
 * true, ... }` and **no `outcome`**, because nothing was dispatched and there is
 * no outcome to report. Both arm loops dereferenced `result.outcome`
 * unconditionally — `outcome.authorized` in the baseline arm, `result.outcome
 * .response` in the Interlock arms — so the first time the detector fired, the
 * driver threw:
 *
 *     TypeError: Cannot read properties of undefined (reading 'authorized')
 *
 * exited 1, and never wrote `results.json`.
 *
 * Three consequences, and this file is the control for each:
 *
 *   1. `dispositionOf`'s `RUNTIME_RETRY` branch was dead code on the real driver.
 *      It had unit coverage over hand-built arrival fixtures and no coverage at
 *      all over an arm that actually produced a duplicate.
 *   2. The attempt that observed the retry was the one attempt that could not be
 *      retained — which is precisely what X-05 forbids.
 *   3. On Agent Runtime, where ADK 2.6.3 really does retry
 *      `McpTool._run_async_impl` once with a fresh session, the *first* platform
 *      retry would have killed the run rather than been recorded by it.
 *
 * ## What is proved here
 *
 * Real arms, over real sockets, against real `ProtectedTarget`s behind their own
 * HTTP adapters, with a duplicate arrival injected the way a platform retry
 * produces one: the same agent's invocation re-sent under the same tool
 * invocation id. Nothing here is a stand-in for the driver — these are the
 * driver's own arm functions.
 */
import { describe, expect, it } from 'vitest';

import {
  AttemptDisposition,
  Outcome,
  RUNTIME_RETRY_TRIAL_SOURCE,
  attemptBaseline,
  attemptInterlock,
  dispositionOf,
  overlapOf,
  retainAttempt,
  runAttempts,
} from '../bin/run-arm.mjs';
import { Timeline } from '../src/timeline.mjs';
import { RUNTIME_RETRY, TrialVerdict } from '../src/trial.mjs';

/** The arrivals an attempt refused to dispatch. */
const refused = (attempt) => attempt.overlap.filter((entry) => entry.duplicateOfOrdinal !== null);

describe('B1: a refused duplicate does not kill the arm that detected it', () => {
  it('carries a treatment attempt through to a retained, disqualifying record', async () => {
    // Without the fix this line throws inside attemptInterlock and the test ends
    // here: `TypeError: Cannot read properties of undefined (reading 'response')`.
    const attempt = await attemptInterlock('treatment', new Timeline(), {
      duplicateArrivalFrom: 'A',
    });

    // The detector fired, on the real path.
    expect(attempt.ingressRetry.supplied).toBe(true);
    expect(attempt.ingressRetry.arrivalCount).toBe(3);
    expect(attempt.ingressRetry.retryObserved).toBe(true);
    expect(attempt.ingressRetry.duplicates).toHaveLength(1);
    expect(attempt.ingressRetry.arrivalsByExpectedAgent).toEqual({ A: 2, B: 1 });
    expect(attempt.ingressRetry.acceptable).toBe(false);

    // The refused arrival is retained, and it reached nothing.
    expect(refused(attempt)).toHaveLength(1);
    const [duplicate] = refused(attempt);
    expect(duplicate.dispatched).toBe(false);
    expect(duplicate.duplicateOfOrdinal).not.toBeNull();
    expect(attempt.decisions.map((entry) => entry.correlationId)).not.toContain(
      duplicate.correlationId,
    );
    expect(attempt.executed.map((entry) => entry.correlationId)).not.toContain(
      duplicate.correlationId,
    );
    // Two arrivals were dispatched, and at most those two were arbitrated.
    expect(attempt.overlap.filter((entry) => entry.dispatched)).toHaveLength(2);
    expect(attempt.decisions.length).toBeLessThanOrEqual(2);

    // And it is a trial verdict, not silence.
    expect(attempt.trial).not.toBeNull();
    expect(attempt.trial.verdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
    expect(attempt.trialSource).toBe(RUNTIME_RETRY_TRIAL_SOURCE);

    // Two A arrivals are never an A/B overlap, whatever the stamps say.
    expect(overlapOf(attempt.overlap).overlapped).toBe(false);

    const disposition = dispositionOf('treatment', attempt);
    expect(disposition.code).toBe(AttemptDisposition.RETRY_INVALID_TRIAL);
    expect(disposition.classification).toBe(RUNTIME_RETRY);
    expect(disposition.consumesAttempt).toBe(true);

    // Retained whole, which is the half of X-05 the crash removed entirely.
    const retained = retainAttempt(1, 'treatment', attempt, disposition);
    expect(retained.retained).toBe(true);
    expect(retained.detail).toBe(attempt);
    expect(retained.disposition.code).toBe(AttemptDisposition.RETRY_INVALID_TRIAL);
  });

  it('carries a baseline attempt through the same branch', async () => {
    // The baseline loop read `outcome.authorized`, so it threw on a different
    // line for the same reason. Both arms need the branch, and an arm-neutral
    // detector is worthless if only one arm can survive it.
    const attempt = await attemptBaseline(new Timeline(), { duplicateArrivalFrom: 'B' });

    expect(attempt.ingressRetry.retryObserved).toBe(true);
    expect(attempt.ingressRetry.arrivalsByExpectedAgent).toEqual({ A: 1, B: 2 });
    expect(refused(attempt)).toHaveLength(1);
    expect(refused(attempt)[0].dispatched).toBe(false);
    // The duplicate minted no receipt and caused no second mutation: the
    // baseline arm still executes exactly the two intents it was given.
    expect(attempt.executed).toHaveLength(2);
    expect(attempt.commits).toHaveLength(2);
    expect(attempt.outcome).toBe(Outcome.BOTH_EXECUTED);
    expect(dispositionOf('baseline', attempt).code).toBe(AttemptDisposition.RETRY_INVALID_TRIAL);
  });

  it('spends the whole budget on duplicates and retains every attempt', async () => {
    // The end-to-end shape the crash made unreachable: three real attempts, each
    // one disqualified by the ingress, all three retained, and no attempt
    // supporting a PASS however the arm's own numbers came out.
    const timeline = new Timeline();
    let calls = 0;
    const { attempts, result } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return attemptInterlock('treatment', timeline, { duplicateArrivalFrom: 'A' });
      },
    });

    expect(calls).toBe(3);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((entry) => entry.disposition.code)).toEqual([
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
    ]);
    expect(attempts.every((entry) => entry.retained)).toBe(true);
    expect(attempts.every((entry) => entry.detail.ingressRetry.retryObserved)).toBe(true);
    expect(result.attempts).toBe(attempts);
  });

  it('sees no duplicate when none is injected, so the detector is not always on', async () => {
    // The control. If an unforced attempt also reported a retry, the three
    // assertions above would be about a detector that fires on everything.
    const attempt = await attemptInterlock('treatment', new Timeline());

    expect(attempt.ingressRetry.arrivalCount).toBe(2);
    expect(attempt.ingressRetry.retryObserved).toBe(false);
    expect(attempt.ingressRetry.acceptable).toBe(true);
    expect(refused(attempt)).toEqual([]);
    expect(attempt.trial).toBeNull();
  });
});
