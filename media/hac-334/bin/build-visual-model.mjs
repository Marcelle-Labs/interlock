#!/usr/bin/env node
/**
 * Derives the HAC-334 visual model from frozen evidence.
 *
 * The failure this file exists to prevent is a visual suite that agrees with
 * the evidence on the day it is drawn and drifts afterwards. Nine masters carry
 * roughly forty numbers between them — 140, 130, 120, 24/24, alpha=45,
 * 403/401/403, six digests — and every one of them is read here rather than
 * typed. Change the frozen record and the boards change with it; change a board
 * by hand and `verify-visuals.mjs` refuses it.
 *
 * The model is deliberately geometry-free. It says what is true and which
 * frozen artifact says so; `render-masters.mjs` decides where that goes on the
 * board. A fact therefore has exactly one home, and the SVG, PDF, PNG, README,
 * Devpost and five-second derivatives cannot disagree about it.
 *
 * Sources, all public and main-resident. The private HAC-340 packet is never
 * read: `experiments/hac-342/**` is its redacted derivative and the only one a
 * judge can check.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));

const SOURCES = [
  ['media', 'hac-341', 'evidence', 'view-model.json'],
  ['media', 'hac-333', 'scene-manifest.json'],
  ['experiments', 'hac-330', 'evidence', 'arms.json'],
  ['experiments', 'hac-330', 'evidence', 'results.json'],
  ['experiments', 'hac-342', 'evidence', 'cloud-run.public.json'],
  ['experiments', 'hac-342', 'evidence', 'publication-bindings.json'],
];

const viewModel = read(...SOURCES[0]);
const storyboard = read(...SOURCES[1]);
const arms = read(...SOURCES[2]);
const results = read(...SOURCES[3]);
const packet = read(...SOURCES[4]);
const bindings = read(...SOURCES[5]);

const local = viewModel.runs.local;
const cloud = viewModel.runs.cloud;

/* -- class A: read the arms, never the prose ----------------------------- */

const armOf = (id) => local.arms.find((a) => a.armId === id);
const baseline = armOf('baseline');
const treatment = armOf('treatment');
const perturbed = armOf('perturbed');

// `24/24` is not a literal anywhere in the HAC-330 packet; it is a count over
// the frozen check list. Recomputing keeps the label honest if a check is ever
// added, removed or starts failing.
const checksPassed = results.checks.filter((c) => c.passed === true).length;
const checksTotal = results.checks.length;
const checksLabel = `${checksPassed}/${checksTotal}`;

const jointBound = local.constraints.find((c) => c.id === 'joint-bound');

/* -- class B: read the published packet ---------------------------------- */

const eventsByRole = Object.fromEntries(cloud.events.map((e) => [e.role, e]));
const observedAlpha = `alpha=${packet.observation.state.services.alpha}`;

// Only the proxy revision survives into evidence. `20-cloud-run.mjs` recorded
// observedConfiguration as service URLs, so the agent and target revision names
// exist in no frozen artifact and appear on no factual surface.
const evidencedRevision = cloud.runtimeProvenance.revisionName;

/* -- the export matrix ---------------------------------------------------- *
 * The one hand-transcribed table in this file, taken from the design bundle's
 * architecture/visual-manifest.json `exportVariants` (per asset) and
 * `exportMatrix.formats`. The bundle is external intake and is not committed,
 * so the matrix is recorded here and everything downstream derives from the
 * generated model rather than from the bundle.
 *
 * Read `png1920`/`png2400` as the manifest's "png 1920x1080" / "png 2400x1350",
 * `readme` as "readme 1280 wide", `devpost` as "devpost 1200x675". The static /
 * reduced-motion equivalent is the master itself and so is not a separate file.
 */
const FORMATS = {
  svg: { ext: 'svg' },
  pdf: { ext: 'pdf', width: 1920, height: 1080 },
  png1920: { ext: 'png', width: 1920, height: 1080 },
  png2400: { ext: 'png', width: 2400, height: 1350 },
  readme: { ext: 'png', width: 1280, height: 720 },
  devpost: { ext: 'png', width: 1200, height: 675 },
};

/** Assets, in board order. Facts come from the frozen sources below, not here. */
const ASSETS = [
  {
    id: 'IL-PROOF-010',
    slug: 'causal-counterfactual',
    assetName: 'Controlled causal counterfactual',
    board: 'V1',
    proofClass: 'A',
    formats: ['svg', 'png1920', 'png2400', 'pdf', 'readme', 'devpost'],
    brief: { slug: 'causal-counterfactual-brief', formats: ['svg', 'png1920'] },
    semanticStates: ['run.local.baseline', 'run.local.treatment'],
  },
  {
    id: 'IL-PROOF-011',
    slug: 'evidence-load-bearing',
    assetName: 'Perturbation / evidence load-bearing',
    board: 'V2',
    proofClass: 'A',
    formats: ['svg', 'png1920', 'png2400', 'pdf', 'readme', 'devpost'],
    semanticStates: ['run.local.treatment', 'run.local.perturbed'],
  },
  {
    id: 'IL-DIAG-010',
    slug: 'conceptual-causal-architecture',
    assetName: 'Conceptual causal architecture',
    board: 'V3',
    proofClass: 'none',
    formats: ['svg', 'png1920', 'png2400', 'pdf', 'readme'],
    semanticStates: ['run.local.intents', 'run.local.coupled'],
  },
  {
    id: 'IL-DIAG-011',
    slug: 'cloud-participation',
    assetName: 'Real Google Cloud participation',
    board: 'V4',
    proofClass: 'B',
    formats: ['svg', 'png1920', 'png2400', 'pdf', 'readme', 'devpost'],
    brief: { slug: 'cloud-participation-brief', formats: ['svg', 'png1920'] },
    semanticStates: ['run.cloud.overview'],
  },
  {
    id: 'IL-DIAG-012',
    slug: 'deployment-trust-boundaries',
    assetName: 'Exact deployment and trust boundaries',
    board: 'V5',
    proofClass: 'B',
    formats: ['svg', 'png1920', 'png2400', 'pdf', 'devpost'],
    brief: { slug: 'deployment-trust-boundaries-brief', formats: ['svg', 'png1920'] },
    semanticStates: ['run.cloud.overview'],
  },
  {
    id: 'IL-PROOF-012',
    slug: 'receipt-effect-observation',
    assetName: 'Receipt, effect, observation',
    board: 'V6',
    proofClass: 'B',
    formats: ['svg', 'png1920', 'pdf', 'readme', 'devpost'],
    semanticStates: ['run.cloud.overview'],
  },
  {
    id: 'IL-PROOF-013',
    slug: 'fail-closed-controls',
    assetName: 'Fail-closed / anti-bypass panel',
    board: 'V7',
    proofClass: 'B',
    formats: ['svg', 'png1920', 'pdf', 'readme', 'devpost'],
    semanticStates: ['run.cloud.overview'],
  },
  {
    id: 'IL-PROOF-014',
    slug: 'claim-boundary',
    assetName: 'Claim boundary',
    board: 'V8',
    proofClass: 'A+B',
    formats: ['svg', 'png1920', 'pdf', 'readme', 'devpost'],
    semanticStates: ['run.claim-boundary'],
  },
  {
    id: 'IL-DIAG-013',
    slug: 'evaluation-shell',
    assetName: 'HAC-319 anti-global-mutex evaluation shell',
    board: 'V9',
    proofClass: 'none',
    proofClassLabel: 'DESIGN SHELL - AWAITING HAC-319',
    // Editable master only while unbound. A distributable raster of an empty
    // shell is a picture of a comparison that has not been made.
    formats: ['svg'],
    semanticStates: ['evaluation.unbound'],
  },
];

const PROOF_CLASS_LABEL = {
  A: local.proofLabel,
  B: cloud.proofLabel,
  'A+B': `${local.proofLabel} and ${cloud.proofLabel}, labelled separately`,
  none: 'CONCEPTUAL',
};

/** Run identity for the filename suffix, from the view model's run identities. */
const RUN_OF = { A: local.runIdentity, B: cloud.runIdentity };

/* -- compositions: what each board asserts, and on whose authority --------- */

const fact = (value, source) => ({ value, source });

const compositions = {
  'IL-PROOF-010': {
    intents: local.actors.filter((a) => a.role === 'intent').map((a) => ({
      label: a.label,
      state: a.state,
    })),
    environment: local.actors.find((a) => a.role === 'environment'),
    constraint: fact(jointBound.expression, 'experiments/hac-330/evidence/arms.json'),
    bound: fact(jointBound.bound, 'experiments/hac-330/evidence/arms.json'),
    arms: [baseline, treatment].map((a) => ({
      armId: a.armId,
      label: a.label,
      semanticStateId: a.semanticStateId,
      interlock: a.interlock,
      ...(a.decision ? { decision: a.decision } : {}),
      expression: a.outcome.expression,
      holds: a.outcome.holds,
      verdict: a.outcome.verdict,
    })),
    checks: fact(checksLabel, 'experiments/hac-330/evidence/results.json'),
  },

  'IL-PROOF-011': {
    comparison: [treatment, perturbed].map((a) => ({
      armId: a.armId,
      label: a.label,
      semanticStateId: a.semanticStateId,
      decision: a.decision,
      decisionReason: a.decisionReason,
      basisRevision: a.basisRevision,
      expression: a.outcome.expression,
      holds: a.outcome.holds,
      verdict: a.outcome.verdict,
    })),
    proposition: 'The evidence is load-bearing.',
    // The perturbation is a recorded arm, not a re-run. Nothing recomputes.
    selectionNote: 'Each arm is a recorded result. Nothing is executed to produce this comparison.',
  },

  'IL-DIAG-010': {
    conceptual: true,
    intents: local.actors.filter((a) => a.role === 'intent').map((a) => a.label),
    environment: local.actors.find((a) => a.role === 'environment').label,
    boundary: 'Interlock coordination boundary',
    outcome: 'Controlled shared-state action',
    constraint: fact(jointBound.expression, 'experiments/hac-330/evidence/arms.json'),
    note: 'Mechanism only. No deployment topology is asserted on this board.',
  },

  'IL-DIAG-011': {
    path: cloud.events.map((e) => ({ n: e.n, label: e.label, role: e.role })),
    observed: fact(observedAlpha, 'experiments/hac-342/evidence/cloud-run.public.json'),
    correlationId: fact(cloud.applicationProvenance.correlationId, 'experiments/hac-342/evidence/cloud-run.public.json'),
    runtimeSourceSha: fact(cloud.runtimeProvenance.runtimeSourceSha, 'experiments/hac-342/evidence/runtime-source-snapshot.json'),
    notOnPath: cloud.notOnPath,
  },

  'IL-DIAG-012': {
    // The identity boundary this board exists to draw: two provenance
    // vocabularies that must not collapse into one another.
    layers: [
      { zone: 'MODEL / ACCESS', nodes: [eventsByRole.model.label, eventsByRole['model-access'].label] },
      { zone: 'AGENT FRAMEWORK', nodes: [eventsByRole.framework.label] },
      { zone: 'CLOUD HOST', nodes: [eventsByRole.host.label] },
      { zone: 'INTERLOCK APPLICATION BOUNDARY', nodes: [eventsByRole.control.label] },
      { zone: 'DECISION / RECEIPT', nodes: [eventsByRole.decision.label] },
      { zone: 'PROTECTED TARGET', nodes: [eventsByRole.effect.label] },
      { zone: 'INDEPENDENT OBSERVATION', nodes: [eventsByRole.observation.label] },
      { zone: 'CLOUD LOGGING / CORRELATION', nodes: [eventsByRole.correlation.label] },
    ],
    transportProvenance: {
      identitySource: cloud.transportProvenance.identitySource,
      note: cloud.transportProvenance.note,
      boundary: 'dashed',
    },
    applicationProvenance: {
      receiptDigest: cloud.applicationProvenance.receiptDigest,
      correlationId: cloud.applicationProvenance.correlationId,
      note: cloud.applicationProvenance.note,
      boundary: 'solid',
    },
    separationRule:
      'Cloud Run IAM establishes transport provenance. It does not establish Google-managed proposer, reviewer or authorizer roles inside Interlock.',
    evidencedRevision: fact(evidencedRevision, 'experiments/hac-342/evidence/cloud-run.public.json'),
    revisionNote: cloud.runtimeProvenance.revisionNote,
    notOnPath: cloud.notOnPath,
  },

  'IL-PROOF-012': {
    // Three stages that never collapse. ALLOW is a decision, EXECUTED is an
    // effect, OBSERVED is an independent read-back.
    stages: [
      {
        stage: 'DECISION',
        value: cloud.decision.value,
        detail: `authorization receipt ${cloud.receipt.truncated}`,
        note: cloud.decision.note,
      },
      {
        stage: 'EFFECT',
        value: cloud.effect.status,
        detail: 'protected target mutation',
        note: cloud.effect.note,
      },
      {
        stage: 'OBSERVATION',
        value: cloud.observation.status,
        detail: `${cloud.observation.caption} · ${cloud.observation.observed}`,
        note: cloud.observation.note,
      },
    ],
    receiptDigest: fact(cloud.receipt.digest, 'experiments/hac-342/evidence/cloud-run.public.json'),
    correlationId: fact(cloud.applicationProvenance.correlationId, 'experiments/hac-342/evidence/cloud-run.public.json'),
    // Named as absent rather than drawn. HAC-317 owns these and none of them is
    // in the HAC-340 record; filling them from a roadmap would invent evidence.
    absentStates: ['AUTHORIZED', 'JOINT REVIEW', 'ACCEPTED', 'FAILED'],
    absentStatesNote: 'Not present in this run. The recorded chain is ALLOW plus receipt, EXECUTED, OBSERVED.',
  },

  'IL-PROOF-013': {
    cloudControls: cloud.negativeControls.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
    })),
    cloudControlsNote: cloud.negativeControlsNote,
    // Kept in a visibly separate region. The frozen field is named
    // wrongAudienceStatus but the cloud control sent an invalid token; genuine
    // wrong-audience rejection is local parity and is not a cloud result.
    localParity: {
      heading: 'CONTROLLED LOCAL PARITY — NOT A CLOUD RESULT',
      note: cloud.negativeControls.find((c) => c.id === 'invalid-token').note,
    },
  },

  'IL-PROOF-014': {
    regions: [
      {
        heading: local.proofLabel,
        sourceIssue: local.sourceIssue,
        supports: local.claimBoundary.proves,
      },
      {
        heading: cloud.proofLabel,
        sourceIssue: cloud.sourceIssue,
        supports: cloud.claimBoundary.proves,
      },
      {
        heading: 'NOT CLAIMED',
        sourceIssue: null,
        // `globalNonClaims` is HAC-333's frozen, curated, judge-facing list and
        // is the spine of this region. Concatenating all three lists instead
        // yields 23 entries, several of them near-duplicates, which is how a
        // claim boundary turns into fine print nobody reads. The per-run
        // non-claims stay visible on their own boards' rails; only entries
        // adding a proposition the global list does not already carry are
        // promoted here, selected by match rather than retyped.
        supports: [
          ...storyboard.globalNonClaims,
          ...cloud.claimBoundary.notClaimed.filter((c) => /Google-managed/.test(c)),
        ],
      },
    ],
  },

  'IL-DIAG-013': {
    state: viewModel.reserved.degradedState,
    message: viewModel.reserved.message,
    regimes: viewModel.reserved.regimes,
    metricsWithheld: viewModel.reserved.metricsWithheld,
    rule: viewModel.reserved.rule,
    // No plotted mark of any kind. A bar, dot or proportional area would state a
    // comparison that has not been run.
    marks: [],
  },
};

/* -- assemble ------------------------------------------------------------- */

const assets = ASSETS.map((a) => {
  const runIdentity = RUN_OF[a.proofClass] ?? null;
  const exportsFor = (slug, formats, presentationRole) =>
    formats.map((f) => {
      const spec = FORMATS[f];
      return {
        format: f,
        ext: spec.ext,
        ...(spec.width ? { width: spec.width, height: spec.height } : {}),
        slug,
        ...(presentationRole ? { presentationRole } : {}),
      };
    });

  return {
    id: a.id,
    slug: a.slug,
    assetName: a.assetName,
    board: a.board,
    proofClass: a.proofClass,
    proofClassLabel: a.proofClassLabel ?? PROOF_CLASS_LABEL[a.proofClass],
    ...(runIdentity ? { run: runIdentity } : {}),
    // IL-PROOF-014 spans two runs, so no single run identity is correct for it
    // and the filename carries none. Recorded rather than silently dropped.
    ...(a.proofClass === 'A+B'
      ? { runs: [local.runIdentity, cloud.runIdentity], runNote: 'Two runs, labelled separately. No single run identity applies, so no run suffix is written.' }
      : {}),
    semanticStates: a.semanticStates,
    composition: compositions[a.id],
    exports: [
      ...exportsFor(a.slug, a.formats),
      ...(a.brief ? exportsFor(a.brief.slug, a.brief.formats, '5s') : []),
    ],
  };
});

const model = {
  contract: 'HAC-334 canonical proof visual model',
  revision: 'r01',
  issue: 'HAC-334',
  generatedFrom: SOURCES.map((s) => s.join('/')),
  generator: 'media/hac-334/bin/build-visual-model.mjs',
  idBand: {
    owned: ['IL-DIAG-010', 'IL-DIAG-011', 'IL-DIAG-012', 'IL-DIAG-013',
      'IL-PROOF-010', 'IL-PROOF-011', 'IL-PROOF-012', 'IL-PROOF-013', 'IL-PROOF-014'],
    reusedFromHac342: ['IL-DIAG-002', 'IL-DIAG-003', 'IL-PROOF-001', 'IL-PROOF-002', 'IL-PROOF-003', 'IL-PROOF-005'],
    rule: 'The HAC-342 band is reused, never renumbered and never redrawn. No derivative is promoted into a master id.',
  },
  proofClasses: {
    A: { label: local.proofLabel, sourceIssue: local.sourceIssue, runIdentity: local.runIdentity, theme: 'paper' },
    B: { label: cloud.proofLabel, sourceIssue: cloud.sourceIssue, runIdentity: cloud.runIdentity, theme: 'ink' },
  },
  proofSeparation:
    'Class A and class B never share a run identity, a timeline, a revision, a receipt or runtime provenance on any surface. No board renders them as one chain.',
  publicEvidence: {
    evidencePublicationSha: cloud.publicationRefs.evidencePublicationSha,
    publicPacketSha256: cloud.publicationRefs.publicPacketSha256,
    sourcePacketSha256: cloud.publicationRefs.sourcePacketSha256,
    sourcePacketPublished: cloud.publicationRefs.sourcePacketPublished,
    runtimeSourceSha: cloud.runtimeProvenance.runtimeSourceSha,
    runtimeSourceUrl: cloud.runtimeProvenance.runtimeSourceUrl,
    runtimeSourceSnapshotSha256: cloud.runtimeProvenance.runtimeSourceSnapshotSha256,
    cloudEvidenceUrl: cloud.publicationRefs.cloudEvidenceUrl,
    hac340VerifierUrl: cloud.publicationRefs.hac340VerifierUrl,
    redactionManifestUrl: cloud.publicationRefs.redactionManifestUrl,
    hac330VerifyCommand: local.verification.hac330VerifyCommand,
  },
  assets,
  contractDiscrepancies: [
    {
      id: 'five-second-variant-has-no-filename-token',
      severity: 'recorded',
      statement:
        'The HAC-334 visual manifest requests a five-second presentation role. The frozen HAC-332 filename grammar accepts only light, dark, mono and static as variants, none of which denotes a simplified composition.',
      resolution:
        'HAC-332 was not modified. The five-second boards are separate compositions carrying their own conformant kebab slug, and the purpose is recorded as presentationRole "5s" in this model and in the asset registry.',
      authority: 'HAC-332 owns the filename grammar. A later amendment, if wanted, is a HAC-332 change and not a HAC-334 one.',
    },
    {
      id: 'builder-parser-family-asymmetry',
      severity: 'recorded',
      statement:
        'buildExportName validates a registry id against a shape regex that accepts any three-to-five uppercase letters, while validateExportName checks membership in FAMILIES. A name such as IL-BOARD-010 builds and then fails to parse.',
      resolution:
        'Ported faithfully rather than repaired. Every export path round-trips its own output through validateExportName, so the asymmetry cannot produce a shipped file.',
      authority: 'HAC-332',
    },
    {
      id: 'design-bundle-names-three-deployment-revisions',
      severity: 'corrected',
      statement:
        'The design bundle renders three Cloud Run revision names and binds "three deployed revisions". The frozen record names only the proxy revision; the agent and target names appear in no evidence artifact and in no git history.',
      resolution: `Only ${evidencedRevision} appears on any board. The binding reads as one evidenced revision.`,
      authority: 'experiments/hac-342/evidence/redaction-manifest.json sourceDiscrepancies',
    },
    {
      id: 'design-system-observer-note-overstates-authority',
      severity: 'corrected',
      statement:
        'The HAC-332 OBSERVED state carries the note "Independently witnessed by a party that cannot authorize", which the frozen packet does not establish, and the shipped HAC-342 deck asserts the same in prose.',
      resolution:
        'No board imports that note. The observation is captioned with the frozen language, independently authenticated read-back, and the gate fails on authority-strengthening copy.',
      authority: 'media/hac-341/evidence/view-model.json runs.cloud.observation.caption',
    },
  ],
};

/* -- asset registry ------------------------------------------------------- *
 * HAC-332's rule is that the filename prefix *is* the registry id and an export
 * whose prefix has no row is invalid. The rows are generated from the same
 * model the boards are drawn from, so the registry cannot describe an asset the
 * suite does not contain, or miss one it does.
 */
const JUDGE_QUESTION = {
  'IL-PROOF-010': 'What changed because Interlock existed?',
  'IL-PROOF-011': 'Is the evidence load-bearing, or incidental?',
  'IL-DIAG-010': 'Where does Interlock intervene?',
  'IL-DIAG-011': 'Did this actually traverse Google infrastructure?',
  'IL-DIAG-012': 'What exactly was deployed, and where are the trust boundaries?',
  'IL-PROOF-012': 'What was decided, what happened, and who checked?',
  'IL-PROOF-013': 'What happens when the path is attacked?',
  'IL-PROOF-014': 'What is claimed, and what is not?',
  'IL-DIAG-013': 'How will the evaluation be reported when it exists?',
};

const registry = {
  contract: 'HAC-334 asset registry',
  revision: 'r01',
  issue: 'HAC-334',
  generator: 'media/hac-334/bin/build-visual-model.mjs',
  namingAuthority: 'HAC-332, ported to scripts/export-naming.mjs',
  note: 'Rows for the HAC-334 band only. The HAC-342 band is reused, not re-registered here.',
  assets: assets.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.assetName,
    judgeQuestion: JUDGE_QUESTION[a.id],
    classification: a.proofClass === 'none' ? 'specimen' : 'evidence-bound',
    proofClass: a.proofClass,
    proofClassLabel: a.proofClassLabel,
    ...(a.run ? { run: a.run } : {}),
    ...(a.runs ? { runs: a.runs, runNote: a.runNote } : {}),
    sourceEvidence: model.generatedFrom,
    formats: [...new Set(a.exports.map((e) => e.ext))],
    dimensions: [...new Set(a.exports.filter((e) => e.width).map((e) => `${e.width}x${e.height}`))],
    presentationRoles: [...new Set(a.exports.map((e) => e.presentationRole).filter(Boolean))],
    // The master is already static; there is no motion to reduce.
    reducedMotionEquivalent: 'the master itself',
    status: a.id === 'IL-DIAG-013' ? 'AWAITING HAC-319' : 'EVIDENCE BOUND',
    exports: a.exports.map((e) => ({
      format: e.format, ext: e.ext, slug: e.slug,
      ...(e.width ? { width: e.width, height: e.height } : {}),
      ...(e.presentationRole ? { presentationRole: e.presentationRole } : {}),
    })),
  })),
};

const outDir = join(repoRoot, 'media', 'hac-334', 'evidence');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'visual-model.json'), `${JSON.stringify(model, null, 2)}\n`);
writeFileSync(join(outDir, 'asset-registry.json'), `${JSON.stringify(registry, null, 2)}\n`);

process.stdout.write(
  'HAC-334 visual model built\n'
  + `  ${assets.length} assets, ${assets.reduce((n, a) => n + a.exports.length, 0)} declared exports\n`
  + `  class A ${local.runIdentity}: checks ${checksLabel}, bound ${jointBound.bound}\n`
  + `  class B ${cloud.runIdentity}: ${cloud.events.length} hops, ${observedAlpha}, controls ${cloud.negativeControls.map((c) => c.status).join('/')}\n`,
);
