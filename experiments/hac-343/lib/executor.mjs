/**
 * HAC-343 — the shared action executor.
 *
 * One executor, four arms. Everything about *what an action does* and *what it
 * checks before doing it* lives here; the only thing an arm contributes is
 * **when** that check happens. If a capability appeared on one arm's execution
 * path and not another's, the comparison would be measuring the harness rather
 * than the coordination policy, so there is deliberately no per-arm hook in this
 * file.
 *
 * ## The four layers, kept apart
 *
 * 1. `localPrecondition` — "is my action valid from what I can currently see?"
 *    The check a locally-correct agent already performs. Every intent in the
 *    corpus passes it in isolation, which is what makes the hazard invisible one
 *    request at a time.
 * 2. the arm's lock policy — *when* layer 1 runs (see arms.mjs).
 * 3. `arbitrate()` — "are these two actions compositionally coupled?" A4 only.
 * 4. `oracle()` — "did the resulting joint state actually remain valid?"
 *
 * Layer 4 is the one that must not be reimplemented here. It shells out to the
 * fixture's own `verify.mjs`. Nothing in this file knows what the invariant is:
 * the budget adapter can add up reservations for the *record*, but it never
 * decides whether the total was acceptable, and the registry adapter can list
 * references without deciding whether they resolve. The verdict is an exit code
 * from a subprocess the deciding code never reads.
 *
 * @see evidence/execution-semantics.json — frozen before any result.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git } from '../../hac-330/lib/exec.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = (repo, path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const writeJson = (repo, path, value) =>
  writeFileSync(join(repo, path), `${JSON.stringify(value, null, 2)}\n`);

/** Discard every uncommitted change, so no execution inherits another's state. */
export function resetWorktree(repo) {
  git(repo, ['checkout', '--quiet', '--', '.']);
  git(repo, ['clean', '--quiet', '-fd']);
}

// ---------------------------------------------------------------------------
// Family adapters
//
// Each knows how to apply its own intents and how to state its own local
// precondition. Neither knows how to judge the joint outcome.
// ---------------------------------------------------------------------------

const budget = {
  verifier: 'verify.mjs',

  readState(repo) {
    const pool = readJson(repo, 'budget/pool.json');
    const services = {};
    for (const service of ['alpha', 'beta', 'gamma']) {
      services[service] = readJson(repo, `services/${service}/reservation.json`).reserved;
    }
    return { totalReservable: pool.totalReservable, services };
  },

  applyIntent(repo, intent) {
    if (intent.op !== 'set-reservation') throw new Error(`budget: unknown op ${intent.op}`);
    writeJson(repo, intent.path, { service: intent.service, reserved: intent.reserved });
  },

  /**
   * The reservation broker's own admission check, as an ordinary service would
   * write it: would this reservation fit, given what the broker can see now?
   *
   * This is emphatically not the oracle. It is the check that returns true for
   * each intent alone and is the reason the composition is dangerous.
   */
  localPrecondition(repo, intent) {
    const state = budget.readState(repo);
    const projected = { ...state.services, [intent.service]: intent.reserved };
    const total = Object.values(projected).reduce((sum, n) => sum + n, 0);
    return {
      ok: total <= state.totalReservable,
      detail: `projected total ${total} against ceiling ${state.totalReservable}`,
    };
  },
};

const registry = {
  verifier: 'verify.mjs',

  readState(repo) {
    return {
      services: readJson(repo, 'registry/services.json').services,
      routes: readJson(repo, 'routing/routes.json').routes,
      aliases: readJson(repo, 'registry/aliases.json'),
      dashboardsRevision: readJson(repo, 'observability/dashboards.json').revision,
    };
  },

  applyIntent(repo, intent) {
    const state = registry.readState(repo);
    if (intent.op === 'remove-service') {
      writeJson(repo, 'registry/services.json', {
        services: state.services.filter((s) => s !== intent.service).sort(),
      });
      return;
    }
    if (intent.op === 'add-route') {
      const routes = [...state.routes, { path: intent.route, service: intent.service }];
      routes.sort((a, b) => (a.path < b.path ? -1 : 1));
      writeJson(repo, 'routing/routes.json', { routes });
      return;
    }
    if (intent.op === 'bump-dashboards') {
      const current = readJson(repo, 'observability/dashboards.json');
      writeJson(repo, 'observability/dashboards.json', { ...current, revision: intent.revision });
      return;
    }
    throw new Error(`registry: unknown op ${intent.op}`);
  },

  /**
   * The registry's own admission checks, as an ordinary control plane would
   * write them: do not retire a service anything still points at, and do not
   * route to a service that is not declared.
   *
   * Both are correct. Both pass in isolation. Neither can see the other action.
   */
  localPrecondition(repo, intent) {
    const state = registry.readState(repo);
    if (intent.op === 'remove-service') {
      const referencedByRoute = state.routes.some((r) => r.service === intent.service);
      const referencedByAlias = Object.values(state.aliases).includes(intent.service);
      return {
        ok: !referencedByRoute && !referencedByAlias,
        detail: referencedByRoute || referencedByAlias
          ? `${intent.service} is still referenced`
          : `${intent.service} is declared and unreferenced`,
      };
    }
    if (intent.op === 'add-route') {
      const declared = state.services.includes(intent.service);
      return {
        ok: declared,
        detail: declared
          ? `${intent.service} is declared`
          : `${intent.service} is not declared`,
      };
    }
    if (intent.op === 'bump-dashboards') {
      return { ok: true, detail: 'dashboards carry no referential obligation' };
    }
    throw new Error(`registry: unknown op ${intent.op}`);
  },
};

export const ADAPTERS = Object.freeze({ budget, registry });

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

/**
 * Ask the fixture's own verifier whether the resulting joint state is valid.
 *
 * The verdict is the process exit code. `stdout` is recorded for the packet but
 * never parsed: a verifier that printed a reassuring report while exiting
 * non-zero must read as a violation, not as success.
 *
 * A verifier that cannot run at all fails the scenario. An unanswerable question
 * is not an answer of "valid" — the same rule the decision core applies to an
 * unreadable pending-intent store.
 */
export function oracle(repo, family) {
  const adapter = ADAPTERS[family];
  const verifierPath = join(repo, adapter.verifier);
  const verifierSha256 = sha256(readFileSync(verifierPath));

  let exitCode;
  let stdout = '';
  let stderr = '';
  let spawnFailed = false;

  try {
    stdout = execFileSync(process.execPath, [adapter.verifier], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    exitCode = 0;
  } catch (error) {
    if (typeof error.status === 'number') {
      exitCode = error.status;
      stdout = error.stdout ?? '';
      stderr = error.stderr ?? '';
    } else {
      spawnFailed = true;
      exitCode = null;
      stderr = String(error.message ?? error);
    }
  }

  const state = adapter.readState(repo);

  return {
    verifierPath: adapter.verifier,
    verifierSha256,
    command: `${process.execPath} ${adapter.verifier}`,
    exitCode,
    stdout,
    stderr,
    spawnFailed,
    state,
    stateSha256: sha256(JSON.stringify(state)),
    // holds is the exit code and nothing else. A spawn failure is not safety.
    holds: !spawnFailed && exitCode === 0,
  };
}

// ---------------------------------------------------------------------------
// The critical section
// ---------------------------------------------------------------------------

/**
 * Enter, re-read, re-check, mutate or reject, leave.
 *
 * Every lock-bearing arm calls exactly this. The re-read is what makes A2 and A3
 * credible rather than strawmen: executing two already-approved mutations in
 * sequence would still overshoot, whereas a real locking implementation lets the
 * second action observe the first action's write before it decides.
 */
export function criticalSection(repo, family, intent) {
  const adapter = ADAPTERS[family];
  const precondition = adapter.localPrecondition(repo, intent);
  if (!precondition.ok) {
    return { applied: false, rejected: true, reason: 'LOCAL_PRECONDITION_FAILED', detail: precondition.detail };
  }
  adapter.applyIntent(repo, intent);
  return { applied: true, rejected: false, reason: 'APPLIED', detail: precondition.detail };
}

/**
 * Evaluate a precondition without applying, for the concurrent case.
 *
 * Concurrency in this model means both intents checked against the same base
 * snapshot and both writes then landed. That is expressed as: check both, then
 * apply both — never check-apply, check-apply.
 */
export function evaluateAgainstBase(repo, family, intent) {
  return ADAPTERS[family].localPrecondition(repo, intent);
}

export function applyIntent(repo, family, intent) {
  ADAPTERS[family].applyIntent(repo, intent);
}

export { sha256 };
