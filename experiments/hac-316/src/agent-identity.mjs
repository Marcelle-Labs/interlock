/**
 * Which expected agent an arrival came from, decided from the platform.
 *
 * ## The thing this must never do
 *
 * The local harness reads `body.agent` and believes it. That is fine locally,
 * where the harness is also the caller and the field is its own — but on Agent
 * Runtime the caller is a Gemini-backed agent reached over MCP, and a body field
 * naming the agent is a claim the caller makes about itself. Any caller could
 * send `"agent": "capacity-planner"`, and an ingress that believed it would
 * record A and B as distinct on the strength of a string the callers chose.
 * Every downstream fact — the A/B overlap, the one-arrival-per-agent rule, the
 * duplicate detection that is keyed on caller identity — would then rest on
 * self-declaration.
 *
 * So identity comes from `observeIdentity` (`src/proxy/identity.js`), which reads
 * only what the platform put on the request: the Cloud Run / IAP end-user header,
 * or the claims of an ID token the platform verified before the container was
 * invoked. Nothing in the request body, and no caller-set header, is consulted.
 *
 * ## And the mapping is configuration, not inference
 *
 * The platform reports a service-account principal — `something@project.iam
 * .gserviceaccount.com` — and knows nothing about "A" and "B". Agent Runtime
 * supports a custom `service_account` per deployed instance, so A and B run under
 * distinct principals; which principal is which is a fact about the deployment,
 * supplied at startup and recorded in the packet.
 *
 * ## Fail closed, twice
 *
 * At startup: a deployment that did not name both principals, or that named the
 * same one twice, does not start. Two agents that share a principal are one
 * agent as far as every judgement downstream is concerned, and an ingress that
 * discovered that at request time would already have recorded arrivals it could
 * not attribute.
 *
 * At request time: an arrival whose observed identity matches neither principal
 * is refused, not guessed at and not passed through. It is still recorded — it
 * arrived, and an unattributable arrival is precisely the kind of fact X-05
 * forbids hiding — but it is never dispatched, so it mints no receipt and causes
 * no mutation.
 */
import { EXPECTED_AGENT_IDENTITIES } from './trial.mjs';

/** Refusal code for an arrival whose identity matches no expected agent. */
export const IDENTITY_FAIL_CLOSED = 'INGRESS_IDENTITY_FAIL_CLOSED';

/**
 * The environment variable naming each expected agent's deployed principal.
 *
 * Derived from the expected agents rather than typed, so an experiment that grew
 * a third agent could not silently keep a two-entry map.
 */
export const AGENT_IDENTITY_ENV = Object.freeze(
  Object.fromEntries(
    Object.keys(EXPECTED_AGENT_IDENTITIES).map((agent) => [
      agent,
      `HAC316_AGENT_${agent}_PRINCIPAL`,
    ]),
  ),
);

/** Thrown when the deployment did not say who A and B are. */
export class AgentIdentityConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AgentIdentityConfigurationError';
  }
}

/**
 * Read the principal → expected-agent map from the environment.
 *
 * Trims, and treats empty or whitespace-only as absent for the same reason
 * `src/env.mjs` does: `HAC316_AGENT_A_PRINCIPAL=` in a rendered env file is a
 * variable nobody set, and reading it as a value would map every unauthenticated
 * arrival onto agent A.
 *
 * The map has a null prototype. `constructor` and `toString` are not principals,
 * and an allow-list that inherits property names is not an allow-list.
 */
export function readAgentPrincipals(env = process.env) {
  const principals = Object.create(null);
  const missing = [];

  for (const [agent, variable] of Object.entries(AGENT_IDENTITY_ENV)) {
    const raw = env[variable];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      missing.push(variable);
      continue;
    }
    if (Object.hasOwn(principals, value)) {
      throw new AgentIdentityConfigurationError(
        `${variable} names ${value}, which is already the principal of agent ${principals[value]}. ` +
          'Two agents sharing one service account are one agent to every judgement downstream: ' +
          'the A/B overlap, the one-arrival-per-agent rule and the duplicate key would all be ' +
          'computed over a caller that cannot be told apart from itself.',
      );
    }
    principals[value] = agent;
  }

  if (missing.length > 0) {
    throw new AgentIdentityConfigurationError(
      `${missing.join(' and ')} must name the service account each agent is deployed under. ` +
        'Identity is taken from the platform, never from the request, so without this mapping ' +
        'the ingress cannot attribute an arrival to an expected agent — and guessing, or falling ' +
        'back to a body field, is the failure this configuration exists to prevent.',
    );
  }

  return principals;
}

/**
 * Resolve one observed identity to an expected agent, or refuse.
 *
 * `observed` is an `ObservedIdentity` from `observeIdentity`. A refusal names
 * what was observed and how, so a deployment misconfiguration is legible from
 * the record rather than from a guess about which principal was expected.
 */
export function resolveExpectedAgent(principals, observed) {
  const identity = observed?.identity;
  const identitySource = observed?.identitySource ?? 'unknown';

  if (typeof identity !== 'string' || identity === '') {
    return {
      ok: false,
      failClosed: true,
      code: IDENTITY_FAIL_CLOSED,
      agentId: null,
      expectedAgent: null,
      identitySource,
      detail: 'no caller identity was observed on this request; refusing rather than dispatching',
    };
  }

  if (!Object.hasOwn(principals, identity)) {
    return {
      ok: false,
      failClosed: true,
      code: IDENTITY_FAIL_CLOSED,
      agentId: identity,
      expectedAgent: null,
      identitySource,
      detail:
        `the platform reported caller ${identity} (${identitySource}), which is neither expected ` +
        'agent. Refusing: an arrival that cannot be attributed to A or B can never be half of a ' +
        'measured A/B overlap, and dispatching it would put an unattributed mutation on a ' +
        'protected target.',
    };
  }

  return {
    ok: true,
    failClosed: false,
    code: null,
    agentId: identity,
    expectedAgent: principals[identity],
    identitySource,
    detail: null,
  };
}
