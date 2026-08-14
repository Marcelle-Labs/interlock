/**
 * The classifier is on the path, not beside it.
 *
 * ## What was wrong
 *
 * `classifyTrial` had zero references outside `src/trial.mjs` and its own unit
 * test. `bin/run-arm.mjs` imported three constants from that module to fill in a
 * description block, and recorded
 * `classifiedBy: 'experiments/hac-316/src/trial.mjs'` — a provenance claim for
 * work that never happened. The component existed, imported, and had unit tests;
 * the path that claimed to use it did not call it.
 *
 * These tests hold the driver to actually running it. Two of them cannot pass
 * unless `classifyTrial` really executes over the captured proposals:
 *
 *   - a deviant capture must come out `INVALID_TRIAL / MODEL_FAILURE`, which a
 *     hardcoded record could not produce;
 *   - the recorded digests must equal the predeclared ones, which are computed
 *     by the frozen `intentDigest` and not copyable from anything the driver
 *     already holds in that shape.
 *
 * And one holds the claim itself: `classifiedBy` is derived from whether a
 * classification exists, so deleting the call empties the claim rather than
 * leaving it behind.
 *
 * No model is called and no cloud resource exists. The proposals are fabricated,
 * in exactly the session-state shape the ADK callbacks write, and the packet
 * says so.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AGENTS,
  ProposalOrigin,
  classifyCapturedProposals,
  fabricatedSessionState,
  localCaptures,
  modelTrialRecord,
} from '../bin/run-arm.mjs';
import {
  Deviation,
  EXPECTED_DIGESTS,
  MODEL_FAILURE,
  PROPOSED_TOOL_CALLS_KEY,
  ProposalPhase,
  TRIAL_VALIDITY_RULE,
  TrialVerdict,
  invocationFromSessionState,
} from '../src/trial.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(readFileSync(join(experimentDir, 'evidence', 'results.json'), 'utf8'));

describe('capture: one tool call is one proposal', () => {
  it('reads the proposed phase out of a two-record trail', () => {
    const state = fabricatedSessionState('A', { arm: 'treatment' });
    const trail = state[PROPOSED_TOOL_CALLS_KEY];

    expect(trail).toHaveLength(2);
    expect(trail.map((record) => record.phase)).toEqual([
      ProposalPhase.PROPOSED,
      ProposalPhase.RESPONDED,
    ]);
    expect(invocationFromSessionState(state).proposals).toHaveLength(1);
  });

  it('counts a genuine second call as a second proposal', () => {
    const first = fabricatedSessionState('A', { arm: 'treatment' });
    const second = fabricatedSessionState('A', { arm: 'treatment', args: { service: 'alpha', reserved: 70 } });
    const state = {
      [PROPOSED_TOOL_CALLS_KEY]: [
        ...first[PROPOSED_TOOL_CALLS_KEY],
        ...second[PROPOSED_TOOL_CALLS_KEY],
      ],
    };

    expect(invocationFromSessionState(state).proposals).toHaveLength(2);
  });

  it('reads an absent capture as no tool call rather than an error', () => {
    expect(invocationFromSessionState(undefined)).toEqual({ proposals: [] });
    expect(invocationFromSessionState({})).toEqual({ proposals: [] });
    expect(invocationFromSessionState(undefined, 'the model raised').error).toBe('the model raised');
  });
});

describe('classify: the driver runs the real classifier', () => {
  it('classifies the well-formed local captures VALID, with the predeclared digests', () => {
    const trial = classifyCapturedProposals(localCaptures());

    expect(trial.valid).toBe(true);
    expect(trial.verdict).toBe(TrialVerdict.VALID);
    expect(trial.classification).toBeNull();
    expect(trial.compositionVerdict).toBeNull();
    for (const id of Object.keys(EXPECTED_DIGESTS)) {
      expect(trial.digests[id].baseline, id).toBe(EXPECTED_DIGESTS[id]);
      expect(trial.digests[id].treatment, id).toBe(EXPECTED_DIGESTS[id]);
    }
  });

  it('would classify one well-formed call MULTIPLE_TOOL_CALLS if the response counted', () => {
    // The A3 regression, stated as the thing the classifier must not say about
    // a model that did exactly what it was asked.
    const trial = classifyCapturedProposals(localCaptures());
    expect(trial.deviations).toEqual([]);
  });

  it('classifies a deviant capture MODEL_FAILURE / INVALID_TRIAL', () => {
    const captures = localCaptures();
    captures.treatment.A = {
      sessionState: fabricatedSessionState('A', {
        arm: 'treatment',
        args: { service: 'alpha', reserved: '60' },
      }),
    };
    const trial = classifyCapturedProposals(captures);

    expect(trial.valid).toBe(false);
    expect(trial.verdict).toBe(TrialVerdict.INVALID_TRIAL);
    expect(trial.classification).toBe(MODEL_FAILURE);
    // Never a composition verdict, whichever way it came out.
    expect(trial.compositionVerdict).toBeNull();
    expect(trial.deviations).toContainEqual(
      expect.objectContaining({ arm: 'treatment', agent: 'A', code: Deviation.ARGUMENT_DRIFT }),
    );
  });

  it('classifies a wrong tool and a silent model as model failures', () => {
    const wrongTool = localCaptures();
    wrongTool.baseline.B = {
      sessionState: fabricatedSessionState('B', { arm: 'baseline', tool: 'get_reservation' }),
    };
    expect(classifyCapturedProposals(wrongTool).deviations).toContainEqual(
      expect.objectContaining({ agent: 'B', code: Deviation.WRONG_TOOL }),
    );

    const silent = localCaptures();
    silent.treatment.B = { sessionState: {} };
    expect(classifyCapturedProposals(silent).deviations).toContainEqual(
      expect.objectContaining({ agent: 'B', code: Deviation.NO_TOOL_CALL }),
    );

    const raised = localCaptures();
    raised.treatment.A = { sessionState: {}, error: 'the invocation raised' };
    expect(classifyCapturedProposals(raised).deviations).toContainEqual(
      expect.objectContaining({ agent: 'A', code: Deviation.MODEL_ERROR }),
    );
  });
});

describe('the classifiedBy claim tracks whether the classifier ran', () => {
  it('names the classifier only when a classification exists', () => {
    const record = modelTrialRecord({
      origin: ProposalOrigin.LOCAL_FABRICATED,
      captures: localCaptures(),
    });

    expect(record.trial).not.toBeNull();
    expect(record.validity.classifiedBy).toMatch(/classifyTrial/);
    expect(record.validity.classifiedBy).toMatch(/run-arm\.mjs/);
  });

  it('returns what the classifier returned, not a record that resembles one', () => {
    // The load-bearing assertion. A `modelTrialRecord` that filled `trial` in
    // from a literal — which is what the old `classifiedBy` string amounted to —
    // passes every test that only looks at the well-formed case. It cannot pass
    // this one: the verdict has to change with the capture.
    const deviant = localCaptures();
    deviant.baseline.B = {
      sessionState: fabricatedSessionState('B', { arm: 'baseline', tool: 'delete_reservation' }),
    };
    const record = modelTrialRecord({
      origin: ProposalOrigin.LOCAL_FABRICATED,
      captures: deviant,
    });

    expect(record.trial.valid).toBe(false);
    expect(record.trial.verdict).toBe(TrialVerdict.INVALID_TRIAL);
    expect(record.trial.classification).toBe(MODEL_FAILURE);
    expect(record.trial.deviations).toContainEqual(
      expect.objectContaining({ arm: 'baseline', agent: 'B', code: Deviation.WRONG_TOOL }),
    );
    // And it is the classifier's own output, term for term.
    expect(record.trial).toEqual(classifyCapturedProposals(deviant));
  });

  it('records no classifier at all when nothing was classified', () => {
    const record = modelTrialRecord({ origin: ProposalOrigin.LOCAL_FABRICATED, captures: undefined });

    expect(record.trial).toBeNull();
    expect(record.validity.classifiedBy).toBeNull();
  });

  it('refuses an origin it cannot describe', () => {
    expect(() => modelTrialRecord({ origin: 'made-up', captures: localCaptures() })).toThrow(
      /unknown proposal origin/,
    );
  });

  it('says whether the proposals are evidence, separately from whether they classified', () => {
    const local = modelTrialRecord({
      origin: ProposalOrigin.LOCAL_FABRICATED,
      captures: localCaptures(),
    });
    expect(local.executed).toBe(false);
    expect(local.proposals.isEvidence).toBe(false);
    expect(local.proposals.origin).toBe(ProposalOrigin.LOCAL_FABRICATED);
    // A VALID verdict over fabricated proposals must not read as a result about
    // a model. Same path, stated origin.
    expect(local.trial.valid).toBe(true);

    const cloud = modelTrialRecord({
      origin: ProposalOrigin.AGENT_RUNTIME,
      captures: localCaptures(),
    });
    expect(cloud.executed).toBe(true);
    expect(cloud.proposals.isEvidence).toBe(true);
    expect(cloud.validity.classifiedBy).toBe(local.validity.classifiedBy);
  });
});

describe('the packet the driver wrote', () => {
  const modelTrial = results.modelTrial;

  it('carries the classification the driver produced', () => {
    expect(modelTrial.trial).toBeDefined();
    expect(modelTrial.trial).not.toBeNull();
    expect(modelTrial.trial.rule).toEqual(TRIAL_VALIDITY_RULE);
    expect(modelTrial.trial.expected).toEqual(EXPECTED_DIGESTS);
  });

  it('re-derives, term for term, by running the classifier over the same captures', () => {
    // The proof that the arm driver invoked `classifyTrial` rather than writing
    // something shaped like its output: recomputing it here reproduces the
    // packet exactly. `classifyTrial` carries no timestamps, so this is a
    // genuine equality and not a coincidence of shape.
    expect(modelTrial.trial).toEqual(classifyCapturedProposals(localCaptures()));
  });

  it('never claims a classifier that did not run', () => {
    expect(modelTrial.validity.classifiedBy === null).toBe(modelTrial.trial === null);
  });

  it('states that the local proposals are not evidence about a model', () => {
    expect(modelTrial.executed).toBe(false);
    expect(modelTrial.proposals.origin).toBe(ProposalOrigin.LOCAL_FABRICATED);
    expect(modelTrial.proposals.isEvidence).toBe(false);
    expect(modelTrial.proposals.capturedFrom).toContain(PROPOSED_TOOL_CALLS_KEY);
  });

  it('records the ADK keyword contract the callbacks are written against', () => {
    expect(modelTrial.authorization.callbackContract).toMatch(/tool_context/);
    expect(modelTrial.authorization.callbackContract).toMatch(/functions\.py:591-593/);
    expect(modelTrial.authorization.modelMayAuthorize).toBe(false);
  });

  it('names both agents it will classify', () => {
    expect(modelTrial.agents).toEqual(AGENTS);
  });
});
