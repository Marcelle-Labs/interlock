/**
 * The protected mutation broker, and the two intents the experiment composes.
 *
 * The broker is the only thing that writes to the fixture. It has exactly one
 * behavioural switch — the Interlock decision — and every arm of the experiment
 * drives the same code through it. That is deliberate: if each arm had its own
 * apply path, a difference in outcome could be a difference in the harness.
 *
 * ## Why A and B are each valid alone
 *
 * Both intents claim +20 against a pool with 30 headroom. Either one fits.
 * Neither is unreasonable, neither is malformed, and each passes the target
 * invariant when applied to the state it was validated against. The hazard is
 * not in either intent — it is in composing them, and it is invisible to any
 * check that examines one intent at a time.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git } from './exec.mjs';

/**
 * Intent A — the capacity planner raises alpha's reservation for a reindex.
 * Valid alone: 60 + 40 + 20 = 120 <= 130.
 */
export const INTENT_A = Object.freeze({
  id: 'A',
  agent: 'capacity-planner',
  summary: "raise alpha's reservation from 40 to 60 for the reindex window",
  targets: Object.freeze(['services/alpha/reservation.json']),
  write: Object.freeze({ service: 'alpha', reserved: 60 }),
});

/**
 * Intent B — the traffic shaper raises beta's reservation for a backfill.
 * Valid alone: 40 + 60 + 20 = 120 <= 130.
 */
export const INTENT_B = Object.freeze({
  id: 'B',
  agent: 'traffic-shaper',
  summary: "raise beta's reservation from 40 to 60 for the backfill window",
  targets: Object.freeze(['services/beta/reservation.json']),
  write: Object.freeze({ service: 'beta', reserved: 60 }),
});

/** Return the fixture to its committed state. Every arm starts here. */
export function resetWorktree(repo) {
  git(repo, ['checkout', '--quiet', '--', '.']);
  git(repo, ['clean', '-qfd']);
}

export const headRevision = (repo) => git(repo, ['rev-parse', 'HEAD']).trim();

/**
 * Run the fixture's own target invariant.
 *
 * The verdict is a process exit code from a separate program that lives in the
 * fixture, not an assertion made by this harness and not a judgement made by a
 * model. Exit 0 means the invariant holds.
 */
export function checkInvariant(repo) {
  const target = join(repo, 'verify.mjs');
  try {
    const stdout = execFileSync(process.execPath, [target], { encoding: 'utf8' });
    return { holds: true, exitCode: 0, report: JSON.parse(stdout) };
  } catch (error) {
    if (typeof error.status !== 'number') throw error;
    return { holds: false, exitCode: error.status, report: JSON.parse(error.stdout) };
  }
}

/** Apply one intent's write to the working tree. */
function applyIntent(repo, intent) {
  for (const target of intent.targets) {
    writeFileSync(join(repo, target), `${JSON.stringify(intent.write, null, 2)}\n`);
  }
}

/** Undo one intent's write, restoring the committed content of its targets. */
function revertIntent(repo, intent) {
  git(repo, ['checkout', '--quiet', '--', ...intent.targets]);
}

/**
 * The local, single-intent validation each agent performs before submitting.
 *
 * This is the check that makes both intents "green": it applies the intent to
 * the state the agent observed and runs the target invariant. It is honest and
 * it is not enough — it cannot see an intent it was never shown.
 */
export function validateAlone(repo, intent) {
  resetWorktree(repo);
  applyIntent(repo, intent);
  const result = checkInvariant(repo);
  resetWorktree(repo);
  return result;
}

/**
 * Execute a set of intents against the fixture under a decision.
 *
 * The three branches differ only in *when* each intent's precondition is
 * evaluated, which is exactly the hazard being studied:
 *
 * - `ALLOW_PARALLEL` — every intent is validated against the base state it was
 *   submitted against, then all writes land. This is uncoordinated composition:
 *   each precondition was true when it was checked and false by the time the
 *   last write landed.
 *
 * - `WITHHOLD_SERIALIZE` — intents are admitted one at a time and each is
 *   revalidated against the *current* state. An intent whose precondition no
 *   longer holds is rejected with a receipt rather than applied.
 *
 * - `INSUFFICIENT_EVIDENCE` — nothing is applied. Fail closed.
 */
/**
 * Fail closed. Nothing is applied, and every intent is recorded as held.
 */
function executeHeld(repo, intents, decision) {
  const events = intents.map((intent) => ({
    intent: intent.id,
    outcome: 'HELD',
    why: `fail-closed: ${decision.reason} — ${decision.detail}`,
  }));
  return { events, applied: [], rejected: [], held: intents.map((i) => i.id), invariant: checkInvariant(repo) };
}

/**
 * Uncoordinated composition.
 *
 * Each intent is validated against the base state it was submitted against —
 * which is what "concurrent" means here — and then every write lands, because
 * nothing coordinated them. Each precondition was true when it was checked and
 * false by the time the last write landed.
 */
function executeParallel(repo, intents) {
  const events = [];
  const applied = [];

  for (const intent of intents) {
    const preflight = validateAlone(repo, intent);
    events.push({
      intent: intent.id,
      outcome: preflight.holds ? 'PRECONDITION_OK_AT_BASE' : 'PRECONDITION_FAILED_AT_BASE',
      total: preflight.report.total,
    });
  }

  for (const intent of intents) {
    applyIntent(repo, intent);
    applied.push(intent.id);
    events.push({ intent: intent.id, outcome: 'APPLIED', why: 'composition permitted without coordination' });
  }

  return { events, applied, rejected: [], held: [], invariant: checkInvariant(repo) };
}

/**
 * Serialized admission with revalidation.
 *
 * Intents are admitted one at a time and each is revalidated against the
 * *current* state rather than the state it was submitted against. An intent
 * whose precondition no longer holds is rejected with a receipt, not applied.
 */
function executeSerialized(repo, intents) {
  const events = [];
  const applied = [];
  const rejected = [];

  for (const intent of intents) {
    applyIntent(repo, intent);
    const revalidated = checkInvariant(repo);

    if (revalidated.holds) {
      applied.push(intent.id);
      events.push({
        intent: intent.id,
        outcome: 'ADMITTED',
        why: 'revalidated against the current state after every previously admitted intent',
        total: revalidated.report.total,
      });
      continue;
    }

    revertIntent(repo, intent);
    rejected.push(intent.id);
    events.push({
      intent: intent.id,
      outcome: 'REJECTED',
      why: `revalidation against the post-admission state breaches the target invariant (total ${revalidated.report.total} > ${revalidated.report.totalReservable})`,
      total: revalidated.report.total,
    });
  }

  return { events, applied, rejected, held: [], invariant: checkInvariant(repo) };
}

/**
 * Execute a set of intents against the fixture under a decision.
 *
 * The three strategies differ only in *when* each intent's precondition is
 * evaluated, which is exactly the hazard being studied.
 */
export function execute({ repo, intents, decision }) {
  resetWorktree(repo);

  switch (decision.decision) {
    case 'INSUFFICIENT_EVIDENCE':
      return executeHeld(repo, intents, decision);
    case 'ALLOW_PARALLEL':
      return executeParallel(repo, intents);
    case 'WITHHOLD_SERIALIZE':
      return executeSerialized(repo, intents);
    default:
      throw new Error(`broker: unhandled decision ${decision.decision}`);
  }
}

/** Read the fixture's current reservation state, for the record. */
export function readState(repo) {
  const pool = JSON.parse(readFileSync(join(repo, 'budget', 'pool.json'), 'utf8'));
  const services = {};
  for (const service of ['alpha', 'beta', 'gamma']) {
    services[service] = JSON.parse(
      readFileSync(join(repo, 'services', service, 'reservation.json'), 'utf8'),
    ).reserved;
  }
  return { totalReservable: pool.totalReservable, services };
}
