#!/usr/bin/env node
/**
 * HAC-335 — the Veo hero gate.
 *
 * Node builtins only, no network, no browser, so CI and a laptop reach the same
 * verdict. It runs in two modes, and says which one it is in:
 *
 *   STAGED    the deterministic half exists — keyframes, end card, prompt,
 *             ledger scaffold — but no winning clip has been selected yet.
 *             This is a pass, and it is the state the package sits in until a
 *             human has authorised billable generation.
 *
 *   COMPLETE  a winning candidate is recorded. Every clip-dependent check then
 *             becomes mandatory rather than skipped.
 *
 * The distinction matters because the alternative — a gate that silently passes
 * because the thing it checks is absent — is how an empty package ships green.
 *
 *     node media/hac-335/veo-hero/bin/verify-veo-hero.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExportName } from '../../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(here, '..', '..', '..', '..');
const evidenceDir = join(root, 'evidence');

const W = 1920;
const H = 1080;

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const abs = (repoRelative) => join(repoRoot, repoRelative);

/* -- 1. the deterministic inputs exist ------------------------------------- */

const REQUIRED = {
  keyframeManifest: join(evidenceDir, 'keyframe-manifest.json'),
  endCardManifest: join(evidenceDir, 'end-card-manifest.json'),
  prompt: join(evidenceDir, 'prompt.json'),
};
for (const [name, p] of Object.entries(REQUIRED)) {
  if (!existsSync(p)) fail(`${name} is missing: ${p.replace(repoRoot, '.')}`);
}
if (errors.length) {
  console.error('\nVeo hero gate — FAIL\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n  Run: node media/hac-335/veo-hero/bin/build-keyframes.mjs'
    + ' && node media/hac-335/veo-hero/bin/build-end-card.mjs\n');
  process.exit(1);
}

const keyframes = readJson(REQUIRED.keyframeManifest);
const endCard = readJson(REQUIRED.endCardManifest);
const prompt = readJson(REQUIRED.prompt);

/* -- 2. source keyframes present, 1920x1080, and unchanged ----------------- */

const roles = new Set(keyframes.keyframes.map((k) => k.role));
for (const role of ['start', 'end']) {
  if (!roles.has(role)) fail(`keyframe-manifest declares no \`${role}\` frame`);
}

for (const k of keyframes.keyframes) {
  const p = abs(k.file);
  if (!existsSync(p)) {
    fail(`keyframe ${k.role} is missing: ${k.file}`);
    continue;
  }
  const bytes = readFileSync(p);
  if (sha256(bytes) !== k.sha256) {
    fail(`keyframe ${k.file} has changed since the manifest was written; re-run build-keyframes.mjs`);
  }
  // Dimensions are read out of the PNG header, not trusted from the manifest.
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  if (w !== W || h !== H) fail(`keyframe ${k.file} is ${w}x${h}; the contract is ${W}x${H}`);
  if (k.width !== W || k.height !== H) {
    fail(`keyframe ${k.file} declares ${k.width}x${k.height} in the manifest; the contract is ${W}x${H}`);
  }

  // The source SVG it was built from must still be the file it names.
  if (!existsSync(abs(k.sourceAsset))) fail(`keyframe ${k.role} names a source asset that is absent: ${k.sourceAsset}`);
  else if (sha256(readFileSync(abs(k.sourceAsset))) !== k.sourceSha256) {
    fail(`${k.sourceAsset} has changed since the keyframes were built; the frames no longer draw the canonical mark`);
  }

  const n = validateExportName(k.file.split('/').pop());
  if (!n.valid) fail(`keyframe filename violates the naming contract: ${k.file} — ${n.error}`);
}

/* -- 3. the two frames are a real state change, of the frozen size --------- */

const start = keyframes.keyframes.find((k) => k.role === 'start');
const end = keyframes.keyframes.find((k) => k.role === 'end');
if (start && end) {
  if (start.sha256 === end.sha256) fail('the start and end keyframes are byte-identical; there is no state change to animate');
  const geometry = readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8');
  const travel = Number(/GATE_TRAVEL\s*=\s*([\d.]+)/.exec(geometry)?.[1]);
  const delta = Number((end.leaves.aperture - start.leaves.aperture).toFixed(4));
  if (!Number.isFinite(travel)) fail('could not read GATE_TRAVEL from assets/brand/logo-geometry.js');
  else if (delta !== travel * 2) {
    fail(`the aperture opens by ${delta} units; GATE_TRAVEL is ${travel} per leaf, so ${travel * 2} is required`);
  }
  // The end frame must be the canonical open geometry, not an approximation.
  if (end.sourceAsset !== 'assets/logo/interlock-symbol-open.svg') {
    fail(`the end keyframe is built from ${end.sourceAsset}; the authorized-open state is `
      + 'assets/logo/interlock-symbol-open.svg');
  }
}

/* -- 4. no typography in the generated shot -------------------------------- */

for (const k of keyframes.keyframes) {
  const master = abs(k.master);
  if (!existsSync(master)) { fail(`keyframe master is missing: ${k.master}`); continue; }
  if (/<text[\s>]/.test(readFileSync(master, 'utf8'))) {
    fail(`${k.master} contains live text. Veo must not be handed typography; the wordmark is `
      + 'composited afterwards by build-end-card.mjs.');
  }
}
if (keyframes.containsTypography !== false) fail('keyframe-manifest must declare containsTypography: false');

/* -- 5. the deterministic end card resolves -------------------------------- */

const cardPng = abs(endCard.export.file);
if (!existsSync(cardPng)) fail(`the end-card export cannot be resolved: ${endCard.export.file}`);
else {
  const bytes = readFileSync(cardPng);
  if (sha256(bytes) !== endCard.export.sha256) fail(`${endCard.export.file} has changed since it was built`);
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  if (w !== W || h !== H) fail(`the end card is ${w}x${h}; the contract is ${W}x${H}`);
}
if (!existsSync(abs(endCard.master))) fail(`the end-card master cannot be resolved: ${endCard.master}`);
if (!existsSync(abs(endCard.lockupSource))) fail(`the end card names a lockup that is absent: ${endCard.lockupSource}`);
else if (sha256(readFileSync(abs(endCard.lockupSource))) !== endCard.lockupSourceSha256) {
  fail(`${endCard.lockupSource} has changed since the end card was built; rebuild it`);
}

/* -- 6. the end card's one sentence is still authorised upstream ----------- */

for (const authority of endCard.thesisAuthorities) {
  const p = abs(authority);
  if (!existsSync(p)) { fail(`the end card cites an authority that is absent: ${authority}`); continue; }
  if (!readFileSync(p, 'utf8').includes(endCard.thesis)) {
    fail(`${authority} no longer carries the end card's sentence. The card restates approved `
      + 'language; it may not outlive it.');
  }
}

/* -- 7. the sequence claims nothing --------------------------------------- */

if (prompt.claimBoundary?.isEvidence !== false) {
  fail('prompt.json must declare claimBoundary.isEvidence: false — the sequence is a synthesis, not proof');
}
// A run identity or a frozen figure appearing in this package would let a
// metaphor be read as a record of something that happened.
const FORBIDDEN_IN_HERO = [
  'ilk-hac340-cloud', 'interlock-hac340-proxy', 'WITHHOLD_SERIALIZE',
  'ALLOW_PARALLEL', 'alpha=45', '140 > 130', '120 <= 130', '24/24',
];
const scan = (label, text) => {
  for (const token of FORBIDDEN_IN_HERO) {
    if (text.includes(token)) {
      fail(`${label} contains \`${token}\`. The hero sequence carries no run identity and no `
        + 'frozen figure — those belong to the evidence surfaces, not to a metaphor.');
    }
  }
};
scan('prompt.json prompt', prompt.prompt);
scan('prompt.json negativePrompt', prompt.negativePrompt);
scan('the end card master', existsSync(abs(endCard.master)) ? readFileSync(abs(endCard.master), 'utf8') : '');

/* -- 8. nothing credential-shaped was committed ---------------------------- */

/**
 * Deliberately narrower than a general secret scanner and deliberately not
 * regex-only: these are the shapes this package could plausibly leak — a Google
 * API key, an OAuth refresh token, a service-account private key, a bearer
 * header — plus any field whose *name* says it holds one.
 */
const CREDENTIAL_SHAPES = [
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/, 'an OAuth access token'],
  [/\b1\/\/[0-9A-Za-z_-]{30,}/, 'an OAuth refresh token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/"private_key"\s*:/, 'a service-account private_key field'],
  [/"client_secret"\s*:/, 'a client_secret field'],
  [/"refresh_token"\s*:/, 'a refresh_token field'],
  [/[Aa]uthorization"?\s*[:=]\s*"?Bearer\s+\S/, 'a bearer Authorization header value'],
];
const TEXTUAL = new Set(['.json', '.mjs', '.js', '.md', '.svg', '.txt', '.vtt', '.srt']);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
for (const p of walk(root)) {
  const ext = p.slice(p.lastIndexOf('.'));
  if (!TEXTUAL.has(ext)) continue;
  const text = readFileSync(p, 'utf8');
  for (const [re, what] of CREDENTIAL_SHAPES) {
    if (re.test(text)) fail(`${p.replace(repoRoot, '.')} contains ${what}. Credentials are never committed.`);
  }
}

/* -- 9. the generation ledger, where one exists ---------------------------- */

const ledgerPath = join(evidenceDir, 'generation-ledger.json');
const ledger = existsSync(ledgerPath) ? readJson(ledgerPath) : null;

const REQUIRED_PROVENANCE = [
  'backend', 'model', 'region', 'resolution', 'durationSeconds', 'aspectRatio', 'seed',
  'promptSha256', 'negativePromptSha256', 'startFrameSha256',
  'requestedAt', 'operationId', 'fileSha256', 'status', 'usedLastFrame',
];

if (ledger) {
  for (const r of ledger.rounds ?? []) {
    for (const field of REQUIRED_PROVENANCE) {
      if (r[field] === undefined || r[field] === null || r[field] === '') {
        fail(`generation ledger round ${r.round} is missing required provenance field \`${field}\``);
      }
    }
    // A last frame is optional, but whether one was used is not: a round that
    // withholds it is a different experiment and must say so. When one WAS
    // used, its digest is required exactly as the start frame's is.
    if (r.usedLastFrame === true && !r.endFrameSha256) {
      fail(`generation ledger round ${r.round} used a last frame but records no endFrameSha256`);
    }
    if (r.usedLastFrame === false && r.endFrameSha256) {
      fail(`generation ledger round ${r.round} withheld the last frame but still records an `
        + 'endFrameSha256; the row contradicts itself');
    }
    if (r.usedLastFrame === false && !r.delta) {
      fail(`generation ledger round ${r.round} changed the inputs but records no \`delta\``);
    }
    if (r.promptSha256 && r.promptSha256 !== sha256(Buffer.from(prompt.prompt, 'utf8'))) {
      fail(`round ${r.round} was generated from a different prompt than evidence/prompt.json now holds. `
        + 'Bump prompt.json\'s revision rather than editing a frozen prompt under a recorded round.');
    }
    if (typeof r.file === 'string' && r.file) {
      const p = abs(r.file);
      if (!existsSync(p)) fail(`generation ledger round ${r.round} names a candidate that is absent: ${r.file}`);
      else if (sha256(readFileSync(p)) !== r.fileSha256) {
        fail(`${r.file} does not hash to the digest round ${r.round} recorded`);
      }
    }
    for (const k of ['account', 'project']) {
      if (typeof r[k] === 'string' && /AIza|ya29\.|-----BEGIN/.test(r[k])) {
        fail(`generation ledger round ${r.round} field \`${k}\` looks like a credential`);
      }
    }
  }
}

/* -- 10. the deterministic sequence ---------------------------------------- */

/**
 * IL-MOT-031 supersedes the generated rounds for the semantic state machine.
 * It is not a candidate and is not adjudicated: it is a render, so its
 * properties are asserted at build time and re-asserted here from the file.
 */
const seqPath = join(evidenceDir, 'sequence-manifest.json');
const seq = existsSync(seqPath) ? readJson(seqPath) : null;
const errorsBeforeSequence = errors.length;
if (!seq) {
  fail('evidence/sequence-manifest.json is missing. Run: node media/hac-335/veo-hero/bin/build-sequence.mjs');
} else {
  const v = seq.video;
  if (!existsSync(abs(v.file))) fail(`the deterministic sequence is absent: ${v.file}`);
  else {
    const bytes = readFileSync(abs(v.file));
    if (sha256(bytes) !== v.sha256) fail(`${v.file} has changed since it was rendered; re-run build-sequence.mjs`);
  }
  if (v.width !== W || v.height !== H) fail(`the sequence is ${v.width}x${v.height}; the contract is ${W}x${H}`);
  if (v.audio !== 'none') fail('the sequence must carry no audio track — HAC-333 froze the cut as muted');
  if (seq.holdIsByteIdentical !== true) {
    fail('the sequence must declare holdIsByteIdentical: true — the authorization pause is absolute');
  }
  // The hold must cover at least --dur-hold, in whole frames.
  const need = Math.ceil((seq.hold.authoredMs / 1000) * v.fps);
  if (!(seq.holdFrames >= need)) {
    fail(`the hold covers ${seq.holdFrames} frames; ${need} are needed to reach ${seq.hold.authoredMs}ms at ${v.fps}fps`);
  }
  if (!(seq.hold.renderedMs >= seq.hold.authoredMs)) {
    fail(`the rendered hold is ${seq.hold.renderedMs}ms, shorter than the authored ${seq.hold.authoredMs}ms. `
      + 'Frame quantization must round the pause UP, never down.');
  }
  // The manifest's own timeline must still agree with the stylesheet.
  const css = readFileSync(join(repoRoot, 'assets', 'tokens', 'motion.css'), 'utf8');
  const tok = (t) => Number(new RegExp(`${t}:\\s*(\\d+)ms`).exec(css)?.[1]);
  if (seq.authority.authorizationMs !== tok('--mot-p4-authorization')) {
    fail('the sequence manifest disagrees with --mot-p4-authorization; re-run build-sequence.mjs');
  }
  if (seq.authority.stingerTotalMs !== tok('--mot-stinger-total')) {
    fail('the sequence manifest disagrees with --mot-stinger-total; re-run build-sequence.mjs');
  }
  const gt = Number(/GATE_TRAVEL\s*=\s*([\d.]+)/.exec(
    readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8'))?.[1]);
  if (seq.authority.gateTravelPerLeaf !== gt) {
    fail(`the sequence records GATE_TRAVEL ${seq.authority.gateTravelPerLeaf} but the geometry declares ${gt}`);
  }
  // The frame digests are the record that the hold really was byte-identical.
  const holdRun = new Set();
  const t0 = seq.timeline.find((p) => p.phase === 'hold');
  if (t0) {
    for (let f = 0; f < seq.frameDigests.length; f++) {
      const t = (f / v.fps) * 1000;
      if (t >= t0.startMs && t < t0.startMs + t0.durMs) holdRun.add(seq.frameDigests[f]);
    }
    if (holdRun.size !== 1) {
      fail(`the recorded hold spans ${holdRun.size} distinct frame digests; it must be exactly one`);
    }
  }
}

const seqOk = Boolean(seq) && errors.length === errorsBeforeSequence;

/* -- 11. the winning candidate, where one has been chosen ------------------ */

const winner = (ledger?.rounds ?? []).find((r) => r.adjudication?.selected === true);
/**
 * Three modes, not two.
 *
 * The package originally waited for a generated candidate to win. Two bounded
 * rounds established that the semantic state machine cannot be generated, and
 * IL-MOT-031 renders it instead. So a deterministic sequence being present and
 * valid is itself a complete state — the ledger then records a closed
 * experiment rather than an unfinished search.
 */
const mode = winner ? 'COMPLETE' : (seqOk ? 'DETERMINISTIC' : 'STAGED');

if (winner) {
  // `file` is a required provenance field, but a hand-edited ledger can omit it.
  // Report that as a failure rather than dereferencing undefined: a gate that
  // throws tells the operator nothing about what is actually wrong.
  if (!winner.file) fail(`round ${winner.round} is marked selected but names no candidate file`);
  else if (!existsSync(abs(winner.file))) fail(`the winning MP4 is absent: ${winner.file}`);
  if (!winner.adjudication?.why) fail(`round ${winner.round} won without a recorded reason`);
  if (!Array.isArray(winner.adjudication?.rejectionChecklist)) {
    fail(`round ${winner.round} won without the frame-by-frame rejection checklist`);
  }
  const others = (ledger.rounds ?? []).filter((r) => r.adjudication?.selected === true);
  if (others.length > 1) fail(`${others.length} rounds are marked selected; exactly one candidate wins`);

  // The cut is muted and its gate fails on an audio track, so the integration
  // copy must be silent. The standalone candidate may keep its audio.
  const integration = winner.adjudication?.integrationCopy;
  if (!integration) {
    fail(`round ${winner.round} declares no integrationCopy. HAC-336's cut is muted and its gate `
      + 'fails on an audio track, so a silent copy is required before integration.');
  } else if (typeof integration.file !== 'string' || !existsSync(abs(integration.file))) {
    fail(`the silent integration copy is absent: ${integration.file}`);
  } else if (integration.hasAudioStream !== false) {
    fail(`${integration.file} must declare hasAudioStream: false — HAC-336 froze the cut as muted`);
  }
} else if (seqOk) {
  const rounds = ledger?.rounds ?? [];
  const rejected = rounds.filter((r) => r.adjudication && r.adjudication.selected !== true);
  notes.push('DETERMINISTIC: the semantic state machine is rendered by IL-MOT-031, not generated.');
  if (rounds.length) {
    notes.push(`The ledger records a closed experiment: ${rounds.length} generated round(s), `
      + `${rejected.length} adjudicated and rejected. No generated candidate is used.`);
  }
  for (const r of rounds.filter((x) => !x.adjudication)) {
    fail(`round ${r.round} has run but carries no adjudication. Every billable round is judged, `
      + 'or the spend bought nothing that can be reasoned about.');
  }
} else {
  notes.push('No winning candidate is recorded, so clip-dependent checks are not yet in force.');
  const rounds = ledger?.rounds ?? [];
  if (!rounds.length) {
    notes.push('STAGED: deterministic inputs are complete and verified; no billable round has run.');
  } else {
    const judged = rounds.filter((r) => r.adjudication);
    const rejected = judged.filter((r) => r.adjudication.selected !== true);
    notes.push(`STAGED: ${rounds.length} round(s) run, ${rejected.length} adjudicated and rejected, `
      + 'none selected. The package cannot be integrated until one candidate wins.');
    for (const r of rounds.filter((x) => !x.adjudication)) {
      fail(`round ${r.round} has run but carries no adjudication. Every billable round is judged, `
        + 'or the spend bought nothing that can be reasoned about.');
    }
  }
}

/* -- report ---------------------------------------------------------------- */

console.log(`\nVeo hero gate — ${errors.length ? 'FAIL' : 'PASS'} (${mode})\n`);
if (errors.length) {
  for (const e of errors) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`  keyframes      ${keyframes.keyframes.length} frames, ${W}x${H}, digests match, no typography`);
console.log(`  gate travel    ${start.leaves.aperture} -> ${end.leaves.aperture} units, matches GATE_TRAVEL`);
console.log(`  end card       ${endCard.export.file.split('/').pop()} resolves; its sentence is still authorised in ${endCard.thesisAuthorities.length} places`);
console.log(`  claims         none; no run identity or frozen figure appears in this package`);
console.log(`  credentials    none committed`);
console.log(`  ledger         ${ledger ? `${ledger.rounds.length} round(s), provenance complete` : 'not yet created'}`);
if (seq) {
  console.log(`  sequence       ${seq.video.file.split('/').pop()} — ${seq.video.frames} frames, `
    + `${(seq.video.durationMs / 1000).toFixed(3)}s, no audio`);
  console.log(`  hold           ${seq.hold.authoredMs}ms authored -> ${seq.hold.renderedMs.toFixed(1)}ms rendered, `
    + `${seq.holdFrames} byte-identical frames`);
}
for (const n of notes) console.log(`  note           ${n}`);
console.log('');
