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
 *     accident. Supplied twice is also a refusal: two answers is no answer.
 *   - **Ambient configuration is never a source.** `gcloud` configuration and
 *     `CLOUDSDK_CORE_PROJECT` / `GOOGLE_CLOUD_PROJECT` are read only so the
 *     refusal can *say* what it ignored. They never supply the value, and every
 *     `CLOUDSDK_*` variable is stripped from the environment of every command
 *     this runs, so a spawned process cannot fall back to one either.
 *   - **The identifier must have been declared.** Phase 7 records the project it
 *     created in `evidence/topology.json`. A supplied id that does not match
 *     that record byte for byte is refused: an unexpected identifier is the case
 *     to fail closed on, not the case to be helpful about.
 *   - **It must look disposable.** The shape fence `^interlock-s1-[0-9a-f]{8}$`,
 *     checked as well as the declaration rather than instead of it, so a
 *     corrupted declaration cannot nominate an arbitrary project.
 *
 * ## Deletion is not evidence of removal
 *
 * `gcloud projects delete` returning 0 means the request was accepted. It is not
 * an observation that anything is gone, and the difference is the whole point of
 * REQ-059: teardown is verified by **re-reading the cloud**. So the delete's exit
 * code is recorded and then ignored, and the verdict comes from five fresh reads
 * (G-8): the project's lifecycle state, and one listing per resource family this
 * experiment can create.
 *
 * ## Failure to read is never absence
 *
 * This is the defect this file was rewritten to remove. The previous adapter
 * mapped **any** command failure onto a success-shaped answer — a failed
 * `describe` became `null`, read downstream as "the project is gone", and a
 * failed `list` became `[]`, read as "no resources remain". On a workstation with
 * no `gcloud` installed at all, the tool therefore produced a fully green verdict
 * claiming `verifiedBy: "independent-reread"`, having re-read nothing.
 *
 * So a probe now has **three** outcomes, and they are not interchangeable:
 *
 *   - `ok`     — the command ran and its output was understood.
 *   - `absent` — the command failed in the specific, recognisable way a project
 *                that no longer exists fails: `NOT_FOUND`. That is a positive
 *                observation of absence.
 *   - `error`  — everything else. Missing binary, unparseable output, unknown
 *                lifecycle state, network failure, a thrown exception, and
 *                *including* `PERMISSION_DENIED`.
 *
 * `PERMISSION_DENIED` is deliberately an `error` and not an `absent`. G-8 offers
 * it as a way a deleted project can fail, and so it is — but it is equally how a
 * *live* project you cannot see fails, and G-8's own closing rule is that
 * ambiguity resolves to not-removed. A tool that cannot tell "gone" from "not
 * mine to look at" must say so rather than pick the flattering reading.
 *
 * Any `error` on any probe means `removed = false`, `verified = false`, `FAIL`,
 * and a `verifiedBy` that is *not* `independent-reread`. Only a full set of
 * successful re-reads that positively establish absence can emit that value.
 *
 * ## A refusal says which refusal it was
 *
 * Every refusal prints `teardown-refused=<CODE>` on its own line, where `<CODE>`
 * is one member of {@link Refusal}. The codes are stable and there is one per
 * distinct way the guard can say no:
 *
 *   | code                                    | exit | cause                       |
 *   | --------------------------------------- | ---- | --------------------------- |
 *   | `TEARDOWN_MODE_NOT_SUPPLIED`            | 2    | neither `--verify` nor `--execute` |
 *   | `PROJECT_ID_NOT_SUPPLIED`               | 2    | `--project` absent or empty |
 *   | `PROJECT_ID_SUPPLIED_MORE_THAN_ONCE`    | 2    | `--project` given twice     |
 *   | `PROJECT_ID_NOT_DISPOSABLE`             | 4    | fails the G-4 shape fence   |
 *   | `NO_DISPOSABLE_PROJECT_DECLARED`        | 3    | nothing declared at all     |
 *   | `PROJECT_ID_DOES_NOT_MATCH_DECLARATION` | 3    | declared, but a different id |
 *
 * The exit codes are not distinct and are not meant to be. Asserting only that
 * one landed in the 2-4 band is what let a `--project=<id>` parsing regression
 * pass REQ-072 while collapsing all five of its probes into the same "nothing
 * was supplied" refusal. The code says how bad; only the reason says what.
 *
 * The other half of that proof is the invocation log: see
 * {@link GCLOUD_LOG_VARIABLE}. Set it, and every attempted spawn is recorded
 * before it happens, so an empty log is evidence that the refusal came first.
 *
 *   node experiments/hac-316/bin/teardown.mjs --verify --project=<id>
 *   node experiments/hac-316/bin/teardown.mjs --execute --confirm --project=<id>
 *
 * With no declaration on disk — which is the state during Phase 6 — every mode
 * refuses and exits non-zero. Absence of a declaration is not evidence that a
 * teardown succeeded, and this program will never print `PASS` for it.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectInvocation } from '../src/entrypoint.mjs';
import { readEnv } from '../src/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');

/**
 * Where Phase 7 records the project it created. Absent until it does.
 *
 * G-3 names `evidence/topology.json` specifically, and REQ-072 reads its
 * `projectId` to build the id it expects teardown to accept. Reading a different
 * file would leave the agreement gate pointed at something no requirement checks.
 */
export const DECLARATION_PATH = join(experimentDir, 'evidence', 'topology.json');

/**
 * What a disposable HAC-316 project is allowed to be called (G-4).
 *
 * A second gate, not the only one. It cannot by itself distinguish a disposable
 * project from a production one that happens to be named similarly, which is why
 * the declaration is also required — but it does stop a corrupted or
 * hand-edited declaration from nominating something arbitrary.
 */
export const DISPOSABLE_PROJECT_PATTERN = /^interlock-s1-[0-9a-f]{8}$/;

/** The region every regional resource in this experiment lives in. */
export const REGION = 'us-central1';

/** Environment variables that would otherwise supply a project id by accident. */
export const AMBIENT_VARIABLES = Object.freeze([
  'CLOUDSDK_CORE_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GCP_PROJECT',
]);

/** Where a test shim may supply a stand-in binary (G-11). */
export const GCLOUD_BIN_VARIABLE = 'HAC316_GCLOUD_BIN';

/**
 * Where every attempted cloud invocation is appended, when it is set.
 *
 * The gate that matters most in REQ-071 and REQ-072 is not the exit code, it is
 * the *empty invocation log*: a refusal has to happen before any process is
 * spawned, not after one has already been told to delete something.
 *
 * That gate used to rest entirely on the test shim recording its own
 * invocations, which makes it vacuous in two ways. A caller that sets
 * `HAC316_GCLOUD_BIN` but forgets `HAC316_GCLOUD_LOG` gets an empty log no
 * matter what teardown did; and a shim whose own append fails silently is
 * indistinguishable from a teardown that never called it. So this program writes
 * the audit line itself, immediately before every spawn and whatever binary is
 * about to be run. An empty log is then evidence that no invocation was
 * *attempted*, which is the claim the requirement is actually making.
 *
 * It is never a source of truth for teardown's own decisions and it never
 * suppresses one; it is a write-only record.
 */
export const GCLOUD_LOG_VARIABLE = 'HAC316_GCLOUD_LOG';

/**
 * The stand-in binary the refusal probes use, defined once so the gate, the
 * suite and this file cannot drift into testing three different things.
 *
 * It records what it was asked and exits 0 — the most permissive possible
 * `gcloud`. That is deliberate: if teardown reaches it at all, the log is
 * non-empty and the probe fails regardless of the exit code that came back.
 */
export const GCLOUD_SHIM_SCRIPT = `#!/bin/sh\necho "$@" >> "$${GCLOUD_LOG_VARIABLE}"\nexit 0\n`;

/**
 * Why a teardown refused.
 *
 * Every one of these is a stop, never a warning, and every one of them is
 * *distinct*: the reason is emitted as a stable machine-readable token so a gate
 * can assert which refusal happened rather than that some refusal happened.
 *
 * That distinction is the point. REQ-072 drives five different mismatched ids
 * through this program and used to assert only `2 <= exit <= 4` plus an empty
 * invocation log. When `--project=<id>` parsing regressed, all five collapsed
 * into the same `PROJECT_ID_NOT_SUPPLIED` refusal — still in the band, still no
 * invocations — and the requirement reported PASS having tested nothing it
 * claimed to test. A band is not an assertion about behaviour; a reason code is.
 */
export const Refusal = Object.freeze({
  /** No mode operand at all: neither `--verify` nor `--execute`. */
  NO_MODE: 'TEARDOWN_MODE_NOT_SUPPLIED',
  /** `--project` absent, empty, or present with no value (G-1). */
  NOT_SUPPLIED: 'PROJECT_ID_NOT_SUPPLIED',
  /** `--project` given more than once. Two answers is no answer (G-1). */
  REPEATED: 'PROJECT_ID_SUPPLIED_MORE_THAN_ONCE',
  /** The id is not shaped like a disposable HAC-316 project (G-4). */
  NOT_DISPOSABLE: 'PROJECT_ID_NOT_DISPOSABLE',
  /** Nothing is recorded in `evidence/topology.json` at all (G-3). */
  NOT_DECLARED: 'NO_DISPOSABLE_PROJECT_DECLARED',
  /** A declaration exists and names a different project (G-3). */
  UNDECLARED_ID: 'PROJECT_ID_DOES_NOT_MATCH_DECLARATION',
});

/**
 * Exit code per refusal, as the guard table fixes them.
 *
 * G-1 (absent, empty, repeated) exits 2; G-3 (two-key disagreement, or a
 * declaration that is missing or unreadable) exits 3; G-4 (shape) exits 4.
 * REQ-071 asserts the 2 exactly; REQ-072 asserts the whole 2-4 band.
 *
 * Note that the codes are deliberately *not* injective: `NOT_DECLARED` and
 * `UNDECLARED_ID` both exit 3, and `NOT_SUPPLIED`, `REPEATED` and `NO_MODE` all
 * exit 2. The exit code says how bad it was; only {@link Refusal} says what
 * happened, which is why a gate has to assert the reason and not the code.
 */
export const REFUSAL_EXIT_CODE = Object.freeze({
  [Refusal.NO_MODE]: 2,
  [Refusal.NOT_SUPPLIED]: 2,
  [Refusal.REPEATED]: 2,
  [Refusal.NOT_DECLARED]: 3,
  [Refusal.UNDECLARED_ID]: 3,
  [Refusal.NOT_DISPOSABLE]: 4,
});

/** Thrown by the guard. Carries the code so a caller can report it precisely. */
export class TeardownRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeardownRefusal';
    this.code = code;
    this.exitCode = REFUSAL_EXIT_CODE[code] ?? 2;
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
      `refusing to act: no project id was supplied${ignored}. Pass --project=<id> explicitly.`,
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

  // Byte comparison, per G-3. The trim above is on the operand only; the
  // declaration is compared as written.
  if (declared !== projectId) {
    throw new TeardownRefusal(
      Refusal.UNDECLARED_ID,
      `refusing to act on ${projectId}: the declaration names ${declared}. An unexpected ` +
        'identifier is the case to fail closed on.',
    );
  }

  return projectId;
}

/**
 * Read Phase 7's declaration, or `null` when it has not been written.
 *
 * A file that exists but cannot be parsed reads as `null`, which the guard turns
 * into a refusal. An unreadable declaration is not a licence to proceed.
 */
export function readDeclaration(path = DECLARATION_PATH) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** What a single re-read probe concluded. These three are never interchangeable. */
export const ProbeOutcome = Object.freeze({
  /** The command ran and its output was understood. */
  OK: 'ok',
  /** The command failed in the recognisable way a project that is gone fails. */
  ABSENT: 'absent',
  /** Anything else. Never readable as absence. */
  ERROR: 'error',
});

/** Lifecycle states that mean the project is on its way out or already out. */
export const GONE_LIFECYCLE_STATES = Object.freeze(['DELETE_REQUESTED', 'DELETED']);

/** Lifecycle states that mean the project is still there. */
export const LIVE_LIFECYCLE_STATES = Object.freeze(['ACTIVE']);

/**
 * Failures that positively establish absence.
 *
 * Deliberately narrow. Anything not on this list is an `error`, because the
 * question this list answers is "did the cloud tell us the thing is gone", and
 * only a `NOT_FOUND`-shaped answer does that.
 */
const ABSENCE_SIGNALS = Object.freeze([
  /NOT_FOUND/,
  /\bwas not found\b/i,
  /\bdoes not exist\b/i,
  /\bcould not be found\b/i,
]);

/**
 * Failures that are ambiguous, and are therefore refused rather than read.
 *
 * Checked *before* the absence signals, so a message that mentions both cannot
 * be resolved in the flattering direction. `PERMISSION_DENIED` is the important
 * member: a deleted project and a live project you cannot see are
 * indistinguishable through it.
 */
const AMBIGUOUS_SIGNALS = Object.freeze([
  /PERMISSION_DENIED/i,
  /\bpermission denied\b/i,
  /\bnot authorized\b/i,
  /\bdo(?:es)? not have permission\b/i,
  /\breauthentication\b/i,
  /\bcredentials\b/i,
  /\blogin required\b/i,
]);

const firstLine = (text) => String(text).split('\n').find((line) => line.trim() !== '')?.trim() ?? '';

/**
 * Turn a non-zero command into an outcome.
 *
 * There is no branch here that returns `ok`, and exactly one that returns
 * `absent`.
 */
export function classifyFailure({ status = null, stderr = '', raw = '' } = {}) {
  const text = String(stderr ?? '');
  const detail = firstLine(text) || `exited ${status === null ? 'abnormally' : status}`;
  if (AMBIGUOUS_SIGNALS.some((pattern) => pattern.test(text))) {
    return { outcome: ProbeOutcome.ERROR, reason: 'not-authorised', raw, detail };
  }
  if (ABSENCE_SIGNALS.some((pattern) => pattern.test(text))) {
    return { outcome: ProbeOutcome.ABSENT, reason: 'not-found', raw, detail };
  }
  return { outcome: ProbeOutcome.ERROR, reason: 'command-failed', raw, detail };
}

/**
 * The five independent re-reads G-8 requires.
 *
 * One lifecycle read plus one listing per resource family this experiment can
 * create. Each names the project explicitly in its own argument vector, so a
 * probe cannot inherit its target from anywhere.
 */
export const REREAD_PROBES = Object.freeze([
  Object.freeze({
    name: 'projects describe',
    kind: 'lifecycle',
    argv: (projectId) => ['projects', 'describe', projectId, '--format=value(lifecycleState)'],
  }),
  Object.freeze({
    name: 'run services list',
    kind: 'resources',
    argv: (projectId) => [
      'run',
      'services',
      'list',
      `--project=${projectId}`,
      `--region=${REGION}`,
      '--format=value(metadata.name)',
    ],
  }),
  Object.freeze({
    name: 'artifacts repositories list',
    kind: 'resources',
    argv: (projectId) => [
      'artifacts',
      'repositories',
      'list',
      `--project=${projectId}`,
      `--location=${REGION}`,
      '--format=value(name)',
    ],
  }),
  Object.freeze({
    name: 'ai reasoning-engines list',
    kind: 'resources',
    argv: (projectId) => [
      'ai',
      'reasoning-engines',
      'list',
      `--project=${projectId}`,
      `--region=${REGION}`,
      '--format=value(name)',
    ],
  }),
  Object.freeze({
    name: 'storage buckets list',
    kind: 'resources',
    argv: (projectId) => [
      'storage',
      'buckets',
      'list',
      `--project=${projectId}`,
      '--format=value(name)',
    ],
  }),
]);

/**
 * Turn one command result into the probe record G-9 stores.
 *
 * Pure, so every classification below is testable without a process, a network
 * or a cloud. `rows` is always a number because REQ-073 sums it.
 */
export function interpretProbe(spec, result) {
  const base = {
    probe: spec.name,
    outcome: result.outcome,
    rows: 0,
    raw: result.raw ?? '',
  };

  if (result.outcome === ProbeOutcome.ERROR) {
    return { ...base, verified: false, reason: result.reason ?? 'error', detail: result.detail ?? '' };
  }

  if (spec.kind === 'lifecycle') {
    if (result.outcome === ProbeOutcome.ABSENT) {
      // The one reading that establishes absence rather than assuming it.
      return { ...base, verified: true, live: false, lifecycleState: 'NOT_FOUND' };
    }
    const state = String(result.raw ?? '').trim();
    if (state === '') {
      return {
        ...base,
        outcome: ProbeOutcome.ERROR,
        verified: false,
        reason: 'malformed-output',
        detail: 'the lifecycle read succeeded but named no state; nothing was established',
      };
    }
    if (GONE_LIFECYCLE_STATES.includes(state)) {
      return { ...base, verified: true, live: false, lifecycleState: state };
    }
    if (LIVE_LIFECYCLE_STATES.includes(state)) {
      return { ...base, verified: true, live: true, lifecycleState: state };
    }
    return {
      ...base,
      outcome: ProbeOutcome.ERROR,
      verified: false,
      reason: 'unknown-lifecycle-state',
      lifecycleState: state,
      detail: `unrecognised lifecycle state ${JSON.stringify(state)}; ambiguity is not removal`,
    };
  }

  if (result.outcome === ProbeOutcome.ABSENT) {
    return { ...base, verified: true, names: [] };
  }

  const names = String(result.raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return { ...base, verified: true, rows: names.length, names };
}

/** Resolve the binary to spawn, and say whether a shim supplied it (G-11). */
export function resolveGcloudBinary(env = process.env) {
  const override = readEnv(GCLOUD_BIN_VARIABLE, env);
  return { binary: override ?? 'gcloud', shimmed: override !== null };
}

/**
 * Append one line to the invocation log, if one was asked for.
 *
 * Called immediately *before* the spawn, so the record exists even for a command
 * that never starts — an attempted invocation is exactly as disqualifying as a
 * completed one for the requirements that assert this log is empty.
 *
 * There is no catch. If the audit cannot be written then the emptiness of the
 * log means nothing, and a teardown that cannot substantiate "I called nothing"
 * should stop rather than proceed unaudited.
 *
 * @returns the log path, or `null` when no log was requested.
 */
export function recordInvocation({ binary, args = [], env = process.env, append = appendFileSync } = {}) {
  const path = readEnv(GCLOUD_LOG_VARIABLE, env);
  if (path === null) return null;
  append(path, `${binary} ${args.join(' ')}\n`);
  return path;
}

/**
 * The environment every spawned command gets (G-6).
 *
 * Every inherited `CLOUDSDK_*` variable is dropped, then exactly two are set:
 * the project this run is allowed to touch, and the prompt disable. Nothing a
 * spawned process reads can therefore name a different project, and nothing can
 * block waiting for a human.
 */
export function commandEnvironment(projectId, env = process.env) {
  const next = {};
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('CLOUDSDK_')) continue;
    if (AMBIENT_VARIABLES.includes(name)) continue;
    next[name] = value;
  }
  next.CLOUDSDK_CORE_PROJECT = projectId;
  next.CLOUDSDK_CORE_DISABLE_PROMPTS = '1';
  return next;
}

/**
 * The real `gcloud` adapter.
 *
 * Built lazily, and only after the guard has passed. It is constructed *for* one
 * project id and refuses to answer about any other, so a caller that mixes ids up
 * gets a throw rather than a reading about the wrong thing.
 */
export function gcloudAdapter({ projectId, env = process.env, spawn = spawnSync } = {}) {
  if (!DISPOSABLE_PROJECT_PATTERN.test(String(projectId ?? ''))) {
    throw new TeardownRefusal(
      Refusal.NOT_DISPOSABLE,
      `refusing to build a cloud adapter for ${projectId}: the shape fence has not been passed.`,
    );
  }
  const { binary, shimmed } = resolveGcloudBinary(env);
  const commandEnv = commandEnvironment(projectId, env);

  const run = (args) => {
    // Before the spawn, not after it: the log has to record the attempt.
    recordInvocation({ binary, args, env });
    let result;
    try {
      result = spawn(binary, args, { encoding: 'utf8', env: commandEnv });
    } catch (error) {
      return {
        outcome: ProbeOutcome.ERROR,
        reason: 'exception',
        raw: '',
        detail: `${binary} threw: ${error?.message ?? error}`,
      };
    }
    if (result?.error) {
      const reason = result.error.code === 'ENOENT' ? 'gcloud-not-installed' : 'spawn-failed';
      return { outcome: ProbeOutcome.ERROR, reason, raw: '', detail: `${binary}: ${result.error.message}` };
    }
    if (result?.status === 0) {
      return { outcome: ProbeOutcome.OK, reason: 'ok', raw: result.stdout ?? '' };
    }
    return classifyFailure({
      status: result?.status ?? null,
      stderr: result?.stderr ?? '',
      raw: result?.stdout ?? '',
    });
  };

  const sameProject = (candidate) => {
    if (candidate !== projectId) {
      throw new TeardownRefusal(
        Refusal.UNDECLARED_ID,
        `refusing: this adapter was built for ${projectId} and was asked about ${candidate}.`,
      );
    }
  };

  return {
    projectId,
    binary,
    shimmed,
    deleteProject(candidate) {
      sameProject(candidate);
      const result = run(['projects', 'delete', projectId, '--quiet']);
      return { exitCode: result.outcome === ProbeOutcome.OK ? 0 : 1, detail: result.detail ?? '' };
    },
    /** Fresh reads, in fresh processes, every time. Nothing here is cached (G-10). */
    reread(candidate) {
      sameProject(candidate);
      return REREAD_PROBES.map((spec) => interpretProbe(spec, run(spec.argv(projectId))));
    },
  };
}

/**
 * Judge removal by what the re-reads say, never by what a delete returned.
 *
 * The verdict is the G-9 record. `verifiedBy` is `independent-reread` only when
 * every probe ran, every probe was understood, no shim was involved, and the
 * readings positively establish absence — which is to say, only when the claim is
 * true. Anything else, including a probe that simply could not be run, is
 * `not-established`.
 *
 * @param options.probes         records from {@link interpretProbe}.
 * @param options.deleteExitCode recorded, and deliberately not consulted.
 * @param options.shimmed        whether a stand-in binary answered (G-11).
 */
export function judgeRemoval({
  projectId = null,
  probes = [],
  deleteExitCode = null,
  shimmed = false,
} = {}) {
  const problems = [];

  for (const probe of probes) {
    if (probe.verified !== true) {
      problems.push(
        `${probe.probe} did not verify (${probe.reason ?? probe.outcome}): ` +
          `${probe.detail || 'no detail was reported'}`,
      );
    }
  }

  const expected = REREAD_PROBES.map((spec) => spec.name);
  const ran = new Set(probes.map((probe) => probe.probe));
  const missing = expected.filter((name) => !ran.has(name));
  for (const name of missing) problems.push(`the ${name} re-read was never performed`);

  const lifecycle = probes.find((probe) => probe.probe === 'projects describe');
  if (lifecycle?.verified === true && lifecycle.live === true) {
    problems.push(`the project is still ${lifecycle.lifecycleState}`);
  }

  const remainingResources = probes.reduce(
    (total, probe) => total + (Number.isInteger(probe.rows) ? probe.rows : 0),
    0,
  );
  if (remainingResources !== 0) problems.push(`${remainingResources} resource(s) remain`);

  if (shimmed) {
    problems.push(
      `the binary came from ${GCLOUD_BIN_VARIABLE}; a shim exercises the refusal and dry-run ` +
        'paths and can never establish removal (G-11)',
    );
  }

  const allProbesRead = probes.length > 0 && missing.length === 0 && probes.every((p) => p.verified === true);
  const verified = allProbesRead && !shimmed;
  const removed = verified && problems.length === 0;

  return {
    projectId,
    // Only ever `independent-reread` when that is literally what happened.
    verifiedBy: removed ? 'independent-reread' : 'not-established',
    passedBecause: removed ? 'independent-reread' : null,
    verified,
    lifecycleState: lifecycle?.lifecycleState ?? 'UNKNOWN',
    // Retained under its older name so existing readers of the verdict keep working.
    projectState: lifecycle?.lifecycleState ?? 'UNKNOWN',
    remainingResources,
    probes,
    // Recorded so a reader can see it was available and not relied upon (G-7).
    deleteCallExitCode: deleteExitCode,
    deleteExitCode,
    deleteExitCodeConsulted: false,
    shimmed,
    removed,
    problems,
  };
}

/** Verify removal without attempting one. Reads; changes nothing. */
export function verifyRemoval({ projectId, cloud }) {
  return judgeRemoval({
    projectId,
    probes: cloud.reread(projectId),
    shimmed: cloud.shimmed === true,
  });
}

/** Delete, then verify by re-reading. The delete's exit code decides nothing. */
export function executeTeardown({ projectId, cloud }) {
  const { exitCode } = cloud.deleteProject(projectId);
  return judgeRemoval({
    projectId,
    probes: cloud.reread(projectId),
    deleteExitCode: exitCode,
    shimmed: cloud.shimmed === true,
  });
}

/**
 * Every `--project` operand, in both spellings.
 *
 * `--project <id>` and `--project=<id>` are both accepted because REQ-072 uses
 * the second form for its five mismatched-id probes. Parsing only the first
 * turned all five into the same "nothing was supplied" refusal: the exit codes
 * landed in the expected band and the invocation log was empty, so the
 * requirement printed PASS without ever having tested a mismatched id.
 *
 * Every occurrence is returned, including the ones that supplied nothing, so the
 * caller can refuse a repeated operand (G-1) instead of silently taking one.
 */
export function readProjectArguments(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') {
      const value = argv[index + 1];
      values.push(typeof value === 'string' && !value.startsWith('--') ? value : null);
      index += 1;
      continue;
    }
    if (typeof arg === 'string' && arg.startsWith('--project=')) {
      values.push(arg.slice('--project='.length));
    }
  }
  return values;
}

/** The single supplied project id, or `null` when there is not exactly one. */
export function readProjectArgument(argv) {
  const values = readProjectArguments(argv);
  return values.length === 1 ? values[0] : null;
}

/**
 * Exactly one `--project` operand, or a refusal that says which way it was wrong.
 *
 * Repetition is its own reason code rather than being folded into "not
 * supplied", because they are different mistakes: one is a command that forgot
 * the target, the other is a command that named two.
 */
export function requireSingleProjectArgument(argv) {
  const values = readProjectArguments(argv);
  if (values.length > 1) {
    throw new TeardownRefusal(
      Refusal.REPEATED,
      `refusing to act: --project was supplied ${values.length} times. Two answers is no answer.`,
    );
  }
  return values[0];
}

/**
 * The stdout a refusal prints, as lines a gate can grep for.
 *
 * `teardown-refused=<CODE>` is the assertion surface: one stable token per
 * distinct refusal, on its own line, in `key=value` form like every other line
 * this program emits. `REFUSED <CODE>` is kept because existing checks look for
 * the word, and the state lines are kept because "nothing was declared" must
 * never be readable as "teardown verified".
 */
export function refusalReport(refusal) {
  return [
    'disposable-project-state=UNKNOWN',
    'teardown-verified=false',
    `teardown-refused=${refusal.code}`,
    `teardown-refusal-exit=${refusal.exitCode}`,
    `REFUSED ${refusal.code}`,
  ]
    .map((line) => `${line}\n`)
    .join('');
}

/** The commands a dry run would issue, for G-5's closed resource set. */
export function plannedCommands(projectId) {
  return [
    `gcloud projects delete ${projectId}`,
    ...REREAD_PROBES.map((spec) => `gcloud ${spec.argv(projectId).join(' ')}`),
  ];
}

/**
 * The whole command line, with every collaborator injectable.
 *
 * Exported and dependency-injected so each refusal reason can be driven through
 * the *real* command line in a test — including the two that need a declaration
 * on disk, which cannot be written for a test without inventing a Phase 7 record
 * in `evidence/`. The cloud is built through `buildCloud` for the same reason
 * the guard exists at all: a test can pass one that throws if it is ever called,
 * and thereby assert that no refusal path can reach a spawn.
 *
 * @param options.declaration the parsed declaration, or `null`. Defaults to
 *        whatever is on disk; `undefined` means "read it", not "there is none".
 * @param options.buildCloud  builds the adapter. Never called on a refusal path.
 */
export function runCli(argv, options = {}) {
  const {
    out = (text) => process.stdout.write(text),
    err = (text) => process.stderr.write(text),
    env = process.env,
    buildCloud = ({ projectId }) => gcloudAdapter({ projectId, env }),
  } = options;
  const declaration =
    options.declaration === undefined ? readDeclaration() : options.declaration;

  let projectId;
  let wantsExecute = false;
  let confirmed = false;
  try {
    const wantsVerify = argv.includes('--verify');
    wantsExecute = argv.includes('--execute');
    confirmed = argv.includes('--confirm');
    if (!wantsVerify && !wantsExecute) {
      throw new TeardownRefusal(
        Refusal.NO_MODE,
        'refusing to act: pass --verify or --execute, and --project=<id>.',
      );
    }
    projectId = guardProjectId({
      supplied: requireSingleProjectArgument(argv),
      declared: declaration?.projectId ?? null,
      ambient: ambientProjects(env),
    });
  } catch (error) {
    if (!(error instanceof TeardownRefusal)) throw error;
    err(`teardown: ${error.code}: ${error.message}\n`);
    // Deliberately not `PASS`, and deliberately non-zero. "Nothing was
    // declared" must never be readable as "teardown verified".
    out(refusalReport(error));
    return error.exitCode;
  }

  if (wantsExecute && !confirmed) {
    // G-5: a dry run says what it would do and makes no call at all. The adapter
    // is not even built, so there is no path from here to a spawned process.
    out(`dry-run project=${projectId}\n`);
    for (const command of plannedCommands(projectId)) {
      out(`would-run: ${command}\n`);
    }
    out('DRY-RUN (pass --confirm to act)\n');
    return 0;
  }

  const cloud = buildCloud({ projectId, env });
  const verdict = wantsExecute
    ? executeTeardown({ projectId, cloud })
    : verifyRemoval({ projectId, cloud });

  for (const probe of verdict.probes) {
    out(`probe ${probe.probe}: outcome=${probe.outcome} rows=${probe.rows}\n`);
  }
  out(`agent-runtime-resources-remaining=${verdict.remainingResources}\n`);
  out(`disposable-project-state=${verdict.lifecycleState}\n`);
  out(`teardown-verified=${verdict.verified}\n`);
  out(`teardown-verified-by=${verdict.verifiedBy}\n`);
  if (!verdict.removed) {
    for (const problem of verdict.problems) err(`teardown: ${problem}\n`);
    out('FAIL\n');
    return 1;
  }
  out('PASS\n');
  return 0;
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
