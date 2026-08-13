#!/usr/bin/env node
/**
 * Preflight V2 — the falsification of the single-target baseline, recorded.
 *
 * V1 is not rewritten and not deleted (X-12). It stated a topology that turned
 * out to be unreachable, and a manifest that quietly acquires the right answer
 * afterwards is worth nothing; the pair — V1 as declared, V2 as corrected, with
 * every difference named — is what makes the correction auditable.
 *
 * Two disciplines are enforced here rather than asked for.
 *
 * **Nothing derivable is typed.** V1's producer imported the compiled modules
 * and computed every digest, revision and intent digest from them. This one does
 * the same, from `dist/authorization/canonical.js`, `dist/target/state.js` and
 * the committed HAC-330 artifacts. A hand-typed digest is a digest nobody
 * checked (REQ-067).
 *
 * **Nothing changes silently.** `changed_fields` is not authored; it is computed
 * by diffing V1 against the V2 body leaf by leaf. Every differing leaf must have
 * a rationale registered in `WHY` below, and this script refuses to write a
 * manifest with an unexplained difference. That inverts the usual failure mode:
 * a field cannot drift unless somebody writes down why (REQ-006).
 *
 * Output is a pure function of the committed inputs, so re-running is a no-op —
 * V2 is immutable once committed.
 *
 * Run:  node experiments/hac-316/bin/preflight-v2.mjs   (after `pnpm run build`)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');
const dist = join(repoRoot, 'dist');

const load = async (relative) => {
  try {
    return await import(join(dist, relative));
  } catch (error) {
    throw new Error(
      `cannot load ${relative} from dist/. Run "pnpm run build" first.\n  ${error.message}`,
    );
  }
};

const { canonicalDigest } = await load('authorization/canonical.js');
const { genesisRevision } = await load('broker/revision/revision.js');
const { INITIAL_STATE, asCanonical } = await load('target/state.js');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');
const DIGEST_PREFIX = 'sha256';

const V1_PATH = join(evidenceDir, 'preflight.json');
const V1_REL = 'experiments/hac-316/evidence/preflight.json';
const v1 = readJson(V1_PATH);
const pins = readJson(join(evidenceDir, 'pins.json'));
const toolchain = readJson(join(evidenceDir, 'toolchain.json'));

const baselineRel = 'experiments/hac-330/evidence/baseline.evidence.json';
const perturbedRel = 'experiments/hac-330/evidence/perturbed.evidence.json';
const baselineBytes = readFileSync(join(repoRoot, baselineRel));
const perturbedBytes = readFileSync(join(repoRoot, perturbedRel));
const baselineEvidence = JSON.parse(baselineBytes.toString('utf8'));
const perturbedEvidence = JSON.parse(perturbedBytes.toString('utf8'));

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

/** Whether the *source* tree is clean, on V1's terms — this experiment's own
 * evidence output is excluded so the guard does not trip on the artifact it is
 * in the middle of writing. */
function sourceIsClean() {
  const dirty = git('status', '--porcelain')
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => !line.slice(3).startsWith('experiments/hac-316/evidence'));
  return { clean: dirty.length === 0, paths: dirty };
}

// ---------------------------------------------------------------------------
// The projection. Derived, never typed.
// ---------------------------------------------------------------------------

/**
 * Which services the experiment actually mutates, read off V1's own predeclared
 * intents rather than restated. The residual — every service the two intents do
 * not touch — is what the global verifier folds back in, and it is never a
 * target of its own (X-14).
 */
const PARTITIONED = Object.values(v1.expectedIntents).map(
  (entry) => entry.intent.arguments.service,
);
const RESIDUAL = Object.keys(INITIAL_STATE.services).filter(
  (service) => !PARTITIONED.includes(service),
);

const partitionState = (service) => ({
  totalReservable: INITIAL_STATE.totalReservable,
  services: { [service]: INITIAL_STATE.services[service] },
});

const TARGET_IDS = Object.fromEntries(
  PARTITIONED.map((service) => [service, `interlock-s1-target-${service}`]),
);

const partitions = Object.fromEntries(
  PARTITIONED.map((service) => [service, partitionState(service)]),
);

/**
 * The fixture digest the arms are compared on.
 *
 * `JSON.stringify` of the canonical projection, matching REQ-010's formula
 * exactly. It is deliberately *not* `canonicalDigest`: two digest functions over
 * the same state that disagree would give the parity check two answers, and the
 * requirement names one of them.
 */
const canonicalFixtureDigest = `${DIGEST_PREFIX}:${sha256Hex(
  JSON.stringify(asCanonical(INITIAL_STATE)),
)}`;

const fixtureManifest = {
  experiment: 'HAC-316',
  purpose:
    'the canonical HAC-330 fixture, unchanged, plus the two-target projection the arms deploy',
  recordedBeforeArms: true,
  projection: true,
  replacesCanonicalFixture: false,
  canonicalFixture: asCanonical(INITIAL_STATE),
  canonicalFixtureDigest,
  canonicalFixtureCanonicalDigest: canonicalDigest(asCanonical(INITIAL_STATE)),
  partitionedServices: PARTITIONED,
  residualServices: RESIDUAL,
  gammaTargetExists: false,
  targetIds: TARGET_IDS,
  partitions,
  genesisRevisions: Object.fromEntries(
    PARTITIONED.map((service) => [
      service,
      genesisRevision(TARGET_IDS[service], asCanonical(partitions[service])),
    ]),
  ),
  invariant: 'sum(services[].reserved) + residual <= totalReservable',
  note:
    'Each partition keeps the whole pool as its own totalReservable, so each local mutation is ' +
    'genuinely valid and neither target can observe the composition. No partition is capped ' +
    `below the pool (X-13), and the residual service${RESIDUAL.length === 1 ? '' : 's'} ` +
    `(${RESIDUAL.join(', ')}) never becomes a target (X-14) — it is folded in by the global ` +
    'verifier, which is where the harm oracle lives.',
};

// ---------------------------------------------------------------------------
// The V2 body: V1's shape, with the falsified topology corrected.
// ---------------------------------------------------------------------------

const pythonVersion = toolchain.captured.python.stdout.replace(/^Python\s+/u, '');

const body = {
  experiment: v1.experiment,
  title: v1.title,
  declaredAt: v1.declaredAt,
  sourceRevision: pins.specFrozenAt,
  sourceClean: sourceIsClean().clean,

  toolchain: {
    node: toolchain.captured.node.stdout,
    python: pythonVersion,
    'google-adk': toolchain.captured['google-adk'].stdout,
    mcp: toolchain.captured.mcp.stdout,
    vertexai: toolchain.captured.vertexai.stdout,
    capturedIn: 'experiments/hac-316/evidence/toolchain.json',
    note:
      'Every value above is the verbatim stdout of a recorded command; see toolchain.json for the ' +
      'commands. The working ADK import path is ' +
      `${toolchain.adkImport.modulePath}, reproduced in the interpreter the agents run on and ` +
      `resolved to ${toolchain.adkImport.resolvedFile}. google-adk requires mcp>=1.24,<2, and a ` +
      'bare `pip install mcp` resolves outside that range; install `google-adk[mcp]`.',
  },

  frozenContracts: v1.frozenContracts,

  fixture: {
    initialState: v1.fixture.initialState,
    initialStateDigest: v1.fixture.initialStateDigest,
    genesisRevisionProtectedTarget: null,
    genesisRevisionBaselineTarget: null,
    projectionRecordedIn: 'experiments/hac-316/evidence/fixture.json',
    invariant: v1.fixture.invariant,
    note:
      'The canonical fixture is unchanged and is not replaced. What changed is the deployment: ' +
      `the state is projected across ${PARTITIONED.length} targets (${PARTITIONED.join(', ')}), ` +
      'each an unchanged ProtectedTarget keeping the whole pool, so each mutation is locally ' +
      'valid and no target observes the composition. Per-partition targetIds and genesis ' +
      'revisions live in fixture.json.',
  },

  expectedIntents: v1.expectedIntents,
  counterfactual: v1.counterfactual,

  couplingEvidence: {
    artifact: v1.couplingEvidence.artifact,
    artifactSha256: baselineEvidence.artifact.sha256,
    evidence_file_sha256: sha256Hex(baselineBytes),
    producer_artifact_sha256: baselineEvidence.artifact.sha256,
    basisRevision: baselineEvidence.selection.scoringBasis.basisRevision,
    producer: `${baselineEvidence.producer.package}@${baselineEvidence.producer.version}`,
    producerSha: baselineEvidence.producer.observedSha,
    observedCoupling: v1.couplingEvidence.observedCoupling,
    note:
      'Consumed verbatim from the pinned upstream miner via HAC-330. Two different digests are ' +
      'recorded under two different names and are never collapsed: evidence_file_sha256 is the ' +
      'sha256 of the file on disk, producer_artifact_sha256 is the artifact.sha256 field inside ' +
      'the envelope. V1 recorded only the second, under a name that reads like the first.',
  },

  perturbationEvidence: {
    artifact: perturbedRel,
    evidence_file_sha256: sha256Hex(perturbedBytes),
    producer_artifact_sha256: perturbedEvidence.artifact.sha256,
    basisRevision: perturbedEvidence.selection.scoringBasis.basisRevision,
    note:
      'The perturbation arm must be run at THIS basis revision, not the baseline one. The two ' +
      'artifacts are pinned to different commits, and an arm that swapped the evidence while ' +
      'keeping the baseline sourceRevision would be denied for a stale basis rather than for the ' +
      'absence of a qualifying pair — a denial that looks like Interlock holding and proves ' +
      'nothing. SPEC 5.4; enforced by REQ-047 and REQ-056.',
  },

  predeclared: {
    ...v1.predeclared,
    runtimeOverlap: {
      formula: v1.predeclared.runtimeOverlap.formula,
      measuredAt:
        'the protected targets themselves, which are the only components present in every arm. ' +
        'Each target records the server-side instant it began and finished handling a mutation; ' +
        'overlap is computed from those four instants. Client launch time is NOT used to infer ' +
        'concurrency.',
    },
  },

  guarantees: {
    ttlWideningImpossible: {
      holds: true,
      evidence:
        'pendingTtlMs exists on ProxyOptions in src/proxy/service.ts but has no entry in the ENV ' +
        'table in src/config.ts and is not passed by src/proxy/main.ts. A deployed proxy has no ' +
        'input that reaches it, so widening the pending TTL is structurally impossible rather ' +
        'than merely forbidden.',
      checkedBy: 'REQ-052',
    },
    localInvariantsRemainEnabled: {
      holds: true,
      evidence:
        'Each partition is an unchanged ProtectedTarget, so applyMutation still refuses an ' +
        'unknown service and still refuses a mutation that would breach its own pool. The local ' +
        'checks are defense in depth, not the oracle, and nothing disables them (X-19).',
      checkedBy: 'REQ-027',
    },
  },

  routing: {
    mechanism:
      'An experiment-local routing surface dispatches on intent.arguments.service alone: alpha ' +
      'to proxy A, beta to proxy B, and fails closed on anything else. It holds no run/arm ' +
      'binding, so the request body — and therefore the intent digest — is byte-identical across ' +
      'arms. Two InterlockProxy instances share exactly one PendingIntentStore object, which is ' +
      'what lets them arbitrate over each other without any production change.',
    arms: {
      baseline:
        'composition-unaware issuer -> both protected targets. The issuer validates each action ' +
        'independently and mints the frozen S2 receipt shape; it never consults what else is in ' +
        'flight.',
      treatment:
        'routing surface -> frozen S2 proxy pair (one shared pending-intent store) -> protected ' +
        'targets, deciding from the baseline evidence artifact.',
      perturbation:
        'identical deployment and implementation to treatment; only the evidence artifact and its ' +
        'matching sourceRevision differ.',
    },
    routingConstraints: [
      'no Interlock decision logic',
      'no receipt issuance',
      'no argument transformation',
      'no evidence inspection and no arbitration',
      'dispatch is a pure function of intent.arguments.service',
      'unknown, missing or non-string service fails closed',
    ],
  },

  truthModel: {
    states: v1.truthModel.states,
    rule: v1.truthModel.rule,
    acceptedAvailability:
      'ACCEPTED is not independently observable against the frozen target, which answers a ' +
      'mutation with one response carrying EXECUTED or a 403. It is recorded as unavailable and ' +
      'never emitted; the distinction is preserved for HAC-317 (X-18).',
  },

  outOfScope: v1.outOfScope,
};

// ---------------------------------------------------------------------------
// The diff against V1, computed rather than asserted.
// ---------------------------------------------------------------------------

/** Flatten to leaf paths, matching REQ-006's comparison exactly. */
function flatten(value, prefix = '', out = {}) {
  for (const [key, member] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (member && typeof member === 'object' && !Array.isArray(member)) {
      flatten(member, path, out);
    } else {
      out[path] = JSON.stringify(member);
    }
  }
  return out;
}

/**
 * Why each leaf differs from V1.
 *
 * A path may not change without an entry here. This is the whole mechanism of
 * REQ-006: the manifest cannot drift quietly, because the producer refuses to
 * write an undeclared difference.
 */
const WHY = {
  sourceRevision:
    'V1 was declared at the commit that fixed its own cleanliness guard. V2 is declared against ' +
    'the commit that froze the implementation spec, read from pins.json so that regenerating V2 ' +
    'is a no-op rather than a function of whatever HEAD happens to be.',
  'toolchain.note':
    "V1's note asserted, as prose, that google.adk.tools.mcp_tool.McpToolset fails on this " +
    'version. Reproducing the import in the real interpreter does not reproduce that failure, so ' +
    'the claim is not promoted (REQ-009). The replacement records the path that was measured to ' +
    'work and where it resolved.',
  'toolchain.capturedIn':
    'New. V1 asserted five toolchain values as literals; V2 points at the file that records the ' +
    'command and verbatim stdout behind each of them (REQ-008).',
  'fixture.genesisRevisionProtectedTarget':
    'Falsified topology. This was the genesis revision of a single target holding all three ' +
    'services. That target refuses the second mutation locally with INVARIANT_BREACH before the ' +
    'composition can occur, so it cannot reach the state the experiment must observe. Nulled ' +
    'rather than silently repointed; the per-partition genesis revisions are in fixture.json.',
  'fixture.genesisRevisionBaselineTarget':
    'Falsified topology, and the load-bearing correction. V1 presumed an "unsafe" baseline ' +
    'target. An unchanged ProtectedTarget cannot be the unsafe arm — it enforces its own pool — ' +
    'so the baseline is now a composition-unaware *issuer* in front of the same two unchanged ' +
    'targets, and this target does not exist.',
  'fixture.projectionRecordedIn':
    'New. Names the artifact holding the two-target projection, its targetIds and its genesis ' +
    'revisions, so V2 does not restate values that have a producer.',
  'fixture.note':
    "V1's note explained why the protected and baseline targets took different targetIds. There " +
    'is no baseline target now. The replacement explains the projection and states explicitly ' +
    'that the canonical fixture is not replaced.',
  'couplingEvidence.evidence_file_sha256':
    'New, and named for what it is: the sha256 of the evidence FILE on disk. V1 recorded only ' +
    'the envelope-internal field, under the name artifactSha256, which reads like this one.',
  'couplingEvidence.producer_artifact_sha256':
    'New. The same value V1 recorded as artifactSha256, now carrying a name that says it is the ' +
    'artifact.sha256 field inside the envelope rather than a digest of the file.',
  'couplingEvidence.note':
    "V1's note said the artifact was consumed verbatim and not re-derived, which still holds and " +
    'is kept. What is added is the distinction between the two digests now recorded side by ' +
    'side, so a later reader cannot pin the wrong one while believing the pin is tight.',
  'predeclared.runtimeOverlap.measuredAt':
    'V1 measured overlap at a neutral ingress that sat in front of a single target. With the ' +
    'state projected across two targets, the components present in every arm are the targets ' +
    'themselves, so that is where the server-side instants are taken. The prohibition on ' +
    'inferring concurrency from client launch time is carried over unchanged.',
  'routing.mechanism':
    'V1 described an ingress holding a run_id -> arm binding in front of one target. The ' +
    'deployment is now two targets and a dispatch on the service name, with no arm binding at ' +
    'all — the arms differ by which component is in the path, not by anything the ingress knows.',
  'routing.arms.baseline':
    'The baseline arm is no longer "ingress -> baseline target". It is a composition-unaware ' +
    'issuer in front of the same two unchanged protected targets.',
  'routing.arms.treatment':
    'Restated for the two-target deployment: two proxies sharing one pending-intent store, which ' +
    'is what makes cross-target arbitration reachable without a production change.',
  'routing.arms.perturbation':
    'New. V1 had no perturbation arm in its routing block; the arm exists so the decision can be ' +
    'shown to change with the evidence rather than with the code.',
  'routing.ingressConstraints':
    'Renamed and rewritten as routing.routingConstraints. The constraints are the same in ' +
    'substance — no decision logic, no receipt issuance, no argument transformation — with the ' +
    'evidence and arbitration prohibitions stated explicitly (X-15).',
  'routing.routingConstraints':
    'Replaces routing.ingressConstraints; see that entry. Listed separately because the leaf ' +
    'path itself is new.',
  'truthModel.acceptedAvailability':
    'New. Records that ACCEPTED cannot be observed against the frozen target and is therefore ' +
    'never emitted, rather than leaving a state in the vocabulary that quietly never appears ' +
    '(X-18).',
  'guarantees.ttlWideningImpossible.holds':
    'New. Records as a structural guarantee what V1 listed only as a prohibition: the pending ' +
    'TTL has no environment input, so it cannot be widened after a first run.',
  'guarantees.ttlWideningImpossible.evidence': 'New; the citations behind the guarantee above.',
  'guarantees.ttlWideningImpossible.checkedBy': 'New; the requirement that re-checks it.',
  'guarantees.localInvariantsRemainEnabled.holds':
    'New. The projection moves the harm oracle out of the target, and the obvious wrong way to ' +
    'do that is to switch the local checks off. This records that they stay on.',
  'guarantees.localInvariantsRemainEnabled.evidence': 'New; the basis for the guarantee above.',
  'guarantees.localInvariantsRemainEnabled.checkedBy': 'New; the requirement that re-checks it.',
  'perturbationEvidence.artifact':
    'New. V1 pinned only the baseline artifact, because it had no perturbation arm.',
  'perturbationEvidence.evidence_file_sha256':
    'New; the sha256 of the perturbed evidence FILE on disk.',
  'perturbationEvidence.producer_artifact_sha256':
    'New; the artifact.sha256 field inside the perturbed envelope.',
  'perturbationEvidence.basisRevision':
    'New, and the trap this manifest exists to disarm. The perturbed artifact is pinned to a ' +
    'different commit than the baseline one, and running the perturbation arm at the baseline ' +
    'revision denies both intents for STALE_BASIS — the wrong reason.',
  'perturbationEvidence.note':
    'New; states the trap in full so nobody has to find it again halfway through a cloud run.',
};

const v1Flat = flatten(v1);
const bodyFlat = flatten(body);
const changed = [];
const undeclared = [];

for (const path of [...new Set([...Object.keys(v1Flat), ...Object.keys(bodyFlat)])].sort()) {
  if (v1Flat[path] === bodyFlat[path]) continue;
  const why = WHY[path];
  if (why === undefined) {
    undeclared.push(path);
    continue;
  }
  changed.push({
    path,
    v1: v1Flat[path] === undefined ? null : JSON.parse(v1Flat[path]),
    v2: bodyFlat[path] === undefined ? null : JSON.parse(bodyFlat[path]),
    why,
  });
}

const manifest = {
  schema: { name: 'interlock.preflight', version: 2 },
  supersedes: V1_REL,
  superseded_sha256: sha256Hex(readFileSync(V1_PATH)),
  reason: 'single-target baseline falsified by local invariant/revision enforcement',
  discovered_by: 'swarm audit',
  discovered_before_first_agent_runtime_trial: true,
  discovered_before_cloud_spend: true,

  carried_forward: {
    max_attempts: v1.predeclared.concurrencyAttempts.maximum,
    artificial_delay_allowed: false,
    barrier_allowed: false,
    ttl_tuning_after_first_run: false,
    hidden_retry_allowed: false,
    same_intent_required: true,
    evidence_perturbation_required: true,
    independent_observation_required: true,
    basis: {
      max_attempts: 'preflight.json predeclared.concurrencyAttempts.maximum',
      artificial_delay_allowed: 'preflight.json predeclared.forbidden[0], [2]',
      barrier_allowed: 'preflight.json predeclared.forbidden[1]',
      ttl_tuning_after_first_run: 'preflight.json predeclared.forbidden[3]',
      hidden_retry_allowed:
        'preflight.json predeclared.concurrencyAttempts.retention and forbidden[4]',
      same_intent_required: 'preflight.json predeclared.trialValidity.rule',
      evidence_perturbation_required:
        'HAC-316 Requirement 8 — the decision must change for the intended reason',
      independent_observation_required: 'preflight.json truthModel.rule',
    },
    note:
      'These are V1 disciplines that survive the topology correction unchanged. They are restated ' +
      'here rather than inherited by reference so that a reader of V2 alone cannot mistake the ' +
      'correction for a relaxation.',
  },

  changed_fields: changed,
  ...body,
};

mkdirSync(evidenceDir, { recursive: true });

const problems = [];
if (undeclared.length > 0) {
  problems.push(
    `undeclared differences from V1 (add a WHY entry for each):\n    ${undeclared.join('\n    ')}`,
  );
}
if (!body.sourceClean) {
  problems.push(
    `source tree is dirty (${sourceIsClean().paths.join(', ')}); ` +
      'a preflight declared from drifted source cannot be recounted',
  );
}
if (RESIDUAL.length === 0) {
  problems.push('the fixture has no residual service; the global verifier would have nothing to fold in');
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`preflight-v2: ${problem}\n`);
  process.exitCode = 1;
} else {
  writeFileSync(join(evidenceDir, 'preflight.v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(evidenceDir, 'fixture.json'), `${JSON.stringify(fixtureManifest, null, 2)}\n`);
  process.stdout.write(
    `preflight V2 supersedes ${V1_REL} (${manifest.superseded_sha256.slice(0, 12)}…)\n` +
      `  ${changed.length} declared changes, 0 undeclared\n` +
      `  projection: ${PARTITIONED.join(' + ')} targets, residual ${RESIDUAL.join(', ')}\n` +
      `  canonical fixture digest ${canonicalFixtureDigest}\n`,
  );
}
