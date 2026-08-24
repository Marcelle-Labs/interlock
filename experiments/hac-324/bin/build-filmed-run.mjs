#!/usr/bin/env node
/**
 * HAC-324 — derive the filmed-run record from the packet the traversal emitted.
 *
 * The traversal's own packet carries one field that is not true of the run it
 * describes. `10-provision.sh` records `observerPrincipal` from
 * `gcloud config get-value account` at *provision* time, so it names the human
 * operator. The authoritative traversal did not authenticate as that human: it
 * impersonated a dedicated keyless observer service account, because gcloud 580
 * refuses audience-scoped identity tokens for user accounts.
 *
 * Two ways to fix that were available and both were wrong. Editing the emitted
 * packet in place destroys the only verbatim record of what the run produced.
 * Leaving it and explaining the discrepancy in prose elsewhere leaves two
 * artifacts disagreeing about who performed OBSERVED, and the wrong one is the
 * one that looks authoritative.
 *
 * So the emitted bytes stay untouched in `filmed-run.raw.json`, and this derives
 * `filmed-run.json` from them, splitting one overloaded field into the two
 * distinct facts it was conflating:
 *
 *   operatorPrincipal  — who provisioned the environment
 *   observerPrincipal  — who performed the independently authenticated read-back
 *
 * The producing layer for HAC-324's evidence is this script. The HAC-340 script
 * that emitted the raw packet is the approved runtime source at
 * `ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a` and is deliberately not modified —
 * changing it would change the runtime source SHA and break the parity claim
 * the run exists to make.
 *
 *     node experiments/hac-324/bin/build-filmed-run.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const evidence = join(here, '..', 'evidence');

/**
 * The observer identity the traversal actually used.
 *
 * Recorded here rather than inferred: the Cloud Run services are deleted, so
 * nothing can be re-queried to establish it, and a value that cannot be
 * re-derived should be stated explicitly rather than reconstructed.
 */
const OBSERVER_PRINCIPAL =
  'serviceAccount:interlock-hac340-observer@interlock-film-260823.iam.gserviceaccount.com';

/** The one field this derivation is allowed to change, and what it becomes. */
export const PRINCIPAL_CORRECTION = {
  field: 'resources.observerPrincipal',
  rawValue: 'user:qwynn@marcellelabs.io',
  reclassifiedAs: 'resources.operatorPrincipal',
  correctedValue: OBSERVER_PRINCIPAL,
  reason:
    '10-provision.sh records the provisioning caller, not the principal that performed the read-back. '
    + 'The traversal impersonated a dedicated keyless observer service account because gcloud 580 refuses '
    + 'audience-scoped identity tokens for user accounts. Adjudicated NON_MATERIAL: the substitution changed '
    + 'no authorization behaviour, and the fail-closed controls returned an identical 403/401/403.',
  classification: 'NON_MATERIAL',
};

/**
 * Everything about the run that this derivation must leave alone.
 *
 * Named rather than implied, so the verifier can prove the derivation touched
 * no execution fact instead of asserting it.
 */
export const EXECUTION_FACTS = [
  'commitSha',
  'model',
  'adkPath',
  'correlationId',
  'decision',
  'receiptId',
  'receiptDigest',
  'protectedMutation',
  'observation',
  'runtimeProof',
  'controls',
  'expectedConfiguration',
  'observedConfiguration',
];

export function deriveFilmedRun(raw) {
  const derived = structuredClone(raw);
  const resources = derived.resources;

  // Split the conflated field. The provisioning caller keeps its own name so
  // the fact is preserved rather than overwritten.
  resources.operatorPrincipal = raw.resources.observerPrincipal;
  resources.observerPrincipal = OBSERVER_PRINCIPAL;

  derived.principalProjection = {
    note:
      'observerPrincipal in the emitted packet named the provisioning caller. It is corrected here and the '
      + 'original value is preserved as operatorPrincipal. filmed-run.raw.json holds the emitted bytes unchanged.',
    correction: PRINCIPAL_CORRECTION,
    rawPacket: 'experiments/hac-324/evidence/filmed-run.raw.json',
    producer: 'experiments/hac-324/bin/build-filmed-run.mjs',
  };

  return derived;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const raw = JSON.parse(readFileSync(join(evidence, 'filmed-run.raw.json'), 'utf8'));
  const derived = deriveFilmedRun(raw);
  writeFileSync(join(evidence, 'filmed-run.json'), `${JSON.stringify(derived, null, 2)}\n`);
  process.stdout.write(
    'HAC-324 filmed-run record derived\n'
    + `  operatorPrincipal ${derived.resources.operatorPrincipal}\n`
    + `  observerPrincipal ${derived.resources.observerPrincipal}\n`
    + `  execution facts carried unchanged: ${EXECUTION_FACTS.length}\n`,
  );
}
