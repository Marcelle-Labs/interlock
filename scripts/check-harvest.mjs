#!/usr/bin/env node
/**
 * Enforces the HAC-321 harvest ledger.
 *
 * HAC-321 requires that every capability built during the sprint receives
 * exactly one disposition, and that every HARVEST names a durable owner issue.
 * Prose can assert that; only a gate can establish it.
 *
 * The load-bearing check here is COVERAGE. Validating the rows that exist
 * proves nothing about the capability that was never written down — and a
 * ledger whose failure mode is "someone forgot" is a document, not a control.
 * So every path under a declared coverage root must be claimed by exactly one
 * row, which means adding a capability without a ledger row turns this red.
 *
 * Dependency-free and deterministic, matching check-provenance.mjs, so CI and a
 * developer laptop reach the same verdict. Runs inside the required
 * `Provenance boundary` context rather than as a new status check, so it blocks
 * without needing a branch-protection change.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = join(repoRoot, 'provenance', 'harvest-inventory.json');
const ledgerPath = join(repoRoot, 'docs', 'quality', 'harvest-ledger.md');

const errors = [];
const fail = (msg) => errors.push(msg);

const ID = /^[a-z0-9-]+$/;
/** Linear identifiers (META-330) and the Fibery open-question form (OQ-17). */
const OWNER = /^(?:[A-Z]{2,5}-\d+|Fibery OQ-\d+)$/;

/** Dispositions that oblige a durable owner issue. HAC-321 vocabulary. */
const HARVEST_PREFIX = 'HARVEST_';

/**
 * Paths a coverage root should not count as capabilities. Deliberately tiny:
 * every entry here is a hole in the gate, so each one must be a file that
 * cannot carry behaviour rather than a file nobody wanted to classify.
 */
const COVERAGE_IGNORE = new Set(['.DS_Store', '.gitkeep', 'README.md']);

function readJson(path, label) {
  if (!existsSync(path)) {
    fail(`${label}: file not found at ${relative(repoRoot, path)}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${label}: not valid JSON — ${err.message}`);
    return null;
  }
}

const inventory = readJson(inventoryPath, 'harvest inventory');
if (!inventory) {
  console.error('FAIL harvest ledger\n  ' + errors.join('\n  '));
  process.exit(1);
}

const legal = new Set(inventory.dispositions ?? []);
if (legal.size === 0) fail('inventory: "dispositions" must list the legal disposition vocabulary');

const capabilities = Array.isArray(inventory.capabilities) ? inventory.capabilities : [];
const findings = Array.isArray(inventory.findings) ? inventory.findings : [];
if (capabilities.length === 0) fail('inventory: "capabilities" is empty');

// ── Row validity ────────────────────────────────────────────────────────────

const seenIds = new Set();
const claimedBy = new Map(); // repo-relative path -> capability id

for (const row of [...capabilities, ...findings]) {
  const where = `capability "${row.id ?? '(no id)'}"`;

  if (typeof row.id !== 'string' || !ID.test(row.id)) {
    fail(`${where}: id must be lowercase-kebab-case`);
  } else if (seenIds.has(row.id)) {
    fail(`${where}: duplicate id — every capability appears exactly once`);
  } else {
    seenIds.add(row.id);
  }

  if (typeof row.rationale !== 'string' || row.rationale.length < 20) {
    fail(`${where}: needs a rationale saying why this disposition and not another`);
  }

  if (!legal.has(row.disposition)) {
    fail(
      `${where}: disposition "${row.disposition}" is not one of the declared values ` +
        `(${[...legal].join(', ')}). A disposition outside the vocabulary is not a decision.`,
    );
    continue;
  }

  if (row.disposition.startsWith(HARVEST_PREFIX)) {
    if (typeof row.ownerIssue !== 'string' || !OWNER.test(row.ownerIssue)) {
      fail(
        `${where}: ${row.disposition} requires "ownerIssue" naming a durable owner. ` +
          `HAC-321 requires filing or amending the owner issue, not naming one in a table.`,
      );
    }
  } else if (row.ownerIssue) {
    fail(`${where}: ${row.disposition} must not carry an ownerIssue — nothing is being handed over`);
  }
}

// ── Path claims ─────────────────────────────────────────────────────────────

for (const row of capabilities) {
  const where = `capability "${row.id}"`;
  const paths = Array.isArray(row.paths) ? row.paths : [];
  if (paths.length === 0) {
    fail(`${where}: a capability must claim at least one path, or it belongs in "findings"`);
    continue;
  }
  for (const p of paths) {
    if (!existsSync(join(repoRoot, p))) {
      fail(`${where}: claims "${p}", which does not exist. A ledger row pointing at nothing is not evidence.`);
      continue;
    }
    if (claimedBy.has(p)) {
      fail(`${where}: "${p}" is already claimed by "${claimedBy.get(p)}" — exactly one disposition per capability`);
      continue;
    }
    claimedBy.set(p, row.id);
  }
}

for (const row of findings) {
  if (Array.isArray(row.paths) && row.paths.length > 0) {
    fail(`finding "${row.id}": findings carry no paths — a finding that owns code is a capability`);
  }
  if (typeof row.source !== 'string' || row.source.length === 0) {
    fail(`finding "${row.id}": needs a "source" naming the issue that produced it`);
  }
}

// ── Coverage: the check that makes omission fail ────────────────────────────

/** Every path under a root, honouring `children` (top level) vs `recursive`. */
function enumerate(root) {
  const abs = join(repoRoot, root.path);
  if (!existsSync(abs)) {
    fail(`coverage root "${root.path}" does not exist`);
    return [];
  }
  const out = [];
  if (root.mode === 'children') {
    for (const name of readdirSync(abs)) {
      if (COVERAGE_IGNORE.has(name)) continue;
      out.push(`${root.path}/${name}`);
    }
    return out;
  }
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (COVERAGE_IGNORE.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(repoRoot, full).split(sep).join('/'));
    }
  };
  walk(abs);
  return out;
}

/** A path is covered if it is claimed, or lives under a claimed directory. */
function isCovered(path) {
  if (claimedBy.has(path)) return true;
  for (const claimed of claimedBy.keys()) {
    if (path.startsWith(`${claimed}/`)) return true;
  }
  return false;
}

const roots = Array.isArray(inventory.coverageRoots) ? inventory.coverageRoots : [];
if (roots.length === 0) fail('inventory: "coverageRoots" is empty — without roots, coverage proves nothing');

const uncovered = [];
for (const root of roots) {
  for (const path of enumerate(root)) {
    if (!isCovered(path)) uncovered.push(path);
  }
}

if (uncovered.length > 0) {
  fail(
    `${uncovered.length} capability path(s) have no ledger row:\n` +
      uncovered.map((p) => `      ${p}`).join('\n') +
      `\n    Every path under a coverage root needs exactly one disposition in ` +
      `provenance/harvest-inventory.json. If it is genuinely not a capability, ` +
      `say so in a row rather than leaving it unclaimed — an unexplained absence ` +
      `is what this check exists to catch.`,
  );
}

// ── The ledger's own summary must match the inventory ───────────────────────

const counts = new Map([...legal].map((d) => [d, 0]));
for (const row of [...capabilities, ...findings]) {
  if (counts.has(row.disposition)) counts.set(row.disposition, counts.get(row.disposition) + 1);
}

if (existsSync(ledgerPath)) {
  const ledger = readFileSync(ledgerPath, 'utf8');
  const total = capabilities.length + findings.length;
  const claimed = ledger.match(/<!--\s*counts:\s*(\{[^]*?\})\s*-->/);
  if (!claimed) {
    fail(
      'ledger: no machine-readable counts block found. The markdown summary must carry ' +
        '<!-- counts: {...} --> so its numbers cannot drift from the inventory.',
    );
  } else {
    let declared;
    try {
      declared = JSON.parse(claimed[1]);
    } catch (err) {
      fail(`ledger: counts block is not valid JSON — ${err.message}`);
    }
    if (declared) {
      if (declared.total !== total) {
        fail(`ledger: declares total ${declared.total}, inventory has ${total}`);
      }
      for (const [disposition, n] of counts) {
        if ((declared[disposition] ?? 0) !== n) {
          fail(`ledger: declares ${declared[disposition] ?? 0} × ${disposition}, inventory has ${n}`);
        }
      }
    }
  }
} else {
  fail(`ledger: ${relative(repoRoot, ledgerPath)} not found`);
}

// ── Verdict ─────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`FAIL harvest ledger\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const summary = [...counts].filter(([, n]) => n > 0).map(([d, n]) => `${n} ${d}`);
console.log(
  `PASS harvest ledger: ${capabilities.length} capabilit(ies) + ${findings.length} finding(s), ` +
    `every path under ${roots.length} coverage root(s) claimed exactly once.\n` +
    `  ${summary.join(', ')}`,
);
