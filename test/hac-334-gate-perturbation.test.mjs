/**
 * Proves the HAC-334 visual gate fails, by injecting the defect each check
 * exists to catch.
 *
 * A gate nobody has seen fail is a gate nobody knows works. Each case below
 * builds a throwaway copy of the artifacts the gate reads, corrupts exactly one
 * thing, and asserts the gate refuses it with the reason that matters. The
 * pristine copy is asserted to pass first, so a case that fails for an
 * unrelated reason cannot be mistaken for the gate working.
 *
 * The corruptions are semantic, not cosmetic: an arm total that disagrees with
 * the frozen record, a treatment and a perturbation swapped, wrong-audience
 * promoted to a cloud result, a fabricated runtime source link. Checking that a
 * string is present somewhere would pass all of these.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The subset of the repository the gate reads, in its real relative layout. */
const NEEDED = [
  'scripts/export-naming.mjs',
  'media/hac-334',
  'media/hac-341/evidence/view-model.json',
  'media/hac-333/scene-manifest.json',
  'experiments/hac-330/evidence/arms.json',
  'experiments/hac-330/evidence/results.json',
  'experiments/hac-342/evidence/cloud-run.public.json',
  'experiments/hac-342/evidence/publication-bindings.json',
];

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac334-pristine-'));
  for (const rel of NEEDED) {
    cpSync(join(repoRoot, rel), join(pristine, rel), { recursive: true });
  }
});

afterAll(() => {
  for (const dir of [pristine, ...scratch]) rmSync(dir, { recursive: true, force: true });
});

const run = (dir) => {
  const r = spawnSync(process.execPath, [join(dir, 'media/hac-334/bin/verify-visuals.mjs')], {
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

/** A fresh copy of the artifacts, corrupted by `mutate`, then handed to the gate. */
function perturbed(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'hac334-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });

  const modelPath = join(dir, 'media/hac-334/evidence/visual-model.json');
  const api = {
    dir,
    model: JSON.parse(readFileSync(modelPath, 'utf8')),
    save() { writeFileSync(modelPath, JSON.stringify(this.model, null, 2)); },
    asset(id) { return this.model.assets.find((a) => a.id === id); },
    mastersDir: join(dir, 'media/hac-334/masters'),
    exportsDir: join(dir, 'media/hac-334/exports'),
    master(fragment) {
      const f = readdirSync(this.mastersDir).find((n) => n.includes(fragment));
      if (!f) throw new Error(`no master matching ${fragment}`);
      return join(this.mastersDir, f);
    },
  };
  mutate(api);
  return run(dir);
}

describe('the gate accepts the suite as built', () => {
  it('passes on unmodified artifacts', () => {
    const r = run(pristine);
    expect(r.out).toContain('HAC-334 visual suite verified');
    expect(r.code).toBe(0);
  });
});

describe('class A values must track the frozen arms', () => {
  it('fails when an arm total drifts from the frozen record', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.arms[0].expression = '141 > 130';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/arm baseline expression .* != frozen/);
  });

  it('fails when the treatment decision is replaced', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.arms[1].decision = 'ALLOW_PARALLEL';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/arm treatment decision ALLOW_PARALLEL != frozen WITHHOLD_SERIALIZE/);
  });

  it('fails when treatment and perturbation are swapped', () => {
    const r = perturbed((a) => {
      const c = a.asset('IL-PROOF-011').composition;
      c.comparison.reverse();
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not read treatment then perturbed/);
  });

  it('fails when the checks label drifts from the recomputed count', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.checks.value = '25/25';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/checks label 25\/25 != recomputed 24\/24/);
  });

  it('fails when the joint bound drifts', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.bound.value = 999;
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/joint bound 999 != frozen 130/);
  });

  it('fails when the baseline arm acquires a decision', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.arms[0].decision = 'WITHHOLD_SERIALIZE';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/baseline arm carries a decision/);
  });
});

describe('class B values must track the published packet', () => {
  it('fails when the observed alpha drifts', () => {
    const r = perturbed((a) => {
      a.asset('IL-DIAG-011').composition.observed.value = 'alpha=46';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/observed value != frozen alpha=45/);
  });

  it('fails when a negative control drifts', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-013').composition.cloudControls[1].status = 403;
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/negative controls 403\/403\/403 != frozen 403\/401\/403/);
  });

  it('fails when wrong-audience is promoted to a cloud control', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-013').composition.cloudControls[1].label = 'Valid wrong-audience token';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/wrong-audience appears as a cloud control label/);
  });

  it('fails when EXECUTED and OBSERVED collapse into one state', () => {
    const r = perturbed((a) => {
      const c = a.asset('IL-PROOF-012').composition;
      c.stages.find((s) => s.stage === 'OBSERVATION').value = 'EXECUTED';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/EXECUTED and OBSERVED collapsed/);
  });

  it('fails when the receipt digest does not match the packet', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-012').composition.receiptDigest.value = `sha256:${'0'.repeat(64)}`;
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/receipt digest does not match the packet/);
  });
});

describe('the two proof classes must not merge', () => {
  it('fails when a class A board acquires cloud apparatus', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-010').composition.observed = { value: 'alpha=45', source: 'invented' };
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/class A but carries cloud apparatus/);
  });

  it('fails when a class B board acquires the local counterfactual', () => {
    const r = perturbed((a) => {
      a.asset('IL-DIAG-011').composition.smuggled = 'WITHHOLD_SERIALIZE';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/class B but carries the HAC-330 counterfactual/);
  });

  it('fails when one board renders both runs as a single chain', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-PROOF-010-causal-counterfactual-run');
      writeFileSync(f, readFileSync(f, 'utf8').replace('</svg>', '<text x="10" y="10">alpha=45</text></svg>'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/renders the local counterfactual and the cloud observation on one board/);
  });
});

describe('language that would overstate the evidence', () => {
  it('fails when AUTHORIZED appears as a claim', () => {
    const r = perturbed((a) => {
      a.asset('IL-PROOF-012').composition.stages[0].detail = 'AUTHORIZED by joint review';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/AUTHORIZED lifecycle state/);
  });

  it('fails when the observer is described as unable to authorize', () => {
    const r = perturbed((a) => {
      const c = a.asset('IL-PROOF-012').composition;
      c.stages.find((s) => s.stage === 'OBSERVATION').note = 'Witnessed by a party that cannot authorize.';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/observer-cannot-authorize/);
  });

  it('fails when a board renders an overstated claim', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-PROOF-013-fail-closed');
      writeFileSync(f, readFileSync(f, 'utf8').replace('</svg>', '<text x="10" y="10">The path is UNBYPASSABLE</text></svg>'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/renders unbypassable/);
  });

  it('keeps non-claims sayable', () => {
    // The inverse guard: the disclaimers already on the boards name AUTHORIZED
    // and exactly-once, and must not be read as assertions of them.
    const r = run(pristine);
    expect(r.code).toBe(0);
    const svg = readFileSync(
      join(pristine, 'media/hac-334/masters',
        readdirSync(join(pristine, 'media/hac-334/masters')).find((f) => f.includes('IL-PROOF-012'))),
      'utf8',
    );
    expect(svg).toMatch(/exactly-once/);
    expect(svg).toMatch(/AUTHORIZED/);
  });
});

describe('provenance', () => {
  it('fails when an unevidenced deployment revision surfaces', () => {
    const r = perturbed((a) => {
      a.asset('IL-DIAG-012').composition.evidencedRevision.value = 'interlock-hac340-agent-00002-s5d';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/unevidenced deployment revision interlock-hac340-agent-00002/);
  });

  it('fails when runtimeSourceUrl is fabricated', () => {
    const r = perturbed((a) => {
      a.model.publicEvidence.runtimeSourceUrl = { state: 'https://github.com/Marcelle-Labs/interlock/tree/ae6d0d3' };
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/runtimeSourceUrl was populated/);
  });

  it('fails when an evidence link resolves through a mutable branch', () => {
    const r = perturbed((a) => {
      a.model.publicEvidence.cloudEvidenceUrl =
        'https://github.com/Marcelle-Labs/interlock/blob/main/experiments/hac-342/evidence/cloud-run.public.json';
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cloudEvidenceUrl is not pinned to an immutable commit SHA/);
  });

  it('fails when the source packet is claimed as published', () => {
    const r = perturbed((a) => {
      a.model.publicEvidence.sourcePacketPublished = true;
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/private commitment/);
  });
});

describe('the HAC-319 shell stays empty', () => {
  it('fails when a mark is plotted', () => {
    const r = perturbed((a) => {
      a.asset('IL-DIAG-013').composition.marks = [{ regime: 'Regime 1', value: 0.82 }];
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/shell has acquired a plotted mark/);
  });

  it('fails when a metric value is rendered', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-DIAG-013-evaluation-shell');
      writeFileSync(f, readFileSync(f, 'utf8').replace('</svg>', '<text x="10" y="10">SPR 0.82</text></svg>'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/renders a HAC-319 metric value/);
  });

  it('fails when the unbound shell declares a distributable derivative', () => {
    const r = perturbed((a) => {
      a.asset('IL-DIAG-013').exports.push({ format: 'png1920', ext: 'png', width: 1920, height: 1080, slug: 'evaluation-shell' });
      a.save();
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/shell declares a raster or print derivative/);
  });
});

describe('derivatives must correspond to their masters', () => {
  it('fails when a master changes without re-exporting its rasters', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-PROOF-010-causal-counterfactual-run');
      writeFileSync(f, `${readFileSync(f, 'utf8')}\n<!-- edited -->`);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is stale: .* has changed since it was rendered/);
  });

  it('fails when a derivative has no master', () => {
    const r = perturbed((a) => {
      unlinkSync(a.master('IL-PROOF-014-claim-boundary'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/declared export .* was never produced|which is missing/);
  });

  it('fails when an export name breaks the frozen grammar', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-DIAG-010-conceptual');
      cpSync(f, join(a.mastersDir, 'IL-PROOF-010-Causal-Counterfactual.svg'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is not a legal export name|lowercase kebab/);
  });

  it('fails when an undeclared file appears beside the masters', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-DIAG-010-conceptual');
      cpSync(f, join(a.mastersDir, 'IL-DIAG-099-invented-board.svg'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is not a registry row|does not declare it/);
  });
});

describe('accessibility', () => {
  it('fails when a board loses its text equivalent', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-DIAG-011-cloud-participation-run');
      writeFileSync(f, readFileSync(f, 'utf8').replace(/<desc id="board-desc">[^<]*<\/desc>/, ''));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has no text equivalent for its geometry/);
  });

  it('fails when a board loses its non-claim rail', () => {
    const r = perturbed((a) => {
      const f = a.master('IL-PROOF-014-claim-boundary');
      writeFileSync(f, readFileSync(f, 'utf8').replaceAll('Non-claim:', 'Note:'));
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/carries no non-claim rail/);
  });
});
