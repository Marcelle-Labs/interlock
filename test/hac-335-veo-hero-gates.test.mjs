/**
 * Proves the Veo hero gate fails on the defects it exists to catch.
 *
 * The hero sequence is the one asset in this repository with no frozen record
 * behind it: nothing can be recomputed to check that a generated clip still says
 * what it said yesterday. Its gate is therefore load-bearing in a way the others
 * are not, and a gate that passes because the thing it checks is absent would be
 * worse than no gate at all — it would report green over an empty package.
 *
 * Each case below perturbs exactly one invariant and expects a non-zero exit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEEDED = [
  'README.md',
  'scripts/export-naming.mjs',
  'assets',
  'media/hac-335/veo-hero',
  'media/hac-333/scene-manifest.json',
  'media/hac-335/devpost/01-short-description.md',
];

const GATE = 'media/hac-335/veo-hero/bin/verify-veo-hero.mjs';
const KEYFRAMES = 'media/hac-335/veo-hero/keyframes';
const EVIDENCE = 'media/hac-335/veo-hero/evidence';
const START_PNG = `${KEYFRAMES}/IL-MOT-030-veo-hero-start-1920x1080.png`;

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'veohero-pristine-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'veohero-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  mutate({
    dir,
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
    write: (rel, s) => writeFileSync(join(dir, rel), s),
    remove: (rel) => unlinkSync(join(dir, rel)),
    json: (rel, fn) => {
      const p = join(dir, rel);
      const d = JSON.parse(readFileSync(p, 'utf8'));
      fn(d);
      writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
    },
  });
  return run(dir);
}

/** The suite is worthless unless the unperturbed package actually passes. */
describe('the gate agrees with a clean package', () => {
  it('passes as STAGED before any generation has run', () => {
    const r = run(pristine);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/PASS \(DETERMINISTIC\)/);
  });
});

describe('the keyframes are the identity', () => {
  it('fails when a keyframe is missing', () => {
    const r = perturbed(({ remove }) => remove(START_PNG));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/keyframe start is missing/);
  });

  it('fails when a keyframe\'s bytes move under its digest', () => {
    const r = perturbed(({ dir }) => {
      const p = join(dir, START_PNG);
      const b = readFileSync(p);
      b[b.length - 1] ^= 0xff;
      writeFileSync(p, b);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has changed since the manifest was written/);
  });

  it('fails when a keyframe is not 1920x1080', () => {
    // Rewrite the PNG's IHDR width and re-declare it, so the header check is
    // reached rather than short-circuited by the digest check.
    const r = perturbed(({ dir, json }) => {
      const p = join(dir, START_PNG);
      const b = readFileSync(p);
      b.writeUInt32BE(1280, 16);
      writeFileSync(p, b);
      const digest = createHash('sha256').update(b).digest('hex');
      json(`${EVIDENCE}/keyframe-manifest.json`, (d) => {
        const row = d.keyframes.find((k) => k.role === 'start');
        row.sha256 = digest;
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is 1280x1080; the contract is 1920x1080/);
  });

  it('fails when the source logo changes after the frames were built', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/keyframe-manifest.json`, (d) => {
        d.keyframes.find((k) => k.role === 'start').sourceSha256 = '0'.repeat(64);
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no longer draw the canonical mark/);
  });

  it('fails when the gate does not travel by exactly GATE_TRAVEL x 2', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/keyframe-manifest.json`, (d) => {
        d.keyframes.find((k) => k.role === 'end').leaves.aperture = 3.0;
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/the aperture opens by/);
  });

  it('fails when the end frame is not the canonical open geometry', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/keyframe-manifest.json`, (d) => {
        d.keyframes.find((k) => k.role === 'end').sourceAsset = 'assets/logo/interlock-state-4.svg';
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/the authorized-open state is/);
  });

  it('fails when typography is handed to the model', () => {
    const r = perturbed(({ read, write }) => {
      const rel = `${KEYFRAMES}/IL-MOT-030-veo-hero-start-1920x1080.svg`;
      write(rel, read(rel).replace('</svg>', '<text x="10" y="10">Interlock</text></svg>'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/contains live text/);
  });
});

describe('the end card restates approved language and nothing else', () => {
  it('fails when the sentence stops being authorised upstream', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/end-card-manifest.json`, (d) => {
        d.thesis = 'Interlock makes multi-agent systems safe.';
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/may not outlive it/);
  });

  it('fails when the end-card export cannot be resolved', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/end-card-manifest.json`, (d) => {
        d.export.file = 'media/hac-335/veo-hero/exports/does-not-exist.png';
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/end-card export cannot be resolved/);
  });

  it('fails when the lockup changes after the card was built', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/end-card-manifest.json`, (d) => { d.lockupSourceSha256 = '0'.repeat(64); });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has changed since the end card was built/);
  });
});

describe('the sequence claims nothing', () => {
  it('fails when a run identity is smuggled into the prompt', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/prompt.json`, (d) => {
        d.prompt += ' Depicting run ilk-hac340-cloud-1787536029323.';
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/carries no run identity/);
  });

  it('fails when a frozen figure is smuggled into the prompt', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/prompt.json`, (d) => { d.prompt += ' The bound holds at 120 <= 130.'; });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/frozen figure/);
  });

  it('fails when the package stops declaring itself a non-evidence synthesis', () => {
    const r = perturbed(({ json }) => {
      json(`${EVIDENCE}/prompt.json`, (d) => { d.claimBoundary.isEvidence = true; });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/a synthesis, not proof/);
  });
});

describe('credentials are never committed', () => {
  for (const [what, body] of [
    ['a Google API key', `{"note":"AIza${'a'.repeat(35)}"}`],
    ['an OAuth access token', `{"note":"ya29.${'A'.repeat(40)}"}`],
    ['a service-account private key', '{"private_key": "x"}'],
    ['a bearer header value', '{"h":"Authorization: Bearer abc.def"}'],
  ]) {
    it(`fails on ${what}`, () => {
      const r = perturbed(({ write }) => write(`${EVIDENCE}/leak.json`, body));
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(/Credentials are never committed/);
    });
  }
});

describe('the deterministic sequence carries the semantics', () => {
  const SEQ = `${EVIDENCE}/sequence-manifest.json`;

  it('fails when the sequence manifest is missing', () => {
    const r = perturbed(({ remove }) => remove(SEQ));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/sequence-manifest\.json is missing/);
  });

  it('fails when the rendered MP4 is absent', () => {
    const r = perturbed(({ json }) => {
      json(SEQ, (d) => { d.video.file = 'media/hac-335/veo-hero/exports/gone.mp4'; });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/deterministic sequence is absent/);
  });

  it('fails when the MP4 changed after it was rendered', () => {
    const r = perturbed(({ json }) => { json(SEQ, (d) => { d.video.sha256 = '0'.repeat(64); }); });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has changed since it was rendered/);
  });

  it('fails when an audio track appears', () => {
    const r = perturbed(({ json }) => { json(SEQ, (d) => { d.video.audio = 'aac'; }); });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no audio track/);
  });

  it('fails when the hold stops being byte-identical', () => {
    const r = perturbed(({ json }) => { json(SEQ, (d) => { d.holdIsByteIdentical = false; }); });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/holdIsByteIdentical/);
  });

  it('fails when the hold is quantized DOWN below the authored duration', () => {
    const r = perturbed(({ json }) => {
      json(SEQ, (d) => { d.hold.frames = 16; d.holdFrames = 16; d.hold.renderedMs = 666.7; });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/shorter than the authored|frames are needed to reach/);
  });

  it('fails when the recorded hold spans more than one distinct frame', () => {
    const r = perturbed(({ json }) => {
      json(SEQ, (d) => {
        const t0 = d.timeline.find((x) => x.phase === 'hold');
        const f = Math.ceil((t0.startMs / 1000) * d.video.fps) + 1;
        d.frameDigests[f] = '1'.repeat(64);
      });
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/distinct frame digests/);
  });

  it('fails when the manifest drifts from the motion stylesheet', () => {
    const r = perturbed(({ json }) => { json(SEQ, (d) => { d.authority.authorizationMs = 999; }); });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--mot-p4-authorization/);
  });

  it('fails when the manifest drifts from GATE_TRAVEL', () => {
    const r = perturbed(({ json }) => { json(SEQ, (d) => { d.authority.gateTravelPerLeaf = 2.4; }); });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/GATE_TRAVEL/);
  });
});

describe('a generated candidate carries complete provenance', () => {
  const ledger = (rounds) => JSON.stringify({
    manifestId: 'IL-MOT-030-generation-ledger', rounds,
  }, null, 2);

  const complete = (over = {}) => ({
    round: 1,
    tier: 'fast',
    billable: true,
    backend: 'vertex-ai',
    model: 'veo-3.1-fast-generate-001',
    region: 'us-central1',
    resolution: '1080p',
    durationSeconds: 8,
    aspectRatio: '16:9',
    seed: 20260824,
    promptSha256: 'unset',
    negativePromptSha256: 'unset',
    startFrameSha256: 'unset',
    endFrameSha256: 'unset',
    requestedAt: '2026-08-24T00:00:00.000Z',
    operationId: 'projects/p/locations/us-central1/operations/1',
    fileSha256: '0'.repeat(64),
    status: 'SUCCEEDED',
    ...over,
  });

  it('fails when a round omits a required provenance field', () => {
    const r = perturbed(({ write }) => {
      const row = complete();
      delete row.operationId;
      write(`${EVIDENCE}/generation-ledger.json`, ledger([row]));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/missing required provenance field `operationId`/);
  });

  it('fails when a recorded round no longer matches the prompt on disk', () => {
    const r = perturbed(({ write }) => {
      write(`${EVIDENCE}/generation-ledger.json`, ledger([complete({ promptSha256: '1'.repeat(64) })]));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/generated from a different prompt/);
  });

  it('fails when a round is selected without an adjudication', () => {
    const r = perturbed(({ write }) => {
      write(`${EVIDENCE}/generation-ledger.json`,
        ledger([complete({ adjudication: { selected: true } })]));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/won without a recorded reason/);
  });

  it('fails when the winner has no silent integration copy', () => {
    const r = perturbed(({ write }) => {
      write(`${EVIDENCE}/generation-ledger.json`, ledger([complete({
        adjudication: { selected: true, why: 'best pause legibility', rejectionChecklist: [] },
      })]));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/HAC-336's cut is muted/);
  });

  it('fails when two candidates are marked selected', () => {
    const r = perturbed(({ write }) => {
      const win = { selected: true, why: 'w', rejectionChecklist: [], integrationCopy: { file: 'x', hasAudioStream: false } };
      write(`${EVIDENCE}/generation-ledger.json`, ledger([
        complete({ adjudication: win }),
        complete({ round: 2, adjudication: win }),
      ]));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/exactly one candidate wins/);
  });

  it('reports rather than crashes when a selected round names no file', () => {
    const r = perturbed(({ write }) => {
      write(`${EVIDENCE}/generation-ledger.json`, ledger([complete({
        adjudication: { selected: true, why: 'w', rejectionChecklist: [] },
      })]));
    });
    expect(r.code).toBe(1);
    expect(r.out).not.toMatch(/ERR_INVALID_ARG_TYPE|TypeError/);
    expect(r.out).toMatch(/names no candidate file/);
  });
});
