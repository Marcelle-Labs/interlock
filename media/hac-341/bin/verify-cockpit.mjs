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
import { armView, gateState } from '../lib/arm-view.mjs';
import { ablationDelta, guideRoute, GUIDE_STATES, GUIDE_STEPS } from '../lib/guide.mjs';
import { icon, lucideBody, CONCEPTS, ICONS, ICON_SOURCE, SEMANTICS } from '../lib/icons.mjs';
import { jobSteps, jobControls, jobEnforcementDefect, jobKeyDefect, workflowEnvDefect,
  runDefaultsDefect, checkoutDefect, shapeDefects, workflowShapeDefects } from './lib/workflow.mjs';
import { buildComparison, judgeFacing, JUDGE_FACING_FIELDS, DIMENSIONS, STRATEGY_ARMS, BINDINGS } from '../lib/comparison.mjs';

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

/**
 * Byte-stable ordering for the names this gate prints back.
 *
 * Deliberately not a bare `.sort()`, which orders by UTF-16 code unit only as
 * an implementation detail, and deliberately not `localeCompare`: this output
 * is a gate's own record of what it checked, and CI and a laptop have to agree
 * on it. Locale-aware collation is not guaranteed identical across
 * environments or ICU builds. Comparing code units is. Same reasoning, and the
 * same shape, as `byPath` in media/hac-335/bin/lib/capture-source.mjs.
 */
const byCodeUnit = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
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
/**
 * The evidence basis is the value the whole ablation rests on — step 5 says
 * "only the frozen evidence differs: basis X replaces Y" — and it was the one
 * arm field compared view-model-to-view-model rather than against the frozen
 * record. Totals, `holds` and decisions were bound; `basisRevision` was not, so
 * editing it in `arms.json` reached the judge with every gate green.
 */
const FROZEN_ARM_KEY = { baseline: 'baseline', treatment: 'treatment', perturbed: 'perturbedControl' };
for (const [armId, frozenKey] of Object.entries(FROZEN_ARM_KEY)) {
  const modelArm = local.arms.find((a) => a.armId === armId);
  const frozenArm = arms[frozenKey];
  if (!modelArm || !frozenArm) { fail(`arm ${armId} has no frozen counterpart at arms.${frozenKey}`); continue; }
  const frozenBasis = frozenArm.decision?.basisRevision ?? null;
  if ((modelArm.basisRevision ?? null) !== frozenBasis) {
    fail(`arm ${armId} records basis ${modelArm.basisRevision} but the frozen arm records ${frozenBasis}`);
  }
  const frozenReason = frozenArm.decision?.reason ?? null;
  if ((modelArm.decisionReason ?? null) !== frozenReason) {
    fail(`arm ${armId} records reason ${modelArm.decisionReason} but the frozen arm records ${frozenReason}`);
  }
}

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
// Matched on the module, not the specifier prefix, so the rewrite fix below
// does not read as the cockpit having dropped the import.
if (!/from '\/media\/hac-341\/lib\/arm-view\.mjs'/.test(cockpit)) {
  fail('cockpit does not consume the shared arm-view derivation');
}
if (/environmentEvidence\[0\][^\n]*basisRevision|basisRevision[^\n]*environmentEvidence\[0\]/.test(cockpit)) {
  fail('cockpit reads a basis revision off the environment, bypassing the selected arm');
}
// One proof class, one name: the switch and the heading may not drift apart.
// Scoped to `switchHtml` rather than to the whole file — the label is legitimately
// read elsewhere now, and a check that any occurrence exists would stop noticing
// a hard-coded name in the switch itself.
const switchSource = /const switchHtml = [\s\S]*?`;\n/.exec(cockpit)?.[0] ?? '';
if (!switchSource) fail('cannot locate the proof switch; its naming cannot be checked');
for (const cls of ['local', 'cloud']) {
  if (!new RegExp(String.raw`MODEL\.runs\.${cls}\.proofLabel`).test(switchSource)) {
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

/* --- the cloud L1 must not read as a bounded-outcome experiment --------- */

/**
 * `effect.invariant` is real evidence: the protected target's own recorded
 * bound. Rendering it in cloud L1 put an inequality against the same bound 130
 * directly beneath EXECUTED, one proof-class switch away from the local class's
 * `120 <= 130`. A reader scanning quickly can chain the two into "same
 * experiment, confirmed on cloud" — exactly the reading the claim boundary
 * denies, and the one SB-06 works hardest to prevent.
 *
 * The check asks *where the field is consumed*, not what its current value is,
 * so changing the number cannot evade it. The value stays reachable in L2.
 */
function fnSource(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const rest = src.slice(start);
  const end = rest.slice(1).search(/\n(?:function |const [A-Za-z]|\/\* -)/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const cloudL1 = fnSource(cockpit, 'renderCloud');
if (!cloudL1) {
  fail('cannot locate renderCloud; the cloud L1 bounded-outcome check cannot run');
} else if (/effect\.invariant/.test(cloudL1)) {
  fail('cloud L1 renders the protected-mutation invariant; an inequality against the same bound as the HAC-330 joint constraint reads as a continuation of that experiment');
}
// It is recorded evidence, so demoting it must not mean deleting it.
if (!/effect\.invariant/.test(cockpit)) {
  fail('the protected-mutation invariant is rendered nowhere; it is recorded evidence and belongs in L2 or L3');
}

/* --- one name for the decision artifact --------------------------------- */

/**
 * The adapter labelled hop 6 "ALLOW + authorization receipt" while the decision
 * card and the storyboard both said "ALLOW + receipt". The longer phrase is not
 * false — the receipt genuinely is an authorization receipt, and
 * `src/authorization/receipt.ts` calls it that — but two names for one artifact
 * on one surface invites reading the longer one as a lifecycle state this run
 * never emitted. Prose describing the artifact is unaffected; this governs
 * rendered labels.
 */
const decisionHop = cloud.events.find((e) => e.role === 'decision');
const expectedLabel = `${cloud.decision.value} + receipt`;
if (!decisionHop) fail('the cloud path records no decision hop');
else if (decisionHop.label !== expectedLabel) {
  fail(`the cloud decision hop is labelled "${decisionHop.label}"; it must read "${expectedLabel}", matching the decision card and the storyboard`);
}
const storyboardHtml = readFileSync(join(repoRoot, 'media', 'hac-333', 'storyboard.html'), 'utf8');
for (const [name, src] of Object.entries({ cockpit, 'storyboard.html': storyboardHtml })) {
  if (/authorization receipt/i.test(src)) {
    fail(`${name} names the decision artifact "authorization receipt"; both rendered surfaces use "${expectedLabel}"`);
  }
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


/* --- the guided layer may only move emphasis ---------------------------- */

/**
 * The walk is an attention layer. Everything below refuses the ways it could
 * quietly stop being one: by hiding the cockpit behind it, by advancing on its
 * own, by recomputing a value, or by claiming something about the ablation that
 * the frozen arms do not support.
 */

// The vocabulary is one list, declared once. A cockpit that routed a state the
// model does not declare would be addressable but unverifiable.
if (!Array.isArray(model.guide?.states)) fail('the view model declares no guided state vocabulary');
else {
  for (const id of GUIDE_STATES) {
    if (!model.guide.states.includes(id)) fail(`guided state ${id} is not declared in the view model`);
  }
  for (const id of model.guide.states) {
    if (!guideRoute(id)) fail(`the view model declares ${id}, which the router refuses`);
  }
}
for (const id of GUIDE_STATES) {
  if (!id.startsWith('guide.local.')) fail(`guided state ${id} is not namespaced to the local proof class`);
}
if (GUIDE_STEPS.length !== 6) fail(`the walk has ${GUIDE_STEPS.length} steps; the approved sequence has six`);
if (model.deepLink.unknownGuideState !== 'run.missing') fail('an unknown guided state is not refused');
if (model.deepLink.guideUnderWrongProofClass !== 'run.missing') {
  fail('a guided state under the wrong proof class is not refused');
}
if (!/guideRoute\(/.test(cockpit)) fail('cockpit does not route the guided axis through the shared derivation');
if (!/return \{ missing: `guide=/.test(cockpit)) fail('cockpit does not refuse an unknown guided address');
if (!/return \{ missing: `proof=\$\{proof\}&guide=/.test(cockpit)) {
  fail('cockpit does not refuse a guided address under the wrong proof class');
}

/**
 * The ablation's markers are the load-bearing claim of step 5: four things were
 * held constant and four changed. `ablationDelta` reads both frozen arms and
 * reports what actually moved, so this fails if a marker has stopped being true
 * — including if the frozen arms are edited so that the perturbation no longer
 * perturbs anything.
 */
const delta = ablationDelta(local);
if (!delta.truthful) {
  for (const row of delta.rows) {
    const truthful = row.kind === 'held' ? !row.differs : row.differs;
    if (!truthful) {
      fail(row.kind === 'held'
        ? `the ablation marks ${row.id} held constant, but it changes between the ${delta.fromArmId} and ${delta.toArmId} arms`
        : `the ablation marks ${row.id} changed, but it is identical in the ${delta.fromArmId} and ${delta.toArmId} arms`);
    }
  }
}
for (const id of ['intent.a', 'intent.b', 'environment', 'bound']) {
  if (!delta.held.some((r) => r.id === id)) fail(`the ablation does not hold ${id} constant`);
}
// "Held constant: the joint bound" is only true if every arm was judged against
// the constraint the run declares. Reading it off the arms rather than off the
// constraint is what makes the marker falsifiable.
const declaredBound = local.constraints?.[0]?.bound;
for (const arm of local.arms) {
  if (arm.outcome.bound !== declaredBound) {
    fail(`arm ${arm.armId} was judged against bound ${arm.outcome.bound}, not the declared ${declaredBound}`);
  }
}
for (const id of ['evidence.basis', 'evidence.finding', 'decision', 'outcome']) {
  if (!delta.changed.some((r) => r.id === id)) fail(`the ablation does not report ${id} as changed`);
}
// A marker is drawn only where the derivation supports it.
if (!/function marker\(/.test(cockpit) || !/ablationDelta|g\.delta\.rows/.test(cockpit)) {
  fail('cockpit draws held/changed markers without consulting the ablation derivation');
}
// The ablation selects a recorded arm. It must not edit, delete or recompute one.
if (/data-guide-ablate/.test(cockpit) && !/go\(\{ state: `run\.local\.\$\{t\.dataset\.guideAblate\}` \}\)/.test(cockpit)) {
  fail('the ablation control does something other than select a recorded arm');
}

// The walk never advances on its own: no timer may change the step or the arm.
for (const re of [/setInterval\s*\(/, /setTimeout\s*\([^)]*goStep/, /setTimeout\s*\([^)]*guideView/, /requestAnimationFrame\s*\([^)]*goStep/]) {
  if (re.test(cockpit)) fail('the walk can advance without the reader; no step may auto-advance');
}

/**
 * Emphasis may not be paid for out of legibility.
 *
 * The first implementation receded non-current stages with `opacity`, which
 * composites *text* toward the background and multiplies through every ancestor
 * that also sets it. Measured, labels already muted at 0.6 inside a row at 0.7
 * inside a stage at 0.62 rendered at 0.26 and 1.81:1. These refuse the whole
 * mechanism rather than a particular value of it: no `opacity` and no `filter`
 * may appear in any `[data-guide-em]` rule, at any value, ever.
 */
for (const rule of cockpit.match(/\[data-guide-em[^\]]*\][^{]*\{[^}]*\}/g) ?? []) {
  if (/(^|[^-\w])opacity\s*:/.test(rule)) {
    fail(`a guided-emphasis rule sets opacity, which composites text below the contrast floor: ${rule.slice(0, 80)}`);
  }
  if (/filter\s*:/.test(rule)) {
    fail(`a guided-emphasis rule sets a filter, which alters rendered text colour: ${rule.slice(0, 80)}`);
  }
  if (/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/.test(rule)) {
    fail(`a non-current stage is hidden or made unreachable: ${rule.slice(0, 80)}`);
  }
  // Emphasis is colour, background and shadow. Anything that participates in
  // layout would move the run as the step advances.
  if (/(^|;|\{)\s*(width|height|padding|margin|border-width|border-left-width|font-size|inset|top|left|right|bottom|transform)\s*:/.test(rule)) {
    fail(`a guided-emphasis rule changes layout, which shifts the run between steps: ${rule.slice(0, 80)}`);
  }
}
/**
 * Guided copy may not out-run the record.
 *
 * Every value on this surface is derived except one: step 5's copy names
 * `ALLOW_PARALLEL` in prose, because the approved sequence states it. It is
 * true today and nothing enforced that it stays true — if the frozen perturbed
 * arm's decision ever changed, the copy would quietly lie while every binding
 * check still passed. Copy may name a decision only if a frozen arm records it.
 */
const recordedDecisions = new Set(local.arms.map((a) => a.decision).filter(Boolean));
const DECISION_TOKEN = /\b(WITHHOLD_SERIALIZE|ALLOW_PARALLEL|ALLOW_SERIALIZED|INSUFFICIENT_EVIDENCE)\b/g;
for (const step of GUIDE_STEPS) {
  for (const [, token] of step.copy.matchAll(DECISION_TOKEN)) {
    if (!recordedDecisions.has(token)) {
      fail(`guided copy for ${step.stateId} names "${token}", which no frozen arm records`);
    }
  }
}

// A guided state id may not be stamped on the cloud proof class.
if (/dataset\.guideState = GUIDE_CHOICE_STATE/.test(cockpit)) {
  fail('the cloud render stamps a local-namespaced guided state id on the document');
}

// The mechanism must be positive: the current stage is marked up.
if (!/\[data-guide-em="focus"\]/.test(cockpit)) fail('no positive emphasis exists for the current stage');
if (/data-guide-em="recede"/.test(cockpit)) fail('the opacity-based recession is still present');
if (/--il-recede/.test(cockpit)) fail('the recession opacity token survives; emphasis must not be opacity');

/**
 * No text is muted with opacity anywhere on this surface.
 *
 * Opacity cannot be measured once and trusted: it depends on every ancestor and
 * on whatever happens to be behind. Hierarchy is carried by the two measured
 * colour tiers instead. Rules that dim a rule, a stroke, a decorative grid or a
 * disabled control are unaffected — none of them are readable text.
 */
/**
 * Strokes, rules and a decorative grid — none of them readable text.
 *
 * `:disabled` controls are deliberately *not* on this list. WCAG 1.4.3 exempts
 * an inactive component, so dimming the Back button on step one is permitted —
 * but it is text, and calling it "not text" to keep a blanket claim tidy is how
 * the next real offender gets waved through. It is named separately below so
 * the exemption is visible as an exemption.
 */
const NON_TEXT_OPACITY = new Set([
  '.cxn .e-intent', '.cxn .e-couple', '.res .cause .cxl', '.evidence-band::before',
  '.hops::before',
  // The emphasised connector: the same two strokes, restored to full.
  '.cxn[data-guide-edge="on"] .e-intent', '.cxn[data-guide-edge="on"] .e-couple',
]);
/** Text, but on an inactive control, which 1.4.3 exempts from the floor. */
const INACTIVE_CONTROL_OPACITY = new Set(['.guide-bar__controls button[disabled]']);
// Comments are stripped first: a comment sitting above a rule would otherwise
// be read as part of its selector.
const styleBlock = (/<style>([\s\S]*?)<\/style>/.exec(cockpit)?.[1] ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
/**
 * Every `selector { … }` rule, scanned once left to right.
 *
 * This replaces `[^{}]+\{[^}]*\}`, whose leading run rescans the remainder from
 * every failed start position. The slices are the ones that pattern produced:
 * the selector is the brace-free run before `{`, and the body runs from `{` to
 * the first `}`, so a nested at-rule still yields its header.
 */
function* cssRules(css) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) return;
    const close = css.indexOf('}', open + 1);
    if (close < 0) return;
    let start = open;
    while (start > i && css[start - 1] !== '{' && css[start - 1] !== '}') start -= 1;
    const selector = css.slice(start, open).trim();
    // The old pattern required at least one character before `{`.
    if (selector) yield { selector, body: css.slice(open, close + 1) };
    i = close + 1;
  }
}
for (const { selector, body } of cssRules(styleBlock)) {
  if (!/(^|[^-\w])opacity\s*:/.test(body)) continue;
  if (selector.startsWith('@') || selector.startsWith(':root')) continue;
  const selectors = selector.split(',').map((x) => x.trim());
  if (selectors.every((x) => NON_TEXT_OPACITY.has(x))) continue;
  if (selectors.every((x) => INACTIVE_CONTROL_OPACITY.has(x))) {
    // Permitted, but only where the selector actually requires the disabled
    // state — dropping `[disabled]` would dim a live control's label.
    if (selectors.every((x) => /\[disabled\]|:disabled/.test(x))) continue;
  }
  fail(`opacity mutes text in \`${selector}\`; use the measured --text-muted tier instead`);
}
// --n50 measured 4.07:1 on the sunken surface and 4.33:1 on card: it is under
// the floor on both, so it may not colour text again.
for (const { selector, body } of cssRules(styleBlock)) {
  if (/(^|[^-\w])color\s*:\s*var\(--n50\)/.test(body)) {
    fail(`\`${selector}\` colours text with --n50, which is under the contrast floor`);
  }
}
// The raw-proof surface must follow its field. A light code surface under the
// cloud class rendered paper text at 1.03:1 — present, and unreadable.
// Scoped to the declaration, not the whole rule text: what matters is that this
// selector puts the dark-field background on the proof surface, not that the rule
// happens to carry no other declaration beside it.
if (!/body\[data-proof="cloud"\] pre\.shiki-proof\{[^}]*background:var\(--n95\)/.test(cockpit)) {
  fail('the cloud raw-proof surface does not follow the dark field; the packet renders unreadable');
}
// Inline styles are part of the same contract: the stylesheet sweep above
// cannot see a style attribute, and one `style="opacity:.65"` would reopen the
// hole the whole tier system closes.
for (const attr of cockpit.match(/style="[^"]*"/g) ?? []) {
  if (/(^|[^-\w])opacity\s*:/.test(attr)) fail(`an inline style mutes text with opacity: ${attr}`);
}
// The tiers themselves must exist and must be the measured ones.
for (const token of ['--text-body:', '--text-muted:']) {
  if (!cockpit.includes(token)) fail(`the ${token.replace(':', '')} tier is not declared`);
}
// The dark field needs its own tier: #515858 on an L~0.10 ground is unreadable.
const cloudBlock = /body\[data-proof="cloud"\]\{[\s\S]*?\}/.exec(styleBlock)?.[0] ?? '';
if (!/--text-muted:\s*var\(--n40\)/.test(cloudBlock)) {
  fail('the cloud field does not redeclare --text-muted; the light tier is unreadable on ink');
}
if (!/--text-body:\s*var\(--paper\)/.test(cloudBlock)) {
  fail('the cloud field does not redeclare --text-body');
}

/**
 * While the walk runs, the step owns its action. The persistent row is demoted,
 * never emptied: `Show me the raw proof` and `What is not claimed?` exist in no
 * step panel, and no step may take away the expert path.
 */
if (!/data-guide-weight="\$\{g\.mode === 'guided' \? 'secondary' : 'primary'\}"/.test(cockpit)) {
  fail('the persistent verification row is not demoted while the walk is running');
}
if (!/g\.isHandoff \? new Set\(\['verify', 'compare'\]\)/.test(cockpit)) {
  fail('the handoff step duplicates its own actions in the persistent row');
}
if (!/\['raw', 'Show me the raw proof'\][\s\S]{0,120}\['claim', 'What is not claimed\?'\]/.test(cockpit)) {
  fail('the persistent row can lose the actions no step panel offers');
}
const demoted = /\.actions\[data-guide-weight="secondary"\] button\{[^}]*\}/.exec(cockpit)?.[0] ?? '';
if (!demoted) fail('demotion has no visual treatment');
else if (/(^|[^-\w])(opacity|color)\s*:/.test(demoted)) {
  fail('demotion dims the control text; a demoted action must stay as readable as any other');
}
if (/guide[^\n]*disabled\s*=\s*"?true|setAttribute\('inert'[^\n]*app/.test(cockpit)) {
  fail('the guided layer disables the cockpit beneath it');
}
// Nothing is preselected at the entry: the choice has to be the reader's.
const choiceBlock = /const choiceHtml[\s\S]*?`;\n/.exec(cockpit)?.[0] ?? '';
if (!choiceBlock) fail('cannot locate the entry choice; its preselection cannot be checked');
else {
  if (/aria-pressed="true"|aria-current="(step|true|page)"|autofocus|checked/.test(choiceBlock)) {
    fail('the entry choice preselects a path; neither may be selected before the reader chooses');
  }
  for (const need of ['Walk the proof', 'Explore freely', 'Inspect the run']) {
    if (!choiceBlock.includes(need)) fail(`the entry choice is missing "${need}"`);
  }
}

/**
 * No value is computed in the browser.
 *
 * The arithmetic that would produce `140`, `120` or `130` belongs to the frozen
 * arms; this surface formats what it is given. The check looks for arithmetic on
 * outcome fields rather than for the numerals, so changing a number cannot
 * evade it.
 */
const RECOMPUTE = [
  [/outcome\.(total|bound)\s*[-+*/<>]/, 'arithmetic on a recorded outcome'],
  [/[-+*/<>]\s*[\w.?]*\boutcome\.(total|bound)\b/, 'arithmetic against a recorded outcome'],
  [/\.reduce\([^)]*reserved/, 'a reserved-total sum computed in the browser'],
  // `data-holds="..."` is a rendered attribute; `holds =` would be a verdict
  // decided here rather than read out of the frozen arm.
  [/(?<![-\w])holds\s*=\s*[^=]/, 'an invariant verdict assigned rather than read'],
];
for (const [re, label] of RECOMPUTE) if (re.test(cockpit)) fail(`cockpit performs ${label}`);

/* --- reduced motion must describe the state actually in force ----------- */

if (!/matchMedia\??\.?\('\(prefers-reduced-motion: reduce\)'\)/.test(cockpit)) {
  fail('cockpit never observes the OS reduced-motion preference');
}
if (!/Reduced motion \\u00b7 system preference|Reduced motion · system preference/.test(cockpit)) {
  fail('the OS reduced-motion state is not reported to the reader');
}
const motionControl = /function motionControlHtml\(\)[\s\S]*?\n}/.exec(cockpit)?.[0] ?? '';
if (!motionControl) fail('cannot locate the reduced-motion control');
else {
  // Under an OS preference the control must be withdrawn, not re-labelled: an
  // "Enable motion" button the preference would override is a lie about who is
  // in charge.
  const osBranch = motionControl.slice(0, motionControl.indexOf('const label'));
  if (/<button/.test(osBranch)) fail('an interactive motion control survives the OS reduced-motion preference');
  if (/Enable motion/.test(osBranch)) fail('the OS reduced-motion state offers an override it cannot deliver');
  if (!/aria-pressed="\$\{manualReduced\}"/.test(motionControl)) fail('the manual motion control does not expose its state');
}
if (!/reducedMotion = \(\) => osReduced\(\) \|\| manualReduced/.test(cockpit)) {
  fail('the effective reduced-motion state does not let the OS preference win');
}
if (/localStorage|sessionStorage/.test(cockpit)) {
  fail('a motion preference is persisted; this repository has no preference-storage pattern to follow');
}

/**
 * The one staged transition stays inside the frozen motion budget.
 *
 * Derived from tokens/motion.css rather than asserted, so raising a token
 * without re-reading this fails here instead of shipping a seven-hundred
 * millisecond sequence as a three-hundred millisecond one.
 */
const motionTokens = readFileSync(join(repoRoot, 'assets', 'tokens', 'motion.css'), 'utf8');
const tokenMs = (name) => Number(new RegExp(String.raw`${name}:\s*(\d+)ms`).exec(motionTokens)?.[1] ?? Number.NaN);
const [durBase, delayStep, durHold] = ['--dur-base', '--delay-step', '--dur-hold'].map(tokenMs);
if ([durBase, delayStep, durHold].some(Number.isNaN)) fail('the frozen motion tokens could not be read');
else {
  // evidence at 0, decision at one step, outcome at two: the attribution order.
  const sequence = delayStep * 2 + durBase;
  if (sequence > durHold) {
    fail(`the ablation sequence runs ${sequence}ms, past the ${durHold}ms motion budget`);
  }
}
for (const region of ['.env', '.delta', '.decision', '.results']) {
  if (!cockpit.includes(`'${region}'`)) fail(`the arm transition no longer steps ${region}`);
}

/* --- every sequence is declared, bounded, and settles (HAC-346) ---------- */

/**
 * The motion contract is a document, not a habit.
 *
 * `docs/development/cockpit-motion-contract.md` lists every animation on this
 * surface with its semantic job, its evidence binding, its static equivalent
 * and the state it settles at. These checks refuse a sequence that exists in
 * the executable and not in the table — the failure mode being an animation
 * added during polish that nobody ever wrote down, and that therefore nobody
 * ever asked what it was representing.
 */
const motionContract = existsSync(join(repoRoot, 'docs', 'development', 'cockpit-motion-contract.md'))
  ? readFileSync(join(repoRoot, 'docs', 'development', 'cockpit-motion-contract.md'), 'utf8')
  : '';
if (!motionContract) fail('the cockpit motion contract is not documented');
const sequences = new Set([...cockpit.matchAll(/setAttribute\('data-il-motion', '(\w+)'\)/g)].map((m) => m[1]));
if (!sequences.size) fail('no motion sequence is declared; the arm transition has been dropped');
for (const name of sequences) {
  if (!new RegExp(String.raw`\[data-il-motion="${name}"\]`).test(cockpit)) {
    fail(`sequence "${name}" is applied but has no stylesheet rule; it would animate nothing`);
  }
  if (!motionContract.includes(`data-il-motion="${name}"`)) {
    fail(`sequence "${name}" is not in the motion contract; an undocumented animation represents nothing`);
  }
}
for (const name of new Set([...cockpit.matchAll(/\[data-il-motion="(\w+)"\]/g)].map((m) => m[1]))) {
  if (!sequences.has(name)) fail(`the stylesheet declares sequence "${name}", which nothing applies`);
}
// Keyframes come from the frozen motion tokens. A keyframe defined inline here
// would be a second motion authority beside the identity system.
const KEYFRAME_IN_COCKPIT = /@keyframes\s+([\w-]+)/.exec(styleBlock);
if (KEYFRAME_IN_COCKPIT) {
  fail(`the cockpit defines keyframe ${KEYFRAME_IN_COCKPIT[1]} locally; motion belongs to assets/tokens/motion.css`);
}
for (const [, keyframe] of styleBlock.matchAll(/animation:\s*(il-[\w-]+)/g)) {
  if (!new RegExp(String.raw`@keyframes\s+${keyframe}\b`).test(motionTokens)) {
    fail(`the cockpit animates with "${keyframe}", which the frozen motion tokens do not declare`);
  }
}
// Both staged sequences stay inside the same budget the ablation does. The
// numbers are read from the tokens, so raising one fails here rather than
// shipping a longer sequence than the system permits.
for (const [label, steps] of [['step progression', 1], ['ablation staging', 2], ['arm change', 2]]) {
  const total = delayStep * steps + durBase;
  if (Number.isFinite(total) && total > durHold) {
    fail(`the ${label} sequence runs ${total}ms, past the ${durHold}ms motion budget`);
  }
}
// The hold state is derived from the animations that are actually running.
if (!/getAnimations\(\{ subtree: true \}\)/.test(cockpit)) {
  fail('the settled hold state is not derived from the running animations');
}
if (!/dataset\.motion = 'settled'/.test(cockpit) || !/dataset\.motion = 'stepping'/.test(cockpit)) {
  fail('the cockpit declares no named hold state for capture');
}
if (/setTimeout\([^)]*dataset\.motion|setTimeout\([^)]*settle/.test(cockpit)) {
  fail('the hold state is decided by a timer rather than by the animations it describes');
}
// A staged sequence hangs its attribute on a container and delays the children
// inside it. Killing only the container leaves those children animating under a
// preference that asked for none — and the manual control, unlike the OS media
// query, does not zero the duration tokens.
for (const root of ['html\\[data-static="true"\\]', 'html\\[data-reduced-motion="true"\\]']) {
  if (!new RegExp(`${root} \\[data-il-motion\\] \\*`).test(cockpit)) {
    fail(`${root.replace(/\\/g, '')} does not stop a staged sequence's children`);
  }
}
if (!/\[data-il-motion\], \[data-il-motion\] \* \{ animation: none/.test(motionTokens)) {
  fail('the frozen reduced-motion block does not stop a staged sequence\'s children');
}
// A stage that is already current may not arrive twice: re-pointing at the one
// region the reader has not stopped looking at is how they lose track of which
// region actually moved.
if (!/if \(previousFocus\.includes\(region\)\) continue;/.test(cockpit)) {
  fail('the step sequence re-animates a stage that was already current');
}
// The threshold is a held constant in every recorded arm. Animating it would
// contradict the marker beside it, so nothing may.
const boundRow = delta.rows.find((r) => r.id === 'bound');
if (!boundRow || boundRow.kind !== 'held' || boundRow.differs) {
  fail('the joint bound is no longer a held constant; the motion contract\'s threshold rejection needs re-deriving');
}
for (const { selector, body } of cssRules(styleBlock)) {
  if (/\.bound\b/.test(selector) && /animation\s*:/.test(body)) {
    fail(`\`${selector}\` animates the threshold, which is held constant across every recorded arm`);
  }
}

/* --- the decision gate is a position, not a performance (HAC-347) ------- */

/**
 * The gate draws the mechanism, so it is held to the mechanism's rules.
 *
 * Every recorded decision must map to a position. A token this map does not
 * carry returns `null` and the surface draws nothing — which is correct
 * behaviour and a broken cockpit, so it fails here instead of shipping.
 */
for (const arm of local.arms) {
  const state = gateState(arm);
  if (!state) {
    fail(`the gate has no position for recorded decision "${arm.decision}" (arm ${arm.armId}); `
      + 'add it to GATE_STATES rather than letting the surface draw nothing');
    continue;
  }
  if (!state.label || !state.gloss) fail(`the ${arm.armId} gate position has no visible caption`);
  // The picture may not disagree with the token beneath it.
  const permits = state.id === 'open';
  if (permits !== (arm.decision === 'ALLOW_PARALLEL')) {
    fail(`the gate shows "${state.id}" for decision ${arm.decision}; the picture contradicts the record`);
  }
  if (arm.interlock === 'disabled' && state.id !== 'absent') {
    fail(`the ${arm.armId} arm ran with Interlock disabled but draws an engaged gate`);
  }
}
// The mechanism is the canonical geometry. If the gate ever stops drawing the
// frozen leaves it has become an approximation of the mark.
for (const d of ['M18.6 16.2 L23.2 19.4 L23.2 28.6 L18.6 31.8 Z', 'M29.4 16.2 L24.8 19.4 L24.8 28.6 L29.4 31.8 Z']) {
  if (!cockpit.includes(`\${IL_LEAF_${d.startsWith('M18.6') ? 'L' : 'R'}}`)) {
    fail('the decision gate does not draw the canonical leaf geometry');
  }
}
// A position, not a sequence. The five-state gate stinger encodes a
// review-then-open lifecycle the frozen packets never emitted, and HARVEST.md
// already rejected the module that carried it. It may not return here.
for (const [re, label] of [
  [/animation:[^;]*il-gate-open/, 'the gate-opening stinger'],
  [/animation:[^;]*il-converge/, 'the trajectory-convergence stinger'],
  [/animation:[^;]*il-pass/, 'the passage stinger'],
  [/--mot-p[1-5]-/, 'the five-phase stinger cadence'],
]) {
  if (re.test(cockpit)) {
    fail(`the cockpit plays ${label}; the gate represents a recorded decision, not a deliberation`);
  }
}
if (/\blottie|dotlottie|\.lottie\b|\brive\b|\bgsap\b|framer-motion/i.test(cockpit)) {
  fail('an animation runtime reached the cockpit; HAC-347 recorded the dependency as REJECTED');
}

/* --- the semantic icon vocabulary (HAC-345) ----------------------------- */

/**
 * One concept, one glyph, and the glyph is the bytes we vendored.
 *
 * Three failures these prevent, in the order they are likely:
 *
 *   1. Drift. Inlining path data for speed is fine; inlining it and letting the
 *      vendored file move underneath is a copy that quietly stops being the
 *      thing it claims provenance for. Both sides run through one normalizer.
 *   2. Synonyms. `Verify this decision` acquiring a magnifier in the action row
 *      and a shield in the drawer costs a judge the thing the vocabulary was
 *      added to buy. The map has to be injective in both directions.
 *   3. Substitution. A padlock or shield standing in for the Interlock
 *      mechanism makes the product-specific claim with a stock outline. The
 *      vocabulary may not contain one at all, so it cannot be reached for.
 */
if (!/from '\/media\/hac-341\/lib\/icons\.mjs'/.test(cockpit)) {
  fail('cockpit does not consume the shared semantic icon vocabulary');
}
for (const [name, body] of Object.entries(ICONS)) {
  const file = join(repoRoot, ICON_SOURCE.vendorDir, `${name}.svg`);
  if (!existsSync(file)) {
    fail(`the icon vocabulary inlines ${name}, which is not vendored under ${ICON_SOURCE.vendorDir}`);
    continue;
  }
  if (lucideBody(readFileSync(file, 'utf8')) !== body) {
    fail(`the inlined geometry for ${name} has drifted from ${ICON_SOURCE.vendorDir}/${name}.svg`);
  }
}
if (!existsSync(join(repoRoot, ICON_SOURCE.licenseFile))) {
  fail('the vendored icon geometry is carried without its licence');
}
// The registry digest-gates the bytes. A vendored file nobody registered is a
// file `check:identity` will not notice changing.
const registryFiles = new Set(
  read('assets', 'registry.json').assets.flatMap((a) => (a.files ?? []).map((f) => f.file)),
);
for (const name of Object.keys(ICONS)) {
  const rel = `${ICON_SOURCE.vendorDir}/${name}.svg`;
  if (!registryFiles.has(rel)) fail(`${rel} is vendored but not registered; its bytes are not digest-gated`);
}
if (!registryFiles.has(ICON_SOURCE.licenseFile)) {
  fail(`${ICON_SOURCE.licenseFile} is not registered; the licence is not digest-gated`);
}
// The map is a bijection: no concept drawn two ways, no glyph meaning two things.
const drawnBy = new Map();
for (const concept of CONCEPTS) {
  const glyph = SEMANTICS[concept].icon;
  if (!(glyph in ICONS)) fail(`concept ${concept} names ${glyph}, which the vocabulary does not carry`);
  if (drawnBy.has(glyph)) {
    fail(`${glyph} draws both ${drawnBy.get(glyph)} and ${concept}; one glyph may carry one meaning`);
  }
  drawnBy.set(glyph, concept);
  if (!SEMANTICS[concept].meaning) fail(`concept ${concept} declares no meaning a call site can be checked against`);
}
for (const glyph of Object.keys(ICONS)) {
  if (!drawnBy.has(glyph)) fail(`${glyph} is vendored and inlined but names no concept; the vocabulary has dead weight`);
}
// The mechanism is Interlock's own geometry. The vocabulary may not offer a
// generic stand-in for it, at any name.
for (const glyph of Object.keys(ICONS)) {
  if (/lock|shield|key|gate|fingerprint|scan-face/.test(glyph)) {
    fail(`the generic vocabulary carries "${glyph}"; the Interlock mechanism is drawn with assets/logo geometry`);
  }
}
// Every concept the cockpit draws is one the map declares, and every concept
// the map declares is one the cockpit draws.
// Every `icon(...)` call site, arguments and all — a concept is often chosen by
// a ternary on recorded state, so matching only a leading literal would miss
// exactly the call sites that matter most.
const NON_CONCEPT_ARGS = new Set(['sm', 'md', 'lg', 'il-ic--after']);
const drawnConcepts = new Set();
for (const [, args] of cockpit.matchAll(/\bicon\(([^)]*)\)/g)) {
  if (args.includes('ACTION_ICON')) continue;
  for (const [, literal] of args.matchAll(/'([A-Za-z][\w-]*)'/g)) {
    if (NON_CONCEPT_ARGS.has(literal)) continue;
    if (!CONCEPTS.includes(literal)) fail(`the cockpit draws an undeclared concept "${literal}"`);
    drawnConcepts.add(literal);
  }
}
// ACTION_ICON is the indirection the two action rows share; its values are
// concepts too, and a typo there would silently throw at render time.
const actionMap = /const ACTION_ICON = \{([^}]*)\}/.exec(cockpit)?.[1] ?? '';
if (!actionMap) fail('the verification action row declares no shared icon map');
for (const [, value] of actionMap.matchAll(/:\s*'([A-Za-z]+)'/g)) {
  if (!CONCEPTS.includes(value)) fail(`ACTION_ICON maps a control to undeclared concept "${value}"`);
  drawnConcepts.add(value);
}
for (const c of CONCEPTS) {
  if (!drawnConcepts.has(c)) fail(`concept ${c} is declared but never drawn; the vocabulary has dead weight`);
}
// Icons supplement text and never announce themselves: the label beside them
// already says it, and a glyph with a name makes a screen reader say it twice.
for (const c of CONCEPTS) {
  const svg = icon(c);
  if (!svg.includes('aria-hidden="true"')) fail(`the ${c} glyph is not hidden from assistive technology`);
  if (/aria-label|role="img"|<title/.test(svg)) fail(`the ${c} glyph names itself; it must supplement the label, not repeat it`);
}
// Colour is never the distinction. The two outcome states are different shapes,
// not one shape in two hues.
if (SEMANTICS.pass.icon === SEMANTICS.unsafe.icon) {
  fail('pass and unsafe share a glyph; the state would be carried by colour alone');
}
if (!/icon\(row\.outcome\.holds \? 'pass' : 'unsafe'/.test(cockpit)) {
  fail('the outcome card does not draw its state from the recorded holds flag');
}
// The vocabulary is decoration if it is drawn without its words. Each control
// row keeps the label the glyph sits beside.
for (const label of ['Verify this decision', 'Compare coordination strategies',
  'Show me the raw proof', 'What is not claimed?', 'Walk the proof']) {
  if (!cockpit.includes(label)) fail(`"${label}" lost its visible label to an icon`);
}

/* --- keyboard: one global key, two scoped groups ------------------------ */

if (!/e\.target\.closest\?\.\('\[data-guide-rail\]'\)/.test(cockpit)) {
  fail('step arrows are not scoped to the step rail');
}
if (!/e\.target\.closest\?\.\('\[data-strat-group\]'\)/.test(cockpit)) {
  fail('strategy arrows are not scoped to the strategy group');
}
if (!/if \(!rail && !strats\) return;/.test(cockpit)) {
  fail('arrow keys are handled outside the two roving groups');
}
if (!/data-guide-back/.test(cockpit) || !/data-guide-next/.test(cockpit)) {
  fail('the walk has no arrow-free Back/Next path');
}
if (!/tabindex="\$\{current \? 0 : -1\}"/.test(cockpit)) fail('the step rail does not use a roving tabindex');
if (/scrollIntoView/.test(cockpit)) fail('a step change scrolls the page; the active evidence must stay in view');
if (!/focus\(\{ preventScroll: true \}\)/.test(cockpit)) fail('focus restoration may scroll the evidence out of view');
// The prototype's focus timeouts must not survive into the executable.
if (/setTimeout\([^)]*\.focus\(\)/.test(cockpit)) fail('focus is moved on a timer rather than on the element that exists');

/* --- one side panel, and it names the arm it explains -------------------- */

if ((cockpit.match(/<aside/g) ?? []).length !== 1) {
  fail('more than one side panel element exists; only one panel may be open at a time');
}
if (!/openPanel = kind/.test(cockpit) || !/if \(openPanel === kind\) return closeDrawer\(\)/.test(cockpit)) {
  fail('the open panel is not tracked as one state');
}
if (!/selected arm \$\{esc\(selected\.label\)\}/.test(cockpit)) {
  fail('the verification panel does not name the recorded arm it is explaining');
}

/* --- the HAC-343 comparison binds, or says that it did not --------------- */

const cmp = model.comparison;
if (!cmp) fail('the view model carries no coordination-strategy comparison');
else {
  for (const dim of DIMENSIONS) {
    if (!cmp.dimensions.includes(dim)) fail(`the comparison is missing the ${dim} dimension`);
  }
  if (cmp.strategies.length !== STRATEGY_ARMS.length) {
    fail(`the comparison shows ${cmp.strategies.length} strategies; HAC-343 records ${STRATEGY_ARMS.length}`);
  }
  for (const s of cmp.strategies) {
    if (!STRATEGY_ARMS.includes(s.armId)) fail(`the comparison shows ${s.armId}, which is not a HAC-343 arm`);
    for (const cell of s.cells) {
      const [artifact, path] = BINDINGS[cell.dimension](s.armId);
      if (cell.source !== `${artifact}#${path}`) {
        fail(`${s.armId}/${cell.dimension} cites ${cell.source}; the binding table says ${artifact}#${path}`);
      }
      // Unresolved must look unresolved. A cell that is neither bound nor
      // visibly unbound is the failure mode this whole panel is built around.
      if (!cell.resolved && !/^\[BIND: .+\]$/.test(cell.value)) {
        fail(`${s.armId}/${cell.dimension} is unbound but does not render as a binding`);
      }
      if (cell.resolved && /\[BIND:/.test(cell.value)) {
        fail(`${s.armId}/${cell.dimension} claims to be bound while rendering a placeholder`);
      }
    }
  }
  // Bound cells must match the frozen artifact they cite, read fresh.
  // An artifact that is *present but unreadable* is a build defect, not an
  // absence: it silently unbinds every cell it feeds while this gate, reading
  // it the same forgiving way, agrees that nothing is wrong.
  const sources = {};
  for (const rel of cmp.artifacts) {
    const abs = join(repoRoot, ...rel.split('/'));
    if (!existsSync(abs)) continue;
    try {
      sources[rel] = read(...rel.split('/'));
    } catch (error) {
      fail(`${rel} is present but did not parse (${error.message}); its cells would unbind silently`);
    }
  }

  /**
   * On a tree that has the evidence, "unresolved" is a defect, not a state.
   *
   * The `[BIND: ...]` scaffold exists so this surface can build in a checkout
   * that does not carry HAC-343. Where the evidence *is* present, a cell that
   * did not bind means the artifact moved, truncated or was hand-edited — and
   * the panel would ship four strategy labels reading `[BIND: ...]` to a judge
   * with every gate green.
   */
  if (existsSync(join(repoRoot, 'experiments', 'hac-343', 'evidence')) && !cmp.resolved) {
    fail(`HAC-343 evidence is present but ${cmp.unresolved.length} binding(s) did not resolve: ${cmp.unresolved.slice(0, 3).join(', ')}`);
  }

  /**
   * Every cited artifact must be verified by something.
   *
   * Three of the four are covered by `check:packet:eval` — freeze commits, byte
   * identity, and a full recomputation from the raw records. `judge-export.json`
   * was covered by nothing: it is a derived presentation artifact that no gate
   * rebuilt and no test mutated, yet ten judge-facing values reach the panel
   * through it alone, including all four strategy labels and the figure that
   * makes the per-target lock credible. A hand edit there survived every gate.
   */
  const DERIVED_ARTIFACTS = { 'experiments/hac-343/evidence/judge-export.json': 'experiments/hac-343/bin/build-judge-export.mjs' };
  const verifierPath = join(repoRoot, 'experiments', 'hac-343', 'bin', 'verify-packet.mjs');
  const ciPath = join(repoRoot, '.github', 'workflows', 'ci.yml');
  const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, 'utf8') : null;
  const ci = existsSync(ciPath) ? readFileSync(ciPath, 'utf8') : null;
  if (cmp.artifacts.some((rel) => existsSync(join(repoRoot, ...rel.split('/')))) && verifier === null) {
    fail('HAC-343 evidence is bound but experiments/hac-343/bin/verify-packet.mjs is absent; nothing verifies it');
  }
  for (const rel of cmp.artifacts) {
    if (!existsSync(join(repoRoot, ...rel.split('/'))) || verifier === null) continue;
    const name = rel.split('/').pop();
    if (verifier.includes(name)) continue;
    if (rel in DERIVED_ARTIFACTS) {
      // A derived artifact is verified by reproducing it. The gate that does so
      // must exist and must be wired, or this is a hole with a name.
      if (!existsSync(join(repoRoot, ...DERIVED_ARTIFACTS[rel].split('/')))) {
        fail(`${rel} is bound by the comparison and its declared generator ${DERIVED_ARTIFACTS[rel]} does not exist`);
      }
      if (ci === null) {
        fail(`${rel} is bound by the comparison and the workflow that must reproduce it is unreadable`);
        continue;
      }
      /**
       * A shape that can be checked, not a script that must be interpreted.
       *
       * Searching a `run:` body for a command does not work and cannot be made
       * to work by reading harder: `if false; then`, a heredoc and an open
       * quoted string each place a command at the start of a line without
       * executing it. So the contract is one enforcement operation per step,
       * whose `run` is exactly the expected command — which is why the
       * judge-export rebuild and its byte assertion are two steps rather than
       * one script.
       */
      if (jobSteps(ci, 'evaluation-gate') === null) {
        fail('the evaluation-gate job does not exist; the HAC-343 packet runs in no CI job of its own');
        continue;
      }
      /**
       * One canonical sequence, compared position by position.
       *
       * Presence-based verification was not enough. Every required step could
       * be exact, unconditional and failure-propagating while the byte
       * assertion ran *before* the rebuild it asserts about, or while an
       * interposed step reverted the rebuild first — both left all four
       * operations present and one of them vacuous. A sequence has no gaps to
       * hide in, and `rebuild index + 1 === assertion index` falls out of it
       * instead of being a rule of its own.
       *
       * The shape is written out rather than derived: an evidence gate whose
       * expected form is inferred from the file it is checking proves nothing.
       * Changing the job legitimately means changing this list, on purpose.
       */
      const SETUP_PNPM = 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4';
      // `keys` is an allowlist: a step declares exactly these and nothing else.
      const ACTION = ['uses', 'with'];
      const RUN_STEP = ['name', 'run'];
      const SHAPE = [
        { uses: 'actions/checkout@v4', with: { 'fetch-depth': '0' }, keys: ACTION },
        { uses: SETUP_PNPM, keys: ['uses'] },
        { uses: 'actions/setup-node@v4', with: { 'node-version': "'22.19.0'", cache: 'pnpm' }, keys: ACTION },
        { name: 'Install dependencies', run: 'pnpm install --frozen-lockfile --ignore-scripts', keys: RUN_STEP },
        { name: 'Verify the HAC-343 evaluation packet', run: 'pnpm run check:packet:eval', keys: RUN_STEP },
        { name: "The cockpit's HAC-343 bindings fail when the packet moves", run: 'pnpm vitest run test/hac-343-check-wiring.test.mjs', keys: RUN_STEP },
        { name: 'Rebuild the derived judge export', run: `node ${DERIVED_ARTIFACTS[rel]}`, keys: RUN_STEP },
        { name: 'The judge export is byte-identical to its rebuild', run: `git diff --exit-code -- ${rel}`, keys: RUN_STEP },
        // The one permitted conditional, and it must be last: it reports, and
        // a reporting step that ran earlier could report on nothing.
        { name: 'Explain the failure', conditional: 'failure()', keys: ['name', 'if', 'run'] },
      ];
      // Named so the adjacency the whole class turned on is not merely implied.
      const rebuildAt = SHAPE.findIndex((x) => x.run === `node ${DERIVED_ARTIFACTS[rel]}`);
      const assertAt = SHAPE.findIndex((x) => x.run === `git diff --exit-code -- ${rel}`);
      if (rebuildAt < 0 || assertAt !== rebuildAt + 1) {
        fail('the accepted shape does not assert the judge export immediately after rebuilding it');
      }
      if (SHAPE.at(-1).conditional !== 'failure()') {
        fail('the accepted shape does not end with the failure explanation');
      }

      /**
       * The trigger, pinned like everything below it.
       *
       * The job and its nine steps can be exactly right and never run. A
       * workflow narrowed to `workflow_dispatch` still contains a perfectly
       * valid evaluation gate while enforcement on the submission path is
       * simply gone — so the top level is an allowlist of keys plus an exact
       * projection of the blocks that decide when the gate runs and with what.
       * Nothing here interprets an event or an expression; the lines either
       * match the canonical ones or they do not.
       *
       *     workflow trigger -> exact job -> exact ordered steps -> exact commands
       */
      const WORKFLOW = {
        keys: ['name', 'on', 'permissions', 'concurrency', 'jobs'],
        blocks: {
          on: ['  pull_request:', '  push:', '    branches: [main]'],
          permissions: ['  contents: read'],
          concurrency: [
            '  group: ci-${{ github.workflow }}-${{ github.ref }}',
            "  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
          ],
        },
      };
      for (const defect of workflowShapeDefects(ci, WORKFLOW)) {
        fail(`the workflow's execution contract has changed: ${defect}`);
      }

      /**
       * Allowlisted, not blacklisted. A list of forbidden keys is only ever as
       * complete as the last review that extended it — `defaults`, `strategy`,
       * `container` and `services` were each added after someone found them —
       * and the next one is whatever nobody has thought of yet.
       */
      const jobKeyProblem = jobKeyDefect(ci, 'evaluation-gate', ['name', 'runs-on', 'steps']);
      if (jobKeyProblem) fail(`evaluation-gate is outside the accepted grammar: ${jobKeyProblem}`);

      // Inherited from above the job, and carried by every step without being
      // named in any of them.
      const wfEnv = workflowEnvDefect(ci);
      if (wfEnv) fail(`evaluation-gate steps do not run as written: ${wfEnv}`);

      const jobDefect = jobEnforcementDefect(jobControls(ci, 'evaluation-gate'), 'ubuntu-24.04');
      if (jobDefect) fail(`evaluation-gate cannot enforce anything: ${jobDefect}`);

      const checkout = checkoutDefect(ci, 'evaluation-gate');
      if (checkout) fail(`evaluation-gate checkout cannot support the freeze checks: ${checkout}`);

      // A step can carry no `shell:` and no `working-directory:` of its own and
      // still inherit both from a `defaults.run` map it never mentions.
      const inherited = runDefaultsDefect(ci, 'evaluation-gate');
      if (inherited) fail(`evaluation-gate steps do not run as written: ${inherited}`);

      for (const defect of shapeDefects(jobSteps(ci, 'evaluation-gate') ?? [], SHAPE)) {
        fail(`evaluation-gate departs from its accepted shape: ${defect}`);
      }
      continue;
    }
    fail(`${rel} is bound by the comparison but is verified by no gate`);
  }
  const rebuilt = buildComparison(sources);
  /**
   * Deep equality on one canonical projection, not a list of fields somebody
   * has to remember to extend. Comparing `strategies` alone left the A3
   * credibility figure, its note, the panel's scope boundary and the canonical
   * result commit unguarded: inverting the figure that establishes the
   * per-target lock was a real lock passed every gate.
   */
  const committedFacing = judgeFacing(cmp);
  const rebuiltFacing = judgeFacing(rebuilt);
  for (const field of JUDGE_FACING_FIELDS) {
    if (!(field in committedFacing)) {
      fail(`the judge-facing projection is missing ${field}; a rendered field outside it is unguarded`);
      continue;
    }
    if (JSON.stringify(rebuiltFacing[field]) !== JSON.stringify(committedFacing[field])) {
      fail(`comparison.${field} is not what its cited HAC-343 artifacts produce`);
    }
  }
  /**
   * Coverage derived from the renderer, not from a second hand-written list.
   *
   * The previous version compared one literal array against another literal
   * array in this same file, which cannot falsify anything. This reads the
   * comparison markup and asks which fields it actually touches, so rendering a
   * new field without adding it to the projection — the exact way the A3
   * credibility figure went unguarded — fails here.
   */
  const comparisonMarkup = (/function comparisonHtml\(\)[\s\S]*?\n}/.exec(cockpit)?.[0] ?? '')
    + (/const sub = kind === 'compare'[\s\S]*?;\n/.exec(cockpit)?.[0] ?? '');
  if (!comparisonMarkup) fail('cannot locate the comparison renderer; its field coverage cannot be checked');
  const rendered = new Set([...comparisonMarkup.matchAll(/\bc\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]));
  for (const field of rendered) {
    if (!JUDGE_FACING_FIELDS.includes(field)) {
      fail(`the comparison renders c.${field}, which the judge-facing projection does not carry`);
    }
  }
  if (rendered.size < 8) fail(`only ${rendered.size} comparison fields were detected; the coverage scan is not reading the renderer`);
  // The scaffold banner is a claim too: it may not appear over bound evidence,
  // and it may not be missing when something is genuinely unbound.
  const banner = /\$\{c\.resolved \? '' : `<p class="cmp-head"><span class="cmp-scaffold">/.test(cockpit);
  if (!banner) fail('the unresolved-scaffold label is not conditioned on the comparison actually being unresolved');
  if (cmp.unresolvedLabel !== 'Unresolved binding scaffold · not evidence') {
    fail('the unresolved scaffold is not labelled as not-evidence');
  }
  // Two experiments, two panels. A HAC-330 value inside the comparison would
  // read as one continuous evaluation that never happened.
  const cmpText = JSON.stringify(cmp.strategies);
  for (const re of [/140 > 130/, /120 <= 130/, /WITHHOLD_SERIALIZE/, /hac330/i]) {
    if (re.test(cmpText)) fail('a HAC-330 value appears inside the HAC-343 comparison');
  }
  if (!/different experiment/i.test(cmp.separateExperiment)) {
    fail('the comparison does not say it is a different experiment from the run on screen');
  }
  // Every cell shows where it came from, bound or not.
  if (!/class="cmp-src">\$\{esc\(cell\.source\)\}/.test(cockpit)) {
    fail('the comparison renders a value without the field it was read from');
  }
  // The panel identifies the experiment it shows, not the run it was opened from.
  if (!/kind === 'compare'\s*\? `\$\{esc\(c\.sourceIssue\)\}/.test(cockpit)) {
    fail('the comparison panel does not derive its own provenance from the comparison model');
  }
  // Only the `compare` branch of the ternary; the other branch names the run
  // it is explaining, which is correct for verification and raw proof.
  const compareBranch = /kind === 'compare'\s*\?\s*`([^`]*)`/.exec(cockpit)?.[1] ?? '';
  if (!compareBranch) fail('cannot locate the comparison panel subtitle');
  else if (/\brun\./.test(compareBranch)) {
    fail("the comparison panel labels itself with the HAC-330 run's identity");
  }
  if (cmp.sourceIssueSource !== 'experiments/hac-343/evidence/judge-export.json#experiment') {
    fail('the comparison names its experiment from something other than the frozen export');
  }
}
// A `[BIND: ...]` may exist only inside the comparison scaffold, and only while
// that scaffold reports itself unresolved.
const modelWithoutComparison = JSON.stringify({ ...model, comparison: undefined });
if (/\[BIND:/.test(modelWithoutComparison)) {
  fail('an unresolved binding placeholder appears outside the comparison scaffold');
}
if (/\[BIND:/.test(JSON.stringify(model.comparison ?? {})) && model.comparison?.resolved) {
  fail('the comparison reports itself resolved while carrying binding placeholders');
}

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

/* Every module import and evidence fetch resolves from the site root.
 *
 * `vercel.json` rewrites `/` and `/cockpit` onto this file. A rewrite serves
 * these bytes without changing the request URL, and a document-relative
 * specifier resolves against the *request* URL — so `./lib/guide.mjs` became
 * `/lib/guide.mjs` and aborted, and the two URLs a judge actually visits
 * rendered a blank page while still returning HTTP 200.
 *
 * The visual gate could not see it: it loads `/media/hac-341/cockpit.html`
 * directly, which is the one path where the relative form happens to work.
 * This is a static check for that reason — it needs no server and no
 * deployment, and it fails on the specifier rather than on the symptom.
 */
for (const m of cockpit.matchAll(/(?:^|\s)(?:import\b[^;]*?from|await\s+fetch\(|import\()\s*['"](\.[^'"]*)['"]/g)) {
  fail(`document-relative reference "${m[1]}" breaks under the vercel.json rewrite; anchor it at /media/hac-341/`);
}

const checksLabel = local.checks.label;
if (errors.length) {
  process.stderr.write(`HAC-341 cockpit contract violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'HAC-341 cockpit verified\n'
  + `  class A ${local.runIdentity}: ${local.arms.length} frozen arms, checks ${checksLabel}, no receipt/observer\n`
  + `  class B ${cloud.runIdentity}: ${cloud.events.length} hops, controls ${controls}, no arms/outcome\n`
  + `  ${model.degradedStates.length} degraded states, evidence links pinned to immutable commits\n`
  + `  guided walk: ${GUIDE_STEPS.length} steps, ${GUIDE_STATES.length} addressable states,`
  + ` ${delta.held.length} held / ${delta.changed.length} changed verified against the frozen arms\n`
  + `  motion: ${[...sequences].sort(byCodeUnit).join(', ')} — one-shot, documented, budget ${durHold}ms,`
  + ' settling at data-motion="settled"\n'
  + `  icon vocabulary: ${CONCEPTS.length} concepts, ${Object.keys(ICONS).length} vendored glyphs`
  + ` verified against ${ICON_SOURCE.vendorDir} @ ${ICON_SOURCE.commit.slice(0, 12)}, no generic mechanism stand-in\n`
  + `  HAC-343 comparison: ${model.comparison?.strategies.length ?? 0} strategies x ${model.comparison?.dimensions.length ?? 0} dimensions,`
  + ` ${model.comparison?.resolved ? 'all bindings resolved' : `${model.comparison?.unresolved.length ?? 0} unresolved bindings shown as [BIND: ...]`}\n`,
);
