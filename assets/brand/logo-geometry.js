/**
 * The Interlock mark — canonical geometry, repository-native.
 *
 * Ported verbatim from the frozen HAC-332 design system
 * (`components/brand/Logo.jsx`, `LOGO_GEOMETRY`). These numbers ARE the mark:
 * any change here is a change to the identity, not a refactor. They are
 * published as data rather than as a component so that a plain HTML surface,
 * a diagram renderer and a motion asset all animate the same paths instead of
 * each redrawing them.
 *
 * The executable surfaces inline this geometry rather than importing it at
 * runtime — a judge-facing frame must render with scripting disabled. The
 * identity gate reconciles what they inlined against this file, so the two
 * cannot drift apart silently.
 */

/** Four outer arms, on a 48-unit grid. */
export const ARMS = [
  'M2.889 6 L9.111 6 L17.2 14.089 L17.2 20.311 Z',
  'M45.111 6 L38.889 6 L30.8 14.089 L30.8 20.311 Z',
  'M2.889 42 L9.111 42 L17.2 33.911 L17.2 27.689 Z',
  'M45.111 42 L38.889 42 L30.8 33.911 L30.8 27.689 Z',
];

/** The two gate leaves. These are the only parts that move. */
export const LEAF_L = 'M18.6 16.2 L23.2 19.4 L23.2 28.6 L18.6 31.8 Z';
export const LEAF_R = 'M29.4 16.2 L24.8 19.4 L24.8 28.6 L29.4 31.8 Z';

/** The 24-unit redraw, for use at or below 12px. Not a scaled 48-grid mark. */
export const MICRO = [
  'M0.672 3.5 L6.328 3.5 L9.4 6.572 L9.4 12.228 Z',
  'M23.328 3.5 L17.672 3.5 L14.6 6.572 L14.6 12.228 Z',
  'M0.672 20.5 L6.328 20.5 L9.4 17.428 L9.4 11.772 Z',
  'M23.328 20.5 L17.672 20.5 L14.6 17.428 L14.6 11.772 Z',
  'M9.4 6 L11 6 L11 18 L9.4 18 Z',
  'M14.6 6 L13 6 L13 18 L14.6 18 Z',
];

/** How far each leaf travels when the gate opens, in grid units. */
export const GATE_TRAVEL = 1.6;

export const GRID = 48;

/**
 * Lockup proportions, from the frozen component. `size` is the mark's height in
 * px; the wordmark and the gap are derived from it, never set independently.
 */
export const LOCKUP = {
  horizontal: { wordScale: 0.71, gapScale: 0.29 },
  stacked: { wordScale: 0.54, gapScale: 0.2 },
};

/** The wordmark is live text, so it needs the local Geist face to be correct. */
export const WORDMARK = { text: 'Interlock', weight: 500, tracking: '-0.03em' };

export const LOGO_GEOMETRY = { GRID, ARMS, LEAF_L, LEAF_R, MICRO, GATE_TRAVEL, LOCKUP, WORDMARK };
