/**
 * `bin/10-provision.sh`, read rather than run.
 *
 * ## Why this file is static analysis and nothing else
 *
 * The script's job is to create a billed Google Cloud project. There is no
 * version of "exercise it and see" that is free, and a mocked `gcloud` would
 * test the mock. So every assertion here is made against the *text* of the
 * script, and the property being asserted is one that lives in the text: the
 * order the commands appear in.
 *
 * ## The defect these tests exist for
 *
 * The script consumed four files under `${WORK_DIR}` — `cloudbuild.yaml` and
 * three `--env-vars-file` inputs — that nothing in the repository created. Under
 * `set -euo pipefail` it therefore died at P-05, which is *after* a project had
 * been created and billing linked, and it wrote `evidence/topology.json` last.
 * `teardown.mjs` refuses any id absent from that record (exit 3, by design), so
 * the failure left a live billed project that the teardown tool would not remove.
 *
 * Nothing about that was visible in any single line. It was visible only in the
 * order, which is why the order is what is checked:
 *
 *   1. every local prerequisite is established before the first command that
 *      reaches Google;
 *   2. the teardown-authority declaration is written before the first command
 *      that creates anything;
 *   3. every file the script consumes, the script produces.
 *
 * Each of the three fails against the previous version of the script.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = join(experimentDir, 'bin', '10-provision.sh');
const script = readFileSync(SCRIPT_PATH, 'utf8');
const lines = script.split('\n');

/** A shell comment carries no side effect, so no ordering claim rests on one. */
const isComment = (line) => /^\s*#/.test(line);

/**
 * The gcloud service groups this phase touches.
 *
 * Enumerated rather than matched loosely, so that `require_command gcloud` —
 * which probes for the binary and calls nothing — is not counted as a side
 * effect, and so that a new service group has to be added here deliberately.
 */
const CLOUD_GROUPS = [
  'projects',
  'billing',
  'services',
  'artifacts',
  'builds',
  'run',
  'storage',
  'ai',
  'iam',
  'compute',
];
const INVOCATION = new RegExp(`\\bgcloud\\s+(?:${CLOUD_GROUPS.join('|')})\\b`);

/** Index of the first line, ignoring comments, that matches. -1 when none does. */
function firstIndex(pattern) {
  return lines.findIndex((line) => !isComment(line) && pattern.test(line));
}

const firstInvocation = firstIndex(INVOCATION);
const declarationWrite = firstIndex(/cat\s+>\s+"\$\{TOPOLOGY\}"/);
const preflightCall = lines.findIndex((line) => /^preflight$/.test(line.trim()));

describe('nothing reaches Google before the local prerequisites are established', () => {
  it('fails the whole run rather than continuing, on any error', () => {
    // -E so the ERR trap is inherited by the functions and subshells that do the
    // rendering; without it a failure inside preflight would skip the trap.
    expect(script).toMatch(/^set -Eeuo pipefail$/m);
  });

  it('runs preflight before the first command that reaches Google', () => {
    expect(preflightCall, 'the script never calls preflight').toBeGreaterThan(-1);
    expect(firstInvocation, 'the script makes no gcloud call at all').toBeGreaterThan(-1);
    expect(preflightCall).toBeLessThan(firstInvocation);
  });

  it('validates every local prerequisite inside preflight, above the first call', () => {
    // Each of these is a way the previous script could die after a project
    // existed. They are asserted by position, not by presence: a check that runs
    // after the project was created is not a preflight check.
    const prerequisites = {
      'the gcloud CLI is on PATH': /require_command gcloud/,
      'openssl is on PATH': /require_command openssl/,
      'node is on PATH': /require_command node/,
      'the billing account is set': /require_env BILLING_ACCOUNT/,
      'the signing key is set': /require_env INTERLOCK_SIGNING_KEY_PEM/,
      'the verification keys are set': /require_env INTERLOCK_VERIFICATION_KEYS/,
      'caller-identity enforcement is an explicit boolean': /INTERLOCK_ENFORCE_CALLER_IDENTITY/,
      'the frozen manifest is readable': /\$\{MANIFEST\}/,
      'the evidence directory is writable': /-w "\$\{EVIDENCE_DIR\}"/,
      'the work directory is writable': /-w "\$\{WORK_DIR\}"/,
    };
    for (const [label, pattern] of Object.entries(prerequisites)) {
      const at = firstIndex(pattern);
      expect(at, `${label} is never checked`).toBeGreaterThan(-1);
      expect(at, `${label} is checked after the first Google side effect`).toBeLessThan(
        firstInvocation,
      );
    }
  });

  it('checks the generated id against the teardown fence before creating it', () => {
    // An id teardown cannot accept must never be created: that is the state the
    // whole restructure exists to make unreachable.
    const at = firstIndex(/\^interlock-s1-\[0-9a-f\]\{8\}\$/);
    expect(at, 'the script does not carry the disposable-id fence').toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstInvocation);
  });

  it('refuses to overwrite a declaration that may still name a live project', () => {
    const at = firstIndex(/-e "\$\{TOPOLOGY\}"/);
    expect(at, 'the script does not check for an existing declaration').toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstInvocation);
  });
});

describe('the teardown authority exists before anything billable does', () => {
  it('writes the declaration before the first command that reaches Google', () => {
    expect(declarationWrite, 'the script never writes the declaration').toBeGreaterThan(-1);
    expect(declarationWrite).toBeLessThan(firstInvocation);
  });

  it('declares the project id it generated, not one read back from Google', () => {
    // The id has to be knowable before `projects create` runs, or it cannot be
    // recorded first. Generating it locally is what makes rule 2 possible.
    const generated = firstIndex(/PROJECT_ID="interlock-s1-\$\(openssl rand -hex 4\)"/);
    expect(generated).toBeGreaterThan(-1);
    expect(generated).toBeLessThan(declarationWrite);
    expect(script.slice(0, script.indexOf('\n', script.indexOf('ACTUALS')))).toContain(
      '"projectId": "${PROJECT_ID}"',
    );
  });

  it('marks the pre-creation record as a declaration rather than as actuals', () => {
    // A record that claims resources exist before they do would make REQ-069
    // pass against a project that was never provisioned.
    expect(script).toContain('"provisioningState": "declared"');
    expect(script).toContain('"provisioningState": "provisioned"');
    const declared = script.indexOf('"provisioningState": "declared"');
    const provisioned = script.indexOf('"provisioningState": "provisioned"');
    expect(declared).toBeLessThan(provisioned);
  });

  it('tells the operator how to remove the declared project on any failure', () => {
    // A stranded project the operator cannot see is the same accident as a
    // stranded project teardown will not accept.
    expect(script).toMatch(/trap on_error ERR/);
    expect(script).toContain('--execute --confirm --verify');
    expect(script).toMatch(/teardown\.mjs/);
    const trapAt = firstIndex(/trap on_error ERR/);
    expect(trapAt).toBeLessThan(firstInvocation);
  });
});

describe('every file the script consumes, the script produces', () => {
  /** The `${WORK_DIR}` paths passed to a gcloud flag, with the line they are on. */
  const consumed = [];
  lines.forEach((line, index) => {
    if (isComment(line)) return;
    for (const match of line.matchAll(/\$\{WORK_DIR\}\/([A-Za-z0-9._-]+)/g)) {
      if (/--(config|env-vars-file)=/.test(line)) consumed.push({ name: match[1], index });
    }
  });

  it('consumes the four inputs the previous version expected to find', () => {
    expect(consumed.map((entry) => entry.name).sort()).toEqual([
      'cloudbuild.yaml',
      'proxy.env.json',
      'target-alpha.env.json',
      'target-beta.env.json',
    ]);
  });

  for (const name of [
    'cloudbuild.yaml',
    'target-alpha.env.json',
    'target-beta.env.json',
    'proxy.env.json',
  ]) {
    it(`produces ${name} before consuming it`, () => {
      const producedAt = lines.findIndex(
        (line, index) =>
          !isComment(line) &&
          line.includes(`\${WORK_DIR}/${name}`) &&
          /render_env_file|render_cloudbuild/.test(
            // The renderer name may be on this line or the one it continues from.
            `${lines[index - 1] ?? ''}\n${line}`,
          ),
      );
      expect(producedAt, `${name} is never rendered`).toBeGreaterThan(-1);
      const consumedAt = consumed.find((entry) => entry.name === name)?.index;
      expect(consumedAt, `${name} is never consumed`).toBeGreaterThan(-1);
      expect(producedAt, `${name} is consumed before it is rendered`).toBeLessThan(consumedAt);
    });
  }

  it('renders everything locally derivable during preflight', () => {
    // proxy.env.json is the one exception and it is an honest one: two of its
    // values are URLs Cloud Run assigns, so it is rendered from values read back
    // out of the cloud. Preflight still proves the renderer works, with a
    // throwaway file that is deleted rather than left as a deployable sentinel.
    for (const name of ['cloudbuild.yaml', 'target-alpha.env.json', 'target-beta.env.json']) {
      const at = lines.findIndex((line) => !isComment(line) && line.includes(`\${WORK_DIR}/${name}`));
      expect(at, `${name} is not rendered before the first Google side effect`).toBeLessThan(
        firstInvocation,
      );
    }
    const selfTest = firstIndex(/proxy\.env\.selftest\.json/);
    expect(selfTest, 'the renderer is never self-tested').toBeGreaterThan(-1);
    expect(selfTest).toBeLessThan(firstInvocation);
    expect(script).toMatch(/rm -f "\$\{WORK_DIR\}\/\.proxy\.env\.selftest\.json"/);
  });

  it('never leaves a secret on a process argument list', () => {
    // The signing key is read by name out of the environment. On argv it would
    // be visible to every other process on the host.
    expect(script).not.toMatch(/INTERLOCK_SIGNING_KEY_PEM=\$\{INTERLOCK_SIGNING_KEY_PEM\}/);
    expect(script).toMatch(/umask 077/);
  });
});

describe('what was already correct stays correct', () => {
  const uncommented = lines.filter((line) => !isComment(line)).join('\n');
  const calls = lines.filter((line) => !isComment(line) && /^\s*gcloud\s/.test(line));

  it('names the project explicitly on every call and never reads ambient config', () => {
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const line of calls) expect(line, line.trim()).toMatch(/PROJECT_ID/);
    expect(uncommented).not.toMatch(/gcloud\s+config\s+(set|get-value)/);
  });

  it('pins us-central1 for every regional resource', () => {
    expect(uncommented).toMatch(/REGION="us-central1"/);
    for (const match of uncommented.match(/--(region|location)=\S+/g) ?? []) {
      expect(match).toMatch(/us-central1|REGION/);
    }
  });

  it('exposes no Cloud Run service publicly', () => {
    const deploys = calls.filter((line) => /run deploy/.test(line));
    expect(deploys).toHaveLength(3);
    expect(uncommented).not.toMatch(/allUsers/);
    expect(uncommented).not.toMatch(/(?<!-)--allow-unauthenticated/);
    expect((uncommented.match(/--no-allow-unauthenticated/g) ?? [])).toHaveLength(3);
  });

  it('creates no gateway-shaped resource of any kind (X-01)', () => {
    for (const shape of [
      'network-security',
      'service-extensions',
      'networkAttachment',
      'authz-polic',
      'network-endpoint-groups',
      'forwarding-rules',
      'service-attachments',
      'dns managed-zones',
    ]) {
      expect(uncommented, shape).not.toContain(shape);
    }
  });
});
