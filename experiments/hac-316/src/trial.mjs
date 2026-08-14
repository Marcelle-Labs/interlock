/**
 * Is this a trial, or is it a model failure?
 *
 * ## Why this exists on the harness side
 *
 * The agents are Gemini-backed. A model can call the wrong tool, call nothing,
 * invent an argument, call twice, or return something that is not a tool call at
 * all. None of those are results about composition, and every one of them would
 * look like one if it were counted: "both agents executed" and "one agent never
 * asked" produce the same number of executions.
 *
 * Preflight V1 predeclared the rule, before anything ran and before any cloud
 * spend, and it is not restated here — it is read out of `preflight.json`:
 *
 *   digest(A,baseline) == digest(A,treatment) == expectedIntents.A.intentDigest
 *   AND
 *   digest(B,baseline) == digest(B,treatment) == expectedIntents.B.intentDigest
 *
 *   on violation: MODEL_FAILURE / INVALID_TRIAL — never counted as composition
 *   evidence.
 *
 * This module is that rule, and nothing else. It judges; it does not repair. A
 * normaliser that coerced `"60"` to `60`, filled in a missing `service`, or took
 * the last of two calls would be manufacturing a valid trial out of an invalid
 * one — and, worse, doing it invisibly, since the packet would then record a
 * clean pair of digests.
 *
 * ## It lives here rather than in the agent
 *
 * The component being judged is not the judge. The agent records what it
 * proposed (`agents/_proposals.py`) and stops; the classification happens out
 * here, over that record, alongside the ingress's independent digest of what
 * actually arrived on the wire.
 *
 * ## The digest is the frozen one
 *
 * `intentDigest` from `dist/` — the same function the proxy, the target and the
 * predeclared `expectedIntents` all use. A second canonicalisation written for
 * this file could agree with none of them and still look right.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { intentDigest } from '../../../dist/authorization/intent.js';
import { OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Preflight V1, frozen before any arm ran and before any cloud spend. */
export const PREFLIGHT_V1 = JSON.parse(
  readFileSync(join(experimentDir, 'evidence', 'preflight.json'), 'utf8'),
);

/** The predeclared digests, read rather than retyped. */
export const EXPECTED_DIGESTS = Object.freeze(
  Object.fromEntries(
    Object.entries(PREFLIGHT_V1.expectedIntents).map(([id, entry]) => [id, entry.intentDigest]),
  ),
);

/** The predeclared rule, verbatim, so the packet can quote its own source. */
export const TRIAL_VALIDITY_RULE = Object.freeze({
  rule: PREFLIGHT_V1.predeclared.trialValidity.rule,
  onViolation: PREFLIGHT_V1.predeclared.trialValidity.onViolation,
  source: 'experiments/hac-316/evidence/preflight.json predeclared.trialValidity',
});

/** How a model deviated. Every one of these is a reason, not a category of one. */
export const Deviation = Object.freeze({
  /** The model finished without proposing a tool call. */
  NO_TOOL_CALL: 'NO_TOOL_CALL',
  /** More than one proposal. Which one counted would be the harness's choice. */
  MULTIPLE_TOOL_CALLS: 'MULTIPLE_TOOL_CALLS',
  /** A tool that is not the protected operation. */
  WRONG_TOOL: 'WRONG_TOOL',
  /** Not shaped like a tool call at all. */
  MALFORMED_INVOCATION: 'MALFORMED_INVOCATION',
  /** Right tool, wrong arguments — including extra, missing or mistyped ones. */
  ARGUMENT_DRIFT: 'ARGUMENT_DRIFT',
  /** The invocation raised before a proposal could be recorded. */
  MODEL_ERROR: 'MODEL_ERROR',
});

/** What a classified trial can be. */
export const TrialVerdict = Object.freeze({ VALID: 'VALID', INVALID_TRIAL: 'INVALID_TRIAL' });

/**
 * The session-state key `agents/_proposals.py` writes its record trail under.
 *
 * Spelled here as well as there because this is the seam between a Python
 * process and a Node one: nothing type-checks across it, and the harness reading
 * a key the agent does not write would look exactly like a model that proposed
 * nothing.
 */
export const PROPOSED_TOOL_CALLS_KEY = 'hac316.proposed_tool_calls';

/**
 * The two phases of one logical proposal.
 *
 * One successful tool call writes both. It is still one proposal. The agent
 * recorded both and returned both, so `classifyInvocation` counted two and every
 * valid trial came out `MULTIPLE_TOOL_CALLS` — a criterion that could not be
 * satisfied by any well-behaved model. The filter below is the harness half of
 * that fix; `proposals()` in `_proposals.py` is the agent half.
 */
export const ProposalPhase = Object.freeze({ PROPOSED: 'proposed', RESPONDED: 'responded' });

/** The one classification an invalid trial ever gets. */
export const MODEL_FAILURE = 'MODEL_FAILURE';

/** The arguments a `set_reservation` call may carry, and nothing else. */
const ARGUMENT_KEYS = Object.freeze(['reserved', 'service']);

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Put one proposed tool call into the canonical shape, or refuse it.
 *
 * Refusals carry the deviation that caused them. Nothing is coerced: a
 * `reserved` of `"60"` is drift, not a number, because a model that answered
 * with a string is a model that did not do what it was asked, and hiding that
 * behind a cast would make the validity criterion unable to see it.
 */
export function normalizeToolCall(raw) {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: Deviation.MALFORMED_INVOCATION,
      detail: `a proposal must be an object, got ${raw === null ? 'null' : typeof raw}`,
    };
  }
  const tool = raw.tool;
  if (typeof tool !== 'string' || tool === '') {
    return {
      ok: false,
      code: Deviation.MALFORMED_INVOCATION,
      detail: 'a proposal must name the tool it calls as a non-empty string',
    };
  }
  if (tool !== OPERATION_SET_RESERVATION) {
    return {
      ok: false,
      code: Deviation.WRONG_TOOL,
      detail: `proposed ${tool}; this agent's surface exposes ${OPERATION_SET_RESERVATION} only`,
    };
  }
  const args = raw.arguments;
  if (!isPlainObject(args)) {
    return {
      ok: false,
      code: Deviation.MALFORMED_INVOCATION,
      detail: `arguments must be an object, got ${args === null ? 'null' : typeof args}`,
    };
  }
  const keys = Object.keys(args).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...ARGUMENT_KEYS])) {
    return {
      ok: false,
      code: Deviation.ARGUMENT_DRIFT,
      detail: `arguments must be exactly {${ARGUMENT_KEYS.join(', ')}}, got {${keys.join(', ')}}`,
    };
  }
  if (typeof args.service !== 'string' || args.service === '') {
    return {
      ok: false,
      code: Deviation.ARGUMENT_DRIFT,
      detail: `service must be a non-empty string, got ${JSON.stringify(args.service)}`,
    };
  }
  if (typeof args.reserved !== 'number' || !Number.isInteger(args.reserved) || args.reserved < 0) {
    return {
      ok: false,
      code: Deviation.ARGUMENT_DRIFT,
      detail: `reserved must be a non-negative integer, got ${JSON.stringify(args.reserved)}`,
    };
  }
  return {
    ok: true,
    normalized: {
      operation: OPERATION_SET_RESERVATION,
      arguments: { service: args.service, reserved: args.reserved },
    },
  };
}

/** The frozen intent digest of a normalized call. */
export function toolCallDigest(normalized) {
  return intentDigest(normalized);
}

/**
 * One invocation record, read out of the session state the agent left behind.
 *
 * This is the capture end of the path the classifier judges. The agent writes a
 * flat trail of `proposed` and `responded` records under one key; exactly the
 * `proposed` ones are proposals, and the response is not a second one. Reading
 * the raw session state here — rather than being handed a pre-filtered list —
 * is deliberate: on Agent Runtime what comes back *is* the session state, and a
 * harness that could only consume an already-tidied shape would be tested
 * against a shape that never arrives.
 *
 * An absent or empty state is `NO_TOOL_CALL`, not an error: a model that
 * finished without calling anything left exactly this behind.
 *
 * @param sessionState  the agent's session state, or `undefined`
 * @param error         a message if the invocation raised before recording
 */
export function invocationFromSessionState(sessionState, error) {
  const trail = sessionState?.[PROPOSED_TOOL_CALLS_KEY] ?? [];
  const proposals = (Array.isArray(trail) ? trail : []).filter(
    (record) => record?.phase === ProposalPhase.PROPOSED,
  );
  return error === undefined ? { proposals } : { proposals, error };
}

/**
 * Classify one agent's invocation in one arm.
 *
 * `record` is what the agent recorded for that invocation:
 *   `{ proposals: [...], error?: string }`
 * where `proposals` are the `phase: "proposed"` entries, in order —
 * `invocationFromSessionState` is what produces that shape from raw state.
 */
export function classifyInvocation(record) {
  if (record === undefined || record === null) {
    return { ok: false, code: Deviation.NO_TOOL_CALL, detail: 'no record for this invocation' };
  }
  if (typeof record.error === 'string' && record.error !== '') {
    return { ok: false, code: Deviation.MODEL_ERROR, detail: record.error };
  }
  const proposals = record.proposals ?? [];
  if (proposals.length === 0) {
    return {
      ok: false,
      code: Deviation.NO_TOOL_CALL,
      detail: 'the model finished without proposing a tool call',
    };
  }
  if (proposals.length > 1) {
    // Not "take the first". Choosing among several would make the harness the
    // author of the intent it is supposed to be measuring.
    return {
      ok: false,
      code: Deviation.MULTIPLE_TOOL_CALLS,
      detail: `${proposals.length} tool calls proposed; exactly one was asked for`,
    };
  }
  const normalized = normalizeToolCall(proposals[0]);
  if (!normalized.ok) return normalized;
  return { ok: true, normalized: normalized.normalized, digest: toolCallDigest(normalized.normalized) };
}

/**
 * Apply the predeclared rule to one attempt's four invocations.
 *
 * `attempt` is `{ baseline: { A, B }, treatment: { A, B } }`, each entry an
 * invocation record. The verdict is about *trial validity only*. It is never a
 * composition verdict, and `compositionVerdict` is `null` on both branches to
 * make that structural rather than a matter of who reads the field: an invalid
 * trial has nothing to say about composition, and a valid one says it elsewhere,
 * through an independent re-read of the targets.
 */
export function classifyTrial(attempt, expected = EXPECTED_DIGESTS) {
  const arms = ['baseline', 'treatment'];
  const agents = Object.keys(expected).sort();

  const invocations = {};
  const deviations = [];

  for (const arm of arms) {
    invocations[arm] = {};
    for (const agent of agents) {
      const classified = classifyInvocation(attempt?.[arm]?.[agent]);
      invocations[arm][agent] = classified;
      if (!classified.ok) {
        deviations.push({ arm, agent, code: classified.code, detail: classified.detail });
      }
    }
  }

  // Only after every invocation is individually well-formed does the equality
  // question arise. Reporting "digests differ" for an agent that never called
  // anything would name the wrong failure.
  if (deviations.length === 0) {
    for (const agent of agents) {
      const seen = arms.map((arm) => invocations[arm][agent].digest);
      const want = expected[agent];
      if (seen[0] !== want || seen[1] !== want) {
        deviations.push({
          agent,
          code: Deviation.ARGUMENT_DRIFT,
          detail:
            `digest(${agent},baseline)=${seen[0]} digest(${agent},treatment)=${seen[1]} ` +
            `expected=${want}`,
        });
      }
    }
  }

  const valid = deviations.length === 0;
  return {
    valid,
    verdict: valid ? TrialVerdict.VALID : TrialVerdict.INVALID_TRIAL,
    classification: valid ? null : MODEL_FAILURE,
    // Always null. A trial-validity judgement is not a statement about
    // composition, whichever way it comes out.
    compositionVerdict: null,
    rule: TRIAL_VALIDITY_RULE,
    invocations,
    deviations,
    digests: Object.fromEntries(
      agents.map((agent) => [
        agent,
        Object.fromEntries(arms.map((arm) => [arm, invocations[arm][agent].digest ?? null])),
      ]),
    ),
    expected,
  };
}
