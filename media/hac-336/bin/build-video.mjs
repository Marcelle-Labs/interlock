#!/usr/bin/env node
/**
 * Assembles the frames into the final cut.
 *
 * The only step in this package that needs a tool outside Node, and the only one
 * CI does not run. That split is deliberate: `verify-film.mjs` reads the
 * finished MP4's own boxes rather than re-encoding it, so the gate has no
 * ffmpeg dependency and cannot pass by being skipped on a runner that lacks one.
 *
 * There is no audio track. HAC-333 froze this cut as muted — every claim has to
 * survive with the sound off — so the caption files carry the narration as text
 * and double as a voice-over script. Generating synthetic speech to fill the
 * silence would add a channel that no gate can check and no human spoke.
 *
 * The transition is a crossfade and nothing else. Each beat is a still hold, so
 * the only thing that moves in four minutes is the change between two frozen
 * states. Nothing counts up, nothing types itself out, and nothing on screen
 * suggests a frozen result is being recomputed while the viewer watches.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExportName, validateExportName } from '../../../scripts/export-naming.mjs';
import { timeline } from './lib/timeline.mjs';
import { cues, vtt, srt, VTT_PATH, SRT_PATH } from './build-captions.mjs';
import { inspectMp4, trackHandlers } from './lib/mp4.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const filmDir = join(repoRoot, 'media', 'hac-336');

const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const cut = readJson('media/hac-336/evidence/cut.json');
const frameManifest = readJson('media/hac-336/evidence/frame-manifest.json');
const tl = timeline(cut);

/** The submission ceiling, and the reason the cut is planned under it. */
const HARD_CEILING_SECONDS = 240;
if (tl.totalSeconds > HARD_CEILING_SECONDS) {
  throw new Error(
    `the cut assembles to ${tl.totalSeconds}s, over the ${HARD_CEILING_SECONDS}s submission ceiling. `
    + 'Shorten holds in cut.json; do not drop a required proof element to fit.',
  );
}

const frameFor = (beatId) => {
  const f = frameManifest.frames.find((x) => x.beatId === beatId);
  if (!f) throw new Error(`no frame for ${beatId}. Run media/hac-336/bin/build-frames.mjs first.`);
  const abs = join(repoRoot, f.path);
  if (!existsSync(abs)) throw new Error(`${beatId}: frame missing on disk: ${f.path}`);
  if (sha256(readFileSync(abs)) !== f.sha256) {
    throw new Error(`${beatId}: ${f.path} no longer matches the frame manifest. Rebuild frames.`);
  }
  return { ...f, abs };
};

/* -- the encoder ---------------------------------------------------------- */

/**
 * Resolve ffmpeg to an absolute path, never through `PATH`.
 *
 * Invoking a bare `ffmpeg` runs whatever the first writable directory on `PATH`
 * happens to offer, which is both a real substitution risk and a reproducibility
 * one: the binary that encoded the submission video should be a fact the render
 * manifest can record, not whatever the shell found that afternoon.
 *
 * `FFMPEG` overrides for a host that keeps it elsewhere, and must itself be
 * absolute — an override that reintroduced a relative lookup would defeat the
 * point of having one.
 */
const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  '/snap/bin/ffmpeg',
];

function resolveFfmpeg() {
  const override = process.env.FFMPEG;
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error(`FFMPEG must be an absolute path, not ${JSON.stringify(override)}`);
    }
    if (!existsSync(override) || !statSync(override).isFile()) {
      throw new Error(`FFMPEG points at ${override}, which is not a file`);
    }
    return override;
  }
  const found = FFMPEG_CANDIDATES.find((c) => existsSync(c) && statSync(c).isFile());
  if (!found) {
    throw new Error(
      `no ffmpeg found at any of ${FFMPEG_CANDIDATES.join(', ')}. Install it, or set FFMPEG to an `
      + 'absolute path. This step is deliberately not run in CI; the gate reads the finished file instead.',
    );
  }
  return found;
}

const FFMPEG = resolveFfmpeg();

/* -- captions ------------------------------------------------------------- */

/*
 * Not written here. `build-captions.mjs` owns them so CI can regenerate and diff
 * without ffmpeg; this step only proves the committed files are the ones the
 * current cut derives, so the manifest cannot record a digest for a caption file
 * that no longer matches the narration.
 */
for (const [path, expected] of [[VTT_PATH, vtt], [SRT_PATH, srt]]) {
  if (!existsSync(join(repoRoot, path))) {
    throw new Error(`${path} is missing. Run media/hac-336/bin/build-captions.mjs first.`);
  }
  if (readFileSync(join(repoRoot, path), 'utf8') !== expected) {
    throw new Error(`${path} does not match the current cut. Re-run media/hac-336/bin/build-captions.mjs.`);
  }
}

/* -- video ---------------------------------------------------------------- */

const exportName = buildExportName({
  id: 'IL-MOT-020',
  slug: 'interlock-final-cut',
  width: cut.geometry.width,
  height: cut.geometry.height,
  ext: 'mp4',
});
const nameCheck = validateExportName(exportName);
if (!nameCheck.valid) throw new Error(`built an unparseable export name ${exportName}: ${nameCheck.error}`);

const exportsDir = join(filmDir, 'exports');
mkdirSync(exportsDir, { recursive: true });
const outPath = join(exportsDir, exportName);

const frames = tl.beats.map((b) => frameFor(b.beatId));
const { fps } = cut.geometry;
const x = cut.transitionSeconds;

/*
 * One ffmpeg invocation, one xfade chain.
 *
 * Each input is a still looped for its hold. `offset` is where the crossfade
 * into the next beat begins, measured on the *accumulated* chain rather than on
 * the input, which is why it tracks the same cursor `timeline()` uses. Getting
 * that wrong does not fail loudly — it produces a video that is subtly the wrong
 * length — so the assembled file is measured afterwards and compared.
 */
const inputs = frames.flatMap((f, i) => [
  '-loop', '1', '-t', String(cut.beats[i].holdSeconds), '-i', f.abs,
]);

let filter = '';
let label = '[0:v]';
let chainEnd = cut.beats[0].holdSeconds;
for (let i = 1; i < frames.length; i += 1) {
  const next = `[x${i}]`;
  const offset = Math.round((chainEnd - x) * 1000) / 1000;
  filter += `${label}[${i}:v]xfade=transition=fade:duration=${x}:offset=${offset}${next};`;
  label = next;
  chainEnd = chainEnd - x + cut.beats[i].holdSeconds;
}
filter += `${label}format=yuv420p[v]`;

const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  ...inputs,
  '-filter_complex', filter,
  '-map', '[v]',
  '-r', String(fps),
  '-c:v', 'libx264',
  '-preset', 'veryslow',
  '-crf', '18',
  // Still frames with hard state changes: a keyframe on every beat keeps a
  // scrubbing judge from landing between two boards.
  '-g', String(fps * 2),
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  outPath,
];

process.stdout.write(`ffmpeg: ${frames.length} stills, ${tl.transitions} crossfades, target ${tl.totalSeconds}s\n`);
execFileSync(FFMPEG, args, { stdio: ['ignore', 'inherit', 'inherit'] });

/* -- measure what was actually written ------------------------------------ */

const bytes = readFileSync(outPath);
const probe = inspectMp4(bytes);
const handlers = trackHandlers(bytes);

const drift = Math.abs(probe.durationSeconds - tl.totalSeconds);
if (drift > 0.2) {
  throw new Error(
    `assembled duration ${probe.durationSeconds.toFixed(3)}s differs from the derived `
    + `${tl.totalSeconds}s by ${drift.toFixed(3)}s. The xfade offsets and the timeline disagree.`,
  );
}
if (probe.width !== cut.geometry.width || probe.height !== cut.geometry.height) {
  throw new Error(`assembled ${probe.width}x${probe.height}, not ${cut.geometry.width}x${cut.geometry.height}`);
}
if (handlers.includes('soun')) {
  throw new Error('the assembled cut carries an audio track; this cut is muted by contract');
}

writeFileSync(
  join(filmDir, 'evidence', 'render-manifest.json'),
  `${JSON.stringify({
    manifestId: 'HAC-336-render-manifest',
    revision: cut.revision,
    issue: 'HAC-336',
    note: 'Derived by media/hac-336/bin/build-video.mjs. Do not hand-edit. Duration, geometry and codec are read back out of the finished file rather than copied from the encode request.',
    generator: 'media/hac-336/bin/build-video.mjs',
    encoder: execFileSync(FFMPEG, ['-version'], { encoding: 'utf8' }).split('\n')[0],
    encoderPath: FFMPEG,
    video: {
      path: `media/hac-336/exports/${exportName}`,
      sha256: sha256(bytes),
      bytes: bytes.length,
      width: probe.width,
      height: probe.height,
      codec: probe.codec,
      brand: probe.brand,
      fps,
      measuredDurationSeconds: Number(probe.durationSeconds.toFixed(3)),
      derivedDurationSeconds: tl.totalSeconds,
      audioTracks: handlers.filter((h) => h === 'soun').length,
      trackHandlers: handlers,
    },
    captions: [
      { path: VTT_PATH, format: 'WebVTT', cues: cues.length, sha256: sha256(readFileSync(join(repoRoot, VTT_PATH))) },
      { path: SRT_PATH, format: 'SubRip', cues: cues.length, sha256: sha256(readFileSync(join(repoRoot, SRT_PATH))) },
    ],
    // Which frames this encode actually contains. Without it, editing a board
    // after the encode leaves a video that no longer shows what the frame
    // manifest describes, and every digest in sight still matches.
    frames: frames.map((f) => ({ beatId: f.beatId, path: f.path, sha256: f.sha256 })),
    timeline: tl,
  }, null, 2)}\n`,
);

process.stdout.write(
  `HAC-336 cut assembled\n  media/hac-336/exports/${exportName}\n`
  + `  ${probe.width}x${probe.height} ${probe.codec} ${probe.durationSeconds.toFixed(2)}s `
  + `(${(bytes.length / 1e6).toFixed(1)} MB, no audio track)\n`
  + `  captions: ${cues.length} cues, WebVTT + SubRip\n`,
);
