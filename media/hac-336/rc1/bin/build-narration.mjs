#!/usr/bin/env node
/**
 * Generates the RC1 narration, one file per line, and measures what came back.
 *
 * Duration is read out of the encoded file with ffprobe rather than estimated
 * from a words-per-minute model, because the hold each line sits under is
 * derived from this number. An estimated duration would let a hold drift out of
 * sync with the audio it is supposed to contain and still look green.
 *
 * The API key is never read from a file or written to one. It arrives in the
 * environment from `doppler run` and is used only as a request header.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const outDir = join(rc1, 'narration');
mkdirSync(outDir, { recursive: true });

const cut = JSON.parse(readFileSync(join(rc1, 'evidence', 'cut-rc1.json'), 'utf8'));
const key = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
/*
 * Credentials are required only to SYNTHESISE. The trimmed .wav a render
 * consumes is a deterministic function of the .mp3 beside it, so a checkout
 * that has the mp3s can rebuild the wavs and encode the film without a key —
 * which is the difference between a package a reviewer can rebuild and one only
 * its author can.
 */
const requireCredentials = () => {
  if (!key || !voiceId) {
    throw new Error('a line needs synthesising, so ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID '
      + 'must be in the environment. Use `pnpm run rc1:narrate`, which supplies them via doppler.');
  }
};

const FFPROBE = '/opt/homebrew/bin/ffprobe';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const durationOf = (p) => Number(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());

const v = cut.narrationVoice;
const lines = cut.beats.flatMap((b) => b.lines.map((l) => ({ ...l, beatId: b.beatId })));

/*
 * Synthesis-only pronunciation aliases.
 *
 * `spoken` stays the canonical sentence: it is what the caption is checked
 * against, and CAP-precision requires the caption to carry at least as many
 * tokens as the spoken line. Respelling a term phonetically in `spoken` would
 * add tokens the caption does not have and fail that check — so the respelling
 * is applied here, to the text handed to the synthesiser, and nowhere else.
 *
 * The substitution is folded into the per-line cache key, so adding an alias
 * re-synthesises exactly the lines it changes and leaves every other line cached.
 */
const ALIASES = Object.entries(cut.pronunciationAliases ?? {});
const forSynthesis = (text) => ALIASES.reduce(
  (acc, [from, to]) => acc.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to),
  text,
);

const rows = [];
for (const line of lines) {
  const file = join(outDir, `${line.lineId}.mp3`);
  const spokenForSynthesis = forSynthesis(line.spoken);
  // Two digests, deliberately. `cacheKey` covers the text actually sent to the
  // synthesiser, so adding a pronunciation alias re-renders the lines it changes.
  // `textHash` stays the digest of the canonical spoken line, because that is
  // what NAR-* verifies and what the caption is compared against — recording the
  // aliased form there would make every aliased line look like narration drift.
  const cacheKey = createHash('sha256').update(spokenForSynthesis).digest('hex');
  const textHash = createHash('sha256').update(line.spoken).digest('hex');
  // Regenerate only when the spoken text changed. A cached line is still measured.
  const cacheFile = join(outDir, `${line.lineId}.sha256`);
  const cached = existsSync(file) && existsSync(cacheFile)
    && readFileSync(cacheFile, 'utf8').trim() === cacheKey;
  if (!cached) {
    requireCredentials();
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: spokenForSynthesis, model_id: v.model, voice_settings: v.settings }),
    });
    if (!res.ok) throw new Error(`${line.lineId}: ElevenLabs returned ${res.status} ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    writeFileSync(cacheFile, cacheKey);
    process.stderr.write(`  synthesised ${line.lineId}\n`);
  } else {
    process.stderr.write(`  cached      ${line.lineId}\n`);
  }
  // Trim the head and tail padding the synthesiser adds, then measure the trimmed
  // file. The hold is derived from this number, so measuring the padded clip
  // would buy silence twice: once inside the audio, once again as the tail.
  const trimmed = join(outDir, `${line.lineId}.wav`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', file,
    // Head and tail only. `stop_periods=-1` would also collapse the pauses
    // *inside* a sentence, which is where this delivery does its breathing; an
    // earlier pass did exactly that and pushed the read to 161 wpm.
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,'
         + 'areverse,'
         + 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,'
         + 'areverse,'
         + 'aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono',
    trimmed]);
  const bytes = readFileSync(trimmed);
  rows.push({
    lineId: line.lineId,
    beatId: line.beatId,
    path: `media/hac-336/rc1/narration/${line.lineId}.wav`,
    sourcePath: `media/hac-336/rc1/narration/${line.lineId}.mp3`,
    words: line.spoken.trim().split(/\s+/).length,
    rawDurationSeconds: Math.round(durationOf(file) * 1000) / 1000,
    durationSeconds: Math.round(durationOf(trimmed) * 1000) / 1000,
    spokenSha256: textHash,
    audioSha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
}

for (const r of rows) r.wordsPerMinute = Math.round((r.words / r.durationSeconds) * 60);

const manifest = {
  manifestId: 'HAC-336-rc1-narration-manifest',
  revision: 'rc1',
  issue: 'HAC-336',
  note: 'Derived by media/hac-336/rc1/bin/build-narration.mjs. Do not hand-edit. Durations are read back out of the encoded files with ffprobe.',
  provider: v.provider,
  model: v.model,
  settings: v.settings,
  voiceIdSource: v.voiceIdSource,
  totalSpokenSeconds: Math.round(rows.reduce((a, r) => a + r.durationSeconds, 0) * 1000) / 1000,
  meanWordsPerMinute: Math.round(rows.reduce((a, r) => a + r.wordsPerMinute, 0) / rows.length),
  lines: rows,
};
writeFileSync(join(rc1, 'evidence', 'narration-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`\n${rows.length} lines, ${manifest.totalSpokenSeconds}s spoken, mean ${manifest.meanWordsPerMinute} wpm\n`);
