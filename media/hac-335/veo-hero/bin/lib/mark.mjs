#!/usr/bin/env node
/**
 * The Interlock mark, read out of the canonical SVG files rather than redrawn.
 *
 * Every surface in this repository that draws the mark embeds the frozen paths
 * verbatim, and `scripts/check-identity.mjs` reconciles what a surface inlined
 * against `assets/brand/logo-geometry.js`. The Veo keyframes are no different:
 * a generated video that is asked to preserve "the exact supplied frame" is
 * only as canonical as the frame handed to it, so the frame is assembled from
 * the same bytes the cockpit and the storyboard draw.
 *
 * This module therefore parses; it does not author geometry.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..', '..', '..', '..');

/** Pull the `d` attribute of every path in a canonical logo file, in order. */
export function markPaths(file) {
  const src = readFileSync(join(repoRoot, file), 'utf8');
  const paths = [...src.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map((m) => ({
    d: m[1],
    opacity: /\bopacity="([^"]+)"/.exec(m[0])?.[1] ?? null,
  }));
  if (!paths.length) throw new Error(`${file}: no <path> geometry found`);
  return paths;
}

/** The four outer arms, read out of the `ARMS` export by name. */
export function canonicalArms() {
  const geometry = readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8');
  const block = /export const ARMS = \[([\s\S]*?)\];/.exec(geometry);
  if (!block) throw new Error('assets/brand/logo-geometry.js: no ARMS export found');
  const arms = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (arms.length !== 4) throw new Error(`ARMS declares ${arms.length} paths; the mark has four arms`);
  return arms;
}

/** The two gate leaves, read out of the `LEAF_L` / `LEAF_R` exports by name. */
export function canonicalLeaves() {
  const geometry = readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8');
  const pick = (name) => /'([^']+)'/.exec(new RegExp(`export const ${name} = ([^;]+);`).exec(geometry)?.[1] ?? '')?.[1];
  const left = pick('LEAF_L');
  const right = pick('LEAF_R');
  if (!left || !right) throw new Error('assets/brand/logo-geometry.js: LEAF_L / LEAF_R not found');
  return { left, right };
}

/**
 * Reconcile a set of paths against the canonical geometry module, so a keyframe
 * cannot be built from a logo file that has silently drifted from the identity.
 */
export function assertCanonical(file, paths) {
  // Read the ARMS export by name rather than filtering every quoted path in the
  // module: MICRO is a separate 24-unit redraw, and a heuristic that tried to
  // tell the two apart by coordinate would be guessing at the identity.
  const arms = canonicalArms();
  for (const arm of arms) {
    if (!paths.some((p) => p.d === arm)) {
      throw new Error(`${file}: canonical arm ${arm.slice(0, 24)}… is missing; the mark has drifted`);
    }
  }
  return { arms: arms.length, total: paths.length };
}

/**
 * The two gate leaves, as an x-extent. The closed mark meets at 23.2/24.8; the
 * open mark stands off at 21.6/26.4. GATE_TRAVEL in the geometry module is 1.6
 * units per leaf, and this is the assertion that the two keyframes actually
 * differ by that much rather than merely looking different.
 */
export function leafExtents(paths) {
  const leaves = paths.filter((p) => p.d.startsWith('M18.6 ') || p.d.startsWith('M29.4 '));
  if (leaves.length !== 2) return null;
  const inner = leaves.map((p) => {
    const xs = [...p.d.matchAll(/[ML]\s*([\d.]+)\s+[\d.]+/g)].map((m) => Number(m[1]));
    return p.d.startsWith('M18.6 ') ? Math.max(...xs) : Math.min(...xs);
  });
  return { left: inner[0], right: inner[1], aperture: Number((inner[1] - inner[0]).toFixed(4)) };
}
