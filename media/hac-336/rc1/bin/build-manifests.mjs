#!/usr/bin/env node
/**
 * The two derived records a reviewer reads instead of trusting the edit:
 *
 *   scene-manifest.json     timestamp -> beat -> proof class -> source -> narration
 *   asset-source-map.json   every factual visual -> its file, digest and origin
 *
 * Both are functions of the authored cut plus the frozen artifacts on disk. The
 * digest is the binding: a declared revision cannot prove a file is the one that
 * was filmed, but a content hash recomputed here can.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline, clock } from './lib/rc1-timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));
const digest = (p) => {
  const abs = join(repoRoot, p);
  if (!existsSync(abs)) return { sha256: null, bytes: null, missing: true };
  const b = readFileSync(abs);
  return { sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length };
};

const cut = readJson('media/hac-336/rc1/evidence/cut-rc1.json');
const narration = readJson('media/hac-336/rc1/evidence/narration-manifest.json');
const filmedRun = readJson('experiments/hac-324/evidence/filmed-run.json');
const tl = timeline(cut, narration);

/* -- scene manifest ------------------------------------------------------- */
const scenes = tl.beats.map((b) => {
  const beat = cut.beats.find((x) => x.beatId === b.beatId);
  return {
    beatId: b.beatId,
    timecode: `${clock(b.startSeconds)}–${clock(b.endSeconds)}`,
    startSeconds: b.startSeconds,
    endSeconds: b.endSeconds,
    holdSeconds: b.holdSeconds,
    act: b.act,
    proofClass: b.proofClass,
    proofClassMeaning: cut.proofClasses[b.proofClass],
    source: beat.source,
    label: beat.label ?? null,
    mutedRead: beat.mutedRead ?? null,
    guardrail: beat.guardrail ?? null,
    narration: b.lines.map((l) => {
      const authored = beat.lines.find((a) => a.lineId === l.lineId);
      return {
        lineId: l.lineId,
        startSeconds: l.startSeconds,
        endSeconds: l.endSeconds,
        durationSeconds: l.durationSeconds,
        spoken: authored.spoken,
        caption: authored.caption,
        spokenDiffersFromCaption: authored.spoken !== authored.caption,
      };
    }),
  };
});

writeFileSync(join(rc1, 'evidence', 'scene-manifest.json'), `${JSON.stringify({
  manifestId: 'HAC-336-rc1-scene-manifest',
  revision: 'rc1',
  issue: 'HAC-336',
  note: 'Derived by media/hac-336/rc1/bin/build-manifests.mjs. Do not hand-edit.',
  runtime: {
    totalSeconds: tl.totalSeconds,
    clock: clock(tl.totalSeconds),
    target: cut.runtimeTarget,
    withinTarget: tl.totalSeconds >= cut.runtimeTarget.minSeconds && tl.totalSeconds <= cut.runtimeTarget.maxSeconds,
    spokenSeconds: tl.spokenSeconds,
    silenceSeconds: tl.silenceSeconds,
    speechDensityPercent: tl.speechDensity,
  },
  proofClassReset: {
    atBeat: 'R05',
    atSeconds: tl.beats.find((b) => b.beatId === 'R05').startSeconds,
    beforeReset: [...new Set(tl.beats.filter((b) => b.startSeconds < tl.beats.find((x) => x.beatId === 'R05').startSeconds).map((b) => b.proofClass))],
    afterReset: [...new Set(tl.beats.filter((b) => b.startSeconds > tl.beats.find((x) => x.beatId === 'R05').startSeconds).map((b) => b.proofClass))],
  },
  scenes,
}, null, 2)}\n`);

/* -- asset source map ----------------------------------------------------- */
const assets = [];
const seen = new Set();
for (const beat of cut.beats) {
  const key = beat.source.path;
  if (seen.has(key)) { assets.find((a) => a.path === key).usedByBeats.push(beat.beatId); continue; }
  seen.add(key);
  assets.push({
    assetId: beat.source.assetId,
    path: key,
    ...digest(key),
    kind: beat.source.kind,
    originIssue: beat.source.originIssue ?? 'HAC-336',
    state: beat.source.state ?? beat.source.cropId ?? beat.source.sceneId ?? null,
    proofClass: beat.proofClass,
    usedByBeats: [beat.beatId],
    editorialTrim: beat.source.editorialTrim ?? null,
    // A reserved capture slot has no file to digest yet. It is recorded as an
    // asset anyway, so the map shows the hole rather than omitting it.
    pendingCapture: beat.source.pendingCapture ?? false,
    mustShowContinuously: beat.source.mustShowContinuously ?? null,
  });
}
assets.push({
  assetId: 'IL-CHROME-RC1',
  path: 'media/hac-336/rc1/inserts/label-controlled-evaluation-1920x1080.png',
  ...digest('media/hac-336/rc1/inserts/label-controlled-evaluation-1920x1080.png'),
  kind: 'overlay',
  originIssue: 'HAC-336 rc1',
  state: 'proof-class label',
  proofClass: 'EVAL',
  usedByBeats: ['R01'],
  note: 'Editorial chrome, not evidence. Section 8 proof-class identification over the replay.',
});

writeFileSync(join(rc1, 'evidence', 'asset-source-map.json'), `${JSON.stringify({
  manifestId: 'HAC-336-rc1-asset-source-map',
  revision: 'rc1',
  issue: 'HAC-336',
  note: 'Derived. Every visual in RC1, with the content digest recomputed from the file on disk. A declared revision cannot prove a file is the one that was filmed; a digest can.',
  filmedRun: {
    correlationId: filmedRun.correlationId,
    receiptId: filmedRun.receiptId,
    commitSha: filmedRun.commitSha,
    model: filmedRun.model,
    adkPath: filmedRun.adkPath,
    projectId: filmedRun.resources.projectId,
    region: filmedRun.resources.region,
    decision: filmedRun.decision,
    mutationStatus: filmedRun.protectedMutation.status,
    invariant: filmedRun.protectedMutation.invariant.detail,
    note: 'Recorded here for provenance. None of these identifiers is narrated aloud; they appear only inside the filmed frames themselves.',
  },
  narration: {
    provider: narration.provider,
    model: narration.model,
    lines: narration.lines.length,
    totalSpokenSeconds: narration.totalSpokenSeconds,
    meanWordsPerMinute: narration.meanWordsPerMinute,
  },
  assets,
}, null, 2)}\n`);

const missing = assets.filter((a) => a.missing && !a.pendingCapture);
if (missing.length) throw new Error(`${missing.length} asset(s) missing on disk: ${missing.map((a) => a.path).join(', ')}`);
const awaiting = assets.filter((a) => a.pendingCapture);
process.stderr.write(`scene-manifest: ${scenes.length} scenes, ${clock(tl.totalSeconds)}\n`
  + `asset-source-map: ${assets.length} assets, ${assets.length - awaiting.length} digested`
  + `${awaiting.length ? `, ${awaiting.length} awaiting capture (${awaiting.map((a) => a.assetId).join(', ')})` : ''}\n`);
