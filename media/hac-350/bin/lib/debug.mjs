/**
 * The review overlay. Never exported.
 *
 * Everything the storyboard tags as annotation lives here: scene id, timestamp,
 * the semantic state the scene is asserting, the evidence binding behind the
 * figures on the plate, the motion phase, and the frame index. A reviewer needs
 * all of it. A judge must not see any of it.
 *
 * The separation is enforced twice over — this module is imported only by
 * `render-frames.mjs` under `--debug`, which writes to `review/` and refuses to
 * touch `frames/`, and `verify-replay.mjs` fails if any annotation vocabulary
 * reaches a production master. One control would be a convention; two make it
 * a property.
 */
import { label, rect, line, text, asciify, N, PAPER, INK } from './plate.mjs';
import { W, H, CONTENT } from './world.mjs';

const SOURCE = { S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S7: 'S7', S8: 'S8' };

export function overlay(plate, bindings, opts = {}) {
  const b = bindings.scenes[SOURCE[plate.scene.id]] ?? null;
  const dark = plate.background === INK;
  const fg = dark ? N[30] : N[50];
  const rows = [
    `scene ${plate.scene.id} - ${plate.scene.name}`,
    `t = ${plate.t.toFixed(3)}s  [${plate.scene.start} -> ${plate.scene.end}]`,
    `relationship = ${plate.state.relationship}`,
    b?.source ? `binding: ${b.source}` : 'binding: none (scene asserts no recorded figure)',
    b?.total !== undefined ? `recorded total ${b.total}  holds=${b.holds}` : 'no recorded total on this plate',
    opts.reduced ? 'REDUCED MOTION EQUIVALENT' : 'motion: authored tracks',
  ];
  return [
    rect(0, 0, W, 4, { fill: '#ff00aa' }),
    rect(0, H - 4, W, 4, { fill: '#ff00aa' }),
    rect(CONTENT.x1 - 640, 20, 640, rows.length * 28 + 24, { fill: dark ? INK : PAPER, stroke: '#ff00aa', width: 1 }),
    text(CONTENT.x1 - 620, 46, 'ANNOTATION - REVIEW ONLY - NOT FOR EXPORT', {
      size: 16, mono: true, fill: '#ff00aa', tracking: 1.4,
    }),
    ...rows.map((r, i) => text(CONTENT.x1 - 620, 78 + i * 28, asciify(r), {
      size: 16, mono: true, fill: fg,
    })),
  ];
}
