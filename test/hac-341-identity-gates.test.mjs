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
      a.edit('media/hac-341/cockpit.html', '  drawer.focus();',
        "  app.setAttribute('inert', '');\n  drawer.focus();");
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
