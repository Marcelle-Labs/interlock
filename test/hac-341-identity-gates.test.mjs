/**
 * Proves the identity and evidence-panel gates fail on the defects they exist
 * to catch.
 *
 * Two of these guard corrections made in this pass, so they matter more than
 * usual. The identity gate exists because the mark, the typefaces and a cited
 * logo asset were all missing at once and nothing noticed. The panel gate was
 * *amended* here: it used to require `showModal()`, which protected an
 * implementation choice that turned out to be the wrong one — a modal panel
 * makes L1 inert and its backdrop dims the causal column the panel exists to
 * explain. The new invariant is stated directly, so it needs its own proof that
 * it still bites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEEDED = [
  'scripts/check-identity.mjs',
  'assets',
  'media/hac-341',
  'media/hac-333',
  'experiments/hac-330/evidence/arms.json',
  'experiments/hac-330/evidence/results.json',
  'experiments/hac-342/evidence/cloud-run.public.json',
  'experiments/hac-342/evidence/publication-bindings.json',
  // The cockpit gate re-reads the HAC-343 artifacts the comparison cites and
  // refuses a comparison that is not what they produce, so a scratch copy
  // without them is not a copy of this repository.
  'experiments/hac-343/evidence',
  // The cockpit gate reads the HAC-343 verifier and the workflow to confirm
  // every cited artifact is covered — the derived judge export by being
  // reproduced in CI, the rest by the packet verifier.
  'experiments/hac-343/bin',
  '.github',
];

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac341-pristine-'));
  for (const rel of NEEDED) cpSync(join(repoRoot, rel), join(pristine, rel), { recursive: true });
});
afterAll(() => { for (const d of [pristine, ...scratch]) rmSync(d, { recursive: true, force: true }); });

const run = (dir, script) => {
  const r = spawnSync(process.execPath, [join(dir, script)], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function perturbed(mutate, script = 'scripts/check-identity.mjs') {
  const dir = mkdtempSync(join(tmpdir(), 'hac341-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  const api = {
    dir,
    read: (f) => readFileSync(join(dir, f), 'utf8'),
    write: (f, s) => writeFileSync(join(dir, f), s),
    edit(f, from, to) {
      const s = readFileSync(join(dir, f), 'utf8');
      if (!s.includes(from)) throw new Error(`anchor not found in ${f}: ${from.slice(0, 50)}`);
      writeFileSync(join(dir, f), s.replace(from, to));
    },
    rm: (f) => unlinkSync(join(dir, f)),
  };
  mutate(api);
  return run(dir, script);
}

describe('the gates accept the repository as built', () => {
  it('identity boundary passes unmodified', () => {
    const r = run(pristine, 'scripts/check-identity.mjs');
    expect(r.out).toContain('PASS identity boundary');
    expect(r.code).toBe(0);
  });

  it('cockpit contract passes unmodified', () => {
    const r = run(pristine, 'media/hac-341/bin/verify-cockpit.mjs');
    expect(r.out).toContain('HAC-341 cockpit verified');
    expect(r.code).toBe(0);
  });
});

describe('the canonical mark cannot be lost or approximated', () => {
  it('fails when a surface returns to a CSS-rectangle mark', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html',
        '<span class="word">Interlock</span>',
        '<span class="word">Inter<i></i>lock</span>');
      a.edit('media/hac-341/cockpit.html',
        '.brand .mark{display:block;flex:none}',
        '.brand i{width:8px;height:19px;border:2px solid red}');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/synthesising the mark from CSS/);
  });

  it('fails when the canonical geometry drifts in a surface', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html',
        'M2.889 6 L9.111 6 L17.2 14.089 L17.2 20.311 Z',
        'M2.000 6 L9.111 6 L17.2 14.089 L17.2 20.311 Z');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not draw the canonical mark/);
  });

  it('fails when a ported logo file is edited without a recorded revision', () => {
    const r = perturbed((a) => {
      a.edit('assets/logo/interlock-symbol.svg', 'M2.889', 'M2.111');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has changed since it was harvested/);
  });

  it('fails when a canonical asset disappears', () => {
    const r = perturbed((a) => a.rm('assets/logo/interlock-lockup-horizontal.svg'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is not in the repository/);
  });

  it('fails when a scene manifest cites a logo asset that is absent', () => {
    const r = perturbed((a) => {
      a.rm('assets/logo/interlock-lockup-horizontal.svg');
    });
    expect(r.code).not.toBe(0);
    // Both the registry row and SB-00's citation break; SB-00 is the one that
    // regressed silently last time.
    expect(r.out).toMatch(/SB-00 cites|is not in the repository/);
  });
});

describe('the typefaces stay local', () => {
  it('fails when a font CDN import appears', () => {
    const r = perturbed((a) => {
      a.edit('assets/tokens/fonts.css', '@font-face {',
        '@import url("https://fonts.googleapis.com/css2?family=Geist");\n@font-face {');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/references a font CDN/);
  });

  it('fails when a local @font-face declaration is removed', () => {
    const r = perturbed((a) => {
      a.edit('assets/tokens/fonts.css', 'font-family: "Geist Mono"', 'font-family: "Nope Mono"');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/declares no @font-face for Geist Mono/);
  });

  it('fails when a vendored face no longer matches its recorded digest', () => {
    const r = perturbed((a) => {
      a.write('assets/fonts/geist-variable.woff2', 'not a font');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not match the upstream digest/);
  });

  it('fails when font provenance is dropped from the harvest record', () => {
    const r = perturbed((a) => {
      a.edit('assets/HARVEST.md', 'a73329da8fc62afc917f796555202e4997f79b7c', 'unknown');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not record font provenance/);
  });

  it('fails when a surface stops resolving the shared identity authority', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-333/storyboard.html', '"../../assets/styles.css"', '"./local.css"');
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not link the shared identity authority/);
  });
});

describe('the evidence panel preserves causal context', () => {
  const gate = 'media/hac-341/bin/verify-cockpit.mjs';

  it('fails when the panel is opened modally', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', "drawer.dataset.open = 'true';",
        "drawer.showModal();\n  drawer.dataset.open = 'true';");
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/opens modally; L1 causal context is made inert/);
  });

  it('fails when a backdrop is drawn over the causal column', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '.drawer[data-open="false"]{visibility:hidden}',
        '.drawer::backdrop{background:rgba(0,0,0,.42)}');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/draws a backdrop over the causal column/);
  });

  it('fails when the panel claims aria-modal', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', 'aria-labelledby="drawer-title"',
        'aria-modal="true" aria-labelledby="drawer-title"');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/must not trap the reader in L2/);
  });

  it('fails when the run is made inert while the panel is open', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '  drawer.focus({ preventScroll: true });',
        "  app.setAttribute('inert', '');\n  drawer.focus({ preventScroll: true });");
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/run is made inert while the panel is open/);
  });

  it('fails when Escape no longer closes the panel', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', "e.key === 'Escape'", "e.key === 'F9'");
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/Escape does not close the evidence panel/);
  });

  it('fails when the closed panel stays reachable by keyboard', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', "drawer.setAttribute('inert', '');", '');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/closed evidence panel stays reachable/);
  });
});

/**
 * The corrective pass added one class of defect the earlier gate could not see:
 * the cockpit read `environmentEvidence[0]` for every arm, so the perturbed arm
 * rendered the treatment's basis and `coupling support 8/10` directly above
 * `NO_QUALIFYING_COUPLING`. Every case below perturbs the binding rather than a
 * string, so a check that only greps the markup cannot pass them.
 */
describe('the selected arm drives its own evidence', () => {
  const gate = 'media/hac-341/bin/verify-cockpit.mjs';
  const VM = 'media/hac-341/evidence/view-model.json';
  const ARM_VIEW = 'media/hac-341/lib/arm-view.mjs';

  const withModel = (mutate) => (a) => {
    const m = JSON.parse(a.read(VM));
    mutate(m);
    a.write(VM, `${JSON.stringify(m, null, 2)}\n`);
  };
  const arm = (m, id) => m.runs.local.arms.find((x) => x.armId === id);

  it('accepts the repository as built', () => {
    const r = run(pristine, gate);
    expect(r.code).toBe(0);
    expect(r.out).toContain('HAC-341 cockpit verified');
  });

  it('fails when the derivation stops reading the arm basis', () => {
    const r = perturbed((a) => {
      a.edit(ARM_VIEW, 'basis: arm.basisRevision ?? null,', 'basis: env.basisRevision ?? null,');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/renders basis .* but its frozen basis is/);
  });

  it('fails when the derivation stops reading the arm couplings', () => {
    const r = perturbed((a) => {
      a.edit(ARM_VIEW, 'couplings: arm.couplings ?? [],', 'couplings: env.coupling ?? [],');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/coupling\(s\); the frozen arm records|draws COUPLED without a recorded coupling/);
  });

  it('fails when a disabled arm is drawn as coupled', () => {
    const r = perturbed((a) => {
      a.edit(ARM_VIEW, "consulted: arm.interlock === 'enabled',", 'consulted: true,');
      const m = JSON.parse(a.read(VM));
      arm(m, 'baseline').couplings = [{ intents: ['A', 'B'], files: ['x'], support: 8, occurrences: 10 }];
      a.write(VM, `${JSON.stringify(m, null, 2)}\n`);
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/draws COUPLED although Interlock was disabled/);
  });

  it('fails when the perturbed arm shares the default arm basis', () => {
    const r = perturbed(withModel((m) => {
      arm(m, 'perturbed').basisRevision = arm(m, 'treatment').basisRevision;
    }), gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/shares the default arm basis|does not report changed evidence/);
  });

  it('fails when an arm records a coupling its own reason denies', () => {
    const r = perturbed(withModel((m) => {
      arm(m, 'perturbed').couplings = [{ intents: ['A', 'B'], files: ['x'], support: 8, occurrences: 10 }];
    }), gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/decided NO_QUALIFYING_COUPLING while recording/);
  });

  it('fails when an arm claims an observed coupling it does not record', () => {
    const r = perturbed(withModel((m) => { delete arm(m, 'treatment').couplings; }), gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/decided COUPLING_OBSERVED with no recorded coupling/);
  });

  it('fails when the baseline is compared against itself', () => {
    const r = perturbed((a) => {
      a.edit(ARM_VIEW, "if (arm.armId === baseline?.armId) return [{ ...selected, key: 'only' }];", '');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/compares against itself/);
  });

  it('fails when an arm stops being rendered beside the baseline', () => {
    const r = perturbed((a) => {
      a.edit(ARM_VIEW, '  return [\n    {\n      key: \'reference\',', '  return [\n    {\n      key: \'reference\',');
      a.edit(ARM_VIEW, 'return [\n    {', 'return [\n    // eslint-disable-next-line\n    {');
      a.edit(ARM_VIEW, '    selected,\n  ];', '  ];');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is not rendered against the baseline|does not keep the baseline/);
  });

  it('fails when the cockpit stops consuming the shared derivation', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', "import { armView } from './lib/arm-view.mjs';", '');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not consume the shared arm-view derivation/);
  });

  it('fails when the cockpit reads a basis off the environment again', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', 'const short =',
        'const legacyBasis = (run) => run.environmentEvidence[0].basisRevision;\nconst short =');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/reads a basis revision off the environment/);
  });

  it('fails when the proof switch stops naming a class from its own label', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '${esc(MODEL.runs.local.proofLabel)}', 'Controlled causal experiment');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not name the local class from its own proofLabel/);
  });
});

describe('the evidence panel stays usable', () => {
  const gate = 'media/hac-341/bin/verify-cockpit.mjs';

  it('fails when raw proof is clipped by a fixed height again', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', 'pre{background:rgba(128,128,128,.14);',
        'pre{max-height:270px;background:rgba(128,128,128,.14);');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/raw proof is clipped by a fixed max-height/);
  });

  it('fails when the run stops yielding space to the panel', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', 'body[data-drawer="open"] main.frame{max-width:calc(100vw - var(--drawer-w));',
        'body[data-drawer="open"] .nothing{max-width:calc(100vw - var(--drawer-w));');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not yield space when the panel opens/);
  });

  it('fails when the copy control disappears', () => {
    const r = perturbed((a) => {
      a.write('media/hac-341/cockpit.html', a.read('media/hac-341/cockpit.html').replaceAll('data-copy=', 'data-nocopy='));
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no copy control exists/);
  });

  it('fails when copy loses its offline fallback', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', "ok = document.execCommand('copy');", 'ok = false;');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no offline fallback/);
  });

  it('fails when motion is made to loop', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', 'animation:il-step-in var(--dur-base,220ms) var(--ease-standard) both',
        'animation:il-step-in var(--dur-base,220ms) var(--ease-standard) infinite');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/looping animation/);
  });
});

/**
 * Pre-freeze cleanup. Two of these guard framing rather than facts: the values
 * involved are all real evidence, and the defect was where they were shown and
 * what they were called. That makes them easy to reintroduce by accident, which
 * is exactly why they need proofs.
 */
describe('cloud L1 does not read as a bounded-outcome experiment', () => {
  const gate = 'media/hac-341/bin/verify-cockpit.mjs';

  it('fails when the mutation invariant returns to cloud L1', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html',
        '<div class="n">${esc(run.effect.note)}</div>',
        '<div class="n">${esc(run.effect.invariant)}</div>');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cloud L1 renders the protected-mutation invariant/);
  });

  it('fails when the invariant is deleted rather than demoted', () => {
    const r = perturbed((a) => {
      const f = 'media/hac-341/cockpit.html';
      a.write(f, a.read(f).replaceAll('run.effect.invariant', 'run.effect.status'));
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/rendered nowhere; it is recorded evidence/);
  });
});

describe('the decision artifact has one name', () => {
  const gate = 'media/hac-341/bin/verify-cockpit.mjs';
  const VM = 'media/hac-341/evidence/view-model.json';

  it('fails when the decision hop drifts from "<decision> + receipt"', () => {
    const r = perturbed((a) => {
      const m = JSON.parse(a.read(VM));
      m.runs.cloud.events.find((e) => e.role === 'decision').label = 'ALLOW + authorization receipt';
      a.write(VM, `${JSON.stringify(m, null, 2)}\n`);
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/must read "ALLOW \+ receipt"/);
  });

  it('fails when a rendered surface reintroduces "authorization receipt"', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '<h2>Decision, effect, observation</h2>',
        '<h2>Decision, effect, observation</h2><!-- authorization receipt -->');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/names the decision artifact "authorization receipt"/);
  });
});

describe('semantic state colour clears the text contrast floor', () => {
  const gate = 'scripts/check-identity.mjs';
  const TOK = 'assets/tokens/colors.css';

  it('fails when the light coupled state is lightened back over the floor', () => {
    const r = perturbed((a) => {
      a.edit(TOK, '--il-state-coupled: oklch(0.52 0.130 250)', '--il-state-coupled: oklch(0.58 0.130 250)');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/is L=0\.58; 0\.52 is the measured ceiling/);
  });

  it('fails when hue or chroma change without a re-measure', () => {
    const r = perturbed((a) => {
      a.edit(TOK, '--il-state-coupled: oklch(0.52 0.130 250)', '--il-state-coupled: oklch(0.52 0.180 265)');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/chroma\/hue changed .* must be re-measured/);
  });

  it('fails when the cockpit drifts from the token it should follow', () => {
    const r = perturbed((a) => {
      a.edit('media/hac-341/cockpit.html', '--coupled:oklch(0.52 0.130 250)', '--coupled:oklch(0.58 0.130 250)');
    }, gate);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/has drifted from the token/);
  });
});
