#!/usr/bin/env node
/**
 * HAC-351 — deterministic first and last frames for the bounded Veo cold open.
 *
 * These two stills are the composition and continuity authority for the one
 * generated shot. Veo is asked to move the camera between them; it is never
 * asked to invent the brand, the product, the system, or the outcome.
 *
 * The scene carries exactly one proposition:
 *
 *   THREE INDEPENDENT WORKSTREAMS CAN STILL REST ON THE SAME SUPPORT.
 *
 * It carries no claim. There is no text, no logo, no label, no product state,
 * no architecture and no Interlock decision anywhere in either frame — those
 * are added deterministically in post, outside the generated material, or not
 * at all. The last frame does not show the problem being solved; it shows only
 * that the three paths were never independent of one another.
 *
 * Geometry is a single pinhole projection of one 3-D world. Both frames are the
 * same world at two camera stations along one axis, which is what makes the
 * generated motion between them a dolly rather than a cut: lane spacing,
 * vanishing point and beam position are consequences of the projection, not
 * numbers typed twice. Changing CAMERA below moves both frames coherently.
 *
 * Colour comes from the HAC-332 token transcription in the HAC-334 draw layer
 * (`INK`, `PAPER`, `N`), never from a hex value typed here.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { toSvg } from '../../hac-334/bin/lib/svg.mjs';
import { rect, line, path, N, INK, PAPER } from '../../hac-334/bin/lib/draw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const W = 1920;
const H = 1080;

/* -- the world ------------------------------------------------------------
 * Right-handed: +x right, +y down, +z away from camera. The deck plane is
 * y = 0. The shared support sits below it at y = BEAM_Y, so it is occluded by
 * the deck ribbons until the camera drops toward deck level.
 */
const LANE_X = [-1.30, 0, 1.30];   // three channels, evenly spaced
const LANE_HALF_W = 0.38;          // ribbon half-width
const PLINTH_Z0 = 0.50;            // the support is a transverse member, not a floor
const PLINTH_Z1 = 1.40;
const DECK_T = 0.22;               // deck slab thickness: the channels have a body
const Z_NEAR = 0.50;               // near end of the ribbons
const Z_FAR = 22.0;                // far end, effectively the horizon
/* The shared support: one continuous plinth carrying all three channels. It sits
 * far enough below the deck that the first camera station cannot see it — at that
 * height and distance it falls below the bottom edge of the frame. The dolly does
 * not add it to the world; it only brings the camera low enough to see what was
 * always holding the three channels up. */
const PLINTH_Y = 0.62;             // top face of the shared support
const PLINTH_T = 0.34;             // its own thickness
const PLINTH_HALF_W = 2.15;        // spans past the outermost channels

/**
 * Two camera stations on one axis. The dolly is the only thing that changes:
 * the camera moves forward (z) and settles toward deck level (y), which is what
 * brings the support out from behind the deck. Nothing in the world moves
 * except the three carriages advancing along their own lanes.
 */
const CAMERA = {
  first: { z: -4.20, y: -2.20, f: 1400 },
  last: { z: -3.40, y: -1.05, f: 1400 },
};

/** Carriage positions along z. Staggered first, still distinct at the end. */
const CARRIAGE = {
  first: [3.20, 4.40, 3.70],
  last: [2.40, 3.30, 2.75],
};

const CX = W / 2;
const CY = H * 0.42; // optical centre above middle: the field reads as a deck, not a sky

/** Pinhole projection of a world point for a given camera station. */
function project(cam, x, y, z) {
  const d = z - cam.z;
  const s = cam.f / d;
  return { x: CX + x * s, y: CY + (y - cam.y) * s, s };
}

/** A quad as an absolute M/L path — the only commands the SVG backend takes. */
const quad = (a, b, c, d, o) =>
  path(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
     + ` L ${c.x.toFixed(2)} ${c.y.toFixed(2)} L ${d.x.toFixed(2)} ${d.y.toFixed(2)} Z`, o);

/**
 * One frame's display list.
 * @param {'first'|'last'} station
 */
function build(station) {
  const cam = CAMERA[station];
  const P = (x, y, z) => project(cam, x, y, z);
  const nodes = [];

  /* -- the shared support ------------------------------------------------
   * One continuous plinth running under all three channels, with a short pier
   * rising from it to each channel's underside. It is drawn first so the deck
   * slabs occlude whatever the current camera station cannot legitimately see.
   *
   * At the first station the camera is 2.2 above the deck and 6.0 back: the
   * plinth projects below the bottom edge of the frame and no part of it is in
   * shot. At the second station the camera has descended to 0.55 above the deck,
   * and the same unchanged geometry is in view. The support is not introduced by
   * the move; it is only disclosed by it.
   */
  const slab = (x0, x1, yTop, yBot, z0, z1, faceFill, topFill) => {
    // top face
    nodes.push(quad(P(x0, yTop, z0), P(x1, yTop, z0), P(x1, yTop, z1), P(x0, yTop, z1),
      { fill: topFill, stroke: N[40], width: 1.5 }));
    // near face
    nodes.push(quad(P(x0, yTop, z0), P(x1, yTop, z0), P(x1, yBot, z0), P(x0, yBot, z0),
      { fill: faceFill, stroke: N[50], width: 1.5 }));
  };

  slab(-PLINTH_HALF_W, PLINTH_HALF_W, PLINTH_Y, PLINTH_Y + PLINTH_T, PLINTH_Z0, PLINTH_Z1, N[30], N[20]);

  // one pier per channel, from the plinth up to the underside of its deck slab
  for (const lx of LANE_X) {
    const pw = LANE_HALF_W * 0.55;
    nodes.push(quad(P(lx - pw, DECK_T, PLINTH_Z0), P(lx + pw, DECK_T, PLINTH_Z0),
      P(lx + pw, PLINTH_Y, PLINTH_Z0), P(lx - pw, PLINTH_Y, PLINTH_Z0),
      { fill: N[20], stroke: N[50], width: 1.5 }));
  }

  /* -- the three channels -------------------------------------------------
   * Matte slabs with a real body, hairline edges, no gradient. They stay
   * visually distinct in both frames: the shot never merges the workstreams.
   */
  for (const lx of LANE_X) {
    const l = lx - LANE_HALF_W;
    const r = lx + LANE_HALF_W;
    // running surface
    nodes.push(quad(P(l, 0, Z_NEAR), P(r, 0, Z_NEAR), P(r, 0, Z_FAR), P(l, 0, Z_FAR),
      { fill: PAPER, stroke: N[30], width: 1.5 }));
    // near face: the slab has thickness, which is what the descending camera reveals
    nodes.push(quad(P(l, 0, Z_NEAR), P(r, 0, Z_NEAR), P(r, DECK_T, Z_NEAR), P(l, DECK_T, Z_NEAR),
      { fill: N[10], stroke: N[40], width: 1.5 }));
    // the running rail: one centred hairline, the trajectory the carriage takes
    const rn = P(lx, 0, Z_NEAR);
    const rf = P(lx, 0, Z_FAR);
    nodes.push(line(rn.x, rn.y, rf.x, rf.y, { stroke: N[30], width: 1, cap: 'butt' }));
  }

  /* -- the carriages ------------------------------------------------------
   * One machined block per channel: a matte top face and a darker leading
   * face, so direction of travel is legible without any motion cue. They stay
   * visually distinct in both frames — the shot never merges the workstreams.
   */
  CARRIAGE[station].forEach((cz, i) => {
    const lx = LANE_X[i];
    const hw = 0.30;
    const hd = 0.45;
    const ht = 0.42;
    const top = [
      P(lx - hw, -ht, cz - hd), P(lx + hw, -ht, cz - hd),
      P(lx + hw, -ht, cz + hd), P(lx - hw, -ht, cz + hd),
    ];
    const front = [
      P(lx - hw, -ht, cz - hd), P(lx + hw, -ht, cz - hd),
      P(lx + hw, 0, cz - hd), P(lx - hw, 0, cz - hd),
    ];
    nodes.push(quad(top[0], top[1], top[2], top[3], { fill: N['05'], stroke: N[60], width: 1.5 }));
    nodes.push(quad(front[0], front[1], front[2], front[3], { fill: N[70], stroke: INK, width: 1.5 }));
  });

  return nodes;
}

const page = (title, desc) => ({ width: W, height: H, title, desc, background: PAPER });

const FRAMES = {
  first: {
    id: 'IL-VEO-001-cold-open-first',
    title: 'Three independent channels',
    desc: 'Three separate matte channels recede across an empty paper field, each '
      + 'carrying one machined block at its own position. No text, no labels, no '
      + 'product state. The support beneath the channels is not yet visible.',
  },
  last: {
    id: 'IL-VEO-001-cold-open-last',
    title: 'Three channels, one shared support',
    desc: 'The same three channels seen from closer and lower. A single continuous '
      + 'member is now visible beneath all three, so the separate paths are seen to '
      + 'rest on one shared support. No decision, mechanism or outcome is shown.',
  },
};

mkdirSync(join(root, 'masters'), { recursive: true });
mkdirSync(join(root, 'frames'), { recursive: true });

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = [];

for (const station of ['first', 'last']) {
  const meta = FRAMES[station];
  const svg = toSvg(build(station), page(meta.title, meta.desc));
  const svgPath = join(root, 'masters', `${meta.id}.svg`);
  writeFileSync(svgPath, svg);

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  const pngPath = join(root, 'frames', `${meta.id}-1920x1080.png`);
  writeFileSync(pngPath, png);

  manifest.push({
    station,
    assetId: meta.id,
    svg: `media/hac-351/masters/${meta.id}.svg`,
    svgSha256: sha256(Buffer.from(svg)),
    png: `media/hac-351/frames/${meta.id}-1920x1080.png`,
    pngSha256: sha256(png),
    pngBytes: png.length,
    width: W,
    height: H,
    camera: CAMERA[station],
    carriageZ: CARRIAGE[station],
    description: meta.desc,
  });
  console.log(`${meta.id}  svg ${sha256(Buffer.from(svg)).slice(0, 12)}  png ${sha256(png).slice(0, 12)}  ${png.length}B`);
}

mkdirSync(join(root, 'evidence'), { recursive: true });
writeFileSync(
  join(root, 'evidence', 'frame-manifest.json'),
  `${JSON.stringify({
    issue: 'HAC-351',
    role: 'Deterministic first/last frame authority for one bounded Veo 3.1 cold open.',
    claimBoundary: 'Editorial metaphor only. These frames assert no product state, '
      + 'architecture, execution, telemetry or Interlock decision.',
    generator: 'media/hac-351/bin/build-frames.mjs',
    substrate: 'media/hac-334/bin/lib/{svg,draw}.mjs (HAC-332 tokens)',
    world: { LANE_X, LANE_HALF_W, DECK_T, Z_NEAR, Z_FAR, PLINTH_Y, PLINTH_T, PLINTH_HALF_W, PLINTH_Z0, PLINTH_Z1 },
    frames: manifest,
  }, null, 2)}\n`,
);
console.log('wrote media/hac-351/evidence/frame-manifest.json');
