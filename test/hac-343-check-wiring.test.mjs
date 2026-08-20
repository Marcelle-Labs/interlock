/**
 * Proves that wiring HAC-343 into `pnpm run check` bought something.
 *
 * HAC-341's cockpit binds twenty-four comparison cells to fields inside
 * `experiments/hac-343/evidence/*`. Before this pass those artifacts were
 * verified by a script nobody ran in CI, so a rendered judge-facing value could
 * have been read out of a packet that no longer verified — the cockpit gate
 * would still have passed, because it only asks whether the view model agrees
 * with the artifacts, not whether the artifacts agree with themselves.
 *
 * Two seams are proved here, in the two directions that matter:
 *
 * 1. `check:packet:eval` fails on an invalid HAC-343 packet.
 * 2. `check:cockpit` fails when a HAC-343 field the comparison *binds to*
 *    changes underneath the committed view model. That is the integration seam;
 *    the existing suite only proved the reverse (editing the view model).
 *
 * The HAC-343 verifier pins three freeze commits, so it needs real git history
 * rather than a file copy: each case runs against a local clone. It also loads
 * the compiled decision core through `experiments/hac-343/lib/arms.mjs`, which
 * is why `check:packet:eval` builds first and why `dist/` is copied in here.
 *
 * The clone carries committed history, so `media/hac-341` is overlaid from the
 * working tree afterwards — the same thing the existing HAC-341 gate tests do,
 * and the only way a gate can be proved against the surface as it stands rather
 * than as it was last committed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobSteps, runCommands, checkoutDepth, enforcementStep, stepEnforcementDefect, executableLines } from '../media/hac-341/bin/lib/workflow.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL_GATE = 'experiments/hac-343/bin/verify-packet.mjs';
const COCKPIT_GATE = 'media/hac-341/bin/verify-cockpit.mjs';
const RESULTS = 'experiments/hac-343/evidence/results.json';
const METRICS = 'experiments/hac-343/evidence/metric-definitions.json';
const SEMANTICS = 'experiments/hac-343/evidence/execution-semantics.json';
const EXPORT = 'experiments/hac-343/evidence/judge-export.json';

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac343-wiring-'));
  // `git clone --local` hardlinks the object store: fast, and it carries the
  // freeze commits the verifier resolves. A plain file copy cannot.
  const cloned = spawnSync('git', ['clone', '--local', '--quiet', repoRoot, pristine], { encoding: 'utf8' });
  if (cloned.status !== 0) throw new Error(`could not clone the repository: ${cloned.stderr}`);
  // The compiled decision core, which the verifier loads rather than reimplements.
  if (!existsSync(join(repoRoot, 'dist'))) throw new Error('dist/ is absent; run `pnpm run build` first');
  cpSync(join(repoRoot, 'dist'), join(pristine, 'dist'), { recursive: true });
  // The cockpit as it stands, not as it was last committed — and the workflow
  // with it, because the gate now asserts that a CI job reproduces the derived
  // judge export.
  cpSync(join(repoRoot, 'media', 'hac-341'), join(pristine, 'media', 'hac-341'), { recursive: true });
  cpSync(join(repoRoot, '.github'), join(pristine, '.github'), { recursive: true });
}, 60_000);

afterAll(() => { for (const d of [pristine, ...scratch].filter(Boolean)) rmSync(d, { recursive: true, force: true }); });

const run = (dir, script) => {
  const r = spawnSync(process.execPath, [join(dir, script)], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function broken(mutate, script = EVAL_GATE) {
  const dir = mkdtempSync(join(tmpdir(), 'hac343-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  mutate({
    dir,
    json(f, fn) {
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      fn(v);
      writeFileSync(join(dir, f), JSON.stringify(v, null, 2) + '\n');
    },
    rm: (f) => rmSync(join(dir, f), { force: true }),
    write: (f, body) => writeFileSync(join(dir, f), body),
    edit(f, from, to) {
      const body = readFileSync(join(dir, f), 'utf8');
      if (!body.includes(from)) throw new Error(`anchor not found in ${f}: ${from.slice(0, 60)}`);
      writeFileSync(join(dir, f), body.replace(from, to));
    },
  });
  return run(dir, script);
}

describe('the check path now covers the packet the cockpit reads', () => {
  it('names HAC-343 in the canonical check script', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:packet:eval']).toContain('experiments/hac-343/bin/verify-packet.mjs');
    expect(pkg.scripts.check).toContain('check:packet:eval');
    // The verifier loads the compiled decision core, so the gate cannot assume
    // a build already happened on a clean checkout.
    expect(pkg.scripts['check:packet:eval']).toContain('build');
    // Evidence gates run before the surfaces that render them.
    const order = pkg.scripts.check;
    expect(order.indexOf('check:packet:eval')).toBeLessThan(order.indexOf('check:cockpit'));
  });

  it('gives the evaluation gate its own CI job, at full depth', () => {
    const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(jobSteps(ci, 'evaluation-gate')).not.toBeNull();
    // The freeze-commit checks resolve real history; a shallow checkout fails them.
    expect(String(checkoutDepth(ci, 'evaluation-gate'))).toBe('0');
    const cmds = runCommands(ci, 'evaluation-gate');
    expect(cmds.some((c) => /pnpm run check:packet:eval\b/.test(c))).toBe(true);
    expect(cmds.some((c) => /hac-343-check-wiring\.test\.mjs/.test(c))).toBe(true);
    // A derived artifact is verified by reproducing it.
    expect(cmds.some((c) => /(^|\n)\s*node experiments\/hac-343\/bin\/build-judge-export\.mjs/.test(c))).toBe(true);
  });

  it('reads the workflow structurally, so a comment cannot satisfy it', () => {
    const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    const commented = ci.replace(
      '          node experiments/hac-343/bin/build-judge-export.mjs',
      '          # node experiments/hac-343/bin/build-judge-export.mjs',
    );
    expect(commented).not.toBe(ci);
    // The naive check this replaced would still pass on the commented file.
    expect(commented.includes('experiments/hac-343/bin/build-judge-export.mjs')).toBe(true);
    // The structural reader must not.
    const cmds = runCommands(commented, 'evaluation-gate');
    expect(cmds.some((c) => /(^|\n)\s*node experiments\/hac-343\/bin\/build-judge-export\.mjs/.test(c))).toBe(false);
  });

  /**
   * A required command must *begin an executable line*, not merely appear.
   *
   * The failure-summary step documents every command this gate requires, so an
   * unanchored substring test was satisfied by that documentation while the
   * real invocation had been replaced by `echo skipped`. These five are the
   * ways a step can be present and enforce nothing.
   */
  const CI = '.github/workflows/ci.yml';
  const CI_BYPASSES = [
    ['check:packet:eval replaced by an echo, name kept in failure prose',
      (a) => a.edit(CI, '        run: pnpm run check:packet:eval', '        run: echo skipped'),
      /no enforcing step verifying the HAC-343 packet/],
    ['wiring-test execution removed, filename kept in failure prose',
      (a) => a.edit(CI, '        run: pnpm vitest run test/hac-343-check-wiring.test.mjs', '        run: echo skipped'),
      /no enforcing step running the HAC-343 wiring test/],
    ['enforcement step gains `if: false`',
      (a) => a.edit(CI, '      - name: The judge export is derived, not hand-edited',
        '      - name: The judge export is derived, not hand-edited\n        if: false'),
      /an evidence gate must be unconditional/],
    ['enforcement step gains `continue-on-error: true`',
      (a) => a.edit(CI, '      - name: The judge export is derived, not hand-edited',
        '      - name: The judge export is derived, not hand-edited\n        continue-on-error: true'),
      /its failure would not reach the job/],
    ['required command exists only as quoted text inside another command',
      (a) => a.edit(CI, '        run: pnpm run check:packet:eval',
        '        run: echo "pnpm run check:packet:eval"'),
      /no enforcing step verifying the HAC-343 packet/],
  ];
  for (const [label, mutate, expected] of CI_BYPASSES) {
    it(`fails when ${label}`, () => {
      const r = broken(mutate, COCKPIT_GATE);
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(expected);
    }, 30_000);
  }

  it('anchors required commands to the start of an executable line', () => {
    // Unit-level, so the distinction is stated where it is implemented.
    expect(executableLines('echo "pnpm run check:packet:eval"')).toEqual(['echo "pnpm run check:packet:eval"']);
    expect(executableLines('# pnpm run check:packet:eval')).toEqual([]);
    expect(executableLines('set -euo pipefail\n\npnpm run check:packet:eval\n'))
      .toEqual(['set -euo pipefail', 'pnpm run check:packet:eval']);
  });

  it('reads the two step controls that decide whether a step enforces anything', () => {
    const ci = readFileSync(join(repoRoot, CI), 'utf8');
    const step = enforcementStep(ci, 'evaluation-gate', 'pnpm run check:packet:eval');
    expect(step).not.toBeNull();
    expect(stepEnforcementDefect(step)).toBeNull();
    expect(stepEnforcementDefect({ ...step, if: 'false' })).toMatch(/must be unconditional/);
    expect(stepEnforcementDefect({ ...step, continueOnError: 'true' })).toMatch(/would not reach the job/);
    // Absent or explicitly false is fine.
    expect(stepEnforcementDefect({ ...step, continueOnError: 'false' })).toBeNull();
    expect(stepEnforcementDefect(null)).toMatch(/does not exist/);
  });

  it('leaves the explanatory step free to run on failure', () => {
    // `if: failure()` is correct there: it reports, it does not enforce.
    const ci = readFileSync(join(repoRoot, CI), 'utf8');
    const explain = (jobSteps(ci, 'evaluation-gate') ?? []).find((x) => x.name === 'Explain the failure');
    expect(explain).toBeTruthy();
    expect(explain.if).toBe('failure()');
    // And it must not be mistaken for an enforcement step for any required command.
    for (const cmd of ['pnpm run check:packet:eval', 'node experiments/hac-343/bin/build-judge-export\\.mjs']) {
      expect(enforcementStep(ci, 'evaluation-gate', cmd)).not.toBe(explain);
    }
  });

  it('fails the cockpit gate when the CI run step is replaced by a comment', () => {
    const r = broken((a) => a.edit('.github/workflows/ci.yml',
      '          node experiments/hac-343/bin/build-judge-export.mjs',
      '          # node experiments/hac-343/bin/build-judge-export.mjs'), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no enforcing step reproducing/);
  }, 30_000);

  it('fails the cockpit gate when the evaluation gate loses full-depth checkout', () => {
    const r = broken((a) => a.edit('.github/workflows/ci.yml',
      '      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: pnpm/action-setup',
      '      - uses: actions/checkout@v4\n      - uses: pnpm/action-setup'), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/fetch-depth: 0/);
  }, 30_000);

  it('passes on the packet as committed', () => {
    const r = run(pristine, EVAL_GATE);
    expect(r.out).toContain('HAC-343 packet verified');
    expect(r.code).toBe(0);
  }, 30_000);
});

describe('the HAC-343 gate fails on an invalid packet', () => {
  it('fails when a reported metric stops matching the raw records', () => {
    const r = broken((a) => a.json(RESULTS, (v) => {
      // The single number the whole comparison's "Safety result" column rests on.
      v.report.aggregate.A4_interlock.unsafeJointState.numerator = 2;
      v.report.aggregate.A4_interlock.unsafeJointState.display = '2/2 (100.0%)';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/recomputed from raw records|FAILED/);
  }, 30_000);

  it('fails when a frozen contract is edited after its freeze commit', () => {
    const r = broken((a) => a.json(METRICS, (v) => {
      v.metrics.unsafeJointStateRate.direction = 'higher is better';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/frozen|freeze/i);
  }, 30_000);

  /**
   * Not a failure, and deliberately so: the verifier was written to run before
   * the experiment had, and reports `machinery verified; the experiment has not
   * been executed` rather than pretending a result exists.
   *
   * That is right for HAC-343 on its own and wrong for anything downstream that
   * binds to the packet, so the boundary is pinned here rather than assumed —
   * and the case below proves the cockpit gate is what refuses it.
   */
  it('reports an absent result as not-executed rather than as a pass', () => {
    const r = broken((a) => a.rm(RESULTS));
    expect(r.out).toMatch(/has not been executed/);
    expect(r.out).not.toMatch(/HAC-343 packet verified/);
    expect(r.code).toBe(0);
  }, 30_000);
});

describe('the cockpit gate fails when a bound HAC-343 field moves underneath it', () => {
  it('fails when a bound metric value changes in the frozen artifact', () => {
    // The reverse direction of the existing comparison tests: the view model is
    // untouched and the *source* moves. Without this the cockpit could keep
    // rendering a value HAC-343 no longer reports.
    const r = broken((a) => a.json(RESULTS, (v) => {
      v.report.aggregate.A4_interlock.evidenceSensitivity.display = '0/2 (0.0%)';
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce/);
  }, 30_000);

  it('fails when a bound prose field is reworded in the frozen artifact', () => {
    const r = broken((a) => a.json(SEMANTICS, (v) => {
      v.arms.A3_per_target_lock.note = 'a per-target lock';
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce/);
  }, 30_000);

  it('fails when a bound field is removed rather than changed', () => {
    // Removal is the quieter failure: the cell would become an unresolved
    // binding while the committed view model still claims it resolved.
    const r = broken((a) => a.json(METRICS, (v) => {
      delete v.arms.A2_global_lock.knownWeakness;
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce|misreports whether it resolved/);
  }, 30_000);

  /**
   * `judge-export.json` is the fourth cited artifact and was, for a while, the
   * unguarded one: the verifier recomputes the *report* from the raw records
   * but never rebuilt the *export*, so ten judge-facing values — all four
   * strategy labels, the per-target-lock credibility figure, the canonical
   * result commit — reached the panel through a file no gate reproduced.
   */
  it('fails when the derived judge export is hand-edited', () => {
    const r = broken((a) => a.json(EXPORT, (v) => {
      v.panel1.rows[3].label = 'Interlock (best)';
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce/);
  }, 30_000);

  it('fails when a bound judge-export field is removed', () => {
    const r = broken((a) => a.json(EXPORT, (v) => {
      delete v.panel1.perTargetLockCredibility.serializedSameTargetContention;
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/did not resolve|misreports whether it resolved|not what its cited HAC-343 artifacts produce/);
  }, 30_000);

  /**
   * The failure mode the adversarial pass found: *corrupt* is not *absent*.
   * A truncated artifact took the "this checkout does not carry HAC-343" branch
   * and silently unbound ten values with every gate green.
   */
  it('fails when a cited artifact is present but does not parse', () => {
    const r = broken((a) => a.write(EXPORT, '{ "experiment": "HAC-343", "panel1": {'), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/present but did not parse|did not resolve/);
  }, 30_000);

  it('fails when the evidence is present but a binding did not resolve', () => {
    const r = broken((a) => a.json('media/hac-341/evidence/view-model.json', (m) => {
      m.comparison.resolved = false;
      m.comparison.unresolved = ['experiments/hac-343/evidence/judge-export.json#panel1.rows.0.label'];
    }), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/present but .* binding\(s\) did not resolve|misreports whether it resolved/);
  }, 30_000);

  /**
   * The four judge-facing fields that sat outside `strategies` and were
   * therefore compared by nothing. Inverting the first of them turns HAC-343's
   * most carefully hedged finding — that the per-target lock was a *real* lock
   * before it was a blind one — into a strawman.
   */
  const UNGUARDED = [
    ['A3 credibility display', (v) => { v.panel1.perTargetLockCredibility.serializedSameTargetContention.display = '0/2'; }, /perTargetLockCredibility/],
    ['A3 credibility note', (v) => { v.panel1.perTargetLockCredibility.note = 'Per-target locking never locked anything.'; }, /perTargetLockCredibility/],
    ['panel scope boundary', (v) => { v.panel1.scope = 'All sixteen scenarios.'; }, /scopeNote/],
    ['canonical result commit', (v) => { v.derivedFrom.canonicalResultCommit = '0'.repeat(40); }, /canonicalResultCommit/],
    ['experiment identity', (v) => { v.experiment = 'HAC-999'; }, /sourceIssue/],
    ['dimension caption', (v) => { v.limitations.corpusBound = 'No limitations apply.'; }, /captions|strategies/],
  ];
  for (const [label, mutate, expected] of UNGUARDED) {
    it(`fails when the judge export's ${label} is tampered`, () => {
      const r = broken((a) => a.json(EXPORT, mutate), COCKPIT_GATE);
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(expected);
      expect(r.out).toMatch(/is not what its cited HAC-343 artifacts produce/);
    }, 30_000);
  }

  /**
   * The case the eval gate deliberately lets through. `check:packet:eval`
   * reports an absent result as not-executed and exits zero; the cockpit is
   * what refuses to keep rendering twenty-four values sourced from a packet
   * that is no longer there. Both gates are in `check`, so the pair closes.
   */
  it('fails when the whole packet the comparison binds to disappears', () => {
    const r = broken((a) => a.rm(RESULTS), COCKPIT_GATE);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce|misreports whether it resolved/);
  }, 30_000);
});
