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
 * The HAC-343 verifier proves three freeze commits through tags, so it needs real
 * git refs and objects rather than a file copy: each case runs against a local
 * clone, which carries both. It also loads
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

import { jobSteps, enforcementStep, stepEnforcementDefect, jobControls, jobEnforcementDefect,
  jobKeyDefect, jobKeys, workflowEnvDefect, workflowKeys, workflowBlock,
  runDefaultsDefect, checkoutDefect, checkoutSteps } from '../media/hac-341/bin/lib/workflow.mjs';

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

/**
 * Mutate a disposable copy and run a gate against it.
 *
 * `changed` is the number of files whose bytes actually moved. Every case
 * asserts it before asserting the gate refused: an `anchor not found` throw, or
 * a replacement that silently matched nothing, is a broken fixture — and a
 * broken fixture that happens to make the gate fail reads exactly like a
 * successful rejection.
 */
function broken(mutate, script = EVAL_GATE) {
  const dir = mkdtempSync(join(tmpdir(), 'hac343-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  const touched = new Map();
  const snapshot = (f) => {
    if (!touched.has(f)) touched.set(f, readFileSync(join(dir, f), 'utf8'));
  };
  // The freeze proof rests on tags, so a case must be able to move one. Ref state
  // is snapshotted like file bytes: a `moveTag` that quietly resolved to the
  // commit it already pointed at is a broken fixture, not a rejection.
  const refs = new Map();
  const resolveRef = (ref) => {
    const r = spawnSync('git', ['-C', dir, 'rev-list', '-n', '1', ref], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const snapshotRef = (ref) => { if (!refs.has(ref)) refs.set(ref, resolveRef(ref)); };
  mutate({
    dir,
    json(f, fn) {
      snapshot(f);
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      fn(v);
      writeFileSync(join(dir, f), JSON.stringify(v, null, 2) + '\n');
    },
    rm: (f) => { snapshot(f); rmSync(join(dir, f), { force: true }); },
    write: (f, body) => { snapshot(f); writeFileSync(join(dir, f), body); },
    edit(f, from, to) {
      snapshot(f);
      const body = readFileSync(join(dir, f), 'utf8');
      if (!body.includes(from)) throw new Error(`anchor not found in ${f}: ${from.slice(0, 60)}`);
      writeFileSync(join(dir, f), body.replace(from, to));
    },
    /**
     * Replace inside one job only.
     *
     * Twelve jobs carry a step named `Explain the failure`, and two carry the
     * same checkout block verbatim, so a whole-file anchor can land in the
     * wrong job — the file changes, `changed === 1` holds, and the gate
     * correctly passes a workflow whose evaluation-gate was never touched.
     */
    moveTag(tag, commitish) {
      snapshotRef(tag);
      const r = spawnSync('git', ['-C', dir, 'tag', '-f', tag, commitish], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`could not move ${tag}: ${r.stderr}`);
    },
    deleteTag(tag) {
      snapshotRef(tag);
      const r = spawnSync('git', ['-C', dir, 'tag', '-d', tag], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`could not delete ${tag}: ${r.stderr}`);
    },
    editJob(f, jobName, from, to) {
      snapshot(f);
      const body = readFileSync(join(dir, f), 'utf8');
      const start = body.indexOf(`\n  ${jobName}:\n`);
      if (start < 0) throw new Error(`job not found in ${f}: ${jobName}`);
      const after = body.slice(start + 1);
      const rel = after.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
      const end = rel < 0 ? body.length : start + 2 + rel;
      const job = body.slice(start, end);
      if (!job.includes(from)) throw new Error(`anchor not found in ${jobName}: ${from.slice(0, 60)}`);
      writeFileSync(join(dir, f), body.slice(0, start) + job.replace(from, to) + body.slice(end));
    },
  });
  let changed = 0;
  for (const [f, before] of touched) {
    const after = existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null;
    if (after !== before) changed += 1;
  }
  let refsMoved = 0;
  for (const [ref, before] of refs) if (resolveRef(ref) !== before) refsMoved += 1;
  const result = { ...run(dir, script), changed, refsMoved };
  // Reclaim the copy as soon as its gate has run. Thirty-odd full repository
  // copies held until teardown timed the afterAll hook out; nothing reads the
  // directory after this point.
  rmSync(dir, { recursive: true, force: true });
  scratch.splice(scratch.indexOf(dir), 1);
  return result;
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



  /**
   * A required command must *begin an executable line*, not merely appear.
   *
   * The failure-summary step documents every command this gate requires, so an
   * unanchored substring test was satisfied by that documentation while the
   * real invocation had been replaced by `echo skipped`. These five are the
   * ways a step can be present and enforce nothing.
   */
  const CI = '.github/workflows/ci.yml';
  const REBUILD = '        run: node experiments/hac-343/bin/build-judge-export.mjs';
  const EVAL = '        run: pnpm run check:packet:eval';
  const WIRING = '        run: pnpm vitest run test/hac-343-check-wiring.test.mjs';
  const JOB = '  evaluation-gate:\n    name: Evaluation gate\n    runs-on: ubuntu-24.04';
  const JOB_STEPS = '  evaluation-gate:\n    name: Evaluation gate\n    runs-on: ubuntu-24.04\n    steps:';
  const JOB_DEFAULTS = '  evaluation-gate:\n    name: Evaluation gate\n    runs-on: ubuntu-24.04\n    defaults:\n      run:\n';
  const VERIFY_STEP = '      - name: Verify the HAC-343 evaluation packet';
  const SECOND_CHECKOUT = '      - uses: actions/checkout@v4\n        with:\n';
  const REBUILD_STEP = '      - name: Rebuild the derived judge export\n'
    + '        run: node experiments/hac-343/bin/build-judge-export.mjs';
  const ASSERT_STEP = '      - name: The judge export is byte-identical to its rebuild\n'
    + '        run: git diff --exit-code -- experiments/hac-343/evidence/judge-export.json';
  // `Explain the failure` appears in twelve jobs; anchor through the step
  // before it so the edit lands in evaluation-gate and nowhere else.
  const EXPLAIN_STEP = ASSERT_STEP + '\n\n      - name: Explain the failure';

  /**
   * Every way an enforcement step or its job can be present and enforce
   * nothing. The first three are why the contract is exact-equality on a
   * single-command `run:` rather than a search: each puts the command at the
   * start of a line without executing it, and no amount of reading the script
   * distinguishes them from an invocation.
   */
  const CI_BYPASSES = [
    ['the command sits inside `if false; then`',
      (a) => a.edit(CI, EVAL, '        run: |\n          if false; then\n          pnpm run check:packet:eval\n          fi'),
      /departs from its accepted shape/],
    ['the command sits inside a heredoc',
      (a) => a.edit(CI, EVAL, '        run: |\n          cat <<\'EOF\' >/dev/null\n          pnpm run check:packet:eval\n          EOF\n          echo done'),
      /departs from its accepted shape/],
    ['the command sits inside an open quoted string',
      (a) => a.edit(CI, EVAL, '        run: |\n          echo "disabled:\n          pnpm run check:packet:eval\n          "'),
      /departs from its accepted shape/],
    ['check:packet:eval is replaced by an echo, name kept in failure prose',
      (a) => a.edit(CI, EVAL, '        run: echo skipped'),
      /departs from its accepted shape/],
    ['the wiring-test execution is removed, filename kept in failure prose',
      (a) => a.edit(CI, WIRING, '        run: echo skipped'),
      /departs from its accepted shape/],
    ['a required command exists only as quoted text inside another command',
      (a) => a.edit(CI, EVAL, '        run: echo "pnpm run check:packet:eval"'),
      /departs from its accepted shape/],
    ['the rebuild step is commented out',
      (a) => a.edit(CI, REBUILD, '        # run: node experiments/hac-343/bin/build-judge-export.mjs'),
      /departs from its accepted shape/],
    ['the byte assertion is removed',
      (a) => a.edit(CI, '        run: git diff --exit-code -- experiments/hac-343/evidence/judge-export.json',
        '        run: echo skipped'),
      /departs from its accepted shape/],
    ['a step gains a literal `if: false`',
      (a) => a.edit(CI, '      - name: Rebuild the derived judge export', `${'      - name: Rebuild the derived judge export'}\n        if: false`),
      /departs from its accepted shape/],
    ['a step gains `continue-on-error: true`',
      (a) => a.edit(CI, '      - name: Rebuild the derived judge export', `${'      - name: Rebuild the derived judge export'}\n        continue-on-error: true`),
      /only an absent or literally `false` value can be trusted/],
    ['a step gains `continue-on-error: ${{ true }}`',
      (a) => a.edit(CI, '      - name: Rebuild the derived judge export', `${'      - name: Rebuild the derived judge export'}\n        continue-on-error: \${{ true }}`),
      /only an absent or literally `false` value can be trusted/],
    ['a step gains a custom `shell:`',
      (a) => a.edit(CI, '      - name: Rebuild the derived judge export', `${'      - name: Rebuild the derived judge export'}\n        shell: python`),
      /must run its command as written/],
    ['a step gains a `working-directory:`',
      (a) => a.edit(CI, '      - name: Rebuild the derived judge export', `${'      - name: Rebuild the derived judge export'}\n        working-directory: /tmp`),
      /must run where written/],
    ['the job gains `if: false`',
      (a) => a.edit(CI, JOB, '  evaluation-gate:\n    name: Evaluation gate\n    if: false\n    runs-on: ubuntu-24.04'),
      /the job is conditional/],
    ['the job gains `continue-on-error: true`',
      (a) => a.edit(CI, JOB, `${JOB}\n    continue-on-error: true`),
      /the job sets .continue-on-error/],
    ['the job gains `needs:`',
      (a) => a.edit(CI, JOB, `${JOB}\n    needs: [test]`),
      /a skipped or failed dependency would silently skip this gate/],
    ['the job changes runner',
      (a) => a.edit(CI, JOB, '  evaluation-gate:\n    name: Evaluation gate\n    runs-on: self-hosted'),
      /the job runs on/],
    ['fetch-depth: 0 is removed',
      (a) => a.edit(CI, '      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: pnpm/action-setup',
        '      - uses: actions/checkout@v4\n      - uses: pnpm/action-setup'),
      /fetch-depth/],
    // A step can carry no `shell:` and no `working-directory:` of its own and
    // still inherit both from a `defaults.run` map it never mentions. Refused
    // at both scopes; which one would win is precedence this grammar does not
    // compute.
    ['the job inherits `defaults.run.working-directory`',
      (a) => a.edit(CI, JOB_STEPS, `${JOB_DEFAULTS}        working-directory: /tmp\n    steps:`),
      /the job sets `defaults.run.working-directory/],
    ['the job inherits `defaults.run.shell`',
      (a) => a.edit(CI, JOB_STEPS, `${JOB_DEFAULTS}        shell: python\n    steps:`),
      /the job sets `defaults.run.shell/],
    ['the workflow inherits `defaults.run.working-directory`',
      (a) => a.edit(CI, '\njobs:\n', '\ndefaults:\n  run:\n    working-directory: /tmp\n\njobs:\n'),
      /the workflow sets `defaults.run.working-directory/],
    ['the workflow inherits `defaults.run.shell`',
      (a) => a.edit(CI, '\njobs:\n', '\ndefaults:\n  run:\n    shell: python\n\njobs:\n'),
      /the workflow sets `defaults.run.shell/],
    // A second checkout is a defect whatever depth it asks for: the first still
    // declares 0 while the workspace ends up wherever the last one left it.
    ['a second checkout re-checks out shallow',
      (a) => a.edit(CI, VERIFY_STEP, `${SECOND_CHECKOUT}          fetch-depth: 1\n${VERIFY_STEP}`),
      /must check out exactly once/],
    ['a second checkout re-checks out deep',
      (a) => a.edit(CI, VERIFY_STEP, `${SECOND_CHECKOUT}          fetch-depth: 0\n${VERIFY_STEP}`),
      /must check out exactly once/],
    /**
     * Presence was not enough. Each of these leaves all four operations
     * present, exact, unconditional and failure-propagating, and makes one of
     * them vacuous — so the contract is an exact sequence, and the rule is
     * structural: a harmless `echo` in a forbidden position fails exactly as a
     * malicious one would.
     */
    ['the assertion is ordered before the rebuild',
      (a) => a.edit(CI, `${REBUILD_STEP}\n\n${ASSERT_STEP}`, `${ASSERT_STEP}\n\n${REBUILD_STEP}`),
      /departs from its accepted shape/],
    ['a step is interposed between rebuild and assertion',
      (a) => a.edit(CI, ASSERT_STEP, `      - name: tidy\n        run: echo harmless\n${ASSERT_STEP}`),
      /departs from its accepted shape/],
    ['a step is interposed between packet verification and the rebuild',
      (a) => a.edit(CI, REBUILD_STEP, `      - name: touch the tree\n        run: echo harmless\n${REBUILD_STEP}`),
      /departs from its accepted shape/],
    ['an extra step precedes the enforcement block',
      (a) => a.edit(CI, VERIFY_STEP, `      - name: preamble\n        run: echo harmless\n${VERIFY_STEP}`),
      /departs from its accepted shape/],
    ['an extra step follows the assertion',
      (a) => a.edit(CI, EXPLAIN_STEP,
        `${ASSERT_STEP}\n\n      - name: postscript\n        run: echo harmless\n      - name: Explain the failure`),
      /departs from its accepted shape/],
    ['the job declares `strategy.matrix: []`',
      (a) => a.edit(CI, JOB, `${JOB.replace('    runs-on: ubuntu-24.04', '    strategy:\n      matrix:\n        shard: []\n    runs-on: ubuntu-24.04')}`),
      /declares `strategy`/],
    ['the job declares a `container`',
      (a) => a.edit(CI, JOB, `${JOB}\n    container: node:22`),
      /declares `container`/],
    ['the job declares `services`',
      (a) => a.edit(CI, JOB, `${JOB}\n    services:\n      db:\n        image: postgres`),
      /the job declares `services`/],
    /**
     * Allowlisted, so a key nobody thought to forbid is refused by default.
     * `timeout-minutes` is harmless; that is the point — the rule is the shape,
     * not a judgement about what the key does.
     */
    ['the workflow declares `env`',
      (a) => a.edit(CI, '\njobs:\n', '\nenv:\n  CI: "1"\n\njobs:\n'),
      /the workflow declares `env`/],
    ['the job declares `env`',
      (a) => a.edit(CI, JOB, `${JOB}\n    env:\n      CI: "1"`),
      /the job declares `env`/],
    ['a required step declares `env`',
      (a) => a.edit(CI, REBUILD_STEP, `${REBUILD_STEP}\n        env:\n          CI: "1"`),
      /declares `env`; the shape declares only/],
    ['the job declares an otherwise harmless `timeout-minutes`',
      (a) => a.edit(CI, JOB, `${JOB}\n    timeout-minutes: 30`),
      /the job declares `timeout-minutes`/],
    /**
     * The trigger is the level above the job. Everything below can be exactly
     * right and never run.
     */
    ['the pull_request trigger is removed',
      (a) => a.edit(CI, 'on:\n  pull_request:\n  push:\n    branches: [main]', 'on:\n  push:\n    branches: [main]'),
      /`on` block is/],
    ['the push trigger is removed',
      (a) => a.edit(CI, 'on:\n  pull_request:\n  push:\n    branches: [main]', 'on:\n  pull_request:'),
      /`on` block is/],
    ['the trigger is narrowed to workflow_dispatch only',
      (a) => a.edit(CI, 'on:\n  pull_request:\n  push:\n    branches: [main]', 'on:\n  workflow_dispatch:'),
      /`on` block is/],
    ['the push trigger is narrowed to another branch',
      (a) => a.edit(CI, '  push:\n    branches: [main]', '  push:\n    branches: [nonexistent]'),
      /`on` block is/],
    ['an unexpected top-level execution key is added',
      (a) => a.edit(CI, '\njobs:\n', '\nrun-name: manual\n\njobs:\n'),
      /the workflow declares `run-name`/],
    ['permissions are widened',
      (a) => a.edit(CI, 'permissions:\n  contents: read', 'permissions:\n  contents: write'),
      /`permissions` block is/],
    ['concurrency starts cancelling main', 
      (a) => a.edit(CI, "  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}", '  cancel-in-progress: true'),
      /`concurrency` block is/],
    ['an action step passes an unprojected `with` input',
      (a) => a.editJob(CI, 'evaluation-gate', '          fetch-depth: 0',
        '          fetch-depth: 0\n          submodules: true'),
      /passes `with.submodules`, which the shape does not project/],
  ];
  for (const [label, mutate, expected] of CI_BYPASSES) {
    it(`fails when ${label}`, () => {
      const r = broken(mutate, COCKPIT_GATE);
      // The fixture must have moved before the refusal means anything.
      expect(r.changed).toBe(1);
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(expected);
    }, 30_000);
  }



  it('gives the evaluation gate a job and step shape the gate can check', () => {
    const ci = readFileSync(join(repoRoot, CI), 'utf8');
    // Job: able to run, able to fail, on the runner the gate expects.
    expect(jobEnforcementDefect(jobControls(ci, 'evaluation-gate'), 'ubuntu-24.04')).toBeNull();
    // Exactly one checkout, at full depth, and no inherited run behaviour.
    expect(checkoutSteps(ci, 'evaluation-gate')).toHaveLength(1);
    expect(checkoutDefect(ci, 'evaluation-gate')).toBeNull();
    expect(runDefaultsDefect(ci, 'evaluation-gate')).toBeNull();
    expect(jobKeyDefect(ci, 'evaluation-gate', ['name', 'runs-on', 'steps'])).toBeNull();
    expect(jobKeys(ci, 'evaluation-gate')).toEqual(['name', 'runs-on', 'steps']);
    expect(workflowEnvDefect(ci)).toBeNull();
    // The level above the job: the trigger that decides whether it runs at all.
    expect(workflowKeys(ci)).toEqual(['name', 'on', 'permissions', 'concurrency', 'jobs']);
    expect(workflowBlock(ci, 'on').map((l) => l.trim()))
      .toEqual(['pull_request:', 'push:', 'branches: [main]']);
    expect(workflowBlock(ci, 'permissions').map((l) => l.trim())).toEqual(['contents: read']);
    // Each step declares exactly the keys its position allows.
    const declared = jobSteps(ci, 'evaluation-gate').map((x) => x.keys.join(','));
    expect(declared).toEqual([
      'uses,with', 'uses', 'uses,with',
      'name,run', 'name,run', 'name,run', 'name,run', 'name,run',
      'name,if,run',
    ]);
    // The sequence itself, and the adjacency the whole class turned on.
    const steps = jobSteps(ci, 'evaluation-gate');
    expect(steps).toHaveLength(9);
    const at = (run) => steps.findIndex((x) => String(x.run ?? '').trim() === run);
    const rebuild = at('node experiments/hac-343/bin/build-judge-export.mjs');
    const assertion = at('git diff --exit-code -- experiments/hac-343/evidence/judge-export.json');
    expect(rebuild).toBeGreaterThan(-1);
    expect(assertion).toBe(rebuild + 1);
    expect(steps.at(-1).name).toBe('Explain the failure');
    expect(steps.at(-1).if).toBe('failure()');
    // Only the last step may be conditional.
    expect(steps.slice(0, -1).every((x) => x.if === null)).toBe(true);
    // Each enforcement operation is one step whose run is exactly the command.
    for (const command of [
      'pnpm run check:packet:eval',
      'pnpm vitest run test/hac-343-check-wiring.test.mjs',
      'node experiments/hac-343/bin/build-judge-export.mjs',
      'git diff --exit-code -- experiments/hac-343/evidence/judge-export.json',
    ]) {
      const step = enforcementStep(ci, 'evaluation-gate', command);
      expect(step, `no step runs exactly: ${command}`).not.toBeNull();
      expect(step.run.trim()).toBe(command);
      expect(stepEnforcementDefect(step)).toBeNull();
    }
  });

  it('accepts only an absent or literally false continue-on-error', () => {
    const ci = readFileSync(join(repoRoot, CI), 'utf8');
    const step = enforcementStep(ci, 'evaluation-gate', 'pnpm run check:packet:eval');
    expect(stepEnforcementDefect({ ...step, continueOnError: 'false' })).toBeNull();
    expect(stepEnforcementDefect({ ...step, continueOnError: 'true' })).toMatch(/can be trusted/);
    // No GitHub expression is evaluated; a non-literal value is a defect.
    expect(stepEnforcementDefect({ ...step, continueOnError: '${{ true }}' })).toMatch(/can be trusted/);
    expect(stepEnforcementDefect({ ...step, continueOnError: '${{ false }}' })).toMatch(/can be trusted/);
    expect(jobEnforcementDefect({ if: null, continueOnError: '${{ true }}', needs: null, runsOn: 'ubuntu-24.04' }, 'ubuntu-24.04'))
      .toMatch(/can be trusted/);
  });

  it('requires the whole run payload to be the command, not to contain it', () => {
    const ci = readFileSync(join(repoRoot, CI), 'utf8');
    // A body that merely contains the command is not an enforcement step.
    for (const body of [
      'if false; then\npnpm run check:packet:eval\nfi',
      'echo "pnpm run check:packet:eval"',
      'cat <<EOF\npnpm run check:packet:eval\nEOF',
    ]) {
      expect(body.trim()).not.toBe('pnpm run check:packet:eval');
    }
    expect(enforcementStep(ci, 'evaluation-gate', 'pnpm run check:packet:eval').run.trim())
      .toBe('pnpm run check:packet:eval');
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

/**
 * The judge export is asserted byte-identical to its own rebuild, which is only
 * a real property if the builder reads nothing but frozen artifacts. It did not:
 * `provenance.toolchain` recorded `process.version` and `process.platform`, so
 * the export could only reproduce on the OS that first built it, and — worse —
 * it sat inside `provenance` asserting a machine that never ran the experiment.
 * CI caught it, but only because the runner happened to be linux while the
 * committed file was built on darwin. A same-platform push would have sailed
 * through with the same defect intact, so presence is asserted at the source.
 */
describe('the judge export derives from frozen artifacts, not from the builder', () => {
  const BUILDER = 'experiments/hac-343/bin/build-judge-export.mjs';

  // Anything whose value depends on where or when the build ran. A field sourced
  // from one of these cannot be byte-reproducible for a judge on another machine.
  const AMBIENT = [
    [/process\.platform/, 'process.platform'],
    [/process\.arch/, 'process.arch'],
    [/process\.version\b/, 'process.version'],
    [/process\.env\b/, 'process.env'],
    [/process\.cwd\s*\(/, 'process.cwd()'],
    [/\bDate\.now\s*\(/, 'Date.now()'],
    [/new\s+Date\s*\(\s*\)/, 'new Date()'],
    [/\bhostname\s*\(/, 'os.hostname()'],
    [/\bMath\.random\s*\(/, 'Math.random()'],
  ];

  // Scan executable code, not prose. The comment that records *why* there is no
  // toolchain block names the very calls this forbids, and a guard that cannot
  // tell a mention from a read is the same defect the CI grammar rounds closed.
  // Block comments and whole-line `//` comments come out; a trailing comment on
  // a line of code stays, so the failure direction is a spurious catch, never a
  // silent miss.
  const source = readFileSync(join(repoRoot, BUILDER), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  for (const [pattern, name] of AMBIENT) {
    it(`does not read ${name}`, () => {
      expect(source).not.toMatch(pattern);
    });
  }

  it('rebuilds byte-identically in place', () => {
    const before = readFileSync(join(repoRoot, EXPORT));
    const r = spawnSync(process.execPath, [BUILDER], { cwd: repoRoot, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(readFileSync(join(repoRoot, EXPORT)).equals(before)).toBe(true);
  }, 30_000);
});

/**
 * The freeze proof moved from branch history to tags, so the tags are now
 * load-bearing evidence and have to be attacked like any other.
 *
 * The check they replaced — "the freeze commit is still the last to touch this
 * contract" — was not merely fragile, it was wrong on the trunk: this repository
 * squash-merges, so on `main` every contract appears to have been introduced by
 * the squash commit and all three checks failed while the evidence was intact.
 * What must survive is the claim itself: these bytes, frozen at that commit,
 * before the result existed.
 */
describe('the freeze anchors are themselves evidence', () => {
  const METRICS_TAG = 'hac-343-freeze-metric-definitions';
  const CORPUS_TAG = 'hac-343-freeze-corpus';
  const RESULT_TAG = 'hac-343-canonical-result';
  const METRICS_FREEZE = '0a6babbc5d1a3f69b057f98093108ee508072e48';

  it('passes on the packet as committed, on squashed history', () => {
    const r = broken(() => {});
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/HAC-343 packet verified/);
    // The point of the rework: no check consults the current branch's history.
    expect(r.out).not.toMatch(/is still the file its freeze commit introduced/);
  }, 30_000);

  it('fails when a freeze tag is deleted', () => {
    const r = broken((a) => a.deleteTag(CORPUS_TAG));
    expect(r.refsMoved).toBe(1);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`${CORPUS_TAG} anchors the commit that froze`));
    expect(r.out).toMatch(/tag not present in this checkout/);
  }, 30_000);

  it('fails when a freeze tag is moved to another commit', () => {
    const r = broken((a) => a.moveTag(CORPUS_TAG, METRICS_FREEZE));
    expect(r.refsMoved).toBe(1);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`FAIL.*${CORPUS_TAG} anchors the commit that froze`));
  }, 30_000);

  it('fails when the canonical result tag is moved', () => {
    const r = broken((a) => a.moveTag(RESULT_TAG, METRICS_FREEZE));
    expect(r.refsMoved).toBe(1);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`FAIL.*${RESULT_TAG} anchors the canonical result commit`));
  }, 30_000);

  /**
   * The load-bearing case. Anchoring alone would let a contract be frozen *after*
   * the result and still verify, which is the failure the whole packet exists to
   * make impossible. Here the pin and its tag are moved together, so every anchor
   * check still passes and only the ordering claim can catch it.
   */
  it('fails when a contract was frozen after the result it supposedly preceded', () => {
    const r = broken((a) => {
      a.edit('experiments/hac-343/lib/aggregate.mjs',
        "export const CANONICAL_RESULT_COMMIT = '7ede0f97e55685c16e5bb762b5e7fbe471a6e8b0';",
        `export const CANONICAL_RESULT_COMMIT = '${METRICS_FREEZE}';`);
      a.moveTag(RESULT_TAG, METRICS_FREEZE);
    });
    expect(r.changed).toBe(1);
    expect(r.refsMoved).toBe(1);
    expect(r.code).not.toBe(0);
    // The anchors agree with each other; only the ordering is wrong.
    expect(r.out).toMatch(new RegExp(`ok.*${RESULT_TAG} anchors the canonical result commit`));
    expect(r.out).toMatch(/FAIL.*corpus\.json was frozen before the canonical result existed/);
  }, 30_000);

  it('still refuses a frozen contract edited after its freeze commit', () => {
    const r = broken((a) => a.json('experiments/hac-343/evidence/corpus.json', (v) => { v.tampered = true; }));
    expect(r.changed).toBe(1);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/byte-identical to its frozen blob/);
  }, 30_000);
});
