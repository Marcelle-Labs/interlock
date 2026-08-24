#!/usr/bin/env node
/**
 * Turns the cut into frames: one 1920x1080 PNG per beat that needs composing.
 *
 * Three source kinds, and only two of them produce a file here.
 *
 *   `asset`   an already-frozen HAC-334 / HAC-335 export. Used byte-for-byte at
 *             its committed path. Nothing is recomposed, recoloured or
 *             re-exported, because a judge-facing board that differs between the
 *             README and the video is the drift this whole package exists to
 *             prevent.
 *   `board`   a HAC-336 master from `build-boards.mjs`, rasterised here.
 *   `capture` a frame from the HAC-324 authoritative filmed run, cropped and
 *             scaled into a stage with the board chrome around it.
 *
 * The crop is the only editorial operation applied to filmed evidence, and it is
 * bounded deliberately: a rectangle of the original pixels, scaled uniformly.
 * No recolouring, no redaction, no compositing of two captures, no text added
 * inside the stage. A 1920x1080 terminal capture with its content in the top
 * third is unreadable at video bitrates; cropping to that content changes what a
 * judge can read, not what the evidence says. Each crop rectangle is recorded in
 * the cut and re-derived by the gate, so an "editorial" crop that quietly
 * excluded an inconvenient line would be visible as a rectangle that moved.
 *
 * Rasterisation is not claimed to be byte-identical across hosts — resvg's text
 * rasterisation is not — so correspondence runs through the source digest and
 * the declared geometry, exactly as HAC-334's `export-png.mjs` established.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { text, line, paragraph, rect } from '../../hac-334/bin/lib/draw.mjs';
import { toSvg } from '../../hac-334/bin/lib/svg.mjs';
import { themeFor, flat, W, H, M, RAIL_Y } from './lib/film-board.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const filmDir = join(repoRoot, 'media', 'hac-336');
const framesDir = join(filmDir, 'frames');

const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const cut = readJson('media/hac-336/evidence/cut.json');
const capturePackage = readJson('experiments/hac-324/evidence/capture-package.json');
const filmedRun = readJson('experiments/hac-324/evidence/filmed-run.json');

const FONT = {
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica',
  sansSerifFamily: 'Helvetica',
  monospaceFamily: 'Courier',
};

/** Width and height out of the PNG header, not out of what was asked for. */
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG: bad signature');
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') throw new Error('not a PNG: first chunk is not IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Proves the rasteriser can draw text at all before anything is written.
 *
 * Without this a host with no usable face emits valid PNGs with every label
 * missing, and the first person to notice is a judge.
 */
function assertFontsUsable() {
  const box = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">'
    + `<rect x="0" y="0" width="200" height="60" fill="#ffffff"/>${body}</svg>`;
  const ink = (svg) => sha256(new Resvg(svg, { fitTo: { mode: 'width', value: 200 }, font: FONT }).render().asPng());
  const blank = ink(box(''));
  for (const [family, stack] of [['sans', 'Helvetica, sans-serif'], ['mono', 'Courier, monospace']]) {
    const drawn = ink(box(`<text x="10" y="42" font-family="${stack}" font-size="34" fill="#000000">140 &gt; 130</text>`));
    if (drawn === blank) {
      throw new Error(
        `the rasteriser produced no ink for ${family} text (${stack}). Frames rendered now would drop every `
        + 'label while still being valid images. Install a base-14 compatible face and re-run.',
      );
    }
  }
}

/** Cheap non-degeneracy check: a blank or single-colour frame must not pass. */
function distinctBytes(buf) {
  const seen = new Set();
  for (let i = 0; i < buf.length; i += 61) seen.add(buf[i]);
  return seen.size;
}

const rasterise = (svg) => Buffer.from(
  new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: FONT }).render().asPng(),
);

/* -- the capture frame ---------------------------------------------------- */

/**
 * The box a capture is fitted into. Content ends above the rail rule, as on
 * every board.
 *
 * The drawn stage is not this box: it is the crop, scaled uniformly to fit
 * inside it and centred, so the stage border hugs the capture instead of
 * leaving a letterbox band that reads as part of the terminal.
 */
const STAGE_BOX = { x: M, y: 228, w: W - M * 2, h: 544 };

/** Uniform fit of a crop rectangle into the stage box. */
function stageFor(crop) {
  const scale = Math.min(STAGE_BOX.w / crop.w, STAGE_BOX.h / crop.h);
  const w = Math.round(crop.w * scale);
  const h = Math.round(crop.h * scale);
  return {
    x: Math.round(STAGE_BOX.x + (STAGE_BOX.w - w) / 2),
    y: Math.round(STAGE_BOX.y + (STAGE_BOX.h - h) / 2),
    w,
    h,
    scale: Number(scale.toFixed(4)),
  };
}
const CAPTION_Y = 824;
const CAPTION_SIZE = 26;
const CAPTION_MAX_LINES = 3;

const CAPTURE_CLASS_LABEL = 'GOOGLE CLOUD PARTICIPATION - AUTHORITATIVE FILMED RUN';

/**
 * One filmed capture, cropped into the stage with board chrome around it.
 *
 * The chrome is drawn through the shared display list and serialised by the
 * shared `toSvg`, then nested inside an outer SVG that carries the image. The
 * nesting is what keeps the capture underneath the chrome without a second
 * serialiser existing anywhere in this repository.
 */
function captureFrame(beat, scene, sourcePng) {
  const t = themeFor('B');
  const { crop } = beat.source;
  const stage = stageFor(crop);
  const cap = paragraph(M, CAPTION_Y, beat.narration, W - M * 2, {
    size: CAPTION_SIZE, fill: t.fg, lineHeight: 1.4,
  });
  if (cap.lines > CAPTION_MAX_LINES) {
    throw new Error(
      `${beat.beatId}: caption wraps to ${cap.lines} lines, over the ${CAPTION_MAX_LINES}-line limit. `
      + 'Shorten the narration in cut.json rather than shrinking the type below the caption-safe minimum.',
    );
  }

  const rail = [
    `Frozen evidence: scene ${scene.sceneId} sha256 ${scene.sha256.slice(0, 16)}  run ${filmedRun.correlationId}`,
    'Non-claim: one recorded traversal; it does not reproduce the controlled local counterfactual on Google Cloud',
  ];

  const chrome = toSvg(flat([
    text(M, 90, CAPTURE_CLASS_LABEL, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 3 }),
    text(W - M, 90, scene.sceneId, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 2, anchor: 'end' }),
    line(M, 116, W - M, 116, { stroke: t.hair, width: 1 }),
    text(M, 184, beat.title, { size: 44, weight: 600, fill: t.fg, tracking: -0.8 }),
    rect(stage.x, stage.y, stage.w, stage.h, { stroke: t.hair, width: 1 }),
    cap.nodes,
    line(M, RAIL_Y, W - M, RAIL_Y, { stroke: t.hair, width: 1 }),
    rail.map((r, i) => text(M, RAIL_Y + 34 + i * 26, r, { size: 16, mono: true, fill: t.muted })),
  ]), {
    width: W,
    height: H,
    background: 'none',
    title: `${scene.sceneId} - ${beat.title}`,
    desc: `${CAPTURE_CLASS_LABEL}. ${beat.narration} ${rail.join(' ')}`,
  });

  const b64 = sourcePng.toString('base64');
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
    + `viewBox="0 0 ${W} ${H}">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="${t.bg}"/>`
    + `<svg x="${stage.x}" y="${stage.y}" width="${stage.w}" height="${stage.h}" `
    + `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none">`
    + `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${W}" height="${H}"/>`
    + '</svg>'
    + chrome.replace(/^<svg /, '<svg x="0" y="0" width="1920" height="1080" ')
    + '</svg>\n';
}

/* -- run ------------------------------------------------------------------ */

assertFontsUsable();

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) if (f.endsWith('.png')) rmSync(join(framesDir, f));

const mastersDir = join(filmDir, 'masters');

/**
 * The master file for a `(board, state)` pair.
 *
 * Resolved by looking at what `build-boards.mjs` actually wrote rather than by
 * rebuilding the filename from the naming grammar: if the two ever disagree, the
 * disagreement should surface as a missing master, not as a frame silently
 * rendered from the wrong state.
 */
function masterFileFor(source) {
  const suffix = `-${source.state}.svg`;
  const hits = readdirSync(mastersDir)
    .filter((f) => f.startsWith(`${source.master}-`) && f.endsWith(suffix));
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one master for ${source.master} state ${source.state}, found ${hits.length}. `
      + 'Run media/hac-336/bin/build-boards.mjs first.',
    );
  }
  return hits[0];
}

const frames = [];
for (const beat of cut.beats) {
  const { source } = beat;

  if (source.kind === 'asset') {
    const abs = join(repoRoot, source.path);
    if (!existsSync(abs)) throw new Error(`${beat.beatId}: frozen export missing: ${source.path}`);
    const buf = readFileSync(abs);
    const size = pngSize(buf);
    if (size.width !== W || size.height !== H) {
      throw new Error(`${beat.beatId}: ${source.path} is ${size.width}x${size.height}, not ${W}x${H}`);
    }
    frames.push({
      beatId: beat.beatId,
      kind: 'asset',
      assetId: source.assetId,
      path: source.path,
      composed: false,
      width: size.width,
      height: size.height,
      sha256: sha256(buf),
      sourcePath: source.path,
      sourceSha256: sha256(buf),
    });
    continue;
  }

  if (source.kind === 'board') {
    const name = masterFileFor(source);
    const svgPath = join('media', 'hac-336', 'masters', name);
    const svg = readFileSync(join(repoRoot, svgPath), 'utf8');
    const png = rasterise(svg);
    const size = pngSize(png);
    if (size.width !== W || size.height !== H) {
      throw new Error(`${beat.beatId}: rasterised ${size.width}x${size.height}, not ${W}x${H}`);
    }
    if (distinctBytes(png) < 32) throw new Error(`${beat.beatId}: rasterised frame is degenerate`);
    const out = `${beat.beatId}-${source.master}-${source.state}.png`;
    writeFileSync(join(framesDir, out), png);
    frames.push({
      beatId: beat.beatId,
      kind: 'board',
      assetId: source.master,
      state: source.state,
      path: `media/hac-336/frames/${out}`,
      composed: true,
      width: size.width,
      height: size.height,
      sha256: sha256(png),
      sourcePath: svgPath,
      sourceSha256: sha256(Buffer.from(svg, 'utf8')),
    });
    continue;
  }

  if (source.kind === 'capture') {
    const scene = capturePackage.frames.find((f) => f.sceneId === source.sceneId);
    if (!scene) throw new Error(`${beat.beatId}: no promoted scene ${source.sceneId} in the capture package`);
    const scenePath = `experiments/hac-324/frames/scene-${source.sceneId}.png`;
    const src = readFileSync(join(repoRoot, scenePath));
    if (sha256(src) !== scene.sha256) {
      throw new Error(
        `${beat.beatId}: ${scenePath} hashes to ${sha256(src).slice(0, 16)} but the capture manifest `
        + `promoted ${scene.sha256.slice(0, 16)}. The committed frame is not the frame that was filmed.`,
      );
    }
    const srcSize = pngSize(src);
    const { crop } = source;
    if (crop.x < 0 || crop.y < 0 || crop.x + crop.w > srcSize.width || crop.y + crop.h > srcSize.height) {
      throw new Error(`${beat.beatId}: crop ${JSON.stringify(crop)} leaves the ${srcSize.width}x${srcSize.height} capture`);
    }
    const stage = stageFor(crop);
    const png = rasterise(captureFrame(beat, scene, src));
    if (distinctBytes(png) < 32) throw new Error(`${beat.beatId}: composed capture frame is degenerate`);
    const out = `${beat.beatId}-scene-${source.sceneId}${source.cropId ? `-${source.cropId}` : ''}.png`;
    writeFileSync(join(framesDir, out), png);
    frames.push({
      beatId: beat.beatId,
      kind: 'capture',
      sceneId: source.sceneId,
      cropId: source.cropId ?? null,
      crop,
      stage,
      path: `media/hac-336/frames/${out}`,
      composed: true,
      width: W,
      height: H,
      sha256: sha256(png),
      sourcePath: scenePath,
      sourceSha256: scene.sha256,
    });
    continue;
  }

  throw new Error(`${beat.beatId}: unknown source kind ${source.kind}`);
}

writeFileSync(
  join(filmDir, 'evidence', 'frame-manifest.json'),
  `${JSON.stringify({
    manifestId: 'HAC-336-frame-manifest',
    revision: cut.revision,
    issue: 'HAC-336',
    note: 'Derived by media/hac-336/bin/build-frames.mjs. Do not hand-edit. `sourceSha256` binds each frame to the artifact it came from: an SVG master for a board, the promoted capture bytes for a filmed scene, the frozen export itself for an asset.',
    generator: 'media/hac-336/bin/build-frames.mjs',
    rasteriser: `@resvg/resvg-js@${JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies['@resvg/resvg-js']}`,
    geometry: { width: W, height: H },
    stageBox: STAGE_BOX,
    frames,
  }, null, 2)}\n`,
);

process.stdout.write(
  `HAC-336 frames built\n  ${frames.filter((f) => f.composed).length} composed in media/hac-336/frames\n`
  + `  ${frames.filter((f) => !f.composed).length} frozen exports used in place\n`,
);
