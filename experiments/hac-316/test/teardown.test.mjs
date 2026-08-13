/**
 * The teardown guard, tested without a cloud.
 *
 * A teardown tool is the one tool whose bug destroys something that was not
 * disposable, so its guard has to be exercisable before it is ever pointed at a
 * real project. Every cloud interaction is injected, so these tests drive the
 * whole decision — including the "delete said 0, the project is still there"
 * case, which is the one REQ-059 exists for and the one a real run is least
 * likely to produce on demand.
 *
 * Nothing here reaches a network. No project, real or otherwise, is touched.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AMBIENT_VARIABLES,
  DISPOSABLE_PROJECT_PATTERN,
  Refusal,
  TeardownRefusal,
  ambientProjects,
  executeTeardown,
  guardProjectId,
  judgeRemoval,
  readDeclaration,
  readProjectArgument,
  verifyRemoval,
} from '../bin/teardown.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const teardown = join(experimentDir, 'bin', 'teardown.mjs');

const DECLARED = 'hac316-s1-a1b2c3d4';

/** A cloud that answers whatever the test needs it to. */
function fakeCloud({ state, resources = [], deleteExitCode = 0, stateAfterDelete } = {}) {
  const calls = [];
  let current = state;
  return {
    calls,
    deleteProject(projectId) {
      calls.push(['delete', projectId]);
      if (stateAfterDelete !== undefined) current = stateAfterDelete;
      return { exitCode: deleteExitCode };
    },
    describeProject(projectId) {
      calls.push(['describe', projectId]);
      return current;
    },
    listAgentRuntimeResources(projectId) {
      calls.push(['list', projectId]);
      return resources;
    },
  };
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

  it('refuses an id that does not look disposable', () => {
    for (const supplied of [
      'my-production-project',
      'hac316-s1',
      'HAC316-S1-ABCDEF',
      'hac316-s1-a',
      `hac316-s1-${'x'.repeat(40)}`,
      '../../etc',
    ]) {
      expect(() => guardProjectId({ supplied, declared: supplied }), supplied).toThrow(
        /does not match the disposable-project pattern/,
      );
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
    expect(refusal.message).toContain('Absence of a declaration is not permission');
  });

  it('refuses an unexpected identifier even when it looks disposable', () => {
    // The whole point: a well-formed id that is not the one this experiment
    // created is the case to fail closed on.
    let refusal;
    try {
      guardProjectId({ supplied: 'hac316-s1-99999999', declared: DECLARED });
    } catch (error) {
      refusal = error;
    }
    expect(refusal.code).toBe(Refusal.UNDECLARED_ID);
    expect(refusal.message).toContain(DECLARED);
  });

  it('permits exactly the declared, disposable, explicitly supplied id', () => {
    expect(guardProjectId({ supplied: DECLARED, declared: DECLARED })).toBe(DECLARED);
    expect(guardProjectId({ supplied: ` ${DECLARED} `, declared: DECLARED })).toBe(DECLARED);
  });

  it('does not accept a bare positional argument as a project id', () => {
    expect(readProjectArgument(['--verify', DECLARED])).toBe(null);
    expect(readProjectArgument(['--verify', '--project'])).toBe(null);
    expect(readProjectArgument(['--project', '--verify'])).toBe(null);
    expect(readProjectArgument(['--project', DECLARED])).toBe(DECLARED);
  });
});

describe('removal is judged by re-reading, not by the delete call', () => {
  it('fails when the delete succeeded and the project is still there', () => {
    const cloud = fakeCloud({ state: 'ACTIVE', deleteExitCode: 0 });
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(verdict.deleteExitCode).toBe(0);
    expect(verdict.deleteExitCodeConsulted).toBe(false);
    expect(verdict.removed).toBe(false);
    expect(verdict.problems.join(' ')).toContain('still ACTIVE');
  });

  it('passes when the delete failed and the project is already gone', () => {
    const cloud = fakeCloud({ state: null, deleteExitCode: 1 });
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(verdict.deleteExitCode).toBe(1);
    expect(verdict.removed).toBe(true);
    expect(verdict.projectState).toBe('DELETED');
  });

  it('fails when resources remain even though the project reads as deleted', () => {
    const cloud = fakeCloud({ state: 'DELETE_REQUESTED', resources: ['reasoningEngines/1'] });
    const verdict = verifyRemoval({ projectId: DECLARED, cloud });
    expect(verdict.removed).toBe(false);
    expect(verdict.remainingResources).toBe(1);
    expect(verdict.problems.join(' ')).toContain('remain');
  });

  it('re-reads after deleting rather than trusting the state it started from', () => {
    const cloud = fakeCloud({ state: 'ACTIVE', stateAfterDelete: 'DELETE_REQUESTED' });
    const verdict = executeTeardown({ projectId: DECLARED, cloud });
    expect(cloud.calls.map(([kind]) => kind)).toEqual(['delete', 'describe', 'list']);
    expect(verdict.removed).toBe(true);
    expect(verdict.verifiedBy).toBe('independent-reread');
  });

  it('records the verdict in the shape REQ-059 reads', () => {
    const verdict = judgeRemoval({ state: null, resources: [] });
    expect(verdict.verifiedBy).toBe('independent-reread');
    expect(verdict.remainingResources).toBe(0);
    expect(verdict.removed).toBe(true);
  });
});

describe('with no Phase 7 declaration on disk', () => {
  it('has nothing declared during Phase 6', () => {
    expect(readDeclaration()).toBe(null);
  });

  it('refuses and never prints PASS, whatever it is asked to do', () => {
    for (const args of [
      ['--verify'],
      ['--execute'],
      ['--verify', '--project', DECLARED],
      ['--execute', '--project', DECLARED],
    ]) {
      const run = spawnSync(process.execPath, [teardown, ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        // Ambient project set on purpose: it must change nothing.
        env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'someone-elses-production', VITEST: '' },
      });
      expect(run.status, args.join(' ')).not.toBe(0);
      expect(run.stdout, args.join(' ')).not.toContain('PASS');
      expect(run.stdout, args.join(' ')).toContain('REFUSED');
      expect(run.stderr, args.join(' ')).not.toContain('someone-elses-production=');
    }
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
});
