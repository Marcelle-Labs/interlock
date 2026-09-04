#!/usr/bin/env node
/**
 * Assembles RC1: picture, narration bed, mux.
 *
 * Three passes rather than one filter graph. A single graph carrying 17 video
 * inputs, 20 audio inputs and 16 crossfades is one typo away from an error
 * message nobody can read, and it gives the gate nothing intermediate to check.
 *
 * ffmpeg resolves to an absolute path, never through PATH: the binary that
 * encoded a submission video should be a recorded fact, not whatever the shell
 * found that afternoon. `FFMPEG` overrides, and must itself be absolute.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline } from './lib/rc1-timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const work = join(rc1, '.work');
mkdirSync(work, { recursive: true });
mkdirSync(join(rc1, 'exports'), { recursive: true });

const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const abs = (p) => join(repoRoot, p);

const cut = readJson('media/hac-336/rc1/evidence/cut-rc1.json');
const narration = readJson('media/hac-336/rc1/evidence/narration-manifest.json');
const tl = timeline(cut, narration);

const CEILING = cut.runtimeTarget.editorialCeiling;
if (tl.totalSeconds > CEILING) {
  throw new Error(`RC1 assembles to ${tl.totalSeconds}s, over the ${CEILING}s editorial ceiling. `
    + 'Shorten narration in cut-rc1.json; do not drop a required proof element to fit.');
}

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', '/snap/bin/ffmpeg'];
function resolveFfmpeg() {
  const o = process.env.FFMPEG;
  if (o) {
    if (!isAbsolute(o)) throw new Error(`FFMPEG must be absolute, not ${JSON.stringify(o)}`);
    if (!existsSync(o) || !statSync(o).isFile()) throw new Error(`FFMPEG points at ${o}, not a file`);
    return o;
  }
  const f = FFMPEG_CANDIDATES.find((c) => existsSync(c) && statSync(c).isFile());
  if (!f) throw new Error(`no ffmpeg at any of: ${FFMPEG_CANDIDATES.join(', ')}. Set FFMPEG.`);
  return f;
}
const FFMPEG = resolveFfmpeg();
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const run = (args, label) => {
  try { execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { throw new Error(`${label} failed:\n${(e.stderr || Buffer.from('')).toString().split('\n').slice(-18).join('\n')}`); }
};
/** One value per call. Batching entries makes field order load-bearing, and it
 *  silently produced a NaN duration the first time this manifest was written. */
const probe1 = (file, entries, stream) => execFileSync(FFPROBE,
  ['-v', 'error', ...(stream ? ['-select_streams', stream] : []),
    '-show_entries', entries, '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim().split('\n')[0];

const { fps, width, height } = cut.geometry;
const X = cut.transitionSeconds;

/* -- pass 1: one segment per beat ---------------------------------------- */
process.stderr.write('pass 1  segments\n');
const segments = [];
for (const b of tl.beats) {
  const beat = cut.beats.find((x) => x.beatId === b.beatId);
  const seg = join(work, `${b.beatId}.mp4`);
  const src = abs(beat.source.path);
  if (!existsSync(src)) throw new Error(`${b.beatId}: source missing: ${beat.source.path}`);

  if (beat.source.kind === 'video' || beat.source.kind === 'live-capture') {
    const isLive = beat.source.kind === 'live-capture';
    if (isLive && beat.source.pendingCapture) {
      throw new Error(`${b.beatId} is still an unfilled capture slot. `
        + 'See media/hac-336/rc1/CAPTURE-RUNBOOK.md; RC1 cannot be rendered without the live take.');
    }
    // The replay, with the proof-class label composited into the empty margin
    // the plate leaves at the foot of the frame. Nothing measured is covered.
    const label = abs(isLive
      ? 'media/hac-336/rc1/inserts/label-live-cloud-run-1920x1080.png'
      : 'media/hac-336/rc1/inserts/label-controlled-evaluation-1920x1080.png');
    // The live take's label stays up for the whole segment. The replay's fades
    // out before its ink end card; the live take has no such card, and a judge
    // scrubbing into the middle of it must still see what they are looking at.
    const fade = isLive
      ? `[1:v]format=rgba,fade=t=in:st=0.3:d=0.4:alpha=1[lbl];`
      : `[1:v]format=rgba,fade=t=in:st=0.4:d=0.5:alpha=1,fade=t=out:st=28.5:d=0.5:alpha=1[lbl];`;
    const enable = isLive ? '' : ":enable='lte(t,29.0)'";
    // `-loop 1 -framerate` on the label: a single-frame input sits at t=0
    // forever, so a fade-in on it evaluates at t=0 and leaves the overlay fully
    // transparent for the whole beat. It needs its own timeline to fade along.
    run(['-y', '-v', 'error', '-i', src,
      '-loop', '1', '-framerate', String(fps), '-t', String(b.holdSeconds), '-i', label,
      '-filter_complex',
      `[0:v]scale=${width}:${height},fps=${fps}[b];`
      + fade
      + `[b][lbl]overlay=0:0:format=auto${enable},format=yuv420p[v]`,
      '-map', '[v]', '-an', '-t', String(b.holdSeconds),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', seg], `${b.beatId} segment`);
  } else {
    run(['-y', '-v', 'error', '-loop', '1', '-t', String(b.holdSeconds), '-i', src,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b0d0e,fps=${fps},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', seg], `${b.beatId} segment`);
  }
  segments.push({ beatId: b.beatId, path: seg, holdSeconds: b.holdSeconds });
  process.stderr.write(`  ${b.beatId} ${b.holdSeconds.toFixed(2)}s\n`);
}

/* -- pass 2: crossfade chain --------------------------------------------- */
process.stderr.write('pass 2  crossfade chain\n');
const inputs = segments.flatMap((s) => ['-i', s.path]);
const parts = [];
let prev = '0:v';
for (let i = 1; i < segments.length; i += 1) {
  const out = i === segments.length - 1 ? 'vout' : `x${i}`;
  parts.push(`[${prev}][${i}:v]xfade=transition=fade:duration=${X}:offset=${tl.beats[i].startSeconds}[${out}]`);
  prev = out;
}
const picture = join(work, 'picture.mp4');
run(['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'),
  '-map', '[vout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', picture], 'crossfade chain');

/* -- pass 3: the narration bed ------------------------------------------- */
process.stderr.write('pass 3  narration bed\n');
const lineRows = tl.beats.flatMap((b) => b.lines);
const aInputs = lineRows.flatMap((l) => ['-i', abs(narration.lines.find((n) => n.lineId === l.lineId).path)]);
const aParts = lineRows.map((l, i) => `[${i}:a]adelay=${Math.round(l.startSeconds * 1000)}:all=1[d${i}]`);
const mix = `${lineRows.map((_, i) => `[d${i}]`).join('')}amix=inputs=${lineRows.length}:normalize=0:dropout_transition=0[m]`;
// Spoken-word loudness target. Applied once, over the assembled bed, so every
// line sits at the same level regardless of what the synthesiser returned.
const post = `[m]apad=whole_dur=${tl.totalSeconds},atrim=0:${tl.totalSeconds},`
  + `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`;
const voice = join(work, 'narration.wav');
run(['-y', '-v', 'error', ...aInputs, '-filter_complex', `${aParts.join(';')};${mix};${post}`,
  '-map', '[aout]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', voice], 'narration bed');

/* -- pass 4: mux ---------------------------------------------------------- */
process.stderr.write('pass 4  mux\n');
const outName = 'IL-MOT-022-interlock-rc1-1920x1080.mp4';
const outPath = join(rc1, 'exports', outName);
run(['-y', '-v', 'error', '-i', picture, '-i', voice,
  '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-shortest', '-movflags', '+faststart', outPath], 'mux');

/* -- pass 5: the audition derivatives ------------------------------------- */

/*
 * Mode B and Mode C of the cold-view audition, built here so the three modes are
 * guaranteed to be the same master. Mode C ships as an audio file rather than
 * "mute it and look away", so the picture cannot leak into an audio-only result.
 * Both are stream copies where possible and are gitignored: they carry no
 * information the master does not.
 */
const auditionDir = join(rc1, 'audition');
mkdirSync(auditionDir, { recursive: true });
run(['-y', '-v', 'error', '-i', outPath, '-an', '-c:v', 'copy',
  join(auditionDir, 'RC1-muted.mp4')], 'audition muted');
run(['-y', '-v', 'error', '-i', outPath, '-vn', '-c:a', 'aac', '-b:a', '192k',
  join(auditionDir, 'RC1-audio-only.m4a')], 'audition audio-only');
process.stderr.write('pass 5  audition derivatives\n');

/* -- read back what was actually written --------------------------------- */
const bytes = readFileSync(outPath);
const dur = probe1(outPath, 'format=duration');
const w = probe1(outPath, 'stream=width', 'v:0');
const h = probe1(outPath, 'stream=height', 'v:0');
const vcodec = probe1(outPath, 'stream=codec_name', 'v:0');
const acodec = probe1(outPath, 'stream=codec_name', 'a:0');
const arate = probe1(outPath, 'stream=sample_rate', 'a:0');
const nAudio = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', outPath], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;

const drift = Math.abs(Number(dur) - tl.totalSeconds);
if (!Number.isFinite(Number(dur))) throw new Error('could not read a duration back out of the encoded file');
if (drift > 0.25) throw new Error(`encoded ${dur}s but derived ${tl.totalSeconds}s (drift ${drift.toFixed(3)}s)`);

const manifest = {
  manifestId: 'HAC-336-rc1-render-manifest',
  revision: 'rc1',
  issue: 'HAC-336',
  note: 'Derived by media/hac-336/rc1/bin/build-video.mjs. Do not hand-edit. Duration, geometry and codec are read back out of the finished file rather than copied from the encode request.',
  generator: 'media/hac-336/rc1/bin/build-video.mjs',
  encoder: execFileSync(FFMPEG, ['-version'], { encoding: 'utf8' }).split('\n')[0],
  encoderPath: FFMPEG,
  video: {
    path: `media/hac-336/rc1/exports/${outName}`,
    sha256: sha256(bytes),
    bytes: bytes.length,
    width: Number(w), height: Number(h), codec: vcodec, fps,
    measuredDurationSeconds: Math.round(Number(dur) * 1000) / 1000,
    derivedDurationSeconds: tl.totalSeconds,
    audioTracks: nAudio,
    audioCodec: acodec,
    audioSampleRate: Number(arate),
  },
  audio: {
    track: 'ElevenLabs narration, one file per line, placed at derived timestamps',
    loudnessTarget: 'EBU R128 I=-16 LUFS, TP=-1.5 dBTP, LRA=11',
    spokenSeconds: tl.spokenSeconds,
    silenceSeconds: tl.silenceSeconds,
    speechDensityPercent: tl.speechDensity,
  },
  overlays: [{
    onBeat: 'R01',
    path: 'media/hac-336/rc1/inserts/label-controlled-evaluation-1920x1080.png',
    why: 'Section 8 proof-class identification over the HAC-350 replay. Editorial chrome in the plate margin; covers no measured value.',
  }],
};
writeFileSync(join(rc1, 'evidence', 'render-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`\nwrote ${outName}\n  ${manifest.video.measuredDurationSeconds}s encoded / ${tl.totalSeconds}s derived\n`
  + `  ${(bytes.length / 1e6).toFixed(1)} MB, ${nAudio} audio track(s)\n`);
