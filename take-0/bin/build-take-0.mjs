#!/usr/bin/env node
/**
 * Take 0 package builder.
 *
 * Reads take-0/manifest/take-0-timeline.json and derives:
 *   voice/     eight ElevenLabs-ready narration segments, with fit arithmetic
 *   captions/  SRT + VTT aligned to beat starts
 *   canva/     the Canva timeline manifest (CSV + Markdown)
 *   exports/   the assembled backup cut (with --render)
 *
 * Nothing here is evidence. It orders and times assets that are gated elsewhere.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const ROOT = resolve(PKG, '..');
const M = JSON.parse(readFileSync(join(PKG, 'manifest/take-0-timeline.json'), 'utf8'));
const RENDER = process.argv.includes('--render');

/* ---------- spoken-token expansion ------------------------------------- */
const SPOKEN = [
  [/\bgemini-3\.5-flash\b/gi, 'gemini three point five flash'],
  [/\b1\.35\.1\b/g, 'one point three five point one'],
  [/\bus-central1\b/gi, 'u s central one'],
  [/\b140\b/g, 'one hundred forty'], [/\b130\b/g, 'one hundred thirty'],
  [/\b120\b/g, 'one hundred twenty'], [/\b105\b/g, 'one hundred five'],
  [/\b403\b/g, 'four oh three'], [/\b401\b/g, 'four oh one'],
  [/\b45\b/g, 'forty five'],
  [/\bADK\b/g, 'A D K'], [/\bMCP\b/g, 'M C P'], [/\bIAM\b/g, 'I A M'],
  [/\bAI\b/g, 'A I'], [/\bid\b/g, 'i d'],
  [/\bCONTENT_AUTHZ\b/g, 'content auth z'],
  [/\bALLOW_SERIALIZED\b/g, 'allow serialized'],
  [/\bWITHHOLD_SERIALIZE\b/g, 'withhold serialize'],
  [/\bALLOW_PARALLEL\b/g, 'allow parallel'],
];
const tokens = (s) => {
  let t = s;
  for (const [re, rep] of SPOKEN) t = t.replace(re, rep);
  return t.replace(/[^\w\s'-]/g, ' ').split(/[\s-]+/).filter(Boolean).length;
};
const speakSeconds = (s) => tokens(s) / M.wordRate;

/* ---------- validate ---------------------------------------------------- */
const problems = [];
for (const b of M.beats) {
  const p = join(ROOT, b.asset);
  if (!existsSync(p)) problems.push(`${b.id}: MISSING ASSET ${b.asset}`);
  const cues = b.focus ?? [];
  if (b.asset.endsWith('.mp4') && cues.length) problems.push(`${b.id}: the forensic replay takes no focus cue`);
  let last = -1;
  for (const c of cues) {
    if (c.t <= last) problems.push(`${b.id}: focus cues must advance in time (t=${c.t})`);
    last = c.t;
    if (c.t >= b.seconds) problems.push(`${b.id}: focus cue at t=${c.t} is past the beat (${b.seconds}s)`);
    if (c.kind === 'PUNCH') {
      const [x, y, w, h] = c.box;
      if (Math.abs(w / h - 16 / 9) > 0.01) problems.push(`${b.id}: PUNCH box ${w}x${h} is not 16:9`);
      if (x < 0 || y < 0 || x + w > 1920 || y + h > 1080) problems.push(`${b.id}: PUNCH box [${c.box}] leaves the frame`);
      if (w >= 1800) problems.push(`${b.id}: PUNCH box is barely a zoom (${(1920 / w).toFixed(2)}x); use DIM`);
    }
    if (c.kind === 'DIM' && !(c.y1 >= 0 && c.y2 > c.y1 && c.y2 <= 1080)) problems.push(`${b.id}: DIM band ${c.y1}..${c.y2} is out of range`);
  }
  if (cues.length && cues[cues.length - 1].kind !== 'WIDE') problems.push(`${b.id}: focus must return to WIDE before the beat ends`);
}

/* ---------- time the cut ------------------------------------------------ */
let t = 0;
for (const b of M.beats) { b.start = t; t += b.seconds; b.end = t; }
const total = t;
if (total > 240) problems.push(`TOTAL ${total}s exceeds the 4:00 cap`);

/* ---------- VO segments ------------------------------------------------- */
const VO_META = {
  'VO-01': { title: 'Cold open - the consequence', block: 'COLD_OPEN' },
  'VO-02': { title: 'Forensic replay', block: 'FORENSIC_REPLAY' },
  'VO-03': { title: 'Four-arm comparison and evidence ablation', block: 'COMPARISON_ABLATION' },
  'VO-04': { title: 'Proof-class reset', block: 'PROOF_CLASS_RESET' },
  'VO-05': { title: 'Google Cloud traversal', block: 'CLOUD_TRAVERSAL' },
  'VO-06': { title: 'Receipt, protected action, independent observation', block: 'RECEIPT_EFFECT_OBSERVATION' },
  'VO-07': { title: 'Architecture and trust boundary', block: 'ARCHITECTURE' },
  'VO-08': { title: 'Bounded close and end card', block: 'BOUNDED_CLOSE' },
};
const SHORTEN = {
  'VO-01': 'Drop "to one shared environment" in the first line.',
  'VO-02': 'Drop the sentence beginning "The bound is a property of the environment"; S5 carries it on screen.',
  'VO-03': 'Drop the final sentence "The evidence is load-bearing"; the board states it.',
  'VO-04': 'Say only "That was controlled evaluation. What follows is a separate deployed run."',
  'VO-05': 'Drop "1.35.1" from speech; it stays on screen and in the caption.',
  'VO-06': 'Drop "Two records, not one: the model\'s own output declares nothing."',
  'VO-07': 'Drop "and returns a decision with a receipt"; the diagram shows it.',
  'VO-08': 'Drop "No interval, no significance"; the bounds board states it.',
};
const PRON = [
  'Interlock - IN-ter-lock, even stress, never "inter-LOCK".',
  'gemini-3.5-flash - "gemini three point five flash".',
  'ADK - spell it: "A-D-K". MCP - "M-C-P". IAM - "I-A-M".',
  'us-central1 - "U-S-central-one".',
  '403 / 401 - "four-oh-three" / "four-oh-one".',
  'ALLOW, EXECUTED, OBSERVED, WITHHOLD_SERIALIZE, ALLOW_PARALLEL - read as flat state names, no emphasis lift. They are values, not verdicts.',
  'Numbers 140 / 130 / 120 / 105 / 45 - natural English, no digit-by-digit.',
  'CONTENT_AUTHZ - "content auth-Z".',
];

const voIds = [...new Set(M.beats.map((b) => b.vo))];
const voOut = [];
for (const vo of voIds) {
  const bs = M.beats.filter((b) => b.vo === vo);
  const text = bs.map((b) => b.narration).join(' ');
  const win = bs.reduce((a, b) => a + b.seconds, 0);
  const spk = speakSeconds(text);
  const head = bs[0].start, tail = bs[bs.length - 1].end;
  if (spk > win) problems.push(`${vo}: narration ${spk.toFixed(1)}s exceeds window ${win.toFixed(1)}s`);
  voOut.push({ vo, ...VO_META[vo], beats: bs.map((b) => b.id), head, tail, win, spk, slack: win - spk, text, shorten: SHORTEN[vo] });
}

mkdirSync(join(PKG, 'voice'), { recursive: true });
for (const v of voOut) {
  const perBeat = M.beats.filter((b) => b.vo === v.vo)
    .map((b) => `  ${b.id}  ${fmt(b.start)}-${fmt(b.end)}  (${b.seconds.toFixed(1)}s)  ${b.narration}`).join('\n');
  writeFileSync(join(PKG, `voice/${v.vo}.txt`), v.text + '\n');
  writeFileSync(join(PKG, `voice/${v.vo}.md`), `# ${v.vo} - ${v.title}

Scene window   ${fmt(v.head)} - ${fmt(v.tail)}  (${v.win.toFixed(1)}s of picture)
Target speech  ${v.spk.toFixed(1)}s at ${M.wordRate} words/sec
Slack          ${v.slack.toFixed(1)}s of silence for visual comprehension
Beats          ${v.beats.join(', ')}

## Text to paste into ElevenLabs

${v.text}

## Per-beat alignment

${perBeat}

## Safe shortening

${v.shorten}

## Pronunciation

${PRON.map((p) => '- ' + p).join('\n')}

## Delivery

Documentary read, measured, no sell. Land the numbers; do not lean on them.
Full stop between proof classes - VO-04 is a wall, not a bridge.
Render as its own file. Do not produce one monolithic track.
`);
}

/* ---------- captions ---------------------------------------------------- */
function fmt(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`; }
function ts(s, sep) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`; }

/**
 * A caption is read, not studied. Two lines, ~42 characters each, is the width a
 * viewer takes in without leaving the picture — so a beat's narration is split at
 * sentence boundaries, then at clause boundaries if a sentence is still too long,
 * and each chunk is given the share of the beat's speaking time its own token
 * count earns. A whole paragraph held for the length of a beat covers the evidence
 * it is describing, which is the one thing a caption on this film must not do.
 */
const MAX_CHARS = 84;
function chunk(text) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= MAX_CHARS) { out.push(s); continue; }
    // Too long to read at once: break at clause boundaries, then at spaces.
    let buf = '';
    for (const part of s.split(/(?<=[,;:])\s+|\s+(?=[-\u2014])/)) {
      if (!buf) { buf = part; continue; }
      if ((buf + ' ' + part).length <= MAX_CHARS) buf += ' ' + part;
      else { out.push(buf); buf = part; }
    }
    while (buf.length > MAX_CHARS) {
      let cut = buf.lastIndexOf(' ', MAX_CHARS);
      if (cut < 20) cut = MAX_CHARS;
      out.push(buf.slice(0, cut).trim());
      buf = buf.slice(cut).trim();
    }
    if (buf) out.push(buf);
  }
  return out;
}
/** Two balanced lines, so a caption never renders as one long line plus a stub. */
function wrap2(s) {
  if (s.length <= 44) return s;
  const mid = Math.floor(s.length / 2);
  let cut = -1, best = 1e9;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && Math.abs(i - mid) < best) { best = Math.abs(i - mid); cut = i; }
  return cut < 0 ? s : s.slice(0, cut) + '\n' + s.slice(cut + 1);
}

const cards = [];
const MIN_CARD = 1.1;   // below this a caption is a flash, not a read
for (const b of M.beats) {
  const parts = chunk(b.narration);
  const weights = parts.map((p) => tokens(p));
  const totalW = weights.reduce((a, x) => a + x, 0) || 1;
  const speak = Math.min(speakSeconds(b.narration), b.seconds - 0.25);
  // Every card gets a floor first; only what is left over is shared by token
  // count. Purely proportional timing gives a one-word card like "Rewind." a
  // third of a second, which is a flicker rather than a caption.
  const floor = Math.min(MIN_CARD, speak / parts.length);
  const spare = Math.max(0, speak - floor * parts.length);
  let at = b.start + 0.15;
  parts.forEach((p, i) => {
    const d = floor + spare * (weights[i] / totalW);
    cards.push({ start: at, end: at + d, text: wrap2(p) });
    at += d;
  });
}
for (let i = 0; i < cards.length - 1; i++) {
  if (cards[i].end > cards[i + 1].start - 0.04) cards[i].end = cards[i + 1].start - 0.04;
}
const short = cards.filter((c) => c.end - c.start < 0.75);
if (short.length) problems.push(`${short.length} caption card(s) shorter than 0.75s - first at ${fmt(short[0].start)}`);

const srt = cards.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
const vtt = 'WEBVTT\n\n' + cards.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
mkdirSync(join(PKG, 'captions'), { recursive: true });
writeFileSync(join(PKG, 'captions/take-0.en.srt'), srt);
writeFileSync(join(PKG, 'captions/take-0.en.vtt'), vtt);
const longest = Math.max(...cards.map((c) => Math.max(...c.text.split('\n').map((l) => l.length))));
if (longest > 46) problems.push(`caption line of ${longest} chars exceeds the 46-char read width`);
if (cards.some((c) => c.text.split('\n').length > 2)) problems.push('a caption wrapped to more than two lines');

/* ---------- canva manifest ---------------------------------------------- */
const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const cueText = (b) => (b.focus ?? []).map((c) => {
  const at = fmt(b.start + c.t);
  if (c.kind === 'WIDE') return `${at} WIDE`;
  if (c.kind === 'PUNCH') return `${at} PUNCH [x${c.box[0]} y${c.box[1]} w${c.box[2]} h${c.box[3]}] -> ${c.what}`;
  return `${at} DIM keep y${c.y1}-${c.y2} -> ${c.what}`;
}).join(' | ') || (b.asset.endsWith('.mp4') ? 'NONE - locked artifact' : 'NONE');
const cols = ['BEAT', 'IN', 'OUT', 'SECONDS', 'BLOCK', 'ASSET', 'NARRATION', 'ON_SCREEN_COPY', 'FOCUS_CUES', 'TRANSITION_OUT', 'PROOF_CLASS', 'SOURCE_ISSUE_OR_RUN', 'STATE', 'REPLACEMENT_NOTES'];
const rows = M.beats.map((b) => [
  b.id, fmt(b.start), fmt(b.end), b.seconds.toFixed(1), b.block, b.asset, b.narration, b.onScreen, cueText(b),
  b.transitionOut, M.proofClasses[b.proofClass], `${b.sourceIssue} | ${b.provenance}`, b.state,
  b.rule || (b.state === 'FINAL' ? 'None. Replace only if HAC-324 hardening re-derives the source asset.' : ''),
].map(esc).join(','));
mkdirSync(join(PKG, 'canva'), { recursive: true });
writeFileSync(join(PKG, 'canva/canva-timeline.csv'), [cols.join(','), ...rows].join('\n') + '\n');

/* ---------- assemble ----------------------------------------------------- */
const WORK = join(PKG, '.work');
if (RENDER) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const segs = [];
  const COMMON = ['-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-an', '-y'];
  const DIM = 0.55;
  let n = 0;
  for (const b of M.beats) {
    const src = join(ROOT, b.asset);
    if (b.asset.endsWith('.mp4')) {
      const out = join(WORK, `${String(n++).padStart(2, '0')}-${b.id}.mp4`);
      const trim = b.trimOut ? ['-t', String(b.trimOut)] : [];
      execFileSync('ffmpeg', ['-v', 'error', '-i', src, ...trim, '-vf', 'scale=1920:1080,fps=30', ...COMMON, out], { stdio: 'inherit' });
      segs.push(out);
      continue;
    }
    // A still beat becomes one sub-segment per focus cue window.
    const cues = (b.focus ?? []).length ? b.focus : [{ t: 0, kind: 'WIDE' }];
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const dur = ((i + 1 < cues.length) ? cues[i + 1].t : b.seconds) - c.t;
      if (dur <= 0) continue;
      let vf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0B0B0D';
      if (c.kind === 'PUNCH') {
        const [x, y, w, h] = c.box;
        vf += `,crop=${w}:${h}:${x}:${y},scale=1920:1080:flags=lanczos`;
      } else if (c.kind === 'DIM') {
        if (c.y1 > 0) vf += `,drawbox=x=0:y=0:w=1920:h=${c.y1}:color=black@${DIM}:t=fill`;
        if (c.y2 < 1080) vf += `,drawbox=x=0:y=${c.y2}:w=1920:h=${1080 - c.y2}:color=black@${DIM}:t=fill`;
      }
      vf += ',fps=30';
      const out = join(WORK, `${String(n++).padStart(2, '0')}-${b.id}-${c.kind}.mp4`);
      execFileSync('ffmpeg', ['-v', 'error', '-loop', '1', '-i', src, '-t', dur.toFixed(3), '-vf', vf, ...COMMON, out], { stdio: 'inherit' });
      segs.push(out);
    }
  }
  const list = join(WORK, 'concat.txt');
  writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n') + '\n');
  const cut = join(PKG, 'exports/TAKE-0.1-interlock-backup-cut-1920x1080.mp4');
  mkdirSync(dirname(cut), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', cut], { stdio: 'inherit' });
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=nb_frames,width,height', '-of', 'default=noprint_wrappers=1', cut]).toString();
  console.log('\nASSEMBLED ' + cut + '\n' + probe);
}

/* ---------- report ------------------------------------------------------- */
console.log(`Take 0: ${M.beats.length} beats, ${total.toFixed(1)}s (${fmt(total)}), cap 4:00`);
console.log(`Narration: ${voOut.reduce((a, v) => a + v.spk, 0).toFixed(1)}s spoken across ${voOut.length} segments`);
for (const v of voOut) console.log(`  ${v.vo}  win ${v.win.toFixed(1)}s  speak ${v.spk.toFixed(1)}s  slack ${v.slack.toFixed(1)}s`);
if (problems.length) { console.error('\nPROBLEMS:\n' + problems.map((p) => ' - ' + p).join('\n')); process.exit(1); }
const nP = M.beats.flatMap((b) => b.focus ?? []).filter((c) => c.kind === 'PUNCH').length;
const nD = M.beats.flatMap((b) => b.focus ?? []).filter((c) => c.kind === 'DIM').length;
console.log(`Focus cues: ${nP} PUNCH, ${nD} DIM, across ${M.beats.filter((b) => (b.focus ?? []).length).length} beats`);
console.log('\nAll assets present. Every segment fits its window. Every PUNCH box is 16:9 and inside the frame.');
