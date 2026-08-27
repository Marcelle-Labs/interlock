#!/usr/bin/env node
/**
 * Encode the thirty-second Forensic Replay.
 *
 * Every frame comes from `plateAt`, at `frameTimes(30, fps)`, in order. There is
 * no separate "export renderer": the file this writes is the same function the
 * gate checks and the canonical stills came from, sampled 900 times.
 *
 * No crossfades. HAC-336's cut joins held boards and needs them; this is one
 * continuous world under changing conditions, and a dissolve between two scenes
 * of it would be the cut inventing a state that the timeline does not contain —
 * most damagingly across 25.5, where a blend of S7 and S8 would show a withheld
 * bar half-filled.
 *
 * `ffmpeg` is resolved to an absolute path and recorded, following HAC-336: the
 * encoder that produced the submission video should be a fact rather than
 * whatever the shell found that afternoon. Not run in CI.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { composePlate } from './lib/plate.mjs';
import { plateAt, seq } from './lib/replay.mjs';
import { frameTimes } from '../../hac-334/bin/lib/motion.mjs';
import { W, H } from './lib/world.mjs';
import { buildExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const repoRoot = join(pkgDir, '..', '..');

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
function resolveFfmpeg() {
  const override = process.env.FFMPEG;
  if (override) {
    if (!override.startsWith('/')) throw new Error(`FFMPEG must be an absolute path, not ${JSON.stringify(override)}`);
    if (!existsSync(override) || !statSync(override).isFile()) throw new Error(`FFMPEG points at ${override}, which is not a file`);
    return override;
  }
  const found = FFMPEG_CANDIDATES.find((c) => existsSync(c) && statSync(c).isFile());
  if (!found) throw new Error(`no ffmpeg at ${FFMPEG_CANDIDATES.join(', ')}; set FFMPEG to an absolute path`);
  return found;
}
const FFMPEG = resolveFfmpeg();

const argv = process.argv.slice(2);
const fps = Number(argv.includes('--fps') ? argv[argv.indexOf('--fps') + 1] : 30);
const reduced = argv.includes('--reduced');

const bindings = JSON.parse(readFileSync(join(pkgDir, 'evidence', 'bindings.json'), 'utf8'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const workDir = join(pkgDir, '.frames');
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const times = frameTimes(seq.duration, fps);
process.stdout.write(`rendering ${times.length} frames at ${fps}fps${reduced ? ' [reduced motion]' : ''}\n`);

const perScene = new Map();
times.forEach((t, i) => {
  const p = plateAt(t, bindings, { reduced });
  perScene.set(p.scene.id, (perScene.get(p.scene.id) ?? 0) + 1);
  const svg = composePlate({
    id: p.scene.id,
    t,
    background: p.background,
    title: `Interlock Forensic Replay ${p.scene.id} at ${t.toFixed(3)}s`,
    desc: `Frame ${i} of ${times.length}. Scene ${p.scene.id}, ${p.scene.name}.`,
    render: () => p.nodes,
  });
  writeFileSync(
    join(workDir, `f${String(i).padStart(5, '0')}.png`),
    new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng(),
  );
  if (i % 150 === 0) process.stdout.write(`  ${i}/${times.length}\n`);
});

const outName = buildExportName({
  id: 'IL-MOT-021',
  slug: 'forensic-replay',
  variant: reduced ? 'static' : undefined,
  width: W,
  height: H,
  ext: 'mp4',
});
mkdirSync(join(pkgDir, 'exports'), { recursive: true });
const outPath = join(pkgDir, 'exports', outName);

const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-framerate', String(fps),
  '-i', join(workDir, 'f%05d.png'),
  '-r', String(fps),
  '-c:v', 'libx264',
  '-preset', 'veryslow',
  '-crf', '18',
  // A keyframe every scene-length or better, so a judge scrubbing to 23.0 lands
  // on the frame the gate checked rather than on a predicted one.
  '-g', String(fps * 2),
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  outPath,
];
execFileSync(FFMPEG, args, { stdio: ['ignore', 'inherit', 'inherit'] });
rmSync(workDir, { recursive: true, force: true });

const bytes = readFileSync(outPath);
const probe = JSON.parse(execFileSync(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), [
  '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', outPath,
], { encoding: 'utf8' }));
const v = probe.streams.find((s) => s.codec_type === 'video');

const drift = Math.abs(Number(probe.format.duration) - seq.duration);
if (drift > 0.2) throw new Error(`encoded duration ${probe.format.duration}s drifts ${drift.toFixed(3)}s from the authored ${seq.duration}s`);
if (v.width !== W || v.height !== H) throw new Error(`encoded ${v.width}x${v.height}, expected ${W}x${H}`);
if (probe.streams.some((s) => s.codec_type === 'audio')) throw new Error('the cut carries no audio track');

writeFileSync(join(pkgDir, 'evidence', `render-manifest${reduced ? '-reduced' : ''}.json`), `${JSON.stringify({
  issue: 'HAC-350',
  kind: 'render-manifest',
  file: outName,
  sha256: sha256(bytes),
  bytes: bytes.length,
  reduced,
  authoredDuration: seq.duration,
  measuredDuration: Number(probe.format.duration),
  width: v.width,
  height: v.height,
  codec: v.codec_name,
  pixelFormat: v.pix_fmt,
  frames: times.length,
  fps,
  framesPerScene: Object.fromEntries(perScene),
  audioStreams: probe.streams.filter((s) => s.codec_type === 'audio').length,
  encoder: execFileSync(FFMPEG, ['-version'], { encoding: 'utf8' }).split('\n')[0],
  encoderPath: FFMPEG,
  bindingsSha256: sha256(readFileSync(join(pkgDir, 'evidence', 'bindings.json'))),
}, null, 2)}\n`);

console.log(`${relative(repoRoot, outPath)}  ${(bytes.length / 1e6).toFixed(2)} MB  ${Number(probe.format.duration).toFixed(3)}s  ${v.width}x${v.height}`);
