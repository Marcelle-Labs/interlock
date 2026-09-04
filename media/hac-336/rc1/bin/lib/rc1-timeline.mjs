/**
 * The one place RC1's arithmetic lives.
 *
 * Builder, caption writer, audio mixer and gate all derive here rather than each
 * doing the subtraction. Two rules the shape of this file enforces:
 *
 *   1. A hold is DERIVED from the measured narration it must contain, never
 *      authored. A hand-set hold is a hold nobody re-checked, and the first
 *      re-generated line leaves it stale and still green.
 *   2. Crossfades overlap, so assembled length is not the sum of the holds.
 *      Each transition consumes `transitionSeconds` shared between the two
 *      beats it joins, hence `beats - 1`.
 */

const ms = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {object} cut  the authored EDL
 * @param {object} narration  the derived narration manifest
 */
export function timeline(cut, narration) {
  const x = cut.transitionSeconds;
  const durationOf = (lineId) => {
    const row = narration.lines.find((l) => l.lineId === lineId);
    if (!row) throw new Error(`narration manifest has no line ${lineId}. Re-run build-narration.mjs.`);
    return row.durationSeconds;
  };

  // Pass 1: each beat's internal layout and therefore its hold.
  const shaped = cut.beats.map((beat) => {
    // A moving-image source owns its own length; narration is fitted INTO it,
    // never the other way round. 'live-capture' belongs here as much as 'video':
    // the continuous take is the evidence, and trimming it to suit a voice-over
    // is exactly the edit Devpost's Proof of Action criterion refuses.
    const FIXED_KINDS = new Set(['video', 'live-capture']);
    const fixed = FIXED_KINDS.has(beat.source.kind) ? beat.source.fixedDurationSeconds : null;
    const lines = [];
    let prevEnd = null;
    for (const line of beat.lines) {
      const dur = durationOf(line.lineId);
      const offset = line.atSeconds >= 0
        ? line.atSeconds
        : (prevEnd === null
          ? (() => { throw new Error(`${line.lineId}: a gap-relative atSeconds needs a preceding line`); })()
          : prevEnd + Math.abs(line.atSeconds));
      lines.push({ lineId: line.lineId, offset: ms(offset), duration: dur, end: ms(offset + dur) });
      prevEnd = offset + dur;
    }
    const spokenEnd = lines.length ? Math.max(...lines.map((l) => l.end)) : 0;
    // A beat may buy extra silence after its last line, so filmed evidence and
    // the close can sit on screen without being talked over. The tail is still
    // added to a DERIVED spoken end, never substituted for one.
    const tail = beat.tailSecondsOverride ?? cut.tailSeconds;
    const hold = fixed !== null ? fixed : ms(spokenEnd + tail);
    if (fixed !== null && spokenEnd > fixed) {
      throw new Error(`${beat.beatId}: narration runs to ${ms(spokenEnd)}s inside a fixed ${fixed}s source. Shorten the lines.`);
    }
    return { beat, lines, holdSeconds: hold, spokenEndSeconds: ms(spokenEnd), tailSeconds: tail };
  });

  // Pass 2: absolute placement on the assembled wall clock.
  const beats = [];
  let cursor = 0;
  shaped.forEach((s, i) => {
    const start = ms(cursor);
    const end = ms(start + s.holdSeconds);
    beats.push({
      beatId: s.beat.beatId,
      index: i,
      act: s.beat.act,
      proofClass: s.beat.proofClass,
      startSeconds: start,
      endSeconds: end,
      holdSeconds: s.holdSeconds,
      tailSeconds: s.tailSeconds,
      // The window in which this beat is the only thing on screen. A caption cue
      // starting inside a crossfade would be legible over the wrong frame.
      captionStart: ms(i === 0 ? start : start + x),
      captionEnd: ms(i === shaped.length - 1 ? end : end - x),
      lines: s.lines.map((l) => ({
        lineId: l.lineId,
        startSeconds: ms(start + l.offset),
        endSeconds: ms(start + l.end),
        durationSeconds: l.duration,
      })),
    });
    cursor = end - x;
  });

  const holdSum = ms(shaped.reduce((a, s) => a + s.holdSeconds, 0));
  const totalSeconds = ms(holdSum - x * (shaped.length - 1));
  const spoken = ms(beats.flatMap((b) => b.lines).reduce((a, l) => a + l.durationSeconds, 0));
  return {
    beats,
    holdSum,
    transitions: shaped.length - 1,
    totalSeconds,
    spokenSeconds: spoken,
    silenceSeconds: ms(totalSeconds - spoken),
    speechDensity: Math.round((spoken / totalSeconds) * 1000) / 10,
  };
}

export function vttTime(seconds) {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const milli = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}
export const srtTime = (seconds) => vttTime(seconds).replace('.', ',');
export const clock = (seconds) => {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
};
