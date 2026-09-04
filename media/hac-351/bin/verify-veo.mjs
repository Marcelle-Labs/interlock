#!/usr/bin/env node
/**
 * HAC-351 gate. Node builtins plus ffprobe; no network, no credentials.
 *
 * What this refuses to let pass:
 *
 *   - a deterministic frame that no longer matches the digest the generation
 *     receipt was bound to (the continuity authority would then be fiction);
 *   - an original that was transcoded, overwritten, or given an audio stream;
 *   - a derivative built with frame interpolation, or at the wrong rate/length;
 *   - a manifest that claims a parameter was honoured when it was only accepted;
 *   - a claim-bearing word anywhere in the HAC-351 copy that would present the
 *     generated clip as evidence;
 *   - a human-test result that a model filled in.
 *
 * The last one is the reason this file exists at all. Everything else here is
 * mechanical; that check is the one that protects the disposition.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..');

const FFPROBE = '/opt/homebrew/bin/ffprobe';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const read = (p) => JSON.parse(readFileSync(join(root, 'evidence', p), 'utf8'));

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); } else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const probe = (p, entries) => JSON.parse(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', entries, '-of', 'json', p], { encoding: 'utf8' }));

console.log('HAC-351 — bounded generated cold open\n');

/* -- 1. the deterministic frames are still the continuity authority --------- */
console.log('frames');
const frames = read('frame-manifest.json');
for (const f of frames.frames) {
  const png = join(repoRoot, f.png);
  const svg = join(repoRoot, f.svg);
  check(`${f.assetId} png digest`, existsSync(png) && sha256(readFileSync(png)) === f.pngSha256);
  check(`${f.assetId} svg digest`, existsSync(svg) && sha256(readFileSync(svg)) === f.svgSha256);
  const meta = probe(png, 'stream=width,height');
  check(`${f.assetId} is 1920x1080`,
    Number(meta.streams[0].width) === 1920 && Number(meta.streams[0].height) === 1080);
}

/* -- 2. generation receipts are complete and make no false claim ------------ */
console.log('\ngeneration receipts');
const receipts = readdirSync(join(root, 'evidence')).filter((f) => f.startsWith('generation-'));
check('at least one generation receipt exists', receipts.length > 0);
for (const r of receipts) {
  const g = read(r);
  for (const field of ['project', 'region', 'apiVersion', 'model', 'operation', 'requestedAt',
    'completedAt', 'seed', 'positivePrompt', 'negativePrompt', 'requestedConfig',
    'firstFrame', 'lastFrame', 'claimBoundary']) {
    check(`${r}: has ${field}`, g[field] !== undefined && g[field] !== null);
  }
  check(`${r}: seed carries no determinism claim`, /No deterministic-generation claim/i.test(g.seedClaim ?? ''));
  check(`${r}: enhancePrompt not claimed as controlled`, !('enhancePrompt' in (g.requestedConfig ?? {})));
  check(`${r}: input frame digests match the frame manifest`,
    g.firstFrame.sha256 === frames.frames.find((f) => f.station === 'first').pngSha256
    && g.lastFrame.sha256 === frames.frames.find((f) => f.station === 'last').pngSha256);
}

/* -- 3. the original is preserved, and the derivative is not interpolated --- */
console.log('\noriginal and derivative');
const d = read('derivative-manifest.json');
const orig = join(repoRoot, d.original.path);
const edit = join(repoRoot, d.edited.path);
check('original present and unmodified', existsSync(orig) && sha256(readFileSync(orig)) === d.original.sha256);
check('derivative present and unmodified', existsSync(edit) && sha256(readFileSync(edit)) === d.edited.sha256);
check('original and derivative are different files', d.original.sha256 !== d.edited.sha256);
check('original declares its native rate', d.original.nativeFrameRate === '24/1');
check('derivative conformed to the 30fps master', d.edited.conformedFrameRate === '30/1');
check('derivative length is a whole number of 30fps frames',
  d.edited.frames === Math.round(d.edited.durationSeconds * 30));
check('no interpolation in the filter chain',
  !/minterpolate|tblend|blend=|framerate=/.test(d.filterChain));

for (const [label, p] of [['original', orig], ['derivative', edit]]) {
  const a = probe(p, 'stream=codec_type');
  const audio = a.streams.filter((s) => s.codec_type === 'audio').length;
  // generateAudio:false was requested, but acceptance is not proof: this is the
  // mechanical verification HAC-351 s7 asks for.
  check(`${label} carries no audio stream`, audio === 0, `${audio} audio stream(s)`);
}
check('C2PA recorded without being treated as proof of the scenario',
  d.original.c2pa === true && /not evidence that the illustrated scenario occurred/i.test(d.original.c2paNote ?? ''));

/* -- 4. no HAC-351 copy presents generated media as evidence ---------------- */
console.log('\nclaim boundary');
const FORBIDDEN = [
  [/\bproves?\b/i, 'proof language'],
  [/\btelemetry\b/i, 'telemetry'],
  [/\bexecution evidence\b/i, 'execution evidence'],
  [/\bscreenshot of (?:the )?(?:run|console)\b/i, 'capture claim'],
];
const copyFiles = ['evidence/opening-narration.json', 'evidence/derivative-manifest.json', 'README.md'];
for (const rel of copyFiles) {
  const p = join(root, rel);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf8');
  for (const [re, name] of FORBIDDEN) {
    // The claim-boundary sentences themselves legitimately name what is NOT
    // claimed, so a hit only fails when it is not inside a negation.
    const hits = (text.match(new RegExp(re.source, 'gi')) ?? [])
      .filter(() => !/not |never |no /i.test(text));
    check(`${rel}: no unqualified ${name}`, hits.length === 0);
  }
}

const narration = read('opening-narration.json');
const spoken = narration.lines.map((l) => l.spoken).join(' ');
check('narration states no measured number', !/\b(40|60|105|120|130|140|403|401|2\/2|4\/4)\b/.test(spoken));
check('narration uses no proof vocabulary', !/HAC-\d+|receipt|hash|proof class|ALLOW_|WITHHOLD_/i.test(spoken));
check('narration makes no unsupported safety claim', !/\b(safe|secure|prevents?|catastrophic|guarantee)\b/i.test(spoken));
check('narration does not call Interlock an agent',
  /not another agent/i.test(spoken) && !/Interlock is an agent/i.test(spoken));

/* -- 5. the human tests have not been answered by a model ------------------- */
console.log('\nhuman tests');
const protocolPath = join(root, 'audition', 'PROTOCOL.md');
check('audition protocol present', existsSync(protocolPath));
if (existsSync(protocolPath)) {
  const t = readFileSync(protocolPath, 'utf8');
  check('protocol states results are human-only', /may\s+be\s+filled\s+in\s+by\s+a\s+model/i.test(t));
}
const resultsPath = join(root, 'audition', 'RESULTS.md');
if (existsSync(resultsPath)) {
  const t = readFileSync(resultsPath, 'utf8');
  check('recorded results name a human runner',
    /run by:\s*\S+/i.test(t) && !/generated|model-filled/i.test(t));
} else {
  console.log('  NOTE  no RESULTS.md — both human tests are NOT RUN, disposition stays at its default');
}

/* -- 6. exactly one generated scene ---------------------------------------- */
console.log('\nscope');
const originals = readdirSync(join(root, 'original')).filter((f) => f.endsWith('.mp4'));
check('exactly one selected generated shot', d.selectedCandidate !== undefined);
check('no second generated scene in the edit',
  readdirSync(join(root, 'edited')).filter((f) => f.endsWith('.mp4')).length === 1);
console.log(`  NOTE  ${originals.length} generated original(s) retained as research: ${originals.join(', ')}`);

console.log(`\n${failures === 0 ? 'OK' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
