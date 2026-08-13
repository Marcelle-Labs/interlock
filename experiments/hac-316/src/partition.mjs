/**
 * The canonical fixture, projected across two targets.
 *
 * ## Why this exists
 *
 * Preflight V1 presumed one protected target holding all three services, with a
 * second "unsafe" target as the baseline arm. That cannot demonstrate anything:
 * an unchanged `ProtectedTarget` holding all three services refuses the second
 * mutation locally — `INVARIANT_BREACH`, `dist/target/state.js` — before the
 * composition can occur. The invalid joint state is unreachable, so the arm that
 * is supposed to reach it never does.
 *
 * The projection fixes that without touching production. Each partition is an
 * **unchanged** `ProtectedTarget` that holds exactly one service and keeps the
 * *whole* pool as its own `totalReservable`. Both mutations are then genuinely
 * valid locally (60 within the pool, on either side), and neither target can
 * see the other's — which is the real-world condition the experiment is about.
 *
 * Three properties make this legal rather than convenient:
 *
 *   - `ProtectedTargetOptions.initialState` is already optional, and zero of the
 *     eight `new ProtectedTarget(` call sites in the repository pass it, so
 *     injecting a partitioned state regresses nothing.
 *   - `genesisRevision` folds the `targetId`, so two partitions cannot share a
 *     revision even if their states were identical.
 *   - `applyMutation` refuses an unknown service. The alpha target does not
 *     merely decline beta by convention; it cannot represent it.
 *
 * The local invariants stay switched on throughout. They are defense in depth,
 * not the oracle — the oracle is `global-verifier.mjs`, which is the only thing
 * that ever sees the joint state (X-19).
 *
 * ## No capacity trick
 *
 * Neither partition is capped below the pool. Halving the pool would make each
 * mutation locally invalid and would be measuring a completely different claim
 * (X-13). The residual service is never given a target of its own (X-14); it is
 * an immutable constant the global verifier folds back in.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InMemoryReplayLedger } from '../../../dist/broker/idempotency/ledger.js';
import { genesisRevision } from '../../../dist/broker/revision/revision.js';
import { ProtectedTarget } from '../../../dist/target/service.js';
import { INITIAL_STATE, asCanonical, reservationPath } from '../../../dist/target/state.js';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The committed projection declaration, recorded before any arm ran. */
export const FIXTURE = JSON.parse(
  readFileSync(join(experimentDir, 'evidence', 'fixture.json'), 'utf8'),
);

/** Services the two intents write, and which therefore become targets. */
export const PARTITIONED_SERVICES = Object.freeze([...FIXTURE.partitionedServices]);

/**
 * Services no intent writes.
 *
 * They stay in the accounting and out of the topology. This is the value that
 * makes the composition breach: without it the two partitions sum to exactly the
 * pool, and the hazard would disappear into a rounding argument.
 */
export const RESIDUAL_SERVICES = Object.freeze([...FIXTURE.residualServices]);

/** One `targetId` per partition. Distinct, so receipts cannot cross. */
export const TARGET_IDS = Object.freeze({ ...FIXTURE.targetIds });

/**
 * The state one partition starts from, derived from the canonical fixture.
 *
 * Derived rather than read back out of `fixture.json`, on purpose: the recorded
 * projection and the deployed projection are then two independent computations
 * of the same thing, and `partition.test.mjs` asserts they agree. Reading the
 * evidence file here would make that check compare a value to itself.
 */
export function partitionState(service, initialState = INITIAL_STATE) {
  if (!Object.hasOwn(initialState.services, service)) {
    throw new Error(`${service} is not a service of the canonical fixture`);
  }
  return {
    totalReservable: initialState.totalReservable,
    services: { [service]: initialState.services[service] },
  };
}

/** Evidence-namespace paths one partition's intent writes. */
export function partitionTargets(service) {
  return [reservationPath(service)];
}

/** Genesis revision of one partition, as the deployed target will compute it. */
export function partitionGenesisRevision(service) {
  return genesisRevision(TARGET_IDS[service], asCanonical(partitionState(service)));
}

/**
 * Build one unchanged `ProtectedTarget` per partition.
 *
 * Each gets its own replay ledger. A shared ledger would let a nonce spent at
 * alpha refuse a distinct receipt at beta, which would be an artefact of the
 * harness rather than a property of the system.
 */
export function createPartitionedTargets({ keys, services = PARTITIONED_SERVICES }) {
  const targets = {};
  for (const service of services) {
    targets[service] = new ProtectedTarget({
      targetId: TARGET_IDS[service],
      keys,
      ledger: new InMemoryReplayLedger(),
      initialState: partitionState(service),
    });
  }
  return targets;
}
