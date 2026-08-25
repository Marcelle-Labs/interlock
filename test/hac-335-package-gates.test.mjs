/**
 * Proves the HAC-335 judge-package gate fails on the defects it exists to
 * catch.
 *
 * The risk this suite addresses is specific to a synthesis issue. HAC-335
 * authors almost no new facts — it arranges facts other issues froze — so its
 * gate could easily degenerate into constants agreeing with themselves. Each
 * case below perturbs one side of a binding and expects the gate to notice:
 * sometimes the evidence, sometimes the prose, sometimes the registry. A check
 * that only ever reads one of those cannot fail here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEEDED = [
  'README.md',
  'scripts/export-naming.mjs',
  'assets',
  'media/hac-335',
  'media/hac-334/evidence',
  'media/hac-334/exports',
  'media/hac-333/scene-manifest.json',
  'media/hac-341',
  'experiments/hac-330/evidence/arms.json',
  'experiments/hac-330/evidence/results.json',
  'experiments/hac-342/evidence/cloud-run.public.json',
  'experiments/hac-342/evidence/publication-bindings.json',
  'experiments/hac-342/evidence/runtime-source-snapshot.json',
  // The frozen source of every HAC-343 figure the package renders.
  'experiments/hac-343/evidence/judge-export.json',
];

const GATE = 'media/hac-335/bin/verify-package.mjs';

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac335-pristine-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'hac335-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  const api = {
    dir,
    read: (f) => readFileSync(join(dir, f), 'utf8'),
    write: (f, s) => writeFileSync(join(dir, f), s),
    json: (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')),
    writeJson: (f, o) => writeFileSync(join(dir, f), `${JSON.stringify(o, null, 2)}\n`),
    edit(f, from, to) {
      const s = readFileSync(join(dir, f), 'utf8');
      if (!s.includes(from)) throw new Error(`anchor not found in ${f}: ${String(from).slice(0, 60)}`);
      writeFileSync(join(dir, f), s.replace(from, to));
    },
    append: (f, s) => writeFileSync(join(dir, f), `${readFileSync(join(dir, f), 'utf8')}\n${s}\n`),
    rm: (f) => unlinkSync(join(dir, f)),
  };
  mutate(api);
  return run(dir);
}

describe('the gate accepts the package as built', () => {
  it('passes unmodified', () => {
    const r = run(pristine);
    expect(r.out).toContain('HAC-335 judge package verified');
    expect(r.code).toBe(0);
  });
});

describe('prose asset references', () => {
  /**
   * The real defect: the README pointed at the IL-COCK-010 capture with the
   * wrong crop height in its filename (1440x566 rather than 1440x774) after
   * the capture was retaken. Every other gate passed, because nothing
   * compared a prose link against the filesystem.
   */
  it('fails when a README image points at a file that does not exist', () => {
    const r = perturbed((p) =>
      p.edit('README.md',
        'IL-COCK-010-run-local-treatment-1440x774-runhac330local.png',
        'IL-COCK-010-run-local-treatment-1440x566-runhac330local.png'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/which does not exist/);
  });

  it('fails when a diagram export is renamed without updating the prose', () => {
    const r = perturbed((p) => p.append('README.md', '![diagram](media/hac-334/exports/nope.png)'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/nope\.png, which does not exist/);
  });

  it('accepts remote images, anchors, and non-asset links it does not police', () => {
    const r = perturbed((p) =>
      p.append('README.md',
        'See [remote](https://example.com/x.png), [here](#claim-boundary) '
        + 'and [the docs](./docs/some/guide.md).'));
    expect(r.out).toContain('HAC-335 judge package verified');
    expect(r.code).toBe(0);
  });
});

describe('proof-class separation', () => {
  it('fails when one sentence merges the two runs', () => {
    const r = perturbed((p) =>
      p.append('README.md', 'HAC-330 and HAC-340 together form a single end-to-end cloud experiment.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/without separating them/);
  });

  it('fails when copy chains the local decision to the cloud observation', () => {
    const r = perturbed((p) =>
      p.append('README.md', 'The run went WITHHOLD_SERIALIZE and then observed alpha=45 downstream.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not one run/);
  });

  it('fails when a capture claims a proof class its URL contradicts', () => {
    const r = perturbed((p) => {
      const m = p.json('media/hac-335/evidence/capture-manifest.json');
      m.captures[0].proofClass = 'B';
      p.writeJson('media/hac-335/evidence/capture-manifest.json', m);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/but its URL says/);
  });
});

describe('unsupported states and identities', () => {
  it('fails when AUTHORIZED appears without a negation', () => {
    const r = perturbed((p) => p.append('README.md', 'The final state is AUTHORIZED once the receipt lands.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/AUTHORIZED appears without a negation/);
  });

  it('fails when Agent Runtime is described as participating', () => {
    const r = perturbed((p) => p.append('README.md', 'Requests are brokered through Agent Runtime before Interlock sees them.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Agent Runtime.*without a disclaimer/);
  });

  it('fails when wrong-audience is presented as a cloud control', () => {
    const r = perturbed((p) => p.append('README.md', 'A wrong-audience token is rejected by the deployed proxy.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/wrong-audience described without marking it local parity/);
  });

  it('fails when an unevidenced deployment revision is named', () => {
    const r = perturbed((p) => p.append('README.md', 'Agent revision interlock-hac340-agent-00004-abc served the request.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/unevidenced deployment revision/);
  });
});

describe('numeric drift, from either side', () => {
  it('fails when the frozen cloud control changes', () => {
    const r = perturbed((p) => {
      const c = p.json('experiments/hac-342/evidence/cloud-run.public.json');
      c.controls.forgedHeaderStatus = 200;
      p.writeJson('experiments/hac-342/evidence/cloud-run.public.json', c);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/forgedHeaderStatus is 200, expected 403/);
  });

  it('fails when the frozen check count drifts below 24', () => {
    const r = perturbed((p) => {
      const res = p.json('experiments/hac-330/evidence/results.json');
      res.checks.pop();
      p.writeJson('experiments/hac-330/evidence/results.json', res);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/checks are 23\/23/);
  });

  it('fails when the observed cloud value drifts from the packet', () => {
    const r = perturbed((p) => {
      const c = p.json('experiments/hac-342/evidence/cloud-run.public.json');
      c.observation.state.services.alpha = 46;
      p.writeJson('experiments/hac-342/evidence/cloud-run.public.json', c);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/alpha=46/);
  });

  it('fails when the prose drops a frozen comparison', () => {
    const r = perturbed((p) => {
      // Every judge-facing surface loses the treatment comparison at once —
      // the check reads them as one corpus, so a partial edit proves nothing.
      const files = [
        'README.md',
        ...readdirSync(join(p.dir, 'media/hac-335/devpost'))
          .filter((f) => f.endsWith('.md'))
          .map((f) => `media/hac-335/devpost/${f}`),
      ];
      for (const f of files) p.write(f, p.read(f).split('120 <= 130').join('120 within bound'));
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no longer states the frozen comparison "120 <= 130"/);
  });
});

describe('public evidence integrity', () => {
  it('fails when an evidence URL points at a branch instead of a commit', () => {
    const r = perturbed((p) =>
      p.edit(
        'README.md',
        'https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/cloud-run.public.json',
        'https://github.com/Marcelle-Labs/interlock/blob/main/experiments/hac-342/evidence/cloud-run.public.json',
      ));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not pinned to a commit/);
  });

  it('fails when judge copy cites an evidence URL the registry does not carry', () => {
    const r = perturbed((p) =>
      p.append(
        'README.md',
        'See https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/somewhere-else.json',
      ));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/absent from the asset registry/);
  });

  it('fails when a URL is fabricated for the unpublished runtime source', () => {
    const r = perturbed((p) =>
      p.append(
        'README.md',
        'Runtime source: https://github.com/Marcelle-Labs/interlock/tree/ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a',
      ));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/fabricates a URL for the unpublished runtimeSourceSha/);
  });

  it('fails when the source packet is described as reader-recomputable', () => {
    const r = perturbed((p) =>
      p.append('README.md', 'You can recompute sourcePacketSha256 yourself from the published bytes.'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/describes sourcePacketSha256 as recomputable/);
  });

  it('fails when runtimeSourceSha and evidencePublicationSha collapse', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      reg.publicEvidence.runtimeSourceSha = reg.publicEvidence.evidencePublicationSha;
      p.writeJson('media/hac-335/evidence/asset-registry.json', reg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/collapsed into one value/);
  });
});

describe('the HAC-343 evaluation stays bound and bounded', () => {
  /* The gate used to prove the evaluation was absent. It now proves every
     figure is the frozen one and that no figure travels alone, so each rule
     below is exercised by breaking exactly one of those properties. */

  it('fails when a rendered count is not a frozen judge-export value', () => {
    const r = perturbed((p) => p.edit('README.md', '| Interlock | 0/2 | 2/2 |', '| Interlock | 0/7 | 2/2 |'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/0\/7, which is not a frozen HAC-343 display value/);
  });

  it('fails when Panel 1 is shown without the evidence ablation', () => {
    const r = perturbed((p) =>
      p.edit('README.md', '| Interlock + coupling evidence removed | 2/2 |', ''));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/without the evidence-ablation condition/);
  });

  it('fails when the A3 credibility strip is dropped', () => {
    const r = perturbed((p) =>
      p.edit('README.md', 'parallelised cross-target pairs 4/4', 'parallelised cross-target pairs'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/A3 credibility figure/);
  });

  it('fails when the comparison is shown without its corpus bound', () => {
    const r = perturbed((p) => p.edit('README.md', 'one frozen sixteen-scenario corpus', 'a corpus'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/without stating the corpus it is bounded to/);
  });

  it('fails when copy claims Interlock is 0% unsafe', () => {
    const r = perturbed((p) => p.append('README.md', '\n\nIn practice Interlock is 0% unsafe.\n'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/0% unsafe/);
  });

  it('fails when copy claims Interlock is safer than locking', () => {
    const r = perturbed((p) => p.append('README.md', '\n\nInterlock is safer than locking.\n'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/safer than locking/);
  });

  it('fails when copy claims statistical significance', () => {
    const r = perturbed((p) => p.append('README.md', '\n\nThe difference is statistically significant.\n'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/statistical significance/);
  });

  it('fails when the superseded "no SPR exists" claim is reintroduced', () => {
    const r = perturbed((p) => p.append('README.md', '\n\nNo SPR value exists in this package.\n'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/asserts no SPR value exists/);
  });

  it('fails when HAC-319 proper enters the judge registry', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      reg.assets.push({ assetId: 'IL-DIAG-013', exports: [], claimIds: [] });
      p.writeJson('media/hac-335/evidence/asset-registry.json', reg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/IL-DIAG-013 is in the judge-facing registry/);
  });

  it('fails when the judge sequence points at the unbound HAC-319 shell', () => {
    const r = perturbed((p) => {
      const seq = p.json('media/hac-335/evidence/judge-sequence.json');
      seq.steps[1].supportingAssets = ['IL-DIAG-013'];
      p.writeJson('media/hac-335/evidence/judge-sequence.json', seq);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/points at the unbound HAC-319 shell/);
  });
});

describe('assets, naming and staleness', () => {
  it('fails when a derivative goes stale relative to the registry', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      reg.assets[0].exports[0].sha256 = '0'.repeat(64);
      p.writeJson('media/hac-335/evidence/asset-registry.json', reg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/registered export is stale/);
  });

  it('fails when a registered export is missing from disk', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      p.rm(reg.assets[0].exports[0].file);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/missing on disk/);
  });

  it('fails when an export filename breaks the frozen naming contract', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      reg.assets[0].exports[0].file = 'media/hac-334/exports/IL-PROOF-010-causal-counterfactual-5s-1280x720-runhac330local.png';
      p.writeJson('media/hac-335/evidence/asset-registry.json', reg);
    });
    expect(r.code).toBe(1);
    // `5s` is exactly the variant HAC-332 does not accept, and HAC-334 recorded
    // the discrepancy rather than widening the vocabulary.
    expect(r.out).toMatch(/naming contract|missing on disk/);
  });

  it('fails when a Devpost screenshot cites an unregistered asset', () => {
    const r = perturbed((p) => {
      const s = p.json('media/hac-335/devpost/screenshot-order.json');
      s.screenshots[0].assetId = 'IL-PROOF-099';
      p.writeJson('media/hac-335/devpost/screenshot-order.json', s);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/absent from the registry/);
  });

  it('fails when a capture is left out of the registry', () => {
    const r = perturbed((p) => {
      const reg = p.json('media/hac-335/evidence/asset-registry.json');
      reg.assets = reg.assets.filter((a) => a.assetId !== 'IL-COCK-012');
      p.writeJson('media/hac-335/evidence/asset-registry.json', reg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/IL-COCK-012 is absent from the registry/);
  });
});

describe('claim ledger completeness', () => {
  it('fails when a cited claim id is not in the ledger', () => {
    const r = perturbed((p) => {
      const seq = p.json('media/hac-335/evidence/judge-sequence.json');
      seq.steps[0].claimIds.push('CL-999');
      p.writeJson('media/hac-335/evidence/judge-sequence.json', seq);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/CL-999, absent from the claim ledger/);
  });

  it('fails when a claim loses its proof source', () => {
    const r = perturbed((p) => {
      const l = p.json('media/hac-335/evidence/claim-ledger.json');
      delete l.claims[1].proofSource;
      p.writeJson('media/hac-335/evidence/claim-ledger.json', l);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/has no proof source/);
  });

  it('fails when a frozen non-claim is dropped from the ledger', () => {
    const r = perturbed((p) => {
      const l = p.json('media/hac-335/evidence/claim-ledger.json');
      l.claims = l.claims.filter((c) => !/Agent Gateway/.test(c.text));
      p.writeJson('media/hac-335/evidence/claim-ledger.json', l);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/frozen non-claim: Agent Gateway/);
  });

  it('fails on an unknown claim classification', () => {
    const r = perturbed((p) => {
      const l = p.json('media/hac-335/evidence/claim-ledger.json');
      l.claims[0].classification = 'PROBABLY FINE';
      p.writeJson('media/hac-335/evidence/claim-ledger.json', l);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/unknown classification/);
  });
});

describe('identity survives both themes', () => {
  it('fails when a judge surface embeds a currentColor SVG', () => {
    const r = perturbed((p) =>
      p.edit(
        'README.md',
        'assets/logo/interlock-lockup-horizontal-black.svg',
        'assets/logo/interlock-lockup-horizontal.svg',
      ));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/root fill is currentColor/);
  });

  it('fails when a judge surface embeds a missing SVG', () => {
    const r = perturbed((p) =>
      p.edit(
        'README.md',
        'assets/logo/interlock-lockup-horizontal-black.svg',
        'assets/logo/interlock-lockup-nonexistent.svg',
      ));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/embeds a missing SVG/);
  });
});

describe('sequence order is the argument', () => {
  it('fails when architecture is placed before the causal result', () => {
    const r = perturbed((p) => {
      const seq = p.json('media/hac-335/evidence/judge-sequence.json');
      const arch = seq.steps.find((s) => s.stepId === 'seq.architecture');
      const causal = seq.steps.find((s) => s.stepId === 'seq.causal-proof');
      [arch.order, causal.order] = [causal.order, arch.order];
      p.writeJson('media/hac-335/evidence/judge-sequence.json', seq);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/architecture before the causal result|not contiguously ordered/);
  });

  it('fails when the proof-class reset stops separating the two classes', () => {
    const r = perturbed((p) => {
      const seq = p.json('media/hac-335/evidence/judge-sequence.json');
      const reset = seq.steps.find((s) => s.stepId === 'seq.proof-class-reset');
      const cloudStep = seq.steps.find((s) => s.stepId === 'seq.cloud-participation');
      [reset.order, cloudStep.order] = [cloudStep.order, reset.order];
      p.writeJson('media/hac-335/evidence/judge-sequence.json', seq);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/reset between the causal proof and cloud participation|not contiguously ordered/);
  });

  it('fails when the cockpit is promoted to the Devpost thumbnail', () => {
    const r = perturbed((p) => {
      const s = p.json('media/hac-335/devpost/screenshot-order.json');
      s.thumbnail.assetId = 'IL-COCK-010';
      p.writeJson('media/hac-335/devpost/screenshot-order.json', s);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/verification surface, not the hero/);
  });

  it('fails when the hero stops being the causal master', () => {
    const r = perturbed((p) => {
      const seq = p.json('media/hac-335/evidence/judge-sequence.json');
      seq.steps[0].primaryAsset = 'IL-DIAG-012';
      p.writeJson('media/hac-335/evidence/judge-sequence.json', seq);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/hero is not IL-PROOF-010/);
  });
});

/**
 * Capture freshness.
 *
 * `capturedFromSha` was recorded and never compared to anything, so editing the
 * cockpit after a capture left four stale screenshots in the judge package with
 * no mechanical signal. These cases perturb the *render sources* rather than the
 * manifest, which is the direction that actually happens: someone improves the
 * cockpit and forgets the frames.
 */
describe('cockpit captures cannot silently go stale', () => {
  const MANIFEST = 'media/hac-335/evidence/capture-manifest.json';

  it('fails when the cockpit changes without a recapture', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '<title>', '<title>changed ');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cockpit render sources changed since these captures were taken/);
  });

  it('fails when the view model changes without a recapture', () => {
    const r = perturbed((a) => {
      const m = a.json('media/hac-341/evidence/view-model.json');
      m.runs.local.editorial.verdict = `${m.runs.local.editorial.verdict} `;
      a.writeJson('media/hac-341/evidence/view-model.json', m);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cockpit render sources changed/);
  });

  it('fails when a shared identity token changes without a recapture', () => {
    const r = perturbed((a) => {
      a.append('assets/tokens/colors.css', '/* nudged */');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cockpit render sources changed/);
  });

  it('fails when the arm derivation changes without a recapture', () => {
    const r = perturbed((a) => {
      a.append('media/hac-341/lib/arm-view.mjs', '/* nudged */');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cockpit render sources changed/);
  });

  it('fails when the recorded digest is removed', () => {
    const r = perturbed((a) => {
      const m = a.json(MANIFEST);
      delete m.captureSourceDigest;
      a.writeJson(MANIFEST, m);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/records no captureSourceDigest/);
  });

  it('fails when the digest is edited to agree with itself', () => {
    const r = perturbed((a) => {
      const m = a.json(MANIFEST);
      m.captureSourceDigest = 'f'.repeat(64);
      a.writeJson(MANIFEST, m);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cockpit render sources changed/);
  });

  it('fails when the declared source coverage is narrowed', () => {
    const r = perturbed((a) => {
      const m = a.json(MANIFEST);
      m.captureSourceFiles = m.captureSourceFiles.filter((f) => !f.endsWith('cockpit.html'));
      a.writeJson(MANIFEST, m);
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/capture source coverage narrowed/);
  });

  it('fails when Devpost still names a previous cockpit capture', () => {
    const r = perturbed((a) => {
      const order = a.json('media/hac-335/devpost/screenshot-order.json');
      const shot = order.screenshots.find((s) => s.assetId === 'IL-COCK-010');
      shot.file = 'media/hac-335/captures/IL-COCK-010-run-local-treatment-1440x566-runhac330local.png';
      a.writeJson('media/hac-335/devpost/screenshot-order.json', order);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/uses stale IL-COCK-010 file/);
  });
});
