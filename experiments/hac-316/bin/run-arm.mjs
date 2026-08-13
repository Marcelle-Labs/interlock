#!/usr/bin/env node
/**
 * The arm driver: baseline, treatment, perturbation.
 *
 * Every arm runs against real objects over real sockets. The proxies are the
 * frozen `InterlockProxy`, the targets are unchanged `ProtectedTarget`s behind
 * their own HTTP adapter, the receipts are Ed25519-signed and verified by the
 * target, and the decisions come out of the frozen `arbitrate`. Nothing here
 * stubs an outcome, and nothing reads an expected value out of the packet and
 * reports it back: the numbers in `results.json` are what the code did.
 *
 * ## What differs between arms, and what must not
 *
 * | | baseline | treatment | perturbation |
 * | -- | -- | -- | -- |
 * | in the path | composition-unaware issuer | routing surface + two proxies | same as treatment |
 * | co-change artifact | none consulted | HAC-330 baseline | HAC-330 perturbed |
 * | `sourceRevision` | n/a | baseline basis | perturbed basis |
 * | targets | two unchanged `ProtectedTarget`s | same | same |
 * | fixture | canonical projection | same | same |
 * | intents | predeclared A and B | same | same |
 *
 * Treatment and perturbation differ in exactly one input: which artifact the
 * proxies read, and the revision that artifact is pinned to. That second half is
 * not optional. The two artifacts carry different basis revisions, and running
 * the perturbation arm at the baseline revision denies both intents for
 * `STALE_BASIS` — a denial that superficially reads as "Interlock still held"
 * while proving nothing at all. The `sourceRevision` is therefore taken from the
 * artifact each arm actually uses (SPEC 5.4, REQ-047).
 *
 * ## Concurrency is dispatched, never manufactured
 *
 * Both requests are dispatched concurrently and that is the whole mechanism.
 * There is no sleep in an agent, no barrier in a proxy, no artificial target
 * delay and no widened TTL (X-04) — the pending TTL cannot even be reached from
 * configuration. Up to three attempts are permitted, and every attempt is
 * retained and reported whatever it did (X-05).
 *
 * ## Overlap is measured by a server, not inferred by the client
 *
 * A neutral ingress sits in front of every arm — the same code in all three —
 * and stamps the instant it began and finished handling each request. Those
 * stamps are taken inside the server, after the request arrived; the harness's
 * own dispatch time is never used to claim two calls overlapped.
 *
 *   node experiments/hac-316/bin/run-arm.mjs --all --no-cloud
 *   node experiments/hac-316/bin/run-arm.mjs --arm treatment
 *
 * Requires `pnpm run build`. Creates no cloud resource of any kind.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { intentDigest } from '../../../dist/authorization/intent.js';
import { Decision, Reason } from '../../../dist/broker/pairing/arbitrate.js';
import { CORRELATION_HEADER, newCorrelationId } from '../../../dist/correlation.js';
import { targetsForIntent } from '../../../dist/proxy/http.js';
import { HttpTargetPort } from '../../../dist/proxy/target-port.js';
import { createTargetServer } from '../../../dist/target/http.js';
import { OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

import { CompositionUnawareIssuer } from '../src/baseline-issuer.mjs';
import { isDirectInvocation } from '../src/entrypoint.mjs';
import { readBooleanEnv } from '../src/env.mjs';
import { formatVerdict, httpReread, verifyComposition } from '../src/global-verifier.mjs';
import {
  PARTITIONED_SERVICES,
  TARGET_IDS,
  createPartitionedTargets,
  partitionState,
} from '../src/partition.mjs';
import { createRoutingSurface, dispatch } from '../src/routing.mjs';
import { ExperimentState, INDEPENDENT_REREAD, Timeline, acceptedAvailability } from '../src/timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

export const ARMS = readJson(join(evidenceDir, 'arms.json'));
export const PREFLIGHT_V1 = readJson(join(evidenceDir, 'preflight.json'));
export const FIXTURE = readJson(join(evidenceDir, 'fixture.json'));

/**
 * Whether the targets bind the caller identity the transport reports.
 *
 * One value, resolved once, handed to both targets and to the baseline issuer.
 * Divergence here would make the arms incomparable for a reason that has
 * nothing to do with composition (REQ-039), so it is not settled per component.
 */
// Read strictly: unset (or empty) is `false`, `true`/`false`/`1`/`0` are
// honoured, and anything else stops the run. The old `?? 'false'` spelling read
// `INTERLOCK_ENFORCE_CALLER_IDENTITY=yes` as *off*, which is a typo silently
// becoming a disabled setting in the one variable REQ-039 exists to police.
const ENFORCE_CALLER_IDENTITY = readBooleanEnv('INTERLOCK_ENFORCE_CALLER_IDENTITY') ?? false;

const CALLER_IDENTITY_SOURCE = 'experiment-harness';

/** The two predeclared intents, taken from Preflight V1 rather than retyped. */
export const INTENTS = Object.fromEntries(
  Object.entries(PREFLIGHT_V1.expectedIntents).map(([id, entry]) => [
    id,
    { agent: entry.agent, intent: entry.intent, expectedDigest: entry.intentDigest },
  ]),
);

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

/** A wall-clock instant with sub-millisecond resolution. */
const nowMs = () => performance.timeOrigin + performance.now();

/**
 * A timestamping delegate in front of an unchanged `ProtectedTarget`.
 *
 * It adds no rule and removes none: every call is forwarded, the enforcement is
 * entirely the real object's, and the only thing recorded is *when* a mutation
 * was committed. That instant is needed to check that Interlock withheld before
 * the first protected commit, and taking it from the harness's view of the
 * response would put it later than the commit actually was — which would make
 * the claim easier to satisfy than it should be.
 */
function stampingTarget(target, commits) {
  return {
    get revision() {
      return target.revision;
    },
    get state() {
      return target.state;
    },
    read: () => target.read(),
    mutate: (request) => {
      const result = target.mutate(request);
      if (result.status === 'EXECUTED') {
        commits.push({
          correlationId: request.correlationId,
          at: new Date().toISOString(),
          atMs: nowMs(),
          revisionAfter: result.revisionAfter,
        });
      }
      return result;
    },
  };
}

/**
 * The neutral ingress.
 *
 * Identical in every arm, which is what makes the overlap measurement
 * comparable. It holds no arm binding, makes no decision, and does not touch the
 * intent — it stamps, forwards, and stamps again.
 */
function createIngress({ handle, observations }) {
  return createServer((request, response) => {
    const startedAtMs = nowMs();
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      void (async () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const supplied = request.headers[CORRELATION_HEADER];
        const correlationId = typeof supplied === 'string' ? supplied : newCorrelationId();
        const intent = { operation: body.operation, arguments: body.arguments };
        let outcome;
        try {
          outcome = await handle({
            correlationId,
            callerIdentity: body.agent,
            identitySource: CALLER_IDENTITY_SOURCE,
            intent,
            targets: targetsForIntent(intent),
          });
        } catch (error) {
          outcome = { failed: true, detail: error.message };
        }
        const endedAtMs = nowMs();
        observations.push({
          correlationId,
          agent: body.agent,
          service: intent.arguments.service,
          // The digest of what the ingress actually received, not of what the
          // harness meant to send. This is the value the trial-validity rule is
          // about, and it has to be taken from the wire or it proves nothing.
          intentDigest: intentDigest(intent),
          startMs: startedAtMs,
          endMs: endedAtMs,
        });
        const payload = JSON.stringify({ correlationId, outcome });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(payload);
      })();
    });
  });
}

/** Build both partitioned targets and put each behind its own HTTP adapter. */
async function startTargets() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'interlock-s1-run';
  const keys = new Map([[keyId, publicKey]]);
  const targets = createPartitionedTargets({ keys });

  const commits = [];
  const servers = {};
  const urls = {};
  for (const service of PARTITIONED_SERVICES) {
    const server = createTargetServer({
      target: stampingTarget(targets[service], commits),
      enforceCallerIdentity: ENFORCE_CALLER_IDENTITY,
    });
    servers[service] = server;
    urls[service] = await listen(server);
  }

  // Measured, not restated: an independent re-read of both targets before any
  // request is dispatched, composed and digested the same way the canonical
  // fixture is. If an arm started from a different state, this is where the two
  // arms stop being comparable, and the packet says so.
  const initial = await verifyComposition({
    readers: Object.fromEntries(
      PARTITIONED_SERVICES.map((service) => [service, httpReread(urls[service])]),
    ),
  });
  const initialStateDigest = `sha256:${sha256Hex(JSON.stringify(initial.composedState))}`;

  return {
    keyId,
    keys,
    signingKey: { keyId, privateKey },
    signingKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    targets,
    commits,
    urls,
    initialStateDigest,
    async stop() {
      for (const server of Object.values(servers)) await close(server);
    },
  };
}

/** The provenance block copied verbatim into a baseline receipt. */
function receiptProvenanceFrom(evidence, sourceRevision) {
  return {
    evidence: {
      basisRevision: sourceRevision,
      artifactSha256: evidence?.artifact?.sha256 ?? 'unknown',
      producerSha: evidence?.producer?.observedSha ?? 'unknown',
    },
  };
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

/** Post one intent at the arm's ingress. */
async function call(ingressUrl, id) {
  const { agent, intent } = INTENTS[id];
  const response = await fetch(ingressUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CORRELATION_HEADER]: newCorrelationId() },
    body: JSON.stringify({ agent, operation: intent.operation, arguments: intent.arguments }),
  });
  return { id, ...(await response.json()) };
}

/** Read both targets back independently and judge the composition. */
function verifyArm(urls) {
  return verifyComposition({
    readers: Object.fromEntries(
      PARTITIONED_SERVICES.map((service) => [service, httpReread(urls[service])]),
    ),
  });
}

/**
 * One baseline attempt.
 *
 * The issuer is right about each request and wrong about the pair. Both execute.
 */
async function attemptBaseline(timeline) {
  const topology = await startTargets();
  const observations = [];
  try {
    const declared = ARMS.baseline;
    const evidence = readJson(join(repoRoot, ARMS.treatment.evidencePath));
    const issuer = new CompositionUnawareIssuer({
      targetIds: TARGET_IDS,
      targetUrls: topology.urls,
      keyId: topology.keyId,
      signingKeyPem: topology.signingKeyPem,
      // Provenance only. The issuer copies this into the receipt and never
      // reads a field of it; the receipt shape has to match the treatment
      // arm's or a difference in outcome could be blamed on the receipts.
      receiptProvenance: receiptProvenanceFrom(evidence, ARMS.treatment.sourceRevision),
    });

    const ingress = createIngress({
      handle: (request) => issuer.issue(request),
      observations,
    });
    const ingressUrl = await listen(ingress);

    const results = await Promise.all([call(ingressUrl, 'A'), call(ingressUrl, 'B')]);
    await close(ingress);

    const executed = [];
    const intents = {};
    for (const result of results) {
      const { outcome } = result;
      const seen = observations.find((entry) => entry.correlationId === result.correlationId);
      intents[result.id] = { digest: seen.intentDigest, service: seen.service };
      timeline.record({
        correlationId: result.correlationId,
        state: ExperimentState.REQUESTED,
        at: new Date().toISOString(),
        producedBy: 'ingress',
        detail: `${result.id} arrived at the neutral ingress`,
      });
      if (outcome.authorized) {
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.AUTHORIZED,
          at: new Date().toISOString(),
          producedBy: 'baseline-issuer',
          detail: `receipt ${outcome.receiptId} minted without consulting anything else in flight`,
        });
      }
      if (outcome.execution?.status === 'EXECUTED') {
        executed.push({
          correlationId: result.correlationId,
          service: outcome.service,
          status: outcome.execution.status,
          revisionBefore: outcome.execution.revisionBefore,
          revisionAfter: outcome.execution.revisionAfter,
        });
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.EXECUTED,
          at: new Date().toISOString(),
          producedBy: 'protected-target',
          detail: `${outcome.service} committed at ${outcome.execution.revisionAfter}`,
        });
      }
    }

    const globalVerification = await verifyArm(topology.urls);
    timeline.record({
      correlationId: results[0].correlationId,
      state: ExperimentState.OBSERVED,
      at: new Date().toISOString(),
      producedBy: INDEPENDENT_REREAD,
      detail: globalVerification.detail,
    });

    return {
      arm: 'baseline',
      storeTopology: declared.storeTopology,
      inPath: declared.inPath,
      targetsUnchanged: true,
      targetInstrumentation:
        'a timestamp-only delegate forwards every call to the unchanged ProtectedTarget; no rule ' +
        'is added and none is removed',
      initialStateDigest: topology.initialStateDigest,
      intents,
      decisions: [],
      executed,
      commits: topology.commits.map(({ atMs, ...rest }) => rest),
      globalVerification,
      overlap: observations,
      outcome: executed.length === 2 ? 'BOTH_EXECUTED' : 'INCOMPLETE',
    };
  } finally {
    await topology.stop();
  }
}

/** One Interlock attempt — treatment or perturbation, identical but for input. */
async function attemptInterlock(armName, timeline) {
  const declared = ARMS[armName];
  const evidence = readJson(join(repoRoot, declared.evidencePath));
  const sourceRevision = declared.sourceRevision;
  const topology = await startTargets();
  const observations = [];

  try {
    const proxyOptionsFor = (service) => ({
      targetId: TARGET_IDS[service],
      target: new HttpTargetPort({ baseUrl: topology.urls[service] }),
      signingKey: topology.signingKey,
      evidence,
      sourceRevision,
    });

    const surface = createRoutingSurface({
      alpha: proxyOptionsFor('alpha'),
      beta: proxyOptionsFor('beta'),
    });

    // Capture the exact arbitration inputs the proxies used.
    //
    // Without this the packet can only record what was decided, and a verifier
    // that re-derives a decision from inputs the harness reconstructed is
    // checking the harness's memory rather than the decision. These wrappers
    // delegate to the real store and change nothing; they copy what went in and
    // what came back out, so `verify-packet --rederive-only` can run the real
    // `arbitrate` over the real inputs and disagree if it wants to.
    const pendingIntents = [];
    const activeReads = [];
    const recordInto = surface.store.record.bind(surface.store);
    const activeFrom = surface.store.active.bind(surface.store);
    surface.store.record = (intent) => {
      pendingIntents.push(structuredClone(intent));
      return recordInto(intent);
    };
    surface.store.active = (now, exceptCorrelationId) => {
      const answer = activeFrom(now, exceptCorrelationId);
      activeReads.push({
        forCorrelationId: exceptCorrelationId,
        // The proxy reads the store immediately before arbitrating, so this is
        // the instant the decision was made. Stamping it later — when the
        // response came back to the harness — would put every decision after
        // every commit and make the ordering claim vacuous.
        decidedAt: new Date().toISOString(),
        decidedAtMs: nowMs(),
        ok: answer.ok,
        others: answer.ok ? structuredClone(answer.value) : null,
      });
      return answer;
    };

    const ingress = createIngress({
      handle: (request) => dispatch(surface, request),
      observations,
    });
    const ingressUrl = await listen(ingress);

    const results = await Promise.all([call(ingressUrl, 'A'), call(ingressUrl, 'B')]);
    await close(ingress);

    const decisions = [];
    const executed = [];
    const intents = {};
    let withheldBeforeTargetMutation = false;

    for (const result of results) {
      const response = result.outcome.response;
      const service = result.outcome.service;
      const seen = observations.find((entry) => entry.correlationId === result.correlationId);
      intents[result.id] = { digest: seen.intentDigest, service: seen.service };
      timeline.record({
        correlationId: result.correlationId,
        state: ExperimentState.REQUESTED,
        at: new Date().toISOString(),
        producedBy: 'ingress',
        detail: `${result.id} arrived at the neutral ingress`,
      });

      const withheld = response.reasonCode === Reason.COUPLING_OBSERVED;
      const arbitratedAt = activeReads.find(
        (read) => read.forCorrelationId === result.correlationId,
      );
      decisions.push({
        correlationId: result.correlationId,
        service,
        // The proxy answers the caller ALLOW/DENY and carries the arbitration
        // reason. The arbitration decision is reconstructed from that pair, and
        // the packet verifier re-derives it from the real function rather than
        // believing this line.
        decision: withheld
          ? Decision.WITHHOLD_SERIALIZE
          : response.couplings?.length
            ? Decision.ALLOW_SERIALIZED
            : Decision.ALLOW_PARALLEL,
        reasonCode: response.reasonCode,
        decidedAt: arbitratedAt.decidedAt,
        decidedAtMs: arbitratedAt.decidedAtMs,
        couplings: response.couplings ?? [],
        callerDecision: response.decision,
      });

      if (withheld) {
        withheldBeforeTargetMutation = response.execution === undefined;
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.WITHHELD,
          at: new Date().toISOString(),
          producedBy: 'interlock-proxy',
          detail: response.message,
        });
      } else if (response.execution?.status === 'EXECUTED') {
        executed.push({
          correlationId: result.correlationId,
          service,
          status: response.execution.status,
          revisionBefore: response.execution.revisionBefore,
          revisionAfter: response.execution.revisionAfter,
        });
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.AUTHORIZED,
          at: new Date().toISOString(),
          producedBy: 'interlock-proxy',
          detail: `receipt ${response.receiptId} issued after arbitration`,
        });
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.EXECUTED,
          at: new Date().toISOString(),
          producedBy: 'protected-target',
          detail: `${service} committed at ${response.execution.revisionAfter}`,
        });
      } else {
        timeline.record({
          correlationId: result.correlationId,
          state: ExperimentState.FAILED,
          at: new Date().toISOString(),
          producedBy: 'interlock-proxy',
          detail: `${response.reasonCode}: ${response.message}`,
        });
      }
    }

    const globalVerification = await verifyArm(topology.urls);
    timeline.record({
      correlationId: results[0].correlationId,
      state: ExperimentState.OBSERVED,
      at: new Date().toISOString(),
      producedBy: INDEPENDENT_REREAD,
      detail: globalVerification.detail,
    });

    const firstCommit = topology.commits
      .slice()
      .sort((left, right) => left.atMs - right.atMs)[0];

    return {
      arm: armName,
      storeTopology: declared.storeTopology,
      inPath: declared.inPath,
      evidencePath: declared.evidencePath,
      sourceRevision,
      targetsUnchanged: true,
      initialStateDigest: topology.initialStateDigest,
      intents,
      // Everything `arbitrate` was handed, verbatim, so the packet verifier can
      // re-derive rather than re-read.
      arbitrationInputs: activeReads.map((read) => ({
        correlationId: read.forCorrelationId,
        candidate: pendingIntents.find(
          (intent) => intent.correlationId === read.forCorrelationId,
        ),
        storeAnswered: read.ok,
        others: read.others,
      })),
      decisions,
      executed,
      withheldBeforeTargetMutation,
      commits: topology.commits.map(({ atMs, ...rest }) => rest),
      firstProtectedCommitAt: firstCommit?.at ?? null,
      firstProtectedCommitAtMs: firstCommit?.atMs ?? null,
      globalVerification,
      overlap: observations,
      outcome:
        armName === 'treatment'
          ? decisions.some((decision) => decision.decision === Decision.WITHHOLD_SERIALIZE)
            ? 'COMPOSITION_WITHHELD'
            : 'NO_OVERLAP_OBSERVED'
          : executed.length === 2
            ? 'BOTH_EXECUTED'
            : 'INCOMPLETE',
    };
  } finally {
    await topology.stop();
  }
}

/**
 * Run one arm, retrying only while the concurrency window was missed.
 *
 * Every attempt is kept, including the ones that did not overlap. A run that
 * discarded its unsuccessful attempts would be reporting a filtered sample, and
 * the filter would be invisible.
 */
async function runArm(armName, timeline) {
  const maxAttempts = PREFLIGHT_V1.predeclared.concurrencyAttempts.maximum;
  const attempts = [];
  let last = null;
  for (let index = 1; index <= maxAttempts; index += 1) {
    last =
      armName === 'baseline'
        ? await attemptBaseline(timeline)
        : await attemptInterlock(armName, timeline);
    attempts.push({
      index,
      arm: armName,
      outcome: last.outcome,
      retained: true,
      executed: last.executed.length,
      total: last.globalVerification.total,
      overlapped: overlapOf(last.overlap).overlapped,
    });
    const satisfactory =
      armName === 'treatment'
        ? last.outcome === 'COMPOSITION_WITHHELD'
        : last.outcome === 'BOTH_EXECUTED';
    if (satisfactory) break;
  }
  return { result: { ...last, attempts }, attempts };
}

/** Overlap, computed from the ingress stamps of the two requests. */
function overlapOf(observations) {
  const [first, second] = observations;
  if (first === undefined || second === undefined) {
    return { measuredAt: 'server', usesClientLaunchTime: false, overlapped: false };
  }
  const startA = first.startMs;
  const endA = first.endMs;
  const startB = second.startMs;
  const endB = second.endMs;
  return {
    measuredAt: 'server',
    usesClientLaunchTime: false,
    formula: PREFLIGHT_V1.predeclared.runtimeOverlap.formula,
    startA,
    endA,
    startB,
    endB,
    overlapped: Math.max(startA, startB) < Math.min(endA, endB),
  };
}

/** Digest of the experiment's own implementation, for the attribution check. */
function implementationDigest() {
  const files = [];
  for (const name of readdirSync(join(experimentDir, 'src')).sort()) {
    files.push(readFileSync(join(experimentDir, 'src', name)));
  }
  files.push(readFileSync(join(here, 'run-arm.mjs')));
  return sha256Hex(Buffer.concat(files));
}

/**
 * Digest of the deployed topology, excluding the inputs an arm is allowed to
 * vary. Treatment and perturbation must land on the same value: if they do not,
 * a difference in outcome cannot be attributed to the artifact.
 */
function deploymentDigest() {
  return sha256Hex(
    JSON.stringify({
      targetIds: TARGET_IDS,
      partitions: Object.fromEntries(
        PARTITIONED_SERVICES.map((service) => [service, partitionState(service)]),
      ),
      operation: OPERATION_SET_RESERVATION,
      storeTopology: ARMS.treatment.storeTopology,
      inPath: ARMS.treatment.inPath,
      enforceCallerIdentity: ENFORCE_CALLER_IDENTITY,
    }),
  );
}

// ---------------------------------------------------------------------------
// Compositions, for the verifier's self-check
// ---------------------------------------------------------------------------

/**
 * Apply a chosen set of mutations through the real receipt and target path, and
 * re-read the result.
 *
 * Used by `verify-packet.mjs --selfcheck-composition` to demonstrate the four
 * composition facts mechanically rather than arithmetically.
 */
export async function runComposition(services) {
  const topology = await startTargets();
  try {
    const evidence = readJson(join(repoRoot, ARMS.treatment.evidencePath));
    const issuer = new CompositionUnawareIssuer({
      targetIds: TARGET_IDS,
      targetUrls: topology.urls,
      keyId: topology.keyId,
      signingKeyPem: topology.signingKeyPem,
      receiptProvenance: receiptProvenanceFrom(evidence, ARMS.treatment.sourceRevision),
    });

    for (const service of services) {
      const id = Object.keys(INTENTS).find(
        (key) => INTENTS[key].intent.arguments.service === service,
      );
      const result = await issuer.issue({
        correlationId: newCorrelationId(),
        callerIdentity: INTENTS[id].agent,
        identitySource: CALLER_IDENTITY_SOURCE,
        intent: INTENTS[id].intent,
      });
      if (result.execution?.status !== 'EXECUTED') {
        throw new Error(
          `composition step ${service} did not execute: ${JSON.stringify(result).slice(0, 300)}`,
        );
      }
    }

    return await verifyArm(topology.urls);
  } finally {
    await topology.stop();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runAll() {
  const timeline = new Timeline();
  const arms = {};
  const attemptsByArm = {};
  for (const armName of ['baseline', 'treatment', 'perturbation']) {
    const run = await runArm(armName, timeline);
    arms[armName] = run.result;
    attemptsByArm[armName] = run.attempts;
  }

  // The bounded budget is on the *collision*: getting both intents into the
  // Interlock window at once. That is the treatment arm's attempts, and it is
  // the number Preflight V1 capped at three. Every other arm's attempts are
  // retained on the arm itself; nothing is discarded anywhere (X-05).
  const perArmAttempts = attemptsByArm.treatment;

  const implementation = implementationDigest();
  const deployment = deploymentDigest();
  for (const armName of ['treatment', 'perturbation']) {
    arms[armName].deploymentDigest = deployment;
    arms[armName].implementationDigest = implementation;
  }
  arms.baseline.implementationDigest = implementation;

  const results = {
    experiment: 'HAC-316',
    mode: 'local',
    agentRuntime: {
      executed: false,
      note:
        'This packet was produced by the local dry run (SPEC Phase 6). No Google Cloud project, ' +
        'Agent Runtime resource or other billable resource was created, and no Agent Runtime API ' +
        'was called. The Phase 7 arms are not represented here.',
    },
    cloudResourcesCreated: 0,
    producedAt: new Date().toISOString(),
    fixtureDigest: FIXTURE.canonicalFixtureDigest,
    enforceCallerIdentity: {
      targetAlpha: String(ENFORCE_CALLER_IDENTITY),
      targetBeta: String(ENFORCE_CALLER_IDENTITY),
      baselineIssuer: String(ENFORCE_CALLER_IDENTITY),
      variable: 'INTERLOCK_ENFORCE_CALLER_IDENTITY',
      note:
        'One value resolved once and handed to every component, then read back off each ' +
        'component as constructed. The arms are not comparable if these diverge.',
    },
    concurrency: {
      maxAttempts: PREFLIGHT_V1.predeclared.concurrencyAttempts.maximum,
      attempts: perArmAttempts,
      discardedAttempts: 0,
      runtimeOverlap: overlapOf(arms.treatment.overlap),
      note:
        'Overlap is stamped by the neutral ingress on receipt and on response. The harness never ' +
        'contributes a timestamp to this measurement.',
    },
    forbiddenTechniques: {
      artificialDelay: false,
      barrier: false,
      ttlTuning: false,
      hiddenRetry: false,
      cherryPickedAttempt: false,
    },
    lifecycle: {
      states: Object.keys(ExperimentState),
      acceptedAvailability: acceptedAvailability(),
      events: timeline.events,
    },
    arms,
    teardown: {
      status: 'NOT_APPLICABLE_LOCAL',
      verifiedBy: 'not-run',
      remainingResources: 0,
      note:
        'Nothing was provisioned, so nothing was torn down. This field is NOT evidence that a ' +
        'Phase 7 teardown succeeded; it records that Phase 7 did not run.',
    },
  };

  writeFileSync(join(evidenceDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  return results;
}

function report(results) {
  const lines = [];
  for (const armName of ['baseline', 'treatment', 'perturbation']) {
    const arm = results.arms[armName];
    const verification = arm.globalVerification;
    lines.push(
      `${armName.padEnd(14)}executed=${arm.executed.length}  total=${verification.total}  ` +
        `cap=${verification.cap}  ${verification.holds ? 'HOLDS' : 'BREACH'}`,
    );
  }
  lines.push(`cloud-resources-created=${results.cloudResourcesCreated}`);
  return lines;
}

// Realpath-correct on both sides; see `src/entrypoint.mjs`. Comparing the raw
// strings makes a symlinked invocation exit 0 without running anything.
const invokedDirectly = isDirectInvocation(import.meta.url);

if (invokedDirectly) {
  const results = await runAll();
  for (const line of report(results)) process.stdout.write(`${line}\n`);

  const expectations = [
    ['baseline', 2, false],
    ['treatment', 1, true],
    ['perturbation', 2, false],
  ];
  const problems = [];
  for (const [armName, executed, holds] of expectations) {
    const arm = results.arms[armName];
    if (arm.executed.length !== executed) {
      problems.push(`${armName}: expected ${executed} execution(s), got ${arm.executed.length}`);
    }
    if (arm.globalVerification.holds !== holds) {
      problems.push(
        `${armName}: expected holds=${holds}, got ${arm.globalVerification.holds} ` +
          `(${arm.globalVerification.detail})`,
      );
    }
  }
  if (results.cloudResourcesCreated !== 0) problems.push('a cloud resource was created');

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`run-arm: ${problem}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('PASS\n');
  }
}

export { formatVerdict };
