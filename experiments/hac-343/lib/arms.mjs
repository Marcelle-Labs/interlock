/**
 * HAC-343 — the four coordination policies.
 *
 * Every arm calls the same executor, applies the same actions, and runs the same
 * local preconditions. The only thing that varies is **when** a precondition is
 * evaluated, which is the whole of the hazard.
 *
 * Concurrency, precisely: two intents run concurrently when both evaluate their
 * precondition against the same base snapshot and both writes then land. They
 * run serially when the second evaluates against what the first already wrote.
 * Every lock-bearing arm expresses that through one shared critical section —
 * acquire, re-read, re-check, mutate or reject, release — so a lock baseline
 * genuinely gets to see the other action's write before deciding. Without that
 * re-read the lock arms would be strawmen that merely reordered two
 * already-approved mutations, and would overshoot anyway.
 *
 * A1 and A3-on-distinct-targets deliberately reduce to the same code path. That
 * is not a shortcut: holding two different locks provides exactly as much mutual
 * exclusion as holding none, and stating it in code rather than in prose is the
 * clearest form of the finding.
 *
 * @see evidence/execution-semantics.json — frozen before any result.
 */
import { Decision, arbitrate } from '../../../dist/broker/pairing/arbitrate.js';

import {
  applyIntent,
  criticalSection,
  evaluateAgainstBase,
  resetWorktree,
  sha256,
} from './executor.mjs';

export const ARMS = Object.freeze(['A1_uncoordinated', 'A2_global_lock', 'A3_per_target_lock', 'A4_interlock']);

/**
 * Lock key policy. `A1` gives every intent its own key, which is the same thing
 * as holding no lock: distinct keys never contend.
 */
function lockKeyFor(arm, intent, index) {
  if (arm === 'A1_uncoordinated') return `NONE#${index}`;
  if (arm === 'A2_global_lock') return 'GLOBAL';
  if (arm === 'A3_per_target_lock') return intent.path;
  throw new Error(`lockKeyFor: ${arm} does not use lock keys`);
}

/**
 * Execute intents under a lock-key policy.
 *
 * Phase 1 — each lock group evaluates from the base snapshot in isolation, and
 * intents sharing a key serialize within their group so the second sees the
 * first's write. Phase 2 — every approved write lands together.
 *
 * With one group this reduces to plain serialization; with N groups it is the
 * lost-update composition, which is the point.
 */
function runLocked(repo, family, intents, arm) {
  resetWorktree(repo);

  const groups = new Map();
  intents.forEach((intent, index) => {
    const key = lockKeyFor(arm, intent, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(intent);
  });

  const outcomes = [];
  for (const [key, groupIntents] of groups) {
    resetWorktree(repo);
    for (const intent of groupIntents) {
      const result = criticalSection(repo, family, intent);
      outcomes.push({ intentId: intent.id, lockKey: key, ...result });
    }
  }

  resetWorktree(repo);
  for (const outcome of outcomes) {
    if (outcome.applied) applyIntent(repo, family, intents.find((i) => i.id === outcome.intentId));
  }

  return {
    outcomes,
    lockGroups: [...groups.keys()],
    concurrent: groups.size > 1,
  };
}

// ---------------------------------------------------------------------------
// A4 — Interlock
// ---------------------------------------------------------------------------

/**
 * Deterministic pending-intent records.
 *
 * `recordedAt` is derived from the scenario id and the intent's position, never
 * from a clock: arbitrate() breaks precedence ties on recordedAt then
 * correlationId, so a wall-clock value would make the leader — and therefore the
 * result — differ between runs.
 */
function pendingIntents(scenario, intents) {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  return intents.map((intent, index) => ({
    correlationId: `ilk-${sha256(`${scenario.id}#${intent.id}`).slice(0, 24)}`,
    agent: `agent-${index + 1}`,
    operation: intent.op,
    targets: [intent.path],
    intentDigest: `sha256:${sha256(JSON.stringify(intent))}`,
    recordedAt: new Date(base + index * 1000).toISOString(),
    expiresAt: new Date(base + 3_600_000).toISOString(),
  }));
}

function runInterlock(repo, family, scenario, intents, { evidence, sourceRevision }) {
  resetWorktree(repo);

  const pending = pendingIntents(scenario, intents);

  // One verdict per arriving intent, each against everything else in flight.
  const verdicts = pending.map((candidate) =>
    arbitrate({
      candidate,
      others: { ok: true, value: pending.filter((p) => p.correlationId !== candidate.correlationId) },
      evidence,
      sourceRevision,
    }),
  );

  const refused = verdicts.find((v) => v.decision === Decision.INSUFFICIENT_EVIDENCE);
  if (refused) {
    return {
      verdicts,
      outcomes: intents.map((intent) => ({
        intentId: intent.id,
        applied: false,
        rejected: true,
        reason: 'REFUSED_INSUFFICIENT_EVIDENCE',
        detail: refused.reasonCode,
      })),
      refusalReason: refused.reasonCode,
      concurrent: false,
    };
  }

  const allParallel = verdicts.every((v) => v.decision === Decision.ALLOW_PARALLEL);

  if (allParallel) {
    // Concurrent: every intent evaluates against the base snapshot, then the
    // approved writes land together — identical semantics to the lock arms'
    // multi-group case, so no arm gets a different notion of "concurrent".
    const evaluated = intents.map((intent) => ({
      intent,
      precondition: evaluateAgainstBase(repo, family, intent),
    }));
    for (const { intent, precondition } of evaluated) {
      if (precondition.ok) applyIntent(repo, family, intent);
    }
    return {
      verdicts,
      outcomes: evaluated.map(({ intent, precondition }) => ({
        intentId: intent.id,
        applied: precondition.ok,
        rejected: !precondition.ok,
        reason: precondition.ok ? 'APPLIED' : 'LOCAL_PRECONDITION_FAILED',
        detail: precondition.detail,
      })),
      concurrent: true,
    };
  }

  // Serialized: whoever holds precedence proceeds through the same critical
  // section every lock arm uses; the rest are withheld and would resubmit.
  const outcomes = [];
  for (const [index, intent] of intents.entries()) {
    const verdict = verdicts[index];
    if (verdict.decision === Decision.ALLOW_SERIALIZED) {
      outcomes.push({ intentId: intent.id, ...criticalSection(repo, family, intent) });
    } else {
      outcomes.push({
        intentId: intent.id,
        applied: false,
        rejected: true,
        reason: 'WITHHELD_SERIALIZE',
        detail: verdict.detail,
      });
    }
  }

  return { verdicts, outcomes, concurrent: false };
}

// ---------------------------------------------------------------------------

/**
 * Run one arm over one scenario in one intent order.
 *
 * Returns the arm's decisions and outcomes only. Whether the resulting state is
 * actually valid is not decided here — the caller asks the fixture's own
 * verifier, which nothing in this file can influence.
 */
export function runArm({ arm, repo, family, scenario, intents, evidence, sourceRevision }) {
  if (arm === 'A4_interlock') {
    return runInterlock(repo, family, scenario, intents, { evidence, sourceRevision });
  }
  return runLocked(repo, family, intents, arm);
}
