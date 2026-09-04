#!/usr/bin/env node
/**
 * HAC-351 — the edited derivative of the selected generated shot.
 *
 * The service-returned original is never touched. This writes a separate file
 * and records both digests, so "which one is the original" is a fact on disk
 * rather than a convention someone has to remember.
 *
 * Two operations, both recorded:
 *
 *   1. A TRIM to the strongest editorial window. The generated original runs
 *      8.000s; the camera completes the reveal and then drifts very slightly
 *      backward over the last two seconds. The window ends before that drift.
 *      HAC-351 s13 permits trimming the eight-second source to a 6-8s window,
 *      and the eight-second shape was requested because 1080p first/last-frame
 *      generation is documented at that length, not because the cut needs 8s.
 *
 *   2. A FRAME-RATE CONFORM from Veo's native 24fps to the 30fps master
 *      timeline, using `fps=30`, which duplicates and drops whole frames.
 *      Optical flow, `minterpolate`, and any other synthesis of intermediate
 *      frames are forbidden by HAC-351 s13: they would manufacture motion the
 *      model never produced. The filter chain is asserted against a denylist
 *      below rather than left to reviewer vigilance.
 *
 * Nothing here adds text, a logo, a label or an overlay. Those are deterministic
 * and are composited in the film assembly, outside the generated material.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const SELECTED = 'p2-velocity';
const TRIM_END = 6.0;   // seconds; see (1) above
const TARGET_FPS = 30;  // the HAC-336 master timeline

/** Interpolation filters that would invent frames Veo did not output. */
const FORBIDDEN_FILTERS = ['minterpolate', 'framerate=', 'tblend', 'blend=', 'mci', 'obmc'];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const probe = (p, entries) => execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', entries, '-of', 'json', p], { encoding: 'utf8' });

const original = join(root, 'original', `${SELECTED}.mp4`);
if (!existsSync(original)) throw new Error(`missing original ${original}`);

const originalDigest = sha256(readFileSync(original));

mkdirSync(join(root, 'edited'), { recursive: true });
const edited = join(root, 'edited', `IL-VEO-001-cold-open-${TARGET_FPS}fps.mp4`);

const vf = `fps=${TARGET_FPS}`;
for (const bad of FORBIDDEN_FILTERS) {
  if (vf.includes(bad)) throw new Error(`filter chain contains forbidden interpolation '${bad}': ${vf}`);
}

execFileSync(FFMPEG, [
  '-v', 'error',
  '-i', original,
  '-t', String(TRIM_END),
  '-vf', vf,
  '-an',                       // there is no audio stream; assert the absence
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-y', edited,
]);

const editedDigest = sha256(readFileSync(edited));
const o = JSON.parse(probe(original, 'stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration'));
const e = JSON.parse(probe(edited, 'stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration'));

// The original must still be the file it was before this script ran.
if (sha256(readFileSync(original)) !== originalDigest) {
  throw new Error('the original changed while deriving from it');
}

const manifest = {
  id: 'HAC-351-derivative-manifest',
  issue: 'HAC-351',
  claimBoundary: 'Editorial metaphor only. Not execution evidence, Google Cloud '
    + 'footage, architecture, telemetry, product UI, or a simulated Interlock decision.',
  selectedCandidate: SELECTED,
  original: {
    path: `media/hac-351/original/${SELECTED}.mp4`,
    sha256: originalDigest,
    preserved: true,
    note: 'Service-returned bytes, untranscoded. Never overwritten by a derivative.',
    width: Number(o.streams[0].width),
    height: Number(o.streams[0].height),
    nativeFrameRate: o.streams[0].r_frame_rate,
    frames: Number(o.streams[0].nb_frames),
    durationSeconds: Number(Number(o.format.duration).toFixed(3)),
    audioStreams: 0,
    c2pa: true,
    c2paNote: 'Content Credentials are present and speak to media provenance only. '
      + 'They are not evidence that the illustrated scenario occurred.',
  },
  edited: {
    path: `media/hac-351/edited/IL-VEO-001-cold-open-${TARGET_FPS}fps.mp4`,
    sha256: editedDigest,
    width: Number(e.streams[0].width),
    height: Number(e.streams[0].height),
    conformedFrameRate: e.streams[0].r_frame_rate,
    frames: Number(e.streams[0].nb_frames),
    durationSeconds: Number(Number(e.format.duration).toFixed(3)),
    audioStreams: 0,
  },
  operations: [
    { op: 'trim', to: `0.000-${TRIM_END.toFixed(3)}s`, reason: 'strongest editorial window; ends before the slight backward drift in the final two seconds' },
    { op: 'fps-conform', from: '24/1', to: `${TARGET_FPS}/1`, method: 'whole-frame duplication/drop (ffmpeg fps filter)', interpolation: 'none' },
  ],
  filterChain: vf,
  forbiddenFiltersAsserted: FORBIDDEN_FILTERS,
  overlays: 'none — all copy, logo, labels and factual overlays are deterministic and composited in film assembly',
};

writeFileSync(join(root, 'evidence', 'derivative-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`original ${originalDigest.slice(0, 12)}  ${manifest.original.durationSeconds}s ${manifest.original.nativeFrameRate} ${manifest.original.frames}f`);
console.log(`edited   ${editedDigest.slice(0, 12)}  ${manifest.edited.durationSeconds}s ${manifest.edited.conformedFrameRate} ${manifest.edited.frames}f`);
console.log('wrote media/hac-351/evidence/derivative-manifest.json');
