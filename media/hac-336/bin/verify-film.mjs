#!/usr/bin/env node
/**
 * The HAC-336 gate. Node builtins only: no ffmpeg, no git, no browser.
 *
 * A gate that needs a tool CI does not have is a gate that gets skipped, and a
 * skipped gate reads as a pass. So nothing here re-encodes or re-renders. It
 * interrogates what is committed: the MP4's own boxes, the frame digests, the
 * capture manifest's promoted digests, the claim rows, and the text on every
 * board.
 *
 * What it is actually protecting, in order of how much a failure would cost:
 *
 *   1. **Two runs staying two runs.** The controlled local experiment and the
 *      Google Cloud traversal are separate proof classes. The cut must not put
 *      class-B material before the reset, class-A material after it, or the
 *      frozen reference run's identifiers anywhere near filmed footage.
 *   2. **Filmed evidence being the filmed evidence.** Every capture frame's
 *      source must hash to the digest the HAC-324 capture manifest promoted.
 *   3. **Claims staying inside the ledger.** Every factual line maps to a row;
 *      every forbidden phrasing is refused; the HAC-343 figure never appears
 *      without its ablation control on the same board.
 *   4. **The ceiling.** Four minutes, derived from the beats and cross-checked
 *      against what the encoder actually wrote.
 *
 * Failures print the defect and what to do about it, then exit 1.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline } from './lib/timeline.mjs';
import { inspectMp4, trackHandlers } from './lib/mp4.mjs';
import { cues, vtt, srt, VTT_PATH, SRT_PATH } from './build-captions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const readBytes = (p) => readFileSync(join(repoRoot, p));
const readJson = (p) => JSON.parse(readBytes(p).toString('utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const failures = [];
const check = (id, ok, detail) => {
  if (!ok) failures.push(`${id}: ${detail}`);
  return ok;
};

const cut = readJson('media/hac-336/evidence/cut.json');
const frameManifest = readJson('media/hac-336/evidence/frame-manifest.json');
const renderManifest = readJson('media/hac-336/evidence/render-manifest.json');
const inputManifest = readJson('media/hac-336/evidence/input-manifest.json');
const sceneMap = readJson('media/hac-336/evidence/scene-map.json');
const filmedClaims = readJson('media/hac-336/evidence/filmed-run-claims.json');
const ledger = readJson('media/hac-335/evidence/claim-ledger.json');
const capturePackage = readJson('experiments/hac-324/evidence/capture-package.json');
const filmedRun = readJson('experiments/hac-324/evidence/filmed-run.json');
const judge = readJson('experiments/hac-343/evidence/judge-export.json');
const storyboard = readJson('media/hac-333/scene-manifest.json');

const tl = timeline(cut);
const beatById = new Map(cut.beats.map((b) => [b.beatId, b]));
const frameById = new Map(frameManifest.frames.map((f) => [f.beatId, f]));

/** Every glyph the cut puts in front of a judge: narration plus board text. */
const svgText = (svg) => [...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(' ');
const boardCopy = readdirSync(join(repoRoot, 'media/hac-336/masters'))
  .filter((f) => f.endsWith('.svg'))
  .map((f) => svgText(readFileSync(join(repoRoot, 'media/hac-336/masters', f), 'utf8')))
  .join('\n');
const narrationCopy = cut.beats.map((b) => `${b.narration} ${b.title ?? ''}`).join('\n');
const allCopy = `${narrationCopy}\n${boardCopy}`;

/* -- 1. structure --------------------------------------------------------- */

check('CUT-IDS', new Set(cut.beats.map((b) => b.beatId)).size === cut.beats.length,
  'beat ids are not unique');
check('CUT-CLASSES',
  cut.beats.every((b) => Object.hasOwn(cut.proofClasses, b.proofClass)),
  `a beat declares a proof class the cut does not define: ${
    cut.beats.filter((b) => !Object.hasOwn(cut.proofClasses, b.proofClass)).map((b) => b.beatId).join(', ')}`);
check('CUT-NARRATION', cut.beats.every((b) => typeof b.narration === 'string' && b.narration.length > 12),
  'a beat has no narration; every beat must state what it is claiming');
check('CUT-CLAIMS', cut.beats.every((b) => Array.isArray(b.claims) && b.claims.length > 0),
  'a beat cites no claim row');
check('CUT-HOLDS', cut.beats.every((b) => b.holdSeconds > cut.transitionSeconds * 2),
  'a hold is not longer than the two crossfades that consume it; the beat would never be fully on screen');

/* -- 2. duration ---------------------------------------------------------- */

const CEILING = 240;
check('DUR-CEILING', tl.totalSeconds <= CEILING,
  `the cut derives to ${tl.totalSeconds}s, over the ${CEILING}s submission ceiling`);
check('DUR-DERIVED', renderManifest.video.derivedDurationSeconds === tl.totalSeconds,
  `render manifest records a derived duration of ${renderManifest.video.derivedDurationSeconds}s `
  + `but the cut derives ${tl.totalSeconds}s; the manifest is stale`);

const videoPath = renderManifest.video.path;
if (check('VID-PRESENT', existsSync(join(repoRoot, videoPath)), `${videoPath} is missing`)) {
  const bytes = readBytes(videoPath);
  check('VID-DIGEST', sha256(bytes) === renderManifest.video.sha256,
    `${videoPath} does not match the digest in the render manifest; re-run build-video.mjs`);
  const probe = inspectMp4(bytes);
  const handlers = trackHandlers(bytes);
  check('VID-DURATION', Math.abs(probe.durationSeconds - tl.totalSeconds) <= 0.2,
    `the encoded file runs ${probe.durationSeconds.toFixed(3)}s but the cut derives ${tl.totalSeconds}s`);
  check('VID-CEILING', probe.durationSeconds <= CEILING,
    `the encoded file runs ${probe.durationSeconds.toFixed(3)}s, over the ${CEILING}s ceiling`);
  check('VID-GEOMETRY', probe.width === cut.geometry.width && probe.height === cut.geometry.height,
    `the encoded file is ${probe.width}x${probe.height}, not ${cut.geometry.width}x${cut.geometry.height}`);
  check('VID-CODEC', probe.codec === 'avc1',
    `the encoded file's video sample description is ${probe.codec}, not avc1 (H.264)`);
  check('VID-MUTED', !handlers.includes('soun'),
    'the cut carries an audio track; HAC-333 froze this cut as muted');
}

/*
 * The encode has to contain the frames that are committed now, not the ones
 * that were committed when it ran. Every digest in this package can match while
 * the video still shows a board that has since been corrected, and that failure
 * is invisible without this comparison.
 */
check('VID-FRAMES-COUNT', renderManifest.frames.length === cut.beats.length,
  `the encode records ${renderManifest.frames.length} frames for ${cut.beats.length} beats`);
for (const encoded of renderManifest.frames) {
  const current = frameById.get(encoded.beatId);
  check(`VID-FRAME-${encoded.beatId}`, current && current.sha256 === encoded.sha256,
    `the committed frame for ${encoded.beatId} has changed since the cut was encoded; `
    + 're-run build-video.mjs so the video shows what the frame manifest describes');
}

/* -- 3. frames ------------------------------------------------------------ */

for (const beat of cut.beats) {
  const f = frameById.get(beat.beatId);
  if (!check(`FRM-${beat.beatId}`, Boolean(f), 'no frame recorded for this beat')) continue;
  if (!check(`FRM-${beat.beatId}-EXISTS`, existsSync(join(repoRoot, f.path)), `${f.path} is missing`)) continue;
  check(`FRM-${beat.beatId}-DIGEST`, sha256(readBytes(f.path)) === f.sha256,
    `${f.path} does not match the frame manifest; re-run build-frames.mjs`);
  check(`FRM-${beat.beatId}-GEOMETRY`, f.width === cut.geometry.width && f.height === cut.geometry.height,
    `${f.path} is ${f.width}x${f.height}, not ${cut.geometry.width}x${cut.geometry.height}`);
  check(`FRM-${beat.beatId}-SOURCE`, existsSync(join(repoRoot, f.sourcePath)),
    `the artifact this frame came from is missing: ${f.sourcePath}`);
}

/* -- 4. filmed evidence is the filmed evidence ---------------------------- */

const promoted = new Map(capturePackage.frames.map((f) => [f.sceneId, f]));
for (const beat of cut.beats.filter((b) => b.source.kind === 'capture')) {
  const scene = promoted.get(beat.source.sceneId);
  const f = frameById.get(beat.beatId);
  if (!check(`CAP-${beat.beatId}-PROMOTED`, Boolean(scene),
    `${beat.source.sceneId} is not a scene the HAC-324 capture manifest promoted`)) continue;
  check(`CAP-${beat.beatId}-MANIFEST`, f.sourceSha256 === scene.sha256,
    `the frame cites source digest ${f.sourceSha256.slice(0, 16)} but the capture manifest promoted `
    + `${scene.sha256.slice(0, 16)} for ${scene.sceneId}`);
  check(`CAP-${beat.beatId}-BYTES`, sha256(readBytes(f.sourcePath)) === scene.sha256,
    `${f.sourcePath} does not hash to the digest the capture manifest promoted; the committed frame is `
    + 'not the frame that was filmed');
  check(`CAP-${beat.beatId}-QUALITY`, scene.qualityPass === true,
    `${scene.sceneId} did not pass the capture-quality floor and must not appear in the cut`);
  check(`CAP-${beat.beatId}-CROP`,
    JSON.stringify(f.crop) === JSON.stringify(beat.source.crop),
    'the crop recorded on the frame differs from the crop declared in the cut');
}

const usedScenes = new Set(cut.beats.filter((b) => b.source.kind === 'capture').map((b) => b.source.sceneId));
check('CAP-COVERAGE', [...promoted.keys()].every((s) => usedScenes.has(s)),
  `promoted capture scenes are absent from the cut without being recorded as dropped: ${
    [...promoted.keys()].filter((s) => !usedScenes.has(s)).join(', ')}`);

/* -- 5. two runs stay two runs -------------------------------------------- */

const resetIndexes = cut.beats
  .map((b, i) => (b.proofClass === 'transition' ? i : -1))
  .filter((i) => i >= 0);
check('CLS-RESET-ONE', resetIndexes.length === 1,
  `expected exactly one proof-class reset beat, found ${resetIndexes.length}`);
const reset = resetIndexes[0] ?? -1;

check('CLS-B-AFTER', cut.beats.every((b, i) => b.proofClass !== 'B' || i > reset),
  'Google Cloud material appears before the proof-class reset');
check('CLS-A-BEFORE',
  cut.beats.every((b, i) => !['A', 'EVAL'].includes(b.proofClass) || i < reset),
  'controlled local material appears after the proof-class reset');
check('CLS-CAPTURE-B', cut.beats.every((b) => b.source.kind !== 'capture' || b.proofClass === 'B'),
  'a filmed Google Cloud capture is presented under a proof class other than B');
check('CLS-LOCAL-SOURCE',
  cut.beats.filter((b) => ['A', 'EVAL'].includes(b.proofClass)).every((b) => b.source.kind !== 'capture'),
  'a controlled local beat sources a Google Cloud capture');

/*
 * The frozen HAC-340 reference run and the filmed run share a claim, not an
 * identity. Their correlation ids differ by one digit group, which is exactly
 * why they must never share a frame: a judge who reads both as one run has been
 * told something the evidence does not support.
 */
const FROZEN_REFERENCE_RUN = 'ilk-hac340-cloud-1786730369123';
const FILMED_RUN = filmedRun.correlationId;
check('RUN-DISTINCT', FROZEN_REFERENCE_RUN !== FILMED_RUN,
  'the frozen reference run and the filmed run resolve to the same correlation id');

for (const beat of cut.beats.filter((b) => b.proofClass === 'B')) {
  const f = frameById.get(beat.beatId);
  const copy = `${beat.narration} ${beat.title ?? ''} ${f?.sourcePath ?? ''} ${f?.path ?? ''}`;
  check(`RUN-${beat.beatId}`, !copy.includes(FROZEN_REFERENCE_RUN),
    'a Google Cloud beat names the frozen reference run; class-B beats carry the filmed run only');
}
for (const beat of cut.beats.filter((b) => ['A', 'EVAL'].includes(b.proofClass))) {
  check(`RUN-LOCAL-${beat.beatId}`, !beat.narration.includes(FILMED_RUN),
    'a controlled local beat names the filmed Google Cloud run');
}

/* -- 6. claims ------------------------------------------------------------ */

const knownClaims = new Set([
  ...ledger.claims.map((c) => c.id),
  ...filmedClaims.claims.map((c) => c.id),
]);
for (const beat of cut.beats) {
  for (const id of beat.claims) {
    check(`CLM-${beat.beatId}-${id}`, knownClaims.has(id),
      `cites ${id}, which is in neither the HAC-335 ledger nor the HAC-336 filmed-run rows`);
  }
}

/** Every filmed-run row still resolves to the value its pointers name. */
function resolvePointer(doc, pointer) {
  let node = doc;
  for (const raw of pointer.slice(1).split('/')) {
    if (node === null || node === undefined) return undefined;
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return node;
}
for (const row of filmedClaims.claims) {
  for (const ptr of row.pointers) {
    const path = filmedClaims.sources[ptr.source];
    check(`CLM-${row.id}-PTR`, resolvePointer(readJson(path), ptr.pointer) !== undefined,
      `pointer ${ptr.pointer} no longer resolves in ${path}; the row has lost its evidence`);
  }
}

/* -- 7. forbidden phrasing ------------------------------------------------- */

/*
 * Transcribed from HAC-343's `mustNotClaim`, HAC-333's `globalNonClaims` and the
 * HAC-336 issue's claim boundary. Patterns, not sentences, because the failure
 * mode is a paraphrase: "100% of hazards" is the same overclaim as "0% unsafe"
 * with the arithmetic run the other way.
 */
const FORBIDDEN = [
  [/\b0\s*%\s*unsafe/i, 'HAC-343 forbids a 0% unsafe headline; use exact counts'],
  [/\b100\s*%\s*(safe|of\s+hazards|of\s+the\s+hazards)/i, 'a 100% headline collapses a heterogeneous corpus into one denominator'],
  [/statistical(ly)?\s+significan/i, 'the corpus is an exhaustive deterministic enumeration, not a sample'],
  [/confidence\s+interval/i, 'no interval is claimed'],
  [/\bproduction[- ]ready\b/i, 'production readiness was not tested'],
  [/\bexactly[- ]once\b/i, 'exactly-once is not claimed'],
  [/\brestart[- ]saf(e|ety)\b/i, 'restart safety is not claimed'],
  [/\bfleet[- ]scale\b/i, 'fleet-scale operation is not claimed'],
  [/\bprevents\s+(all\s+)?(composition\s+)?hazards?\b/i, 'Interlock withheld the hazards in this corpus; it does not prevent hazards'],
  [/\bsafer\s+than\s+locking\b/i, 'per-target locking is correct for the hazard it addresses'],
  [/\btarget[- ]side\s+atomic/i, 'target-side atomicity was not tested'],
  [/\bagent\s+runtime\b/i, 'Agent Runtime did not participate'],
  [/\bagent\s+gateway\b/i, 'Agent Gateway did not participate'],
  [/\bmemory\s+bank\b/i, 'Memory Bank did not participate'],
  [/\bCONTENT_AUTHZ\b/, 'CONTENT_AUTHZ is not on the recorded path'],
  [/ALLOW\s+(means|is)\s+(VERIFIED|AUTHORIZED|SAFE)/i, 'ALLOW is a decision, not a verification or an authorization'],
  [/\bvalid[- ]wrong[- ]audience\b/i, 'no valid-token wrong-audience cloud negative test was run'],
  [/history\s+(was\s+)?rewritten/i, 'the HAC-343 guardrail asks for "deliberately removed the coupling signal"'],
];

/*
 * Several of these phrases are ones the cut is *required* to say, in the
 * negative: a limitations board that could not print the words "exactly-once"
 * could not disclaim exactly-once either. So a hit is a finding only when
 * nothing nearby negates it.
 *
 * The window is a heuristic and is treated as one. It can be fooled by an
 * unrelated negation in the same breath, which is why the boundary list in
 * section 8 separately requires the disclaimers to be present, and why
 * test/hac-336-film-gates.test.mjs asserts the bare assertive form of each
 * phrase still fails. Neither check trusts the other.
 */
const NEGATORS = /\b(no|not|never|without|neither|nor|absent|outside|excluded|refus\w+|forbid\w+)\b/i;
const NEGATION_WINDOW = 110;

/** Matches of `pattern` in `copy` that nothing nearby negates. */
function assertedWithoutNegation(pattern, copy) {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  const hits = [];
  for (const m of copy.matchAll(global)) {
    const from = Math.max(0, m.index - NEGATION_WINDOW);
    const to = Math.min(copy.length, m.index + m[0].length + NEGATION_WINDOW);
    const context = copy.slice(from, to);
    if (!NEGATORS.test(context)) hits.push({ text: m[0], context: context.replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

for (const [pattern, why] of FORBIDDEN) {
  const hits = assertedWithoutNegation(pattern, allCopy);
  check(`PHR-${pattern.source.slice(0, 24)}`, hits.length === 0,
    `judge-facing copy asserts ${JSON.stringify(hits[0]?.text)} with nothing negating it: ${why}\n`
    + `      context: ...${hits[0]?.context ?? ''}...`);
}

/* -- 8. required boundaries ------------------------------------------------ */

/*
 * A limitations act that can be quietly deleted is not a limitations act. Each
 * of these is a proposition the cut has to carry somewhere, checked against the
 * text actually on screen rather than against a beat id that could be renamed.
 */
const REQUIRED = [
  [/two runs, two proof classes/i, 'the two-runs boundary'],
  [/neither is evidence for the other/i, 'the no-crossing statement'],
  [/not\s+a\s+population\s+estimate|no\s+confidence\s+intervals/i, 'the bounded-corpus statement'],
  [/transport\s+provenance/i, 'the transport-versus-application provenance distinction'],
  [/Agent Runtime\s+Agent Gateway\s+CONTENT_AUTHZ|absent from this deployment/i,
    'the absent-services statement'],
  [/exactly-once/i, 'the exactly-once non-claim'],
  [/evidence[- ]derived|evidence is load-bearing/i, 'the evidence-ablation finding'],
];
for (const [pattern, what] of REQUIRED) {
  check(`REQ-${pattern.source.slice(0, 24)}`, pattern.test(allCopy),
    `the cut no longer states ${what}`);
}

check('REQ-BOUNDARY-CARD',
  cut.beats.some((b) => b.source.assetId === 'IL-PROOF-014'),
  'the claim-boundary card is not in the cut');

/* -- 9. the HAC-343 adjacency guardrail ----------------------------------- */

const comparisonBeat = cut.beats.findIndex((b) => b.source.state === 'comparison');
const ablationBeat = cut.beats.findIndex((b) => b.source.state === 'ablation');
check('EVAL-PRESENT', comparisonBeat >= 0 && ablationBeat >= 0,
  'the bounded four-arm comparison or its ablation control is missing from the cut');
check('EVAL-ADJACENT', ablationBeat === comparisonBeat + 1,
  'the evidence-ablation control does not immediately follow the four-arm comparison; the HAC-343 '
  + 'guardrail requires them to be one contiguous visual unit');

const ablationMaster = readdirSync(join(repoRoot, 'media/hac-336/masters'))
  .find((f) => f.endsWith('-ablation.svg'));
if (check('EVAL-MASTER', Boolean(ablationMaster), 'no ablation master was rendered')) {
  const copy = svgText(readFileSync(join(repoRoot, 'media/hac-336/masters', ablationMaster), 'utf8'));
  for (const row of judge.panel1.rows) {
    check(`EVAL-ARM-${row.arm}`, copy.includes(row.label),
      `the ablation board omits the ${row.label} arm; the Interlock figure would stand without its comparison`);
  }
  for (const row of judge.panel2.rows) {
    check(`EVAL-ABL-${row.invalidOutcomes.display}`, copy.includes(row.invalidOutcomes.display),
      'the ablation board omits an ablation outcome');
  }
  check('EVAL-CREDIBILITY',
    copy.includes(judge.panel1.perTargetLockCredibility.parallelisedCrossTarget.display),
    'the ablation board omits the per-target lock credibility strip, leaving A3 looking like a straw man');
}

/* -- 10. figures still match the evidence they came from ------------------ */

for (const row of judge.panel1.rows) {
  check(`FIG-${row.arm}`,
    boardCopy.includes(row.coupledUnsafe.display) && boardCopy.includes(row.safeParallelism.display),
    `the boards no longer carry the frozen ${row.label} figures`);
}
check('FIG-CONTROLS',
  [filmedRun.controls.forgedHeaderStatus, filmedRun.controls.wrongAudienceStatus, filmedRun.controls.directBypassStatus]
    .every((s) => narrationCopy.includes(String(s))),
  'the narration no longer states all three recorded fail-closed statuses');
check('FIG-RECEIPT', boardCopy.includes(filmedRun.receiptId.slice(0, 18)),
  'the architecture board no longer carries the filmed run receipt id');

/* -- 11. the first thirty seconds work muted ------------------------------ */

/*
 * A judge who never unmutes must still reach the thesis. Every beat inside the
 * opening thirty seconds therefore has to be legible from the frame alone:
 * either it is a frozen board that carries its own copy, or the cut records
 * what a muted reader takes from it.
 */
for (const b of tl.beats.filter((x) => x.startSeconds < 30)) {
  const beat = beatById.get(b.beatId);
  check(`MUTE-${b.beatId}`,
    beat.source.kind === 'asset' || typeof beat.mutedRead === 'string',
    'a beat in the first thirty seconds records no muted reading and is not a frozen board that '
    + 'carries its own copy; the thesis would depend on the caption track');
}

/* -- 12. captions --------------------------------------------------------- */

if (check('CAP-VTT-EXISTS', existsSync(join(repoRoot, VTT_PATH)), `${VTT_PATH} is missing`)) {
  check('CAP-VTT-FRESH', readBytes(VTT_PATH).toString('utf8') === vtt,
    'the WebVTT track does not match the narration in the cut; re-run build-captions.mjs');
}
if (check('CAP-SRT-EXISTS', existsSync(join(repoRoot, SRT_PATH)), `${SRT_PATH} is missing`)) {
  check('CAP-SRT-FRESH', readBytes(SRT_PATH).toString('utf8') === srt,
    'the SubRip track does not match the narration in the cut; re-run build-captions.mjs');
}
check('CAP-COUNT', cues.length === cut.beats.length,
  `${cues.length} caption cues for ${cut.beats.length} beats`);
check('CAP-ORDER', cues.every((c, i) => c.start < c.end && (i === 0 || c.start >= cues[i - 1].end)),
  'caption cues overlap or run backwards');
for (const m of renderManifest.captions) {
  check(`CAP-DIGEST-${m.format}`, sha256(readBytes(m.path)) === m.sha256,
    `${m.path} does not match the digest in the render manifest`);
}

/* -- 13. inputs are still the inputs -------------------------------------- */

for (const input of inputManifest.inputs) {
  if (!check(`INP-${input.path}`, existsSync(join(repoRoot, input.path)), 'a declared input is missing')) continue;
  check(`INP-${input.path}-DIGEST`, sha256(readBytes(input.path)) === input.sha256,
    'a declared input has changed since the manifest was derived; re-run build-input-manifest.mjs');
}
for (const rev of inputManifest.declaredRevisions.filter((r) => r.checkable)) {
  check(`REV-${rev.name}`, resolvePointer(readJson(rev.source), rev.pointer) === rev.value,
    `${rev.name} is declared as ${rev.value} but ${rev.source}${rev.pointer} no longer holds it`);
}
check('MAP-COVERAGE', sceneMap.scenes.length === cut.beats.length,
  `the scene map describes ${sceneMap.scenes.length} scenes for ${cut.beats.length} beats`);
check('MAP-TOTAL', sceneMap.totalSeconds === tl.totalSeconds,
  'the scene map records a total the cut no longer derives');

/* -- 14. the storyboard's non-claims survive ------------------------------ */

/*
 * HAC-333 hands HAC-336 a `mustNotAppear` list. It is a list of propositions,
 * not of strings, so this checks the handful whose contradiction would be
 * visible as literal text rather than trying to pattern-match twelve English
 * sentences and quietly matching none of them.
 */
check('SB-HANDOFF', Array.isArray(storyboard.handoffs['HAC-336'].mustNotAppear),
  'the storyboard no longer hands HAC-336 a must-not-appear list');
check('SB-REFERENCE-RUN', !allCopy.includes(FROZEN_REFERENCE_RUN),
  'the frozen reference run identifier appears in judge-facing copy; the cut shows the filmed run');

/* -- report --------------------------------------------------------------- */

if (failures.length) {
  process.stderr.write(`HAC-336 film gate FAILED - ${failures.length} finding(s)\n\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.stderr.write(
    '\nNothing here is fixed by loosening the gate. Re-run the pipeline in order:\n'
    + '  node media/hac-336/bin/build-boards.mjs\n'
    + '  node media/hac-336/bin/build-frames.mjs\n'
    + '  node media/hac-336/bin/build-captions.mjs\n'
    + '  node media/hac-336/bin/build-input-manifest.mjs\n'
    + '  node media/hac-336/bin/build-video.mjs      # needs ffmpeg; not run in CI\n',
  );
  process.exit(1);
}

process.stdout.write(
  'HAC-336 film gate PASS\n'
  + `  ${cut.beats.length} beats, ${tl.totalSeconds}s derived and ${renderManifest.video.measuredDurationSeconds}s encoded `
  + `(ceiling ${CEILING}s)\n`
  + `  ${cut.beats.filter((b) => b.source.kind === 'capture').length} filmed capture frames bound to `
  + `${capturePackage.packageId}\n`
  + `  ${new Set(cut.beats.flatMap((b) => b.claims)).size} claim rows, ${FORBIDDEN.length} forbidden phrasings refused, `
  + `${REQUIRED.length} boundaries required\n`,
);
