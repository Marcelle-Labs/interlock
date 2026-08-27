#!/usr/bin/env node
/**
 * The HAC-350 gate.
 *
 * Node builtins only, deterministic, and it re-derives rather than trusts:
 * every figure the cut renders is recomputed from the frozen HAC-343 and
 * HAC-330 artifacts and compared against `evidence/bindings.json`, so a
 * bindings file edited by hand turns this red instead of quietly becoming the
 * new truth.
 *
 * What it establishes, in the order the storyboard would ask:
 *
 *   1. the world did not move — one scale, one baseline, one set of columns;
 *   2. the frame at t does not depend on how t was reached;
 *   3. each scene asserts the semantic state its frozen record actually holds;
 *   4. the reduced-motion path says the same things;
 *   5. no annotation, and no unsupported claim, reached a production master.
 *
 * The fifth is a vocabulary check and is deliberately blunt. A gate that tried
 * to judge whether a sentence overclaimed would be a gate nobody could argue
 * with; a list of words the plate may not contain is one anybody can.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plateAt, semanticsAt, seq, SCENES, buildTracks } from './lib/replay.mjs';
import { composePlate } from './lib/plate.mjs';
import { assertWorldInvariants, SCALE, BASE_Y, COLUMNS, FRAME, ruleY } from './lib/world.mjs';
import { frameTimes, canonicalTimes, settle, frameAt } from '../../hac-334/bin/lib/motion.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const repoRoot = join(pkgDir, '..', '..');

const errors = [];
const fail = (m) => errors.push(m);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const bindings = JSON.parse(readFileSync(join(pkgDir, 'evidence', 'bindings.json'), 'utf8'));

/* -- 0. the bindings are derived, not authored ---------------------------- */

for (const [rel, digest] of Object.entries(bindings.sourceDigests)) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) { fail(`bindings cite ${rel}, which does not exist`); continue; }
  const actual = sha256(readFileSync(abs));
  if (actual !== digest) {
    fail(`${rel} has changed since the bindings were derived (${actual.slice(0, 12)} != ${digest.slice(0, 12)}). `
      + 'Re-run build-bindings.mjs; do not edit bindings.json.');
  }
}

{
  // Rebuild into a temp location and diff. The film may not carry a figure the
  // builder would not produce today.
  const before = readFileSync(join(pkgDir, 'evidence', 'bindings.json'), 'utf8');
  execFileSync(process.execPath, [join(here, 'build-bindings.mjs')], { stdio: 'pipe' });
  const after = readFileSync(join(pkgDir, 'evidence', 'bindings.json'), 'utf8');
  if (before !== after) fail('bindings.json is not what build-bindings.mjs derives from the frozen evidence');
}

/* -- 1. the world did not move -------------------------------------------- */

for (const p of assertWorldInvariants()) fail(`world: ${p}`);
if (ruleY(bindings.invariant.ceiling) >= FRAME.y) {
  fail('world: the ceiling rule is not outside the policy frame');
}

/* -- 2. authored boundaries ----------------------------------------------- */

const AUTHORED = [0, 4.0, 8.0, 13.0, 17.0, 19.5, 21.5, 25.5, 29.0, 30.0];
const observed = seq.boundaries;
if (JSON.stringify(observed) !== JSON.stringify(AUTHORED)) {
  fail(`timeline: boundaries ${JSON.stringify(observed)} != the storyboard's ${JSON.stringify(AUTHORED)}`);
}
if (seq.duration !== 30) fail(`timeline: duration ${seq.duration}s, the cut is 30s`);

/* -- 3. direct seek equals playback --------------------------------------- */

{
  // Render every 30fps instant twice: once walking the cut in order, once
  // jumping straight to it in reverse. Identical bytes or the claim that a
  // canonical still is a frame of the export is not true.
  const times = frameTimes(seq.duration, 30);
  const forward = new Map();
  const composeFailures = [];
  for (const t of times) {
    const p = plateAt(t, bindings);
    forward.set(t, sha256(Buffer.from(JSON.stringify(p.nodes))));
    // Composed, not just evaluated. The safe-area and collision assertions live
    // in composePlate, and the canonical stills alone do not exercise the
    // transition frames — which is where the first S2 dissolve put two boundary
    // labels on top of each other for three frames and nothing noticed.
    try {
      composePlate({ id: p.scene.id, t, background: p.background, title: 'x', desc: 'x', render: () => p.nodes });
    } catch (err) {
      composeFailures.push(`t=${t}: ${err.message}`);
    }
  }
  if (composeFailures.length) {
    fail(`compose: ${composeFailures.length} of ${times.length} frames do not render\n    `
      + composeFailures.slice(0, 5).join('\n    '));
  }
  let mismatches = 0;
  for (const t of [...times].reverse()) {
    const direct = sha256(Buffer.from(JSON.stringify(plateAt(t, bindings).nodes)));
    if (direct !== forward.get(t)) mismatches += 1;
  }
  if (mismatches > 0) fail(`determinism: ${mismatches} of ${times.length} frames differ between playback and direct seek`);
}

/* -- 4. semantic state matches the frozen record -------------------------- */

const at = (t) => semanticsAt(t, bindings);

if (at(12.0).secondIntent !== 'WAITING' && at(9.5).secondIntent !== 'WAITING') {
  fail('S3: the second intent is never in WAITING');
}
if (at(9.5).secondIntent !== 'WAITING') fail('S3: the second intent is not waiting while the first proceeds');
if (at(12.5).secondIntent !== 'APPLIED') fail('S3: the second intent never serializes to APPLIED');
if (bindings.scenes.S3.concurrent !== false) fail('S3: the frozen record does not show serialization');
if ((bindings.scenes.S3.lockGroups ?? []).length !== 1) fail('S3: the frozen record does not show one lock key');

if ((bindings.scenes.S4.lockGroups ?? []).length !== 2) fail('S4: the frozen record does not show two lock keys');
if (bindings.scenes.S4.concurrent !== true) fail('S4: the frozen record does not show concurrency across two keys');
if (at(16.0).lockScopes.length !== 2) fail('S4: the plate does not assert two target-local scopes');

if (at(21.0).relationship !== 'RELATIONSHIP_PRESENT') fail('S6: the relationship is not present');
if (at(24.5).relationship !== 'RELATIONSHIP_PRESENT') fail('S7: the relationship did not persist into the decision');
if (at(28.0).relationship !== 'RELATIONSHIP_ABSENT') fail('S8: the relationship is not absent under the perturbed history');

if (at(24.5).peer !== 'WITHHELD') fail('S7: the peer is not WITHHELD');
if (bindings.scenes.S7.peer.applied !== false) fail('S7: the frozen record shows the peer applied');
if (bindings.scenes.S7.peer.decision !== 'WITHHOLD_SERIALIZE') fail('S7: the peer decision is not WITHHOLD_SERIALIZE');
if (bindings.scenes.S7.leader.decision !== 'ALLOW_SERIALIZED') fail('S7: the leader decision is not ALLOW_SERIALIZED');
if (bindings.scenes.S7.total !== 120 || bindings.scenes.S7.holds !== true) fail('S7: the recorded total is not a holding 120');

if (!bindings.scenes.S8.applied.alpha || !bindings.scenes.S8.applied.beta) fail('S8: both intents are not applied');
if (bindings.scenes.S8.couplings !== 0) fail('S8: the perturbed record still carries a qualifying coupling');
if (bindings.scenes.S8.total !== 140 || bindings.scenes.S8.holds !== false) fail('S8: the recorded total is not a failing 140');
if (bindings.scenes.S1.total !== 140) fail('S1: the recorded joint total is not 140');
if (bindings.scenes.S2.total !== 120) fail('S2: the single-intent replays do not total 120');

/* -- 5. persistent geometry ----------------------------------------------- */

{
  // The strip scenes must place alpha, beta and gamma identically. S2 replays
  // one scenario twice and S3 draws intent blocks, so both are exempt by
  // construction — and named here rather than skipped silently.
  const stripScenes = ['S1', 'S5', 'S6', 'S7', 'S8'];
  const sample = { S1: 3.5, S5: 18.9, S6: 21.2, S7: 24.5, S8: 28.5 };
  const anchors = {};
  for (const id of stripScenes) {
    const { nodes } = plateAt(sample[id], bindings);
    anchors[id] = nodes
      .filter((n) => n.t === 'text' && ['alpha', 'beta', 'gamma'].includes(n.s))
      .map((n) => `${n.s}@${n.x}`)
      .sort()
      .join(',');
  }
  const distinct = new Set(Object.values(anchors));
  if (distinct.size !== 1) {
    fail(`geometry: target anchors differ across the strip scenes: ${JSON.stringify(anchors)}`);
  }
  // S7 and S8 must draw the identical boundary — the ablation changes evidence,
  // not scope.
  const boxOf = (t) => JSON.stringify(plateAt(t, bindings).nodes
    .filter((n) => n.t === 'rect' && n.w === FRAME.w && n.h === FRAME.h)
    .map((n) => [n.x, n.y, n.w, n.h]));
  if (boxOf(24.5) !== boxOf(28.5)) fail('geometry: S8 does not draw the identical boundary to S7');
}

/* -- 6. reduced motion preserves meaning ---------------------------------- */

{
  const checks = [
    [9.5, 'secondIntent', 'WAITING'],
    [12.5, 'secondIntent', 'APPLIED'],
    [21.2, 'relationship', 'RELATIONSHIP_PRESENT'],
    [24.5, 'peer', 'WITHHELD'],
    [28.0, 'relationship', 'RELATIONSHIP_ABSENT'],
  ];
  for (const [t, key, want] of checks) {
    const got = semanticsAt(t, bindings, { reduced: true })[key];
    if (got !== want) fail(`reduced motion: at t=${t} ${key} is ${got}, expected ${want}`);
  }
  // And it must not leave a scene in its pre-state: the settled S1 shows the
  // resolved outcome rather than two bars that never rose.
  const rs = frameAt(settle(buildTracks(bindings)), 3.5);
  if (rs.s1Fill !== 1 || rs.s1Outcome !== 1) {
    fail('reduced motion: S1 does not settle to its resolved state');
  }
}

{
  const bad = [];
  for (const t of frameTimes(seq.duration, 30)) {
    const p = plateAt(t, bindings, { reduced: true });
    try {
      composePlate({ id: p.scene.id, t, background: p.background, title: 'x', desc: 'x', render: () => p.nodes });
    } catch (err) { bad.push(`t=${t}: ${err.message}`); }
  }
  if (bad.length) fail(`reduced motion: ${bad.length} frames do not render\n    ${bad.slice(0, 5).join('\n    ')}`);
}

/* -- 7. the plate carries no annotation and no unsupported claim ---------- */

const FORBIDDEN = [
  // annotation vocabulary — review layer only
  ['annotation', 'the annotation tag'],
  ['must not imply', 'a must-not-imply note'],
  ['MOTION_SEMANTIC', 'a manifest field'],
  ['EVIDENCE_BINDING', 'a manifest field'],
  ['READY_FOR_REVIEW', 'a manifest status'],
  ['REVIEW ONLY', 'the review overlay'],
  ['BIND:', 'an unresolved bind marker'],
  ['scene-local outcome, not a state', 'an annotation caption'],
  // claim guards
  ['production-ready', 'a readiness claim'],
  ['guarantee', 'a guarantee claim'],
  ['always safe', 'a universal safety claim'],
  ['prevents all', 'a universal prevention claim'],
  ['lock failure', 'broken-lock imagery'],
  ['lock broke', 'broken-lock imagery'],
  ['running', 'live-execution language'],
  ['live ', 'live-execution language'],
  ['real-time', 'runtime language'],
  ['Cloud Run', 'class-B material inside the controlled-evaluation cut'],
  ['gemini', 'class-B material inside the controlled-evaluation cut'],
  ['correlation', 'class-B material inside the controlled-evaluation cut'],
  ['toggle', 'a runtime-toggle reading of the ablation'],
  ['feature flag', 'a runtime-toggle reading of the ablation'],
  ['disabled', 'a runtime-toggle reading of the ablation'],
  ['support 8', 'receipt-level evidence on a cinematic plate'],
  ['occurrences', 'receipt-level evidence on a cinematic plate'],
];

{
  const dir = join(pkgDir, 'masters');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.svg')) : [];
  if (files.length === 0) fail('no rendered masters to check — run render-frames.mjs');
  // Both passes, whole. The reduced pass used to clear the normal one's output,
  // which left a half set that no check noticed because the two carry the same
  // text; the count is what makes the omission visible.
  const expected = canonicalTimes(seq).length;
  const normal = files.filter((f) => !f.includes('-reduced.')).length;
  const reducedCount = files.filter((f) => f.includes('-reduced.')).length;
  if (normal !== expected) fail(`masters: ${normal} normal stills, expected ${expected}`);
  if (reducedCount !== expected) fail(`masters: ${reducedCount} reduced-motion stills, expected ${expected}`);
  for (const f of files) {
    const body = readFileSync(join(dir, f), 'utf8').toLowerCase();
    for (const [needle, why] of FORBIDDEN) {
      if (body.includes(needle.toLowerCase())) fail(`${f}: contains ${JSON.stringify(needle)} — ${why}`);
    }
  }
}

/* -- 8. every scene renders at every canonical instant --------------------- */

for (const { t } of canonicalTimes(seq)) {
  try {
    const p = plateAt(t, bindings);
    composePlate({ id: p.scene.id, t, background: p.background, title: 'x', desc: 'x', render: () => p.nodes });
  } catch (err) {
    fail(`compose: t=${t} (${seq.sceneAt(t).id}) does not render — ${err.message}`);
  }
}

/* -- verdict --------------------------------------------------------------- */

if (errors.length) {
  console.error(`FAIL HAC-350 forensic replay\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `PASS HAC-350 forensic replay\n`
  + `  ${SCENES.length} scenes, ${seq.duration}s, boundaries ${AUTHORED.join(' ')}\n`
  + `  scale ${SCALE}px/unit, baseline y=${BASE_Y}, columns ${JSON.stringify(COLUMNS)}\n`
  + `  ${frameTimes(seq.duration, 30).length} frames verified seek-equals-playback\n`
  + `  bindings derived from ${Object.keys(bindings.sourceDigests).length} frozen artifacts`,
);
