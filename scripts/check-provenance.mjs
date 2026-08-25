#!/usr/bin/env node
/**
 * Enforces the Interlock provenance boundary.
 *
 * `provenance/manifest.schema.json` states the shape; this script is what
 * enforces it, plus the invariants HAC-328 fixed that a schema cannot express:
 * which sibling repository is writable, that upstream source is consumed rather
 * than copied, and that submission-local machinery never claims specification
 * authority it does not have.
 *
 * Dependency-free and deterministic by construction, so CI and a developer
 * laptop reach the same verdict.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'provenance', 'manifest.json');
const disclosurePath = join(repoRoot, 'DISCLOSURE.md');

const errors = [];
const fail = (msg) => errors.push(msg);

/** Disposition each pinned sibling must hold for the current phase (HAC-328). */
const REQUIRED_DISPOSITION = {
  'workspacejson/standard': 'READ_ONLY_PINNED',
  'workspacejson/cli': 'EXECUTE_READ_ONLY',
  'workspacejson/integrations': 'READ_INSPECT',
  'Marcelle-Labs/ai-swarm': 'EXECUTE_READ_ONLY',
};

const SHA40 = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9-]+$/;
const REPO = /^[^/]+\/[^/]+$/;

const DISPOSITIONS = new Set([
  'WRITABLE',
  'READ_ONLY_PINNED',
  'READ_INSPECT',
  'EXECUTE_READ_ONLY',
]);
const HARVEST = new Set([
  'NOT_APPLICABLE',
  'HARVEST_OR_DELETE_AFTER_SUBMISSION',
  'DELETE_AFTER_SUBMISSION',
]);

/** What bootstrap recorded before the evidence to choose existed (HAC-328). */
const INITIAL_HARVEST = new Set(['HARVEST_OR_DELETE_AFTER_SUBMISSION', 'DELETE_AFTER_SUBMISSION']);

/** Whether HAC-321 could reach a disposition at all. */
const HARVEST_SCOPE = new Set(['RESOLVED', 'OUT_OF_SCOPE_NOT_BUILT']);

/**
 * HAC-321's disposition vocabulary. Kept identical to `dispositions` in
 * provenance/harvest-inventory.json; check-harvest.mjs enforces that file, this
 * one enforces the manifest, and both must name the same six values or the two
 * records can drift into disagreeing about what a disposition is.
 */
const LEDGER_DISPOSITIONS = new Set([
  'HARVEST_INTEGRATIONS',
  'HARVEST_STANDARD_RESEARCH',
  'HARVEST_STUDIO',
  'HARVEST_SWARM',
  'KEEP_INTERLOCK',
  'DELETE_HACKATHON_ONLY',
]);

const LINEAR_ID = /^[A-Z]{2,5}-\d+$/;

/**
 * Values that look like credentials. The manifest records environment variable
 * NAMES and never their values, so any hit here is a real leak, not a false
 * positive waiting to be tuned.
 */
const SECRET_PATTERNS = [
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9]{16,}/, 'API secret key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\blin_api_[A-Za-z0-9]{16,}/, 'Linear API key'],
];

function requireString(obj, field, where, { min = 1, pattern = null } = {}) {
  const value = obj[field];
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${where}: missing required string "${field}"`);
    return null;
  }
  if (value.length < min) {
    fail(`${where}: "${field}" must be at least ${min} characters (got ${value.length})`);
  }
  if (pattern && !pattern.test(value)) {
    fail(`${where}: "${field}" does not match ${pattern} (got "${value}")`);
  }
  return value;
}

function requireEnum(obj, field, allowed, where) {
  const value = obj[field];
  if (!allowed.has(value)) {
    fail(`${where}: "${field}" must be one of ${[...allowed].join(', ')} (got "${value}")`);
    return null;
  }
  return value;
}

function scanForSecrets(text, where) {
  for (const [pattern, label] of SECRET_PATTERNS) {
    const hit = text.match(pattern);
    if (hit) fail(`${where}: possible ${label} committed ("${hit[0].slice(0, 12)}…"). Record names, never values.`);
  }
}

// ---------------------------------------------------------------- load

if (!existsSync(manifestPath)) {
  console.error('FAIL provenance/manifest.json is missing. It must exist before substantive implementation begins (HAC-328).');
  process.exit(1);
}
if (!existsSync(disclosurePath)) {
  console.error('FAIL DISCLOSURE.md is missing. It must exist before substantive implementation begins (HAC-328).');
  process.exit(1);
}

const rawManifest = readFileSync(manifestPath, 'utf8');
const disclosure = readFileSync(disclosurePath, 'utf8');

scanForSecrets(rawManifest, 'provenance/manifest.json');
scanForSecrets(disclosure, 'DISCLOSURE.md');

let manifest;
try {
  manifest = JSON.parse(rawManifest);
} catch (error) {
  console.error(`FAIL provenance/manifest.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

// ------------------------------------------------------------- top level

requireString(manifest, 'manifestVersion', 'manifest', { pattern: /^\d+\.\d+\.\d+$/ });
requireString(manifest, 'contestPeriodStart', 'manifest', { pattern: /^\d{4}-\d{2}-\d{2}$/ });
requireString(manifest, 'bootstrapIssue', 'manifest');

if (manifest.product !== 'Interlock') {
  fail(`manifest: "product" must be exactly "Interlock" (got "${manifest.product}"). Interlok/Interloc are not canonical spellings.`);
}
if (manifest.submissionRepository !== 'Marcelle-Labs/interlock') {
  fail(`manifest: "submissionRepository" must be "Marcelle-Labs/interlock" (got "${manifest.submissionRepository}")`);
}

for (const key of ['dependencies', 'submissionLocalMachinery', 'newlyCreatedForContest']) {
  if (!Array.isArray(manifest[key])) fail(`manifest: "${key}" must be an array`);
}
if (Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0) {
  fail('manifest: "dependencies" must record at least one entry');
}

// ----------------------------------------------------------- dependencies

const seenIds = new Set();
const seenRepos = new Set();

for (const dep of manifest.dependencies ?? []) {
  const where = `dependency "${dep.id ?? '<unnamed>'}"`;

  const id = requireString(dep, 'id', where, { pattern: ID });
  if (id) {
    if (seenIds.has(id)) fail(`${where}: duplicate id`);
    seenIds.add(id);
  }

  const repository = requireString(dep, 'repository', where, { pattern: REPO });
  if (repository) {
    if (seenRepos.has(repository)) fail(`${where}: duplicate repository "${repository}"`);
    seenRepos.add(repository);
  }

  requireString(dep, 'remote', where, { pattern: /^https:\/\// });
  requireString(dep, 'owningOrganization', where);
  requireString(dep, 'pinnedSha', where, { pattern: SHA40 });
  requireString(dep, 'purpose', where, { min: 20 });
  requireString(dep, 'devpostDisclosure', where, { min: 40 });
  requireEnum(dep, 'origin', new Set(['PRE_EXISTING', 'CREATED_DURING_CONTEST']), where);
  requireEnum(dep, 'disposition', DISPOSITIONS, where);
  requireEnum(dep, 'harvestDisposition', HARVEST, where);

  const consumption = requireEnum(dep, 'consumption', new Set(['CONSUMED', 'COPIED']), where);

  // The invariant HAC-328 cares about most: nothing upstream is vendored in.
  if (consumption === 'COPIED') {
    fail(
      `${where}: consumption is COPIED. HAC-328 forbids absorbing WorkspaceJSON source, ` +
      `private swarm machinery, or reusable Studio implementation into the submission. ` +
      `Consume it at a pinned revision instead, or get an explicit disclosure decision recorded first.`,
    );
  }

  // The submission repository is writable; every pinned sibling is not.
  const required = REQUIRED_DISPOSITION[repository];
  if (required && dep.disposition !== required) {
    fail(
      `${where}: disposition must be ${required} for ${repository} in the current phase (got ${dep.disposition}). ` +
      `Escalating it needs the authorizing Linear issue and an updated permissions matrix, not a manifest edit.`,
    );
  }
  if (dep.disposition === 'WRITABLE') {
    fail(`${where}: a consumed dependency may not be WRITABLE. Only Marcelle-Labs/interlock is writable for this phase.`);
  }
}

for (const repository of Object.keys(REQUIRED_DISPOSITION)) {
  if (!seenRepos.has(repository)) {
    fail(`manifest: "${repository}" is checked out in the workspace but has no provenance entry`);
  }
}

// ------------------------------------------------- submission-local machinery

for (const item of manifest.submissionLocalMachinery ?? []) {
  const where = `submissionLocalMachinery "${item.id ?? '<unnamed>'}"`;
  requireString(item, 'id', where, { pattern: ID });
  requireString(item, 'purpose', where, { min: 20 });
  requireString(item, 'disclosureLanguage', where, { min: 40 });
  const status = requireEnum(item, 'status', new Set(['PLANNED', 'IN_PROGRESS', 'BUILT', 'REMOVED']), where);

  // Bootstrap recorded a deferral; HAC-321 spends it. Both values are kept and
  // both are validated. Overwriting the deferral would erase the fact that this
  // was carried undecided from bootstrap until now; leaving the resolution
  // unvalidated would let an arbitrary string ride under a green gate, which is
  // how a disposition outside HAC-321's vocabulary got in during review.
  requireEnum(item, 'initialHarvestDisposition', INITIAL_HARVEST, where);
  const scope = requireEnum(item, 'harvestScopeStatus', HARVEST_SCOPE, where);
  requireString(item, 'harvestLedger', where);

  if (scope === 'RESOLVED') {
    const resolved = requireEnum(item, 'resolvedHarvestDisposition', LEDGER_DISPOSITIONS, where);
    if (resolved?.startsWith('HARVEST_') && !LINEAR_ID.test(item.harvestOwnerIssue ?? '')) {
      fail(
        `${where}: resolved to ${resolved} but names no "harvestOwnerIssue". ` +
        `HAC-321 requires a durable owner issue that was filed or amended, not a disposition alone.`,
      );
    }
  } else {
    // OUT_OF_SCOPE_NOT_BUILT: a capability that does not exist cannot hold a
    // disposition, and recording one would assert work that did not happen.
    if (item.resolvedHarvestDisposition !== undefined) {
      fail(
        `${where}: harvestScopeStatus is ${scope}, so it must not carry a resolvedHarvestDisposition. ` +
        `Nothing was built; there is nothing to dispose of.`,
      );
    }
    if (status !== 'PLANNED') {
      fail(`${where}: harvestScopeStatus ${scope} is only valid while status is PLANNED (got "${status}")`);
    }
  }

  if (item.notPartOfReleasedStandard !== true) {
    fail(
      `${where}: "notPartOfReleasedStandard" must be true. Submission-local machinery carries no ` +
      `specification authority and must never read as part of released WorkspaceJSON v0.4.`,
    );
  }
}

// ------------------------------------------------------------ new work

for (const work of manifest.newlyCreatedForContest ?? []) {
  const where = `newlyCreatedForContest "${work.id ?? '<unnamed>'}"`;
  requireString(work, 'id', where, { pattern: ID });
  requireString(work, 'repository', where, { pattern: REPO });
  requireString(work, 'remote', where, { pattern: /^https:\/\// });
  requireString(work, 'initialSha', where, { pattern: SHA40 });
  requireString(work, 'purpose', where, { min: 20 });

  if (work.origin !== 'CREATED_DURING_CONTEST') {
    fail(`${where}: "origin" must be CREATED_DURING_CONTEST (got "${work.origin}")`);
  }
  if (work.disposition !== 'WRITABLE') {
    fail(`${where}: "disposition" must be WRITABLE (got "${work.disposition}")`);
  }
}

// ------------------------------------------- disclosure covers every entry

for (const dep of manifest.dependencies ?? []) {
  if (dep.repository && !disclosure.includes(dep.repository)) {
    fail(`DISCLOSURE.md: does not mention "${dep.repository}", which the manifest records as a dependency`);
  }
}
for (const item of manifest.submissionLocalMachinery ?? []) {
  if (item.id && !disclosure.includes(item.id)) {
    fail(`DISCLOSURE.md: does not mention submission-local machinery "${item.id}"`);
  }
}

// ---------------------------------------------------------------- verdict

const counted =
  (manifest.dependencies?.length ?? 0) +
  (manifest.submissionLocalMachinery?.length ?? 0) +
  (manifest.newlyCreatedForContest?.length ?? 0);

if (errors.length > 0) {
  console.error(`FAIL provenance boundary: ${errors.length} problem(s)\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nSee DISCLOSURE.md and docs/development/workspace.md for the authoritative boundary.');
  process.exit(1);
}

console.log(`PASS provenance boundary: ${counted} entr(ies) checked, disclosure covers all of them.`);
