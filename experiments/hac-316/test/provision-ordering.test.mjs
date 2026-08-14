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

/**
 * The X-01 predicate, imported rather than restated.
 *
 * This file used to carry its own copy of the forbidden-shape list, and the copy
 * went stale exactly as copies do: erratum E-07 added `network-services`,
 * `networkServices` and the `gateways?` noun to the real predicate — because
 * `gcloud network-services gateways create` is the command that actually creates
 * the falsified topology and the old list did not match it — and this file kept
 * the pre-E-07 list. The test named "creates no gateway-shaped resource of any
 * kind (X-01)" would therefore have passed, 20 tests green, on a script that
 * created a gateway.
 *
 * That mattered more here than anywhere else in the packet. CI runs `typecheck`,
 * `build`, `test:coverage`, `check:packet` and `check:packet:s2`; it does not run
 * the HAC-316 verifier, because `check:packet:s1` stays unwired until Phase 8. So
 * for the one file in this repository that spends money, this test file is the
 * only automated guard there is.
 *
 * `bin/verify-packet.mjs` does its work inside `main()` behind `invokedDirectly`,
 * so importing these two is free of side effects — `test/verify-packet.test.mjs`
 * already does it.
 */
import { FALSIFIED_RESOURCE_PATTERN, FALSIFIED_RESOURCE_SHAPES } from '../bin/verify-packet.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = join(experimentDir, 'bin', '10-provision.sh');
const script = readFileSync(SCRIPT_PATH, 'utf8');
const lines = script.split('\n');

/**
 * The frozen manifest, read for the half of X-01 the shared predicate omits.
 *
 * `FALSIFIED_RESOURCE_SHAPES` covers the gateway family thoroughly and the other
 * three limbs of the falsified topology not at all: a Private Service Connect
 * endpoint, an internal load balancer and DNS peering are each assembled from
 * commands with no `gateway` noun anywhere in them. The adversarial review found
 * the same hole in REQ-058's own scan, which matches only the *names* of the S0
 * topology.
 *
 * Those command shapes are declared in `evidence/resources.json` under
 * `notCreated.commandShapes` and read from there. Declared once and read, not
 * copied — copying is what produced the defect this file is fixing.
 */
const manifest = JSON.parse(readFileSync(join(experimentDir, 'evidence', 'resources.json'), 'utf8'));

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
    // The shared list, not a copy of it. If E-07 ever has a successor, this test
    // gets the correction for free instead of quietly falling a version behind.
    expect(FALSIFIED_RESOURCE_SHAPES.length).toBeGreaterThan(0);
    for (const shape of FALSIFIED_RESOURCE_SHAPES) {
      expect(uncommented, shape).not.toContain(shape);
    }
  });

  it('creates nothing the shared falsified-topology pattern matches (X-01)', () => {
    // The pattern carries `gateways?` on top of the shape list, case-insensitively,
    // which is the level X-01 is actually written at: the prohibition is on
    // building a gateway, not on any particular product surface's spelling of one.
    const offending = lines
      .filter((line) => !isComment(line) && FALSIFIED_RESOURCE_PATTERN.test(line))
      .map((line) => line.trim());
    expect(offending).toEqual([]);
  });

  it('issues no gcloud command carrying the gateway noun (X-01)', () => {
    // Asserted against the command lines specifically, so the failure names the
    // command rather than a line number. A gateway created through a group this
    // list has never heard of still has to say `gateway` somewhere on the line.
    for (const line of calls) {
      expect(line.trim(), line.trim()).not.toMatch(/\bgateways?\b/i);
    }
  });

  it('assembles no limb of the falsified topology under another name (X-01)', () => {
    // A PSC endpoint is a forwarding rule plus a service attachment; an internal
    // load balancer is a forwarding rule plus a backend service plus a proxy plus
    // a URL map; DNS peering is a managed zone with peering on it. None of those
    // words is `gateway`, and REQ-058's own scan matches only the names of the
    // falsified topology — so a scan built around the gateway noun reports X-01
    // clean while the topology is rebuilt limb by limb.
    const commandShapes = manifest.notCreated?.commandShapes ?? [];
    expect(commandShapes.length, 'the manifest declares no X-01 command shapes').toBeGreaterThan(0);
    for (const shape of commandShapes) {
      expect(uncommented, shape).not.toContain(shape);
    }
  });

  it('covers every X-01 shape the manifest names in prose', () => {
    // The prose list is what X-01 forbids; the command list is how it would be
    // spelled. This asserts the second is not narrower than the first, so that a
    // limb cannot be dropped from the checkable list while remaining forbidden.
    const commandShapes = (manifest.notCreated?.commandShapes ?? []).join(' ').toLowerCase();
    const combined = `${commandShapes} ${FALSIFIED_RESOURCE_SHAPES.join(' ').toLowerCase()}`;
    const limbs = {
      'egress gateway': 'network-services',
      'network attachment': 'network-attachments',
      'Private Service Connect endpoint': 'service-attachments',
      'internal load balancer': 'backend-services',
      'DNS peering': 'peering',
      'authorization policy': 'authz-polic',
      'service extension': 'service-extensions',
    };
    for (const [limb, spelling] of Object.entries(limbs)) {
      expect(manifest.notCreated.shapes, limb).toContain(limb);
      expect(combined, `${limb} has no checkable spelling`).toContain(spelling);
    }
  });
});

describe('the routing surface is deployed as something that listens', () => {
  const deploy = lines.find(
    (line) => !isComment(line) && /run deploy interlock-s1-proxy/.test(line),
  );
  const deployBlock = (() => {
    const start = lines.findIndex((line) => line === deploy);
    return lines.slice(start, start + 5).join('\n');
  })();

  it('deploys the ingress service as the R-08 entry point', () => {
    // `src/routing.mjs` was the entry point and is not a program: it exports
    // createRoutingSurface, serviceOf, route and dispatch, and calls none of
    // them. `node experiments/hac-316/src/routing.mjs` evaluates the module,
    // binds no port and exits 0, so Cloud Run would have reported a container
    // that never listened and the two agent runtimes would have had nowhere to
    // arrive. Nothing in the script could show that; only the entry point can.
    expect(deploy, 'the routing surface is never deployed').toBeDefined();
    expect(deployBlock).toContain('--args=experiments/hac-316/bin/ingress-service.mjs');
    expect(deployBlock).not.toContain('src/routing.mjs');
  });

  it('keeps the routing surface to a single instance (REQ-028)', () => {
    // One instance is one PendingIntentStore. A second instance is a second
    // store and the coupling stops being observable with nothing looking wrong.
    expect(deployBlock).toContain('--max-instances=1');
  });
});

describe('the two agent runtimes are provisioned as two identities', () => {
  const uncommented = lines.filter((line) => !isComment(line)).join('\n');
  const calls = lines.filter((line) => !isComment(line) && /^\s*gcloud\s/.test(line));

  it('creates a distinct service account for each agent', () => {
    const creates = calls.filter((line) => /iam service-accounts create/.test(line));
    expect(creates, 'the script creates fewer than two agent identities').toHaveLength(2);
    expect(uncommented).toMatch(/SA_A_ID="interlock-s1-agent-a"/);
    expect(uncommented).toMatch(/SA_B_ID="interlock-s1-agent-b"/);
  });

  it('refuses locally, before creating anything, if the two are the same', () => {
    // The cheap check for a typo. Positioned rather than merely present: a check
    // that runs after both accounts exist is not a preflight check.
    const at = firstIndex(/\[ "\$\{SA_A\}" = "\$\{SA_B\}" \]/);
    expect(at, 'the script never compares the two agent identities').toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstInvocation);
  });

  it('enables the API the identities need before it needs them', () => {
    // iam.googleapis.com enabled at point of first use would be enabled after
    // the image was built and three services were deployed.
    const enable = firstIndex(/iam\.googleapis\.com/);
    const create = firstIndex(/iam service-accounts create/);
    expect(enable).toBeGreaterThan(-1);
    expect(enable).toBeLessThan(create);
  });

  it('grants each agent identity the invoker role on the ingress and nothing more', () => {
    for (const sa of ['${SA_A}', '${SA_B}']) {
      const grants = calls.filter((line) => line.includes(sa) && /add-iam-policy-binding/.test(line));
      const roles = grants.flatMap((line) => line.match(/--role=\S+/g) ?? []);
      expect(grants.length, `${sa} receives no binding`).toBeGreaterThan(0);
      for (const role of roles) {
        expect(role, `${sa} is granted ${role}`).toMatch(
          /roles\/(run\.invoker|storage\.objectAdmin|iam\.serviceAccountUser)/,
        );
      }
    }
  });

  it('grants no agent identity anything at project scope', () => {
    // A project-scoped grant to an agent would let it reach the targets around
    // the ingress, which is the one path the whole design is about.
    const projectScoped = calls.filter((line) => /projects add-iam-policy-binding/.test(line));
    for (const line of projectScoped) {
      expect(line, line.trim()).not.toMatch(/interlock-s1-agent-[ab]|SA_A|SA_B/);
    }
  });
});

describe('the manifest and the script agree about the IAM bindings', () => {
  const calls = lines.filter((line) => !isComment(line) && /^\s*gcloud\s/.test(line));

  it('issues exactly one gcloud call per declared binding', () => {
    // The manifest declared five bindings while the script created three, and
    // nothing compared the two, so the difference was invisible. One row per
    // call is what makes the comparison possible at all: a row summarising two
    // scopes cannot be counted against anything.
    const declared = manifest.resources.find((resource) => resource.id === 'R-12').bindings;
    const issued = calls.filter((line) => /add-iam-policy-binding/.test(line));
    expect(issued).toHaveLength(declared.length);
  });

  it('declares every resource the script records as an actual', () => {
    const declared = new Set(manifest.resources.map((resource) => resource.id));
    const recorded = [...script.matchAll(/\{ "id": "(R-\d+)"/g)].map((match) => match[1]);
    expect(recorded.length).toBeGreaterThan(0);
    for (const id of recorded) expect(declared, id).toContain(id);
  });

  it('declares the two agent identities it creates', () => {
    // Keeping the closed set honest: two new resources exist, so two new rows
    // do. A resource nobody declared is a resource teardown verification cannot
    // look for.
    for (const id of ['R-14', 'R-15']) {
      const resource = manifest.resources.find((entry) => entry.id === id);
      expect(resource, `${id} is not declared`).toBeDefined();
      expect(resource.type).toBe('iam.serviceAccounts');
    }
    expect(script).toContain('{ "id": "R-14", "name": "${SA_A}" }');
    expect(script).toContain('{ "id": "R-15", "name": "${SA_B}" }');
  });

  it('declares which identity each reasoning engine runs as', () => {
    const a = manifest.resources.find((entry) => entry.id === 'R-09');
    const b = manifest.resources.find((entry) => entry.id === 'R-10');
    expect(a.runsAs).toContain('interlock-s1-agent-a@');
    expect(b.runsAs).toContain('interlock-s1-agent-b@');
    expect(a.runsAs).not.toBe(b.runsAs);
  });
});

describe('the identity gate stands between provisioning and the first attempt', () => {
  it('records the eligibility gate as blocked, not as satisfied', () => {
    expect(script).toContain('"state": "blocked"');
    expect(script).toContain('"blockedBy": "identity-preflight"');
    expect(script).toContain('"attemptsEligible": 0');
    expect(script).toContain('"maxAttempts": 3');
  });

  it('records the two identities the gate checks against', () => {
    expect(script).toContain('"agentIdentities"');
    expect(script).toMatch(/"A": \{ "serviceAccount": "\$\{SA_A\}"/);
    expect(script).toMatch(/"B": \{ "serviceAccount": "\$\{SA_B\}"/);
  });

  it('encodes the order with the gate before any attempt', () => {
    const order = script.slice(script.indexOf('"order": ['), script.indexOf('"maxAttempts"'));
    const gate = order.indexOf('effectiveIdentity');
    const distinct = order.indexOf('fail closed unless');
    const transport = order.indexOf('actual experiment transport');
    const attempt = order.indexOf('attempt 1');
    for (const [label, at] of Object.entries({ gate, distinct, transport, attempt })) {
      expect(at, `the order does not mention ${label}`).toBeGreaterThan(-1);
    }
    // Read back, fail closed, prove on the wire, and only then attempt.
    expect(gate).toBeLessThan(distinct);
    expect(distinct).toBeLessThan(transport);
    expect(transport).toBeLessThan(attempt);
  });

  it('offers the operator no path to an attempt that skips the gate', () => {
    expect(script).toMatch(/identity-preflight\.mjs/);
    expect(script).toContain('FAIL/PIVOT');
    // The tempting repair, refused in the script's own words rather than only in
    // the gate's code, because the operator reads this file and not that one.
    expect(script).toMatch(/caller-supplied identity header/);
  });
});
