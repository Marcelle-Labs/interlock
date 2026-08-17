#!/usr/bin/env node
/**
 * HAC-335 — the final judge-facing asset registry.
 *
 * One registry, unambiguous authority. HAC-334 remains the *authoring*
 * authority for its visual masters; this registry records what the judge-facing
 * package **consumes** and what HAC-335 itself authored, and binds each row to
 * the evidence that supports it.
 *
 * Everything mechanical is derived rather than typed: dimensions come out of
 * the PNG header, digests off the bytes on disk, evidence SHAs out of the
 * frozen HAC-342 records, and canonical master ids out of HAC-334's own
 * registry. The only hand-authored fields are editorial — the judge question,
 * the supported claim and the target surface — and those are exactly the
 * fields a gate cannot infer.
 *
 *     node media/hac-335/bin/build-registry.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));

const hac334 = read('media/hac-334/evidence/asset-registry.json');
const captures = read('media/hac-335/evidence/capture-manifest.json');
const cards = read('media/hac-335/evidence/card-manifest.json');
const bindings = read('experiments/hac-342/evidence/publication-bindings.json');
const snapshot = read('experiments/hac-342/evidence/runtime-source-snapshot.json');
const storyboard = read('media/hac-333/scene-manifest.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Width and height straight out of the PNG header, never out of a filename. */
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG: bad signature');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Public evidence identity, read from the frozen records rather than restated.
 * `runtimeSourceUrl` is absent by construction — there is no value to carry, and
 * an empty string here would read as one.
 */
const EVIDENCE = {
  evidencePublicationSha: storyboard.publicEvidence.evidencePublicationSha,
  publicationBindingsSha: storyboard.publicEvidence.publicationBindingsSha,
  publicPacketSha256: storyboard.publicEvidence.publicPacketSha256,
  sourcePacketSha256: storyboard.publicEvidence.sourcePacketSha256,
  sourcePacketPublished: storyboard.publicEvidence.sourcePacketPublished,
  runtimeSourceSha: snapshot.runtimeSourceSha,
  runtimeSourceShaPublished: snapshot.runtimeSourceShaPublished,
  runtimeSourceSnapshotSha256: snapshot.runtimeSourceSnapshotSha256,
  runtimeSourceUrl: { state: 'unavailable / non-public', reason: snapshot.runtimeSourceShaWithheldBecause },
};

const IMMUTABLE = {
  cloudEvidence: `https://github.com/Marcelle-Labs/interlock/blob/${EVIDENCE.evidencePublicationSha}/experiments/hac-342/evidence/cloud-run.public.json`,
  cloudEvidenceRaw: `https://raw.githubusercontent.com/Marcelle-Labs/interlock/${EVIDENCE.evidencePublicationSha}/experiments/hac-342/evidence/cloud-run.public.json`,
  verifier: `https://github.com/Marcelle-Labs/interlock/blob/${EVIDENCE.evidencePublicationSha}/experiments/hac-342/bin/verify-public-packet.mjs`,
  redactionManifest: `https://github.com/Marcelle-Labs/interlock/blob/${EVIDENCE.evidencePublicationSha}/experiments/hac-342/evidence/redaction-manifest.json`,
  runtimeSourceSnapshot: `https://github.com/Marcelle-Labs/interlock/blob/${EVIDENCE.evidencePublicationSha}/experiments/hac-342/evidence/runtime-source-snapshot.json`,
  publicationBindings: `https://github.com/Marcelle-Labs/interlock/blob/${EVIDENCE.publicationBindingsSha}/experiments/hac-342/evidence/publication-bindings.json`,
};

const CLOUD_RUN = 'ilk-hac340-cloud-1786730369123';
const LOCAL_RUN = 'hac330-local';

/**
 * Editorial metadata for the consumed HAC-334 masters. The rows below say what
 * each asset is *for* in this package; the facts on the asset itself remain
 * HAC-334's.
 */
const CONSUMED = [
  {
    id: 'IL-PROOF-010',
    judgeQuestion: 'What changed because Interlock existed?',
    supportedClaim:
      'Two locally valid intents against a shared bound of 130: without Interlock 140 > 130, an invalid joint state; with Interlock the decision is WITHHOLD_SERIALIZE and the outcome 120 <= 130, with 24/24 checks.',
    claimIds: ['CL-003', 'CL-004', 'CL-005'],
    surfaces: {
      'readme-hero': '1280x720',
      'devpost-thumbnail': '1200x675',
      'devpost-screenshot': '1200x675',
      'video-5s': '1920x1080',
    },
  },
  {
    id: 'IL-PROOF-011',
    judgeQuestion: 'How do I know the evidence did the work?',
    supportedClaim:
      'With perturbed evidence the decision becomes ALLOW_PARALLEL and the joint outcome returns to 140 > 130. Both arms are recorded results, not a live re-run.',
    claimIds: ['CL-006', 'CL-007'],
    surfaces: { readme: '1280x720', 'devpost-screenshot': '1200x675' },
  },
  {
    id: 'IL-DIAG-011',
    judgeQuestion: 'What actually ran on Google Cloud?',
    supportedClaim:
      'One recorded traversal: gemini-3.5-flash through Google ADK 1.35.1 and Vertex AI, from a Cloud Run-hosted agent in us-central1, through the Interlock MCP proxy, to ALLOW + receipt, a protected mutation, an independently authenticated read-back observing alpha=45, and Cloud Logging correlated by run id.',
    claimIds: ['CL-010', 'CL-011', 'CL-012'],
    surfaces: { readme: '1280x720', 'devpost-screenshot': '1200x675' },
  },
  {
    id: 'IL-DIAG-012',
    judgeQuestion: 'Where does Google end and Interlock begin?',
    supportedClaim:
      'Cloud Run IAM establishes transport provenance; the Interlock decision and receipt are application provenance, and they do not collapse. interlock-hac340-proxy-00002-wzf is the only evidenced deployment revision. Agent Runtime, Agent Gateway and CONTENT_AUTHZ are absent from this deployment.',
    claimIds: ['CL-015', 'CL-016', 'CL-021'],
    surfaces: {
      'devpost-architecture-upload': '1920x1080',
      readme: '1920x1080',
      'devpost-screenshot': '1200x675',
    },
  },
  {
    id: 'IL-PROOF-012',
    judgeQuestion: 'Did the receipt actually govern the effect?',
    supportedClaim:
      'Receipt, protected effect and independent observation are recorded as three separate states. EXECUTED and OBSERVED do not collapse.',
    claimIds: ['CL-011', 'CL-012'],
    surfaces: { 'devpost-reserve': '1200x675' },
  },
  {
    id: 'IL-PROOF-013',
    judgeQuestion: 'What happens when the caller is wrong?',
    supportedClaim:
      'Three recorded fail-closed refusals: forged identity header 403, invalid bearer token 401, direct target bypass without receipt 403. Three controls, not comprehensive attack coverage.',
    claimIds: ['CL-013', 'CL-014'],
    surfaces: { readme: '1200x675', 'devpost-screenshot': '1200x675' },
  },
  {
    id: 'IL-PROOF-014',
    judgeQuestion: 'What is not being claimed?',
    supportedClaim:
      'The controlled local experiment and Google Cloud participation are stated separately, alongside an explicit not-claimed column. Neither proof class is evidence for the other.',
    claimIds: ['CL-009', 'CL-020', 'CL-023', 'CL-024'],
    surfaces: { readme: '1280x720', 'devpost-screenshot': '1200x675' },
  },
];

/** Editorial metadata for what HAC-335 authored. */
const AUTHORED_CARDS = {
  'IL-SCAF-010': {
    judgeQuestion: 'What is this?',
    supportedClaim:
      'Identity and thesis only. No evidence is asserted on this frame; both proof classes are named without either being claimed as the other.',
    claimIds: ['CL-001', 'CL-002'],
    surfaces: { 'video-title': '1920x1080' },
    derivedFrom: 'HAC-333 SB-00 editorialCopy',
  },
  'IL-SCAF-011': {
    judgeQuestion: 'What was proved, and what is not claimed?',
    supportedClaim:
      'Controlled causal proof (HAC-330), real Google Cloud participation (HAC-340) and immutable evidence (HAC-342) presented as three separate columns, with the claim boundary and the not-on-the-recorded-path strip.',
    claimIds: ['CL-009', 'CL-017', 'CL-021'],
    surfaces: { 'video-end': '1920x1080' },
    derivedFrom: 'HAC-333 SB-08 editorialCopy',
  },
  'IL-SOC-010': {
    judgeQuestion: 'What is this, in one card?',
    supportedClaim:
      'Without Interlock 140 > 130; with Interlock 120 <= 130. Attributed to the controlled local experiment HAC-330 on the card itself, so a shared link cannot read as a cloud result.',
    claimIds: ['CL-002', 'CL-003', 'CL-004', 'CL-027'],
    surfaces: { 'social-og': '1200x630' },
    derivedFrom: 'the same visual system as the judge-critical set; built only after it was frozen',
  },
};

const LICENSE =
  'Marcelle-Labs contest submission asset. Interlock identity and boards are original work created for this submission; Geist and Geist Mono are vendored under OFL-1.1 and are not redistributed inside raster exports.';

const rows = [];

/* -- consumed HAC-334 masters --------------------------------------------- */

for (const spec of CONSUMED) {
  const canonical = hac334.assets.find((a) => a.id === spec.id);
  if (!canonical) throw new Error(`${spec.id} is not a row in the HAC-334 registry`);

  const isCloud = canonical.proofClass === 'B';
  const run = canonical.run || null;

  const exports = [];
  for (const [surface, dims] of Object.entries(spec.surfaces)) {
    const [w, h] = dims.split('x').map(Number);
    const brief = surface === 'video-5s';
    const match = canonical.exports.find(
      (e) => e.width === w && e.height === h && e.ext === 'png'
        && Boolean(e.presentationRole === '5s') === brief,
    );
    if (!match) throw new Error(`${spec.id}: HAC-334 declares no ${dims} png export for ${surface}${brief ? ' (5s)' : ''}`);

    const slug = match.slug;
    const file = `media/hac-334/exports/${slug ? `${spec.id}-${slug}` : spec.id}-${dims}${run ? `-run${run.replace(/[^a-z0-9]/g, '')}` : ''}.png`;
    const abs = join(repoRoot, file);
    if (!existsSync(abs)) throw new Error(`${spec.id}: declared export is missing on disk: ${file}`);

    const buf = readFileSync(abs);
    const real = pngSize(buf);
    if (real.width !== w || real.height !== h) {
      throw new Error(`${file}: header says ${real.width}x${real.height}, registry says ${dims}`);
    }
    const named = validateExportName(file.split('/').pop());
    if (!named.valid) throw new Error(`${file}: ${named.error}`);

    exports.push({
      surface,
      file,
      width: real.width,
      height: real.height,
      sha256: sha256(buf),
      presentationRole: match.presentationRole || null,
    });
  }

  rows.push({
    assetId: spec.id,
    title: canonical.name,
    judgeQuestion: spec.judgeQuestion,
    proofClass: canonical.proofClass,
    proofClassLabel: canonical.proofClassLabel || null,
    sourceIssue: canonical.proofClass === 'A' ? 'HAC-330' : canonical.proofClass === 'B' ? 'HAC-340' : 'HAC-334',
    sourceRun: run,
    correlationId: isCloud ? CLOUD_RUN : null,
    supportedClaim: spec.supportedClaim,
    claimIds: spec.claimIds,
    canonicalMasterId: spec.id,
    canonicalMasterIssue: 'HAC-334',
    authoredBy: 'HAC-334',
    consumedBy: 'HAC-335',
    sourceFormat: 'svg',
    exportFormat: 'png',
    exports,
    semanticState: null,
    captureState: null,
    reducedMotionEquivalent: canonical.reducedMotionEquivalent || 'the master itself — a static board',
    provenanceType: 'deterministic',
    status: canonical.status,
    license: LICENSE,
    evidence: isCloud
      ? {
        evidencePublicationSha: EVIDENCE.evidencePublicationSha,
        publicationBindingsSha: EVIDENCE.publicationBindingsSha,
        publicPacketSha256: EVIDENCE.publicPacketSha256,
        sourcePacketSha256: EVIDENCE.sourcePacketSha256,
        sourcePacketPublished: EVIDENCE.sourcePacketPublished,
        runtimeSourceSha: EVIDENCE.runtimeSourceSha,
        runtimeSourceShaPublished: EVIDENCE.runtimeSourceShaPublished,
        runtimeSourceSnapshotSha256: EVIDENCE.runtimeSourceSnapshotSha256,
        runtimeSourceUrl: EVIDENCE.runtimeSourceUrl,
      }
      : { note: 'Class A is a controlled local experiment; it has no cloud publication identity.' },
    immutableEvidenceRefs: isCloud
      ? [IMMUTABLE.cloudEvidence, IMMUTABLE.verifier, IMMUTABLE.redactionManifest, IMMUTABLE.publicationBindings]
      : [],
  });
}

/* -- HAC-335 cockpit captures --------------------------------------------- */

for (const c of captures.captures) {
  const abs = join(repoRoot, c.file);
  if (!existsSync(abs)) throw new Error(`capture missing on disk: ${c.file}`);
  const buf = readFileSync(abs);
  const real = pngSize(buf);
  if (real.width !== c.width || real.height !== c.height) {
    throw new Error(`${c.file}: header says ${real.width}x${real.height}, manifest says ${c.width}x${c.height}`);
  }
  if (sha256(buf) !== c.sha256) throw new Error(`${c.file}: bytes differ from the capture manifest`);
  const named = validateExportName(c.file.split('/').pop());
  if (!named.valid) throw new Error(`${c.file}: ${named.error}`);

  const isCloud = c.proofClass === 'B';
  rows.push({
    assetId: c.assetId,
    title: `The Run — ${c.semanticState}${c.drawerPanel ? ` · ${c.drawerPanel}` : ''}`,
    judgeQuestion: c.judgeQuestion,
    proofClass: c.proofClass,
    proofClassLabel: c.proofClassLabel,
    sourceIssue: c.sourceIssue,
    sourceRun: c.run,
    correlationId: isCloud ? CLOUD_RUN : null,
    supportedClaim: c.supportedClaim,
    claimIds: ['CL-008'],
    canonicalMasterId: null,
    canonicalMasterIssue: null,
    authoredBy: 'HAC-335',
    capturedFrom: 'HAC-341 merged cockpit',
    capturedFromSha: captures.capturedFromSha,
    sourceUrl: c.sourceUrl,
    sourceFormat: 'live surface (html)',
    exportFormat: 'png',
    exports: [
      {
        surface: c.targetSurface.join('+'),
        file: c.file,
        width: real.width,
        height: real.height,
        sha256: c.sha256,
        cropAnchor: c.cropAnchor,
        cropRule: 'measured bounding box of the rendered content; unused canvas only',
      },
    ],
    semanticState: c.semanticState,
    captureState: `capture.${c.semanticState}`,
    reducedMotionEquivalent: 'the capture itself — taken with ?static=1, the reduced-motion resolution',
    provenanceType: 'screenshot',
    pixelIntegrity: 'unmodified cockpit pixels; cropped only, never retouched or recomposed',
    status: 'EVIDENCE BOUND',
    license: LICENSE,
    evidence: isCloud
      ? {
        evidencePublicationSha: EVIDENCE.evidencePublicationSha,
        publicationBindingsSha: EVIDENCE.publicationBindingsSha,
        publicPacketSha256: EVIDENCE.publicPacketSha256,
        sourcePacketSha256: EVIDENCE.sourcePacketSha256,
        sourcePacketPublished: EVIDENCE.sourcePacketPublished,
        runtimeSourceSha: EVIDENCE.runtimeSourceSha,
        runtimeSourceShaPublished: EVIDENCE.runtimeSourceShaPublished,
        runtimeSourceSnapshotSha256: EVIDENCE.runtimeSourceSnapshotSha256,
        runtimeSourceUrl: EVIDENCE.runtimeSourceUrl,
      }
      : { note: 'Class A is a controlled local experiment; it has no cloud publication identity.' },
    immutableEvidenceRefs: isCloud
      ? [IMMUTABLE.cloudEvidence, IMMUTABLE.verifier, IMMUTABLE.redactionManifest, IMMUTABLE.publicationBindings]
      : [],
  });
}

/* -- HAC-335 video cards --------------------------------------------------- */

for (const card of cards.cards) {
  const meta = AUTHORED_CARDS[card.assetId];
  if (!meta) throw new Error(`no editorial metadata for authored card ${card.assetId}`);
  const abs = join(repoRoot, card.export);
  const buf = readFileSync(abs);
  const real = pngSize(buf);
  if (sha256(buf) !== card.exportSha256) throw new Error(`${card.export}: bytes differ from the card manifest`);
  for (const n of [card.master, card.export]) {
    const named = validateExportName(n.split('/').pop());
    if (!named.valid) throw new Error(`${n}: ${named.error}`);
  }

  rows.push({
    assetId: card.assetId,
    title: { 'IL-SCAF-010': 'Video title card', 'IL-SCAF-011': 'Video end card', 'IL-SOC-010': 'Open-graph card' }[card.assetId],
    judgeQuestion: meta.judgeQuestion,
    proofClass: card.assetId === 'IL-SCAF-011' ? 'A+B' : card.assetId === 'IL-SOC-010' ? 'A' : 'none',
    proofClassLabel: null,
    sourceIssue: 'HAC-335',
    derivedFrom: meta.derivedFrom,
    sourceRun: null,
    correlationId: null,
    supportedClaim: meta.supportedClaim,
    claimIds: meta.claimIds,
    canonicalMasterId: card.assetId,
    canonicalMasterIssue: 'HAC-335',
    authoredBy: 'HAC-335',
    sourceFormat: 'svg',
    exportFormat: 'png',
    master: card.master,
    masterSha256: card.masterSha256,
    exports: [
      {
        surface: Object.keys(meta.surfaces)[0],
        file: card.export,
        width: real.width,
        height: real.height,
        sha256: card.exportSha256,
      },
    ],
    semanticState: null,
    captureState: null,
    reducedMotionEquivalent: 'the card itself — a static board; HAC-336 assembles motion around it',
    provenanceType: card.assetId === 'IL-SOC-010' ? 'deterministic' : 'editorial',
    status: card.assetId === 'IL-SOC-010'
      ? 'FROZEN — social derivative, built after the judge-critical set was frozen'
      : 'FROZEN — source-editable master committed alongside the derivative',
    license: LICENSE,
    evidence:
      card.assetId === 'IL-SCAF-011'
        ? {
          evidencePublicationSha: EVIDENCE.evidencePublicationSha,
          publicationBindingsSha: EVIDENCE.publicationBindingsSha,
          publicPacketSha256: EVIDENCE.publicPacketSha256,
          sourcePacketSha256: EVIDENCE.sourcePacketSha256,
          sourcePacketPublished: EVIDENCE.sourcePacketPublished,
          runtimeSourceUrl: EVIDENCE.runtimeSourceUrl,
        }
        : { note: 'Identity and thesis only; no evidence is asserted on this frame.' },
    immutableEvidenceRefs: card.assetId === 'IL-SCAF-011' ? [IMMUTABLE.cloudEvidence] : [],
  });
}

/* -- emit ------------------------------------------------------------------ */

const registry = {
  manifestId: 'HAC-335-asset-registry',
  revision: 'r01',
  issue: 'HAC-335',
  generator: 'media/hac-335/bin/build-registry.mjs',
  namingAuthority: 'scripts/export-naming.mjs (HAC-332 frozen grammar, ported)',
  note:
    'The final judge-facing package registry. HAC-334 authors its visual masters and stays the '
    + 'authority for their facts; this registry records what the package consumes, what HAC-335 '
    + 'authored, and what each asset is allowed to claim. Dimensions come out of PNG headers and '
    + 'digests off the bytes on disk, so a stale derivative is a mechanical finding.',
  publicEvidence: EVIDENCE,
  immutableEvidenceTargets: IMMUTABLE,
  runs: {
    A: { run: LOCAL_RUN, issue: 'HAC-330', label: 'CONTROLLED LOCAL EXPERIMENT' },
    B: { run: CLOUD_RUN, issue: 'HAC-340', label: 'GOOGLE CLOUD PARTICIPATION' },
  },
  excluded: [
    {
      assetId: 'IL-DIAG-013',
      reason:
        'HAC-319 evaluation is not bound. The asset stays in the HAC-334 registry as the reserved '
        + 'evaluation shell and is deliberately absent from every judge-facing surface here, so an '
        + 'unavailable evaluation cannot be read as a pending result. The integration seam is preserved.',
      seamPreserved: true,
    },
    {
      assetId: 'IL-DIAG-010',
      reason:
        'Conceptual, not evidence-bound. Kept out of the judge sequence so it cannot compete with '
        + 'IL-PROOF-010 for the causal slot.',
    },
  ],
  assets: rows,
};

writeFileSync(
  join(repoRoot, 'media/hac-335/evidence/asset-registry.json'),
  `${JSON.stringify(registry, null, 2)}\n`,
);

const exportCount = rows.reduce((n, r) => n + r.exports.length, 0);
console.log(`registry built: ${rows.length} assets, ${exportCount} exports`);
for (const r of rows) {
  console.log(`  ${r.assetId.padEnd(13)} ${String(r.proofClass).padEnd(5)} ${r.provenanceType.padEnd(14)} ${r.exports.length} export(s)`);
}
