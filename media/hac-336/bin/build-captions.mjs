#!/usr/bin/env node
/**
 * Writes the caption tracks from the cut.
 *
 * Separate from `build-video.mjs` on purpose: the captions are pure text derived
 * from `cut.json`, so CI can regenerate them and diff, while the encode — the
 * one step that needs ffmpeg — stays out of CI entirely. A caption that drifted
 * from the narration it transcribes would otherwise be invisible until someone
 * turned subtitles on.
 *
 * The cut carries no audio track. These cues are the narration text a voice-over
 * would speak, and the text a muted viewer reads beside the frame; they are
 * written now so that recording a voice-over later is a matter of reading them
 * aloud rather than re-authoring them.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline, vttTime, srtTime } from './lib/timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const captionsDir = join(repoRoot, 'media', 'hac-336', 'captions');

const cut = JSON.parse(readFileSync(join(repoRoot, 'media/hac-336/evidence/cut.json'), 'utf8'));
const tl = timeline(cut);

export const cues = tl.beats.map((b) => ({
  index: b.index,
  start: b.captionStart,
  end: b.captionEnd,
  text: cut.beats[b.index].narration,
}));

export const vtt = 'WEBVTT\n\nNOTE\n'
  + 'Interlock final cut - narration and caption track.\n'
  + 'The cut has no audio. These cues are the spoken text a voice-over would carry,\n'
  + 'and the text a muted viewer can read alongside the frame.\n\n'
  + `${cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`).join('\n')}`;

export const srt = cues
  .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
  .join('\n');

export const VTT_PATH = 'media/hac-336/captions/interlock-final-cut.en.vtt';
export const SRT_PATH = 'media/hac-336/captions/interlock-final-cut.en.srt';

/* Importable for the gate; executable for the pipeline. */
if (process.argv[1] && process.argv[1].endsWith('build-captions.mjs')) {
  mkdirSync(captionsDir, { recursive: true });
  writeFileSync(join(repoRoot, VTT_PATH), vtt);
  writeFileSync(join(repoRoot, SRT_PATH), srt);
  process.stdout.write(`HAC-336 captions written\n  ${cues.length} cues, WebVTT + SubRip\n`);
}
