/**
 * The one place the cut's arithmetic lives.
 *
 * Builder, caption writer and gate all derive timings here rather than each
 * doing the subtraction. HAC-333 learned the same lesson on a 30-second
 * storyboard: a duration read from a `total` field is a duration nobody
 * recomputed, and the first edit that changes a hold leaves it stale and green.
 *
 * Crossfades overlap, so the assembled length is not the sum of the holds. Each
 * transition consumes `transitionSeconds` of wall clock shared between the two
 * beats it joins, which is why the subtraction is `beats - 1` and not `beats`.
 */

/** Round to the millisecond, so floating point cannot make two derivations differ. */
const ms = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{beats:{beatId:string,holdSeconds:number}[],transitionSeconds:number}} cut
 * @returns {{beats:object[],totalSeconds:number,holdSum:number,transitions:number}}
 */
export function timeline(cut) {
  const x = cut.transitionSeconds;
  const beats = [];
  let cursor = 0;
  for (const [i, beat] of cut.beats.entries()) {
    const start = ms(cursor);
    const end = ms(start + beat.holdSeconds);
    beats.push({
      beatId: beat.beatId,
      index: i,
      startSeconds: start,
      endSeconds: end,
      holdSeconds: beat.holdSeconds,
      // The window in which this beat is the only thing on screen. A caption cue
      // that started inside a crossfade would be legible over the wrong frame.
      captionStart: ms(i === 0 ? start : start + x),
      captionEnd: ms(i === cut.beats.length - 1 ? end : end - x),
    });
    cursor = end - x;
  }
  const holdSum = ms(cut.beats.reduce((a, b) => a + b.holdSeconds, 0));
  return {
    beats,
    holdSum,
    transitions: cut.beats.length - 1,
    totalSeconds: ms(holdSum - x * (cut.beats.length - 1)),
  };
}

/** `H:MM:SS.mmm`, the WebVTT timestamp shape. */
export function vttTime(seconds) {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const milli = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

/** `HH:MM:SS,mmm`, the SubRip shape. Same instant, different punctuation. */
export const srtTime = (seconds) => vttTime(seconds).replace('.', ',');

/** `M:SS`, for a human-readable scene map. */
export function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
