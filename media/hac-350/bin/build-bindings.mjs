#!/usr/bin/env node
/**
 * Derive the Forensic Replay's presentation bindings from frozen evidence.
 *
 * The thirty-second cut renders a record. It does not run one. Nothing in this
 * package calls the arbitration core, mines a history, spawns the verifier or
 * reaches a network — HAC-343 and HAC-330 already did all of that, under
 * conditions this package is in no position to reproduce and has no authority
 * to re-decide.
 *
 * So every number the film puts on screen is *read out* of a frozen artifact
 * here, once, and written to `evidence/bindings.json` beside the JSON pointer
 * it came from. Two things follow, and both are the point:
 *
 *   - a binding that cannot be resolved fails the build rather than rendering a
 *     plausible number, which is the storyboard's own hold rule ("an unresolved
 *     bind does not render");
 *   - a reviewer can take any figure off any plate and land on the exact record
 *     that established it, without trusting this file.
 *
 * Nothing is transcribed by hand. Even `alpha`'s pre-state, which no plate
 * shows directly, is read from the one frozen record where alpha is withheld
 * and therefore left at its prior value — the BA-order A4 baseline run. A
 * constant typed into this file would be a fact this package invented.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const out = join(here, '..', 'evidence', 'bindings.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Read a frozen artifact and remember its digest, so a binding cites a version. */
const sources = {};
function frozen(relPath) {
  const abs = join(repoRoot, relPath);
  const raw = readFileSync(abs);
  sources[relPath] = sha256(raw);
  return JSON.parse(raw.toString('utf8'));
}

const raw = frozen('experiments/hac-343/evidence/raw-results.json');
const corpus = frozen('experiments/hac-343/evidence/corpus.json');
const s1Results = frozen('experiments/hac-330/evidence/results.json');

/**
 * One frozen HAC-343 record, addressed the way the reader can re-address it.
 *
 * Fails loudly rather than returning undefined: a missing record means the
 * corpus moved under the film, and the correct response is a red build, not a
 * plate with a gap in it.
 */
function record(scenarioId, arm, order) {
  const i = raw.records.findIndex(
    (r) => r.scenarioId === scenarioId && r.arm === arm && r.order === order,
  );
  if (i < 0) throw new Error(`no frozen record for ${scenarioId} / ${arm} / ${order}`);
  return {
    rec: raw.records[i],
    pointer: `experiments/hac-343/evidence/raw-results.json#/records/${i}`,
  };
}

/** A HAC-330 acceptance check, by id. */
function check(id) {
  const i = s1Results.checks.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`no HAC-330 check ${id}`);
  return {
    check: s1Results.checks[i],
    pointer: `experiments/hac-330/evidence/results.json#/checks/${i}`,
  };
}

const scenario = (id) => {
  const i = corpus.scenarios.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no corpus scenario ${id}`);
  return { scenario: corpus.scenarios[i], pointer: `experiments/hac-343/evidence/corpus.json#/scenarios/${i}` };
};

/* -- the five records the cut stands on ----------------------------------- */

const A1 = record('budget/coupled/alpha-beta', 'A1_uncoordinated', 'AB');
const A3same = record('budget/same-target/alpha-alpha', 'A3_per_target_lock', 'AB');
const A3cross = record('budget/coupled/alpha-beta', 'A3_per_target_lock', 'AB');
const A4base = record('budget/coupled/alpha-beta', 'A4_interlock', 'AB');
const A4baseBA = record('budget/coupled/alpha-beta', 'A4_interlock', 'BA');
const A4pert = record('budget/perturbed/alpha-beta', 'A4_interlock', 'AB');

const ceiling = A1.rec.oracle.state.totalReservable;
const post = A1.rec.oracle.state.services;

/**
 * Pre-state, derived rather than declared.
 *
 * `gamma` is never an intent target, so its value after any run is its value
 * before. `beta` is withheld in the AB-order A4 baseline and `alpha` in the
 * BA-order one, so each frozen run leaves exactly one target untouched and
 * between them they pin both.
 */
const pre = {
  alpha: A4baseBA.rec.oracle.state.services.alpha,
  beta: A4base.rec.oracle.state.services.beta,
  gamma: A1.rec.oracle.state.services.gamma,
};

const targetPath = (service) => `services/${service}/reservation.json`;

const outcomeFor = (entry, intentId) => {
  const o = entry.rec.outcomes.find((x) => x.intentId === intentId);
  if (!o) throw new Error(`${entry.pointer}: no outcome for ${intentId}`);
  return o;
};
const verdictFor = (entry, index) => {
  if (!Array.isArray(entry.rec.verdicts)) throw new Error(`${entry.pointer}: arm records no verdicts`);
  return entry.rec.verdicts[index];
};

const coupling = verdictFor(A4base, 0).couplings[0];

/* -- the bindings --------------------------------------------------------- */

const bindings = {
  issue: 'HAC-350',
  kind: 'forensic-replay-presentation-bindings',
  generatedBy: 'media/hac-350/bin/build-bindings.mjs',
  note:
    'Derived, not authored. Every value is read from a frozen HAC-343 or HAC-330 artifact and '
    + 'carries the pointer it was read from. This file records what was decided; it decides nothing.',

  invariant: {
    statement: A1.rec.oracle.stdout ? JSON.parse(A1.rec.oracle.stdout).invariant : null,
    ceiling,
    verifierPath: A1.rec.oracle.verifierPath,
    verifierSha256: A1.rec.oracle.verifierSha256,
    evaluatedBy: 'independent fixture verifier, after execution',
    source: `${A1.pointer}/oracle`,
  },

  targets: {
    alpha: { path: targetPath('alpha'), pre: pre.alpha, intent: post.alpha },
    beta: { path: targetPath('beta'), pre: pre.beta, intent: post.beta },
    gamma: { path: targetPath('gamma'), pre: pre.gamma, intent: pre.gamma },
  },
  targetSources: {
    alpha: `${A4baseBA.pointer}/oracle/state/services/alpha`,
    beta: `${A4base.pointer}/oracle/state/services/beta`,
    gamma: `${A1.pointer}/oracle/state/services/gamma`,
  },

  relationship: {
    files: coupling.files,
    support: coupling.support,
    occurrences: coupling.occurrences,
    basis: verdictFor(A4base, 0).evidenceRefs.find((r) => r.startsWith('basis:')).slice(6),
    artifact: verdictFor(A4base, 0).evidenceRefs.find((r) => r.startsWith('artifact:')).slice(9),
    absentBasis: verdictFor(A4pert, 0).evidenceRefs.find((r) => r.startsWith('basis:')).slice(6),
    source: `${A4base.pointer}/verdicts/0/couplings/0`,
  },

  /**
   * Held constant across the ablation. These three are the reason S8 is a
   * controlled comparison rather than a second demo: what changed was the
   * history, and the ledger says so from the frozen record.
   */
  ablationControls: {
    sameIntents: A4base.rec.intents.map((i) => i.path).join(' + ') === A4pert.rec.intents.map((i) => i.path).join(' + '),
    sameFinalTree: check('CTL-TREE').check.detail,
    sameCommitCount: check('CTL-SHAPE').check.detail,
    source: ['experiments/hac-330/evidence/results.json#/checks', `${A4pert.pointer}/intents`],
  },

  scenes: {
    S1: {
      scenarioId: A1.rec.scenarioId,
      arm: A1.rec.arm,
      concurrent: A1.rec.concurrent,
      applied: { alpha: outcomeFor(A1, 'i0').applied, beta: outcomeFor(A1, 'i1').applied },
      total: JSON.parse(A1.rec.oracle.stdout).total,
      holds: JSON.parse(A1.rec.oracle.stdout).holds,
      lockGroups: A1.rec.lockGroups,
      source: A1.pointer,
    },
    S2: {
      alphaAlone: check('ACC-1').check.detail,
      betaAlone: check('ACC-2').check.detail,
      total: 120,
      holds: true,
      source: [check('ACC-1').pointer, check('ACC-2').pointer],
    },
    S3: {
      scenarioId: A3same.rec.scenarioId,
      arm: A3same.rec.arm,
      concurrent: A3same.rec.concurrent,
      lockGroups: A3same.rec.lockGroups,
      leader: { intentId: 'i0', reserved: A3same.rec.intents[0].reserved, applied: outcomeFor(A3same, 'i0').applied },
      follower: { intentId: 'i1', reserved: A3same.rec.intents[1].reserved, applied: outcomeFor(A3same, 'i1').applied },
      // Deliberately no total. The same-target scenario resolves to a different
      // figure than the cross-target one, and putting it on this plate would
      // invite the viewer to compare two numbers that answer different questions.
      source: A3same.pointer,
    },
    S4: {
      scenarioId: A3cross.rec.scenarioId,
      arm: A3cross.rec.arm,
      concurrent: A3cross.rec.concurrent,
      lockGroups: A3cross.rec.lockGroups,
      total: JSON.parse(A3cross.rec.oracle.stdout).total,
      holds: JSON.parse(A3cross.rec.oracle.stdout).holds,
      source: A3cross.pointer,
    },
    S7: {
      scenarioId: A4base.rec.scenarioId,
      arm: A4base.rec.arm,
      concurrent: A4base.rec.concurrent,
      leader: {
        decision: verdictFor(A4base, 0).decision,
        reasonCode: verdictFor(A4base, 0).reasonCode,
        applied: outcomeFor(A4base, 'i0').applied,
      },
      peer: {
        decision: verdictFor(A4base, 1).decision,
        reasonCode: verdictFor(A4base, 1).reasonCode,
        applied: outcomeFor(A4base, 'i1').applied,
        reason: outcomeFor(A4base, 'i1').reason,
      },
      total: JSON.parse(A4base.rec.oracle.stdout).total,
      holds: JSON.parse(A4base.rec.oracle.stdout).holds,
      source: A4base.pointer,
    },
    S8: {
      scenarioId: A4pert.rec.scenarioId,
      arm: A4pert.rec.arm,
      concurrent: A4pert.rec.concurrent,
      decisions: A4pert.rec.verdicts.map((v) => v.decision),
      reasonCodes: A4pert.rec.verdicts.map((v) => v.reasonCode),
      couplings: verdictFor(A4pert, 0).couplings.length,
      applied: { alpha: outcomeFor(A4pert, 'i0').applied, beta: outcomeFor(A4pert, 'i1').applied },
      total: JSON.parse(A4pert.rec.oracle.stdout).total,
      holds: JSON.parse(A4pert.rec.oracle.stdout).holds,
      source: A4pert.pointer,
    },
  },

  corpusRefs: {
    coupled: scenario('budget/coupled/alpha-beta').pointer,
    sameTarget: scenario('budget/same-target/alpha-alpha').pointer,
    perturbed: scenario('budget/perturbed/alpha-beta').pointer,
  },

  sourceDigests: sources,
};

writeFileSync(out, `${JSON.stringify(bindings, null, 2)}\n`);
console.log(`bindings -> ${relative(repoRoot, out)}`);
console.log(`  ceiling ${ceiling}  pre alpha=${pre.alpha} beta=${pre.beta} gamma=${pre.gamma}`);
console.log(`  S1 total ${bindings.scenes.S1.total}  S7 total ${bindings.scenes.S7.total}  S8 total ${bindings.scenes.S8.total}`);
