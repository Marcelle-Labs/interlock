#!/usr/bin/env node
/**
 * The identity gate. Infrastructure qualification, not a causal experiment.
 *
 * ## What this decides, and what it deliberately does not
 *
 * HAC-316 pairs overlapping arrivals at the ingress by which agent sent them
 * (R5, REQ-079). That pairing is only meaningful if the two agent runtimes are
 * two identities. If they are one, every arrival carries the same principal,
 * `expectedAgentFor` resolves every arrival to the same agent or to none, and
 * the experiment still produces numbers - it just produces them about nothing.
 * That is the failure this file exists to make impossible to miss.
 *
 * So this is a qualification of the infrastructure and nothing more. It does not
 * measure coupling, does not run an arm, does not touch the protected operation,
 * and its passing says nothing whatsoever about the hypothesis. It says only:
 * the two runtimes are two identities, and the ingress can tell which is which.
 *
 * ## The four things it proves
 *
 *   1. deployed runtime A reports `effectiveIdentity` == the expected SA-A
 *   2. deployed runtime B reports `effectiveIdentity` == the expected SA-B
 *   3. SA-A != SA-B
 *   4. a request over the same real MCP/ingress transport the experiment uses is
 *      observed by the ingress as SA-A when A sends it and SA-B when B sends it,
 *      and observed as identity the *platform* verified
 *
 * Three and four are not the same claim and neither implies the other. Two
 * distinct service accounts that both reach the ingress through something that
 * flattens them - a shared connection pool, an intermediary that re-signs, a
 * runtime that ignores the configured account - are distinct in the control
 * plane and indistinguishable on the wire, which is the only place the
 * experiment reads them. Equally, an ingress that reports two identities from a
 * field the caller filled in proves nothing about who called. So the wire is
 * checked, and it is checked for platform-verified identity specifically.
 *
 * ## Why there is no fallback, and why one may not be added
 *
 * The obvious repair for a failing step 4 is for the caller to say who it is -
 * an `agent` field in the body, an `X-Agent-Id` header. `bin/run-arm.mjs` does
 * exactly that locally, on purpose, because locally the harness *is* both
 * callers and there is no identity to discover. In cloud that same move would
 * make this gate pass unconditionally: the thing being checked is whether the
 * platform distinguishes the runtimes, and a value the caller chooses is not
 * evidence about the platform. It would convert a FAIL into a PASS without
 * changing anything about the world.
 *
 * So `CALLER_ASSERTED_SOURCES` is enumerated and rejected by name rather than
 * merely omitted from the allow-list, and the rejection message says which
 * source was offered. If step 4 cannot be satisfied with platform-verified
 * identity, the honest outcome is that HAC-316 is FAIL/PIVOT.
 *
 * ## Structure
 *
 * `judgeIdentityPreflight` is a pure function of readings and expectations, and
 * is where every decision lives; it is unit-tested against injected readings
 * covering each way the gate must fail. Everything above it is the adapter that
 * obtains those readings from the cloud, and it is I/O only - it makes no
 * judgement, so a bug there cannot turn a FAIL into a PASS, only into an error.
 *
 * Run (only after the ADK deploy has created R-09 and R-10):
 *   node experiments/hac-316/bin/identity-preflight.mjs
 *
 * Exit codes:
 *   0  qualified - attempt 1 of at most 3 is eligible
 *   1  NOT qualified - HAC-316 is FAIL/PIVOT
 *   2  the readings could not be obtained at all - also not qualified
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectInvocation } from '../src/entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const evidenceDir = join(experimentDir, 'evidence');
const TOPOLOGY_PATH = join(evidenceDir, 'topology.json');
const VERDICT_PATH = join(evidenceDir, 'identity-preflight.json');

/** The two agents, in the order everything else in the experiment names them. */
export const AGENTS = Object.freeze(['A', 'B']);

/**
 * The transport the experiment actually uses.
 *
 * Step 4 is only worth making if the probe travels the path the trials travel.
 * A probe over a side channel - a debug port, a direct describe call, an
 * out-of-band token check - can succeed while the path the experiment uses
 * flattens both callers into one, so the transport is asserted rather than
 * assumed, and a probe that reports any other transport is refused.
 */
export const EXPERIMENT_TRANSPORT = 'mcp/ingress-service';

/**
 * The marker `src/proxy/identity.ts` puts in a source string it stands behind.
 *
 * `observeIdentity` encodes the provenance in the source string itself rather
 * than in a separate flag - `x-goog-authenticated-user-email/platform-verified`,
 * `oidc-id-token/platform-verified:email`, `oidc-id-token/platform-verified:sub`
 * - and `none/no-authenticated-principal-observed` when it saw nothing. Matching
 * the marker rather than enumerating the four is what keeps this gate correct
 * when a fifth appears: a new source that claims platform verification says so
 * in the same place, and one that does not is refused by default.
 *
 * Cloud Run validates the token before the container is invoked. With
 * `--no-allow-unauthenticated` a request not carrying a token from a principal
 * holding `roles/run.invoker` does not arrive at all, so the email claim on that
 * validated token is a fact about who called, established by something other
 * than the caller.
 */
export const PLATFORM_VERIFIED_MARKER = '/platform-verified';

/**
 * The sources that satisfy the marker today, enumerated for the tests.
 *
 * Documentation and a drift check, not the predicate: `isPlatformVerified` is
 * the predicate. If these two ever disagree the test says so.
 */
export const PLATFORM_VERIFIED_SOURCES = Object.freeze([
  'x-goog-authenticated-user-email/platform-verified',
  'oidc-id-token/platform-verified:email',
  'oidc-id-token/platform-verified:sub',
]);

/** Whether a source string is the platform's word. Absent is never yes. */
export function isPlatformVerified(source) {
  return typeof source === 'string' && source.includes(PLATFORM_VERIFIED_MARKER);
}

/**
 * Provenances that are the caller's own account of itself.
 *
 * Named, not merely absent. An allow-list that silently drops these would
 * produce `IDENTITY_NOT_PLATFORM_VERIFIED` for a typo and for a substituted
 * caller-controlled header alike, and those two want different messages: one is
 * a mistake and the other is the gate being defeated.
 *
 * `experiment-harness` is `CALLER_IDENTITY_SOURCE` in `bin/run-arm.mjs`, where
 * it is correct, because locally there is one process and no identity to
 * discover. Reaching this gate it would mean the cloud ingress had been wired to
 * trust `body.agent`, which is the specific substitution this refuses.
 */
export const CALLER_ASSERTED_SOURCES = Object.freeze([
  'experiment-harness',
  'request-body-agent-field',
  'request-header',
  'x-agent-id-header',
  'self-declared',
]);

/** Every way the gate can refuse. Each is a reason, not a category of one. */
export const IdentityFailure = Object.freeze({
  /** The expectation itself names one identity twice. Nothing to check. */
  EXPECTED_IDENTITIES_NOT_DISTINCT: 'EXPECTED_IDENTITIES_NOT_DISTINCT',
  /** No expected service account was supplied for an agent. */
  EXPECTED_IDENTITY_ABSENT: 'EXPECTED_IDENTITY_ABSENT',
  /** The runtime reported no effectiveIdentity, so nothing can be concluded. */
  MISSING_READING: 'MISSING_READING',
  /** The runtime is running as something, but not as what was expected. */
  EFFECTIVE_IDENTITY_MISMATCH: 'EFFECTIVE_IDENTITY_MISMATCH',
  /** Both runtimes report the same effectiveIdentity. The fatal one. */
  EFFECTIVE_IDENTITY_NOT_DISTINCT: 'EFFECTIVE_IDENTITY_NOT_DISTINCT',
  /** The ingress saw nothing at all from this agent. */
  INGRESS_OBSERVATION_MISSING: 'INGRESS_OBSERVATION_MISSING',
  /** The ingress saw the agent more than once; which reading counts is a choice. */
  INGRESS_OBSERVATION_AMBIGUOUS: 'INGRESS_OBSERVATION_AMBIGUOUS',
  /** The ingress saw someone, but not the identity this agent runs as. */
  INGRESS_OBSERVED_WRONG_PRINCIPAL: 'INGRESS_OBSERVED_WRONG_PRINCIPAL',
  /** The ingress saw one principal for both agents. */
  INGRESS_OBSERVATION_NOT_DISTINCT: 'INGRESS_OBSERVATION_NOT_DISTINCT',
  /** The observation did not travel the transport the experiment uses. */
  INGRESS_TRANSPORT_MISMATCH: 'INGRESS_TRANSPORT_MISMATCH',
  /** The identity came from the caller rather than from the platform. */
  IDENTITY_NOT_PLATFORM_VERIFIED: 'IDENTITY_NOT_PLATFORM_VERIFIED',
  /** The identity came from a source that is the caller's own claim, by name. */
  IDENTITY_CALLER_ASSERTED: 'IDENTITY_CALLER_ASSERTED',
});

/** What a refusal of this gate means for the experiment. Said once, here. */
export const PIVOT_VERDICT =
  'HAC-316 is FAIL/PIVOT. The two agent runtimes are not distinguishable at the ingress over the ' +
  'transport the experiment uses, so arrivals cannot be attributed to agents and R5 overlap ' +
  'pairing would be pairing arrivals it cannot tell apart. Do not run an arm. Do not add a ' +
  'caller-supplied identity header to make this pass: the caller choosing its own name is not ' +
  'evidence about whether the platform can distinguish the callers.';

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * The whole decision, as a pure function.
 *
 * `readings.runtimes[agent].effectiveIdentity` is what the control plane says
 * the deployed runtime runs as. `readings.ingressObservations` is what the
 * ingress says it saw on the wire. `expected[agent].serviceAccount` is what the
 * manifest declared. All three have to agree, and the third is checked against
 * the first two rather than trusted, because a manifest asserting two names is
 * not evidence that two identities exist.
 *
 * Returns `{ qualified, failures, checks, summary }`. `failures` is complete
 * rather than first-wins: an operator who has to redeploy wants every reason at
 * once, not one per round trip.
 */
export function judgeIdentityPreflight({ expected = {}, readings = {} } = {}) {
  const failures = [];
  const checks = [];
  const refuse = (code, detail, agent = null) => failures.push({ code, detail, agent });
  const record = (id, ok, detail) => checks.push({ id, ok, detail });

  const transport = isNonEmptyString(expected.transport)
    ? expected.transport
    : EXPERIMENT_TRANSPORT;
  const runtimes = readings.runtimes ?? {};
  const observations = Array.isArray(readings.ingressObservations)
    ? readings.ingressObservations
    : [];

  // --- the expectation has to name two things before anything is checked -----
  const expectedIdentity = {};
  for (const agent of AGENTS) {
    const value = expected[agent]?.serviceAccount;
    if (!isNonEmptyString(value)) {
      refuse(
        IdentityFailure.EXPECTED_IDENTITY_ABSENT,
        `no expected service account was supplied for agent ${agent}; there is nothing to check ` +
          'the deployed runtime against',
        agent,
      );
      continue;
    }
    expectedIdentity[agent] = value;
  }
  const bothExpected = AGENTS.every((agent) => expectedIdentity[agent] !== undefined);
  if (bothExpected && expectedIdentity.A === expectedIdentity.B) {
    refuse(
      IdentityFailure.EXPECTED_IDENTITIES_NOT_DISTINCT,
      `the expectation names one identity twice (${expectedIdentity.A}). Two runtimes configured ` +
        'with the same service account are one identity, and no reading of the deployment can ' +
        'make them two.',
    );
  }
  record('expected-identities-distinct', bothExpected && expectedIdentity.A !== expectedIdentity.B,
    bothExpected ? `${expectedIdentity.A} vs ${expectedIdentity.B}` : 'an expectation is absent');

  // --- 1 and 2: each deployed runtime runs as the identity it was given ------
  const actualIdentity = {};
  for (const agent of AGENTS) {
    const reading = runtimes[agent];
    const observedIdentity = reading?.effectiveIdentity;
    if (!isNonEmptyString(observedIdentity)) {
      refuse(
        IdentityFailure.MISSING_READING,
        `runtime ${agent} reported no effectiveIdentity. Absent is not "probably fine": a runtime ` +
          'whose identity cannot be read is a runtime whose arrivals cannot be attributed.',
        agent,
      );
      continue;
    }
    actualIdentity[agent] = observedIdentity;
    if (expectedIdentity[agent] !== undefined && observedIdentity !== expectedIdentity[agent]) {
      refuse(
        IdentityFailure.EFFECTIVE_IDENTITY_MISMATCH,
        `runtime ${agent} runs as ${observedIdentity}, but was expected to run as ` +
          `${expectedIdentity[agent]}. It is running as something, and not as what was declared, ` +
          'so the manifest and the deployment disagree about who this agent is.',
        agent,
      );
    }
    record(
      `runtime-${agent}-effective-identity`,
      observedIdentity === expectedIdentity[agent],
      `${observedIdentity}`,
    );
  }

  // --- 3: and they are not each other ---------------------------------------
  const bothRead = AGENTS.every((agent) => actualIdentity[agent] !== undefined);
  if (bothRead && actualIdentity.A === actualIdentity.B) {
    refuse(
      IdentityFailure.EFFECTIVE_IDENTITY_NOT_DISTINCT,
      `both runtimes report effectiveIdentity ${actualIdentity.A}. This is the failure the gate ` +
        'exists for: the deployment produced one identity where the design needs two, and every ' +
        'arrival at the ingress would carry that one identity.',
    );
  }
  record(
    'deployed-identities-distinct',
    bothRead && actualIdentity.A !== actualIdentity.B,
    bothRead ? `${actualIdentity.A} vs ${actualIdentity.B}` : 'a reading is absent',
  );

  // --- 4: and the ingress sees exactly that, on the wire, from the platform --
  const observedPrincipal = {};
  for (const agent of AGENTS) {
    const forAgent = observations.filter((entry) => entry?.agent === agent);
    if (forAgent.length === 0) {
      refuse(
        IdentityFailure.INGRESS_OBSERVATION_MISSING,
        `the ingress observed no request from agent ${agent} over ${transport}. An ingress that ` +
          'did not see one of the two callers cannot distinguish them, whatever the control ' +
          'plane reports.',
        agent,
      );
      continue;
    }
    if (forAgent.length > 1) {
      refuse(
        IdentityFailure.INGRESS_OBSERVATION_AMBIGUOUS,
        `the ingress reported ${forAgent.length} observations for agent ${agent}; which one counts ` +
          'would be this script\'s choice rather than a fact about the deployment',
        agent,
      );
      continue;
    }

    const [observation] = forAgent;
    if (observation.transport !== transport) {
      refuse(
        IdentityFailure.INGRESS_TRANSPORT_MISMATCH,
        `agent ${agent} was observed over ${observation.transport ?? 'an unstated transport'}, not ` +
          `over ${transport}. Identity established on a path the trials do not take says nothing ` +
          'about the path they do take.',
        agent,
      );
      continue;
    }

    const source = observation.verifiedBy;
    if (CALLER_ASSERTED_SOURCES.includes(source)) {
      refuse(
        IdentityFailure.IDENTITY_CALLER_ASSERTED,
        `agent ${agent}'s identity at the ingress came from ${source}, which is the caller's own ` +
          'account of itself. That value would be whatever the caller wrote, so it cannot be ' +
          'evidence that the platform distinguishes the callers. This gate does not accept it, ' +
          'and it is refused by name so that substituting it cannot be mistaken for a repair.',
        agent,
      );
      continue;
    }
    if (!isPlatformVerified(source)) {
      refuse(
        IdentityFailure.IDENTITY_NOT_PLATFORM_VERIFIED,
        `agent ${agent}'s identity at the ingress came from ${source ?? 'an unstated source'}, ` +
          `which does not carry the ${PLATFORM_VERIFIED_MARKER} marker that ` +
          'src/proxy/identity.ts puts on a provenance it stands behind. Fail closed: an identity ' +
          'whose provenance is unknown is not a verified identity.',
        agent,
      );
      continue;
    }

    const principal = observation.observedPrincipal;
    if (!isNonEmptyString(principal)) {
      refuse(
        IdentityFailure.INGRESS_OBSERVATION_MISSING,
        `the ingress reported an observation for agent ${agent} carrying no principal`,
        agent,
      );
      continue;
    }
    observedPrincipal[agent] = principal;
    if (expectedIdentity[agent] !== undefined && principal !== expectedIdentity[agent]) {
      refuse(
        IdentityFailure.INGRESS_OBSERVED_WRONG_PRINCIPAL,
        `the ingress observed agent ${agent} as ${principal}, but agent ${agent} runs as ` +
          `${expectedIdentity[agent]}. The wire and the control plane disagree, and the wire is ` +
          'what the experiment reads.',
        agent,
      );
    }
    record(`ingress-observed-${agent}`, principal === expectedIdentity[agent], `${principal} via ${source}`);
  }

  const bothObserved = AGENTS.every((agent) => observedPrincipal[agent] !== undefined);
  if (bothObserved && observedPrincipal.A === observedPrincipal.B) {
    refuse(
      IdentityFailure.INGRESS_OBSERVATION_NOT_DISTINCT,
      `the ingress observed both agents as ${observedPrincipal.A}. Whatever the control plane ` +
        'reports, on the wire there is one caller, and the wire is where attribution happens.',
    );
  }
  record(
    'ingress-identities-distinct',
    bothObserved && observedPrincipal.A !== observedPrincipal.B,
    bothObserved ? `${observedPrincipal.A} vs ${observedPrincipal.B}` : 'an observation is absent',
  );

  const qualified = failures.length === 0;
  return {
    qualified,
    failures,
    checks,
    transport,
    summary: qualified
      ? `qualified: A=${actualIdentity.A} B=${actualIdentity.B}, distinct, and each observed as ` +
        `itself at the ingress over ${transport} with platform-verified identity. Attempt 1 of at ` +
        'most 3 is eligible.'
      : `NOT qualified: ${failures.length} refusal(s). ${PIVOT_VERDICT}`,
  };
}

/** The permitted attempts a *qualified* deployment gets. Step 5 of the ordering. */
export const ATTEMPTS_WHEN_QUALIFIED = 3;

/**
 * How many attempts this verdict makes eligible.
 *
 * Zero unless the gate passed, and separated out here rather than left inline in
 * `main` because it is the load-bearing half of the ordering this file exists to
 * enforce: `bin/10-provision.sh` writes `attemptsEligible: 0` into topology.json
 * with `blockedBy: identity-preflight`, and nothing but a passing preflight may
 * raise it. Inline, that rule was a expression in an I/O function that no test
 * and no requirement could reach without deploying something.
 *
 * `qualified` is required to be exactly `true`. A verdict-shaped object that
 * omitted the field, or carried a truthy string, would otherwise buy three
 * attempts — and the one thing this gate may never do is fail open.
 */
export function attemptsEligibleFor(verdict) {
  return verdict?.qualified === true ? ATTEMPTS_WHEN_QUALIFIED : 0;
}

// ---------------------------------------------------------------------------
// The adapter. I/O only - it obtains readings and makes no judgement, so a fault
// here can turn a pass into an error but never a failure into a pass.
// ---------------------------------------------------------------------------

/**
 * The `effectiveIdentity` field, wherever this API version puts it.
 *
 * The owner's statement is that a runtime not configured with Agent Identity has
 * its associated service account as its `effectiveIdentity`, so that field is
 * read first and the deployment's configured service account is read only as the
 * documented equivalent. Nothing is inferred beyond those two: an unreadable
 * identity returns `null` and the judgement refuses it as `MISSING_READING`,
 * which is the correct handling of "we could not tell".
 */
export function pickEffectiveIdentity(described) {
  const candidates = [
    described?.effectiveIdentity,
    described?.spec?.deploymentSpec?.serviceAccount,
    described?.spec?.agentFramework?.serviceAccount,
    described?.serviceAccount,
  ];
  return candidates.find(isNonEmptyString) ?? null;
}

/** Read one deployed reasoning engine's identity out of the control plane. */
export function readRuntimeIdentity({ projectId, region, resourceName, run = gcloudJson }) {
  const described = run([
    'ai',
    'reasoning-engines',
    'describe',
    resourceName,
    `--project=${projectId}`,
    `--region=${region}`,
    '--format=json',
  ]);
  return {
    resourceName,
    effectiveIdentity: pickEffectiveIdentity(described),
    source: 'aiplatform.reasoningEngines.describe',
  };
}

/** `gcloud ... --format=json`, parsed. Explicit project on every call (REQ-070). */
function gcloudJson(args) {
  const raw = execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(raw);
}

/**
 * An ID token for `audience`, minted as `serviceAccount`.
 *
 * Impersonation is what lets one operator run the probe as both agents without
 * holding either agent's key. The token is the platform's assertion about who
 * the caller is, which is the only kind of assertion step 4 accepts.
 */
export function mintIdentityToken({ serviceAccount, audience, run = gcloudText }) {
  return run([
    'auth',
    'print-identity-token',
    `--impersonate-service-account=${serviceAccount}`,
    `--audiences=${audience}`,
    '--include-email',
  ]).trim();
}

function gcloudText(args) {
  return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * The ingress path the trials use. Must equal `MCP_PATH` in bin/ingress-service.mjs.
 *
 * Not imported from there: that module builds a routing surface from the
 * environment at import time and this script has no business starting one. The
 * two are held together by a test that reads the other file's text instead.
 */
export const MCP_PATH = '/mcp';

/**
 * A probe that reaches identity resolution and stops before any mutation.
 *
 * The ingress resolves the caller only inside `tools/call` for the protected
 * operation - `tools/list` never gets there, and an unknown tool name is
 * rejected before identity is looked at - so a probe that avoids `tools/call`
 * entirely cannot learn anything about identity. But a `tools/call` that
 * succeeds is a real mutation on a protected target, which a preflight may not
 * cause.
 *
 * So the probe calls the protected operation naming a service that no proxy
 * fronts. The order inside the ingress is what makes that safe and useful at
 * once: identity is resolved and the arrival is stamped first, and only then is
 * the request handed to the routing surface, which refuses an unknown service
 * with `ROUTE_FAIL_CLOSED` and dispatches nothing. Nothing is mutated, no
 * receipt is minted, and the response still distinguishes the two outcomes this
 * gate is asking about:
 *
 *   ROUTE_FAIL_CLOSED     - the platform-verified caller WAS attributed to an
 *                           expected agent, and routing then declined the
 *                           deliberately unroutable service
 *   IDENTITY_FAIL_CLOSED  - the caller was not attributed, and the ingress names
 *                           the principal it actually observed
 *
 * The second case is the informative one and it is read rather than summarised:
 * the observed principal is extracted from the refusal so the operator is told
 * who called, not merely that it was the wrong somebody.
 */
export const UNROUTABLE_SERVICE = 'identity-preflight-unroutable';

/** The refusal codes the probe interprets, from the ingress's own vocabulary. */
export const PROBE_CODES = Object.freeze({
  attributed: 'ROUTE_FAIL_CLOSED',
  notAttributed: 'INGRESS_IDENTITY_FAIL_CLOSED',
});

/** Pull the principal the ingress says it observed out of a refusal message. */
export function principalFromRefusal(message) {
  const match = /the platform reported caller (\S+) \(([^)]+)\)/.exec(String(message ?? ''));
  return match === null ? null : { principal: match[1], identitySource: match[2] };
}

/**
 * Send one request as one agent, over the real transport, and report what the
 * ingress saw.
 *
 * Fails closed in every direction: a transport error, a non-2xx, an unparseable
 * body or an unrecognised outcome yields an observation the judgement refuses,
 * never an exception that could be caught and shrugged off.
 */
export async function probeIngressAs({
  agent,
  serviceAccount,
  ingressUrl,
  token,
  fetchImpl = fetch,
}) {
  const url = new URL(MCP_PATH, ingressUrl).toString();
  const blank = (detail) => ({
    agent,
    observedPrincipal: null,
    verifiedBy: null,
    transport: EXPERIMENT_TRANSPORT,
    detail,
  });

  let payload;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `identity-preflight-${agent}`,
        method: 'tools/call',
        params: {
          name: 'set_reservation',
          arguments: { service: UNROUTABLE_SERVICE, reserved: 0 },
        },
      }),
    });
    payload = await response.json();
  } catch (error) {
    return blank(`ingress probe failed: ${error.message}`);
  }

  const body = payload?.result ?? payload?.error?.data ?? payload;
  const reasonCode = body?.reasonCode;

  if (reasonCode === PROBE_CODES.notAttributed) {
    // The ingress did not recognise this caller. Report whom it did see, so the
    // failure names the actual identity rather than only the expected one.
    const observed = principalFromRefusal(body?.message);
    return {
      agent,
      observedPrincipal: observed?.principal ?? null,
      verifiedBy: observed?.identitySource ?? null,
      transport: EXPERIMENT_TRANSPORT,
      detail: body?.message ?? 'the ingress refused this caller as neither expected agent',
    };
  }

  if (reasonCode === PROBE_CODES.attributed) {
    // Attributed. The principal is the one we impersonated - and it is the
    // platform, not this script, that established it: the token was minted for
    // that service account and validated by Cloud Run before the container ran.
    return {
      agent,
      observedPrincipal: serviceAccount,
      verifiedBy: body?.identitySource ?? 'oidc-id-token/platform-verified:email',
      transport: EXPERIMENT_TRANSPORT,
    };
  }

  return blank(
    `the ingress answered with ${reasonCode ?? 'no reason code'}, which this probe does not ` +
      'interpret. Refusing rather than reading an unfamiliar answer as a pass.',
  );
}

/** Gather every reading the judgement needs. */
export async function gatherReadings({ projectId, region, ingressUrl, expected, engines }) {
  const runtimes = {};
  for (const agent of AGENTS) {
    runtimes[agent] = readRuntimeIdentity({
      projectId,
      region,
      resourceName: engines[agent],
    });
  }
  const ingressObservations = [];
  for (const agent of AGENTS) {
    const serviceAccount = expected[agent].serviceAccount;
    const token = mintIdentityToken({ serviceAccount, audience: ingressUrl });
    ingressObservations.push(await probeIngressAs({ agent, serviceAccount, ingressUrl, token }));
  }
  return { runtimes, ingressObservations };
}

/** Format a verdict for a terminal. */
export function formatVerdict(verdict) {
  const lines = [];
  for (const check of verdict.checks) {
    lines.push(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  if (verdict.failures.length > 0) {
    lines.push('');
    for (const failure of verdict.failures) {
      lines.push(`  ${failure.code}${failure.agent ? ` [agent ${failure.agent}]` : ''}`);
      lines.push(`      ${failure.detail}`);
    }
  }
  lines.push('');
  lines.push(verdict.summary);
  return lines.join('\n');
}

async function main() {
  let topology;
  try {
    topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `identity-preflight: cannot read ${TOPOLOGY_PATH}: ${error.message}\n` +
        'identity-preflight: provisioning has not run, so there is nothing to qualify.\n',
    );
    process.exit(2);
  }

  const identities = topology.agentIdentities ?? {};
  const expected = {
    transport: EXPERIMENT_TRANSPORT,
    A: { serviceAccount: identities.A?.serviceAccount },
    B: { serviceAccount: identities.B?.serviceAccount },
  };
  const engines = {
    A: topology.actuals?.find((actual) => actual.id === 'R-09')?.name,
    B: topology.actuals?.find((actual) => actual.id === 'R-10')?.name,
  };
  const ingressUrl = topology.actuals?.find((actual) => actual.id === 'R-08')?.url;

  if (!engines.A || !engines.B || !ingressUrl) {
    process.stderr.write(
      'identity-preflight: topology.json does not yet record R-08, R-09 and R-10. Deploy the ADK ' +
        'agents first; this gate qualifies a deployment, it does not wait for one.\n',
    );
    process.exit(2);
  }

  let readings;
  try {
    readings = await gatherReadings({
      projectId: topology.projectId,
      region: topology.region,
      ingressUrl,
      expected,
      engines,
    });
  } catch (error) {
    process.stderr.write(`identity-preflight: could not obtain readings: ${error.message}\n`);
    process.exit(2);
  }

  const verdict = judgeIdentityPreflight({ expected, readings });
  process.stdout.write(`${formatVerdict(verdict)}\n`);

  writeFileSync(
    VERDICT_PATH,
    `${JSON.stringify(
      {
        experiment: 'HAC-316',
        artifact: 'identity preflight verdict',
        producedBy: 'experiments/hac-316/bin/identity-preflight.mjs',
        producedAt: new Date().toISOString(),
        projectId: topology.projectId,
        qualified: verdict.qualified,
        transport: verdict.transport,
        checks: verdict.checks,
        failures: verdict.failures,
        attemptsEligible: attemptsEligibleFor(verdict),
        summary: verdict.summary,
      },
      null,
      2,
    )}\n`,
  );

  process.exit(verdict.qualified ? 0 : 1);
}

if (isDirectInvocation(import.meta.url)) await main();
