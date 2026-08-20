/**
 * A structural reader for the CI workflow, sufficient to assert that a gate is
 * actually wired rather than merely mentioned.
 *
 * The check this replaces was `ci.yml.includes('<command>')`, which a comment
 * satisfies. Commenting out one line disabled the only enforcement of the
 * HAC-343 judge-export reproduction while every gate stayed green — so the
 * assertion has to know the difference between a `run:` step and a `#`.
 *
 * Deliberately not a YAML parser and deliberately not a dependency: this
 * repository ships none, and the deterministic core must stay installable
 * without one. It understands exactly the subset this workflow uses —
 * two-space job keys, `- uses:`/`- name:`/`- run:` steps, `with:` maps, and
 * `run: |` block scalars — and it strips comment-only lines first, so a
 * commented command is invisible to every accessor below.
 */

/** Lines with a `#` in the first non-space position carry no configuration. */
const uncommented = (yaml) => yaml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const indentOf = (line) => line.length - line.trimStart().length;

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
 * The steps of a job, as `{ uses, name, run, with }`. `run: |` block scalars are
 * gathered so a multi-line script is one step's `run`, not a fragment.
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
      current = { uses: null, name: null, run: null, with: {} };
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
    if (current.inWith && !['uses', 'name', 'run'].includes(kv[1])) {
      current.with[kv[1]] = kv[2];
      continue;
    }
    applyKey(kv[1], kv[2], current, indentOf(line), (b) => { blockScalar = b; });
  }
  return steps;

  function applyKey(key, value, step, indent, setBlock) {
    if (key === 'uses') { step.uses = value; return; }
    if (key === 'name') { step.name = value; return; }
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

/** The checkout depth a job requests, or `undefined` when it takes the default. */
export function checkoutDepth(yaml, jobName) {
  const step = (jobSteps(yaml, jobName) ?? []).find((s) => String(s.uses ?? '').includes('actions/checkout'));
  return step?.with?.['fetch-depth'];
}
