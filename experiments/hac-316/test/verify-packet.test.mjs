/**
 * The packet verifier's own contracts: which requirements it covers, which
 * selector it was asked for, and which of three terminal states it ended in.
 *
 * These are not tests of the requirements. They are tests of the machinery that
 * decides *whether a requirement was evaluated at all* — the layer where the
 * three defects this file was written against lived:
 *
 *   - six requirements the spec declared were absent from the ledger entirely,
 *     so `REQ 52/68 PASS` was a percentage of the wrong denominator;
 *   - `--req REQ-071,REQ-072,REQ-073` matched no branch and fell through to a
 *     full sweep, so §7.7's teardown gate read a number about something else;
 *   - a pre-cloud packet and a broken one printed the same last line and the
 *     same exit code, so neither could be checked for.
 *
 * Each is a way of appearing to check something without checking it, which is
 * the only failure mode a verifier has.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  codeWithoutCommentLines,
  EXECUTABLE_SURFACE,
  EXECUTABLE_SURFACE_EXTENSIONS,
  FALSIFIED_RESOURCE_PATTERN,
  FALSIFIED_RESOURCE_SHAPES,
  implementationFreshness,
  SERVER_ENTRY_POINT_MARKERS,
  serverEntryPointGaps,
  isVacuousPass,
  judgeRefusalProbe,
  MODES,
  parseMode,
  parseSpecRequirementIds,
  producerOutputs,
  referencedAdkModules,
  REGENERATED_OUTPUTS,
  refusalProbes,
  requirementSetCorrespondence,
  terminalState,
  VACUOUS_DETAIL,
} from '../bin/verify-packet.mjs';
import { Refusal } from '../bin/teardown.mjs';
import { implementationDigest } from '../bin/run-arm.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');
const teardown = join(experimentDir, 'bin', 'teardown.mjs');

const runVerifier = (...argv) =>
  spawnSync(process.execPath, [verifier, ...argv], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

// ---------------------------------------------------------------------------
// The selector
// ---------------------------------------------------------------------------

describe('the selector is parsed, never guessed', () => {
  it('defaults to a full sweep only when nothing was asked for', () => {
    expect(parseMode([])).toEqual({ mode: '--all', requirements: null });
  });

  it('reads --req in both spellings', () => {
    expect(parseMode(['--req', 'REQ-071,REQ-072'])).toEqual({
      mode: '--req',
      requirements: ['REQ-071', 'REQ-072'],
    });
    expect(parseMode(['--req=REQ-071,REQ-072'])).toEqual({
      mode: '--req',
      requirements: ['REQ-071', 'REQ-072'],
    });
  });

  it('refuses an unknown selector instead of falling through to --all', () => {
    // The regression. `--counterfactuel` used to be read as "the first argument
    // beginning with --", match no branch, and run the whole packet.
    expect(() => parseMode(['--counterfactuel'])).toThrow(/unknown selector/);
    for (const mode of MODES) expect(() => parseMode([mode, 'REQ-001'])).not.toThrow(/unknown/);
  });

  it('refuses --req with no list rather than reading it as "everything"', () => {
    expect(() => parseMode(['--req'])).toThrow(/comma-separated list/);
    expect(() => parseMode(['--req='])).toThrow(/comma-separated list/);
    expect(() => parseMode(['--req', ' , '])).toThrow(/comma-separated list/);
  });

  it('refuses something that is not a requirement id', () => {
    expect(() => parseMode(['--req', 'REQ-71'])).toThrow(/not a requirement id/);
    expect(() => parseMode(['--req', 'teardown'])).toThrow(/not a requirement id/);
  });

  it('refuses two selectors, because two answers is no answer', () => {
    expect(() => parseMode(['--req', 'REQ-071', '--all'])).toThrow(/one selector at a time/);
  });

  // 60_000, matching its neighbours, and for the same reason. Each of the four
  // selectors is refused in about 100ms, so the budget is not about this test's
  // own work: it is about what else the runner is doing while it runs. The suite
  // spawns vitest-in-vitest and teardown subprocesses in parallel, a full sweep
  // takes ~14s, and four sequential `spawnSync` calls contending with that came
  // in at 4858ms against the 5000ms default — a pass by 3%, which is a fail on a
  // slower machine. Nothing here is timing-sensitive by design, so the budget is
  // set well clear of the contention rather than tuned to it.
  it('exits 2 on every unknown or missing selector, and never sweeps', () => {
    for (const argv of [['--counterfactuel'], ['--req'], ['--req', 'REQ-999'], ['--req', 'REQ-71']]) {
      const run = runVerifier(...argv);
      expect(run.status, argv.join(' ')).toBe(2);
      // The load-bearing half: nothing that looks like a result was printed.
      expect(run.stdout).not.toMatch(/REQ \d+\/\d+ PASS/);
      expect(run.stdout).not.toMatch(/PACKET/);
    }
  }, 60_000);

  it('evaluates exactly the requirements named, and no others', () => {
    const run = runVerifier('--req', 'REQ-071,REQ-072');
    expect(run.stdout).toMatch(/^REQ 2\/2 PASS$/m);
    expect(run.status).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The requirement set
// ---------------------------------------------------------------------------

describe('the ledger is the spec\'s requirement set, exactly', () => {
  it('parses ids from requirement headings and not from prose mentions', () => {
    const ids = parseSpecRequirementIds(
      ['**REQ-001 — a heading**', 'prose citing REQ-002 in passing', '**REQ-074 — another**'].join(
        '\n',
      ),
    );
    expect([...ids].sort()).toEqual(['REQ-001', 'REQ-074']);
  });

  it('finds all 85 declared requirements in SPEC.md, including REQ-080 … REQ-085', () => {
    const ids = parseSpecRequirementIds(readFileSync(join(experimentDir, 'SPEC.md'), 'utf8'));
    expect(ids.size).toBe(85);
    for (const id of [
      'REQ-069', 'REQ-074', 'REQ-075', 'REQ-076', 'REQ-077', 'REQ-078', 'REQ-079',
      'REQ-080', 'REQ-081', 'REQ-082', 'REQ-083', 'REQ-084', 'REQ-085',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('reports a difference in either direction', () => {
    const both = requirementSetCorrespondence({
      specIds: new Set(['REQ-001', 'REQ-069']),
      verifierIds: new Set(['REQ-001', 'REQ-002']),
    });
    expect(both).toEqual({ missing: ['REQ-069'], extra: ['REQ-002'], agrees: false });
    expect(
      requirementSetCorrespondence({
        specIds: new Set(['REQ-001']),
        verifierIds: new Set(['REQ-001']),
      }).agrees,
    ).toBe(true);
  });

  it('proves the correspondence on the real packet, in every sweeping mode', () => {
    // The proof itself: run the verifier and read the line it prints. Fails if a
    // requirement is added to SPEC.md that the verifier does not evaluate — which
    // is exactly how REQ-069 … REQ-074 went uncounted.
    const run = runVerifier('--req', 'REQ-001');
    expect(run.stdout).toMatch(/^REQ-SET {2}spec=85 verifier=85 missing=0 extra=0$/m);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The terminal state
// ---------------------------------------------------------------------------

const entry = (outcome, gate = null) => ({ id: 'REQ-001', phase: 7, outcome, detail: '', gate });

describe('a pre-cloud packet is distinguishable from a broken one', () => {
  it('is OK only when nothing is outstanding', () => {
    const verdict = terminalState({ outcomes: [entry('PASS'), entry('PASS')], setAgrees: true });
    expect(verdict.state).toBe('OK');
    expect(verdict.exitCode).toBe(0);
  });

  it('is pre-cloud clean when every gap names the phase it awaits', () => {
    const verdict = terminalState({
      outcomes: [entry('PASS'), entry('NOT_EXERCISED', 'phase-7')],
      setAgrees: true,
    });
    expect(verdict.state).toBe('PRE_CLOUD_CLEAN');
    expect(verdict.exitCode).toBe(3);
  });

  it('is incomplete when a gap names no phase', () => {
    // The distinction that makes the middle state safe. A `NOT_EXERCISED` with
    // no gate is the suite failing to collect, not a phase waiting its turn — and
    // if it counted as clean, the state would be reachable by declining to run
    // checks.
    const verdict = terminalState({
      outcomes: [entry('PASS'), entry('NOT_EXERCISED', null)],
      setAgrees: true,
    });
    expect(verdict.state).toBe('INCOMPLETE');
    expect(verdict.exitCode).toBe(1);
    expect(verdict.ungated).toHaveLength(1);
  });

  it('is incomplete on any failure or spec defect, gated gaps notwithstanding', () => {
    for (const bad of ['FAIL', 'SPEC_DEFECT']) {
      const verdict = terminalState({
        outcomes: [entry(bad), entry('NOT_EXERCISED', 'phase-7')],
        setAgrees: true,
      });
      expect(verdict.state, bad).toBe('INCOMPLETE');
      expect(verdict.exitCode, bad).toBe(1);
    }
  });

  it('is incomplete when the requirement set does not match, however many passed', () => {
    const verdict = terminalState({ outcomes: [entry('PASS')], setAgrees: false });
    expect(verdict.state).toBe('INCOMPLETE');
    expect(verdict.exitCode).toBe(1);
  });

  it('exits 3, not 1, for a gated gap on the real packet', () => {
    const run = runVerifier('--req', 'REQ-071,REQ-072,REQ-073');
    expect(run.stdout).toMatch(/NOT_EXERCISED {2}REQ-073/);
    expect(run.stdout).toMatch(/^REQ 2\/3 PASS$/m);
    expect(run.status).toBe(3);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// REQ-009's extraction (E-04)
// ---------------------------------------------------------------------------

describe('the ADK import extraction scans what the frozen command scanned', () => {
  const fixture = {
    '/agents': ['_toolset.py', 'notes.txt', '__pycache__'],
    '/agents/__pycache__': ['_toolset.cpython-312.pyc'],
  };
  const contents = {
    '/agents/_toolset.py': 'from google.adk.tools.mcp_tool.mcp_toolset import McpToolset',
    '/agents/notes.txt': 'see google.adk.tools.mcp_tool.sneaky for details',
    '/agents/__pycache__/_toolset.cpython-312.pyc': 'google.adk.tools.mcp_tool.mcp_toolset',
  };
  const io = {
    readDir: (dir) => fixture[dir],
    isDirectory: (path) => path in fixture,
    readFile: (path) => contents[path],
  };

  it('sees a reference in a file that is not a .py file', () => {
    // The disclosure in §0.7. The corrected command briefly carried an extension
    // filter the frozen command did not have, so a plain text file naming an ADK
    // path was invisible to the check and visible to the command it replaced.
    // Narrowing scope is the one thing an erratum may not do quietly.
    const referenced = referencedAdkModules('/agents', io);
    expect([...referenced].sort()).toEqual([
      'google.adk.tools.mcp_tool.mcp_toolset',
      'google.adk.tools.mcp_tool.sneaky',
    ]);
  });

  it('skips __pycache__, which only ever echoes the .py file beside it', () => {
    const seen = [];
    referencedAdkModules('/agents', { ...io, readFile: (path) => (seen.push(path), contents[path]) });
    expect(seen.some((path) => path.includes('__pycache__'))).toBe(false);
  });

  it('finds both real ADK modules in the committed agents', () => {
    const referenced = referencedAdkModules(join(experimentDir, 'agents'));
    expect([...referenced].sort()).toEqual([
      'google.adk.tools.mcp_tool.mcp_session_manager',
      'google.adk.tools.mcp_tool.mcp_toolset',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The four corrected requirements
// ---------------------------------------------------------------------------

describe('a ratified erratum is the operative command, and passing it is a pass', () => {
  it('reports REQ-009, REQ-027, REQ-058 and REQ-064 as passes naming their erratum', () => {
    const run = runVerifier('--req', 'REQ-009,REQ-027,REQ-058,REQ-064');
    expect(run.stdout).not.toMatch(/SPEC_DEFECT/);
    expect(run.stdout).toMatch(/^REQ 4\/4 PASS$/m);
    expect(run.status).toBe(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Phase 7 artifacts
// ---------------------------------------------------------------------------

describe('the Phase 7 declaration exists before the phase does', () => {
  const manifest = JSON.parse(
    readFileSync(join(experimentDir, 'evidence', 'resources.json'), 'utf8'),
  );

  it('declares itself the closed set and enumerates at least 11 resources', () => {
    expect(manifest.closedSet).toBe(true);
    expect(manifest.recordedBeforeProvisioning).toBe(true);
    expect(manifest.resources.length).toBeGreaterThanOrEqual(11);
  });

  it('gives every resource an id, a type, a purpose and a legal location', () => {
    for (const resource of manifest.resources) {
      expect(resource.id, JSON.stringify(resource)).toBeTruthy();
      expect(resource.type, resource.id).toBeTruthy();
      expect(resource.purpose, resource.id).toBeTruthy();
      if (resource.location) expect(['global', 'us-central1']).toContain(resource.location);
    }
    const ids = manifest.resources.map((resource) => resource.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares no resource from the topology HAC-325 falsified (X-01)', () => {
    for (const resource of manifest.resources) {
      expect(
        /networkAttachment|serviceExtension|authorizationPolicy|egressGateway/i.test(
          `${resource.type}${resource.id}`,
        ),
        resource.id,
      ).toBe(false);
    }
  });

  it('passes REQ-070 and gates REQ-069 on provisioning it has not had', () => {
    const run = runVerifier('--req', 'REQ-069,REQ-070');
    expect(run.stdout).toMatch(/NOT_EXERCISED {2}REQ-069.*awaits provisioning/);
    expect(run.stdout).not.toMatch(/^FAIL/m);
    expect(run.stdout).toMatch(/^REQ 1\/2 PASS$/m);
    expect(run.status).toBe(3);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// A registered requirement that evaluates nothing (C8)
// ---------------------------------------------------------------------------

describe('a requirement cannot be counted as covered while checking nothing', () => {
  it('calls a pass with no assertions behind it what it is', () => {
    expect(isVacuousPass('PASS', 0)).toBe(true);
    expect(isVacuousPass('PASS', 1)).toBe(false);
    // Only a *pass* is a claim that needed evidence. A gated gap legitimately
    // returns before asserting anything, and a failure already says so.
    expect(isVacuousPass('NOT_EXERCISED', 0)).toBe(false);
    expect(isVacuousPass('FAIL', 0)).toBe(false);
    expect(isVacuousPass('SPEC_DEFECT', 0)).toBe(false);
  });

  it('turns every requirement red when the bodies are emptied out', () => {
    // The control. `check` registers the id before the body runs and records
    // PASS for a body that returns undefined, so an empty body counted in the
    // denominator, satisfied the REQ-SET correspondence, and reported PASS.
    // Under the fault every body *is* empty, so every id must fail.
    const broken = spawnSync(
      process.execPath,
      [verifier, '--req', 'REQ-001,REQ-012,REQ-063'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, HAC316_FAULT_INJECT: 'vacuous-requirement', VITEST: '' },
      },
    );
    expect(broken.stdout).toMatch(/^REQ 0\/3 PASS$/m);
    expect(broken.status).toBe(1);
    for (const id of ['REQ-001', 'REQ-012', 'REQ-063']) {
      expect(broken.stdout, id).toContain(`FAIL           ${id}`);
    }
    expect(broken.stdout).toContain(VACUOUS_DETAIL);

    // And the same three, intact, still pass — so the test above is not passing
    // because the command is broken all the time.
    const clean = runVerifier('--req', 'REQ-001,REQ-012,REQ-063');
    expect(clean.stdout).toMatch(/^REQ 3\/3 PASS$/m);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// The erratum log records the two corrections this round made (E-06, E-07)
// ---------------------------------------------------------------------------

describe('the retry claim is narrowed to the one that is checkable (E-06)', () => {
  const spec = readFileSync(join(experimentDir, 'SPEC.md'), 'utf8');

  it('records both errata in the index rather than only in prose', () => {
    expect(spec).toMatch(/^\| E-06 \| §0\.9 \| X-05/m);
    expect(spec).toMatch(/^\| E-07 \| §0\.10 \| REQ-058/m);
    expect(spec).toContain('### 0.9 ERRATUM E-06');
    expect(spec).toContain('### 0.10 ERRATUM E-07');
  });

  it('states the narrowed claim, and states the false one only as superseded', () => {
    const falseClaim = 'There is no retry pool at the harness, ADK, HTTP or model layer';
    // Quoted exactly once, under §0.9, as the claim being withdrawn. A second
    // occurrence would mean the packet still asserts it somewhere.
    expect(spec.split(falseClaim)).toHaveLength(2);
    expect(spec.slice(0, spec.indexOf(falseClaim))).toContain('**The claim as it stood.**');

    expect(spec).toContain('No runtime retry occurred in an accepted trial');
    expect(spec).toContain('mcp_tool.py:395');
  });

  it('does not weaken X-05, and says so where X-05 is stated', () => {
    const row = spec.split('\n').find((line) => line.startsWith('| X-05 |'));
    expect(row).toContain('**Do not hide invalid or model-failure attempts.**');
    expect(row).toContain('Every attempt is retained and reported.');
    expect(row).toContain('Not weakened by E-06');
    expect(row).not.toMatch(/unless|except|no longer|may be omitted/i);
  });

  it('flags the field that carried the old reading, at the requirement that reads it', () => {
    const req051 = spec.slice(spec.indexOf('**REQ-051 —'), spec.indexOf('**REQ-052 —'));
    expect(req051).toContain('ERRATUM E-06');
    expect(req051).toContain('platformRetryIsDetectedNotAssumedAbsent');
    // The command itself is untouched: an erratum that rewrote it would be
    // relaxing the requirement rather than correcting a reading of it.
    expect(req051).toContain('"artificialDelay","barrier","ttlTuning","hiddenRetry"');
  });
});

// ---------------------------------------------------------------------------
// The executable surface REQ-058 scans (E-07)
// ---------------------------------------------------------------------------

describe('the prohibition scan reaches the file that creates cloud resources', () => {
  it('includes shell scripts, which the frozen --include list did not', () => {
    expect(EXECUTABLE_SURFACE_EXTENSIONS).toContain('sh');
    expect(EXECUTABLE_SURFACE.test('10-provision.sh')).toBe(true);
    // And still everything the frozen list named — a widening may not drop
    // anything on its way in.
    for (const name of ['run-arm.mjs', 'results.json', 'agent.py', 'ci.yaml']) {
      expect(EXECUTABLE_SURFACE.test(name), name).toBe(true);
    }
    expect(EXECUTABLE_SURFACE.test('SPEC.md')).toBe(false);
  });

  it('matches the command that actually creates a gateway', () => {
    // The blind spot, exactly. The old blocklist named `network-security`; the
    // command is `gcloud network-services gateways create`, and the old
    // manifest pattern named four API type words none of which match it.
    const real = 'gcloud network-services gateways create hac316-s1-gw --project="${PROJECT_ID}"';
    const wasChecked = ['network-security', 'service-extensions', 'networkAttachment', 'authz-polic', 'network-endpoint-groups'];
    const wasPattern = /networkAttachment|serviceExtension|authorizationPolicy|egressGateway/i;
    expect(wasChecked.some((shape) => real.includes(shape))).toBe(false);
    expect(wasPattern.test(real)).toBe(false);

    expect(FALSIFIED_RESOURCE_SHAPES.some((shape) => real.includes(shape))).toBe(true);
    expect(FALSIFIED_RESOURCE_PATTERN.test(real)).toBe(true);
    expect(FALSIFIED_RESOURCE_PATTERN.test('{"type":"gateway","id":"R-14"}')).toBe(true);
    // Nothing the real manifest declares may match, or the check is a blanket
    // refusal rather than a prohibition.
    const manifest = JSON.parse(
      readFileSync(join(experimentDir, 'evidence', 'resources.json'), 'utf8'),
    );
    for (const resource of manifest.resources) {
      expect(FALSIFIED_RESOURCE_PATTERN.test(`${resource.type}${resource.id}`), resource.id).toBe(
        false,
      );
    }
  });

  it('reports having scanned the provisioning script, not merely passing', () => {
    const run = runVerifier('--req', 'REQ-058,REQ-070');
    expect(run.stdout).toMatch(/^REQ 2\/2 PASS$/m);
    expect(run.status).toBe(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// The refusal REQ-072 asserts (C2)
// ---------------------------------------------------------------------------

describe('a refusal probe proves which gate refused it', () => {
  const declared = 'interlock-s1-abcd1234';

  it('expects the declaration gate before Phase 7 and the mismatch gate after', () => {
    const before = refusalProbes(null);
    expect(before).toHaveLength(4);
    expect(before[0]).toMatchObject({
      probe: 'interlock-s1-deadbeef',
      expected: Refusal.NOT_DECLARED,
    });

    const after = refusalProbes(declared);
    expect(after).toHaveLength(5);
    expect(after[0].expected).toBe(Refusal.UNDECLARED_ID);
    expect(after.at(-1)).toMatchObject({
      probe: `${declared}x`,
      expected: Refusal.NOT_DISPOSABLE,
    });
    // The declared project is never probed: refusing it would be the bug.
    expect(refusalProbes('interlock-s1-deadbeef').map((entry) => entry.probe)).not.toContain(
      'interlock-s1-deadbeef',
    );
  });

  it('accepts the refusal each gate really produces', () => {
    expect(
      judgeRefusalProbe({
        probe: 'my-production-project',
        expected: Refusal.NOT_DISPOSABLE,
        gate: 'G-4 (shape)',
        status: 4,
        stdout: `teardown-refused=${Refusal.NOT_DISPOSABLE}\nREFUSED\n`,
        invocations: '',
      }),
    ).toEqual([]);
  });

  it('catches the reverted operand parser the old band assertion let through', () => {
    // The regression, replayed. With `--project=<id>` unparsed every probe
    // refuses as PROJECT_ID_NOT_SUPPLIED at exit 2 with an empty log — inside
    // the old 2-4 band, log empty, `REQ 1/1 PASS`, nothing tested.
    const reverted = {
      status: 2,
      stdout: `teardown-refused=${Refusal.NOT_SUPPLIED}\nREFUSED\n`,
      invocations: '',
    };
    const band = (status) => status >= 2 && status <= 4;
    expect(band(reverted.status) && reverted.invocations === '').toBe(true);

    for (const { probe, expected, gate } of refusalProbes(declared)) {
      const problems = judgeRefusalProbe({ probe, expected, gate, ...reverted });
      expect(problems.length, probe).toBeGreaterThan(0);
      expect(problems.join(' '), probe).toContain(Refusal.NOT_SUPPLIED);
    }
  });

  it('catches a right code at the wrong exit, and a refusal that spawned first', () => {
    expect(
      judgeRefusalProbe({
        probe: 'interlock-s0-gate',
        expected: Refusal.NOT_DISPOSABLE,
        gate: 'G-4 (shape)',
        status: 2,
        stdout: `teardown-refused=${Refusal.NOT_DISPOSABLE}\n`,
        invocations: '',
      }).join(' '),
    ).toContain('exit 2, expected 4');

    expect(
      judgeRefusalProbe({
        probe: 'interlock-s0-gate',
        expected: Refusal.NOT_DISPOSABLE,
        gate: 'G-4 (shape)',
        status: 4,
        stdout: `teardown-refused=${Refusal.NOT_DISPOSABLE}\n`,
        invocations: 'projects delete interlock-s0-gate',
      }).join(' '),
    ).toContain('spawned gcloud before refusing');

    // No reason line at all is not a pass either: it is a refusal whose reason
    // is unknown, which is what asserting a band amounts to.
    expect(
      judgeRefusalProbe({
        probe: 'interlock-s0-gate',
        expected: Refusal.NOT_DISPOSABLE,
        gate: 'G-4 (shape)',
        status: 4,
        stdout: 'REFUSED\n',
        invocations: '',
      }).join(' '),
    ).toContain('refusal reason unknown');
  });
});

// ---------------------------------------------------------------------------
// The implementation the packet is evidence about (C3)
// ---------------------------------------------------------------------------

describe('the recorded implementation is compared to the one on disk', () => {
  const armsAll = (digest) => ({
    baseline: { implementationDigest: digest },
    treatment: { implementationDigest: digest },
    perturbation: { implementationDigest: digest },
  });

  it('accepts three arms that agree with the tree', () => {
    const measured = implementationDigest();
    expect(implementationFreshness(armsAll(measured), measured)).toEqual([]);
  });

  it('rejects three zeroed digests, which agree with each other perfectly', () => {
    const problems = implementationFreshness(armsAll('0'.repeat(64)), implementationDigest());
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toContain('is not the implementation on disk');
  });

  it('rejects three equally stale digests', () => {
    // The case the arms-against-arms comparison is blind to by construction: a
    // results.json produced before the code moved is internally consistent and
    // describes a program that no longer exists.
    const stale = 'a'.repeat(64);
    expect(implementationFreshness(armsAll(stale), implementationDigest())).toHaveLength(3);
  });

  it('rejects an arm with no digest at all', () => {
    expect(
      implementationFreshness({ baseline: {} }, implementationDigest()).join(' '),
    ).toContain('no implementation digest was measured');
  });
});

// ---------------------------------------------------------------------------
// REQ-067's comparison set (C4)
// ---------------------------------------------------------------------------

describe('the regeneration comparison covers everything the producer writes', () => {
  const producer = readFileSync(join(experimentDir, 'bin', 'preflight-v2.mjs'), 'utf8');

  it('reads the producer\'s outputs out of the producer', () => {
    expect(producerOutputs(producer)).toEqual(['fixture.json', 'preflight.v2.json']);
  });

  it('fails on the revert that used to leave the suite green', () => {
    // REQ-067's list was `['preflight.v2.json']` alone, so an in-place rewrite
    // of `fixture.json` was invisible inside the run that caused it — and
    // reverting the widened list broke nothing that anything checked. This is
    // the assertion the requirement now makes before comparing a single byte.
    const agrees = (list) =>
      JSON.stringify([...list].sort()) === JSON.stringify(producerOutputs(producer));
    expect(agrees(REGENERATED_OUTPUTS)).toBe(true);
    expect(agrees(['preflight.v2.json'])).toBe(false);
    expect(agrees(['preflight.v2.json', 'fixture.json', 'toolchain.json'])).toBe(false);
  });

  it('would notice a third output rather than quietly not comparing it', () => {
    const widened = `${producer}\nwriteFileSync(join(evidenceDir, 'third.json'), '{}');\n`;
    expect(producerOutputs(widened)).toContain('third.json');
    expect(
      JSON.stringify([...REGENERATED_OUTPUTS].sort()) === JSON.stringify(producerOutputs(widened)),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The ingress retry contract (C7)
// ---------------------------------------------------------------------------

describe('the ingress retry rulings are checked, not merely written down', () => {
  it('evaluates all five, and every assertion in them holds on this packet', () => {
    const run = runVerifier('--req', 'REQ-075,REQ-076,REQ-077,REQ-078,REQ-079');
    // Nothing failed. Each of the five runs its packet assertions *and* re-runs
    // the real judgement over an input that must be refused, so a green line
    // here is a statement about the detector and not only about a clean run.
    expect(run.stdout).not.toMatch(/^FAIL/m);
    expect(run.stdout).toMatch(/^REQ-SET {2}spec=85 verifier=85 missing=0 extra=0$/m);

    // Three of the five end by requiring the ingress suite, which cannot be
    // collected from inside a vitest run — that is the pre-existing
    // suite-backed pattern (REQ-025, REQ-028, …), not a gap in these. The two
    // that do not need it pass outright here.
    for (const id of ['REQ-075', 'REQ-077']) {
      expect(run.stdout, id).not.toContain(id);
    }
    for (const id of ['REQ-076', 'REQ-078', 'REQ-079']) {
      expect(run.stdout, id).toMatch(
        new RegExp(`NOT_EXERCISED {2}${id} \\(phase 7\\) {2}test suite not run here`),
      );
    }
  }, 180_000);

  it('names the ingress suite the rulings are bound to', () => {
    // The three suite-backed requirements name R2, R4 and R5 by title, so a
    // suite that stopped covering a ruling turns them red rather than passing
    // on a file that happens to still exist.
    const suite = readFileSync(join(experimentDir, 'test', 'ingress-arrivals.test.mjs'), 'utf8');
    for (const ruling of [
      'R1: the ingress retains every arrival',
      'R2: a duplicate arrival is not dispatched a second time',
      'R3: a runtime retry is INVALID_TRIAL:RUNTIME_RETRY_OBSERVED',
      'R4: an accepted trial requires one A arrival and one B arrival',
      'R5: overlap pairs agents, not positions',
    ]) {
      expect(suite, ruling).toContain(ruling);
    }
  });
});

// ---------------------------------------------------------------------------
// The teardown probe REQ-059 spawns
// ---------------------------------------------------------------------------

describe('the teardown probe refuses for the reason it claims', () => {
  const refuse = (projectId) =>
    spawnSync(process.execPath, [teardown, '--verify', '--project', projectId], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'ambient-must-be-ignored' },
    });

  it('refuses a well-formed disposable id nothing declared, at the declaration gate', () => {
    // The old probe passed `hac316-s1-not-declared`, which the shape fence
    // rejects at G-4 on its *name* — so REQ-059 reported that an undeclared
    // project had been refused while the declaration gate was never reached.
    const refused = refuse('interlock-s1-deadbeef');
    expect(refused.status).toBe(3);
    expect(refused.stdout).toContain('REFUSED');
    expect(refused.stdout).not.toContain('PASS');
  }, 30_000);

  it('refuses a non-disposable id at the shape fence', () => {
    const refused = refuse('my-production-project');
    expect(refused.status).toBe(4);
    expect(refused.stdout).toContain('REFUSED');
  }, 30_000);

  it('still refuses the stale probe id, but at the shape fence rather than G-3', () => {
    const refused = refuse('hac316-s1-not-declared');
    expect(refused.status).toBe(4);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// The two predicates REQ-080 and REQ-081 are built on (erratum E-08)
// ---------------------------------------------------------------------------

describe('a deployable entry point is told apart from a library', () => {
  it('accepts the real ingress and rejects the library it was mistaken for', () => {
    const read = (relative) => readFileSync(join(experimentDir, relative), 'utf8');
    expect(serverEntryPointGaps(read('bin/ingress-service.mjs'))).toEqual([]);
    // B6, as a predicate. `src/routing.mjs` was R-08's declared entry point and
    // fails all three markers: it builds objects and never serves.
    expect(serverEntryPointGaps(read('src/routing.mjs')).sort()).toEqual(
      Object.keys(SERVER_ENTRY_POINT_MARKERS).sort(),
    );
  });

  it('names each missing marker separately, so a partial entry point is legible', () => {
    // A module that builds and binds a server inside a function nobody calls is
    // exactly as dead as a library, and has to be reported as such.
    const neverRun = 'const s = createServer(handler); export const go = () => s.listen(8080);';
    expect(serverEntryPointGaps(neverRun)).toEqual(['runsWhenExecuted']);
    expect(serverEntryPointGaps('export const x = 1;').sort()).toEqual(
      Object.keys(SERVER_ENTRY_POINT_MARKERS).sort(),
    );
    expect(serverEntryPointGaps(undefined).length).toBe(3);
  });
});

describe('a prohibition scan reads code, not prose about the prohibition', () => {
  it('drops whole-line comments and keeps everything that executes', () => {
    // The E-01 defect, one file down: bin/ingress-service.mjs names `params.agent`
    // in a comment explaining why it never reads one, and the raw text therefore
    // matched the rule's own words.
    const source = [
      '// identity is never taken from params.agent',
      '/* nor from',
      '   body.agent */',
      ' * arguments.agent',
      'const identity = observeIdentity(request.headers);',
      'const kept = 1; // trailing params.agent stays in scope',
    ].join('\n');
    const code = codeWithoutCommentLines(source);
    expect(code).toContain('observeIdentity(request.headers)');
    expect(code).not.toContain('// identity is never taken');
    expect(/params\s*\.\s*agent\b/.test(code.split('\n')[0] ?? '')).toBe(false);
    // Over-reports rather than under-reports: a trailing comment on a line of
    // code is kept, because a line that executes always has code before it.
    expect(code).toContain('trailing params.agent stays in scope');
  });

  it('does not let a violation hide behind a comment marker', () => {
    // The direction that matters. Anything that executes stays in scope.
    const sneaky = 'const agent = params.agent; // looks innocent';
    expect(/params\s*\.\s*agent\b/.test(codeWithoutCommentLines(sneaky))).toBe(true);
  });

  it('is what keeps REQ-081 green on a file that names what it refuses to do', () => {
    const ingress = readFileSync(join(experimentDir, 'bin', 'ingress-service.mjs'), 'utf8');
    // Red on the raw text, green on the code: the whole reason the helper exists.
    expect(/params\s*\.\s*agent\b/.test(ingress)).toBe(true);
    expect(/params\s*\.\s*agent\b/.test(codeWithoutCommentLines(ingress))).toBe(false);
  });
});
