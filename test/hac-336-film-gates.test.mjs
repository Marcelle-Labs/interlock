/**
 * Proves the HAC-336 film gate fails on the defects it exists to catch.
 *
 * A media gate is unusually easy to write and unusually hard to trust. Almost
 * everything it inspects — a digest, a duration, a run id — is correct on the
 * day it is written, so a check that silently stopped working would go on
 * printing PASS indefinitely. Each case below breaks exactly one property in a
 * copy of the repository and expects the gate to name it.
 *
 * The cases are chosen by consequence, not by coverage. The ones that matter
 * most are the four a judge could be misled by: the two proof classes bleeding
 * into each other, filmed evidence that is not the filmed evidence, a claim
 * escaping its ledger, and a cut that quietly runs past four minutes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * The gate reads across four issues' evidence, so the scratch copy carries all
 * of them. `scripts/` comes too: the naming grammar is a repository-wide
 * contract the builders import.
 */
const NEEDED = [
  'media/hac-336', 'media/hac-335', 'media/hac-334', 'media/hac-333',
  'experiments/hac-324', 'experiments/hac-330', 'experiments/hac-342', 'experiments/hac-343',
  'scripts', 'package.json',
];
const GATE = 'media/hac-336/bin/verify-film.mjs';
const CUT = 'media/hac-336/evidence/cut.json';
const FRAMES = 'media/hac-336/evidence/frame-manifest.json';
const RENDER = 'media/hac-336/evidence/render-manifest.json';
const INPUTS = 'media/hac-336/evidence/input-manifest.json';

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac336-pristine-'));
  for (const rel of NEEDED) cpSync(join(repoRoot, rel), join(pristine, rel), { recursive: true });
});
afterAll(() => {
  for (const d of [pristine, ...scratch]) rmSync(d, { recursive: true, force: true });
});

const run = (dir) => {
  const r = spawnSync(process.execPath, [join(dir, GATE)], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function perturbed(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'hac336-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  const api = {
    dir,
    json: (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')),
    writeJson: (f, o) => writeFileSync(join(dir, f), `${JSON.stringify(o, null, 2)}\n`),
    text: (f) => readFileSync(join(dir, f), 'utf8'),
    write: (f, s) => writeFileSync(join(dir, f), s),
  };
  mutate(api);
  return run(dir);
}

describe('the gate accepts the cut as assembled', () => {
  it('passes unmodified', () => {
    const r = run(pristine);
    expect(r.out).toContain('HAC-336 film gate PASS');
    expect(r.code).toBe(0);
  });
});

describe('the two proof classes cannot bleed into each other', () => {
  it('fails when Google Cloud material moves ahead of the proof-class reset', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      const cloud = cut.beats.findIndex((b) => b.proofClass === 'B');
      const reset = cut.beats.findIndex((b) => b.proofClass === 'transition');
      const [beat] = cut.beats.splice(cloud, 1);
      cut.beats.splice(reset, 0, beat);
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Google Cloud material appears before the proof-class reset/);
  });

  it('fails when the proof-class reset is removed entirely', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats = cut.beats.filter((b) => b.proofClass !== 'transition');
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/expected exactly one proof-class reset beat/);
  });

  it('fails when a filmed capture is relabelled as controlled local evidence', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats.find((b) => b.source.kind === 'capture').proofClass = 'A';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/presented under a proof class other than B/);
  });

  it('fails when the frozen reference run is named beside filmed footage', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      const beat = cut.beats.find((b) => b.proofClass === 'B');
      beat.narration += ' Recorded under run ilk-hac340-cloud-1786730369123.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/frozen reference run/);
  });
});

describe('filmed evidence has to be the filmed evidence', () => {
  it('fails when a capture frame cites a digest the capture manifest never promoted', () => {
    const r = perturbed((p) => {
      const frames = p.json(FRAMES);
      frames.frames.find((f) => f.kind === 'capture').sourceSha256 = 'a'.repeat(64);
      p.writeJson(FRAMES, frames);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/the capture manifest promoted/);
  });

  it('fails when the committed capture bytes no longer hash to the promoted digest', () => {
    const r = perturbed((p) => {
      p.write('experiments/hac-324/frames/scene-agent-traversal.png', 'not a capture');
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not the frame that was filmed/);
  });

  it('fails when a promoted scene is dropped from the cut without being recorded', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats = cut.beats.filter((b) => b.source.sceneId !== 'cloud-logging-correlation');
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/promoted capture scenes are absent from the cut/);
  });

  it('fails when a crop is widened in the cut but not in the rendered frame', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats.find((b) => b.source.kind === 'capture').source.crop.h += 40;
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/differs from the crop declared in the cut/);
  });
});

describe('claims cannot escape their ledger', () => {
  it('fails when a beat cites a claim row that does not exist', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].claims = ['CL-999'];
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/CL-999/);
  });

  it('fails when narration asserts a forbidden headline', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].narration = 'Interlock is 0% unsafe and prevents composition hazards.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/0% unsafe headline/);
  });

  it('fails when narration claims production readiness', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].narration = 'Interlock is production-ready today.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/production readiness was not tested/);
  });

  it('fails when narration implies Agent Runtime participated', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].narration = 'The traversal ran through Agent Runtime on Vertex AI.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Agent Runtime did not participate/);
  });

  it('fails when narration claims exactly-once execution', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].narration = 'The receipt gives exactly-once execution across restarts.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/exactly-once is not claimed/);
  });

  it('fails when a filmed-run claim row loses the evidence it points at', () => {
    const r = perturbed((p) => {
      const rec = p.json('experiments/hac-324/evidence/filmed-run.json');
      delete rec.protectedMutation.invariant.detail;
      p.writeJson('experiments/hac-324/evidence/filmed-run.json', rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no longer resolves/);
  });
});

describe('the bounded evaluation keeps its ablation control', () => {
  it('fails when the ablation beat is moved away from the comparison', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      const i = cut.beats.findIndex((b) => b.source.state === 'ablation');
      const [beat] = cut.beats.splice(i, 1);
      cut.beats.splice(cut.beats.length - 1, 0, beat);
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/one contiguous visual unit/);
  });

  it('fails when the ablation board loses an arm from the comparison', () => {
    const r = perturbed((p) => {
      const f = 'media/hac-336/masters/IL-PROOF-021-bounded-four-arm-comparison-ablation.svg';
      p.write(f, p.text(f).replace(/Per-target lock/g, 'Redacted'));
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/omits the Per-target lock arm/);
  });

  it('fails when the per-target lock credibility strip is removed', () => {
    const r = perturbed((p) => {
      const f = 'media/hac-336/masters/IL-PROOF-021-bounded-four-arm-comparison-ablation.svg';
      p.write(f, p.text(f).replace(/cross-target parallelized 4\/4/g, ''));
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/credibility strip/);
  });
});

describe('the four-minute ceiling is real', () => {
  it('fails when the holds add up past the ceiling', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].holdSeconds += 30;
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/over the 240s submission ceiling/);
  });

  it('fails when the encoded file no longer matches the derived timeline', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].holdSeconds += 5;
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/but the cut derives/);
  });
});

describe('the committed artifacts stay in step', () => {
  it('fails when the video is edited after the manifest was written', () => {
    const r = perturbed((p) => {
      const render = p.json(RENDER);
      render.video.sha256 = 'b'.repeat(64);
      p.writeJson(RENDER, render);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/does not match the digest in the render manifest/);
  });

  it('fails when a frame is rebuilt after the encode', () => {
    const r = perturbed((p) => {
      const frames = p.json(FRAMES);
      const board = frames.frames.find((f) => f.kind === 'board');
      board.sha256 = 'c'.repeat(64);
      p.writeJson(FRAMES, frames);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/has changed since the cut was encoded|does not match the frame manifest/);
  });

  it('fails when a declared input has moved under the manifest', () => {
    const r = perturbed((p) => {
      const inputs = p.json(INPUTS);
      inputs.inputs[0].sha256 = 'd'.repeat(64);
      p.writeJson(INPUTS, inputs);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/has changed since the manifest was derived/);
  });

  it('fails when a declared revision no longer matches the evidence that carries it', () => {
    const r = perturbed((p) => {
      const rec = p.json('experiments/hac-324/evidence/filmed-run.json');
      rec.correlationId = 'ilk-hac340-cloud-0000000000000';
      p.writeJson('experiments/hac-324/evidence/filmed-run.json', rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no longer holds it|has changed since the manifest was derived/);
  });

  it('fails when the captions drift from the narration', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats[0].narration = 'Interlock. A different sentence entirely, at the same length.';
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/does not match the narration in the cut/);
  });
});

describe('the opening still works muted', () => {
  it('fails when a beat in the first thirty seconds loses its muted reading', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      delete cut.beats.find((b) => b.mutedRead).mutedRead;
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/records no muted reading/);
  });
});

describe('the limitations act cannot be quietly deleted', () => {
  it('fails when the claim-boundary card is dropped from the cut', () => {
    const r = perturbed((p) => {
      const cut = p.json(CUT);
      cut.beats = cut.beats.filter((b) => b.source.assetId !== 'IL-PROOF-014');
      p.writeJson(CUT, cut);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/claim-boundary card is not in the cut/);
  });

  it('fails when the bounded-corpus statement is removed from the boards', () => {
    const r = perturbed((p) => {
      const f = 'media/hac-336/masters/IL-PROOF-022-evaluation-bounds-bounds.svg';
      p.write(f, p.text(f)
        .replace(/not a population estimate/g, 'a general result')
        .replace(/No confidence intervals/g, 'Broadly applicable'));
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/bounded-corpus statement/);
  });
});
