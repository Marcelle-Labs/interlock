#!/usr/bin/env node
/**
 * HAC-351 — renders the narrator A/B.
 *
 * The same opening copy, the same synthesis settings, the same line breaks, one
 * variable: the voice. Anything else that differed between the two tracks would
 * make the blind test measure that instead of the narrator.
 *
 * Lines are rendered one file per line, as HAC-351 s15 requires, so a single
 * pronunciation or pacing correction re-renders one line rather than
 * invalidating the whole track. A per-line text digest is cached beside the
 * audio, so an unchanged line is measured but not re-synthesised or re-billed.
 *
 * Durations are read back out of the encoded files with ffprobe rather than
 * estimated from a words-per-minute model — the same rule the RC1 narration
 * pipeline already follows, and for the same reason: an estimate can drift from
 * the audio it describes and still look correct.
 *
 * This script renders the AUDIO ONLY. It does not score it, and it must not:
 * the listening result belongs to human readers. `audition/PROTOCOL.md` is run
 * by a person and no result in it may be filled in by a model.
 *
 * The API key arrives from `doppler run` and is used only as a request header.
 * It is never read from or written to a file.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const FFPROBE = '/opt/homebrew/bin/ffprobe';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

/**
 * The two profiles, both production-ready ElevenLabs Voice Library voices.
 * HAC-351 s15 prefers an existing library voice over a designed one where a
 * suitable voice exists, and both of these are labelled for informative /
 * educational delivery rather than narrative or advertising performance.
 */
const PROFILES = {
  A: {
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2',
    libraryName: 'Alice - Clear, Engaging',
    profile: 'Adult female, low-to-mid register, light British, calm senior technical peer.',
    labels: { gender: 'female', age: 'middle_aged', accent: 'british', use_case: 'informative_educational' },
  },
  B: {
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    libraryName: 'Daniel - Steady Broadcaster',
    profile: 'Adult male, mid register, light British, thoughtful technical-documentary delivery.',
    labels: { gender: 'male', age: 'middle_aged', accent: 'british', use_case: 'informative_educational' },
    risk: 'Library name says "Broadcaster". The announcer-affect check in the '
      + 'protocol exists partly for this voice; if readers hear presentation rather '
      + 'than explanation, that is a finding about B, not a reason to retune B.',
  },
};

/**
 * Identical for both voices. HAC-351 s15 gives this starting neighbourhood and
 * says explicitly not to tune one voice to make it win, so neither profile gets
 * a per-voice override here. If a later listening test earns a change, it moves
 * for both voices together or the comparison stops being a comparison.
 */
const SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.96 };
const MODEL = 'eleven_multilingual_v2';

const durationOf = (p) => Number(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

async function main() {
  const script = JSON.parse(readFileSync(join(root, 'evidence', 'opening-narration.json'), 'utf8'));
  const key = process.env.ELEVENLABS_API_KEY;

  const report = { id: 'HAC-351-audition-manifest', issue: 'HAC-351', provider: 'elevenlabs', model: MODEL, settings: SETTINGS, voices: {} };

  for (const [tag, prof] of Object.entries(PROFILES)) {
    const outDir = join(root, 'audition', `voice-${tag}`);
    mkdirSync(outDir, { recursive: true });
    const rows = [];

    for (const line of script.lines) {
      const mp3 = join(outDir, `${line.lineId}.mp3`);
      const stamp = join(outDir, `${line.lineId}.sha256`);
      // The cache key binds the text, the voice and the settings: change any of
      // them and the line is re-synthesised rather than silently reused.
      const textHash = sha256(Buffer.from(`${line.spoken}|${prof.voiceId}|${JSON.stringify(SETTINGS)}|${MODEL}`));
      const cached = existsSync(mp3) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === textHash;

      if (!cached) {
        if (!key) throw new Error('ELEVENLABS_API_KEY missing; run via `doppler run`.');
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${prof.voiceId}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.spoken, model_id: MODEL, voice_settings: SETTINGS }),
          },
        );
        if (!res.ok) throw new Error(`${tag}/${line.lineId}: ${res.status} ${await res.text()}`);
        writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
        writeFileSync(stamp, `${textHash}\n`);
        process.stdout.write(`${tag}/${line.lineId} synthesised  `);
      } else {
        process.stdout.write(`${tag}/${line.lineId} cached  `);
      }

      rows.push({
        lineId: line.lineId,
        beat: line.beat,
        spoken: line.spoken,
        words: line.spoken.split(/\s+/).length,
        path: `media/hac-351/audition/voice-${tag}/${line.lineId}.mp3`,
        durationSeconds: Number(durationOf(mp3).toFixed(3)),
        audioSha256: sha256(readFileSync(mp3)),
      });
    }
    console.log();

    // One continuous track per voice: what a reader actually auditions.
    const listFile = join(outDir, 'concat.txt');
    writeFileSync(listFile, script.lines.map((l) => `file '${l.lineId}.mp3'`).join('\n'));
    const track = join(root, 'audition', `VOICE-${tag}-opening.mp3`);
    // Re-encoded rather than stream-copied: concatenating MP3 frames from
    // separate synthesis calls produces non-monotonic timestamps, and an
    // audition file a reader scrubs must not carry muxer damage.
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-y', track]);

    const total = Number(durationOf(track).toFixed(3));
    const words = rows.reduce((a, r) => a + r.words, 0);
    report.voices[tag] = {
      ...prof,
      track: `media/hac-351/audition/VOICE-${tag}-opening.mp3`,
      trackSha256: sha256(readFileSync(track)),
      totalSeconds: total,
      words,
      wordsPerMinute: Math.round((words / total) * 60),
      lines: rows,
    };
    console.log(`VOICE ${tag}  ${total}s  ${words} words  ${Math.round((words / total) * 60)} wpm`);
  }

  report.note = 'Audio only. No listening result is recorded here. The blind comparison '
    + 'is run by human readers under audition/PROTOCOL.md; a model may not fill in a result.';
  writeFileSync(join(root, 'evidence', 'audition-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('wrote media/hac-351/evidence/audition-manifest.json');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
