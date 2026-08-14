/**
 * The teardown guard and its verdict, tested without a cloud.
 *
 * A teardown tool is the one tool whose bug destroys something that was not
 * disposable, so its guard has to be exercisable before it is ever pointed at a
 * real project. Every cloud interaction is injected, so these tests drive the
 * whole decision — including the two cases a real run is least likely to produce
 * on demand:
 *
 *   - "the delete said 0 and the project is still there", which is what REQ-059
 *     exists for; and
 *   - "the read failed", which is what this file was extended for. The previous
 *     adapter mapped every command failure onto a success-shaped answer, so a
 *     machine with no `gcloud` installed produced a green teardown attesting to
 *     an independent re-read it had never performed. The old tests injected
 *     values into the judgement directly and never exercised the adapter at all,
 *     which is precisely why that survived. Each failure class below is a
 *     separate test, and each one is red without the fix.
 *
 * Nothing here reaches a network. No project, real or otherwise, is touched, and
 * the subprocess tests assert an empty invocation log rather than trusting it.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AMBIENT_VARIABLES,
  DISPOSABLE_PROJECT_PATTERN,
  GCLOUD_BIN_VARIABLE,
  ProbeOutcome,
  REFUSAL_EXIT_CODE,
  REREAD_PROBES,
  Refusal,
  TeardownRefusal,
  ambientProjects,
  classifyFailure,
  commandEnvironment,
  executeTeardown,
  gcloudAdapter,
  guardProjectId,
  interpretProbe,
  judgeRemoval,
  plannedCommands,
  readDeclaration,
  readProjectArgument,
  readProjectArguments,
  verifyRemoval,
} from '../bin/teardown.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const teardown = join(experimentDir, 'bin', 'teardown.mjs');

const DECLARED = 'interlock-s1-a1b2c3d4';

/** A `spawnSync` stand-in that records what it was asked and answers on script. */
function spawnStub(responder) {
  const calls = [];
  const spawn = (binary, args, options) => {
    calls.push({ binary, args, env: options?.env ?? {} });
    return responder(args, calls.length);
  };
  spawn.calls = calls;
  return spawn;
}

const isLifecycleRead = (args) => args[0] === 'projects' && args[1] === 'describe';

/** Answers that a clean, fully removed project would produce. */
const removedForReal = (args) =>
  isLifecycleRead(args)
    ? { status: 0, stdout: 'DELETE_REQUESTED\n', stderr: '' }
    : { status: 0, stdout: '', stderr: '' };

/** Build an adapter over a stubbed spawn, with a clean environment. */
function adapterOver(responder, env = {}) {
  const spawn = spawnStub(responder);
  const cloud = gcloudAdapter({ projectId: DECLARED, env, spawn });
  return { cloud, spawn };
}

describe('the guard refuses anything it was not explicitly given', () => {
  it('refuses when no project id was supplied', () => {
    expect(() => guardProjectId({ supplied: undefined, declared: DECLARED })).toThrow(
      TeardownRefusal,
    );
    try {
      guardProjectId({ supplied: undefined, declared: DECLARED });
    } catch (error) {
      expect(error.code).toBe(Refusal.NOT_SUPPLIED);
      // REQ-071 asserts this exit code exactly, not a band.
      expect(error.exitCode).toBe(2);
    }
    for (const supplied of [null, '', '   ', 42, {}]) {
      expect(() => guardProjectId({ supplied, declared: DECLARED }), String(supplied)).toThrow(
        /no project id was supplied/,
      );
    }
  });

  it('still refuses when an ambient project is configured, and says it ignored it', () => {
    // The case that turns a teardown into an accident: a tool that helpfully
    // falls back to whatever the shell was pointed at.
    let refusal;
    try {
      guardProjectId({
        supplied: undefined,
        declared: DECLARED,
        ambient: { CLOUDSDK_CORE_PROJECT: 'someone-elses-production' },
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal.code).toBe(Refusal.NOT_SUPPLIED);
    expect(refusal.message).toContain('someone-elses-production');
    expect(refusal.message).toContain('was NOT used');
  });

  it('never reads an ambient value as the project id', () => {
    const ambient = ambientProjects({ CLOUDSDK_CORE_PROJECT: 'prod', GOOGLE_CLOUD_PROJECT: 'prod2' });
    expect(ambient).toEqual({ CLOUDSDK_CORE_PROJECT: 'prod', GOOGLE_CLOUD_PROJECT: 'prod2' });
    // Empty is absent, so a blank ambient variable is not reported as set.
    expect(ambientProjects({ CLOUDSDK_CORE_PROJECT: '  ' })).toEqual({});
    expect(AMBIENT_VARIABLES).toContain('CLOUDSDK_CORE_PROJECT');
    expect(AMBIENT_VARIABLES).toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('enforces the shape fence REQ-071 checks for by name', () => {
    // G-4's fence is `^interlock-s1-[0-9a-f]{8}$`. The looser pattern this file
    // carried before admitted `hac316-s1-<anything>`, which is not the shape any
    // requirement checks and not the shape Phase 7 provisions.
    expect(DISPOSABLE_PROJECT_PATTERN.source).toBe('^interlock-s1-[0-9a-f]{8}$');
    for (const supplied of [
      'my-production-project',
      'interlock-s0-gate',
      'interlock-s2-gate',
      'interlock-s1',
      'INTERLOCK-S1-A1B2C3D4',
      'interlock-s1-a1b2c3d',
      'interlock-s1-a1b2c3d44',
      'interlock-s1-a1b2c3dz',
      'hac316-s1-a1b2c3d4',
      '../../etc',
    ]) {
      let refusal;
      try {
        guardProjectId({ supplied, declared: supplied });
      } catch (error) {
        refusal = error;
      }
      expect(refusal?.code, supplied).toBe(Refusal.NOT_DISPOSABLE);
      expect(refusal.exitCode, supplied).toBe(4);
    }
    expect(DISPOSABLE_PROJECT_PATTERN.test(DECLARED)).toBe(true);
  });

  it('refuses when nothing was declared', () => {
    let refusal;
    try {
      guardProjectId({ supplied: DECLARED, declared: null });
    } catch (error) {
      refusal = error;
    }
    expect(refusal.code).toBe(Refusal.NOT_DECLARED);
    expect(refusal.exitCode).toBe(3);
    expect(refusal.message).toContain('Absence of a declaration is not permission');
  });

  it('refuses an unexpected identifier even when it looks disposable', () => {
    // The whole point: a well-formed id that is not the one this experiment
    // created is the case to fail closed on. REQ-072's first probe is exactly
    // this shape.
    let refusal;
    try {
      guardProjectId({ supplied: 'interlock-s1-deadbeef', declared: DECLARED });
    } catch (error) {
      refusal = error;
    }
    expect(refusal.code).toBe(Refusal.UNDECLARED_ID);
    expect(refusal.exitCode).toBe(3);
    expect(refusal.message).toContain(DECLARED);
  });

  it('compares the declaration byte for byte', () => {
    for (const declared of [` ${DECLARED}`, `${DECLARED} `, DECLARED.toUpperCase()]) {
      expect(() => guardProjectId({ supplied: DECLARED, declared }), declared).toThrow(
        TeardownRefusal,
      );
    }
  });

  it('permits exactly the declared, disposable, explicitly supplied id', () => {
    expect(guardProjectId({ supplied: DECLARED, declared: DECLARED })).toBe(DECLARED);
    expect(guardProjectId({ supplied: ` ${DECLARED} `, declared: DECLARED })).toBe(DECLARED);
  });

  it('every refusal exits in the 2-4 band REQ-072 requires', () => {
    for (const code of Object.values(Refusal)) {
      expect(REFUSAL_EXIT_CODE[code], code).toBeGreaterThanOrEqual(2);
      expect(REFUSAL_EXIT_CODE[code], code).toBeLessThanOrEqual(4);
    }
  });

  it('an unparseable declaration is read as no declaration at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hac316-teardown-'));
    const path = join(dir, 'topology.json');
    writeFileSync(path, '{ this is not json');
    expect(readDeclaration(path)).toBe(null);
    expect(readDeclaration(join(dir, 'absent.json'))).toBe(null);
  });
});

describe('--project is parsed in both spellings', () => {
  it('reads the space form and the equals form alike', () => {
    // The equals form is the one REQ-072 uses. Parsing only the space form made
    // all five of its mismatched-id probes degenerate into the same "nothing was
    // supplied" refusal: the exit code still landed in the expected band and the
    // invocation log was still empty, so the requirement printed PASS without
    // ever having tested a mismatched id.
    expect(readProjectArgument(['--project', DECLARED])).toBe(DECLARED);
    expect(readProjectArgument([`--project=${DECLARED}`])).toBe(DECLARED);
    expect(readProjectArgument(['--verify', `--project=${DECLARED}`, '--confirm'])).toBe(DECLARED);
  });

  it('still refuses a bare positional, an empty value and a missing value', () => {
    expect(readProjectArgument(['--verify', DECLARED])).toBe(null);
    expect(readProjectArgument(['--verify', '--project'])).toBe(null);
    expect(readProjectArgument(['--project', '--verify'])).toBe(null);
    expect(readProjectArgument(['--project='])).toBe('');
    expect(() => guardProjectId({ supplied: '', declared: DECLARED })).toThrow(TeardownRefusal);
  });

  it('reports a repeated operand rather than picking one (G-1)', () => {
    expect(readProjectArguments(['--project', DECLARED, `--project=${DECLARED}`])).toEqual([
      DECLARED,
      DECLARED,
    ]);
    expect(readProjectArgument(['--project', DECLARED, '--project', 'interlock-s1-deadbeef'])).toBe(
      null,
    );
  });
});

describe('a failure to read is never read as absence', () => {
  // Each of these was a green PASS before the fix: the adapter turned any
  // failure into `null` (read as "the project is gone") or `[]` (read as "no
  // resources remain").
  const failureClasses = {
    'the gcloud binary is missing': () => ({
      error: Object.assign(new Error('spawn gcloud ENOENT'), { code: 'ENOENT' }),
      status: null,
      stdout: '',
      stderr: '',
    }),
    'the command exits non-zero for an unrecognised reason': () => ({
      status: 1,
      stdout: '',
      stderr: 'ERROR: (gcloud) An unexpected error occurred. Traceback follows.',
    }),
    'the command is denied': () => ({
      status: 1,
      stdout: '',
      stderr: 'ERROR: PERMISSION_DENIED: The caller does not have permission on this project.',
    }),
    'the network is unreachable': () => ({
      status: 1,
      stdout: '',
      stderr: 'ERROR: Unable to reach oauth2.googleapis.com: connection timed out',
    }),
    'the credentials have expired': () => ({
      status: 1,
      stdout: '',
      stderr: 'ERROR: Your credentials are invalid. Reauthentication required.',
    }),
    'the output is malformed': (args) =>
      isLifecycleRead(args)
        ? { status: 0, stdout: '   \n', stderr: '' }
        : { status: 0, stdout: '', stderr: '' },
    'the lifecycle state is unrecognised': (args) =>
      isLifecycleRead(args)
        ? { status: 0, stdout: 'SUSPENDED_PENDING_REVIEW\n', stderr: '' }
        : { status: 0, stdout: '', stderr: '' },
  };

  for (const [label, responder] of Object.entries(failureClasses)) {
    it(`refuses to call it removed when ${label}`, () => {
      const { cloud } = adapterOver(responder);
      const verdict = verifyRemoval({ projectId: DECLARED, cloud });
      expect(verdict.removed).toBe(false);
      expect(verdict.verified).toBe(false);
      expect(verdict.verifiedBy).not.toBe('independent-reread');
      expect(verdict.passedBecause).toBe(null);
      expect(verdict.problems.length).toBeGreaterThan(0);
    });
  }

  it('refuses when the spawn itself throws', () => {
    const spawn = () => {
      throw new Error('EAGAIN: resource temporarily unavailable');
    };
    const cloud = gcloudAdapter({ projectId: DECLARED, env: {}, spawn });
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.verifiedBy).not.toBe('independent-reread');
    expect(verdict.problems.join(' ')).toMatch(/EAGAIN/);
  });

  it('refuses when only some of the five re-reads succeed', () => {
    // A partial read is not a read. The lifecycle probe says DELETE_REQUESTED
    // and every listing is empty — the exact shape of a pass — except that one
    // listing could not be run at all.
    const { cloud } = adapterOver((args) =>
      args[0] === 'storage'
        ? { status: 1, stdout: '', stderr: 'ERROR: (gcloud.storage) backend unavailable' }
        : removedForReal(args),
    );
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.verifiedBy).toBe('not-established');
    expect(verdict.problems.join(' ')).toContain('storage buckets list');
  });

  it('classifies each failure without a permissive branch', () => {
    expect(classifyFailure({ status: 1, stderr: 'NOT_FOUND: project was not found' }).outcome).toBe(
      ProbeOutcome.ABSENT,
    );
    // Denial mentions absence-shaped words in some gcloud builds; the ambiguous
    // reading wins, so it can never resolve to "gone".
    expect(
      classifyFailure({ status: 1, stderr: 'PERMISSION_DENIED: project was not found or you lack access' })
        .outcome,
    ).toBe(ProbeOutcome.ERROR);
    expect(classifyFailure({ status: 1, stderr: '' }).outcome).toBe(ProbeOutcome.ERROR);
    expect(classifyFailure({ status: null, stderr: '' }).detail).toContain('abnormally');
  });

  it('this machine has no gcloud, and the real adapter says so instead of passing', () => {
    // The regression in its original form. With the real `spawnSync`, on a host
    // where `gcloud` is not installed, the previous implementation returned
    // `{removed: true, verifiedBy: "independent-reread", remainingResources: 0}`.
    const probe = spawnSync('gcloud', ['--version'], { encoding: 'utf8' });
    if (!probe.error) return; // A host with gcloud installed cannot make this point.
    const cloud = gcloudAdapter({ projectId: DECLARED });
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.verifiedBy).not.toBe('independent-reread');
    expect(verdict.probes).toHaveLength(REREAD_PROBES.length);
    for (const record of verdict.probes) {
      expect(record.outcome, record.probe).toBe(ProbeOutcome.ERROR);
      expect(record.reason, record.probe).toBe('gcloud-not-installed');
    }
  });
});

describe('absence, when it is genuinely observed, passes', () => {
  it('reads a NOT_FOUND failure as proof the project is gone', () => {
    const { cloud } = adapterOver(() => ({
      status: 1,
      stdout: '',
      stderr: "ERROR: (gcloud) Project 'interlock-s1-a1b2c3d4' NOT_FOUND: it was not found.",
    }));
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(true);
    expect(verdict.verified).toBe(true);
    expect(verdict.verifiedBy).toBe('independent-reread');
    expect(verdict.lifecycleState).toBe('NOT_FOUND');
    expect(verdict.remainingResources).toBe(0);
  });

  it('reads a successful DELETE_REQUESTED with empty listings as removal', () => {
    const { cloud, spawn } = adapterOver(removedForReal);
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(true);
    expect(verdict.verifiedBy).toBe('independent-reread');
    expect(verdict.passedBecause).toBe('independent-reread');
    expect(verdict.lifecycleState).toBe('DELETE_REQUESTED');
    expect(spawn.calls).toHaveLength(REREAD_PROBES.length);
  });

  it('runs all five re-reads REQ-073 counts, each naming the project', () => {
    const { cloud, spawn } = adapterOver(removedForReal);
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.probes.map((record) => record.probe)).toEqual([
      'projects describe',
      'run services list',
      'artifacts repositories list',
      'ai reasoning-engines list',
      'storage buckets list',
    ]);
    for (const record of verdict.probes) expect(typeof record.rows).toBe('number');
    expect(verdict.remainingResources).toBe(
      verdict.probes.reduce((total, record) => total + record.rows, 0),
    );
    for (const call of spawn.calls) {
      expect(call.args.some((arg) => String(arg).includes(DECLARED))).toBe(true);
    }
  });

  it('records the verdict in the shape G-9 and REQ-073 read', () => {
    const { cloud } = adapterOver(removedForReal);
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(verdict.projectId).toBe(DECLARED);
    expect(verdict.verifiedBy).toBe('independent-reread');
    expect(verdict.passedBecause).toBe('independent-reread');
    expect('deleteCallExitCode' in verdict).toBe(true);
    expect(Array.isArray(verdict.probes)).toBe(true);
    expect(verdict.probes.length).toBeGreaterThanOrEqual(5);
    expect(verdict.remainingResources).toBe(0);
    expect(DISPOSABLE_PROJECT_PATTERN.test(verdict.projectId)).toBe(true);
  });
});

describe('removal is judged by re-reading, not by the delete call', () => {
  it('fails when the delete succeeded and the project is still there', () => {
    const { cloud } = adapterOver((args) =>
      isLifecycleRead(args)
        ? { status: 0, stdout: 'ACTIVE\n', stderr: '' }
        : { status: 0, stdout: '', stderr: '' },
    );
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(verdict.deleteCallExitCode).toBe(0);
    expect(verdict.deleteExitCodeConsulted).toBe(false);
    expect(verdict.removed).toBe(false);
    expect(verdict.problems.join(' ')).toContain('still ACTIVE');
  });

  it('passes when the delete failed and the project is already gone', () => {
    const { cloud } = adapterOver((args) =>
      args[1] === 'delete'
        ? { status: 1, stdout: '', stderr: 'ERROR: the delete request was rejected' }
        : removedForReal(args),
    );
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(verdict.deleteCallExitCode).toBe(1);
    expect(verdict.removed).toBe(true);
    expect(verdict.lifecycleState).toBe('DELETE_REQUESTED');
  });

  it('fails when resources remain even though the project reads as deleted', () => {
    const { cloud } = adapterOver((args) =>
      args[0] === 'ai'
        ? { status: 0, stdout: 'projects/p/locations/us-central1/reasoningEngines/1\n', stderr: '' }
        : removedForReal(args),
    );
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.remainingResources).toBe(1);
    expect(verdict.problems.join(' ')).toContain('remain');
  });

  it('re-reads after deleting rather than trusting the state it started from', () => {
    let deleted = false;
    const { cloud, spawn } = adapterOver((args) => {
      if (args[1] === 'delete') {
        deleted = true;
        return { status: 0, stdout: '', stderr: '' };
      }
      if (isLifecycleRead(args)) {
        return { status: 0, stdout: `${deleted ? 'DELETE_REQUESTED' : 'ACTIVE'}\n`, stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(spawn.calls[0].args[1]).toBe('delete');
    expect(spawn.calls).toHaveLength(1 + REREAD_PROBES.length);
    expect(verdict.removed).toBe(true);
    expect(verdict.verifiedBy).toBe('independent-reread');
  });

  it('never calls a verdict removed on no probes at all', () => {
    const verdict = judgeRemoval({ projectId: DECLARED, probes: [] });
    expect(verdict.removed).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.verifiedBy).toBe('not-established');
    expect(verdict.problems.length).toBe(REREAD_PROBES.length);
  });
});

describe('the test shim can never manufacture a pass (G-11)', () => {
  it('refuses independent-reread when the binary came from the shim variable', () => {
    // The shim answers exactly as a fully removed project would. It still must
    // not be able to produce a green teardown.
    const { cloud } = adapterOver(removedForReal, { [GCLOUD_BIN_VARIABLE]: '/tmp/fake-gcloud' });
    expect(cloud.shimmed).toBe(true);
    expect(cloud.binary).toBe('/tmp/fake-gcloud');
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.verifiedBy).not.toBe('independent-reread');
    expect(verdict.passedBecause).toBe(null);
    expect(verdict.problems.join(' ')).toContain(GCLOUD_BIN_VARIABLE);
  });

  it('is only shimmed when the variable actually names something', () => {
    const { cloud } = adapterOver(removedForReal, { [GCLOUD_BIN_VARIABLE]: '   ' });
    expect(cloud.shimmed).toBe(false);
    expect(cloud.binary).toBe('gcloud');
    expect(verifyRemoval({ projectId: DECLARED, cloud }).verifiedBy).toBe('independent-reread');
  });

  it('cannot be forced past the shim by hand-built probe records', () => {
    const probes = REREAD_PROBES.map((spec) =>
      interpretProbe(spec, { outcome: ProbeOutcome.OK, raw: spec.kind === 'lifecycle' ? 'DELETED' : '' }),
    );
    expect(judgeRemoval({ projectId: DECLARED, probes }).verifiedBy).toBe('independent-reread');
    expect(judgeRemoval({ projectId: DECLARED, probes, shimmed: true }).verifiedBy).toBe(
      'not-established',
    );
  });
});

describe('every spawned command names its project and cannot be prompted', () => {
  it('pins both CLOUDSDK variables and strips every inherited one (G-6)', () => {
    const env = commandEnvironment(DECLARED, {
      CLOUDSDK_CORE_PROJECT: 'someone-elses-production',
      CLOUDSDK_CORE_ACCOUNT: 'someone@example.com',
      CLOUDSDK_ACTIVE_CONFIG_NAME: 'default',
      GOOGLE_CLOUD_PROJECT: 'another-production',
      PATH: '/usr/bin',
    });
    expect(env.CLOUDSDK_CORE_PROJECT).toBe(DECLARED);
    expect(env.CLOUDSDK_CORE_DISABLE_PROMPTS).toBe('1');
    expect(env.CLOUDSDK_CORE_ACCOUNT).toBeUndefined();
    expect(env.CLOUDSDK_ACTIVE_CONFIG_NAME).toBeUndefined();
    expect(env.GOOGLE_CLOUD_PROJECT).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });

  it('passes that environment to every command it spawns', () => {
    const { cloud, spawn } = adapterOver(removedForReal, {
      CLOUDSDK_CORE_PROJECT: 'someone-elses-production',
    });
    executeTeardown({ projectId: DECLARED, cloud });
    expect(spawn.calls.length).toBe(1 + REREAD_PROBES.length);
    for (const call of spawn.calls) {
      expect(call.env.CLOUDSDK_CORE_PROJECT).toBe(DECLARED);
      expect(call.env.CLOUDSDK_CORE_DISABLE_PROMPTS).toBe('1');
    }
  });

  it('refuses to answer about a project it was not built for', () => {
    const { cloud } = adapterOver(removedForReal);
    expect(() => cloud.reread('interlock-s1-deadbeef')).toThrow(TeardownRefusal);
    expect(() => cloud.deleteProject('interlock-s1-deadbeef')).toThrow(TeardownRefusal);
  });

  it('will not be built for an id that never passed the shape fence', () => {
    expect(() => gcloudAdapter({ projectId: 'my-production-project' })).toThrow(TeardownRefusal);
    expect(() => gcloudAdapter({ projectId: null })).toThrow(TeardownRefusal);
  });

  it('names every planned command in a dry run', () => {
    const planned = plannedCommands(DECLARED);
    expect(planned).toHaveLength(1 + REREAD_PROBES.length);
    for (const command of planned) expect(command).toContain(DECLARED);
  });
});

describe('with no Phase 7 declaration on disk', () => {
  /** A `gcloud` that only records that it was called. Never legitimately reached. */
  function shim() {
    const dir = mkdtempSync(join(tmpdir(), 'hac316-shim-'));
    const bin = join(dir, 'gcloud');
    const log = join(dir, 'invocations.log');
    writeFileSync(bin, '#!/bin/sh\necho "$@" >> "$HAC316_GCLOUD_LOG"\nexit 0\n');
    chmodSync(bin, 0o755);
    writeFileSync(log, '');
    return { bin, log, invocations: () => readFileSync(log, 'utf8').trim() };
  }

  it('has nothing declared during Phase 6', () => {
    expect(readDeclaration()).toBe(null);
  });

  it('refuses every mode, spawns no gcloud, and never prints PASS', () => {
    // The load-bearing half is the empty invocation log: refusal must happen
    // before any process is spawned, not after one has been asked to delete
    // something. Both `--project` spellings are exercised, because the equals
    // form is the one REQ-071 and REQ-072 actually use.
    const cases = [
      ['--verify'],
      ['--execute'],
      ['--confirm', '--verify'],
      ['--verify', '--project', DECLARED],
      ['--execute', '--confirm', '--project', DECLARED],
      ['--verify', `--project=${DECLARED}`],
      ['--confirm', '--verify', `--project=interlock-s1-deadbeef`],
      ['--confirm', '--verify', '--project=interlock-s0-gate'],
      ['--confirm', '--verify', '--project=interlock-s2-gate'],
      ['--confirm', '--verify', '--project=my-production-project'],
      ['--confirm', '--verify', `--project=${DECLARED}x`],
      ['--confirm', '--verify', '--project', DECLARED, `--project=${DECLARED}`],
    ];
    for (const args of cases) {
      const { bin, log, invocations } = shim();
      const run = spawnSync(process.execPath, [teardown, ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          // Ambient project set on purpose: it must change nothing.
          CLOUDSDK_CORE_PROJECT: 'someone-elses-production',
          HAC316_GCLOUD_BIN: bin,
          HAC316_GCLOUD_LOG: log,
          VITEST: '',
        },
      });
      const label = args.join(' ');
      expect(run.status, label).toBeGreaterThanOrEqual(2);
      expect(run.status, label).toBeLessThanOrEqual(4);
      expect(run.stdout, label).not.toContain('PASS');
      expect(run.stdout, label).toContain('REFUSED');
      expect(invocations(), `${label} spawned gcloud`).toBe('');
    }
  }, 120_000);

  it('exits exactly 2 with no --project, as REQ-071 asserts', () => {
    const { bin, log, invocations } = shim();
    const run = spawnSync(process.execPath, [teardown, '--confirm', '--verify'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLOUDSDK_CORE_PROJECT: 'some-live-production-project',
        HAC316_GCLOUD_BIN: bin,
        HAC316_GCLOUD_LOG: log,
        VITEST: '',
      },
    });
    expect(run.status).toBe(2);
    expect(invocations()).toBe('');
  }, 60_000);

  it('refuses without a mode as well', () => {
    const run = spawnSync(process.execPath, [teardown], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, VITEST: '' },
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain('PASS');
  }, 60_000);

  it('still refuses the id verify-packet probes REQ-059 with', () => {
    // verify-packet.mjs spawns this tool with `--verify --project
    // hac316-s1-not-declared` and requires a refusal that says so.
    const run = spawnSync(
      process.execPath,
      [teardown, '--verify', '--project', 'hac316-s1-not-declared'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'ambient-must-be-ignored', VITEST: '' },
      },
    );
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain('PASS');
    expect(run.stdout).toContain('REFUSED');
  }, 60_000);
});
