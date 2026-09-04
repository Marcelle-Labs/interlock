#!/usr/bin/env node
/**
 * HAC-351 — builds the two blind review candidates for one unfamiliar reviewer.
 *
 * This is preparation for a directional n=1 adjudication. It renders video only.
 * It does not decide anything, and it does not touch the current disposition.
 *
 * THE ONLY VARIABLE IS THE FIRST 6.0 SECONDS.
 *
 *   treatment "deterministic" : RC1 export [0.000 -> 6.000]
 *   treatment "candidate"     : media/hac-351/edited/IL-VEO-001-cold-open-30fps.mp4
 *
 * Everything after 6.000s is the SAME 35.9s of RC1 export footage in both files,
 * cut from the same source at the same timestamps, so a reviewer comparing the
 * two is comparing openings and nothing else. Held constant by construction:
 * narration copy, narrator, audio file (therefore volume), caption text and
 * caption timing, all footage after the opening, and total duration.
 *
 * A replacement model is used rather than the shift model in INTEGRATION.md.
 * Shifting would push six seconds of different tail material into one candidate
 * and not the other, which would let the reviewer's answer turn on the tail. For
 * an adjudication of the opening, an identical tail matters more than modelling
 * the exact final edit. Recorded here so the difference is not discovered later.
 *
 * Because both candidates carry the SAME opening narration, the deterministic
 * candidate is not RC1 as it ships — RC1 has its own narration and its own
 * picture timing. This pair isolates the opening image against one fixed script;
 * it is not a test of RC1's existing cut.
 *
 * Neither output filename, nor any burned-in frame, nor REVIEW-QUESTIONS.md
 * names the treatments or hints at a preference. The A/B mapping is written
 * OUTSIDE the review directory, under evidence/, so the reviewer cannot see it.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..');

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const OPENING = 6.0;    // the swapped segment
const TOTAL = 41.9;     // just past the 41.889s narration, so no line is clipped

const RC1 = join(repoRoot, 'media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4');
const VEO = join(root, 'edited/IL-VEO-001-cold-open-30fps.mp4');
const VOICE = join(root, 'audition/VOICE-A-opening.mp3');

const reviewDir = join(root, 'review');
const workDir = join(root, '.review-work');
mkdirSync(reviewDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const durationOf = (p) => Number(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());

/* -- captions -------------------------------------------------------------
 * Derived from the measured per-line durations in the audition manifest, so a
 * cue cannot drift from the line it transcribes. Same file burned into both
 * candidates, so caption text and timing are constant across the pair.
 */
const audition = JSON.parse(readFileSync(join(root, 'evidence', 'audition-manifest.json'), 'utf8'));
const lines = audition.voices.A.lines;

const ts = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

let t = 0;
const cues = lines.map((l, i) => {
  const start = t;
  const end = t + l.durationSeconds;
  t = end;
  return `${i + 1}\n${ts(start)} --> ${ts(end)}\n${l.spoken}\n`;
});
const srt = join(workDir, 'captions.srt');
writeFileSync(srt, `${cues.join('\n')}\n`);
console.log(`captions: ${lines.length} cues, ${t.toFixed(3)}s (narration ${durationOf(VOICE).toFixed(3)}s)`);

/* -- the two candidates ---------------------------------------------------- */
const STYLE = "FontName=Helvetica,FontSize=22,PrimaryColour=&H00FFFFFF,"
  + "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=48";
const subFilter = `subtitles=${srt.replace(/:/g, '\\:')}:force_style='${STYLE}'`;

/** Both candidates share this encode so nothing but the picture differs. */
const ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '1'];

function buildDeterministic(out) {
  // RC1 [0 -> TOTAL], captions burned, narration attached.
  execFileSync(FFMPEG, [
    '-v', 'error',
    '-i', RC1,
    '-i', VOICE,
    '-filter_complex', `[0:v]trim=0:${TOTAL},setpts=PTS-STARTPTS,${subFilter}[v]`,
    '-map', '[v]', '-map', '1:a',
    '-t', String(TOTAL), ...ENCODE, '-y', out,
  ]);
}

function buildCandidate(out) {
  // VEO [0 -> OPENING] then RC1 [OPENING -> TOTAL]: the tail is byte-identical
  // in source and timestamps to the deterministic build's tail.
  execFileSync(FFMPEG, [
    '-v', 'error',
    '-i', VEO,
    '-i', RC1,
    '-i', VOICE,
    '-filter_complex',
    `[0:v]trim=0:${OPENING},setpts=PTS-STARTPTS[a];`
    + `[1:v]trim=${OPENING}:${TOTAL},setpts=PTS-STARTPTS[b];`
    + `[a][b]concat=n=2:v=1:a=0[cat];`
    + `[cat]${subFilter}[v]`,
    '-map', '[v]', '-map', '2:a',
    '-t', String(TOTAL), ...ENCODE, '-y', out,
  ]);
}

/* -- randomised assignment ------------------------------------------------- */
const candidateIsA = randomInt(2) === 0;
const assignment = {
  A: candidateIsA ? 'candidate' : 'deterministic',
  B: candidateIsA ? 'deterministic' : 'candidate',
};

const outA = join(reviewDir, 'REVIEW-A.mp4');
const outB = join(reviewDir, 'REVIEW-B.mp4');

(assignment.A === 'candidate' ? buildCandidate : buildDeterministic)(outA);
(assignment.B === 'candidate' ? buildCandidate : buildDeterministic)(outB);

const describe = (p) => {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries',
    'stream=codec_type,width,height,r_frame_rate,nb_frames:format=duration,size',
    '-of', 'json', p], { encoding: 'utf8' }));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return {
    durationSeconds: Number(Number(j.format.duration).toFixed(3)),
    width: Number(v.width), height: Number(v.height),
    frameRate: v.r_frame_rate, frames: Number(v.nb_frames),
    hasAudio: Boolean(a), sha256: sha256(p), bytes: Number(j.format.size),
  };
};

const a = describe(outA);
const b = describe(outB);

/* -- the mapping, written where the reviewer will not be looking ----------- */
writeFileSync(join(root, 'evidence', 'review-mapping.json'), `${JSON.stringify({
  id: 'HAC-351-review-mapping',
  issue: 'HAC-351',
  purpose: 'Blind A/B mapping for a directional n=1 human adjudication of the opening.',
  doNotShowToReviewer: true,
  storedOutsideReviewDirectory: 'media/hac-351/review/ contains only the two videos and the questions.',
  disposition: 'UNCHANGED — VEO_REJECTED. This build decides nothing.',
  assignment,
  heldConstant: ['narration copy', 'narrator (Voice A)', 'audio file and therefore volume',
    'caption text and timing', 'all footage after 6.000s', 'total duration', 'encode settings'],
  variable: 'the first 6.000 seconds only',
  treatments: {
    deterministic: { source: 'media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4 [0.000-6.000]' },
    candidate: { source: 'media/hac-351/edited/IL-VEO-001-cold-open-30fps.mp4 [0.000-6.000]' },
  },
  sharedTail: 'media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4 [6.000-41.900]',
  narration: { track: 'media/hac-351/audition/VOICE-A-opening.mp3', sha256: sha256(VOICE) },
  caveat: 'Both candidates carry the HAC-351 opening narration, so the deterministic '
    + 'candidate is not RC1 as it ships. This pair isolates the opening image against '
    + 'one fixed script; it is not an evaluation of RC1’s existing cut.',
  outputs: { 'REVIEW-A.mp4': { ...a, treatment: assignment.A }, 'REVIEW-B.mp4': { ...b, treatment: assignment.B } },
}, null, 2)}\n`);

rmSync(workDir, { recursive: true, force: true });

console.log(`REVIEW-A.mp4  ${a.durationSeconds}s ${a.frames}f ${a.frameRate} audio=${a.hasAudio}`);
console.log(`REVIEW-B.mp4  ${b.durationSeconds}s ${b.frames}f ${b.frameRate} audio=${b.hasAudio}`);
console.log('mapping -> media/hac-351/evidence/review-mapping.json (not in review/)');
