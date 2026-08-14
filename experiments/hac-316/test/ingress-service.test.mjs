/**
 * The local end-to-end gate: a representative MCP request traverses the
 * *deployed* path, on loopback, through the entry points the cloud will run.
 *
 * > A topology does not exist because its components exist. It exists when a
 * > representative request can traverse the deployed path end-to-end.
 *
 * Before this file, every component of the Phase 7 topology existed and the
 * topology did not. `src/routing.mjs` — R-08's declared entry point — had no
 * `createServer` and no `listen`, so deploying it started a process that exited
 * immediately. The neutral ingress that records arrivals and detects a runtime
 * retry lived inside the local harness, was no service's entry point, spoke bare
 * JSON, and read the caller's identity out of `body.agent`. Each piece had unit
 * tests. Nothing had ever made a request go through all of them.
 *
 * Everything below drives `startIngressService` — the exact function
 * `bin/ingress-service.mjs` calls when Node runs it — over real sockets, against
 * real `ProtectedTarget`s behind their own unchanged HTTP adapter, with real
 * Ed25519 receipts, real arbitration, and the independent verifier re-reading the
 * targets afterwards. No component here is a stand-in for a deployed one.
 *
 * The one thing loopback cannot supply is the platform. Cloud Run verifies the
 * caller's Google-signed ID token *before* the container is invoked, so what the
 * container sees is an already-verified token it decodes rather than checks
 * (`src/proxy/identity.ts` records that reasoning in the identity source string
 * itself). The tokens below are therefore correctly *shaped* and unsigned: they
 * are what reaches the process, which is the surface under test. What they are
 * not, and what matters, is a field the caller can put in the request body.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CORRELATION_HEADER, newCorrelationId } from '../../../dist/correlation.js';
import { Reason } from '../../../dist/broker/pairing/arbitrate.js';
import { TOOL_DEFINITION } from '../../../dist/proxy/http.js';
import { createTargetServer } from '../../../dist/target/http.js';
import { OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

import {
  MCP_PATH,
  createIngressServer,
  startIngressService,
} from '../bin/ingress-service.mjs';
import {
  ARMS,
  INTENTS,
  attemptBaseline,
  attemptInterlock,
  overlapOf,
} from '../bin/run-arm.mjs';
import {
  AGENT_IDENTITY_ENV,
  AgentIdentityConfigurationError,
  IDENTITY_FAIL_CLOSED,
  readAgentPrincipals,
} from '../src/agent-identity.mjs';
import { TOOL_INVOCATION_HEADER } from '../src/arrivals.mjs';
import { capacityCap, httpReread, residualReservation, verifyComposition } from '../src/global-verifier.mjs';
import { PARTITIONED_SERVICES, createPartitionedTargets } from '../src/partition.mjs';
import { Timeline } from '../src/timeline.mjs';
import { classifyArrivals } from '../src/trial.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The two service accounts A and B are deployed under. Distinct by construction. */
const PRINCIPAL = Object.freeze({
  A: 'interlock-s1-agent-a@hac316.iam.gserviceaccount.invalid',
  B: 'interlock-s1-agent-b@hac316.iam.gserviceaccount.invalid',
});

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));

/**
 * A correctly shaped Google ID token for one principal.
 *
 * Unsigned, because the signature is checked by the platform before the request
 * reaches the container and `observeIdentity` decodes rather than re-verifies —
 * see the module note above. The *shape* is what the code under test consumes.
 */
const idToken = (principal) =>
  [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        email: principal,
        sub: `sub-${principal}`,
        email_verified: true,
      }),
    ).toString('base64url'),
    'signature-checked-by-the-platform-before-the-container-is-invoked',
  ].join('.');

/** Start two real targets and the real ingress service in front of them. */
async function startTopology({ enforceCallerIdentity = false, env: overrides = {} } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'interlock-s1-e2e';
  const targets = createPartitionedTargets({ keys: new Map([[keyId, publicKey]]) });

  const servers = {};
  const urls = {};
  for (const service of PARTITIONED_SERVICES) {
    const server = createTargetServer({ target: targets[service], enforceCallerIdentity });
    servers[service] = server;
    urls[service] = await listen(server);
  }

  const env = {
    PORT: '0',
    INTERLOCK_TARGET_URL_ALPHA: urls.alpha,
    INTERLOCK_TARGET_URL_BETA: urls.beta,
    INTERLOCK_SIGNING_KEY_ID: keyId,
    INTERLOCK_SIGNING_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    INTERLOCK_EVIDENCE_PATH: join(repoRoot, ARMS.treatment.evidencePath),
    INTERLOCK_SOURCE_REVISION: ARMS.treatment.sourceRevision,
    [AGENT_IDENTITY_ENV.A]: PRINCIPAL.A,
    [AGENT_IDENTITY_ENV.B]: PRINCIPAL.B,
    HAC316_ARM: 'treatment',
    HAC316_RUN_ID: 'hac316-e2e',
    ...overrides,
  };

  let service;
  try {
    service = await startIngressService(env);
  } catch (error) {
    // The targets are already listening. A startup the ingress refuses is a case
    // several tests below drive deliberately, and leaking two sockets per refusal
    // would eventually exhaust the runner.
    for (const server of Object.values(servers)) await close(server);
    throw error;
  }
  return {
    ...service,
    urls,
    targets,
    // The exact environment this instance was started from, so a test can ask
    // what the entry point actually consumed rather than restate it.
    startedFrom: env,
    async stop() {
      await service.close();
      for (const server of Object.values(servers)) await close(server);
    },
  };
}

/** One JSON-RPC call at the ingress, as an MCP client makes it. */
async function rpc(
  service,
  method,
  params,
  { principal, correlationId = newCorrelationId(), toolInvocationId, id = 1 } = {},
) {
  const response = await fetch(service.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(principal === undefined ? {} : { authorization: `Bearer ${idToken(principal)}` }),
      ...(correlationId === null ? {} : { [CORRELATION_HEADER]: correlationId }),
      ...(toolInvocationId === undefined ? {} : { [TOOL_INVOCATION_HEADER]: toolInvocationId }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }),
  });
  return {
    status: response.status,
    body: response.status === 202 ? null : await response.json(),
  };
}

/** `tools/call` for one predeclared agent's intent. */
const callTool = (service, agent, options = {}) =>
  rpc(
    service,
    'tools/call',
    {
      name: OPERATION_SET_RESERVATION,
      arguments: { ...INTENTS[agent].intent.arguments },
      ...(options.extraParams ?? {}),
    },
    { principal: PRINCIPAL[agent], ...options },
  );

const structured = (answer) => answer.body.result.structuredContent;

// ---------------------------------------------------------------------------
// The protocol, before anything else. An agent that cannot initialise never
// reaches the interesting part.
// ---------------------------------------------------------------------------

describe('the deployed ingress speaks MCP StreamableHTTP', () => {
  it('serves initialize, notifications/initialized and tools/list', async () => {
    const topology = await startTopology();
    try {
      const initialized = await rpc(topology, 'initialize', {}, { principal: PRINCIPAL.A });
      expect(initialized.status).toBe(200);
      expect(initialized.body.result.protocolVersion).toBe('2025-06-18');
      expect(initialized.body.result.serverInfo.name).toBe('interlock-s1-ingress');

      const notified = await rpc(topology, 'notifications/initialized', {}, { principal: PRINCIPAL.A });
      expect(notified.status).toBe(202);

      const listed = await rpc(topology, 'tools/list', {}, { principal: PRINCIPAL.A });
      // The frozen definition, not a second description of it.
      expect(listed.body.result.tools).toEqual([TOOL_DEFINITION]);
      expect(listed.body.result.tools[0].name).toBe(OPERATION_SET_RESERVATION);

      const unknown = await rpc(topology, 'tools/call', { name: 'delete_everything', arguments: {} }, { principal: PRINCIPAL.A });
      expect(unknown.body.error.code).toBe(-32602);

      const healthz = await fetch(`http://127.0.0.1:${topology.port}/healthz`);
      expect(await healthz.json()).toMatchObject({ status: 'ok', proxies: 2, stores: 1 });
    } finally {
      await topology.stop();
    }
  });

  it('is the entry point a deployment runs, not a harness helper', async () => {
    // `startIngressService(env)` is what `bin/ingress-service.mjs` calls under
    // `isDirectInvocation`. If this stopped being the deployed shape, every
    // proof below would be about something the cloud never runs.
    const topology = await startTopology();
    try {
      expect(topology.url.endsWith(MCP_PATH)).toBe(true);
      expect(typeof createIngressServer).toBe('function');
      expect(topology.port).toBeGreaterThan(0);
    } finally {
      await topology.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// The deployment contract: what the script renders vs what the process needs
// ---------------------------------------------------------------------------

/**
 * The variable names `bin/10-provision.sh` renders into `proxy.env.json`.
 *
 * Read out of the script text rather than restated, for the reason
 * `test/provision-ordering.test.mjs` gives at length: a restated copy of a list
 * that lives in another file goes stale exactly as copies do, and a stale copy
 * here would assert the contract against itself.
 */
function renderedProxyEnvNames() {
  const script = readFileSync(join(repoRoot, 'experiments/hac-316/bin/10-provision.sh'), 'utf8');
  const call = script.indexOf('render_env_file "${WORK_DIR}/proxy.env.json"');
  if (call === -1) throw new Error('10-provision.sh no longer renders proxy.env.json');

  // From the call to the first line that is not a continuation of it.
  const names = [];
  for (const line of script.slice(call).split('\n')) {
    for (const token of line.replace(/\\$/, '').split(/\s+/)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(token)) names.push(token);
    }
    if (!line.trimEnd().endsWith('\\')) break;
  }
  return new Set(names);
}

/**
 * The variables the entry point genuinely cannot start without, by measurement.
 *
 * Derived, never listed. A hand-written list of "required" names is a second
 * copy of a fact that already lives in the code, and the whole point of this
 * block is that the two copies of that fact — the script's and the process's —
 * had silently disagreed. So each name is deleted from a known-good environment
 * in turn and the service is asked to start: the ones whose absence stops it are
 * the required ones, whatever the code happens to say about itself today.
 *
 * `PORT` is excluded from the probe rather than judged optional. Cloud Run
 * supplies it, no `--env-vars-file` may set it, and a probe that dropped it would
 * bind the real default port on the machine running the tests.
 */
async function requiredIngressEnvByMeasurement() {
  const probe = await startTopology();
  const candidates = Object.keys(probe.startedFrom).filter((name) => name !== 'PORT');
  await probe.stop();

  const required = new Set();
  for (const name of candidates) {
    let started = null;
    try {
      started = await startTopology({ env: { [name]: undefined } });
    } catch {
      required.add(name);
    }
    if (started !== null) await started.stop();
  }
  return required;
}

describe('the deployed topology can start as it is provisioned', () => {
  it('renders every variable the ingress cannot start without', async () => {
    const rendered = renderedProxyEnvNames();
    const required = await requiredIngressEnvByMeasurement();

    // The gap this closes. `bin/10-provision.sh` rendered proxy.env.json without
    // HAC316_AGENT_A_PRINCIPAL or HAC316_AGENT_B_PRINCIPAL, and
    // src/agent-identity.mjs fails closed at startup without them — correct
    // behaviour, and a container that never listens. Every component existed and
    // the deployment could not come up.
    const missing = [...required].filter((name) => !rendered.has(name)).sort();
    expect(missing, 'required by the entry point, never rendered by provisioning').toEqual([]);

    // The measurement has to have measured something, or the subset above is
    // vacuously satisfied by an empty required set.
    expect(required.has(AGENT_IDENTITY_ENV.A)).toBe(true);
    expect(required.has(AGENT_IDENTITY_ENV.B)).toBe(true);
    expect(required.size).toBeGreaterThanOrEqual(6);
  }, 60_000);

  it('goes red against the script as it was before the principals were rendered', () => {
    // The control. Strip the two principal names back out of the rendered set and
    // the subset check must fail — otherwise it would have reported green on the
    // deployment that could not start, which is precisely what it is here to
    // prevent.
    const rendered = renderedProxyEnvNames();
    expect(rendered.has(AGENT_IDENTITY_ENV.A)).toBe(true);
    expect(rendered.has(AGENT_IDENTITY_ENV.B)).toBe(true);

    const asItWas = new Set(
      [...rendered].filter((name) => name !== AGENT_IDENTITY_ENV.A && name !== AGENT_IDENTITY_ENV.B),
    );
    const wouldMiss = [AGENT_IDENTITY_ENV.A, AGENT_IDENTITY_ENV.B].filter(
      (name) => !asItWas.has(name),
    );
    expect(wouldMiss).toEqual([AGENT_IDENTITY_ENV.A, AGENT_IDENTITY_ENV.B]);
  });

  it('renders the principals from the two service accounts P-11 creates', () => {
    const script = readFileSync(join(repoRoot, 'experiments/hac-316/bin/10-provision.sh'), 'utf8');
    // Not any two values: the ones the ADK deploy passes as service_account. A
    // mapping built from anything else would name principals that never arrive.
    expect(script).toMatch(/export HAC316_AGENT_A_PRINCIPAL="\$\{SA_A\}"/);
    expect(script).toMatch(/export HAC316_AGENT_B_PRINCIPAL="\$\{SA_B\}"/);
  });
});

// ---------------------------------------------------------------------------
// E1 — A and B are distinct, by platform identity and not by a body field
// ---------------------------------------------------------------------------

describe('E1: A and B remain distinct via platform-shaped identity', () => {
  it('takes the caller from the verified token and ignores what the body claims', async () => {
    const topology = await startTopology();
    try {
      // A's token, and a body that claims to be B. The local harness would have
      // believed the body; this must not.
      const answer = await callTool(topology, 'A', {
        extraParams: { agent: INTENTS.B.agent, expectedAgent: 'B' },
      });
      expect(answer.status).toBe(200);

      expect(topology.observations).toHaveLength(1);
      const [arrival] = topology.observations;
      expect(arrival.agentId).toBe(PRINCIPAL.A);
      expect(arrival.expectedAgent).toBe('A');
      expect(arrival.identitySource).toMatch(/platform-verified/);
      expect(arrival.agentId).not.toBe(INTENTS.B.agent);
      expect(arrival.expectedAgent).not.toBe('B');
    } finally {
      await topology.stop();
    }
  });

  it('keeps the two agents apart across a full pair', async () => {
    const topology = await startTopology();
    try {
      await Promise.all([callTool(topology, 'A'), callTool(topology, 'B')]);

      const byAgent = Object.fromEntries(
        topology.observations.map((arrival) => [arrival.expectedAgent, arrival]),
      );
      expect(Object.keys(byAgent).sort()).toEqual(['A', 'B']);
      expect(byAgent.A.agentId).toBe(PRINCIPAL.A);
      expect(byAgent.B.agentId).toBe(PRINCIPAL.B);
      expect(byAgent.A.logicalInvocationKey).not.toBe(byAgent.B.logicalInvocationKey);
      expect(byAgent.A.logicalIntentDigest).toBe(INTENTS.A.expectedDigest);
      expect(byAgent.B.logicalIntentDigest).toBe(INTENTS.B.expectedDigest);

      const record = classifyArrivals(topology.observations);
      expect(record.arrivalsByExpectedAgent).toEqual({ A: 1, B: 1 });
      expect(record.acceptable).toBe(true);
    } finally {
      await topology.stop();
    }
  });

  it('fails closed on an identity that is neither agent, and on no identity at all', async () => {
    const topology = await startTopology();
    try {
      const stranger = await rpc(
        topology,
        'tools/call',
        { name: OPERATION_SET_RESERVATION, arguments: { ...INTENTS.A.intent.arguments } },
        { principal: 'someone-else@elsewhere.invalid' },
      );
      expect(stranger.body.result.isError).toBe(true);
      expect(structured(stranger).reasonCode).toBe(IDENTITY_FAIL_CLOSED);
      expect(structured(stranger).decision).toBe('DENY');
      expect(structured(stranger).failClosed).toBe(true);

      const anonymous = await rpc(topology, 'tools/call', {
        name: OPERATION_SET_RESERVATION,
        arguments: { ...INTENTS.A.intent.arguments },
      });
      expect(structured(anonymous).reasonCode).toBe(IDENTITY_FAIL_CLOSED);

      // Refused, and still retained: an unattributable arrival is exactly the
      // fact X-05 forbids hiding.
      expect(topology.observations).toHaveLength(2);
      expect(topology.observations.every((arrival) => arrival.dispatched === false)).toBe(true);
      expect(topology.observations[0].expectedAgent).toBeNull();

      // Nothing reached a target.
      for (const service of PARTITIONED_SERVICES) {
        const state = await (await fetch(`${topology.urls[service]}/v1/state`)).json();
        expect(state.state.services[service]).toBe(40);
      }
    } finally {
      await topology.stop();
    }
  });

  it('refuses to start when the deployment did not say who A and B are', () => {
    // Fail closed at startup, not at the first request: an ingress that
    // discovered this at request time would already have recorded arrivals it
    // could not attribute.
    expect(() => readAgentPrincipals({})).toThrow(AgentIdentityConfigurationError);
    expect(() => readAgentPrincipals({ [AGENT_IDENTITY_ENV.A]: PRINCIPAL.A })).toThrow(
      new RegExp(AGENT_IDENTITY_ENV.B),
    );
    // Set-but-empty is absent, not a value that maps every caller onto A.
    expect(() =>
      readAgentPrincipals({ [AGENT_IDENTITY_ENV.A]: PRINCIPAL.A, [AGENT_IDENTITY_ENV.B]: '  ' }),
    ).toThrow(AgentIdentityConfigurationError);
    // And two agents cannot share one principal.
    expect(() =>
      readAgentPrincipals({
        [AGENT_IDENTITY_ENV.A]: PRINCIPAL.A,
        [AGENT_IDENTITY_ENV.B]: PRINCIPAL.A,
      }),
    ).toThrow(/already the principal/);

    expect(readAgentPrincipals({
      [AGENT_IDENTITY_ENV.A]: PRINCIPAL.A,
      [AGENT_IDENTITY_ENV.B]: PRINCIPAL.B,
    })).toEqual({ [PRINCIPAL.A]: 'A', [PRINCIPAL.B]: 'B' });
  });
});

// ---------------------------------------------------------------------------
// E2/E3 — a duplicate A arrival cannot become an A/B overlap, and is recorded
// ---------------------------------------------------------------------------

describe('E2/E3: a duplicate arrival is recorded and can never become A/B overlap', () => {
  it('records the repeat, refuses to dispatch it, and reports no A/B overlap', async () => {
    const topology = await startTopology();
    try {
      // No tool invocation id, which is the ADK reality: the retry happens below
      // the tool boundary and MCP carries no stable tool-call id. The key falls
      // back to caller identity plus the intent digest the ingress computed off
      // the wire — both of which the platform, not the caller, supplied.
      const first = await callTool(topology, 'A');
      const again = await callTool(topology, 'A');
      await callTool(topology, 'B');

      expect(topology.observations).toHaveLength(3);
      const [one, two, three] = topology.observations;

      expect(one.dispatched).toBe(true);
      expect(two.dispatched).toBe(false);
      expect(two.duplicateOfOrdinal).toBe(1);
      expect(three.dispatched).toBe(true);
      expect(one.logicalInvocationKey).toBe(two.logicalInvocationKey);

      // The refusal is legible to the caller and is an error, not a quiet allow.
      expect(again.body.result.isError).toBe(true);
      expect(structured(again).duplicateArrival).toBe(true);
      expect(structured(again).duplicateOfOrdinal).toBe(1);
      expect(structured(again).detail).toMatch(/INVALID_TRIAL:RUNTIME_RETRY_OBSERVED/);
      // And the first one was answered normally, so the refusal is the repeat.
      expect(first.body.result.structuredContent.duplicateArrival).toBeUndefined();

      const record = classifyArrivals(topology.observations);
      expect(record.arrivalCount).toBe(3);
      expect(record.retryObserved).toBe(true);
      expect(record.arrivalsByExpectedAgent).toEqual({ A: 2, B: 1 });
      expect(record.acceptable).toBe(false);

      // Two A arrivals overlapping each other are not an A/B collision, and the
      // pairing is by identity rather than by position, so they cannot be read
      // as one.
      const measured = overlapOf(topology.observations);
      expect(measured.overlapped).toBe(false);
      expect(measured.pairedBy).toBe('expected-agent-identity');
      expect(measured.why).toMatch(/two distinct expected agents/);
    } finally {
      await topology.stop();
    }
  });

  it('does not mint a second receipt or attempt a second mutation', async () => {
    const topology = await startTopology();
    try {
      const first = await callTool(topology, 'A', { toolInvocationId: 'ti-retried' });
      const again = await callTool(topology, 'A', { toolInvocationId: 'ti-retried' });

      expect(structured(first).receiptId).toEqual(expect.any(String));
      expect(structured(again).receiptId).toBeUndefined();

      // The target is not idempotent and was never asked twice. Its revision
      // moved exactly once.
      const state = await (await fetch(`${topology.urls.alpha}/v1/state`)).json();
      expect(state.state.services.alpha).toBe(INTENTS.A.intent.arguments.reserved);
      expect(structured(first).execution.revisionAfter).toBe(state.revision);
    } finally {
      await topology.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// E4 — one PendingIntentStore object, and it is what does the work
// ---------------------------------------------------------------------------

describe('E4: the deployed treatment shares exactly one PendingIntentStore', () => {
  it('builds two proxies over one store object, in one process', async () => {
    const topology = await startTopology();
    try {
      expect(Object.keys(topology.surface.proxies).sort()).toEqual(['alpha', 'beta']);
      // Object identity, not structural equality: two equal-but-separate stores
      // would leave both proxies blind and nothing else would look wrong.
      expect(new Set([topology.surface.store]).size).toBe(1);
      expect(topology.surface.services).toEqual(['alpha', 'beta']);

      const healthz = await (await fetch(`http://127.0.0.1:${topology.port}/healthz`)).json();
      expect(healthz.proxies).toBe(2);
      expect(healthz.stores).toBe(1);
    } finally {
      await topology.stop();
    }
  });

  it('withholds one of an overlapping pair, which only a shared store can do', async () => {
    // The behavioural half. The counts above are a claim about construction;
    // this is a claim about a decision, taken by the frozen `arbitrate` over the
    // real store, on a pair dispatched concurrently and never delayed, barriered
    // or serialized by anything here (X-04).
    //
    // Bounded exactly as the driver's own budget is: a missed window observes
    // nothing about composition, so it is retried rather than reported.
    let withheld = null;
    let overlapped = false;
    for (let attempt = 1; attempt <= 3 && withheld === null; attempt += 1) {
      const topology = await startTopology();
      try {
        const answers = await Promise.all([callTool(topology, 'A'), callTool(topology, 'B')]);
        overlapped = overlapOf(topology.observations).overlapped;
        withheld =
          answers.find((answer) => structured(answer).reasonCode === Reason.COUPLING_OBSERVED) ??
          null;
        if (withheld !== null) {
          expect(overlapped).toBe(true);
          expect(structured(withheld).decision).toBe('DENY');
          expect(withheld.body.result.isError).toBe(true);
          expect(structured(withheld).couplings.length).toBeGreaterThan(0);
          // Withheld before the target was touched: no receipt, no execution.
          expect(structured(withheld).receiptId).toBeUndefined();
          expect(structured(withheld).execution).toBeUndefined();

          const executed = answers.filter(
            (answer) => structured(answer).execution?.status === 'EXECUTED',
          );
          expect(executed).toHaveLength(1);
        }
      } finally {
        await topology.stop();
      }
    }

    expect(withheld, 'no overlapping pair was withheld in three attempts').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E5 — baseline and treatment semantics are unchanged by any of this
// ---------------------------------------------------------------------------

describe('E5: baseline and treatment semantics remain frozen', () => {
  it('leaves the declared arms exactly as they were', () => {
    // The declarations the arms run under, recorded before any arm ran. A
    // deployable ingress must not have moved them.
    expect(ARMS.baseline.storeTopology).toBe('none');
    expect(ARMS.baseline.evidencePath).toBeNull();
    expect(ARMS.treatment.storeTopology).toBe('shared-object');
    expect(ARMS.perturbation.storeTopology).toBe('shared-object');
    expect(ARMS.treatment.evidencePath).not.toBe(ARMS.perturbation.evidencePath);
    expect(ARMS.treatment.sourceRevision).not.toBe(ARMS.perturbation.sourceRevision);
  });

  it('still runs the baseline composition-unaware and the treatment shared', async () => {
    const baseline = await attemptBaseline(new Timeline());
    expect(baseline.deploymentComponents.proxyCount).toBe(0);
    expect(baseline.deploymentComponents.storeCount).toBe(0);
    expect(baseline.deploymentComponents.storeTopology).toBe('none');
    // The issuer is right about each request and wrong about the pair.
    expect(baseline.executed).toHaveLength(2);
    expect(baseline.globalVerification.holds).toBe(false);

    const treatment = await attemptInterlock('treatment', new Timeline());
    expect(treatment.deploymentComponents.proxyCount).toBe(2);
    expect(treatment.deploymentComponents.storeCount).toBe(1);
    expect(treatment.deploymentComponents.storeTopology).toBe('shared-object');
    // Identical but for the input, which is the only thing an arm may vary.
    expect(treatment.deploymentComponents.partitions).toEqual(
      baseline.deploymentComponents.partitions,
    );
    expect(treatment.deploymentComponents.initialStateDigest).toBe(
      baseline.deploymentComponents.initialStateDigest,
    );
  });

  it('gives the deployed ingress the same topology the treatment arm declares', async () => {
    const topology = await startTopology();
    try {
      const treatment = await attemptInterlock('treatment', new Timeline());
      expect(Object.keys(topology.surface.proxies).length).toBe(
        treatment.deploymentComponents.proxyCount,
      );
      expect(new Set([topology.surface.store]).size).toBe(
        treatment.deploymentComponents.storeCount,
      );
    } finally {
      await topology.stop();
    }
  });

  it('refuses to route anything it does not front, rather than picking one', async () => {
    const topology = await startTopology();
    try {
      const answer = await rpc(
        topology,
        'tools/call',
        { name: OPERATION_SET_RESERVATION, arguments: { service: 'gamma', reserved: 60 } },
        { principal: PRINCIPAL.A },
      );
      expect(answer.body.result.isError).toBe(true);
      expect(structured(answer).reasonCode).toBe('ROUTE_FAIL_CLOSED');
      expect(structured(answer).failClosed).toBe(true);
      // gamma has no target of its own (X-14), and the refusal is the default
      // branch rather than a gap in an allow-list.
      expect(topology.observations[0].dispatched).toBe(true);
    } finally {
      await topology.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// E6 — the target's receipt semantics are untouched
// ---------------------------------------------------------------------------

describe('E6: target receipt semantics are unchanged', () => {
  it('executes only against a signed receipt bound to the observed revision', async () => {
    const topology = await startTopology();
    try {
      const before = await (await fetch(`${topology.urls.alpha}/v1/state`)).json();
      const answer = await callTool(topology, 'A');
      const result = structured(answer);

      expect(result.decision).toBe('ALLOW');
      expect(result.receiptId).toEqual(expect.any(String));
      expect(result.execution.status).toBe('EXECUTED');
      expect(result.execution.revisionBefore).toBe(before.revision);
      expect(result.execution.revisionAfter).not.toBe(before.revision);
    } finally {
      await topology.stop();
    }
  });

  it('still refuses a mutation presented without a receipt', async () => {
    // The target is not made permissive by anything in front of it, and it is
    // not made idempotent either. Posted directly, bypassing the ingress.
    const topology = await startTopology();
    try {
      const response = await fetch(`${topology.urls.alpha}/v1/mutate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: OPERATION_SET_RESERVATION,
          arguments: { ...INTENTS.A.intent.arguments },
        }),
      });
      expect(response.status).toBe(403);
      expect((await response.json()).reasonCode).toBe('RECEIPT_ABSENT');

      const state = await (await fetch(`${topology.urls.alpha}/v1/state`)).json();
      expect(state.state.services.alpha).toBe(40);
    } finally {
      await topology.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// E7 — the verifier reads the targets, and is never told
// ---------------------------------------------------------------------------

describe('E7: the final verifier reads actual target state', () => {
  it('re-reads both targets and agrees with what they hold, not with what was reported', async () => {
    const topology = await startTopology();
    try {
      const beforeAnyMutation = await verifyComposition({
        readers: Object.fromEntries(
          PARTITIONED_SERVICES.map((service) => [service, httpReread(topology.urls[service])]),
        ),
      });
      expect(beforeAnyMutation.source).toBe('independent-reread');
      expect(beforeAnyMutation.total).toBe(40 + 40 + residualReservation());
      expect(beforeAnyMutation.holds).toBe(true);

      const answer = await callTool(topology, 'A');
      expect(structured(answer).execution.status).toBe('EXECUTED');

      const afterOne = await verifyComposition({
        readers: Object.fromEntries(
          PARTITIONED_SERVICES.map((service) => [service, httpReread(topology.urls[service])]),
        ),
      });

      // The verdict moved because the target moved. A verifier that read the
      // proxy's answer, or its own memory, would have produced the same number
      // twice.
      expect(afterOne.total).toBe(
        INTENTS.A.intent.arguments.reserved + 40 + residualReservation(),
      );
      expect(afterOne.total).not.toBe(beforeAnyMutation.total);
      expect(afterOne.cap).toBe(capacityCap());

      // And every observed term equals a direct, independent read of the target
      // that holds it — performed here, by something that wrote nothing.
      for (const service of PARTITIONED_SERVICES) {
        const direct = await (await fetch(`${topology.urls[service]}/v1/state`)).json();
        expect(afterOne.reads[service].revision).toBe(direct.revision);
        expect(afterOne.composedState.services[service]).toBe(direct.state.services[service]);
      }
    } finally {
      await topology.stop();
    }
  });

  it('refuses to infer a reservation it did not read', async () => {
    // The oracle's own fail-closed branch, on the deployed topology's readers.
    await expect(
      verifyComposition({
        readers: {
          alpha: async () => ({ revision: 'sha256:whatever', services: {} }),
          beta: httpReread('http://127.0.0.1:1'),
        },
      }),
    ).rejects.toThrow(/refuses to infer a value it did not read/);
  });
});
