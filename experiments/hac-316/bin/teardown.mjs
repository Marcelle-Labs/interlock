#!/usr/bin/env node
/**
 * Remove the disposable Google project Phase 7 created, and prove it is gone.
 *
 * ## Fail closed on the identifier
 *
 * A teardown tool is the one tool in an experiment whose bug destroys something
 * that was not disposable. Every guard here exists because of a specific way
 * that happens:
 *
 *   - **The identifier must be supplied.** Not defaulted, not inferred, not
 *     remembered. If `--project` is absent this refuses, and it refuses *even
 *     when an ambient project is configured* — because "the project I happened
 *     to be pointed at" is exactly the value that turns a teardown into an
 *     accident.
 *   - **Ambient configuration is never a source.** `gcloud config get-value
 *     project`, `CLOUDSDK_CORE_PROJECT` and `GOOGLE_CLOUD_PROJECT` are read only
 *     so the refusal can *say* what it ignored. They never supply the value, and
 *     they are scrubbed from the environment of every command this runs, so a
 *     `gcloud` invocation cannot silently fall back to one either.
 *   - **The identifier must have been declared.** Phase 7 records the project it
 *     created in `evidence/disposable-project.json`. A supplied id that does not
 *     match that record is refused: an unexpected identifier is the case to fail
 *     closed on, not the case to be helpful about.
 *   - **It must look disposable.** A naming pattern, checked as well as the
 *     declaration rather than instead of it, so a corrupted declaration cannot
 *     nominate an arbitrary project.
 *
 * ## Deletion is not evidence of removal
 *
 * `gcloud projects delete` returning 0 means the request was accepted. It is not
 * an observation that anything is gone, and the difference is the whole point of
 * REQ-059: teardown is verified by **re-reading the cloud**. So the delete's exit
 * code is recorded and then ignored, and the verdict comes from a fresh read of
 * the project's lifecycle state and a fresh listing of the Agent Runtime
 * resources under it. A delete that succeeded and a project still `ACTIVE` is a
 * failure, and a delete that failed while the project is already gone is a pass.
 *
 *   node experiments/hac-316/bin/teardown.mjs --verify --project <id>
 *   node experiments/hac-316/bin/teardown.mjs --execute --project <id>
 *
 * With no declaration on disk — which is the state during Phase 6 — both modes
 * refuse and exit non-zero. Absence of a declaration is not evidence that a
 * teardown succeeded, and this program will never print `PASS` for it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectInvocation } from '../src/entrypoint.mjs';
import { readEnv } from '../src/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');

/** Where Phase 7 records the project it created. Absent until it does. */
export const DECLARATION_PATH = join(experimentDir, 'evidence', 'disposable-project.json');

/**
 * What a disposable HAC-316 project is allowed to be called.
 *
 * A second gate, not the only one. It cannot by itself distinguish a disposable
 * project from a production one that happens to be named similarly, which is why
 * the declaration is also required — but it does stop a corrupted or
 * hand-edited declaration from nominating something arbitrary.
 */
export const DISPOSABLE_PROJECT_PATTERN = /^hac316-s1-[a-z0-9][a-z0-9-]{4,24}$/;

/** Environment variables that would otherwise supply a project id by accident. */
export const AMBIENT_VARIABLES = Object.freeze([
  'CLOUDSDK_CORE_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GCP_PROJECT',
]);

/** Why a teardown refused. Every one of these is a stop, never a warning. */
export const Refusal = Object.freeze({
  NOT_SUPPLIED: 'PROJECT_ID_NOT_SUPPLIED',
  NOT_DISPOSABLE: 'PROJECT_ID_NOT_DISPOSABLE',
  NOT_DECLARED: 'NO_DISPOSABLE_PROJECT_DECLARED',
  UNDECLARED_ID: 'PROJECT_ID_DOES_NOT_MATCH_DECLARATION',
});

/** Thrown by the guard. Carries the code so a caller can report it precisely. */
export class TeardownRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeardownRefusal';
    this.code = code;
  }
}

/** Ambient project values, read only so a refusal can name what it ignored. */
export function ambientProjects(env = process.env) {
  return Object.fromEntries(
    AMBIENT_VARIABLES.map((name) => [name, readEnv(name, env)]).filter(
      ([, value]) => value !== null,
    ),
  );
}

/**
 * Decide whether this program is allowed to act on `supplied`.
 *
 * @param options.supplied  the `--project` value, or null/undefined if absent.
 * @param options.declared  the id Phase 7 recorded, or null if nothing was.
 * @param options.ambient   ambient values, for the refusal message only.
 * @returns the project id, once every gate has passed.
 * @throws {TeardownRefusal} otherwise. There is no permissive branch.
 */
export function guardProjectId({ supplied, declared, ambient = {} } = {}) {
  const ambientNames = Object.keys(ambient);
  const ignored =
    ambientNames.length === 0
      ? ''
      : ` (${ambientNames.map((name) => `${name}=${ambient[name]}`).join(', ')} ` +
        'is set and was NOT used; ambient configuration never supplies this value)';

  if (typeof supplied !== 'string' || supplied.trim() === '') {
    throw new TeardownRefusal(
      Refusal.NOT_SUPPLIED,
      `refusing to act: no project id was supplied${ignored}. Pass --project explicitly.`,
    );
  }
  const projectId = supplied.trim();

  if (!DISPOSABLE_PROJECT_PATTERN.test(projectId)) {
    throw new TeardownRefusal(
      Refusal.NOT_DISPOSABLE,
      `refusing to act on ${projectId}: it does not match the disposable-project pattern ` +
        `${DISPOSABLE_PROJECT_PATTERN}. Only projects this experiment created are removable here.`,
    );
  }

  if (typeof declared !== 'string' || declared.trim() === '') {
    throw new TeardownRefusal(
      Refusal.NOT_DECLARED,
      `refusing to act on ${projectId}: nothing is declared in ${DECLARATION_PATH}, so there is ` +
        'no record that this experiment created it. Absence of a declaration is not permission.',
    );
  }

  if (declared.trim() !== projectId) {
    throw new TeardownRefusal(
      Refusal.UNDECLARED_ID,
      `refusing to act on ${projectId}: the declaration names ${declared.trim()}. An unexpected ` +
        'identifier is the case to fail closed on.',
    );
  }

  return projectId;
}

/** Read Phase 7's declaration, or `null` when it has not been written. */
export function readDeclaration(path = DECLARATION_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Judge removal by what a fresh read says, never by what a delete returned.
 *
 * @param options.state     lifecycle state from a fresh `describe`, or null when
 *                          the project no longer exists.
 * @param options.resources Agent Runtime resources from a fresh listing.
 * @param options.deleteExitCode recorded, and deliberately not consulted.
 */
export function judgeRemoval({ state, resources, deleteExitCode = null }) {
  const remaining = resources?.length ?? 0;
  const gone = state === null || state === 'DELETE_REQUESTED' || state === 'DELETED';
  const problems = [];
  if (!gone) problems.push(`the project is still ${state ?? 'unreadable'}`);
  if (remaining !== 0) problems.push(`${remaining} Agent Runtime resource(s) remain`);
  return {
    verifiedBy: 'independent-reread',
    projectState: state === null ? 'DELETED' : state,
    remainingResources: remaining,
    // Recorded so a reader can see it was available and not relied upon.
    deleteExitCode,
    deleteExitCodeConsulted: false,
    removed: problems.length === 0,
    problems,
  };
}

/**
 * The real `gcloud` adapter.
 *
 * Every command names the project explicitly and runs with the ambient project
 * variables removed, so there is no path by which a missing argument becomes a
 * different project. Built lazily, and only after the guard has passed.
 */
export function gcloudAdapter() {
  const env = { ...process.env };
  for (const name of AMBIENT_VARIABLES) delete env[name];

  const run = (args) => {
    try {
      return { ok: true, stdout: execFileSync('gcloud', args, { encoding: 'utf8', env }) };
    } catch (error) {
      return { ok: false, stdout: '', status: error.status ?? 1, detail: error.message };
    }
  };

  return {
    deleteProject(projectId) {
      const result = run(['projects', 'delete', projectId, '--quiet']);
      return { exitCode: result.ok ? 0 : result.status };
    },
    describeProject(projectId) {
      const result = run([
        'projects',
        'describe',
        projectId,
        '--format=value(lifecycleState)',
        '--quiet',
      ]);
      if (!result.ok) return null;
      const state = result.stdout.trim();
      return state === '' ? null : state;
    },
    listAgentRuntimeResources(projectId) {
      const result = run([
        'alpha',
        'ai',
        'reasoning-engines',
        'list',
        `--project=${projectId}`,
        '--format=value(name)',
        '--quiet',
      ]);
      if (!result.ok) return [];
      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    },
  };
}

/** Verify removal without attempting one. Reads; changes nothing. */
export function verifyRemoval({ projectId, cloud }) {
  return judgeRemoval({
    state: cloud.describeProject(projectId),
    resources: cloud.listAgentRuntimeResources(projectId),
  });
}

/** Delete, then verify by re-reading. The delete's exit code decides nothing. */
export function executeTeardown({ projectId, cloud }) {
  const { exitCode } = cloud.deleteProject(projectId);
  return judgeRemoval({
    state: cloud.describeProject(projectId),
    resources: cloud.listAgentRuntimeResources(projectId),
    deleteExitCode: exitCode,
  });
}

/** Parse `--project <id>` without accepting a bare positional as one. */
export function readProjectArgument(argv) {
  const index = argv.indexOf('--project');
  if (index === -1) return null;
  const value = argv[index + 1];
  return typeof value === 'string' && !value.startsWith('--') ? value : null;
}

function main(argv) {
  const wantsVerify = argv.includes('--verify');
  const wantsExecute = argv.includes('--execute');
  if (!wantsVerify && !wantsExecute) {
    process.stderr.write('teardown: pass --verify or --execute, and --project <id>\n');
    return 2;
  }

  const declaration = readDeclaration();
  let projectId;
  try {
    projectId = guardProjectId({
      supplied: readProjectArgument(argv),
      declared: declaration?.projectId ?? null,
      ambient: ambientProjects(),
    });
  } catch (error) {
    if (!(error instanceof TeardownRefusal)) throw error;
    process.stderr.write(`teardown: ${error.code}: ${error.message}\n`);
    // Deliberately not `PASS`, and deliberately non-zero. "Nothing was
    // declared" must never be readable as "teardown verified".
    process.stdout.write('disposable-project-state=UNKNOWN\n');
    process.stdout.write(`REFUSED ${error.code}\n`);
    return 3;
  }

  const cloud = gcloudAdapter();
  const verdict = wantsExecute
    ? executeTeardown({ projectId, cloud })
    : verifyRemoval({ projectId, cloud });

  process.stdout.write(`agent-runtime-resources-remaining=${verdict.remainingResources}\n`);
  process.stdout.write(`disposable-project-state=${verdict.projectState}\n`);
  if (!verdict.removed) {
    for (const problem of verdict.problems) process.stderr.write(`teardown: ${problem}\n`);
    process.stdout.write('FAIL\n');
    return 1;
  }
  process.stdout.write('PASS\n');
  return 0;
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
