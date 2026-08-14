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
 *
 * ## The second thing a trial can fail on: the runtime called twice
 *
 * The proposal record is written by ADK's `before_tool_callback` and
 * `after_tool_callback`. Those fire **once**, around Step 2 and Step 5 of
 * `_run_with_trace`. The method that performs the write —
 * `McpTool._run_async_impl` — is decorated with `@retry_on_errors`
 * (`google/adk/tools/mcp_tool/mcp_tool.py:395`; the decorator is at
 * `mcp_session_manager.py:335-369`), and ADK's own comment at `mcp_tool.py:452`
 * says it retries once with a fresh session.
 *
 * So one recorded proposal can correspond to **two** mutations on the wire, and
 * a failed attempt can be converted into a successful one without anything in
 * the proposal trail changing. Counting proposals cannot see that; only the
 * ingress can, because only the ingress sees arrivals.
 *
 * `classifyArrivals` is that second judgement. It is deliberately *not* an
 * idempotency key on the protected target: making a runtime retry harmless would
 * make it invisible, and the claim this experiment needs is that no runtime
 * retry occurred in an accepted trial — not that one would not have mattered.
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

/**
 * The caller identity each expected agent presents, read rather than retyped.
 *
 * `{ A: 'capacity-planner', B: 'traffic-shaper' }`. The ingress sees these
 * strings and nothing that says "A" or "B", so the mapping has to exist
 * somewhere; taking it from Preflight V1 means it cannot drift from the intents
 * the same file predeclared.
 */
export const EXPECTED_AGENT_IDENTITIES = Object.freeze(
  Object.fromEntries(
    Object.entries(PREFLIGHT_V1.expectedIntents).map(([id, entry]) => [id, entry.agent]),
  ),
);

/** The expected agent an arriving caller identity is, or `null` if it is neither. */
export function expectedAgentFor(agentId) {
  const found = Object.entries(EXPECTED_AGENT_IDENTITIES).find(([, name]) => name === agentId);
  return found === undefined ? null : found[0];
}

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
  /**
   * The same logical invocation arrived at the ingress more than once.
   *
   * Not a model deviation at all — the model proposed once. This is the runtime
   * underneath it sending the proposal twice, and it is a deviation of the
   * *trial*, not of the model, which is why it carries its own classification.
   */
  RUNTIME_RETRY_OBSERVED: 'RUNTIME_RETRY_OBSERVED',
  /** The ingress did not see exactly one arrival from each expected agent. */
  INGRESS_ARRIVAL_CARDINALITY: 'INGRESS_ARRIVAL_CARDINALITY',
  /** No ingress arrival record was supplied, so neither of the above is decidable. */
  INGRESS_ARRIVALS_UNAVAILABLE: 'INGRESS_ARRIVALS_UNAVAILABLE',
});

/**
 * What a classified trial can be.
 *
 * `INVALID_TRIAL:RUNTIME_RETRY_OBSERVED` is spelled as its own verdict rather
 * than folded into `INVALID_TRIAL` because the two say different things about
 * where the fault was: one is the model deviating from the predeclared intent,
 * the other is the platform underneath it duplicating a mutation the model asked
 * for once. A reader who cannot tell them apart cannot tell whether the
 * experiment measured a model or a retry pool.
 */
export const TrialVerdict = Object.freeze({
  VALID: 'VALID',
  INVALID_TRIAL: 'INVALID_TRIAL',
  INVALID_TRIAL_RUNTIME_RETRY: 'INVALID_TRIAL:RUNTIME_RETRY_OBSERVED',
});

/** The classification an invalid trial gets when the runtime, not the model, deviated. */
export const RUNTIME_RETRY = 'RUNTIME_RETRY_OBSERVED';

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

/** The classification an invalid trial gets when the *model* deviated. */
export const MODEL_FAILURE = 'MODEL_FAILURE';

// ---------------------------------------------------------------------------
// Ingress arrivals: what actually reached the wire, however many times
// ---------------------------------------------------------------------------

/**
 * Every field an ingress arrival record must carry.
 *
 * Named as data so the ingress cannot quietly stop stamping one of them and so a
 * packet verifier can assert the shape rather than assume it. An arrival missing
 * any of these is not a weaker record — it is an undecidable one, because the
 * whole judgement below is "was this the same logical invocation as an earlier
 * arrival, and whose was it".
 */
export const ARRIVAL_RECORD_FIELDS = Object.freeze([
  'runId',
  'arm',
  'arrivalOrdinal',
  'timestamp',
  'agentId',
  'expectedAgent',
  'correlationId',
  'logicalIntentDigest',
  'toolInvocationId',
  'logicalInvocationKey',
  'dispatched',
  'duplicateOfOrdinal',
]);

/**
 * The identity of the logical invocation an arrival belongs to.
 *
 * **Always bound to the caller.** Both branches below carry the agent identity,
 * because a logical invocation is a *pair* — who asked, and which asking — and a
 * key that names only the asking cannot tell two agents apart.
 *
 * ## The collision this used to have
 *
 * The tool-invocation branch returned `tool-invocation:<id>` with no agent in it.
 * The id is supplied by the caller, so two genuinely distinct invocations — A
 * writing alpha and B writing beta, with different intent digests, which is the
 * exact pair this experiment is built to observe — collided the moment they
 * shared one header value. The second was recorded as a duplicate of the first,
 * refused a dispatch, and reported as a runtime retry: B's mutation withheld, and
 * the fault attributed to a platform retry that never happened. A caller could
 * therefore suppress the other agent's mutation by echoing its tool id, and the
 * packet would blame ADK.
 *
 * ## What each branch is for
 *
 * The tool invocation identity is used when the transport carries one, because
 * within one caller it is the only thing that distinguishes "the runtime sent
 * this twice" from "the agent genuinely asked twice" without inference. When it
 * is absent — and on the ADK path it usually is, since the retry happens *below*
 * the tool boundary and MCP carries no tool-call id of its own — the key falls
 * back to the other pair the ingress can always see: who called, and what they
 * asked for.
 *
 * The fallback is deliberately coarse. Two identical mutations from one agent
 * are indistinguishable from a retry at the ingress, and this experiment treats
 * both as disqualifying rather than guessing which it was: each agent is asked
 * for exactly one mutation, so a second identical one is a fault either way.
 * What the fallback must never do is reach *across* agents, and it does not:
 * `agent-intent:` has carried the caller since it was written. The bound branch
 * now does too.
 */
export function logicalInvocationKey(arrival) {
  const agentId = arrival?.agentId ?? '(none)';
  const toolInvocationId = arrival?.toolInvocationId;
  if (typeof toolInvocationId === 'string' && toolInvocationId !== '') {
    return `agent-tool-invocation:${agentId}:${toolInvocationId}`;
  }
  return `agent-intent:${agentId}:${arrival?.logicalIntentDigest ?? '(none)'}`;
}

/** The ingress record for an attempt whose arrivals were never captured. */
export function arrivalsUnavailable(why) {
  return {
    supplied: false,
    detectedAt: 'ingress',
    armNeutral: true,
    arrivalCount: 0,
    arrivalOrdinals: [],
    arrivalsByExpectedAgent: {},
    duplicates: [],
    retryObserved: false,
    exactlyOncePerExpectedAgent: false,
    acceptable: false,
    verdict: null,
    deviations: [
      {
        code: Deviation.INGRESS_ARRIVALS_UNAVAILABLE,
        detail: why,
      },
    ],
    why,
  };
}

/**
 * Judge one attempt's ingress arrivals.
 *
 * Two questions, both of which the proposal trail is structurally unable to
 * answer:
 *
 *   1. did the same logical invocation arrive more than once (a runtime retry)?
 *   2. did exactly one arrival come from each of the two expected agents?
 *
 * Arm-neutral by construction: it is handed a list of arrivals and knows nothing
 * about which arm produced them. The same function judges baseline, treatment
 * and perturbation, so a difference between arms can never be an artefact of a
 * detector that only ran in one of them.
 */
export function classifyArrivals(arrivals, expected = EXPECTED_DIGESTS) {
  if (!Array.isArray(arrivals)) {
    return arrivalsUnavailable('no ingress arrival list was supplied for this attempt');
  }

  const expectedAgents = Object.keys(expected).sort();
  const counts = Object.fromEntries(expectedAgents.map((agent) => [agent, 0]));
  const firstByKey = new Map();
  const duplicates = [];
  const unrecognised = [];
  const deviations = [];

  for (const arrival of arrivals) {
    const key = arrival?.logicalInvocationKey ?? logicalInvocationKey(arrival);
    const agent = arrival?.expectedAgent ?? expectedAgentFor(arrival?.agentId);

    if (firstByKey.has(key)) {
      duplicates.push({
        logicalInvocationKey: key,
        agentId: arrival?.agentId ?? null,
        expectedAgent: agent,
        logicalIntentDigest: arrival?.logicalIntentDigest ?? null,
        toolInvocationId: arrival?.toolInvocationId ?? null,
        arrivalOrdinal: arrival?.arrivalOrdinal ?? null,
        duplicateOfOrdinal: firstByKey.get(key),
      });
    } else {
      firstByKey.set(key, arrival?.arrivalOrdinal ?? null);
    }

    if (agent !== null && Object.hasOwn(counts, agent)) counts[agent] += 1;
    else unrecognised.push(arrival?.agentId ?? null);
  }

  for (const duplicate of duplicates) {
    deviations.push({
      agent: duplicate.expectedAgent,
      code: Deviation.RUNTIME_RETRY_OBSERVED,
      detail:
        `arrival ${duplicate.arrivalOrdinal} repeats logical invocation ` +
        `${duplicate.logicalInvocationKey} first seen at arrival ${duplicate.duplicateOfOrdinal}; ` +
        'one proposal reached the ingress more than once',
    });
  }

  const exactlyOncePerExpectedAgent =
    unrecognised.length === 0 && expectedAgents.every((agent) => counts[agent] === 1);
  if (!exactlyOncePerExpectedAgent) {
    deviations.push({
      code: Deviation.INGRESS_ARRIVAL_CARDINALITY,
      detail:
        `an accepted trial requires exactly one arrival from each of ${expectedAgents.join(' and ')}; ` +
        `saw ${JSON.stringify(counts)}` +
        (unrecognised.length > 0 ? ` and ${unrecognised.length} from neither` : ''),
    });
  }

  const retryObserved = duplicates.length > 0;
  return {
    supplied: true,
    detectedAt: 'ingress',
    armNeutral: true,
    arrivalCount: arrivals.length,
    // The ordinals only. The arrivals themselves are retained whole on the
    // attempt they belong to; copying them in here would put the same records in
    // the packet twice and invite the two copies to disagree.
    arrivalOrdinals: arrivals.map((arrival) => arrival?.arrivalOrdinal ?? null),
    arrivalsByExpectedAgent: counts,
    unrecognisedAgents: unrecognised,
    duplicates,
    retryObserved,
    exactlyOncePerExpectedAgent,
    acceptable: !retryObserved && exactlyOncePerExpectedAgent,
    verdict: retryObserved ? TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY : null,
    deviations,
    why:
      'Every arrival is retained, whether or not it was dispatched. A duplicate is not dropped ' +
      'and not made harmless: it is refused a second dispatch, so it mints no receipt and causes ' +
      'no second mutation, and it disqualifies the trial it appeared in.',
  };
}

/**
 * The trial verdict an observed runtime retry produces, in the shape
 * `classifyTrial` returns, so a consumer never has to special-case it.
 *
 * It exists because a runtime retry can happen in an attempt where no model was
 * in the loop at all — an HTTP client, a proxy or ADK's own `@retry_on_errors`
 * can duplicate a mutation without any model proposing twice. `trial: null`
 * would then read as "the validity question does not arise", which is exactly
 * backwards.
 */
export function runtimeRetryTrial(ingress) {
  return {
    valid: false,
    accepted: false,
    verdict: TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY,
    classification: RUNTIME_RETRY,
    compositionVerdict: null,
    rule: TRIAL_VALIDITY_RULE,
    ingress,
    deviations: ingress.deviations,
    why:
      'the same logical invocation arrived at the ingress more than once. The proposal trail ' +
      'cannot see this: ADK fires before_tool_callback and after_tool_callback once, around a ' +
      'tool method that is itself decorated with @retry_on_errors, so one recorded proposal can ' +
      'correspond to two mutations. This attempt consumes one of the permitted attempts and can ' +
      'never support a PASS.',
  };
}

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
 *
 * ## `valid` and `accepted` are two different questions
 *
 * `valid` is the predeclared rule and only the predeclared rule: did each model
 * propose the predeclared intent in both arms. `accepted` is `valid` **and** the
 * ingress evidence that exactly one A arrival and exactly one B arrival reached
 * the wire, with no logical invocation arriving twice.
 *
 * They are separate because they can fail separately and for different reasons.
 * A model can propose exactly the right thing while the runtime underneath it
 * sends that proposal twice — the proposal trail is clean, and the trial is
 * still worthless. `arrivals` is therefore not optional in any sense that
 * matters: when it is absent, `accepted` is `false`, because "we did not look"
 * is not evidence that nothing happened.
 *
 * @param arrivals  the ingress arrival records for this attempt, or `undefined`
 */
export function classifyTrial(attempt, expected = EXPECTED_DIGESTS, arrivals) {
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

  const ingress =
    arrivals === undefined
      ? arrivalsUnavailable(
          'no ingress arrival record was supplied with this classification, so neither a runtime ' +
            'retry nor the one-arrival-per-agent requirement could be checked; the trial cannot ' +
            'be accepted on the proposal trail alone',
        )
      : classifyArrivals(arrivals, expected);

  const valid = deviations.length === 0;
  // A runtime retry outranks the model verdict. It is the more specific fact,
  // and it is the one that says the measurement itself is unusable: the pair the
  // ingress saw may be one agent's two sends rather than A and B.
  const verdict = ingress.retryObserved
    ? TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY
    : valid
      ? TrialVerdict.VALID
      : TrialVerdict.INVALID_TRIAL;
  return {
    valid,
    accepted: valid && ingress.acceptable,
    verdict,
    classification: ingress.retryObserved ? RUNTIME_RETRY : valid ? null : MODEL_FAILURE,
    // Always null. A trial-validity judgement is not a statement about
    // composition, whichever way it comes out.
    compositionVerdict: null,
    rule: TRIAL_VALIDITY_RULE,
    ingress,
    invocations,
    // The model's deviations, and only the model's. What the runtime did is a
    // different question with a different answer, and it is answered in
    // `ingress.deviations` — merging the two would make "the model proposed
    // exactly what it was asked to" unreadable off this field. `accepted` is
    // what a caller should gate on; neither list alone is enough.
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
