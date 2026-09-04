#!/usr/bin/env node
/**
 * Final cut assembly.
 *
 *   node media/hac-351/bin/finalize-cut.mjs <path-to-live-capture> [startOffsetSeconds]
 *
 * Takes the freshly recorded live Google Cloud traversal, conforms it into the
 * R08L slot, rebuilds RC1 through its own pipeline, prepends the conformed intro
 * animation, and writes the final master.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *   - accept a black or near-black capture. The slot currently holds a 45s black
 *     placeholder; silently re-installing another one is the exact failure this
 *     whole gate exists to catch, so luminance is checked before anything else.
 *   - interpolate. A screen recording is conformed to 30fps by whole-frame
 *     duplication/drop only. Inventing frames inside filmed evidence would be
 *     fabricating what the run looked like.
 *   - retouch the evidence. Scaling and padding to 1920x1080 is the only spatial
 *     operation. No crop that hides output, no blur, no colour change, no overlay.
 *   - overwrite the existing placeholder without keeping it.
 *
 * Everything factual in the film stays owned by the RC1 pipeline: this script
 * hands it a conformed insert and then calls its existing derive/render steps
 * rather than re-implementing timing, captions or manifests.
 */
import { existsSync, copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(join(here, '..', '..', '..'));

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const SLOT = join(repoRoot, 'media/hac-336/rc1/inserts/IL-MOT-023-live-cloud-traversal-1920x1080.mp4');
const INTRO = join(repoRoot, 'media/hac-351/intro/intro-conformed-1920x1080-30fps.mp4');
const RC1_EXPORT = join(repoRoot, 'media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4');
const FINAL = join(repoRoot, 'media/hac-336/rc1/exports/IL-MOT-024-interlock-final-1920x1080.mp4');
const SLOT_SECONDS = 45.0;

const raw = process.argv[2];
const offset = Number(process.argv[3] ?? 0);
if (!raw || !existsSync(raw)) {
  console.error('usage: finalize-cut.mjs <path-to-live-capture> [startOffsetSeconds]');
  process.exit(2);
}

const probe = (p, entries) => JSON.parse(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', entries, '-of', 'json', p], { encoding: 'utf8' }));

/** Mean luminance of one frame, 0-255. Used to refuse a black placeholder. */
function luma(p, t) {
  const out = execFileSync('/bin/sh', ['-c',
    `${FFMPEG} -v error -ss ${t} -i "${p}" -frames:v 1 -vf "scale=64:36,format=gray" -f rawvideo - | xxd -p | tr -d '\\n'`],
    { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
  if (!out) return null;
  const bytes = out.match(/../g).map((h) => parseInt(h, 16));
  return bytes.reduce((a, b) => a + b, 0) / bytes.length;
}

console.log('1. inspecting the capture');
const meta = probe(raw, 'stream=codec_type,width,height,r_frame_rate:format=duration');
const v = meta.streams.find((s) => s.codec_type === 'video');
if (!v) throw new Error('no video stream in the capture');
const dur = Number(meta.format.duration);
console.log(`   ${v.width}x${v.height} ${v.r_frame_rate} ${dur.toFixed(3)}s`);

if (dur - offset < SLOT_SECONDS - 0.05) {
  throw new Error(`capture is ${dur.toFixed(3)}s from offset ${offset}; the R08L slot needs ${SLOT_SECONDS}s. `
    + 'Record more, or pass a smaller offset.');
}

console.log('2. refusing a black capture');
const samples = [offset + 1, offset + 15, offset + 30, offset + 44]
  .map((t) => ({ t, mean: luma(raw, t) }))
  .filter((s) => s.mean !== null);
for (const s of samples) console.log(`   t=${s.t.toFixed(0)}s mean=${s.mean.toFixed(1)}`);
const brightest = Math.max(...samples.map((s) => s.mean));
if (brightest < 12) {
  throw new Error(`every sampled frame is near-black (brightest mean ${brightest.toFixed(1)}). `
    + 'That is what the placeholder already looks like; refusing to install it as evidence.');
}

console.log('3. conforming into the R08L slot');
if (!existsSync(`${SLOT}.placeholder`)) {
  copyFileSync(SLOT, `${SLOT}.placeholder`);
  console.log('   kept the black placeholder as .placeholder');
}
const tmp = `${SLOT}.tmp.mp4`;
execFileSync(FFMPEG, [
  '-v', 'error',
  '-ss', String(offset), '-i', raw,
  '-t', String(SLOT_SECONDS),
  // letterbox rather than crop: a crop could remove console output that is the
  // evidence. fps= duplicates/drops whole frames; nothing is interpolated.
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,'
       + 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30',
  '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-y', tmp,
]);
renameSync(tmp, SLOT);
const slotMeta = probe(SLOT, 'stream=width,height,r_frame_rate,nb_frames:format=duration');
console.log(`   slot now ${slotMeta.streams[0].width}x${slotMeta.streams[0].height} `
  + `${slotMeta.streams[0].r_frame_rate} ${Number(slotMeta.format.duration).toFixed(3)}s `
  + `${slotMeta.streams[0].nb_frames}f`);

const run = (label, args) => {
  console.log(label);
  const r = spawnSync('pnpm', args, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
  process.stdout.write((r.stdout ?? '').split('\n').slice(-6).map((l) => `   ${l}`).join('\n'));
  if (r.status !== 0) process.stdout.write((r.stderr ?? '').split('\n').slice(-8).map((l) => `   ${l}`).join('\n'));
  return r.status;
};

run('4. rc1:derive', ['run', 'rc1:derive']);
run('5. rc1:render', ['run', 'rc1:render']);

console.log('6. prepending the intro');
const rc1Dur = Number(probe(RC1_EXPORT, 'format=duration').format.duration);
const introDur = Number(probe(INTRO, 'format=duration').format.duration);
// Concat via filter so the two sources' differing audio layouts cannot desync;
// the intro keeps its own audio as a title bed, then the narration takes over.
execFileSync(FFMPEG, [
  '-v', 'error',
  '-i', INTRO,
  '-i', join(repoRoot, 'media/hac-351/review/intro-animation.mp4'),
  '-i', RC1_EXPORT,
  '-filter_complex',
  '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
  + 'loudnorm=I=-19:TP=-1.5:LRA=11[ia];'
  + '[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[na];'
  + '[0:v][ia][2:v][na]concat=n=2:v=1:a=1[v][a]',
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart',
  '-y', FINAL,
]);

const f = probe(FINAL, 'stream=codec_type,width,height,r_frame_rate,nb_frames:format=duration,size');
const total = Number(f.format.duration);
const mm = Math.floor(total / 60);
const ss = (total - mm * 60).toFixed(1);
console.log(`   intro ${introDur.toFixed(1)}s + rc1 ${rc1Dur.toFixed(1)}s = ${total.toFixed(1)}s (${mm}:${ss.padStart(4, '0')})`);
console.log(`   ${f.streams[0].width}x${f.streams[0].height} ${f.streams[0].r_frame_rate}`);
if (total > 240) console.log('   WARNING: over the 240s Devpost ceiling');
else if (total < 215 || total > 225) console.log(`   NOTE: ${mm}:${ss} is outside the 3:35-3:45 preference`);

console.log('\n7. gates');
run('   check:rc1', ['run', 'check:rc1']);
run('   check:veo', ['run', 'check:veo']);
console.log(`\nfinal master: ${FINAL}`);
