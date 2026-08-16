#!/usr/bin/env node
/**
 * Refuses a storyboard that has drifted from the HAC-333 contract.
 *
 * The checks here are semantic, not decorative. Each one corresponds to a way
 * the story could become untrue: the two proof classes bleeding into one run,
 * a lifecycle state appearing that no frozen packet emits, a scene that only
 * makes sense while it is moving, or a claim the evidence does not carry.
 *
 * Timing is derived from the scenes rather than read from a total field, so a
 * scene edit cannot leave a stale 30.00 behind and still pass.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '..', 'scene-manifest.json'), 'utf8'));
const storyboard = readFileSync(join(here, '..', 'storyboard.html'), 'utf8');

const errors = [];
const fail = (msg) => errors.push(msg);
const round2 = (n) => Math.round(n * 100) / 100;

const scenes = manifest.scenes;
const REQUIRED_TOTAL = 30.0;
const EXPECTED_IDS = ['SB-00', 'SB-01', 'SB-02', 'SB-03', 'SB-04', 'SB-05', 'SB-06', 'SB-07', 'SB-08'];

/* --- timing: derived, contiguous, exact ------------------------------- */

if (scenes.length !== EXPECTED_IDS.length) fail(`expected ${EXPECTED_IDS.length} scenes, found ${scenes.length}`);

const ids = scenes.map((s) => s.sceneId);
if (new Set(ids).size !== ids.length) fail(`duplicate scene ids: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(', ')}`);
EXPECTED_IDS.forEach((id, i) => { if (ids[i] !== id) fail(`scene ${i} should be ${id}, found ${ids[i]}`); });

const derivedTotal = round2(scenes.reduce((sum, s) => sum + s.duration, 0));
if (derivedTotal !== REQUIRED_TOTAL) fail(`scene durations sum to ${derivedTotal}, required exactly ${REQUIRED_TOTAL}`);
if (manifest.totalDuration !== REQUIRED_TOTAL) fail(`manifest totalDuration ${manifest.totalDuration} != ${REQUIRED_TOTAL}`);

let cursor = 0;
for (const s of scenes) {
  if (round2(s.start) !== round2(cursor)) fail(`${s.sceneId} starts at ${s.start}, expected ${round2(cursor)} — gap or overlap`);
  if (round2(s.end - s.start) !== round2(s.duration)) fail(`${s.sceneId} end-start (${round2(s.end - s.start)}) != duration (${s.duration})`);
  cursor = s.end;
}
if (round2(cursor) !== REQUIRED_TOTAL) fail(`timeline ends at ${round2(cursor)}, required ${REQUIRED_TOTAL}`);

/* --- proof-class separation ------------------------------------------- */

const byId = Object.fromEntries(scenes.map((s) => [s.sceneId, s]));
const sb06 = byId['SB-06'];
if (sb06?.proofClass !== 'transition') fail('SB-06 must be the proof-class separator');
const classA = scenes.filter((s) => s.proofClass === 'A').map((s) => s.sceneId);
const classB = scenes.filter((s) => s.proofClass === 'B').map((s) => s.sceneId);
if (classA.length === 0 || classB.length === 0) fail('both proof classes must be present');
// Every class-A scene must complete before the separator, and every class-B
// scene must begin after it. Interleaving would let a viewer read one run.
for (const id of classA) if (byId[id].end > sb06.start) fail(`${id} (class A) does not complete before the SB-06 reset`);
for (const id of classB) if (byId[id].start < sb06.end) fail(`${id} (class B) begins before the SB-06 reset completes`);

// No scene may cite both HAC-330 and HAC-340 as evidence for one run. Two
// scenes name both by design — the separator and the claim boundary — and for
// those the requirement inverts: they must label each proof distinctly, which
// is what keeps naming both from reading as one merged run.
const NAMES_BOTH_BY_DESIGN = new Set(['transition', 'close']);
for (const s of scenes) {
  const issues = s.sourceIssue ?? [];
  const citesBoth = issues.includes('HAC-330') && issues.includes('HAC-340');
  if (!citesBoth) continue;
  if (!NAMES_BOTH_BY_DESIGN.has(s.proofClass)) {
    fail(`${s.sceneId} cites HAC-330 and HAC-340 in one scene; the runs must not merge`);
    continue;
  }
  const labelled = JSON.stringify([s.factualBindings ?? [], s.editorialCopy ?? []]);
  const localLabelled = /HAC-330|controlled|local/i.test(labelled);
  const cloudLabelled = /HAC-340|Google Cloud|cloud/i.test(labelled);
  if (!localLabelled || !cloudLabelled) {
    fail(`${s.sceneId} names both proof classes without labelling each one distinctly`);
  }
}

/* --- forbidden vocabulary --------------------------------------------- */

// Lifecycle states no frozen packet emits, and stale-issue semantics the
// pivot removed. Checked against copy and captions, not against non-claims:
// "not human approved" must stay sayable.
const FORBIDDEN_COPY = [
  [/\bAUTHORIZED\b/, 'AUTHORIZED lifecycle state (no frozen packet emits it)'],
  [/\bJOINT REVIEW\b/i, 'JOINT REVIEW (stale HAC-317 lifecycle)'],
  [/\bhuman[- ]approv/i, 'human approval (stale HAC-317 lifecycle)'],
  [/\bexactly[- ]once\b/i, 'exactly-once (HAC-327, out of scope)'],
  [/\bboth withheld\b/i, 'both withheld (stale pre-pivot experiment)'],
  [/cannot authorize/i, 'observer-cannot-authorize (authority separation is not evidenced)'],
];
const copyOf = (s) => [...(s.editorialCopy ?? []), s.title ?? '', s.semanticJob ?? '', s.startState ?? '', s.endState ?? ''].join(' | ');
for (const s of scenes) {
  for (const [re, label] of FORBIDDEN_COPY) if (re.test(copyOf(s))) fail(`${s.sceneId} copy contains ${label}`);
}

// HAC-316 may appear only as failed/pivoted provenance, never as causal authority.
for (const s of scenes) {
  if ((s.sourceIssue ?? []).includes('HAC-316')) fail(`${s.sceneId} cites HAC-316 as source authority; it is failed/pivoted provenance`);
}
// HAC-317 / HAC-318 lifecycle must not be required for the current story.
for (const s of scenes) {
  for (const stale of ['HAC-317', 'HAC-318']) {
    if ((s.sourceIssue ?? []).includes(stale)) fail(`${s.sceneId} depends on ${stale}; the current story must not require it`);
  }
}

/* --- frozen values that carry the claims ------------------------------ */

const bindingsOf = (s) => (s.factualBindings ?? []).join(' | ');
const REQUIRED_BINDINGS = [
  ['SB-03', /140 > 130/, 'baseline 140 > 130'],
  ['SB-04', /WITHHOLD_SERIALIZE/, 'WITHHOLD_SERIALIZE'],
  ['SB-04', /120 <= 130/, 'treatment 120 <= 130'],
  ['SB-04', /24\/24/, 'checks 24/24'],
  ['SB-05', /ALLOW_PARALLEL/, 'perturbed ALLOW_PARALLEL'],
  ['SB-05', /140 > 130/, 'perturbed 140 > 130'],
];
for (const [id, re, label] of REQUIRED_BINDINGS) {
  if (!re.test(bindingsOf(byId[id] ?? {}))) fail(`${id} lost its frozen binding: ${label}`);
}

// Cloud negative controls are exactly these three. A change without source
// authority is a claim change, not a copy edit.
const cloudCopy = JSON.stringify(byId['SB-07'] ?? {}) + storyboard;
for (const code of ['403', '401']) {
  if (!cloudCopy.includes(code)) fail(`SB-07 no longer shows cloud control ${code}`);
}
// Claim-bearing fields only. explicitNonClaims must be able to say the words:
// "wrong-audience rejection is local parity, not shown here" is the disclaimer,
// not the claim.
const sb07Claims = JSON.stringify([
  byId['SB-07']?.factualBindings ?? [], byId['SB-07']?.editorialCopy ?? [],
  byId['SB-07']?.title ?? '', byId['SB-07']?.semanticJob ?? '',
]);
if (/wrong[- ]audience/i.test(sb07Claims)) {
  fail('SB-07 claims wrong-audience rejection as a cloud result; it is controlled local parity');
}
// Only the proxy revision is evidenced (HAC-342 reconciliation).
for (const rev of ['interlock-hac340-agent-00002', 'interlock-hac340-target-00002']) {
  if (storyboard.includes(rev)) fail(`storyboard shows unevidenced deployment revision ${rev}`);
}

/* --- static / reduced-motion parity ----------------------------------- */

for (const s of scenes) {
  for (const field of ['staticEquivalent', 'reducedMotionEquivalent', 'holdState', 'motionJob']) {
    if (!s[field]) fail(`${s.sceneId} is missing ${field}`);
  }
  for (const field of ['semanticStateId', 'holdStateId', 'captureStateId']) {
    if (!s[field]) fail(`${s.sceneId} is missing ${field}`);
  }
}
// A reduced-motion equivalent that merely disables motion is not an equivalent
// if the frame it leaves behind lost the causal order.
if (!/prefers-reduced-motion/.test(storyboard)) fail('storyboard has no prefers-reduced-motion handling');
if (!/data-static/.test(storyboard)) fail('storyboard has no static resolution');

/* --- storyboard and manifest agree ------------------------------------ */

for (const s of scenes) {
  if (!storyboard.includes(`data-scene-id="${s.sceneId}"`)) fail(`storyboard has no frame for ${s.sceneId}`);
  if (!storyboard.includes(`data-semantic-state="${s.semanticStateId}"`)) fail(`storyboard frame ${s.sceneId} missing semantic state ${s.semanticStateId}`);
  if (!storyboard.includes(`data-capture-state="${s.captureStateId}"`)) fail(`storyboard frame ${s.sceneId} missing capture state ${s.captureStateId}`);
}
for (const [re, label] of FORBIDDEN_COPY) {
  // Non-claim text legitimately contains these words; check only rendered copy.
  const rendered = storyboard.replace(/<div class="annot"[\s\S]*?<\/div>/g, '').replace(/Not claimed[\s\S]*?<\/ul>/g, '');
  if (re.test(rendered)) fail(`storyboard rendered copy contains ${label}`);
}

/* --- geometry and publication bindings -------------------------------- */

if (manifest.geometry?.width !== 1920 || manifest.geometry?.height !== 1080) fail('storyboard geometry must be 1920x1080');
const pub = manifest.publicEvidence ?? {};
if (pub.evidencePublicationSha !== '75253e38791e69f7e2a4bb3a041044a9114c32f0') fail('evidencePublicationSha does not match the HAC-342 publication');
if (pub.runtimeSourceShaPublished !== false) fail('runtimeSourceSha must remain marked unpublished');
if (pub.runtimeSourceUrl?.state !== 'unavailable / non-public') fail('runtimeSourceUrl must remain the explicit unavailable state');
if (/\[BIND:/.test(storyboard)) fail('storyboard contains an unresolved [BIND: ...] placeholder');

/* --- report ----------------------------------------------------------- */

if (errors.length > 0) {
  process.stderr.write(`HAC-333 storyboard contract violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'HAC-333 storyboard verified\n'
  + `  scenes ${scenes.length}, derived total ${derivedTotal.toFixed(2)}s, contiguous with no gap or overlap\n`
  + `  proof class A ${classA.join(' ')} -> SB-06 reset -> class B ${classB.join(' ')}\n`
  + `  semantic states ${scenes.map((s) => s.semanticStateId).length}, each with hold and capture ids\n`,
);
