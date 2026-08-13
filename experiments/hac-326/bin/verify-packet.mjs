#!/usr/bin/env node
/**
 * Integrity of the committed HAC-326 evidence packet.
 *
 * What a green run here does and does not mean.
 *
 * It DOES prove the packet is internally consistent and still says what the
 * receipt claims: every required artifact is present, every recorded check
 * passed, the enforcement classes HAC-326 requires are each actually
 * represented by a refusal that happened before a side effect, the chaos arms
 * all denied without mutating, and the evidence the run decided from is the
 * committed HAC-330 artifact at the revision it names.
 *
 * It does NOT re-run the experiment, and it cannot: the Cloud Run arm ran
 * against a disposable project that has been deleted. Re-running the local arm
 * is `pnpm run hac326`, which regenerates everything except `cloud-run.json`.
 *
 * Dependency-free, so CI and a laptop reach the same verdict.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const evidenceDir = join(experimentDir, 'evidence');
const repoRoot = join(experimentDir, '..', '..');

const errors = [];
const fail = (message) => errors.push(message);

const read = (name) => {
  const path = join(evidenceDir, name);
  if (!existsSync(path)) {
    fail(`missing required artifact: experiments/hac-326/evidence/${name}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`experiments/hac-326/evidence/${name} is not valid JSON: ${error.message}`);
    return null;
  }
};

const REQUIRED = [
  'results.json',
  'request-envelope.json',
  'identity.json',
  'decision-allow.json',
  'decision-deny.json',
  'target-rejections.json',
  'chaos.json',
  'correlation-trace.json',
  'observation.json',
  'latency.json',
  'cloud-run.json',
  'cloud-run-logs.json',
];

const artifacts = Object.fromEntries(REQUIRED.map((name) => [name, read(name)]));

// --- The recorded verdict ---------------------------------------------------
const results = artifacts['results.json'];
if (results !== null) {
  if (results.result !== 'PASS') fail(`results.json records result ${results.result}`);
  for (const check of results.checks ?? []) {
    if (!check.passed) fail(`results.json check ${check.id} is recorded as failed`);
  }
  if ((results.checks ?? []).length < 20) {
    fail(`results.json records only ${(results.checks ?? []).length} checks; expected the full set`);
  }
}

// --- The evidence really is the pinned HAC-330 artifact ---------------------
//
// Without this, the packet could claim a basis revision it never read.
if (results !== null) {
  const source = results.evidenceSource ?? {};
  const artifactPath = join(repoRoot, source.artifact ?? '');
  if (!existsSync(artifactPath)) {
    fail(`results.json names an evidence artifact that is not committed: ${source.artifact}`);
  } else {
    const evidence = JSON.parse(readFileSync(artifactPath, 'utf8'));
    const basis = evidence.selection?.scoringBasis?.basisRevision;
    if (basis !== source.basisRevision) {
      fail(
        `results.json records basisRevision ${source.basisRevision}, but ${source.artifact} is pinned to ${basis}`,
      );
    }
    if (evidence.producer?.observedSha !== source.producerSha) {
      fail('results.json records a producer revision the evidence artifact does not carry');
    }
  }
}

// --- Every enforcement class is represented, and none had a side effect -----
const REQUIRED_REJECTIONS = [
  'RECEIPT_ABSENT',
  'RECEIPT_MALFORMED',
  'RECEIPT_SIGNATURE_INVALID',
  'RECEIPT_EXPIRED',
  'RECEIPT_STALE_REVISION',
  'RECEIPT_WRONG_TARGET',
  'RECEIPT_WRONG_OPERATION',
  'RECEIPT_INTENT_MISMATCH',
];

const rejections = artifacts['target-rejections.json'];
if (rejections !== null) {
  const observed = new Set((rejections.rejections ?? []).map((r) => r.reasonCode));
  for (const required of REQUIRED_REJECTIONS) {
    if (!observed.has(required)) fail(`no recorded target rejection with reason ${required}`);
  }

  for (const rejection of rejections.rejections ?? []) {
    if (rejection.status !== 403) {
      fail(`target rejection ${rejection.id} recorded HTTP ${rejection.status}, expected 403`);
    }
    if (rejection.stateUnchanged !== true || rejection.revisionUnchanged !== true) {
      // The whole point of the attack set: refusal *before* the side effect.
      fail(`target rejection ${rejection.id} does not record an unchanged state and revision`);
    }
  }

  // Replay is proven separately, because a hash-chained revision makes a
  // replayed receipt stale as well. The packet must carry that isolation.
  const ledger = rejections.nonceLedgerIsolated;
  if (ledger?.firstAdmission?.admitted !== true) {
    fail('the isolated nonce-ledger proof does not record a first admission');
  }
  if (ledger?.secondAdmission?.reasonCode !== 'RECEIPT_REPLAYED') {
    fail('the isolated nonce-ledger proof does not record a RECEIPT_REPLAYED refusal');
  }
}

// --- Failure never became permission ---------------------------------------
const chaos = artifacts['chaos.json'];
if (chaos !== null) {
  const arms = chaos.arms ?? [];
  const REQUIRED_ARMS = ['A', 'B', 'C', 'C2', 'D', 'D2', 'E'];
  for (const arm of REQUIRED_ARMS) {
    if (!arms.some((recorded) => recorded.arm === arm)) fail(`chaos arm ${arm} is missing`);
  }
  for (const arm of arms) {
    if (arm.decision === 'ALLOW') fail(`chaos arm ${arm.arm} recorded an ALLOW`);
    if (arm.receiptIssued === true) fail(`chaos arm ${arm.arm} recorded an issued receipt`);
    if (arm.stateUnchanged !== true) fail(`chaos arm ${arm.arm} does not record an unchanged state`);
  }
}

// --- Correlation survived the whole path ------------------------------------
const correlation = artifacts['correlation-trace.json'];
if (correlation !== null) {
  const trace = correlation.trace ?? {};
  const ids = new Set(
    [trace.caller, trace.proxyRequest, trace.proxyResponse, trace.targetExecution].filter(Boolean),
  );
  if (ids.size !== 1) fail(`correlation trace records ${ids.size} distinct identifiers, expected 1`);
}

// --- Acknowledgement is still not observation -------------------------------
const observation = artifacts['observation.json'];
if (observation !== null) {
  if (observation.selfAssertionOfObservedRefused !== true) {
    fail('observation.json does not record that a participant was refused when asserting OBSERVED');
  }
  if (observation.independentObservation?.recordedBy === 'target') {
    fail('observation.json records the target observing its own write');
  }
  if ((observation.acknowledgementTrace ?? []).some((event) => event.state === 'OBSERVED')) {
    fail('observation.json records an OBSERVED event inside an acknowledgement trace');
  }
}

// --- Latency is a distribution, not one number ------------------------------
const latency = artifacts['latency.json'];
if (latency !== null) {
  for (const [name, summary] of Object.entries(latency).filter(([, v]) => v?.count !== undefined)) {
    if (summary.count < 20) fail(`latency.${name} records only ${summary.count} samples`);
    if (summary.p95Ms === undefined || summary.maxMs === undefined) {
      fail(`latency.${name} does not record p95 and max`);
    }
  }
  if ((latency.authorizedPath?.count ?? 0) < 100) {
    fail('latency.authorizedPath records fewer than 100 samples');
  }
}

// --- The deployed arm -------------------------------------------------------
const cloud = artifacts['cloud-run.json'];
if (cloud !== null) {
  if (cloud.result !== 'PASS') fail(`cloud-run.json records result ${cloud.result}`);
  for (const check of cloud.checks ?? []) {
    if (!check.passed) fail(`cloud-run.json check ${check.id} is recorded as failed`);
  }
  if (cloud.directCallToTarget?.reasonCode !== 'RECEIPT_ABSENT') {
    fail('cloud-run.json does not record the deployed target refusing a direct call');
  }
  const identities = cloud.callerIdentityObserved?.distinctIdentitiesObserved ?? [];
  if (identities.length === 0) fail('cloud-run.json records no observed caller identity');
  for (const identity of identities) {
    if (/@[^.]+\.[a-z]+$/i.test(identity.identityShape ?? '') && !identity.identityShape.startsWith('<')) {
      fail(`cloud-run.json records an unredacted identity: ${identity.identityShape}`);
    }
  }
}

// --- No credential-shaped strings anywhere in the packet --------------------
//
// The packet records environment variable NAMES and identity SHAPES. A private
// key or a token in here would be a real leak, not a tunable false positive.
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\bya29\.[A-Za-z0-9._-]{20,}/, 'Google OAuth access token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
];

for (const name of REQUIRED) {
  const path = join(evidenceDir, name);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) fail(`experiments/hac-326/evidence/${name} contains a ${label}`);
  }
}

if (errors.length > 0) {
  process.stderr.write('HAC-326 evidence packet does not verify:\n');
  for (const error of errors) process.stderr.write(`  - ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `HAC-326 evidence packet verifies: ${REQUIRED.length} artifacts, ` +
      `${(results?.checks ?? []).length} local checks, ${(cloud?.checks ?? []).length} deployed checks\n`,
  );
}
