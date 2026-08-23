#!/usr/bin/env node
/**
 * Derives the cockpit view model from frozen evidence.
 *
 * Semantic truth is derived here, in the adapter, from artifacts the repository
 * already holds — HAC-330's arms and results, HAC-342's published packet and
 * bindings. The cockpit renders this file and computes no meaning of its own.
 *
 * The contract that matters is absence. HAC-330 has no receipt, no protected
 * target and no observer, and HAC-340 has no arms and no bounded joint outcome.
 * Neither gets a field because the other has one, so every proof-class-specific
 * key is emitted only when its evidence exists. A `null` here would be a claim
 * that the field was looked for and found empty; the key is simply absent.
 *
 * Reads only public, main-resident evidence. The private unredacted packet is
 * never touched.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeToHtml } from 'shiki';
import { buildComparison } from '../lib/comparison.mjs';
import { GUIDE_STATES, GUIDE_CHOICE_STATE, GUIDE_FREE_STATE, GUIDE_STEPS } from '../lib/guide.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));
/**
 * A sibling experiment's artifact, or `undefined` when it is not in the tree.
 *
 * HAC-343 is a separate experiment on a separate branch cadence, so this
 * surface has to build with or without it. Absent, every cell it would have
 * bound renders as a visible `[BIND: ...]` rather than as a plausible value —
 * which is the same refusal the degraded states make everywhere else.
 */
const readOptional = (...p) => {
  try {
    return read(...p);
  } catch (error) {
    // Absent is a legitimate state: HAC-343 is a separate experiment and this
    // surface has to build without it. Corrupt is not. A truncated or malformed
    // artifact took the same branch and silently unbound ten judge-facing
    // values — four of them the strategy labels — while every gate stayed
    // green. Only ENOENT may pass; anything else is a build defect and says so.
    if (error?.code !== 'ENOENT') {
      throw new Error(`${p.join('/')} exists but could not be read as JSON: ${error.message}`, { cause: error });
    }
    return undefined;
  }
};

const arms = read('experiments', 'hac-330', 'evidence', 'arms.json');
const results = read('experiments', 'hac-330', 'evidence', 'results.json');
const cloud = read('experiments', 'hac-342', 'evidence', 'cloud-run.public.json');
const bindings = read('experiments', 'hac-342', 'evidence', 'publication-bindings.json');
const redaction = read('experiments', 'hac-342', 'evidence', 'redaction-manifest.json');
const snapshot = read('experiments', 'hac-342', 'evidence', 'runtime-source-snapshot.json');

const total = (arm) => arm.invariant?.report?.total;
const holds = (arm) => arm.invariant?.report?.holds === true;
const bound = arms.baseline.invariant.report.totalReservable;
const rawJson = (value) => JSON.stringify(value, null, 2);
/* Build the proof presentation once. The browser only receives frozen HTML and
   plain JSON for copying, so judge capture remains deterministic and does not
   depend on a client-side syntax highlighter or a theme CDN. */
const highlightJson = (value) => codeToHtml(rawJson(value), {
  lang: 'json',
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultColor: false,
});
const outcomeOf = (arm) => ({
  total: total(arm),
  bound,
  expression: `${total(arm)} ${holds(arm) ? '<=' : '>'} ${bound}`,
  holds: holds(arm),
  verdict: holds(arm) ? 'bounded constraint satisfied' : 'invalid joint state',
});

const passed = results.checks.filter((c) => c.passed).length;

/* --- proof class A: controlled local experiment ------------------------ */

const armView = (id, label, arm, evidenceNote) => ({
  armId: id,
  label,
  semanticStateId: `run.local.${id}`,
  interlock: arm.interlock,
  // baseline has no decision because Interlock was disabled: absence, not null-as-value
  ...(arm.decision ? {
    decision: arm.decision.decision,
    decisionReason: arm.decision.reason,
    decisionDetail: arm.decision.detail,
    basisRevision: arm.decision.basisRevision,
    ...(arm.decision.couplings ? { couplings: arm.decision.couplings } : {}),
  } : {}),
  outcome: outcomeOf(arm),
  state: arm.state,
  evidenceNote,
});

const local = {
  runIdentity: 'hac330-local',
  proofClass: 'A',
  proofLabel: 'CONTROLLED LOCAL EXPERIMENT',
  proofSlug: 'local',
  sourceIssue: 'HAC-330',
  frozen: true,
  editorial: {
    verdict: 'Two locally valid actions share an environment; revision-bound evidence changes the coordination decision and the bounded joint outcome.',
    classification: 'EDITORIAL — derived presentation, not a frozen value',
  },
  actors: [
    { id: 'intent.a', label: 'Intent A', role: 'intent', state: 'LOCALLY VALID' },
    { id: 'intent.b', label: 'Intent B', role: 'intent', state: 'LOCALLY VALID' },
    { id: 'environment', label: 'Shared environment', role: 'environment', state: 'COUPLED' },
  ],
  environmentEvidence: [
    { source: 'WorkspaceJSON-derived co-change evidence', revisionBound: true,
      basisRevision: arms.treatment.decision.basisRevision,
      coupling: arms.treatment.decision.couplings },
  ],
  constraints: [{ id: 'joint-bound', expression: `sum(services[].reserved) <= ${bound}`, bound }],
  arms: [
    armView('baseline', 'Baseline arm', arms.baseline, 'Interlock disabled. Both intents execute.'),
    armView('treatment', 'Treatment · original evidence', arms.treatment, 'Interlock enabled with the recorded co-change evidence.'),
    armView('perturbed', 'Perturbed evidence', arms.perturbedControl, 'Interlock enabled; the evidence history is perturbed.'),
  ],
  defaultArm: 'treatment',
  checks: { passed, of: results.checks.length, label: `${passed}/${results.checks.length}` },
  verification: {
    // A deterministic command, not a URL. No hac330VerifierUrl exists and none is invented.
    hac330VerifyCommand: 'node experiments/hac-330/bin/verify-packet.mjs',
    artifacts: ['experiments/hac-330/evidence/arms.json', 'experiments/hac-330/evidence/results.json'],
    pins: results.pins,
  },
  claimBoundary: {
    proves: ['A bounded causal experiment: revision-bound environment evidence changes the coordination decision and the joint outcome.'],
    notClaimed: [
      'did not run on Google Cloud',
      'no receipt, protected target or independent observer exists in this run',
      'WITHHOLD_SERIALIZE is not human approval, joint authorization or certification',
      'not a safety, security or production-readiness guarantee',
    ],
  },
  notOnPath: [],
  // Absent by evidence, listed so the absence is auditable rather than accidental:
  intentionallyAbsent: ['receipt', 'effect', 'observation', 'negativeControls', 'runtimeProvenance', 'transportProvenance', 'publicationRefs'],
};

local.rawProof = {
  source: 'experiments/hac-330/evidence/arms.json',
  json: rawJson(arms),
  html: await highlightJson(arms),
};

/* --- proof class B: Google Cloud participation -------------------------- */

const hop = (n, label, role, detail) => ({ n, label, role, ...(detail ? { detail } : {}) });
const logEntry = cloud.runtimeProof.proxyLogEntries[0];

const cloudRun = {
  runIdentity: cloud.correlationId,
  proofClass: 'B',
  proofLabel: 'GOOGLE CLOUD PARTICIPATION',
  proofSlug: 'cloud',
  sourceIssue: 'HAC-340',
  frozen: true,
  editorial: {
    verdict: 'A real Gemini agent on Google Cloud went through Interlock to touch protected state, and a separately authenticated principal read the result back.',
    classification: 'EDITORIAL — derived presentation, not a frozen value',
  },
  actors: [
    { id: 'model', label: cloud.model, role: 'model' },
    { id: 'framework', label: cloud.adkPath, role: 'framework' },
    { id: 'host', label: `Cloud Run · ${cloud.resources.region}`, role: 'host' },
    { id: 'interlock', label: 'Interlock MCP proxy', role: 'control' },
    { id: 'target', label: 'Protected target', role: 'target' },
    { id: 'observer', label: 'Independent principal', role: 'observer' },
  ],
  events: [
    hop(1, cloud.model, 'model'),
    hop(2, cloud.adkPath, 'framework'),
    hop(3, `Vertex AI ${cloud.resources.vertexLocation} access`, 'model-access'),
    hop(4, `Cloud Run-hosted agent · ${cloud.resources.region}`, 'host'),
    hop(5, 'Interlock MCP proxy', 'control'),
    hop(6, 'ALLOW + receipt', 'decision', cloud.receiptDigest),
    hop(7, 'Protected target mutation', 'effect', cloud.protectedMutation.status),
    hop(8, 'Independently authenticated read-back', 'observation', `alpha=${cloud.observation.state.services.alpha}`),
    hop(9, 'Cloud Logging correlated by run id', 'correlation', logEntry.resource.labels.revision_name),
  ],
  decision: { value: cloud.decision, receiptId: cloud.receiptId, note: 'A decision. Not a verification.' },
  receipt: { digest: cloud.receiptDigest, truncated: `${cloud.receiptDigest.slice(0, 23)}…` },
  effect: {
    status: cloud.protectedMutation.status,
    revisionBefore: cloud.protectedMutation.revisionBefore,
    revisionAfter: cloud.protectedMutation.revisionAfter,
    invariant: cloud.protectedMutation.invariant.detail,
    note: 'Effect. Distinct from observation.',
  },
  observation: {
    status: 'OBSERVED',
    observed: `alpha=${cloud.observation.state.services.alpha}`,
    revision: cloud.observation.revision,
    caption: 'independently authenticated read-back',
    note: 'An observation. Not a safety property.',
  },
  transportProvenance: {
    // Redacted principal classes exactly as published. No local part is reconstructed.
    caller: logEntry.jsonPayload.identity,
    identitySource: logEntry.jsonPayload.identitySource,
    agentServiceAccount: cloud.resources.agentServiceAccount,
    observerPrincipal: cloud.resources.observerPrincipal,
    note: 'Cloud Run IAM establishes transport identity. It does not prove application-role semantics.',
  },
  applicationProvenance: {
    receiptDigest: cloud.receiptDigest,
    correlationId: cloud.correlationId,
    note: 'Interlock decision and receipt. Distinct from transport provenance.',
  },
  runtimeProvenance: {
    runtimeSourceSha: bindings.bindings.evidencePublicationSha === undefined ? undefined : cloud.commitSha,
    runtimeSourceUrl: { state: bindings.deliberatelyUnbound.runtimeSourceUrl.state, reason: bindings.deliberatelyUnbound.runtimeSourceUrl.reason },
    runtimeSourceSnapshotSha256: snapshot.runtimeSourceSnapshotSha256,
    snapshotFileCount: snapshot.fileCount,
    revisionName: logEntry.resource.labels.revision_name,
    revisionNote: 'The only deployment revision the frozen record names. Agent and target revision names are not evidenced and are not shown.',
  },
  negativeControls: [
    { id: 'forged-header', label: 'Forged identity header', status: cloud.controls.forgedHeaderStatus },
    { id: 'invalid-token', label: 'Invalid bearer token', status: cloud.controls.wrongAudienceStatus,
      note: 'The frozen field is named wrongAudienceStatus; the control sent an invalid token. Genuine wrong-audience rejection is controlled local parity, not a cloud result.' },
    { id: 'direct-bypass', label: 'Direct target bypass without receipt', status: cloud.controls.directBypassStatus },
  ],
  negativeControlsNote: 'Three recorded refusals. Not a security claim.',
  teardown: { status: 'completed', source: 'experiments/hac-340/evidence/teardown.json (private)', packetField: cloud.teardown },
  publicationRefs: {
    evidencePublicationSha: bindings.bindings.evidencePublicationSha,
    publicationBindingsSha: '9da4cb95b6eec6030fe0c622b67a319eeaf20230',
    publicPacketSha256: redaction.publicPacketSha256,
    sourcePacketSha256: redaction.sourcePacketSha256,
    sourcePacketPublished: false,
    sourcePacketNote: 'Private commitment. The source bytes are deliberately unpublished and this digest is not reader-recomputable.',
    cloudEvidenceUrl: bindings.bindings.cloudEvidenceUrl,
    hac340VerifierUrl: bindings.bindings.hac340VerifierUrl,
    redactionManifestUrl: bindings.bindings.redactionManifestUrl,
    runtimeSourceSnapshotUrl: bindings.bindings.runtimeSourceSnapshotUrl,
    redactionReviewStatus: bindings.bindings.redactionReviewStatus,
  },
  notOnPath: ['Agent Runtime', 'Agent Gateway', 'CONTENT_AUTHZ'],
  claimBoundary: {
    proves: [
      'One recorded Gemini + Google ADK + Cloud Run traversal through Interlock.',
      'A receipt-bound protected mutation, independently read back, correlated in Cloud Logging.',
      'Three recorded fail-closed refusals.',
    ],
    notClaimed: [
      'does not reproduce the HAC-330 counterfactual in Google Cloud',
      'Agent Runtime, Agent Gateway and CONTENT_AUTHZ are not on the recorded path',
      'internal Interlock roles are not Google-managed identities',
      'wrong-audience rejection is controlled local parity, not a cloud result',
      'ALLOW is not VERIFIED; OBSERVED is not SAFE; a receipt is not exactly-once',
      'three controls are not comprehensive attack coverage',
      'not production readiness, fleet scale, or a recovery guarantee',
    ],
  },
  intentionallyAbsent: ['arms', 'environmentEvidence', 'constraints', 'checks', 'outcome'],
};

cloudRun.rawProof = {
  source: 'experiments/hac-342/evidence/cloud-run.public.json',
  json: rawJson(cloud),
  html: await highlightJson(cloud),
};

/* --- reserved surface: HAC-319 ----------------------------------------- */

/**
 * HAC-343 froze a bounded four-arm result, and this shell had to narrow.
 *
 * It previously withheld `SPR` — while the comparison panel beside it now
 * renders SPR from HAC-343's frozen export. A surface that says a metric is
 * withheld next to a panel showing that metric is not being careful, it is
 * being wrong. What is still genuinely unbound is HAC-319 *proper*: the
 * three-regime anti-global-mutex evaluation with precision and recall over a
 * population this corpus does not sample.
 */
const reserved = {
  semanticStateId: 'evaluation.unbound',
  label: 'Anti-global-mutex evaluation',
  sourceIssue: 'HAC-319',
  degradedState: 'evaluation-not-yet-bound',
  message: 'Three-regime evaluation not yet bound.',
  regimes: ['Regime 1', 'Regime 2', 'Regime 3'],
  metricsWithheld: ['precision', 'recall', 'fleet-scale behaviour'],
  boundElsewhere: 'HAC-343 binds a bounded four-arm comparison, including SPR, over its own sixteen-scenario corpus. It is a child of HAC-319, not a substitute: it samples no population and reports no precision or recall.',
  rule: 'Labels only. No value, no mark, no proportional geometry until HAC-319 supplies a frozen three-regime evaluation packet.',
};

/* --- coordination-strategy comparison: bound to HAC-343 ---------------- */

/**
 * A different experiment from the run this cockpit shows. Bound here rather
 * than transcribed, and left visibly unbound when the packet is absent.
 */
const hac343 = Object.fromEntries(
  [
    'experiments/hac-343/evidence/results.json',
    'experiments/hac-343/evidence/execution-semantics.json',
    'experiments/hac-343/evidence/metric-definitions.json',
    'experiments/hac-343/evidence/judge-export.json',
  ]
    .map((rel) => [rel, readOptional(...rel.split('/'))])
    .filter(([, value]) => value !== undefined),
);
const comparison = buildComparison(hac343);

/* --- the guided inspection layer -------------------------------------- */

/**
 * Declared here so the routing contract has one home. The copy lives with the
 * derivation in `lib/guide.mjs`; what the view model owns is the *vocabulary* —
 * which addresses exist, so an address that is not one of them can be refused.
 */
const guide = {
  proofClass: 'A',
  states: GUIDE_STATES,
  choiceState: GUIDE_CHOICE_STATE,
  freeState: GUIDE_FREE_STATE,
  steps: GUIDE_STEPS.map((s) => ({ no: s.no, stateId: s.stateId, name: s.name })),
  classification: 'EDITORIAL — an attention layer over the recorded run; it adds no arm, value or claim',
  rule: 'Guided steps change emphasis only. Every control the free cockpit offers stays reachable at every step, and no step recomputes anything.',
};

const model = {
  contract: 'HAC-341 normalized cockpit view model',
  revision: 'r02',
  generatedFrom: [
    'experiments/hac-330/evidence/arms.json',
    'experiments/hac-330/evidence/results.json',
    'experiments/hac-342/evidence/cloud-run.public.json',
    'experiments/hac-342/evidence/publication-bindings.json',
    'experiments/hac-342/evidence/redaction-manifest.json',
    'experiments/hac-342/evidence/runtime-source-snapshot.json',
    ...comparison.artifacts.filter((a) => a in hac343),
  ],
  fieldClassification: {
    universalRequired: ['runIdentity', 'proofClass', 'proofLabel', 'frozen', 'editorial', 'claimBoundary'],
    proofClassSpecific: ['arms', 'environmentEvidence', 'constraints', 'checks', 'receipt', 'effect', 'observation', 'negativeControls', 'runtimeProvenance', 'transportProvenance', 'applicationProvenance', 'notOnPath'],
    optional: ['actors', 'events', 'decision', 'rawProof'],
    publicationSpecific: ['publicationRefs'],
    derivedPresentation: ['proofSlug', 'semanticStateId', 'defaultArm', 'truncated digest display', 'rawProof syntax highlighting'],
    intentionallyAbsent: 'declared per run; a key is omitted rather than set to null',
  },
  deepLink: {
    shape: '?run=<runId>&proof=<class>&state=<semanticStateId>[&event=<eventId>]',
    runIds: ['hac330-local', 'hac340-cloud'],
    proofClasses: ['local', 'cloud'],
    aliases: { 'run.local.overview': 'run.local.treatment' },
    // The guided layer is addressable on its own axis: `state` still names the
    // recorded arm, and `guide` names which beat of the walk is emphasised. An
    // unknown value on either axis is refused rather than corrected.
    guideParam: 'guide',
    guideStates: GUIDE_STATES,
    guideDefault: GUIDE_CHOICE_STATE,
    guideProofClass: 'local',
    unknownGuideState: 'run.missing',
    guideUnderWrongProofClass: 'run.missing',
    invalidRun: 'run.missing',
    unreadableEvidence: 'run.unavailable',
    mismatchedProofAndState: 'run.missing',
    silentSubstitution: 'forbidden',
  },
  runs: { local, cloud: cloudRun },
  guide,
  comparison,
  reserved,
  degradedStates: [
    { id: 'run.loading', message: 'Loading frozen evidence.', forbiddenInference: 'that a run exists or passed' },
    { id: 'run.unavailable', message: 'Frozen evidence unavailable.', forbiddenInference: 'absence as success' },
    { id: 'run.missing', message: 'Run unavailable.', forbiddenInference: 'that the canonical run is what was asked for' },
    { id: 'run.cloud.partial', message: 'Partial evidence. The missing group is withheld rather than shown as passing.', forbiddenInference: 'that the missing group passed' },
    { id: 'run.evidence.invalid-link', message: 'Invalid evidence link.', forbiddenInference: 'that unverified is verified' },
    { id: 'pending-binding', message: 'Pending binding.', forbiddenInference: 'that the action would resolve' },
    { id: 'evaluation.unbound', message: 'Evaluation not yet bound.', forbiddenInference: 'any metric' },
    { id: 'run.error', message: 'Could not read the pinned record.', forbiddenInference: 'any result' },
  ],
  judgeModeRule: 'Judge mode never falls back to placeholder or design data. Absence is absence, not success.',
};

mkdirSync(join(repoRoot, 'media', 'hac-341', 'evidence'), { recursive: true });
writeFileSync(join(repoRoot, 'media', 'hac-341', 'evidence', 'view-model.json'), JSON.stringify(model, null, 2) + '\n');
process.stdout.write(
  `cockpit view model built\n  local  arms ${local.arms.length}, checks ${local.checks.label}, receipt ${local.receipt ? 'PRESENT' : 'absent'}\n`
  + `  cloud  hops ${cloudRun.events.length}, controls ${cloudRun.negativeControls.map((c) => c.status).join('/')}, arms ${cloudRun.arms ? 'PRESENT' : 'absent'}\n`
  + `  guide  ${guide.steps.length} steps, ${guide.states.length} addressable states\n`
  + `  compare HAC-343 ${comparison.resolved ? 'bound' : `UNBOUND (${comparison.unresolved.length} bindings)`}, ${comparison.strategies.length} strategies x ${comparison.dimensions.length} dimensions\n`,
);
