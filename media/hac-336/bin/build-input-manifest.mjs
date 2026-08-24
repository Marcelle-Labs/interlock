#!/usr/bin/env node
/**
 * Derives the assembly input manifest and the scene map.
 *
 * The editor should not depend on memory. Every artifact the cut consumes is
 * listed here with its content digest, every declared revision that can be
 * cross-checked against frozen evidence is checked, and every beat resolves to
 * the exact claim rows that license what it says.
 *
 * Content digests are the load-bearing binding, not the revision strings. A
 * commit SHA says which revision was checked out; it cannot answer *are these
 * bytes still the bytes the cut was built from*, and HAC-335 already paid for
 * that distinction once when an asset registry kept a superseded capture SHA
 * while the capture itself had moved. Two of the six declared revisions cannot
 * be checked at all — a commit cannot name itself — and the manifest says so
 * rather than implying a verification that never happens.
 *
 * The scene map is the same data ordered for a human: what is on screen, when,
 * under which proof class, from which artifact, saying what.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeline, clock } from './lib/timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const readBytes = (p) => readFileSync(join(repoRoot, p));
const readJson = (p) => JSON.parse(readBytes(p).toString('utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const cut = readJson('media/hac-336/evidence/cut.json');
const frameManifest = readJson('media/hac-336/evidence/frame-manifest.json');
const filmedClaims = readJson('media/hac-336/evidence/filmed-run-claims.json');
const ledger = readJson('media/hac-335/evidence/claim-ledger.json');
const capturePackage = readJson('experiments/hac-324/evidence/capture-package.json');

const tl = timeline(cut);

/** RFC 6901 JSON pointer, enough of it for a `/a/b/0/c` path. */
function resolvePointer(doc, pointer) {
  if (pointer === '') return doc;
  let node = doc;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || node === undefined) return undefined;
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return node;
}

/* -- declared revisions, cross-checked where the evidence can check them --- */

const revisions = [];
for (const [name, decl] of Object.entries(cut.sourceRevisions)) {
  if (name === 'note') continue;
  if (!decl.checkable) {
    revisions.push({ name, value: decl.value, checkable: false, meaning: decl.meaning });
    continue;
  }
  const found = resolvePointer(readJson(decl.source), decl.pointer);
  if (found !== decl.value) {
    throw new Error(
      `declared ${name} is ${decl.value} but ${decl.source}${decl.pointer} holds `
      + `${JSON.stringify(found)}. The cut is bound to a revision the evidence does not carry.`,
    );
  }
  revisions.push({
    name, value: decl.value, checkable: true, source: decl.source, pointer: decl.pointer, agrees: true,
  });
}

/* -- inputs --------------------------------------------------------------- */

const inputPaths = new Map();
const addInput = (role, path) => {
  const existing = inputPaths.get(path);
  if (existing) {
    if (!existing.roles.includes(role)) existing.roles.push(role);
    return;
  }
  const bytes = readBytes(path);
  inputPaths.set(path, { path, roles: [role], bytes: bytes.length, sha256: sha256(bytes) });
};

addInput('edit decision list', 'media/hac-336/evidence/cut.json');
addInput('filmed-run claim rows', 'media/hac-336/evidence/filmed-run-claims.json');

addInput('controlled local experiment - arms', 'experiments/hac-330/evidence/arms.json');
addInput('controlled local experiment - results', 'experiments/hac-330/evidence/results.json');
addInput('bounded evaluation - judge export', 'experiments/hac-343/evidence/judge-export.json');
addInput('authoritative filmed run - record', 'experiments/hac-324/evidence/filmed-run.json');
addInput('authoritative filmed run - emitted bytes', 'experiments/hac-324/evidence/filmed-run.raw.json');
addInput('authoritative filmed run - capture manifest', 'experiments/hac-324/evidence/capture-package.json');
addInput('frozen HAC-340 reference packet', 'experiments/hac-342/evidence/cloud-run.public.json');
addInput('judge-package claim ledger', 'media/hac-335/evidence/claim-ledger.json');
addInput('storyboard contract', 'media/hac-333/scene-manifest.json');

for (const frame of frameManifest.frames) {
  if (frame.kind === 'asset') addInput(`frozen export used at ${frame.beatId}`, frame.path);
  if (frame.kind === 'board') addInput(`film board master used at ${frame.beatId}`, frame.sourcePath);
  if (frame.kind === 'capture') addInput(`promoted capture scene used at ${frame.beatId}`, frame.sourcePath);
}

/* -- promoted scenes ------------------------------------------------------ */

const usedScenes = new Set(
  cut.beats.filter((b) => b.source.kind === 'capture').map((b) => b.source.sceneId),
);
const promotedScenes = capturePackage.frames.map((f) => ({
  sceneId: f.sceneId,
  sha256: f.sha256,
  bytes: f.bytes,
  source: f.source,
  qualityPass: f.qualityPass,
  usedInCut: usedScenes.has(f.sceneId),
  beats: cut.beats.filter((b) => b.source.sceneId === f.sceneId).map((b) => b.beatId),
}));

const unusedScenes = promotedScenes.filter((s) => !s.usedInCut).map((s) => s.sceneId);

/* -- claims --------------------------------------------------------------- */

const claimText = new Map();
for (const c of ledger.claims) {
  claimText.set(c.id, { id: c.id, text: c.text, classification: c.classification, source: 'HAC-335 claim ledger', proofSource: c.proofSource });
}
for (const c of filmedClaims.claims) {
  const resolved = c.pointers.map((ptr) => {
    const doc = readJson(filmedClaims.sources[ptr.source]);
    const value = resolvePointer(doc, ptr.pointer);
    if (value === undefined) {
      throw new Error(`${c.id}: pointer ${ptr.pointer} does not resolve in ${filmedClaims.sources[ptr.source]}`);
    }
    return { source: filmedClaims.sources[ptr.source], pointer: ptr.pointer, value };
  });
  claimText.set(c.id, {
    id: c.id, text: c.text, classification: c.classification, source: 'HAC-336 filmed-run claim rows', resolved,
  });
}

const referenced = new Set(cut.beats.flatMap((b) => b.claims));
for (const id of referenced) {
  if (!claimText.has(id)) throw new Error(`the cut cites ${id}, which is in no claim ledger`);
}

/* -- emit ----------------------------------------------------------------- */

const write = (name, body) => writeFileSync(
  join(repoRoot, 'media', 'hac-336', 'evidence', name),
  `${JSON.stringify(body, null, 2)}\n`,
);

write('input-manifest.json', {
  manifestId: 'HAC-336-input-manifest',
  revision: cut.revision,
  issue: 'HAC-336',
  note: 'Derived by media/hac-336/bin/build-input-manifest.mjs. Do not hand-edit. Every artifact the final cut consumes, with its content digest; every declared revision, with whether it could be checked against frozen evidence and whether it agreed.',
  generator: 'media/hac-336/bin/build-input-manifest.mjs',
  declaredRevisions: revisions,
  capturePackage: {
    packageId: capturePackage.packageId,
    filmedRunId: capturePackage.filmedRunId,
    correlationId: capturePackage.correlationId,
    receiptId: capturePackage.receiptId,
    runtimeSourceSha: capturePackage.runtimeSourceSha,
    productRevision: capturePackage.productRevision,
    model: capturePackage.model,
    adk: capturePackage.adk,
    region: capturePackage.region,
    allFramesPassQuality: capturePackage.allFramesPassQuality,
    teardown: capturePackage.teardown,
    note: 'productRevision is the Director revision that performed the capture. It is deliberately not the same value as the declared directorSha, which is Director main at assembly time.',
  },
  promotedScenes,
  unusedPromotedScenes: {
    sceneIds: unusedScenes,
    note: unusedScenes.length
      ? 'Promoted by the capture manifest and not placed in the cut. Recorded so an omission is visible rather than silent.'
      : 'None. Every promoted scene appears in the cut.',
  },
  inputs: [...inputPaths.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  claims: [...claimText.values()].filter((c) => referenced.has(c.id)),
  narrationSource: {
    path: 'media/hac-336/evidence/cut.json',
    sha256: inputPaths.get('media/hac-336/evidence/cut.json').sha256,
    note: 'The narration and caption text is authored in the cut and nowhere else. The caption files are generated from it, so a caption cannot drift from the scene map.',
  },
  timeline: { totalSeconds: tl.totalSeconds, holdSum: tl.holdSum, transitions: tl.transitions, beats: tl.beats.length },
});

write('scene-map.json', {
  manifestId: 'HAC-336-scene-map',
  revision: cut.revision,
  issue: 'HAC-336',
  note: 'Derived by media/hac-336/bin/build-input-manifest.mjs. Do not hand-edit.',
  generator: 'media/hac-336/bin/build-input-manifest.mjs',
  totalSeconds: tl.totalSeconds,
  scenes: tl.beats.map((b) => {
    const beat = cut.beats[b.index];
    const frame = frameManifest.frames.find((f) => f.beatId === beat.beatId);
    return {
      beatId: beat.beatId,
      timestamp: `${clock(b.startSeconds)}-${clock(b.endSeconds)}`,
      startSeconds: b.startSeconds,
      endSeconds: b.endSeconds,
      act: beat.act,
      proofClass: beat.proofClass,
      proofClassMeaning: cut.proofClasses[beat.proofClass],
      scene: frame.kind === 'capture'
        ? `filmed capture ${frame.sceneId}${frame.cropId ? ` (${frame.cropId})` : ''}`
        : `${frame.assetId}${frame.state ? ` (${frame.state})` : ''}`,
      sourceArtifact: frame.sourcePath,
      sourceSha256: frame.sourceSha256,
      frame: frame.path,
      claimCommunicated: beat.narration,
      claims: beat.claims,
    };
  }),
});

process.stdout.write(
  'HAC-336 input manifest and scene map derived\n'
  + `  ${inputPaths.size} inputs, ${revisions.filter((r) => r.checkable).length}/${revisions.length} declared revisions cross-checked\n`
  + `  ${promotedScenes.filter((s) => s.usedInCut).length}/${promotedScenes.length} promoted capture scenes used\n`
  + `  ${referenced.size} claim rows cited across ${cut.beats.length} beats\n`,
);
