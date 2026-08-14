/**
 * Ingress arrival fixtures, in exactly the shape the ingress stamps.
 *
 * Not a test file — `vitest.config.ts` collects `experiments/** /test/*.test.mjs`,
 * and this is deliberately not one. It exists because two test files need to
 * fabricate arrivals and a second, subtly different builder in the other file
 * would let one of them keep passing against a shape the ingress no longer
 * produces.
 *
 * The one rule here is that `arrival()` may not invent a field the ingress does
 * not stamp, and may not omit one it does: `ARRIVAL_RECORD_FIELDS` is asserted
 * against this builder in `ingress-arrivals.test.mjs`, so the fixture and the
 * real record cannot drift apart silently.
 */
import {
  EXPECTED_AGENT_IDENTITIES,
  EXPECTED_DIGESTS,
  expectedAgentFor,
  logicalInvocationKey,
} from '../src/trial.mjs';

/** The service each expected agent's predeclared intent names. */
const SERVICE = Object.freeze({ A: 'alpha', B: 'beta' });

/**
 * One arrival, as the neutral ingress would have retained it.
 *
 * `expectedAgent` is resolved through `expectedAgentFor`, never passed in, so a
 * fixture cannot claim an identity the resolver would not agree with.
 */
export function arrival({
  agent = 'A',
  ordinal = 1,
  startMs = 1_000,
  endMs = 1_100,
  toolInvocationId = null,
  arm = 'treatment',
  runId = 'hac316-run-fixture',
  correlationId = `c-${agent}-${ordinal}`,
  dispatched = true,
  duplicateOfOrdinal = null,
  agentId = EXPECTED_AGENT_IDENTITIES[agent] ?? agent,
} = {}) {
  const record = {
    runId,
    arm,
    arrivalOrdinal: ordinal,
    timestamp: new Date(startMs).toISOString(),
    agentId,
    expectedAgent: expectedAgentFor(agentId),
    correlationId,
    service: SERVICE[agent] ?? 'alpha',
    logicalIntentDigest: EXPECTED_DIGESTS[agent] ?? 'sha256:unrecognised',
    toolInvocationId,
    startMs,
    endMs,
    dispatched,
    duplicateOfOrdinal,
  };
  record.logicalInvocationKey = logicalInvocationKey(record);
  return record;
}

/** The ordinary case: A and B, once each, overlapping at the ingress. */
export function overlappingPair() {
  return [
    arrival({ agent: 'A', ordinal: 1, startMs: 1_000, endMs: 1_100 }),
    arrival({ agent: 'B', ordinal: 2, startMs: 1_010, endMs: 1_110 }),
  ];
}

/** A and B, once each, whose windows do not touch. */
export function disjointPair() {
  return [
    arrival({ agent: 'A', ordinal: 1, startMs: 1_000, endMs: 1_100 }),
    arrival({ agent: 'B', ordinal: 2, startMs: 1_500, endMs: 1_600 }),
  ];
}
