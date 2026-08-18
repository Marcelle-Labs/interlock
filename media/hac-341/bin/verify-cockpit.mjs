#!/usr/bin/env node
/**
 * Refuses a cockpit that has drifted from what the evidence supports.
 *
 * The checks are about truth, not rendering. The failure this file exists to
 * prevent is a synthetic run: a view model where HAC-330 has grown a receipt or
 * HAC-340 has grown the 140/120 counterfactual, so a judge reads one continuous
 * experiment that never happened.
 *
 * Every assertion is derived from the frozen sources, so rebuilding the view
 * model from changed evidence moves the expectation with it. Nothing here
 * asserts a constant for its own sake.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armView } from '../lib/arm-view.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));

const model = read('media', 'hac-341', 'evidence', 'view-model.json');
const cockpit = readFileSync(join(here, '..', 'cockpit.html'), 'utf8');
const arms = read('experiments', 'hac-330', 'evidence', 'arms.json');
const cloudPacket = read('experiments', 'hac-342', 'evidence', 'cloud-run.public.json');
const bindings = read('experiments', 'hac-342', 'evidence', 'publication-bindings.json');

const errors = [];
const fail = (m) => errors.push(m);
const { local, cloud } = model.runs;

/* --- local identity assets must survive constrained preview hosts -------- */

const localIdentity = [
  ['token entry point', '../../assets/styles.css', ['assets', 'styles.css']],
  ['Geist face', '../../assets/fonts/geist-variable.woff2', ['assets', 'fonts', 'geist-variable.woff2']],
  ['Geist Mono face', '../../assets/fonts/geist-mono-variable.woff2', ['assets', 'fonts', 'geist-mono-variable.woff2']],
];
for (const [label, href, path] of localIdentity) {
  if (!cockpit.includes(href)) fail(`cockpit does not link the repository-local ${label}`);
  if (!existsSync(join(repoRoot, ...path))) fail(`repository-local ${label} is missing`);
}
if (!/@font-face\s*\{[\s\S]*?font-family:\s*"Geist"/.test(cockpit)) {
  fail('cockpit has no direct Geist fallback when a preview host drops CSS imports');
}
if (!/@font-face\s*\{[\s\S]*?font-family:\s*"Geist Mono"/.test(cockpit)) {
  fail('cockpit has no direct Geist Mono fallback when a preview host drops CSS imports');
}
for (const [proof, source] of [
  ['local', 'experiments/hac-330/evidence/arms.json'],
  ['cloud', 'experiments/hac-342/evidence/cloud-run.public.json'],
]) {
  const raw = model.runs[proof].rawProof;
  if (!raw) { fail(`${proof} run has no build-time raw proof presentation`); continue; }
  if (raw.source !== source) fail(`${proof} raw proof source is not the frozen evidence file`);
  if (!raw.json || !raw.html?.includes('shiki')) fail(`${proof} raw proof is not Shiki-highlighted`);
  if (/https?:\/\//.test(raw.html)) fail(`${proof} raw proof presentation has a runtime network dependency`);
}
if (!/run\.rawProof\.html/.test(cockpit) || !/run\.rawProof\.source/.test(cockpit)) {
  fail('cockpit does not render the build-time highlighted raw proof and source');
}

/* --- the runs must not merge ------------------------------------------- */

// Class A owns no cloud apparatus. A receipt here would be fabricated.
for (const f of ['receipt', 'effect', 'observation', 'negativeControls', 'runtimeProvenance', 'transportProvenance', 'publicationRefs']) {
  if (f in local) fail(`HAC-330 gained ${f}; no HAC-330 artifact contains it`);
}
// Class B owns no bounded-outcome experiment. Arms here would be fabricated.
for (const f of ['arms', 'environmentEvidence', 'constraints', 'checks', 'outcome']) {
  if (f in cloud) fail(`HAC-340 gained ${f}; the cloud run does not contain it`);
}
if (local.runIdentity === cloud.runIdentity) fail('both proof classes report the same run identity');
if (local.proofClass === cloud.proofClass) fail('both runs report the same proof class');
// The synthetic chain the whole design exists to prevent.
const merged = JSON.stringify(local);
if (/alpha=45|EXECUTED|ALLOW\b(?!_PARALLEL)/.test(merged)) fail('cloud outcome language appears inside the HAC-330 run');
if (/140 > 130|120 <= 130|WITHHOLD_SERIALIZE/.test(JSON.stringify(cloud))) fail('the HAC-330 counterfactual appears inside the cloud run');

/* --- class A derives from the frozen arms ------------------------------ */

const expect = {
  baseline: arms.baseline.invariant.report,
  treatment: arms.treatment.invariant.report,
  perturbed: arms.perturbedControl.invariant.report,
};
for (const [id, rep] of Object.entries(expect)) {
  const arm = local.arms.find((a) => a.armId === id);
  if (!arm) { fail(`arm ${id} is missing from the view model`); continue; }
  if (arm.outcome.total !== rep.total) fail(`arm ${id} total ${arm.outcome.total} != frozen ${rep.total}`);
  if (arm.outcome.holds !== rep.holds) fail(`arm ${id} holds ${arm.outcome.holds} != frozen ${rep.holds}`);
}
if (local.arms.find((a) => a.armId === 'treatment')?.decision !== arms.treatment.decision.decision) {
  fail('treatment decision does not match the frozen arm');
}
if (local.arms.find((a) => a.armId === 'perturbed')?.decision !== arms.perturbedControl.decision.decision) {
  fail('perturbed decision does not match the frozen arm');
}
// Interlock was disabled in the baseline, so there is no decision to show.
if ('decision' in (local.arms.find((a) => a.armId === 'baseline') ?? {})) {
  fail('the baseline arm has a decision; Interlock was disabled in that arm');
}
if (local.verification.hac330VerifierUrl) fail('a HAC-330 verifier URL was invented; this class has only a command');

/* --- the selected arm drives its own evidence --------------------------- */

/**
 * The defect these replace: the cockpit read `environmentEvidence[0]` for every
 * arm, so selecting the perturbed arm changed the decision and the outcome but
 * left the treatment's basis revision and `coupling support 8/10` on screen.
 * The surface asserted a coupling and its absence about eighty pixels apart,
 * and the perturbation — which exists to show the evidence is load-bearing —
 * taught the opposite: same evidence, different decision.
 *
 * These run through `armView`, the derivation the cockpit itself renders from,
 * so a rewiring of the binding fails here rather than a changed string.
 */
for (const arm of local.arms) {
  const v = armView(local, arm.armId);
  if (v.arm.armId !== arm.armId) { fail(`selecting arm ${arm.armId} resolves to ${v.arm.armId}`); continue; }
  if ((v.evidence.basis ?? null) !== (arm.basisRevision ?? null)) {
    fail(`arm ${arm.armId} renders basis ${v.evidence.basis} but its frozen basis is ${arm.basisRevision}`);
  }
  const frozenCouplings = (arm.couplings ?? []).length;
  if (v.evidence.couplings.length !== frozenCouplings) {
    fail(`arm ${arm.armId} renders ${v.evidence.couplings.length} coupling(s); the frozen arm records ${frozenCouplings}`);
  }
  // A coupled state may only be drawn where that arm's own evidence establishes one.
  if (v.coupled && !frozenCouplings) fail(`arm ${arm.armId} draws COUPLED without a recorded coupling`);
  if (v.coupled && arm.interlock !== 'enabled') {
    fail(`arm ${arm.armId} draws COUPLED although Interlock was ${arm.interlock}`);
  }
}

// An arm may not record evidence that contradicts its own reason. This is the
// shape the rendering defect had — a coupling asserted beside a decision that
// says none qualified — and it is worth refusing in the data as well.
for (const arm of local.arms) {
  const couplings = (arm.couplings ?? []).length;
  if (arm.decisionReason === 'NO_QUALIFYING_COUPLING' && couplings) {
    fail(`arm ${arm.armId} decided NO_QUALIFYING_COUPLING while recording ${couplings} coupling(s)`);
  }
  if (arm.decisionReason === 'COUPLING_OBSERVED' && !couplings) {
    fail(`arm ${arm.armId} decided COUPLING_OBSERVED with no recorded coupling`);
  }
}

// The baseline compared against itself is not a counterfactual. It rendered as
// two identical cards and read as a rendering bug.
const baselineArm = local.arms.find((a) => a.interlock === 'disabled');
if (!baselineArm) fail('no arm records Interlock disabled; the counterfactual has no baseline');
else {
  if (armView(local, baselineArm.armId).comparison.length !== 1) {
    fail('selecting the baseline renders more than one outcome row; it compares against itself');
  }
  for (const other of local.arms.filter((a) => a.armId !== baselineArm.armId)) {
    const cmp = armView(local, other.armId).comparison;
    if (cmp.length !== 2) fail(`arm ${other.armId} is not rendered against the baseline`);
    else if (cmp[0].armId !== baselineArm.armId || cmp[1].armId !== other.armId) {
      fail(`arm ${other.armId} does not keep the baseline beside its own outcome`);
    }
  }
}

// The perturbation is only legible as a change *from* the default arm.
const defaultArm = local.arms.find((a) => a.armId === local.defaultArm);
const perturbedArm = local.arms.find((a) => a.armId === 'perturbed');
if (defaultArm && perturbedArm) {
  if (defaultArm.basisRevision === perturbedArm.basisRevision) {
    fail('the perturbed arm shares the default arm basis; the perturbation would render identical evidence');
  }
  if (!armView(local, 'perturbed').evidenceChanged) {
    fail('the perturbed arm does not report changed evidence; the falsification stays invisible');
  }
  if (armView(local, local.defaultArm).evidenceChanged) {
    fail('the default arm reports changed evidence against itself');
  }
}

// The cockpit must consume that derivation rather than re-deriving it inline.
if (!/from '\.\/lib\/arm-view\.mjs'/.test(cockpit)) {
  fail('cockpit does not consume the shared arm-view derivation');
}
if (/environmentEvidence\[0\][^\n]*basisRevision|basisRevision[^\n]*environmentEvidence\[0\]/.test(cockpit)) {
  fail('cockpit reads a basis revision off the environment, bypassing the selected arm');
}
// One proof class, one name: the switch and the heading may not drift apart.
for (const cls of ['local', 'cloud']) {
  if (!new RegExp(String.raw`MODEL\.runs\.${cls}\.proofLabel`).test(cockpit)) {
    fail(`the proof switch does not name the ${cls} class from its own proofLabel`);
  }
}

/* --- the evidence panel stays usable ------------------------------------ */

// Raw proof was boxed into a fixed 270px window inside a panel that did not
// scroll: a fifth of it was reachable and the space beneath it sat empty.
if (/\bpre\s*\{[^}]*max-height/.test(cockpit)) {
  fail('raw proof is clipped by a fixed max-height; the panel should scroll instead');
}
// L2 explains L1's result, so it may not be drawn on top of that result. The
// frame has to be reduced *by the panel's own width* — matching any rule that
// merely mentions the frame would accept the narrow-viewport fallback, which
// sets it back to full width and covers everything.
if (!/body\[data-drawer="open"\][^{]*\.frame\s*\{[^}]*calc\(100vw - var\(--drawer-w\)\)/.test(cockpit)) {
  fail('the run does not yield space when the panel opens; the panel covers what it explains');
}
if (!/data-copy=/.test(cockpit)) fail('no copy control exists for raw evidence');
if (!/navigator\.clipboard/.test(cockpit)) fail('copy does not use the native clipboard');
if (!/execCommand\('copy'\)/.test(cockpit)) fail("copy has no offline fallback for a non-secure context");
// Motion comes from the frozen tokens, plays once, and never loops.
if (/animation:[^;]*\binfinite\b/.test(cockpit)) fail('cockpit contains a looping animation');
if (/\bdata-il-motion\b/.test(cockpit) && !/il-step-in/.test(cockpit)) {
  fail('cockpit animates without using a frozen motion keyframe');
}

/* --- class B derives from the published packet ------------------------- */

if (cloud.decision.value !== cloudPacket.decision) fail('cloud decision does not match the published packet');
if (cloud.effect.status !== cloudPacket.protectedMutation.status) fail('cloud effect does not match the packet');
if (cloud.observation.observed !== `alpha=${cloudPacket.observation.state.services.alpha}`) fail('observation does not match the packet');
if (cloud.receipt.digest !== cloudPacket.receiptDigest) fail('receipt digest does not match the packet');
// EXECUTED and OBSERVED are different facts and must stay different fields.
if (cloud.effect.status === cloud.observation.status) fail('EXECUTED and OBSERVED collapsed into one state');
const controls = cloud.negativeControls.map((c) => c.status).join('/');
const frozenControls = [cloudPacket.controls.forgedHeaderStatus, cloudPacket.controls.wrongAudienceStatus, cloudPacket.controls.directBypassStatus].join('/');
if (controls !== frozenControls) fail(`negative controls ${controls} != frozen ${frozenControls}`);
// The cloud control set is an invalid-token control. Genuine wrong-audience is local parity.
const cloudLabels = cloud.negativeControls.map((c) => c.label).join(' | ');
if (/wrong[- ]audience/i.test(cloudLabels)) fail('wrong-audience appears as a cloud control label; it is controlled local parity');

/* --- language that would overstate the evidence ------------------------- */

const FORBIDDEN = [
  [/\bAUTHORIZED\b/, 'AUTHORIZED lifecycle state'],
  [/cannot authorize/i, 'observer-cannot-authorize (not evidenced)'],
  [/\bexactly[- ]once\b/i, 'exactly-once guarantee'],
  [/ALLOW\s*(?:=|→|->|means)\s*VERIFIED|\bVERIFIED\b/, 'ALLOW upgraded to VERIFIED'],
  [/OBSERVED\s*(?:=|→|->|means)\s*SAFE/, 'OBSERVED upgraded to SAFE'],
];
// Non-claims must remain able to name what is not claimed.
const claimBearing = JSON.stringify([
  local.editorial, cloud.editorial, local.arms, cloud.events, cloud.decision, cloud.effect,
  cloud.observation, cloud.negativeControls, cloud.transportProvenance, cloud.applicationProvenance,
]);
for (const [re, label] of FORBIDDEN) if (re.test(claimBearing)) fail(`view model contains ${label}`);
const rendered = cockpit.replace(/notClaimed[\s\S]*?\]/g, '');
for (const [re, label] of FORBIDDEN) if (re.test(rendered)) fail(`cockpit markup contains ${label}`);

/* --- publication bindings: immutable, never a branch -------------------- */

const p = cloud.publicationRefs;
for (const [k, url] of Object.entries({ cloudEvidenceUrl: p.cloudEvidenceUrl, hac340VerifierUrl: p.hac340VerifierUrl, redactionManifestUrl: p.redactionManifestUrl })) {
  if (!url) { fail(`${k} is unbound; HAC-342 resolved it`); continue; }
  if (!/\/blob\/[0-9a-f]{40}\//.test(url)) fail(`${k} is not pinned to an immutable commit SHA`);
  if (/\/blob\/(main|master|HEAD)\//.test(url)) fail(`${k} resolves through a branch`);
}
if (p.evidencePublicationSha !== bindings.bindings.evidencePublicationSha) fail('evidencePublicationSha disagrees with the publication bindings');
if (p.sourcePacketPublished !== false) fail('sourcePacketSha256 must stay marked as a private commitment');
if (cloud.runtimeProvenance.runtimeSourceUrl.state !== 'unavailable / non-public') {
  fail('runtimeSourceUrl was populated; it is intentionally unavailable');
}
if (/\[BIND:/.test(cockpit)) fail('cockpit contains an unresolved [BIND: ...] placeholder');
// Unevidenced deployment revisions must never surface.
for (const rev of ['interlock-hac340-agent-00002', 'interlock-hac340-target-00002']) {
  if (cockpit.includes(rev) || JSON.stringify(model).includes(rev)) fail(`unevidenced deployment revision ${rev} is present`);
}

/* --- degraded states and the reserved surface --------------------------- */

const required = ['run.loading', 'run.unavailable', 'run.missing', 'run.cloud.partial', 'run.evidence.invalid-link', 'pending-binding', 'evaluation.unbound', 'run.error'];
for (const id of required) {
  if (!model.degradedStates.some((d) => d.id === id)) fail(`degraded state ${id} is not defined`);
}
if (model.deepLink.silentSubstitution !== 'forbidden') fail('silent substitution is not forbidden');
if (!/degraded\('run\.missing'/.test(cockpit)) fail('cockpit never renders run.missing');
if (!/Substitution refused/i.test(cockpit)) fail('cockpit does not refuse substitution explicitly');
if (model.reserved.metricsWithheld.length === 0) fail('HAC-319 metrics are not declared withheld');
if (/\b(SPR|precision|recall)\s*[:=]\s*[\d.]/.test(cockpit)) fail('cockpit renders a HAC-319 metric value');

/* --- shared vocabulary with HAC-333 ------------------------------------- */

const storyboard = read('media', 'hac-333', 'scene-manifest.json');
const storyStates = new Set(storyboard.scenes.map((s) => s.semanticStateId));
const shared = ['run.local.baseline', 'run.local.treatment', 'run.local.perturbed', 'run.cloud.overview'];
// Every shared state must resolve to a real view, not merely appear as a string.
// The cockpit routes local states through the arm ids, so the arm is what has to
// exist; a literal-substring check would only prove the file mentions the word.
for (const s of shared) {
  if (!storyStates.has(s)) fail(`${s} is not in the HAC-333 vocabulary; the surfaces have diverged`);
  if (s.startsWith('run.local.')) {
    const armId = s.slice('run.local.'.length);
    if (!local.arms.some((a) => a.armId === armId)) fail(`${s} maps to no recorded arm`);
    if (!local.arms.some((a) => a.semanticStateId === s)) fail(`${s} is not the semantic id of its arm`);
  } else if (!cockpit.includes(s)) {
    fail(`cockpit does not route ${s}`);
  }
}
if (!/run\.local\.\$\{/.test(cockpit)) fail('cockpit does not construct local semantic state ids');

/* --- accessibility and motion floor ------------------------------------- */

if (!/prefers-reduced-motion/.test(cockpit)) fail('cockpit has no reduced-motion handling');
/**
 * The evidence panel must preserve causal context.
 *
 * This check used to require `showModal()`. That protected an implementation
 * choice, and the choice was wrong: a modal panel makes L1 inert and its
 * backdrop dims the very column the panel exists to explain. HAC-341's contract
 * is that L1 stays readable during drilldown, so the invariant is stated
 * directly now — non-modal, no backdrop, still keyboard-complete.
 */
if (/showModal\(\)/.test(cockpit)) fail('evidence panel opens modally; L1 causal context is made inert');
if (/aria-modal="true"/.test(cockpit)) fail('evidence panel claims aria-modal; it must not trap the reader in L2');
if (/::backdrop/.test(cockpit)) fail('evidence panel draws a backdrop over the causal column it explains');
if (!/aria-labelledby="drawer-title"/.test(cockpit)) fail('evidence panel has no accessible name');
if (!/key === 'Escape'/.test(cockpit)) fail('Escape does not close the evidence panel');
if (!/class="close"/.test(cockpit)) fail('evidence panel has no explicit close control');
// Closed it must leave the tab order; open it must not remove the run from it.
if (!/drawer\.setAttribute\('inert'/.test(cockpit)) fail('closed evidence panel stays reachable by keyboard');
if (!/drawer\.removeAttribute\('inert'\)/.test(cockpit)) fail('opened evidence panel is never made reachable');
if (/app\.(setAttribute\('inert'|inert\s*=\s*true)/.test(cockpit)) fail('the run is made inert while the panel is open');
if (!/lastFocus/.test(cockpit)) fail('focus is not returned to the invoking control');
if (!/aria-pressed/.test(cockpit)) fail('toggle state is not exposed to assistive technology');
if (!/aria-live/.test(cockpit)) fail('state changes are not announced');
if (!/data-glyph/.test(cockpit)) fail('state is encoded by colour alone; no glyph channel');

const checksLabel = local.checks.label;
if (errors.length) {
  process.stderr.write(`HAC-341 cockpit contract violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'HAC-341 cockpit verified\n'
  + `  class A ${local.runIdentity}: ${local.arms.length} frozen arms, checks ${checksLabel}, no receipt/observer\n`
  + `  class B ${cloud.runIdentity}: ${cloud.events.length} hops, controls ${controls}, no arms/outcome\n`
  + `  ${model.degradedStates.length} degraded states, evidence links pinned to immutable commits\n`,
);
