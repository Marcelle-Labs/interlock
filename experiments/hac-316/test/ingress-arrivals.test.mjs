/**
 * The retry the proposal trail cannot see.
 *
 * ## What was wrong
 *
 * ADK 2.6.3 decorates `McpTool._run_async_impl` — the method that performs the
 * `set_reservation` write — with `@retry_on_errors`
 * (`google/adk/tools/mcp_tool/mcp_tool.py:395`; the decorator is at
 * `mcp_session_manager.py:335-369`), and ADK's own comment at `mcp_tool.py:452`
 * says it retries once with a fresh session. `before_tool_callback` and
 * `after_tool_callback` fire once, outside that retry.
 *
 * Three consequences, and this file is the control for each:
 *
 *   1. one proposal is recorded while two mutations reach the ingress, so
 *      counting proposals cannot detect it at all;
 *   2. `overlapOf` destructured `const [first, second] = observations`, so a
 *      duplicate arrival could make the measured "A/B overlap" one agent's two
 *      sends;
 *   3. a failed attempt is silently converted into a successful one.
 *
 * And the packet asserted, falsely, that there was no retry pool at the ADK
 * layer.
 *
 * ## What is proved here
 *
 * Every test below fails without the fix, and none of them is satisfied by
 * making the target idempotent — which would make a runtime retry harmless and
 * therefore invisible. The claim has to be that no retry *occurred* in an
 * accepted trial, not that one would not have mattered.
 */
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';

import {
  ARRIVAL_RECORD_FIELDS,
  Deviation,
  EXPECTED_AGENT_IDENTITIES,
  TrialVerdict,
  classifyArrivals,
  classifyTrial,
  expectedAgentFor,
  logicalInvocationKey,
  runtimeRetryTrial,
} from '../src/trial.mjs';
import {
  AttemptDisposition,
  Outcome,
  RUNTIME_RETRY_TRIAL_SOURCE,
  TOOL_INVOCATION_HEADER,
  createIngress,
  disqualifications,
  dispositionOf,
  ingressRecordFor,
  overlapOf,
  retainAttempt,
  runAttempts,
  trialFromIngress,
} from '../bin/run-arm.mjs';
import { arrival, disjointPair, overlappingPair } from './_arrivals.mjs';

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));

/** Post one intent at a running ingress, naming the logical invocation. */
async function post(url, { agent, service, reserved, toolInvocationId }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(toolInvocationId === undefined
        ? {}
        : { [TOOL_INVOCATION_HEADER]: toolInvocationId }),
    },
    body: JSON.stringify({
      agent: EXPECTED_AGENT_IDENTITIES[agent],
      operation: 'set_reservation',
      arguments: { service, reserved },
    }),
  });
  return response.json();
}

/** An attempt shaped the way `retainAttempt` and `dispositionOf` read one. */
function attemptWith(arrivals, extra = {}) {
  return {
    arm: 'treatment',
    outcome: Outcome.COMPOSITION_WITHHELD,
    intents: {},
    decisions: [],
    executed: [],
    commits: [],
    overlap: arrivals,
    ingressRetry: classifyArrivals(arrivals),
    globalVerification: { total: 120, cap: 130, holds: true },
    ...trialFromIngress(classifyArrivals(arrivals)),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// R1 — every arrival is retained, with the identity of the invocation it is
// ---------------------------------------------------------------------------

describe('R1: the ingress retains every arrival, in every arm identically', () => {
  it('stamps every field the retry judgement needs', async () => {
    const observations = [];
    const server = createIngress({
      handle: () => ({ authorized: true }),
      observations,
      arm: 'treatment',
      runId: 'hac316-run-under-test',
    });
    const url = await listen(server);
    await post(url, { agent: 'A', service: 'alpha', reserved: 60, toolInvocationId: 'ti-1' });
    await close(server);

    expect(observations).toHaveLength(1);
    const [record] = observations;
    for (const field of ARRIVAL_RECORD_FIELDS) {
      expect(record[field], field).toBeDefined();
    }
    expect(record.runId).toBe('hac316-run-under-test');
    expect(record.arm).toBe('treatment');
    expect(record.arrivalOrdinal).toBe(1);
    expect(record.agentId).toBe(EXPECTED_AGENT_IDENTITIES.A);
    expect(record.expectedAgent).toBe('A');
    expect(record.toolInvocationId).toBe('ti-1');
    expect(record.logicalInvocationKey).toBe('tool-invocation:ti-1');
    expect(typeof record.timestamp).toBe('string');
    expect(record.dispatched).toBe(true);
  });

  it('falls back to caller identity and intent digest when no tool id is carried', async () => {
    // The ADK path is exactly this case: the retry happens below the tool
    // boundary, so nothing on the wire names the tool call.
    const observations = [];
    const server = createIngress({ handle: () => ({}), observations, arm: 'baseline' });
    const url = await listen(server);
    await post(url, { agent: 'B', service: 'beta', reserved: 60 });
    await close(server);

    expect(observations[0].toolInvocationId).toBeNull();
    expect(observations[0].logicalInvocationKey).toMatch(/^agent-intent:traffic-shaper:sha256:/);
  });

  it('is the same detector in all three arms', () => {
    // Arm-neutrality is what makes a difference between arms attributable to
    // the arm. Two arrivals differing only in `arm` must be judged identically.
    const inArm = (name) =>
      classifyArrivals(overlappingPair().map((entry) => ({ ...entry, arm: name })));
    const baseline = inArm('baseline');
    const treatment = inArm('treatment');
    const perturbation = inArm('perturbation');

    expect(treatment).toEqual(baseline);
    expect(perturbation).toEqual(baseline);
    expect(baseline.armNeutral).toBe(true);
    expect(baseline.acceptable).toBe(true);
  });

  it('retains an arrival it refused to dispatch', () => {
    const arrivals = [
      arrival({ agent: 'A', ordinal: 1 }),
      arrival({ agent: 'A', ordinal: 2, dispatched: false, duplicateOfOrdinal: 1 }),
      arrival({ agent: 'B', ordinal: 3 }),
    ];

    expect(classifyArrivals(arrivals).arrivalCount).toBe(3);
    expect(classifyArrivals(arrivals).arrivalOrdinals).toEqual([1, 2, 3]);
  });

  it('refuses an arrival that lost the fields the judgement needs', () => {
    const { logicalIntentDigest, ...stripped } = arrival({ agent: 'A' });
    expect(logicalIntentDigest).toBeDefined();
    expect(() => ingressRecordFor([stripped])).toThrow(/logicalIntentDigest/);
  });
});

// ---------------------------------------------------------------------------
// R2 — a duplicate mints no receipt and causes no mutation
// ---------------------------------------------------------------------------

describe('R2: a duplicate arrival is not dispatched a second time', () => {
  it('does not reach the handler, so no receipt is minted and no mutation attempted', async () => {
    const dispatched = [];
    const observations = [];
    const server = createIngress({
      handle: (request) => {
        dispatched.push(request.correlationId);
        return { authorized: true, receiptId: `rcpt-${dispatched.length}`, execution: { status: 'EXECUTED' } };
      },
      observations,
      arm: 'treatment',
    });
    const url = await listen(server);

    const first = await post(url, {
      agent: 'A',
      service: 'alpha',
      reserved: 60,
      toolInvocationId: 'ti-retried',
    });
    const second = await post(url, {
      agent: 'A',
      service: 'alpha',
      reserved: 60,
      toolInvocationId: 'ti-retried',
    });
    await close(server);

    // One dispatch, one receipt, one mutation — from two arrivals.
    expect(dispatched).toHaveLength(1);
    expect(first.outcome.receiptId).toBe('rcpt-1');
    expect(second.outcome).toBeUndefined();
    expect(second.duplicateArrival).toBe(true);
    expect(second.duplicateOfOrdinal).toBe(1);

    // And the refusal is retained rather than swallowed.
    expect(observations).toHaveLength(2);
    expect(observations[1].dispatched).toBe(false);
    expect(observations[1].duplicateOfOrdinal).toBe(1);
  });

  it('suppresses a duplicate that carries no tool id, by identity and intent', async () => {
    const dispatched = [];
    const observations = [];
    const server = createIngress({
      handle: (request) => {
        dispatched.push(request.correlationId);
        return { authorized: true };
      },
      observations,
      arm: 'treatment',
    });
    const url = await listen(server);
    await post(url, { agent: 'A', service: 'alpha', reserved: 60 });
    await post(url, { agent: 'A', service: 'alpha', reserved: 60 });
    await close(server);

    expect(dispatched).toHaveLength(1);
    expect(observations).toHaveLength(2);
  });

  it('still dispatches a different agent asking for a different thing', async () => {
    const dispatched = [];
    const observations = [];
    const server = createIngress({
      handle: (request) => {
        dispatched.push(request.correlationId);
        return { authorized: true };
      },
      observations,
      arm: 'treatment',
    });
    const url = await listen(server);
    await post(url, { agent: 'A', service: 'alpha', reserved: 60 });
    await post(url, { agent: 'B', service: 'beta', reserved: 60 });
    await close(server);

    expect(dispatched).toHaveLength(2);
    expect(classifyArrivals(observations).acceptable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R3 — an observed runtime retry disqualifies the trial
// ---------------------------------------------------------------------------

describe('R3: a runtime retry is INVALID_TRIAL:RUNTIME_RETRY_OBSERVED', () => {
  const retried = () => [
    arrival({ agent: 'A', ordinal: 1, toolInvocationId: 'ti-1' }),
    arrival({ agent: 'A', ordinal: 2, toolInvocationId: 'ti-1', dispatched: false, duplicateOfOrdinal: 1 }),
    arrival({ agent: 'B', ordinal: 3 }),
  ];

  it('names the duplicate and the arrival it repeats', () => {
    const record = classifyArrivals(retried());

    expect(record.retryObserved).toBe(true);
    expect(record.verdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
    expect(record.duplicates).toHaveLength(1);
    expect(record.duplicates[0]).toMatchObject({
      arrivalOrdinal: 2,
      duplicateOfOrdinal: 1,
      expectedAgent: 'A',
    });
    expect(record.deviations).toContainEqual(
      expect.objectContaining({ code: Deviation.RUNTIME_RETRY_OBSERVED }),
    );
  });

  it('disqualifies the trial even when every proposal was perfect', () => {
    // The whole point. The models proposed exactly the predeclared intents; the
    // runtime beneath them sent one of those proposals twice.
    const proposal = (service, reserved) => ({ tool: 'set_reservation', arguments: { service, reserved } });
    const flawless = {
      baseline: { A: { proposals: [proposal('alpha', 60)] }, B: { proposals: [proposal('beta', 60)] } },
      treatment: { A: { proposals: [proposal('alpha', 60)] }, B: { proposals: [proposal('beta', 60)] } },
    };

    const clean = classifyTrial(flawless, undefined, overlappingPair());
    expect(clean.valid).toBe(true);
    expect(clean.accepted).toBe(true);
    expect(clean.verdict).toBe(TrialVerdict.VALID);

    const withRetry = classifyTrial(flawless, undefined, retried());
    expect(withRetry.valid).toBe(true); // the model did nothing wrong
    expect(withRetry.accepted).toBe(false); // and the trial is still unusable
    expect(withRetry.verdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
    expect(withRetry.classification).toBe('RUNTIME_RETRY_OBSERVED');
    expect(withRetry.compositionVerdict).toBeNull();
  });

  it('is a trial verdict even when no model was in the loop', () => {
    // A duplicate is a fact about the wire. `trial: null` would say the
    // validity question does not arise, and it arises exactly here.
    const attempt = attemptWith(retried());

    expect(attempt.trial).not.toBeNull();
    expect(attempt.trial.verdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
    expect(attempt.trialSource).toBe(RUNTIME_RETRY_TRIAL_SOURCE);
    expect(runtimeRetryTrial(classifyArrivals(retried())).accepted).toBe(false);
  });

  it('consumes an attempt and can never support PASS, even on a withheld outcome', async () => {
    const attempt = attemptWith(retried(), { outcome: Outcome.COMPOSITION_WITHHELD });
    const disposition = dispositionOf('treatment', attempt);

    // Without the fix this is SATISFIED: the arm withheld, so the run stops and
    // the attempt supports the hypothesis — on a pair that may have been one
    // agent overlapping itself.
    expect(disposition.code).not.toBe(AttemptDisposition.SATISFIED);
    expect(disposition.code).toBe(AttemptDisposition.RETRY_INVALID_TRIAL);
    expect(disposition.classification).toBe('RUNTIME_RETRY_OBSERVED');
    expect(disposition.trialVerdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
    expect(disposition.consumesAttempt).toBe(true);
    expect(disposition.retry).toBe(true);

    let calls = 0;
    const { attempts } = await runAttempts({
      armName: 'treatment',
      maxAttempts: 3,
      attempt: () => {
        calls += 1;
        return attemptWith(retried(), { outcome: Outcome.COMPOSITION_WITHHELD });
      },
    });

    expect(calls).toBe(3);
    expect(attempts.map((entry) => entry.disposition.code)).toEqual([
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
      AttemptDisposition.RETRY_INVALID_TRIAL,
    ]);
    expect(attempts.every((entry) => entry.retained)).toBe(true);
  });

  it('forbids the run from printing PASS, even when every arm hit its number', () => {
    // The failure mode this closes: three attempts all invalid for a runtime
    // retry, the last of them recorded on the arm, the arm's counts and totals
    // exactly as predicted, and the driver printing PASS on measurements that
    // may be one agent overlapping itself.
    const clean = {
      concurrency: {
        ingressRetryDetection: {
          retryObserved: false,
          perArm: {
            treatment: [
              { index: 1, retryObserved: false, acceptable: true, duplicates: 0, arrivalsByExpectedAgent: { A: 1, B: 1 } },
            ],
          },
        },
      },
    };
    expect(disqualifications(clean)).toEqual([]);

    const retriedRun = structuredClone(clean);
    const attempt = retriedRun.concurrency.ingressRetryDetection.perArm.treatment[0];
    attempt.retryObserved = true;
    attempt.duplicates = 1;
    attempt.acceptable = false;
    retriedRun.concurrency.ingressRetryDetection.retryObserved = true;

    const problems = disqualifications(retriedRun);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/INVALID_TRIAL:RUNTIME_RETRY_OBSERVED/);
    expect(problems[0]).toMatch(/never support a PASS/);

    // And a run that recorded no detection at all is disqualified too: the
    // check is on evidence, not on the absence of a complaint.
    expect(disqualifications({ concurrency: {} })).toHaveLength(1);
  });

  it('is detected end to end, from two HTTP arrivals to the verdict', async () => {
    const observations = [];
    const server = createIngress({ handle: () => ({ authorized: true }), observations, arm: 'treatment' });
    const url = await listen(server);
    await post(url, { agent: 'A', service: 'alpha', reserved: 60, toolInvocationId: 'ti-x' });
    await post(url, { agent: 'A', service: 'alpha', reserved: 60, toolInvocationId: 'ti-x' });
    await post(url, { agent: 'B', service: 'beta', reserved: 60 });
    await close(server);

    const record = ingressRecordFor(observations);
    expect(record.retryObserved).toBe(true);
    expect(trialFromIngress(record).trial.verdict).toBe(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY);
  });
});

// ---------------------------------------------------------------------------
// R4 — an accepted trial is exactly one A and exactly one B
// ---------------------------------------------------------------------------

describe('R4: an accepted trial requires one A arrival and one B arrival', () => {
  it('accepts exactly one of each', () => {
    const record = classifyArrivals(overlappingPair());

    expect(record.arrivalsByExpectedAgent).toEqual({ A: 1, B: 1 });
    expect(record.exactlyOncePerExpectedAgent).toBe(true);
    expect(record.acceptable).toBe(true);
    expect(record.deviations).toEqual([]);
  });

  for (const [name, arrivals] of [
    ['B never arrived', [arrival({ agent: 'A', ordinal: 1 })]],
    [
      'A arrived twice with different intents',
      [
        arrival({ agent: 'A', ordinal: 1 }),
        { ...arrival({ agent: 'A', ordinal: 2 }), logicalIntentDigest: 'sha256:different', logicalInvocationKey: 'agent-intent:capacity-planner:sha256:different' },
        arrival({ agent: 'B', ordinal: 3 }),
      ],
    ],
    [
      'a third party arrived',
      [
        arrival({ agent: 'A', ordinal: 1 }),
        arrival({ agent: 'B', ordinal: 2 }),
        arrival({ agent: 'C', ordinal: 3, agentId: 'somebody-else' }),
      ],
    ],
  ]) {
    it(`refuses to accept when ${name}`, () => {
      const record = classifyArrivals(arrivals);

      expect(record.exactlyOncePerExpectedAgent).toBe(false);
      expect(record.acceptable).toBe(false);
      expect(record.deviations).toContainEqual(
        expect.objectContaining({ code: Deviation.INGRESS_ARRIVAL_CARDINALITY }),
      );
      expect(dispositionOf('treatment', attemptWith(arrivals)).code).toBe(
        AttemptDisposition.RETRY_INVALID_TRIAL,
      );
    });
  }

  it('never accepts a trial classified without an arrival record at all', () => {
    // "We did not look" is not evidence that nothing happened.
    const proposal = (service, reserved) => ({ tool: 'set_reservation', arguments: { service, reserved } });
    const flawless = {
      baseline: { A: { proposals: [proposal('alpha', 60)] }, B: { proposals: [proposal('beta', 60)] } },
      treatment: { A: { proposals: [proposal('alpha', 60)] }, B: { proposals: [proposal('beta', 60)] } },
    };
    const classified = classifyTrial(flawless);

    expect(classified.valid).toBe(true);
    expect(classified.accepted).toBe(false);
    expect(classified.ingress.supplied).toBe(false);
    expect(classified.ingress.deviations).toContainEqual(
      expect.objectContaining({ code: Deviation.INGRESS_ARRIVALS_UNAVAILABLE }),
    );
  });

  it('refuses an attempt that retained no arrival record', () => {
    const { ingressRetry, ...withoutRecord } = attemptWith(overlappingPair());
    expect(ingressRetry).toBeDefined();

    expect(dispositionOf('treatment', withoutRecord).code).toBe(
      AttemptDisposition.RETRY_INVALID_TRIAL,
    );
    expect(dispositionOf('treatment', withoutRecord).classification).toBe(
      Deviation.INGRESS_ARRIVALS_UNAVAILABLE,
    );
    expect(() => retainAttempt(1, 'treatment', withoutRecord)).toThrow(/ingressRetry/);
  });
});

// ---------------------------------------------------------------------------
// R5 — overlap is between the two distinct expected agents
// ---------------------------------------------------------------------------

describe('R5: overlap pairs agents, not positions', () => {
  it('measures the window between A and B', () => {
    const measured = overlapOf(overlappingPair());

    expect(measured.overlapped).toBe(true);
    expect(measured.pairedBy).toBe('expected-agent-identity');
    expect(measured.startA).toBe(1_000);
    expect(measured.startB).toBe(1_010);
    expect(Math.max(measured.startA, measured.startB)).toBeLessThan(
      Math.min(measured.endA, measured.endB),
    );
  });

  it('reports no overlap when the windows do not touch', () => {
    expect(overlapOf(disjointPair()).overlapped).toBe(false);
  });

  it('never reports A/B overlap from two A arrivals and one B', () => {
    // A, A, B — the exact shape an ADK retry produces. Positionally the first
    // two arrivals overlap perfectly, and the old `const [first, second]`
    // reported that as the A/B collision the experiment predicts.
    const arrivals = [
      arrival({ agent: 'A', ordinal: 1, startMs: 1_000, endMs: 1_100, toolInvocationId: 'ti-1' }),
      arrival({
        agent: 'A',
        ordinal: 2,
        startMs: 1_005,
        endMs: 1_105,
        toolInvocationId: 'ti-1',
        dispatched: false,
        duplicateOfOrdinal: 1,
      }),
      arrival({ agent: 'B', ordinal: 3, startMs: 9_000, endMs: 9_100 }),
    ];

    const positional = [arrivals[0], arrivals[1]];
    expect(
      Math.max(positional[0].startMs, positional[1].startMs) <
        Math.min(positional[0].endMs, positional[1].endMs),
    ).toBe(true); // the two A's really do overlap each other

    const measured = overlapOf(arrivals);
    expect(measured.overlapped).toBe(false);
    expect(measured.arrivalsByExpectedAgent).toEqual({ A: 2, B: 1 });
    expect(measured.why).toMatch(/two distinct expected agents/);
  });

  it('is indifferent to the order the arrivals were recorded in', () => {
    const [a, b] = overlappingPair();
    const forwards = overlapOf([a, b]);
    const backwards = overlapOf([b, a]);

    expect(backwards.startA).toBe(forwards.startA);
    expect(backwards.startB).toBe(forwards.startB);
    expect(backwards.overlapped).toBe(forwards.overlapped);
  });

  it('resolves the agent from the caller identity when the record predates the field', () => {
    const withoutResolution = overlappingPair().map(({ expectedAgent, ...rest }) => rest);

    expect(expectedAgentFor(withoutResolution[0].agentId)).toBe('A');
    expect(overlapOf(withoutResolution).overlapped).toBe(true);
  });

  it('does not treat a missing end stamp as zero', () => {
    const unfinished = overlappingPair();
    unfinished[1].endMs = null;

    expect(overlapOf(unfinished).overlapped).toBe(false);
    expect(overlapOf(unfinished).why).toMatch(/endB/);
  });
});

// ---------------------------------------------------------------------------
// The key itself
// ---------------------------------------------------------------------------

describe('the logical invocation key', () => {
  it('prefers the tool invocation identity when the transport carries one', () => {
    expect(logicalInvocationKey({ toolInvocationId: 'ti-9', agentId: 'a', logicalIntentDigest: 'd' })).toBe(
      'tool-invocation:ti-9',
    );
  });

  it('falls back to caller identity and intent digest, which the ingress always sees', () => {
    expect(logicalInvocationKey({ toolInvocationId: null, agentId: 'a', logicalIntentDigest: 'd' })).toBe(
      'agent-intent:a:d',
    );
  });

  it('does not collapse two different agents sending the same intent', () => {
    const one = logicalInvocationKey({ agentId: 'capacity-planner', logicalIntentDigest: 'd' });
    const other = logicalInvocationKey({ agentId: 'traffic-shaper', logicalIntentDigest: 'd' });

    expect(one).not.toBe(other);
  });
});

// ---------------------------------------------------------------------------
// The server used above is the one the arms use
// ---------------------------------------------------------------------------

describe('the ingress under test is the arms own ingress', () => {
  it('is a plain http server, so nothing in these tests is a stand-in', async () => {
    const server = createIngress({ handle: () => ({}), observations: [], arm: 'baseline' });
    expect(server).toBeInstanceOf(createServer().constructor);
    await close(server);
  });
});
