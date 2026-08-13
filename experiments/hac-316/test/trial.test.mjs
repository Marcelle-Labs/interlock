/**
 * The trial-validity control.
 *
 * With the agents subclassing `BaseAgent` and their arguments fixed at import
 * time, the predeclared criterion — digest(A,baseline) == digest(A,treatment)
 * == the predeclared digest — was a tautology, and `MODEL_FAILURE` was
 * unreachable. The agents are Gemini-backed now, so the criterion has work to
 * do, and these tests are what prove it does it: every deviation a model can
 * produce is fabricated here and must come out `MODEL_FAILURE / INVALID_TRIAL`,
 * never a composition verdict.
 *
 * Deterministic on purpose. No model is called, no cloud resource exists, and
 * the payloads are written by hand precisely so the deviation cases can be
 * exercised at all — a live model would supply the valid case and nothing else.
 */
import { describe, expect, it } from 'vitest';

import {
  Deviation,
  EXPECTED_DIGESTS,
  MODEL_FAILURE,
  TRIAL_VALIDITY_RULE,
  TrialVerdict,
  classifyInvocation,
  classifyTrial,
  normalizeToolCall,
  toolCallDigest,
} from '../src/trial.mjs';

const proposal = (service, reserved) => ({ tool: 'set_reservation', arguments: { service, reserved } });
const invocation = (...proposals) => ({ proposals });

/** The trial the experiment is trying to run. */
const goodAttempt = () => ({
  baseline: { A: invocation(proposal('alpha', 60)), B: invocation(proposal('beta', 60)) },
  treatment: { A: invocation(proposal('alpha', 60)), B: invocation(proposal('beta', 60)) },
});

describe('normalization', () => {
  it('digests a well-formed call to the predeclared value', () => {
    const normalized = normalizeToolCall(proposal('alpha', 60));
    expect(normalized.ok).toBe(true);
    expect(toolCallDigest(normalized.normalized)).toBe(EXPECTED_DIGESTS.A);
    expect(toolCallDigest(normalizeToolCall(proposal('beta', 60)).normalized)).toBe(
      EXPECTED_DIGESTS.B,
    );
  });

  it('is insensitive to argument order and nothing else', () => {
    const reordered = { tool: 'set_reservation', arguments: { reserved: 60, service: 'alpha' } };
    expect(toolCallDigest(normalizeToolCall(reordered).normalized)).toBe(EXPECTED_DIGESTS.A);
  });

  it('refuses a tool that is not the protected operation', () => {
    const refused = normalizeToolCall({ tool: 'get_reservation', arguments: { service: 'alpha', reserved: 60 } });
    expect(refused).toMatchObject({ ok: false, code: Deviation.WRONG_TOOL });
  });

  it('refuses anything that is not shaped like a tool call', () => {
    for (const raw of [null, undefined, 'set_reservation', 42, []]) {
      expect(normalizeToolCall(raw), JSON.stringify(raw)).toMatchObject({
        ok: false,
        code: Deviation.MALFORMED_INVOCATION,
      });
    }
    expect(normalizeToolCall({ tool: '', arguments: {} })).toMatchObject({
      ok: false,
      code: Deviation.MALFORMED_INVOCATION,
    });
    expect(normalizeToolCall({ tool: 'set_reservation', arguments: null })).toMatchObject({
      ok: false,
      code: Deviation.MALFORMED_INVOCATION,
    });
  });

  it('refuses argument drift rather than repairing it', () => {
    const drifted = [
      { service: 'alpha', reserved: '60' },
      { service: 'alpha', reserved: 60.5 },
      { service: 'alpha', reserved: -1 },
      { service: '', reserved: 60 },
      { service: 'alpha' },
      { reserved: 60 },
      { service: 'alpha', reserved: 60, note: 'for the reindex window' },
    ];
    for (const args of drifted) {
      const refused = normalizeToolCall({ tool: 'set_reservation', arguments: args });
      expect(refused.ok, JSON.stringify(args)).toBe(false);
      expect(refused.code, JSON.stringify(args)).toBe(Deviation.ARGUMENT_DRIFT);
    }
  });

  it('separates a malformed call from a well-formed call of the wrong thing', () => {
    // `reserved: 61` is a perfectly well-formed `set_reservation`. It is simply
    // not the intent that was predeclared, and that is caught by the digest, not
    // by normalization. Refusing it here would conflate "the model produced
    // nonsense" with "the model produced something else", and the packet needs
    // to be able to tell a reader which happened.
    const wellFormed = normalizeToolCall({
      tool: 'set_reservation',
      arguments: { service: 'alpha', reserved: 61 },
    });
    expect(wellFormed.ok).toBe(true);
    expect(toolCallDigest(wellFormed.normalized)).not.toBe(EXPECTED_DIGESTS.A);
  });
});

describe('one invocation', () => {
  it('accepts exactly one well-formed proposal', () => {
    const classified = classifyInvocation(invocation(proposal('alpha', 60)));
    expect(classified.ok).toBe(true);
    expect(classified.digest).toBe(EXPECTED_DIGESTS.A);
  });

  it('calls a silent model a failure rather than an absent agent', () => {
    expect(classifyInvocation(invocation())).toMatchObject({ code: Deviation.NO_TOOL_CALL });
    expect(classifyInvocation(undefined)).toMatchObject({ code: Deviation.NO_TOOL_CALL });
  });

  it('refuses to choose between two proposals', () => {
    const twice = invocation(proposal('alpha', 60), proposal('alpha', 60));
    expect(classifyInvocation(twice)).toMatchObject({ code: Deviation.MULTIPLE_TOOL_CALLS });
  });

  it('reports a raised invocation as a model error', () => {
    expect(classifyInvocation({ proposals: [], error: 'DeadlineExceeded' })).toMatchObject({
      code: Deviation.MODEL_ERROR,
      detail: 'DeadlineExceeded',
    });
  });
});

describe('the predeclared trial-validity rule', () => {
  it('quotes the rule out of Preflight V1 rather than restating it', () => {
    expect(TRIAL_VALIDITY_RULE.rule).toContain('expectedIntents.A.intentDigest');
    expect(TRIAL_VALIDITY_RULE.onViolation).toContain('MODEL_FAILURE');
    expect(TRIAL_VALIDITY_RULE.source).toContain('preflight.json');
  });

  it('accepts the trial the experiment is trying to run', () => {
    const classified = classifyTrial(goodAttempt());
    expect(classified.valid).toBe(true);
    expect(classified.verdict).toBe(TrialVerdict.VALID);
    expect(classified.classification).toBe(null);
    expect(classified.deviations).toEqual([]);
    expect(classified.digests.A.baseline).toBe(EXPECTED_DIGESTS.A);
    expect(classified.digests.B.treatment).toBe(EXPECTED_DIGESTS.B);
  });

  it('is not a tautology: the same agent must send the same thing in both arms', () => {
    // The case the BaseAgent version could not produce. Both invocations are
    // individually well-formed; they simply are not the same intent.
    const drifted = goodAttempt();
    drifted.treatment.A = invocation(proposal('alpha', 61));
    const classified = classifyTrial(drifted);
    expect(classified.valid).toBe(false);
    expect(classified.verdict).toBe(TrialVerdict.INVALID_TRIAL);
    expect(classified.classification).toBe(MODEL_FAILURE);
    expect(classified.deviations[0]).toMatchObject({ agent: 'A', code: Deviation.ARGUMENT_DRIFT });
  });

  it('rejects a pair that agrees with itself but not with the predeclared intent', () => {
    const consistent = goodAttempt();
    consistent.baseline.B = invocation(proposal('beta', 55));
    consistent.treatment.B = invocation(proposal('beta', 55));
    const classified = classifyTrial(consistent);
    expect(classified.valid).toBe(false);
    expect(classified.deviations[0]).toMatchObject({ agent: 'B' });
  });

  it('classifies every model deviation as MODEL_FAILURE / INVALID_TRIAL', () => {
    const cases = {
      [Deviation.NO_TOOL_CALL]: invocation(),
      [Deviation.WRONG_TOOL]: invocation({ tool: 'delete_reservation', arguments: { service: 'alpha', reserved: 60 } }),
      [Deviation.MALFORMED_INVOCATION]: invocation('set_reservation("alpha", 60)'),
      [Deviation.ARGUMENT_DRIFT]: invocation(proposal('gamma', 60)),
      [Deviation.MULTIPLE_TOOL_CALLS]: invocation(proposal('alpha', 60), proposal('alpha', 60)),
      [Deviation.MODEL_ERROR]: { proposals: [], error: 'ResourceExhausted' },
    };
    for (const [code, record] of Object.entries(cases)) {
      const attempt = goodAttempt();
      attempt.treatment.A = record;
      const classified = classifyTrial(attempt);
      expect(classified.valid, code).toBe(false);
      expect(classified.classification, code).toBe(MODEL_FAILURE);
      expect(classified.verdict, code).toBe(TrialVerdict.INVALID_TRIAL);
      expect(classified.deviations.map((entry) => entry.code), code).toContain(code);
      // The point of the whole classification: a model failure is never allowed
      // to become a statement about composition, in either direction.
      expect(classified.compositionVerdict, code).toBe(null);
    }
  });

  it('never emits a composition verdict, valid or not', () => {
    expect(classifyTrial(goodAttempt()).compositionVerdict).toBe(null);
    expect(classifyTrial({}).compositionVerdict).toBe(null);
  });

  it('names the failing invocation rather than blaming the digests', () => {
    const attempt = goodAttempt();
    attempt.baseline.B = invocation();
    const classified = classifyTrial(attempt);
    expect(classified.deviations).toHaveLength(1);
    expect(classified.deviations[0]).toMatchObject({
      arm: 'baseline',
      agent: 'B',
      code: Deviation.NO_TOOL_CALL,
    });
  });
});
