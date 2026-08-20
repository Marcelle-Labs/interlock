/**
 * A structural reader for the CI workflow, sufficient to assert that a gate is
 * actually wired rather than merely mentioned.
 *
 * It lives beside the gate rather than in `media/hac-341/lib/` because nothing
 * in the browser imports it. That directory is swept by
 * `media/hac-335/bin/lib/capture-source.mjs` as a *render source* set, so a
 * gate helper placed there would invalidate every committed cockpit capture on
 * every edit to a file that cannot change a pixel.
 *
 * The check this replaces was `ci.yml.includes('<command>')`, which a comment
 * satisfies. Commenting out one line disabled the only enforcement of the
 * HAC-343 judge-export reproduction while every gate stayed green — so the
 * assertion has to know the difference between a `run:` step and a `#`.
 *
 * Deliberately not a YAML parser and deliberately not a dependency: this
 * repository ships none, and the deterministic core must stay installable
 * without one. It understands exactly the subset this workflow uses —
 * two-space job keys, `- uses:`/`- name:`/`- run:` steps, `with:` maps,
 * `run: |` block scalars, and the two step controls that decide whether a step
 * runs at all and whether its failure counts — and it strips comment-only
 * lines first, so a commented command is invisible to every accessor below.
 *
 * Reading `run:` was not enough on its own. A step's text can be present while
 * the step is inert (`if: false`) or while its failure is swallowed
 * (`continue-on-error: true`), and a required command can appear inside another
 * command's arguments — `echo "pnpm run check:packet:eval"` is prose, not an
 * invocation. Both distinctions are made here rather than in each caller.
 */

/** Lines with a `#` in the first non-space position carry no configuration. */
const uncommented = (yaml) => yaml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const indentOf = (line) => line.length - line.trimStart().length;

/** Keys that belong to the step itself, never to its `with:` inputs. */
const STEP_KEYS = ['uses', 'name', 'run', 'if', 'continue-on-error'];

/**
 * The shell lines a `run:` body actually executes.
 *
 * Comment lines and blank lines are dropped, and each remaining line is
 * trimmed, so a caller can anchor a required command to the *start* of a line.
 * That is the difference between running `pnpm run check:packet:eval` and
 * printing its name inside an `echo` — the failure-summary step documents every
 * command this gate requires, and an unanchored substring test could not tell
 * the two apart.
 */
export const executableLines = (runBody) => String(runBody ?? '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

/**
 * The lines belonging to one job, by indentation: the `  <name>:` key and every
 * following line indented deeper than it.
 */
export function jobBlock(yaml, jobName) {
  const lines = uncommented(yaml).split('\n');
  const start = lines.findIndex((l) => new RegExp(String.raw`^  ${jobName}:\s*$`).test(l));
  if (start < 0) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') { out.push(line); continue; }
    if (indentOf(line) <= 2) break;
    out.push(line);
  }
  return out;
}

/**
 * The steps of a job, as `{ uses, name, run, with, if, continueOnError }`.
 * `run: |` block scalars are gathered so a multi-line script is one step's
 * `run`, not a fragment.
 */
export function jobSteps(yaml, jobName) {
  const block = jobBlock(yaml, jobName);
  if (!block) return null;
  const steps = [];
  let current = null;
  let blockScalar = null;
  for (const line of block) {
    const trimmed = line.trim();
    if (blockScalar !== null) {
      // A block scalar ends at the first line indented no deeper than its key.
      if (trimmed !== '' && indentOf(line) <= blockScalar.indent) blockScalar = null;
      else { current.run += `${trimmed}\n`; continue; }
    }
    const item = /^(\s*)-\s+(.*)$/.exec(line);
    if (item) {
      current = { uses: null, name: null, run: null, with: {}, if: null, continueOnError: null };
      steps.push(current);
      const rest = item[2];
      const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(rest);
      if (kv) applyKey(kv[1], kv[2], current, indentOf(line), (b) => { blockScalar = b; });
      continue;
    }
    if (!current) continue;
    const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(trimmed);
    if (!kv) continue;
    if (kv[1] === 'with') { current.inWith = true; continue; }
    if (current.inWith && !STEP_KEYS.includes(kv[1])) {
      current.with[kv[1]] = kv[2];
      continue;
    }
    applyKey(kv[1], kv[2], current, indentOf(line), (b) => { blockScalar = b; });
  }
  return steps;

  function applyKey(key, value, step, indent, setBlock) {
    if (key === 'uses') { step.uses = value; return; }
    if (key === 'name') { step.name = value; return; }
    // A step control, never a `with:` input: both decide whether the step's
    // failure can reach the job, which is the whole point of asserting on it.
    if (key === 'if') { step.if = value; step.inWith = false; return; }
    if (key === 'continue-on-error') { step.continueOnError = value; step.inWith = false; return; }
    if (key !== 'run') return;
    step.inWith = false;
    if (value === '|' || value === '|-' || value === '>') {
      step.run = '';
      setBlock({ indent });
      return;
    }
    step.run = value;
  }
}

/** Every command a job actually executes — never anything it merely mentions. */
export const runCommands = (yaml, jobName) => (jobSteps(yaml, jobName) ?? [])
  .map((s) => s.run)
  .filter((r) => typeof r === 'string' && r.trim() !== '');

/**
 * The step that actually invokes `command`, or `null`.
 *
 * `command` is anchored to the beginning of an executable line, so a mention
 * inside another command's arguments does not qualify. Returns the whole step
 * so the caller can also ask whether it is allowed to fail.
 */
export function enforcementStep(yaml, jobName, command) {
  const anchored = new RegExp(`^${command.source ?? command}`);
  return (jobSteps(yaml, jobName) ?? [])
    .find((step) => executableLines(step.run).some((line) => anchored.test(line))) ?? null;
}

/**
 * Why a step could fail to enforce what it appears to enforce, or `null`.
 *
 * Deliberately not an expression evaluator: a gate that carries evidence should
 * be unconditional and should propagate its failure, so *any* `if:` is refused
 * rather than interpreted. The explanatory step that runs `if: failure()` is not
 * an enforcement step and never reaches this.
 */
export function stepEnforcementDefect(step) {
  if (!step) return 'the step does not exist';
  if (step.if !== null && step.if !== undefined) {
    return `the step is conditional on \`if: ${step.if}\`; an evidence gate must be unconditional`;
  }
  if (String(step.continueOnError) === 'true') {
    return 'the step sets `continue-on-error: true`; its failure would not reach the job';
  }
  return null;
}

/** The checkout depth a job requests, or `undefined` when it takes the default. */
export function checkoutDepth(yaml, jobName) {
  const step = (jobSteps(yaml, jobName) ?? []).find((s) => String(s.uses ?? '').includes('actions/checkout'));
  return step?.with?.['fetch-depth'];
}
