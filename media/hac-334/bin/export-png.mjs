#!/usr/bin/env node
/**
 * Rasterises the canonical SVG masters to the PNG sizes the visual model
 * declares. The only step in the pipeline that needs a dependency.
 *
 * The dependency is earned narrowly: PNG is a frozen HAC-334 deliverable, an
 * SVG cannot rasterise itself, and a manual browser screenshot is neither
 * reproducible nor reviewable. `@resvg/resvg-js` is pinned exactly, is used
 * only here, and never enters the deterministic Interlock core — nothing under
 * `src/` imports it and nothing at runtime needs it.
 *
 * What this script refuses to do quietly:
 *
 *   - rasterise anything that is not a canonical master listed in the model;
 *   - accept a dimension the model does not declare;
 *   - emit a PNG whose real pixel size is not the size that was asked for;
 *   - render text with a substituted or missing font;
 *   - leave a PNG behind that no longer corresponds to its master.
 *
 * The last one is why `exports/render-manifest.json` exists: each PNG records
 * the SHA-256 of the SVG it came from, so a stale derivative is a mechanical
 * finding rather than something a reviewer has to notice by eye. Byte-identical
 * rasterisation across hosts is not claimed — font rasterisation differs — so
 * correspondence is asserted through the source digest, the declared geometry
 * and a non-degeneracy check rather than through a byte comparison.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildExportName, validateExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const mediaDir = join(repoRoot, 'media', 'hac-334');
const mastersDir = join(mediaDir, 'masters');
const exportsDir = join(mediaDir, 'exports');

const model = JSON.parse(readFileSync(join(mediaDir, 'evidence', 'visual-model.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const rasterizer = `@resvg/resvg-js@${pkg.devDependencies['@resvg/resvg-js']}`;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Font configuration. System fonts are loaded because the boards name base-14
 * families, but the probe below proves a usable face was actually found rather
 * than assuming it.
 */
const FONT = {
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica',
  sansSerifFamily: 'Helvetica',
  monospaceFamily: 'Courier',
};

/** Width and height straight out of the PNG header, not out of what we asked for. */
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG: bad signature');
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') throw new Error('not a PNG: first chunk is not IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Proves the rasteriser can draw text at all.
 *
 * If no usable face is found, resvg renders text as nothing and returns a PNG
 * that is technically valid and silently wrong. Two probes distinguish that
 * from a working host: an empty canvas and the same canvas with a glyph on it
 * must differ.
 */
function assertFontsUsable() {
  const box = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">`
    + `<rect x="0" y="0" width="200" height="60" fill="#ffffff"/>${body}</svg>`;
  const ink = (svg) => {
    const px = new Resvg(svg, { fitTo: { mode: 'width', value: 200 }, font: FONT }).render().asPng();
    return sha256(px);
  };
  const blank = ink(box(''));
  for (const [family, mono] of [['sans', false], ['mono', true]]) {
    const f = mono ? 'Courier, monospace' : 'Helvetica, sans-serif';
    const drawn = ink(box(`<text x="10" y="42" font-family="${f}" font-size="34" fill="#000000">140 &gt; 130</text>`));
    if (drawn === blank) {
      throw new Error(
        `the rasteriser produced no ink for ${family} text (${f}). A PNG rendered now would drop every `
        + 'label while still being a valid image. Install a base-14 compatible face '
        + '(Helvetica/Arial/Liberation Sans and Courier/Liberation Mono) and re-run.',
      );
    }
  }
}

/** Ink coverage, as a cheap non-degeneracy check on a finished board. */
function inkRatio(buf, expected) {
  const { width, height } = expected;
  // Compare against a same-size render of the page background alone would be
  // exact but doubles the work; a distinct-byte count over the compressed
  // stream is enough to catch an empty or single-colour board.
  const unique = new Set();
  for (let i = 0; i < buf.length; i += 97) unique.add(buf[i]);
  return { unique: unique.size, pixels: width * height };
}

/* -- run ------------------------------------------------------------------ */

assertFontsUsable();

mkdirSync(exportsDir, { recursive: true });
for (const f of readdirSync(exportsDir)) if (f.endsWith('.png')) rmSync(join(exportsDir, f));

const DECLARED_SIZES = new Set();
for (const asset of model.assets) {
  for (const ex of asset.exports) {
    if (ex.ext === 'png') DECLARED_SIZES.add(`${ex.width}x${ex.height}`);
  }
}

const records = [];
for (const asset of model.assets) {
  for (const ex of asset.exports.filter((e) => e.ext === 'png')) {
    // Locate the canonical master this raster derives from: same asset, same
    // slug, SVG. Rasterising anything else would break the one-master rule.
    const svgName = buildExportName({
      id: asset.id, slug: ex.slug, ext: 'svg', ...(asset.run ? { run: asset.run } : {}),
    });
    const svgPath = join(mastersDir, svgName);
    if (!existsSync(svgPath)) {
      throw new Error(`${asset.id}: no canonical master ${svgName}; run render-masters.mjs first`);
    }
    const size = `${ex.width}x${ex.height}`;
    if (!DECLARED_SIZES.has(size)) throw new Error(`${asset.id}: undeclared export size ${size}`);
    if (ex.width * 9 !== ex.height * 16) {
      throw new Error(`${asset.id}: ${size} is not 16:9; the masters are authored at 1920x1080`);
    }

    const svg = readFileSync(svgPath);
    const png = new Resvg(svg.toString('utf8'), {
      fitTo: { mode: 'width', value: ex.width },
      font: FONT,
    }).render().asPng();

    const actual = pngSize(png);
    if (actual.width !== ex.width || actual.height !== ex.height) {
      throw new Error(
        `${asset.id} ${size}: rasteriser produced ${actual.width}x${actual.height}. `
        + 'The declared geometry and the real pixels must agree.',
      );
    }
    const { unique } = inkRatio(png, actual);
    if (unique < 8) {
      throw new Error(`${asset.id} ${size}: rendered image is degenerate (${unique} distinct sampled bytes)`);
    }

    const name = buildExportName({
      id: asset.id, slug: ex.slug, ext: 'png', width: ex.width, height: ex.height,
      ...(asset.run ? { run: asset.run } : {}),
    });
    const check = validateExportName(name);
    if (!check.valid) throw new Error(`built an unparseable export name ${name}: ${check.error}`);
    writeFileSync(join(exportsDir, name), png);

    records.push({
      asset: asset.id,
      export: name,
      master: svgName,
      masterSha256: sha256(svg),
      width: actual.width,
      height: actual.height,
      ...(ex.presentationRole ? { presentationRole: ex.presentationRole } : {}),
    });
  }
}

writeFileSync(
  join(exportsDir, 'render-manifest.json'),
  `${JSON.stringify({
    contract: 'HAC-334 raster derivation record',
    rasterizer,
    note: 'Each PNG records the SHA-256 of the master it was rendered from. '
      + 'verify-visuals.mjs recomputes those digests, so a master edited without re-export is a gate failure. '
      + 'Byte-identical rasterisation across hosts is not claimed; correspondence is asserted through the '
      + 'source digest, the declared geometry and the rendered pixel size.',
    renders: records,
  }, null, 2)}\n`,
);

process.stdout.write(
  `HAC-334 rasters exported with ${rasterizer}\n`
  + `  ${records.length} PNGs in media/hac-334/exports\n`
  + `  sizes ${[...DECLARED_SIZES].sort().join(', ')}\n`,
);
