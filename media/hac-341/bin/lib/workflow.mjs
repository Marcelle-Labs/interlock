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
 * It does not try to decide which lines of a shell script execute, because that
 * is not decidable by reading: `if false; then`, a heredoc and an open quoted
 * string each put a command at the start of a line without running it, and a
 * line-anchored match accepted all three. The contract is a *shape* instead —
 * one enforcement operation per step, whose `run` is exactly the expected
 * command — and this module reports the shape rather than guessing at
 * semantics. Callers assert; nothing here evaluates a GitHub expression.
 */

/** Lines with a `#` in the first non-space position carry no configuration. */
const uncommented = (yaml) => yaml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const indentOf = (line) => line.length - line.trimStart().length;

/** Keys that belong to the step itself, never to its `with:` inputs. */
const STEP_KEYS = ['uses', 'name', 'run', 'if', 'continue-on-error', 'shell', 'working-directory'];

/** Job-level keys that decide whether a job runs, or whether its failure counts. */
const JOB_KEYS = ['if', 'continue-on-error', 'needs', 'runs-on'];

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
      current = {
        uses: null, name: null, run: null, with: {},
        if: null, continueOnError: null, shell: null, workingDirectory: null,
      };
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
    // A custom shell or a different working directory changes what the command
    // means; an enforcement step must run the command as written, where written.
    if (key === 'shell') { step.shell = value; step.inWith = false; return; }
    if (key === 'working-directory') { step.workingDirectory = value; step.inWith = false; return; }
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
 * The step whose entire `run` payload is `command`, or `null`.
 *
 * Equality after trimming, not a search. A step that runs the command plus
 * anything else is not an enforcement step: whether the rest of the script
 * reaches the command cannot be read off the text, which is exactly how
 * `if false; then`, a heredoc and an open quoted string each defeated a
 * line-anchored match.
 */
export function enforcementStep(yaml, jobName, command) {
  return (jobSteps(yaml, jobName) ?? [])
    .find((step) => typeof step.run === 'string' && step.run.trim() === command) ?? null;
}

/** `continue-on-error` is trustworthy only when absent or the literal `false`. */
function continueOnErrorDefect(value, subject) {
  if (value === null || value === undefined) return null;
  if (String(value).trim() === 'false') return null;
  return `${subject} sets \`continue-on-error: ${value}\`; only an absent or literally \`false\` value can be trusted`;
}

/**
 * Why a step could fail to enforce what it appears to enforce, or `null`.
 *
 * Deliberately not an expression evaluator. An evidence gate should be
 * unconditional, should run its command as written and where written, and
 * should propagate its failure — so any `if:`, any `shell:`, any
 * `working-directory:` and any non-literal-`false` `continue-on-error:` is
 * refused rather than interpreted. The explanatory step that runs
 * `if: failure()` is not an enforcement step and never reaches this.
 */
export function stepEnforcementDefect(step) {
  if (!step) return 'no step runs exactly that command';
  if (step.if !== null && step.if !== undefined) {
    return `the step is conditional on \`if: ${step.if}\`; an evidence gate must be unconditional`;
  }
  const coe = continueOnErrorDefect(step.continueOnError, 'the step');
  if (coe) return coe;
  if (step.shell !== null && step.shell !== undefined) {
    return `the step sets \`shell: ${step.shell}\`; an enforcement step must run its command as written`;
  }
  if (step.workingDirectory !== null && step.workingDirectory !== undefined) {
    return `the step sets \`working-directory: ${step.workingDirectory}\`; an enforcement step must run where written`;
  }
  return null;
}

/**
 * The job-level controls.
 *
 * Every step can be unconditional and failure-propagating while the job around
 * them is skipped (`if: false`) or has its failure discarded
 * (`continue-on-error: true`). Both leave every step-level assertion satisfied
 * and enforce nothing.
 */
export function jobControls(yaml, jobName) {
  const block = jobBlock(yaml, jobName);
  if (!block) return null;
  const out = { if: null, continueOnError: null, needs: null, runsOn: null };
  for (const line of block) {
    // Job-level keys sit at exactly four spaces; deeper belongs to a step.
    if (indentOf(line) !== 4) continue;
    const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(line.trim());
    if (!kv || !JOB_KEYS.includes(kv[1])) continue;
    if (kv[1] === 'if') out.if = kv[2];
    if (kv[1] === 'continue-on-error') out.continueOnError = kv[2];
    if (kv[1] === 'needs') out.needs = kv[2];
    if (kv[1] === 'runs-on') out.runsOn = kv[2];
  }
  return out;
}

/** Why the job could fail to enforce what its steps enforce, or `null`. */
export function jobEnforcementDefect(controls, expectedRunner) {
  if (!controls) return 'the job does not exist';
  if (controls.if !== null && controls.if !== undefined) {
    return `the job is conditional on \`if: ${controls.if}\`; an evidence gate must be unconditional`;
  }
  const coe = continueOnErrorDefect(controls.continueOnError, 'the job');
  if (coe) return coe;
  if (controls.needs !== null && controls.needs !== undefined) {
    return `the job declares \`needs: ${controls.needs}\`; a skipped or failed dependency would silently skip this gate`;
  }
  if (controls.runsOn !== expectedRunner) {
    return `the job runs on \`${controls.runsOn}\`, not \`${expectedRunner}\``;
  }
  return null;
}

/** The checkout depth a job requests, or `undefined` when it takes the default. */
export function checkoutDepth(yaml, jobName) {
  const step = (jobSteps(yaml, jobName) ?? []).find((s) => String(s.uses ?? '').includes('actions/checkout'));
  return step?.with?.['fetch-depth'];
}
