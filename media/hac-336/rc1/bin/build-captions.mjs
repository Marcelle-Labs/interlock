#!/usr/bin/env node
/**
 * The RC1 caption track.
 *
 * Cues are derived from the same timeline the picture and the narration bed
 * derive from, so a caption cannot drift from the line it transcribes.
 *
 * Two rules the brief fixes:
 *   - Captions never silently simplify a more precise narrated claim. Where the
 *     two differ it is because the SPOKEN form is the natural-language reading
 *     of a token the caption prints exactly (ALLOW_PARALLEL, EXECUTED,
 *     gemini-3.5-flash). The caption is always the more precise record.
 *   - Wrapping breaks on whitespace only, so a technical token is never split
 *     across two lines.
 *
 * A long line becomes several cues, each holding a share of the line's measured
 * duration proportional to its character count, so the text advances with the
 * voice instead of dumping a paragraph on screen.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline, vttTime, srtTime } from './lib/rc1-timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));

const cut = readJson('media/hac-336/rc1/evidence/cut-rc1.json');
const narration = readJson('media/hac-336/rc1/evidence/narration-manifest.json');
const tl = timeline(cut, narration);
const { maxLineChars: MAX, maxLinesPerCue: LINES } = cut.captionPolicy;

/** Greedy wrap on whitespace. Tokens stay atomic because they contain none. */
function wrap(text) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= MAX) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Split a line into balanced cues.
 *
 * Greedy filling strands scraps: it packs the first cue to capacity and leaves
 * a 0.5s cue reading "mutates." So this partitions instead — smallest feasible
 * number of cues, then, among partitions of that size, the one whose cues are
 * closest to equal length, with a preference for breaking where a sentence
 * ends. Lines here are at most ~35 words and 4 cues, so the exact search is
 * cheaper than the heuristics it replaces.
 *
 * Feasibility is decided by actually wrapping a candidate cue and counting the
 * lines, because the wrap is what the viewer sees; a character count only
 * approximates it.
 */
function chunk(text) {
  const words = text.split(/\s+/);
  const fits = (a, b) => wrap(words.slice(a, b).join(' ')).length <= LINES;
  const segLen = (a, b) => words.slice(a, b).join(' ').length;
  const W = words.length;

  // Fewest cues that can hold the line at all.
  let minGroups = 0;
  for (let i = 0; i < W;) {
    let j = i + 1;
    while (j < W && fits(i, j + 1)) j += 1;
    if (j === i) throw new Error(`caption word does not fit one cue: ${words[i]}`);
    i = j; minGroups += 1;
  }
  if (minGroups === 1) return [wrap(text)];

  const target = text.length / minGroups;
  const endsSentence = (b) => /[.:;]$/.test(words[b - 1]);
  const endsClause = (b) => /,$/.test(words[b - 1]);
  /*
   * Breaking mid-sentence is allowed, just worse than breaking at its end, and
   * worse again than breaking at a comma. Without the clause bonus the balance
   * term alone split "avoided the invalid / outcomes," straight through a noun
   * phrase — even lengths, unreadable seam.
   */
  const SENTENCE_BONUS = target * target * 0.35;
  const CLAUSE_BONUS = SENTENCE_BONUS * 0.55;
  const INF = Infinity;

  // best[g][i] = cheapest partition of words[0..i) into exactly g cues.
  const best = Array.from({ length: minGroups + 1 }, () => new Array(W + 1).fill(INF));
  const from = Array.from({ length: minGroups + 1 }, () => new Array(W + 1).fill(-1));
  best[0][0] = 0;
  for (let g = 1; g <= minGroups; g += 1) {
    for (let i = 1; i <= W; i += 1) {
      for (let j = g - 1; j < i; j += 1) {
        if (best[g - 1][j] === INF || !fits(j, i)) continue;
        const d = segLen(j, i) - target;
        let bonus = 0;
        if (i < W && endsSentence(i)) bonus = SENTENCE_BONUS;
        else if (i < W && endsClause(i)) bonus = CLAUSE_BONUS;
        const cost = best[g - 1][j] + d * d - bonus;
        if (cost < best[g][i]) { best[g][i] = cost; from[g][i] = j; }
      }
    }
  }
  if (best[minGroups][W] === INF) throw new Error(`could not partition caption: ${text}`);

  const cuts = [W];
  for (let g = minGroups, i = W; g > 0; g -= 1) { i = from[g][i]; cuts.unshift(i); }
  const groups = [];
  for (let k = 0; k + 1 < cuts.length; k += 1) groups.push(words.slice(cuts[k], cuts[k + 1]).join(' '));
  return groups.map((g) => wrap(g));
}

const captionOf = (lineId) => {
  for (const b of cut.beats) for (const l of b.lines) if (l.lineId === lineId) return l;
  throw new Error(`no authored line ${lineId}`);
};

const MIN_CUE = cut.captionPolicy.minCueSeconds;
const cues = [];
for (const beat of tl.beats) {
  for (const line of beat.lines) {
    const authored = captionOf(line.lineId);
    const groups = chunk(authored.caption);
    const weights = groups.map((g) => g.join(' ').length);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = line.startSeconds;
    groups.forEach((g, i) => {
      const share = (weights[i] / total) * line.durationSeconds;
      const start = t;
      // The last cue of a line ends exactly when the line ends, so rounding
      // cannot leave a sliver of caption hanging past the audio.
      const end = i === groups.length - 1 ? line.endSeconds : Math.round((t + share) * 1000) / 1000;
      cues.push({
        index: cues.length + 1,
        lineId: line.lineId,
        beatId: beat.beatId,
        startSeconds: Math.round(start * 1000) / 1000,
        endSeconds: end,
        text: g.join('\n'),
      });
      t = end;
    });
  }
}

/*
 * Let the last cue of every line DWELL into the silent gap that follows it.
 *
 * Shortening the narration for the Take 0.1 cold read cut the turnover rate but
 * also cut the mean cue from 4.02s to 3.86s: shorter lines make shorter cues, so
 * text was still flashing, just less often. What competed for attention was text
 * *changing*, not text being present — a caption held still over a settling
 * frame costs the viewer nothing and gives a slow reader the rest of the
 * proposition.
 *
 * Bounded three ways: it stops `CLEAR_BEFORE_NEXT` short of the next line so the
 * track is visibly empty before the voice returns; it never crosses the beat's
 * caption window onto the wrong frame; and it never dwells more than
 * `MAX_DWELL` past the audio, so a caption cannot outlive the thought.
 */
const CLEAR_BEFORE_NEXT = 0.5;
const MAX_DWELL = 2.5;
const ordered = tl.beats.flatMap((b) => b.lines.map((l) => ({ ...l, beatEnd: b.captionEnd })));
for (let i = 0; i < cues.length; i += 1) {
  const cue = cues[i];
  const isLastOfLine = i === cues.length - 1 || cues[i + 1].lineId !== cue.lineId;
  if (!isLastOfLine) continue;
  const idx = ordered.findIndex((l) => l.lineId === cue.lineId);
  const next = ordered[idx + 1];
  const room = Math.min(
    next ? next.startSeconds - CLEAR_BEFORE_NEXT : Infinity,
    ordered[idx].beatEnd,
    cue.endSeconds + MAX_DWELL,
  );
  if (room > cue.endSeconds) cue.endSeconds = Math.round(room * 1000) / 1000;
}

const header = [
  'Interlock — RC1 narration and caption track.',
  'Cues are derived from the measured narration, not authored alongside it.',
  'Technical tokens are printed exactly as the system emits them; the spoken',
  'form is the natural-language reading of the same token.',
].join('\n');

const vtt = `WEBVTT\n\nNOTE\n${header}\n\n${cues.map((c) =>
  `${c.index}\n${vttTime(c.startSeconds)} --> ${vttTime(c.endSeconds)}\n${c.text}\n`).join('\n')}`;
const srt = `${cues.map((c) =>
  `${c.index}\n${srtTime(c.startSeconds)} --> ${srtTime(c.endSeconds)}\n${c.text}\n`).join('\n')}`;

mkdirSync(join(rc1, 'captions'), { recursive: true });
const vttPath = join(rc1, 'captions', 'interlock-rc1.en.vtt');
const srtPath = join(rc1, 'captions', 'interlock-rc1.en.srt');
writeFileSync(vttPath, vtt);
writeFileSync(srtPath, srt);

// Tolerance of a millisecond: an extension that lands on 1.7999 is 1.80s to
// every reader, and failing it would be arithmetic pedantry, not a finding.
const short = cues.filter((c) => c.endSeconds - c.startSeconds < MIN_CUE - 0.005);
if (short.length) {
  throw new Error(`${short.length} cue(s) shorter than ${MIN_CUE}s, too brief to read: `
    + short.map((c) => `#${c.index} (${(c.endSeconds - c.startSeconds).toFixed(2)}s "${c.text.replace(/\n/g, ' ')}")`).join('; '));
}
const over = cues.filter((c) => c.text.split('\n').some((l) => l.length > MAX));
if (over.length) throw new Error(`${over.length} cue line(s) exceed ${MAX} chars: ${over.map((c) => c.index).join(', ')}`);
const overlap = cues.filter((c, i) => i > 0 && c.startSeconds < cues[i - 1].endSeconds - 0.001);
if (overlap.length) throw new Error(`${overlap.length} overlapping cue(s): ${overlap.map((c) => c.index).join(', ')}`);

const perMinute = cues.length / (tl.totalSeconds / 60);
if (perMinute > cut.captionPolicy.maxCuesPerMinute) {
  throw new Error(`caption turnover is ${perMinute.toFixed(1)} cues/min, over the `
    + `${cut.captionPolicy.maxCuesPerMinute} ceiling. The Take 0.1 cold read failed on exactly this: `
    + 'subtitles changing faster than the viewer can survey the frame. Shorten the narration lines '
    + 'rather than widening the cue, so a line is one or two cues instead of four.');
}
const meanCue = cues.reduce((a, c) => a + (c.endSeconds - c.startSeconds), 0) / cues.length;
if (meanCue < cut.captionPolicy.minMeanCueSeconds) {
  throw new Error(`mean cue is ${meanCue.toFixed(2)}s, under the `
    + `${cut.captionPolicy.minMeanCueSeconds}s floor. Turnover rate alone can be met by a long film; `
    + 'this is the check that the individual cue is actually on screen long enough to read.');
}
process.stderr.write(`${perMinute.toFixed(1)} cues/min, mean cue ${meanCue.toFixed(2)}s\n`);
process.stderr.write(`${cues.length} cues from ${tl.beats.flatMap((b) => b.lines).length} lines\n`
  + `  vtt ${createHash('sha256').update(vtt).digest('hex').slice(0, 12)}…  srt ${createHash('sha256').update(srt).digest('hex').slice(0, 12)}…\n`);
export { cues };
