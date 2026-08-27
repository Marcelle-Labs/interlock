/**
 * One persistent geometric world, resolved once.
 *
 * The thirty-second cut is not eight slides. It is one world replayed under
 * changing conditions, and the only way to make a viewer believe that is to
 * make it structurally true: alpha is at the same x in S8 as it was in S1
 * because both read this table, not because two layouts happened to agree.
 *
 * Everything here is frozen at module load and handed out by value. A scene
 * that wanted to move a target would have to change this file, which is the
 * point — "same geometry, different coordination state" is a property the code
 * enforces rather than a claim the storyboard makes.
 *
 * The scale is the storyboard's: **3 px per reservation unit, bars and gauge
 * alike**. That single number is why the ceiling rule lands where it does and
 * why the overflow band is the size it is; a gauge drawn to its own scale would
 * let 140 look like whatever the layout needed.
 */

/* -- canvas --------------------------------------------------------------- */

export const W = 1920;
export const H = 1080;

/** The clean-plate margins. No rail, no footer, no manifest — those are annotation. */
export const M = { left: 80, right: 80, top: 44, foot: 40 };
export const CONTENT = Object.freeze({ x0: M.left, x1: W - M.right, y0: M.top, y1: H - M.foot });

/** The type floor. Every value and label on a plate is mono at or above this. */
export const TYPE_FLOOR = 24;

/* -- the scale ------------------------------------------------------------ */

/** Pixels per reservation unit. The one number the whole world is built from. */
export const SCALE = 3;

/** The common baseline. Target bars, the gauge and the outcome numeral all sit on it. */
export const BASE_Y = 720;

/** Value -> the top edge of a bar standing on the baseline. */
export const topOf = (value) => BASE_Y - value * SCALE;
/** Value -> a bar's height. */
export const heightOf = (value) => value * SCALE;

/* -- the policy frame ----------------------------------------------------- */

/**
 * Where an observation boundary is drawn when a scene draws one.
 *
 * Fixed, not fitted. A boundary that resized itself to its contents would grow
 * between S5 and S6, and a boundary that grows is a boundary that has been
 * given something new to observe — the exact implication S5 exists to refuse.
 */
export const FRAME = Object.freeze({ x: 112, y: 440, w: 976, h: 424 });
export const FRAME_LABEL_Y = 478;

/* -- target columns ------------------------------------------------------- */

export const BAR_W = 132;

/** Canonical target positions. Read by every scene that draws the strip. */
export const COLUMNS = Object.freeze({
  alpha: 292,
  beta: 534,
  gamma: 776,
});

export const ORDER = Object.freeze(['alpha', 'beta', 'gamma']);

/** The horizontal centre of a target's column. */
export const centreOf = (name) => COLUMNS[name] + BAR_W / 2;

/**
 * Caption rows under the baseline, reserved whether or not a scene fills them.
 *
 * Reserved rather than packed: if the rows moved when a scene had nothing to
 * say in one of them, the bars would appear to shift between scenes and the
 * persistent world would read as a redrawn one.
 */
export const ROWS = Object.freeze({ name: 764, delta: 800, state: 836 });

/* -- the coupling edge ---------------------------------------------------- */

/** Where a relationship between alpha and beta resolves, when it resolves. */
export const EDGE = Object.freeze({ y: 508, stemTo: topOf(60) });

/* -- the gauge ------------------------------------------------------------ */

/**
 * The ceiling gauge, and the rule.
 *
 * The rule is drawn from `ruleX0` — left of the gauge column — out to the right
 * margin, so it reads as a property of the field rather than of the gauge. In
 * S5 that matters twice over: the rule has to be visibly outside every drawn
 * boundary, and the boundary must not be seen to reach for it.
 */
export const GAUGE = Object.freeze({
  x: 1280,
  w: 126,
  ruleX0: 1216,
  ruleX1: CONTENT.x1,
  captionX: 1452,
  outcomeX: 1452,
});

/** The y of the ceiling rule, for a given ceiling value. */
export const ruleY = (ceiling) => topOf(ceiling);

/* -- fixed text bands ----------------------------------------------------- */

/**
 * The path legend: stem to full path, once per plate.
 *
 * Stacked rather than strung across the top band. Three full paths at the 24px
 * type floor measure 1813px against 1760px of content width, so the horizontal
 * row the storyboard drew in a narrower mono face cannot be honoured in a
 * base-14 one without either dropping under the floor or letting two paths
 * collide. Stacking keeps the floor and makes the collision impossible rather
 * than unlikely.
 */
export const LEGEND_Y = 76;
export const LEGEND_STEP = 34;

/**
 * The note band, below the policy frame.
 *
 * Below rather than inside: a scene-level qualification that crossed the
 * boundary rule would read as something the boundary contains, and in S5 and
 * S6 that is precisely the confusion the plate is built to avoid.
 */
export const NOTES = Object.freeze([900, 936]);

/** The single large sentence. One line, one baseline, every plate. */
export const SCENE_LINE_Y = 1000;

/* -- replay framing (S2 only) --------------------------------------------- */

/**
 * S2 shows one scenario twice, so it cannot use the canonical columns — two
 * alphas cannot both be at x=292. It keeps what actually carries the meaning:
 * the same baseline and the same 3 px scale, so a 60 in a replay frame is
 * exactly as tall as the 60 the viewer just watched overflow.
 */
export const REPLAY = Object.freeze({
  frames: [
    { x: 112, w: 470, cols: { alpha: 168, beta: 288, gamma: 408 } },
    { x: 618, w: 470, cols: { alpha: 674, beta: 794, gamma: 914 } },
  ],
  barW: 84,
  y: FRAME.y,
  h: FRAME.h,
});

/* -- contention framing (S3 only) ----------------------------------------- */

/**
 * S3 is about one key, so it draws intent blocks rather than the target strip.
 * The lock frame still opens over alpha's canonical column, which is what keeps
 * "this is the same alpha" true across the cut.
 */
export const CONTENTION = Object.freeze({
  frame: { x: 232, y: FRAME.y, w: 620, h: 340 },
  blockW: 232,
  blockH: 120,
  first: { x: COLUMNS.alpha, y: 500 },
  second: { x: COLUMNS.alpha, y: 640 },
  /** Caption band, below the frame rather than inside it. */
  notes: [830, 866, 902],
});

/* -- guards --------------------------------------------------------------- */

/**
 * Assert that a scene has not moved the world.
 *
 * Called by the gate rather than by the renderer: the renderer reading these
 * constants is already unable to move a target, and this exists so a *future*
 * scene that starts computing its own positions fails a test instead of quietly
 * shipping a world that drifts by four pixels a scene.
 */
export function assertWorldInvariants() {
  const problems = [];
  if (SCALE !== 3) problems.push(`scale is ${SCALE}, the storyboard froze 3 px per reservation unit`);
  if (topOf(130) !== ruleY(130)) problems.push('the ceiling rule does not use the target scale');
  if (heightOf(60) !== 180) problems.push(`a 60 bar is ${heightOf(60)}px, expected 180`);
  const xs = ORDER.map((n) => COLUMNS[n]);
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i] - xs[i - 1] < BAR_W) problems.push(`${ORDER[i]} overlaps ${ORDER[i - 1]}`);
  }
  if (FRAME.y + FRAME.h > ROWS.state + 32) problems.push('the policy frame does not enclose its caption rows');

  // The load-bearing one. S5 claims the ceiling is not an input to the
  // coordination decision, and the plate has to be able to carry that claim
  // without a caption: the rule sits on the unframed field, above every
  // boundary any scene draws. If a layout change ever brings the rule inside
  // the frame, the picture starts asserting the opposite of the record.
  if (ruleY(130) >= FRAME.y) {
    problems.push(
      `the ceiling rule at y=${ruleY(130)} is inside the policy frame (top ${FRAME.y}); `
      + 'environmental truth must stay outside every observation boundary',
    );
  }
  return problems;
}
