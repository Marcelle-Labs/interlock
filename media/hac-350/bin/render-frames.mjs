#!/usr/bin/env node
/**
 * Render the Forensic Replay to SVG masters and PNG stills.
 *
 * Three modes, one code path through `plateAt`:
 *
 *   (default)      the canonical stills — one per scene, plus the closing frame
 *   --sequence     every frame of the export, at `--fps`
 *   --at <t>[,t..] arbitrary instants, for looking at something specific
 *
 * The mode never changes how a frame is produced, only which instants are
 * asked for. That is the whole reason a canonical still is worth anything: it
 * is not a separate rendering of the scene, it is frame 390 of the export
 * written to a different filename.
 *
 * `--reduced` renders the reduced-motion equivalent. `--debug` overlays the
 * review layer, and refuses to write into `frames/` — the annotated plate is a
 * review artifact and must not be able to reach an export directory by way of
 * a flag someone forgot to unset.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { composePlate } from './lib/plate.mjs';
import { plateAt, seq } from './lib/replay.mjs';
import { canonicalTimes, frameTimes } from '../../hac-334/bin/lib/motion.mjs';
import { overlay } from './lib/debug.mjs';
import { W, H } from './lib/world.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const repoRoot = join(pkgDir, '..', '..');
const bindings = JSON.parse(readFileSync(join(pkgDir, 'evidence', 'bindings.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const reduced = has('--reduced');
const debug = has('--debug');
const fps = Number(valueOf('--fps', '30'));
const outDir = join(pkgDir, debug ? 'review' : has('--sequence') ? 'frames' : 'masters');
const png = has('--png') || !has('--sequence');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Which instants to draw. */
let times;
if (has('--at')) {
  times = valueOf('--at', '0').split(',').map((s) => ({ id: `t${s}`, t: Number(s) }));
} else if (has('--sequence')) {
  times = frameTimes(seq.duration, fps).map((t, i) => ({ id: `f${String(i).padStart(4, '0')}`, t }));
} else {
  times = canonicalTimes(seq);
}

mkdirSync(outDir, { recursive: true });
if (!has('--at')) {
  for (const f of existsSync(outDir) ? readdirSync(outDir) : []) {
    if (f.endsWith('.svg') || f.endsWith('.png')) rmSync(join(outDir, f));
  }
}

const suffix = reduced ? '-reduced' : '';
const manifest = [];

for (const { id, t } of times) {
  const plate = plateAt(t, bindings, { reduced });
  const nodes = debug ? [...plate.nodes, ...overlay(plate, bindings, { reduced })] : plate.nodes;
  const svg = composePlate({
    id: plate.scene.id,
    t,
    background: plate.background,
    title: `Interlock Forensic Replay - ${plate.scene.id} ${plate.scene.name} at ${t.toFixed(2)}s`,
    desc: `Scene ${plate.scene.id}. ${plate.scene.name}. Rendered from frozen HAC-343 bindings at t=${t.toFixed(2)}.`,
    render: () => nodes,
  });

  const base = `${id}-${plate.scene.id}${suffix}`;
  const svgPath = join(outDir, `${base}.svg`);
  writeFileSync(svgPath, svg);

  let pngDigest = null;
  if (png) {
    const buf = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
    writeFileSync(join(outDir, `${base}.png`), buf);
    pngDigest = sha256(buf);
  }

  manifest.push({
    id: base,
    scene: plate.scene.id,
    t: Number(t.toFixed(3)),
    reduced,
    nodes: nodes.length,
    svgSha256: sha256(Buffer.from(svg)),
    pngSha256: pngDigest,
  });
}

if (!debug && !has('--at')) {
  const name = has('--sequence') ? 'frame-manifest' : 'still-manifest';
  writeFileSync(
    join(pkgDir, 'evidence', `${name}${suffix}.json`),
    `${JSON.stringify({
      issue: 'HAC-350',
      kind: name,
      width: W,
      height: H,
      fps: has('--sequence') ? fps : null,
      duration: seq.duration,
      reduced,
      bindingsSha256: sha256(readFileSync(join(pkgDir, 'evidence', 'bindings.json'))),
      entries: manifest,
    }, null, 2)}\n`,
  );
}

console.log(`${manifest.length} plate(s) -> ${relative(repoRoot, outDir)}${reduced ? '  [reduced motion]' : ''}${debug ? '  [REVIEW ONLY]' : ''}`);
