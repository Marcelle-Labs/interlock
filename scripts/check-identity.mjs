#!/usr/bin/env node
/**
 * Enforces the Interlock identity boundary.
 *
 * The failure this file exists to prevent already happened once: the identity
 * lived only in an external design handoff, so the cockpit drew the mark as a
 * CSS rectangle, both judge surfaces named Geist and loaded no font, and the
 * HAC-333 scene manifest cited a logo file the repository did not contain.
 * Nothing caught it, because nothing was checking.
 *
 * The invariants, in the order they matter:
 *
 *   - the canonical assets exist here, so a clean clone renders correctly;
 *   - the mark on a surface is the canonical geometry, not an approximation;
 *   - the typefaces are local, so a rendered frame never depends on a network;
 *   - both surfaces resolve ONE identity authority, not two that agree today;
 *   - vendored third-party bytes carry provenance and verify against it.
 *
 * Dependency-free and deterministic, so CI and a laptop reach the same verdict.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(repoRoot, ...p), 'utf8');
const sha256 = (...p) => createHash('sha256').update(readFileSync(join(repoRoot, ...p))).digest('hex');

const errors = [];
const fail = (m) => errors.push(m);

const registry = JSON.parse(read('assets', 'registry.json'));
const geometry = read('assets', 'brand', 'logo-geometry.js');
const harvest = read('assets', 'HARVEST.md');
const cockpit = read('media', 'hac-341', 'cockpit.html');
const storyboard = read('media', 'hac-333', 'storyboard.html');
const sceneManifest = JSON.parse(read('media', 'hac-333', 'scene-manifest.json'));
const surfaces = { 'cockpit.html': cockpit, 'storyboard.html': storyboard };

/* --- the canonical assets are here, and are what the registry says ------- */

let fileCount = 0;
for (const asset of registry.assets) {
  for (const f of asset.files ?? []) {
    fileCount += 1;
    if (!existsSync(join(repoRoot, f.file))) {
      fail(`${asset.id} declares ${f.file}, which is not in the repository`);
      continue;
    }
    // Drift detection: the mark may only change through an explicit revision.
    if (sha256(f.file) !== f.sha256) {
      fail(`${f.file} has changed since it was harvested; ${asset.id} still records the old digest. `
        + 'A change to the mark is a change to the identity, not a refactor.');
    }
    const live = read(f.file).includes('<text');
    if (live !== f.containsLiveText) {
      fail(`${f.file} live-text classification is wrong: registry says ${f.containsLiveText}, file says ${live}`);
    }
  }
}

/* --- the surfaces draw the canonical mark, not an approximation ---------- */

// The four arms and two leaves, extracted from the canonical geometry module so
// this check moves when the mark legitimately does.
const canonicalPaths = [...geometry.matchAll(/'(M[\d.]+ [\d.]+ L[^']+Z)'/g)].map((m) => m[1]);
const arms = canonicalPaths.filter((d) => !d.startsWith('M18.6') && !d.startsWith('M29.4'));
if (arms.length < 4) fail('could not extract the canonical arm geometry from assets/brand/logo-geometry.js');

for (const [name, src] of Object.entries(surfaces)) {
  for (const d of canonicalPaths.slice(0, 6)) {
    if (!src.includes(d)) {
      fail(`${name} does not draw the canonical mark: path ${d.slice(0, 28)}... is missing`);
      break;
    }
  }
  // The specific regression this pass corrected.
  if (/\.brand\s+i\s*\{|Inter<i><\/i>lock|Inter<span class="gate">/.test(src)) {
    fail(`${name} has returned to synthesising the mark from CSS; use the canonical geometry`);
  }
  if (!/assets\/styles\.css/.test(src)) {
    fail(`${name} does not link the shared identity authority (assets/styles.css)`);
  }
}

/* --- the typefaces are local, and no surface can reach for a CDN --------- */

const fontsCss = read('assets', 'tokens', 'fonts.css');
for (const family of ['Geist', 'Geist Mono']) {
  if (!new RegExp(`font-family:\\s*"${family}"`).test(fontsCss)) {
    fail(`assets/tokens/fonts.css declares no @font-face for ${family}`);
  }
}
for (const m of fontsCss.matchAll(/url\("([^"]+)"\)/g)) {
  if (/^https?:/.test(m[1])) fail(`assets/tokens/fonts.css fetches a remote font: ${m[1]}`);
  const rel = m[1].replace(/^\.\.\//, '');
  if (!existsSync(join(repoRoot, 'assets', rel))) fail(`assets/tokens/fonts.css references a missing face: ${m[1]}`);
}
// A judge-facing frame must not depend on a font service being reachable.
const CDN = /fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny\.net|cdn\.jsdelivr\.net\/npm\/@fontsource/;
for (const [name, src] of Object.entries({ ...surfaces, 'tokens/fonts.css': fontsCss, 'styles.css': read('assets', 'styles.css') })) {
  if (CDN.test(src)) fail(`${name} references a font CDN; the faces are vendored and must stay local`);
}
if (!/font-display:\s*block/.test(fontsCss)) {
  fail('fonts.css does not set font-display: block; a capture could catch a fallback frame');
}

/* --- vendored bytes verify against their recorded provenance ------------- */

const FONTS = {
  'assets/fonts/geist-variable.woff2': 'a369fcf5628ea2aa4e1b9e2ec6a5b3624e365bda588e1f0f2f12b564f728fbb8',
  'assets/fonts/geist-mono-variable.woff2': 'fba8f577f38a2bbcbe818efa6348dd58f36303a10b8737c42fefad275be563ab',
};
for (const [f, digest] of Object.entries(FONTS)) {
  if (!existsSync(join(repoRoot, f))) { fail(`vendored face ${f} is missing`); continue; }
  if (sha256(f) !== digest) fail(`${f} does not match the upstream digest recorded for it`);
  if (!harvest.includes(digest)) fail(`assets/HARVEST.md does not record the digest for ${f}`);
}
if (!existsSync(join(repoRoot, 'assets/fonts/OFL.txt'))) fail('the font licence is not carried with the faces');
for (const token of ['vercel/geist-font', 'v1.7.2', 'OFL', 'a73329da8fc62afc917f796555202e4997f79b7c']) {
  if (!harvest.includes(token)) fail(`assets/HARVEST.md does not record font provenance: ${token}`);
}

/* --- no manifest may cite an identity asset that is not here ------------- */

for (const scene of sceneManifest.scenes) {
  for (const artifact of scene.sourceArtifact ?? []) {
    const m = /(assets\/logo\/[\w.-]+\.svg)/.exec(artifact);
    if (m && !existsSync(join(repoRoot, m[1]))) {
      fail(`HAC-333 ${scene.sceneId} cites ${m[1]}, which is not in the repository`);
    }
  }
}

/* --- verdict ------------------------------------------------------------- */

if (errors.length) {
  process.stderr.write(`Interlock identity boundary violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'PASS identity boundary\n'
  + `  ${registry.assets.filter((a) => a.files).length} identity rows, ${fileCount} canonical files, digests verified\n`
  + '  Geist and Geist Mono vendored locally, provenance recorded, zero font CDN references\n'
  + '  cockpit and storyboard draw the canonical mark and share one identity authority\n',
);
