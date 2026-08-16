#!/usr/bin/env node
/**
 * Refuses a visual suite that has drifted from what the evidence supports.
 *
 * The checks are about truth, not aesthetics. The failures this file exists to
 * prevent, in rough order of how badly they would mislead a judge:
 *
 *   - a board that renders the local counterfactual and the cloud traversal as
 *     one continuous run, which never happened;
 *   - a number on a board that no frozen artifact contains;
 *   - a lifecycle state the packets do not emit, above all AUTHORIZED;
 *   - the observer described as unable to authorize, which the packet does not
 *     establish and which the design system's own state table asserts;
 *   - an unevidenced deployment revision, a fabricated runtimeSourceUrl, or an
 *     evidence link that resolves through a mutable branch;
 *   - a quantitative mark on the HAC-319 shell;
 *   - a derivative whose master has moved underneath it.
 *
 * Every expectation is derived from the frozen sources, so rebuilding from
 * changed evidence moves the expectation with it. Nothing here asserts a
 * constant for its own sake, and no check is satisfied by a string being
 * present somewhere in a file.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const mediaDir = join(repoRoot, 'media', 'hac-334');
const read = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));

const model = read('media', 'hac-334', 'evidence', 'visual-model.json');
const registry = read('media', 'hac-334', 'evidence', 'asset-registry.json');
const viewModel = read('media', 'hac-341', 'evidence', 'view-model.json');
const storyboard = read('media', 'hac-333', 'scene-manifest.json');
const arms = read('experiments', 'hac-330', 'evidence', 'arms.json');
const results = read('experiments', 'hac-330', 'evidence', 'results.json');
const packet = read('experiments', 'hac-342', 'evidence', 'cloud-run.public.json');
const bindings = read('experiments', 'hac-342', 'evidence', 'publication-bindings.json');

const errors = [];
const fail = (m) => errors.push(m);
const asset = (id) => model.assets.find((a) => a.id === id);

/* -- masters and derivatives on disk -------------------------------------- */

const mastersDir = join(mediaDir, 'masters');
const exportsDir = join(mediaDir, 'exports');
const masterFiles = existsSync(mastersDir) ? readdirSync(mastersDir).filter((f) => f.endsWith('.svg')) : [];
const exportFiles = existsSync(exportsDir)
  ? readdirSync(exportsDir).filter((f) => f.endsWith('.png') || f.endsWith('.pdf')) : [];
const svgText = Object.fromEntries(
  masterFiles.map((f) => [f, readFileSync(join(mastersDir, f), 'utf8')]),
);
/** Every rendered string on every board, with the board it came from. */
const allBoardStrings = Object.entries(svgText).flatMap(([file, svg]) =>
  [...svg.matchAll(/>([^<>]*)<\/(?:text|title|desc)>/g)].map((m) => ({ file, s: m[1] })));

if (!masterFiles.length) fail('no canonical SVG masters found; run render-masters.mjs');

/* -- class A derives from the frozen arms --------------------------------- */

const frozenArm = { baseline: arms.baseline, treatment: arms.treatment, perturbed: arms.perturbedControl };
const modelArms = [
  ...asset('IL-PROOF-010').composition.arms.map((a) => [a.armId, a]),
  ...asset('IL-PROOF-011').composition.comparison.map((a) => [a.armId, a]),
];
for (const [id, a] of modelArms) {
  const rep = frozenArm[id].invariant.report;
  const expected = `${rep.total} ${rep.holds ? '<=' : '>'} ${rep.totalReservable}`;
  if (a.expression !== expected) fail(`arm ${id} expression "${a.expression}" != frozen "${expected}"`);
  if (a.holds !== rep.holds) fail(`arm ${id} holds ${a.holds} != frozen ${rep.holds}`);
  // The baseline's frozen decision is null — Interlock was disabled in that
  // arm — so this reads through optional access. Without it a board that
  // invents a baseline decision crashes the gate instead of being refused by
  // it, which fails the build for the wrong reason and says the wrong thing.
  const frozenDecision = frozenArm[id].decision?.decision ?? null;
  if (a.decision && a.decision !== frozenDecision) {
    fail(`arm ${id} decision ${a.decision} != frozen ${frozenDecision ?? 'none (Interlock disabled)'}`);
  }
}
// Interlock was disabled in the baseline, so there is no decision to show.
if ('decision' in asset('IL-PROOF-010').composition.arms.find((a) => a.armId === 'baseline')) {
  fail('the baseline arm carries a decision; Interlock was disabled in that arm');
}
// The treatment and the perturbed control must not be swapped: they are the
// whole counterfactual, and swapping them inverts what the evidence shows.
const cmp = asset('IL-PROOF-011').composition.comparison;
if (!(cmp[0].armId === 'treatment' && cmp[1].armId === 'perturbed')) {
  fail('the perturbation board does not read treatment then perturbed');
}
if (cmp[0].holds !== true || cmp[1].holds !== false) {
  fail('the perturbation comparison no longer shows the treatment holding and the perturbation breaching');
}

const checksPassed = results.checks.filter((c) => c.passed === true).length;
const expectedChecks = `${checksPassed}/${results.checks.length}`;
if (asset('IL-PROOF-010').composition.checks.value !== expectedChecks) {
  fail(`checks label ${asset('IL-PROOF-010').composition.checks.value} != recomputed ${expectedChecks}`);
}
const frozenBound = arms.baseline.invariant.report.totalReservable;
if (asset('IL-PROOF-010').composition.bound.value !== frozenBound) {
  fail(`joint bound ${asset('IL-PROOF-010').composition.bound.value} != frozen ${frozenBound}`);
}

/* -- class B derives from the published packet ---------------------------- */

const p12 = asset('IL-PROOF-012').composition;
const stage = (name) => p12.stages.find((s) => s.stage === name);
if (stage('DECISION').value !== packet.decision) fail('cloud decision does not match the published packet');
if (stage('EFFECT').value !== packet.protectedMutation.status) fail('cloud effect does not match the packet');
if (p12.receiptDigest.value !== packet.receiptDigest) fail('receipt digest does not match the packet');
if (stage('EFFECT').value === stage('OBSERVATION').value) fail('EXECUTED and OBSERVED collapsed into one state');
const observed = `alpha=${packet.observation.state.services.alpha}`;
if (!stage('OBSERVATION').detail.includes(observed)) fail(`observation does not carry ${observed}`);
if (asset('IL-DIAG-011').composition.observed.value !== observed) {
  fail(`cloud participation board observed value != frozen ${observed}`);
}

const frozenControls = [
  packet.controls.forgedHeaderStatus, packet.controls.wrongAudienceStatus, packet.controls.directBypassStatus,
].join('/');
const boardControls = asset('IL-PROOF-013').composition.cloudControls.map((c) => c.status).join('/');
if (boardControls !== frozenControls) fail(`negative controls ${boardControls} != frozen ${frozenControls}`);
// The cloud control sent an invalid token. Genuine wrong-audience rejection is
// controlled local parity and must never be promoted to a cloud result.
const controlLabels = asset('IL-PROOF-013').composition.cloudControls.map((c) => c.label).join(' | ');
if (/wrong[- ]audience/i.test(controlLabels)) {
  fail('wrong-audience appears as a cloud control label; it is controlled local parity');
}
if (!/local parity/i.test(asset('IL-PROOF-013').composition.localParity.heading)) {
  fail('the local parity control is not labelled as local parity');
}

/* -- the two proof classes never merge ------------------------------------ */

// Deliberately case-sensitive and specific. A loose word match here reads
// "Nothing is executed to produce this comparison" — a sentence whose whole job
// is to deny execution — as evidence of a cloud effect.
const COUNTERFACTUAL = /140 > 130|120 <= 130|WITHHOLD_SERIALIZE|ALLOW_PARALLEL/;
const CLOUD = /alpha=45|sha256:|gemini-3\.5-flash|Cloud Run|Cloud Logging|\bEXECUTED\b|\bOBSERVED\b|authorization receipt/;
for (const a of model.assets) {
  const body = JSON.stringify(a.composition);
  if (a.proofClass === 'A' && CLOUD.test(body)) {
    fail(`${a.id} is class A but carries cloud apparatus; HAC-330 has no receipt, effect or observation`);
  }
  if (a.proofClass === 'B' && COUNTERFACTUAL.test(body)) {
    fail(`${a.id} is class B but carries the HAC-330 counterfactual; HAC-340 does not reproduce it`);
  }
}
// No single board may render the whole synthetic chain the design exists to prevent.
for (const [file, svg] of Object.entries(svgText)) {
  if (COUNTERFACTUAL.test(svg) && /alpha=45/.test(svg)) {
    fail(`${file} renders the local counterfactual and the cloud observation on one board`);
  }
}
if (model.proofClasses.A.runIdentity === model.proofClasses.B.runIdentity) {
  fail('both proof classes report the same run identity');
}

/* -- language that would overstate the evidence --------------------------- */

const FORBIDDEN = [
  [/\bAUTHORIZED\b/, 'AUTHORIZED lifecycle state'],
  [/cannot authorize|unable to authorize|incapable of authoriz/i, 'observer-cannot-authorize (not evidenced)'],
  [/\bexactly[- ]once\b/i, 'exactly-once guarantee'],
  [/\bunbypassable\b/i, 'unbypassable'],
  [/\bVERIFIED\b/, 'ALLOW upgraded to VERIFIED'],
  [/\bHUMAN APPROVED\b/i, 'human approval'],
  [/\bRECOVERED\b/, 'recovery guarantee'],
];

/**
 * Non-claims must stay sayable: "no AUTHORIZED lifecycle state is claimed" is
 * the disclaimer, not the claim. A check that scanned whole documents would
 * fail on correct content, so the allowed carriers are enumerated from the
 * model and a hit is only a failure outside them.
 */
const sayable = new Set([
  ...asset('IL-PROOF-012').composition.absentStates,
  asset('IL-PROOF-012').composition.absentStatesNote,
  ...asset('IL-PROOF-014').composition.regions.at(-1).supports,
  ...storyboard.globalNonClaims,
  ...viewModel.runs.local.claimBoundary.notClaimed,
  ...viewModel.runs.cloud.claimBoundary.notClaimed,
]);
const isSayable = (s) => [...sayable].some((allowed) => s.includes(allowed) || allowed.includes(s.trim()));

/**
 * The claim-bearing part of a rendered string.
 *
 * Every board carries a `Non-claim:` rail, and the accessible description
 * concatenates it. Everything after that marker is by construction a statement
 * of what is *not* claimed, so scanning it for overstatement inverts the check:
 * it would fail exactly the boards that disclaim most carefully.
 */
const claimPart = (s) => s.split('Non-claim:')[0];

const claimBearing = JSON.stringify(model.assets.map((a) => {
  const c = { ...a.composition };
  delete c.absentStates;
  delete c.absentStatesNote;
  if (c.regions) c.regions = c.regions.filter((r) => r.heading !== 'NOT CLAIMED');
  return c;
}));
for (const [re, label] of FORBIDDEN) {
  if (re.test(claimBearing)) fail(`visual model contains ${label} in a claim-bearing field`);
}
for (const { file, s } of allBoardStrings) {
  const claim = claimPart(s);
  for (const [re, label] of FORBIDDEN) {
    if (re.test(claim) && !isSayable(s)) fail(`${file} renders ${label}: ${JSON.stringify(claim.slice(0, 70))}`);
  }
}
// The rail on every board must state a non-claim; a board that only asserts is
// not a proof surface.
for (const [file, svg] of Object.entries(svgText)) {
  if (!/Non-claim:/.test(svg)) fail(`${file} carries no non-claim rail`);
  if (!/Frozen evidence:/.test(svg)) fail(`${file} does not attribute its frozen evidence`);
}

/* -- provenance ----------------------------------------------------------- */

const pub = model.publicEvidence;
if (pub.evidencePublicationSha !== bindings.bindings.evidencePublicationSha) {
  fail('evidencePublicationSha disagrees with the HAC-342 publication bindings');
}
if (pub.sourcePacketPublished !== false) fail('sourcePacketSha256 must stay marked as a private commitment');
if (pub.runtimeSourceUrl.state !== 'unavailable / non-public') {
  fail('runtimeSourceUrl was populated; it is intentionally unavailable and no revision link may be fabricated');
}
for (const key of ['cloudEvidenceUrl', 'hac340VerifierUrl', 'redactionManifestUrl']) {
  const url = pub[key];
  if (!url) { fail(`${key} is unbound; HAC-342 resolved it`); continue; }
  if (!/\/blob\/[0-9a-f]{40}\//.test(url)) fail(`${key} is not pinned to an immutable commit SHA`);
  if (/\/blob\/(main|master|HEAD)\//.test(url)) fail(`${key} resolves through a mutable branch`);
}
// Unevidenced deployment revisions must never surface, on a board or in the model.
const evidenced = viewModel.runs.cloud.runtimeProvenance.revisionName;
for (const rev of ['interlock-hac340-agent-00002', 'interlock-hac340-target-00002']) {
  if (JSON.stringify(model).includes(rev)) fail(`unevidenced deployment revision ${rev} is in the visual model`);
  for (const [file, svg] of Object.entries(svgText)) {
    if (svg.includes(rev)) fail(`${file} renders unevidenced deployment revision ${rev}`);
  }
}
if (asset('IL-DIAG-012').composition.evidencedRevision.value !== evidenced) {
  fail('the deployment board names a revision the frozen record does not');
}
for (const [file, svg] of Object.entries(svgText)) {
  if (/\[BIND:/.test(svg)) fail(`${file} contains an unresolved [BIND: ...] placeholder`);
}

/* -- the HAC-319 shell stays empty ---------------------------------------- */

const shell = asset('IL-DIAG-013').composition;
if (shell.marks.length !== 0) fail('the HAC-319 shell has acquired a plotted mark');
if (!shell.metricsWithheld.length) fail('the HAC-319 metrics are not declared withheld');
if (shell.regimes.length !== viewModel.reserved.regimes.length) {
  fail('the HAC-319 regime list diverges from the reserved surface');
}
const METRIC_VALUE = /\b(SPR|precision|recall|false-block rate|useful-concurrency)\b[^.\n]{0,24}?[:=]?\s*-?\d+(\.\d+)?\s*%?/i;
for (const { file, s } of allBoardStrings) {
  if (METRIC_VALUE.test(s)) fail(`${file} renders a HAC-319 metric value: ${JSON.stringify(s.slice(0, 70))}`);
}
// The shell ships as an editable master only while unbound: a distributable
// raster of an empty comparison is a picture of a result that does not exist.
if (asset('IL-DIAG-013').exports.some((e) => e.ext !== 'svg')) {
  fail('the HAC-319 shell declares a raster or print derivative while it is unbound');
}

/* -- shared vocabulary with HAC-333 --------------------------------------- */

const storyStates = new Set(storyboard.scenes.map((s) => s.semanticStateId));
const cockpitStates = new Set([
  ...viewModel.runs.local.arms.map((a) => a.semanticStateId),
  viewModel.reserved.semanticStateId,
]);
for (const a of model.assets) {
  for (const s of a.semanticStates) {
    if (!storyStates.has(s) && !cockpitStates.has(s)) {
      fail(`${a.id} maps to ${s}, which is in neither the HAC-333 nor the HAC-341 vocabulary`);
    }
  }
}

/* -- exports: named, registered, derived, current ------------------------- */

const registryIds = new Set(registry.assets.map((r) => r.id));
for (const a of model.assets) {
  if (!registryIds.has(a.id)) fail(`${a.id} has no asset-registry row`);
}
for (const file of [...masterFiles, ...exportFiles]) {
  const parsed = validateExportName(file);
  if (!parsed.valid) { fail(`export ${file} is not a legal export name: ${parsed.error}`); continue; }
  if (!registryIds.has(parsed.id)) fail(`export ${file} names ${parsed.id}, which is not a registry row`);
  if (parsed.variant === 'static') fail(`export ${file} claims a static variant; the masters are already static`);
}
// Every declared export exists, and every file on disk was declared.
const declared = new Set();
for (const a of model.assets) {
  for (const ex of a.exports) {
    const dims = ex.width ? `-${ex.width}x${ex.height}` : '';
    const run = a.run ? `-run${a.run.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
    declared.add(`${a.id}-${ex.slug}${dims}${run}.${ex.ext}`);
  }
}
for (const name of declared) {
  const dir = name.endsWith('.svg') ? mastersDir : exportsDir;
  if (!existsSync(join(dir, name))) fail(`declared export ${name} was never produced`);
}
for (const file of [...masterFiles, ...exportFiles]) {
  if (!declared.has(file)) fail(`${file} exists on disk but the visual model does not declare it`);
}

// Staleness: a raster whose master has moved underneath it.
const renderManifestPath = join(exportsDir, 'render-manifest.json');
if (!existsSync(renderManifestPath)) {
  fail('exports/render-manifest.json is missing; rasters cannot be shown to correspond to their masters');
} else {
  const rm = JSON.parse(readFileSync(renderManifestPath, 'utf8'));
  const pngs = exportFiles.filter((f) => f.endsWith('.png'));
  if (rm.renders.length !== pngs.length) {
    fail(`render manifest records ${rm.renders.length} rasters but ${pngs.length} are on disk`);
  }
  for (const r of rm.renders) {
    const masterPath = join(mastersDir, r.master);
    if (!existsSync(masterPath)) { fail(`${r.export} derives from ${r.master}, which is missing`); continue; }
    const current = createHash('sha256').update(readFileSync(masterPath)).digest('hex');
    if (current !== r.masterSha256) {
      fail(`${r.export} is stale: ${r.master} has changed since it was rendered. Re-run export-png.mjs.`);
    }
    const png = readFileSync(join(exportsDir, r.export));
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    if (w !== r.width || h !== r.height) {
      fail(`${r.export} is ${w}x${h} on disk but the manifest records ${r.width}x${r.height}`);
    }
    if (w * 9 !== h * 16) fail(`${r.export} is ${w}x${h}, which is not 16:9`);
  }
}

/* -- accessibility -------------------------------------------------------- */

for (const [file, svg] of Object.entries(svgText)) {
  if (!/role="img"/.test(svg)) fail(`${file} is not exposed as an image role`);
  if (!/<title id="board-title">[^<]+<\/title>/.test(svg)) fail(`${file} has no accessible title`);
  if (!/<desc id="board-desc">[^<]+<\/desc>/.test(svg)) fail(`${file} has no text equivalent for its geometry`);
  if (!/aria-labelledby="board-title board-desc"/.test(svg)) fail(`${file} does not associate its title and description`);
  // State must never be carried by colour alone: each board that shows a state
  // draws its mark as geometry, so a stroked or filled path accompanies it.
  if (/COUPLED|INVALID JOINT STATE|BOUNDED CONSTRAINT SATISFIED/.test(svg) && !/<path |<circle /.test(svg)) {
    fail(`${file} shows a semantic state with no non-colour channel`);
  }
}

/* -- verdict -------------------------------------------------------------- */

if (errors.length) {
  process.stderr.write(`HAC-334 visual contract violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}

const pngCount = exportFiles.filter((f) => f.endsWith('.png')).length;
const pdfCount = exportFiles.filter((f) => f.endsWith('.pdf')).length;
process.stdout.write(
  'HAC-334 visual suite verified\n'
  + `  ${model.assets.length} assets, ${masterFiles.length} canonical masters, ${pdfCount} PDFs, ${pngCount} rasters\n`
  + `  class A ${model.proofClasses.A.runIdentity}: checks ${expectedChecks}, bound ${frozenBound}\n`
  + `  class B ${model.proofClasses.B.runIdentity}: ${observed}, controls ${frozenControls}, revision ${evidenced}\n`
  + `  ${model.contractDiscrepancies.length} recorded contract discrepancies, evidence links pinned to immutable commits\n`,
);
