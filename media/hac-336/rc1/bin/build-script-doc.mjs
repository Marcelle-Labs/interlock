#!/usr/bin/env node
/**
 * The narration script, as a document, DERIVED from the same manifests the film
 * is built from. Hand-maintaining a script beside a cut guarantees the two
 * disagree the first time a line is re-recorded; this one cannot drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));

const scene = readJson('media/hac-336/rc1/evidence/scene-manifest.json');
const nar = readJson('media/hac-336/rc1/evidence/narration-manifest.json');
const map = readJson('media/hac-336/rc1/evidence/asset-source-map.json');

const t = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.round((s % 1) * 10)).slice(0, 1)}`;
};

const out = [];
out.push('# Interlock — RC1 narration script');
out.push('');
out.push('**Derived, not authored.** Regenerate with `node media/hac-336/rc1/bin/build-script-doc.mjs`.');
out.push(`Timestamps come from the measured narration in \`narration-manifest.json\`, not from an estimate.`);
out.push('');
out.push(`Runtime **${scene.runtime.clock} (${scene.runtime.totalSeconds}s)** against a `
  + `${scene.runtime.target.minSeconds}–${scene.runtime.target.maxSeconds}s target and a `
  + `${scene.runtime.target.editorialCeiling}s editorial ceiling. `
  + `${scene.runtime.spokenSeconds}s spoken, ${scene.runtime.silenceSeconds}s silent `
  + `(${scene.runtime.speechDensityPercent}% speech density). `
  + `Voice: ElevenLabs \`${nar.model}\`, ${nar.meanWordsPerMinute} wpm mean.`);
out.push('');
out.push(`Proof-class reset at **${t(scene.proofClassReset.atSeconds)}** (beat ${scene.proofClassReset.atBeat}). `
  + `Before it: ${scene.proofClassReset.beforeReset.join(', ')}. After it: ${scene.proofClassReset.afterReset.join(', ')}.`);
out.push('');

let act = null;
for (const s of scene.scenes) {
  if (s.act !== act) { act = s.act; out.push(`## ${act.replace(/_/g, ' ')}`); out.push(''); }
  const asset = map.assets.find((a) => a.usedByBeats.includes(s.beatId));
  out.push(`### ${s.beatId} · ${t(s.startSeconds)}–${t(s.endSeconds)} · \`${s.proofClass}\``);
  out.push('');
  out.push(`- **Source** \`${s.source.path}\`${s.source.state ? ` (${s.source.state})` : ''}`);
  out.push(`- **Origin** ${asset?.originIssue ?? 'HAC-336'} · sha256 \`${asset?.sha256?.slice(0, 16) ?? '—'}…\``);
  if (s.label) out.push(`- **On-screen label** ${s.label}`);
  if (s.source.editorialTrim) out.push(`- **Editorial trim** ${s.source.editorialTrim.from}s → ${s.source.editorialTrim.to}s`);
  if (s.guardrail) out.push(`- **Guardrail** ${s.guardrail}`);
  if (s.mutedRead) out.push(`- **Muted read** ${s.mutedRead}`);
  out.push('');
  for (const l of s.narration) {
    out.push(`> **${t(l.startSeconds)}** — ${l.spoken}`);
    out.push('>');
    if (l.spokenDiffersFromCaption) {
      out.push(`> *Caption (more precise):* ${l.caption}`);
      out.push('>');
    }
    out.push(`> <sub>${l.lineId} · ${l.durationSeconds}s</sub>`);
    out.push('');
  }
}

writeFileSync(join(rc1, 'NARRATION-SCRIPT.md'), `${out.join('\n')}\n`);
process.stderr.write(`NARRATION-SCRIPT.md written: ${scene.scenes.length} scenes, ${scene.scenes.flatMap((s) => s.narration).length} lines\n`);
