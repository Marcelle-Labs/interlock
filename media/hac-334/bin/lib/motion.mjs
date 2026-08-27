/**
 * A time axis for the display list.
 *
 * `draw.mjs` builds a deterministic picture. This builds a deterministic
 * picture *at a time*, which is the only thing a still suite was missing before
 * a cut needed motion that carries meaning rather than decoration.
 *
 * One rule shapes everything here: **the frame at t is a pure function of t.**
 * Not of elapsed wall clock, not of a previous frame, not of how the viewer
 * arrived. Scrubbing to 23.0 without playing 0..22.9 must produce the same
 * bytes as arriving there by playback, because an exported frame and a
 * scrubbed frame that disagree make a canonical still unfalsifiable — you can
 * no longer say which one the gate checked.
 *
 * The second rule is the split between the two kinds of track.
 *
 *   `stepTrack` carries **semantics**: WAITING, WITHHELD, APPLIED, ABSENT. It
 *   never interpolates, because there is no state half way between withheld and
 *   applied, and a renderer that could ask for one would be inventing a claim.
 *
 *   `numberTrack` carries **presentation**: a bar's fill, an edge's draw
 *   progress, an opacity. It interpolates freely, because nothing downstream
 *   reads a product fact off it.
 *
 * Keeping them in separate constructors is what stops the drift HAC-343 exists
 * to prevent: once evidence state can be inferred from the shape of an
 * animation, the animation has quietly become the record.
 *
 * Zero dependencies, matching `draw.mjs`. An easing library between frozen
 * evidence and a rendered frame buys a dozen curves and costs the guarantee
 * that two hosts agree on the frame.
 */

/* -- easing --------------------------------------------------------------- */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The whole curve vocabulary. Deliberately five entries.
 *
 * Every one is a closed form over [0,1], so a frame time reproduces exactly
 * rather than to within a solver's tolerance. `hold` is not decoration: it is
 * how an authored keyframe says "this value does not move yet" without the
 * author having to repeat the previous value at a second time.
 */
export const EASE = {
  linear: (p) => p,
  in: (p) => p * p * p,
  out: (p) => 1 - (1 - p) ** 3,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  hold: () => 0,
};

/* -- keyframe validation -------------------------------------------------- */

/**
 * Refuse an unsorted or duplicated keyframe list.
 *
 * Both failures produce a track that still evaluates — it just evaluates to the
 * wrong thing, silently, for one segment. Sorting the list here instead would
 * be worse: the author's intent for two keys at the same instant is genuinely
 * ambiguous, and guessing it is how a withheld bar ends up filled.
 */
function assertKeys(keys, label) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(`${label}: a track needs at least one keyframe`);
  }
  for (const [i, k] of keys.entries()) {
    if (typeof k.at !== 'number' || !Number.isFinite(k.at)) {
      throw new Error(`${label}: keyframe ${i} has a non-finite time`);
    }
    if (i > 0 && k.at <= keys[i - 1].at) {
      throw new Error(
        `${label}: keyframe ${i} at ${k.at} does not advance past ${keys[i - 1].at}. `
        + 'Keyframes are authored in order; two keys at one instant have no defined winner.',
      );
    }
  }
  return keys;
}

/** The index of the last key at or before `t`, or -1 when `t` precedes the first. */
function seek(keys, t) {
  let lo = 0;
  let hi = keys.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].at <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/* -- tracks --------------------------------------------------------------- */

/**
 * A semantic track. Discrete by construction.
 *
 * @param {{at:number,value:*}[]} keys
 * @param {string} label used in errors, so a bad track names itself
 */
export function stepTrack(keys, label = 'stepTrack') {
  assertKeys(keys, label);
  const at = (t) => keys[Math.max(0, seek(keys, t))].value;
  return { kind: 'step', keys, at, label };
}

/**
 * A presentation track. Interpolated between keys, clamped outside them.
 *
 * `ease` belongs to the key it *arrives at*, which reads the way an author
 * thinks: "get to 60 by 2.2, easing out".
 *
 * @param {{at:number,value:number,ease?:string}[]} keys
 */
export function numberTrack(keys, label = 'numberTrack') {
  assertKeys(keys, label);
  for (const k of keys) {
    if (typeof k.value !== 'number' || !Number.isFinite(k.value)) {
      throw new Error(`${label}: a numberTrack carries numbers; got ${JSON.stringify(k.value)}`);
    }
    if (k.ease !== undefined && !(k.ease in EASE)) {
      throw new Error(`${label}: unknown ease "${k.ease}" (have ${Object.keys(EASE).join(', ')})`);
    }
  }
  const at = (t) => {
    const i = seek(keys, t);
    if (i < 0) return keys[0].value;
    if (i >= keys.length - 1) return keys[keys.length - 1].value;
    const a = keys[i];
    const b = keys[i + 1];
    const span = b.at - a.at;
    const p = clamp01((t - a.at) / span);
    return a.value + (b.value - a.value) * EASE[b.ease ?? 'inOut'](p);
  };
  return { kind: 'number', keys, at, label };
}

/**
 * Evaluate a record of tracks at one instant.
 *
 * Returns a plain object, not a class: the result is data a renderer reads and
 * a gate can serialise, and nothing downstream should be able to ask it what
 * time it is.
 *
 * @param {Record<string, {at:(t:number)=>*}>} tracks
 * @param {number} t
 */
export function frameAt(tracks, t) {
  const out = {};
  for (const [name, track] of Object.entries(tracks)) out[name] = track.at(t);
  return out;
}

/* -- reduced motion ------------------------------------------------------- */

/**
 * The reduced-motion equivalent of a track set.
 *
 * Not "animation off". Disabling interpolation leaves every numeric track at
 * its *first* keyframe, which is the pre-state — a viewer who asked for less
 * motion would be shown bars that never rise and an outcome that never
 * resolves, and would take the scene to mean something it does not.
 *
 * So a numeric track collapses to a step track that adopts each segment's
 * **destination** the moment the segment opens. The scene is therefore always
 * in a settled, meaningful state, transitions are instantaneous, and the
 * semantics — concurrency, waiting, withholding, presence and absence — survive
 * unchanged because step tracks were already discrete and are passed through.
 */
export function settle(tracks) {
  const out = {};
  for (const [name, track] of Object.entries(tracks)) {
    if (track.kind === 'step') {
      out[name] = track;
      continue;
    }
    const keys = track.keys.map((k, i) => (
      i === 0 ? { at: k.at, value: k.value } : { at: track.keys[i - 1].at, value: k.value }
    ));
    // Collapsing can put two keys at one instant when a segment has zero-length
    // neighbours; keep the last authored intent for that instant.
    const merged = [];
    for (const k of keys) {
      if (merged.length && merged[merged.length - 1].at === k.at) merged[merged.length - 1] = k;
      else merged.push(k);
    }
    out[name] = stepTrack(merged, `${track.label} (settled)`);
  }
  return out;
}

/* -- sequence ------------------------------------------------------------- */

/** Round to the millisecond, so two derivations of one boundary cannot differ. */
const ms = (n) => Math.round(n * 1000) / 1000;

/**
 * Authored scene boundaries.
 *
 * The scenes are contiguous and are asserted to be: a gap would put a frame in
 * no scene, and an overlap would put one frame in two, and both are the kind of
 * defect that only shows up as a single wrong frame in an export nobody
 * re-watches at that timestamp.
 *
 * @param {{id:string,start:number,end:number}[]} scenes
 */
export function sequence(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('sequence: needs at least one scene');
  scenes.forEach((s, i) => {
    if (!(s.end > s.start)) throw new Error(`sequence: scene "${s.id}" does not advance (${s.start} -> ${s.end})`);
    if (i > 0 && ms(s.start) !== ms(scenes[i - 1].end)) {
      throw new Error(
        `sequence: scene "${s.id}" starts at ${s.start} but "${scenes[i - 1].id}" ended at ${scenes[i - 1].end}. `
        + 'Scenes are contiguous; a gap or an overlap is a frame with no owner or two.',
      );
    }
  });

  const duration = ms(scenes[scenes.length - 1].end);
  const boundaries = [ms(scenes[0].start), ...scenes.map((s) => ms(s.end))];

  /** The scene containing `t`. Right-open, so a boundary belongs to what follows. */
  const sceneAt = (t) => {
    if (t >= duration) return scenes[scenes.length - 1];
    for (const s of scenes) if (t >= s.start && t < s.end) return s;
    return scenes[0];
  };

  return {
    scenes,
    duration,
    boundaries,
    sceneAt,
    /** Time since the containing scene opened. Scene bodies author in local time. */
    localTime: (t) => ms(t - sceneAt(t).start),
  };
}

/**
 * Every frame time for a fixed-rate render.
 *
 * Computed from the index rather than accumulated, so frame 719 is exactly
 * 719/fps and not the sum of 719 additions of 1/fps.
 */
export function frameTimes(duration, fps) {
  if (!(fps > 0)) throw new Error('frameTimes: fps must be positive');
  const n = Math.round(duration * fps);
  return Array.from({ length: n }, (_, i) => ms(i / fps));
}

/**
 * The canonical stills for a sequence: the entry and the settled state of each
 * scene.
 *
 * Sampled `inset` past each boundary rather than on it. A still captured
 * exactly on a boundary is the first frame of the new scene, which is the least
 * informative instant it has, and it is also the one frame whose ownership a
 * rounding difference could flip.
 */
export function canonicalTimes(seq, { inset = 0.1, settle: settleAt = 0.15 } = {}) {
  const out = [];
  for (const s of seq.scenes) {
    // Two per scene, and both are needed. The entry still is what the scene
    // inherits; the settled still is what it establishes. A canonical set of
    // entry states alone would show a cut in which nothing has happened yet,
    // and would go green while every scene's actual claim went unrendered.
    out.push({ id: `${s.id}-in`, t: ms(s.start + inset) });
    const settled = ms(s.end - settleAt);
    if (settled > ms(s.start + inset)) out.push({ id: `${s.id}-out`, t: settled });
  }
  return out;
}
