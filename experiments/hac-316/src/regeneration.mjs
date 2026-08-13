/**
 * Did regenerating a producer change anything it writes?
 *
 * ## The hole this closes
 *
 * REQ-067 asks that regenerating Preflight V2 be a no-op, because V2 is
 * immutable once committed. The check captured the bytes of
 * `preflight.v2.json` before and after the producer ran — but the producer
 * writes **two** files, and `fixture.json` was not captured. An in-place change
 * to the fixture was therefore invisible *within the very run that caused it*,
 * which is the worst place for it to be invisible: the check that exists to
 * catch drift was standing next to the drift and looking the other way.
 *
 * `fixture.json` is not incidental. It carries the canonical fixture digest that
 * REQ-010 compares against `INITIAL_STATE`, the partition projection REQ-011
 * checks, and the genesis revisions REQ-019 recomputes. A producer that quietly
 * rewrote it would move the ground under four other requirements.
 *
 * So the rule here is the general one: compare **everything the producer
 * writes**, and name each file that moved. A comparison that covers a subset of
 * the outputs is a comparison that can be satisfied by writing to the other
 * ones.
 */

/**
 * Which of the captured files changed.
 *
 * `before` and `after` are `{name: Buffer}`. A file that appeared or vanished
 * counts as changed — a producer that stops writing one of its outputs has
 * changed its output just as much as one that rewrites it.
 *
 * @returns {string[]} the names that differ, in the order given.
 */
export function regenerationChanges(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return names.filter((name) => {
    const left = before[name];
    const right = after[name];
    if (left === undefined || right === undefined) return left !== right;
    return !Buffer.from(left).equals(Buffer.from(right));
  });
}
