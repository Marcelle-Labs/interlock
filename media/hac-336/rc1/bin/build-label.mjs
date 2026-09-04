#!/usr/bin/env node
/**
 * The proof-class label burnt over the HAC-350 forensic replay.
 *
 * Section 8 of the RC1 brief requires the replay to be identifiable as
 * controlled recorded evidence rather than live execution. HAC-350's plate does
 * not carry that label, because inside its own package the class is unambiguous;
 * dropped into a film that also contains a real cloud run, it is not.
 *
 * This is editorial chrome drawn AROUND the evidence, in the margin the plate
 * leaves empty. It recolours nothing, covers no measured value, and is recorded
 * in the render manifest so its presence is a fact rather than a surprise.
 *
 * The band is y=1012..1064. That strip was measured empty across every paper
 * scene of the replay (darkest pixel 249/255 at fourteen sampled times); the
 * first placement, at y=980, sat on top of the plate's own closing line. The
 * final second is the END card, which inverts to ink, so the overlay fades out
 * before it rather than fighting the field.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');

const INK = '#0b0d0e';
const PAPER = '#fbfbfa';
const N50 = '#737b7b';
const ACCENT = '#c0392b';

const fontFiles = [join(repoRoot, 'assets', 'fonts', 'geist-mono-variable.woff2')]
  .filter((f) => existsSync(f));

/**
 * One bar, drawn in a band the underlying plate leaves empty.
 *
 * `y` is measured, not guessed: see the band scan in the README. `accent` marks
 * the live take, so a judge scrubbing the timeline can tell at a glance which
 * segment is a recording of something happening and which is a frozen board.
 */
function bar({ text, sub, y, height, accent = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <g>
    <rect x="52" y="${y}" width="1816" height="${height}" rx="3" fill="${INK}" fill-opacity="0.92"/>
    <rect x="52" y="${y}" width="4" height="${height}" fill="${accent ? ACCENT : PAPER}" fill-opacity="${accent ? 1 : 0.55}"/>
    <text x="76" y="${y + 23}" font-family="Geist Mono, Menlo, monospace" font-size="16"
          letter-spacing="2.4" fill="${PAPER}" fill-opacity="0.96">${text}</text>
    <text x="76" y="${y + 42}" font-family="Geist Mono, Menlo, monospace" font-size="12"
          letter-spacing="0.9" fill="${N50}">${sub}</text>
  </g>
</svg>`;
}

const write = (svg, name) => {
  const png = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: 1920 },
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Menlo' },
  }).render().asPng();
  const out = join(rc1, 'inserts', name);
  writeFileSync(out, png);
  process.stderr.write(`  ${name}  ${png.length} bytes  sha256 ${createHash('sha256').update(png).digest('hex').slice(0, 16)}…\n`);
};

/* The HAC-350 replay: controlled, recorded, not live. */
write(bar({
  text: 'CONTROLLED EVALUATION — RECORDED EVIDENCE',
  sub: 'deterministic replay of frozen results · not live execution',
  y: 1012, height: 52,
}), 'label-controlled-evaluation-1920x1080.png');

/*
 * The live take. The run id is read out of the capture's own evidence rather
 * than typed here, so the label cannot name a run the footage did not perform —
 * which is the single worst thing a burnt-in caption could do to this segment.
 */
const capturePath = join(repoRoot, 'experiments', 'hac-324', 'evidence', 'live-capture-run.json');
let runId = null;
if (existsSync(capturePath)) {
  runId = JSON.parse(readFileSync(capturePath, 'utf8')).correlationId ?? null;
}
write(bar({
  text: 'LIVE UNEDITED · CLOUD RUN',
  sub: runId
    ? `one continuous take · run ${runId}`
    : 'one continuous take · run id pending capture',
  y: 1012, height: 52, accent: true,
}), 'label-live-cloud-run-1920x1080.png');
