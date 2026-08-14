/**
 * The arrival recorder: one implementation, two ingresses.
 *
 * ## Why it was extracted
 *
 * The neutral ingress in `bin/run-arm.mjs` recorded arrivals, derived the
 * logical invocation each belonged to, and refused a second one — and it was the
 * only thing that did. The deployed Phase 7 ingress (`bin/ingress-service.mjs`)
 * needs exactly the same behaviour over a different transport, and a second copy
 * of it would drift from the first the moment either changed.
 *
 * That drift is not a maintenance annoyance here, it is a validity problem. The
 * whole point of the local end-to-end gate is that the deployed path produces
 * *the same evidence* the local one does: the same arrival record shape, the same
 * duplicate judgement, the same refusal. Two implementations could agree on the
 * day they were written and disagree on the day the packet was produced, and
 * nothing in the packet would say which one recorded what.
 *
 * So there is one recorder. `run-arm.mjs`'s `createIngress` and
 * `ingress-service.mjs` both call it; the only thing that differs between them is
 * how a request is parsed and how an answer is framed, which is transport, not
 * judgement.
 *
 * ## What the recorder does, and deliberately does not do
 *
 * It records **before** anything is dispatched, so an arrival that is refused,
 * fails or hangs is still in the record. It marks a repeat of a logical
 * invocation already seen and tells the caller not to forward it. It does not
 * drop anything, does not make anything idempotent, and does not decide
 * authorization — a duplicate is refused a *second dispatch* and is otherwise
 * retained exactly like any other arrival.
 *
 * Making the retry harmless at the target would make it invisible, and the claim
 * this experiment has to be able to check is that no runtime retry occurred in an
 * accepted trial — not that one would not have mattered.
 */
import { intentDigest } from '../../../dist/authorization/intent.js';

import { TrialVerdict, logicalInvocationKey } from './trial.mjs';

/**
 * The header a caller may use to name the tool invocation an arrival belongs to.
 *
 * Optional, because the transport this experiment measures does not always carry
 * one: ADK's retry happens *below* the tool boundary, inside
 * `McpTool._run_async_impl`, and MCP itself carries no stable tool-call id
 * across a fresh session. When it is absent, `logicalInvocationKey` falls back to
 * the caller identity and the intent digest, which the ingress can always see.
 */
export const TOOL_INVOCATION_HEADER = 'x-hac316-tool-invocation-id';

/** A wall-clock instant with sub-millisecond resolution. */
export const nowMs = () => performance.timeOrigin + performance.now();

/** Read one header value, collapsing the array form Node can produce. */
export function headerValue(headers, name) {
  const value = headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The body an ingress answers a refused duplicate with.
 *
 * It deliberately carries **no `outcome`**. Nothing was dispatched, so there is
 * no outcome to report, and synthesising one would be the ingress claiming a
 * result it never obtained. Consumers ask `isRefusedDuplicate` first; see the
 * note on that function for the crash this shape used to cause.
 */
export function duplicateArrivalRefusal({ correlationId, duplicateOfOrdinal }) {
  return {
    correlationId,
    duplicateArrival: true,
    duplicateOfOrdinal,
    detail:
      'this logical invocation already arrived at the ingress; it was not dispatched, so no ' +
      'receipt was minted and no mutation was attempted. The trial it belongs to is ' +
      `${TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY}.`,
  };
}

/**
 * Whether an ingress answer is the refusal above.
 *
 * ## The crash this exists to remove
 *
 * Both arm loops in `run-arm.mjs` dereferenced `result.outcome` unconditionally —
 * `if (outcome.authorized)` in the baseline arm and `result.outcome.response` in
 * the Interlock arms. A refused duplicate carries no `outcome`, so the *first*
 * time the driver's own retry detector fired it threw
 * `TypeError: Cannot read properties of undefined (reading 'authorized')`, exited
 * 1, and never wrote `results.json`. The `RUNTIME_RETRY` branch of
 * `dispositionOf` was therefore unreachable on the real driver, and the attempt
 * that would have proved the detector works was the one attempt that could not be
 * retained — which is exactly what X-05 forbids.
 *
 * The predicate is exported rather than spelled inline at each call site so a
 * third consumer cannot forget the branch.
 */
export function isRefusedDuplicate(answer) {
  return answer?.duplicateArrival === true;
}

/**
 * Record arrivals for one ingress, in one arm, for one run.
 *
 * `observations` is the caller's array and is appended to in place, because the
 * arm that owns it retains it verbatim in the packet. `seen` is private: an
 * ingress that could be handed a pre-populated duplicate table could be made to
 * refuse a first arrival, or to forward a second one.
 */
export function createArrivalRecorder({ observations, arm = 'unknown', runId }) {
  if (!Array.isArray(observations)) {
    throw new TypeError('an arrival recorder needs the array its arrivals are retained in');
  }
  if (typeof runId !== 'string' || runId === '') {
    throw new TypeError('every arrival is stamped with the run it belongs to; runId is required');
  }

  const seen = new Map();

  return {
    /**
     * Stamp and retain one arrival, and say whether it repeats an earlier one.
     *
     * Called before any dispatch decision, and it never throws on a malformed
     * caller: an arrival whose identity could not be established is still an
     * arrival, and refusing to record it would hide the thing most worth seeing.
     *
     * @returns `{ arrival, duplicateOfOrdinal }` — `duplicateOfOrdinal` is
     *          `null` when this is the first sighting of the invocation.
     */
    record({
      agentId,
      expectedAgent = null,
      identitySource,
      correlationId,
      intent,
      toolInvocationId = null,
      startedAtMs,
    }) {
      const arrival = {
        runId,
        arm,
        arrivalOrdinal: observations.length + 1,
        timestamp: new Date().toISOString(),
        agentId,
        expectedAgent,
        // How the identity above was established. Not part of
        // `ARRIVAL_RECORD_FIELDS` — the retry judgement does not need it — but
        // the difference between a platform-verified OIDC subject and a
        // self-declared body field is the whole of I2, and a record that did not
        // say which one it was could not be audited for it.
        identitySource,
        correlationId,
        service: intent?.arguments?.service,
        // The digest of what the ingress actually received, not of what the
        // caller meant to send. This is the value the trial-validity rule is
        // about, and it has to be taken from the wire or it proves nothing.
        logicalIntentDigest: intentDigest(intent),
        toolInvocationId:
          typeof toolInvocationId === 'string' && toolInvocationId !== '' ? toolInvocationId : null,
        startMs: startedAtMs,
        endMs: null,
        dispatched: false,
        duplicateOfOrdinal: null,
      };
      arrival.logicalInvocationKey = logicalInvocationKey(arrival);
      observations.push(arrival);

      const firstOrdinal = seen.get(arrival.logicalInvocationKey);
      if (firstOrdinal !== undefined) {
        arrival.duplicateOfOrdinal = firstOrdinal;
        return { arrival, duplicateOfOrdinal: firstOrdinal };
      }
      seen.set(arrival.logicalInvocationKey, arrival.arrivalOrdinal);
      return { arrival, duplicateOfOrdinal: null };
    },

    /** Mark an arrival as forwarded. Only the caller knows whether it was. */
    markDispatched(arrival) {
      arrival.dispatched = true;
      return arrival;
    },

    /** Stamp the instant handling finished, inside the server. */
    finish(arrival, at = nowMs()) {
      arrival.endMs = at;
      return arrival;
    },
  };
}
