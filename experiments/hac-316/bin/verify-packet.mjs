#!/usr/bin/env node
/**
 * The HAC-316 packet verifier.
 *
 * ## It re-derives; it does not re-read
 *
 * A verifier that compares recorded fields to recorded fields is circular. It
 * can tell you the packet is internally consistent, which is a claim about
 * JSON, and it cannot falsify anything — a run that recorded the wrong answer
 * consistently sails through. `experiments/hac-330/bin/verify-packet.mjs` set
 * the precedent by importing the real decision function and re-deriving both
 * arms. This does the same: it imports the frozen `arbitrate` and re-runs it
 * over the arbitration inputs the proxies were actually handed, captured
 * verbatim during the run, then compares the result to what was recorded.
 *
 * The composition self-check goes further and re-executes the four composition
 * facts through the real receipt, target and verifier path rather than
 * asserting arithmetic.
 *
 * ## It can be broken on purpose
 *
 * `HAC316_FAULT_INJECT` installs a deliberately broken verifier:
 *
 *   invert-composition        the composition verdict is negated
 *   stub-reread               the re-read is replaced by a canned answer
 *   tamper-recorded-decision  a recorded decision is edited before re-derivation
 *   vacuous-requirement       every requirement body is emptied out
 *
 * The fourth is a different kind of breakage from the first three. They corrupt
 * an *answer*; it removes the *question*, which is the failure a ledger cannot
 * normally see — an emptied body still registers its id, still satisfies the
 * `REQ-SET` correspondence, and still reports `PASS`. Under this fault every
 * requirement must go red instead, and `test/verify-packet.test.mjs` proves it.
 *
 * Each must make this program exit non-zero. A gate that stays green with a
 * broken verifier is not a gate, and the control that proves otherwise is
 * `test/verifier-control.test.mjs`.
 *
 * ## Failures accumulate
 *
 * Every requirement is evaluated and every failure is enumerated by id, so one
 * run tells you all the outstanding work instead of the first item of it.
 *
 *   node experiments/hac-316/bin/verify-packet.mjs --all
 *   node experiments/hac-316/bin/verify-packet.mjs --req REQ-071,REQ-072,REQ-073
 *   node experiments/hac-316/bin/verify-packet.mjs --selfcheck-composition
 *   node experiments/hac-316/bin/verify-packet.mjs --rederive-only
 *   node experiments/hac-316/bin/verify-packet.mjs --counterfactual
 *
 * ## The ledger is the spec's set, proved so
 *
 * A requirement that is merely *written down* is not covered. This program used
 * to enumerate 68 ids while `SPEC.md` declared 74: REQ-069 - REQ-074 were absent
 * from the ledger altogether — not `FAIL`, not `NOT_EXERCISED`, simply uncounted
 * — so `REQ 52/68 PASS` was a percentage of the wrong denominator. The ids are
 * now parsed out of `SPEC.md` and compared to the ids this file evaluates, and a
 * difference in either direction stops the run. Coverage that is asserted by a
 * hand-maintained count can drift; coverage that is a set equation cannot.
 *
 * ## Three terminal states, not two
 *
 * Before Phase 7 runs, the runtime requirements are legitimately unexercised —
 * and a reader could not previously tell that packet from a broken one, because
 * both printed `PACKET INCOMPLETE` and exited 1. There are three states now:
 *
 *   PACKET OK               exit 0   everything passed
 *   PACKET PRE-CLOUD CLEAN  exit 3   nothing failed; every gap awaits a phase
 *   PACKET INCOMPLETE       exit 1   something failed, or a gap has no gate
 *
 * The middle one is deliberately non-zero: it is not a pass, and §7.4 still
 * demands `PACKET OK`. It is distinguishable, which is the whole point.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The frozen decision path, imported rather than re-read. `intentDigest` has no
// call site here — REQ-034 names it as a string and REQ-045/046 read a recorded
// field — but the import stays deliberately: it loads `dist/authorization/intent.js`
// into this process, and the point of `assertDistProvenance` is that everything
// this program reasons through comes from the pinned build.
import { intentDigest } from '../../../dist/authorization/intent.js';
import { Decision, Reason, arbitrate } from '../../../dist/broker/pairing/arbitrate.js';
import { asCanonical, INITIAL_STATE } from '../../../dist/target/state.js';
import { genesisRevision } from '../../../dist/broker/revision/revision.js';

import {
  ATTEMPT_DETAIL_FIELDS,
  deploymentDigestOf,
  disqualifications,
  implementationDigest,
  ingressRecordFor,
  overlapOf,
  retryPolicy,
  runComposition,
} from './run-arm.mjs';
import {
  GCLOUD_LOG_VARIABLE,
  GCLOUD_SHIM_SCRIPT,
  judgeRemoval,
  REFUSAL_EXIT_CODE,
  Refusal,
  REREAD_PROBES,
} from './teardown.mjs';
import { ARRIVAL_RECORD_FIELDS, classifyArrivals, TrialVerdict } from '../src/trial.mjs';
import { measureBuildProvenance, verifyDistProvenance } from '../src/dist-provenance.mjs';
import { isDirectInvocation } from '../src/entrypoint.mjs';
import { insideVitest, readEnumEnv } from '../src/env.mjs';
import { formatVerdict } from '../src/global-verifier.mjs';
import { regenerationChanges } from '../src/regeneration.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');

const AUDIT_SHA = 'f44a6b83580c92776231d3507942a7ef6b1b54f4';

const readText = (path) => readFileSync(join(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
const exists = (path) => existsSync(join(repoRoot, path));
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

/** The faults this verifier knows how to install. Anything else is an error. */
const FAULTS = Object.freeze([
  'invert-composition',
  'stub-reread',
  'tamper-recorded-decision',
  'vacuous-requirement',
]);

/**
 * Which fault, if any, is installed.
 *
 * Read strictly. `HAC316_FAULT_INJECT=''` used to be *non-null*, which made
 * REQ-026 believe a fault was installed and skip the spawn of the deliberately
 * broken verifier — the one check that proves this gate can go red. And an
 * unrecognised fault name used to select "no fault", so a typo produced a green
 * run that the operator believed was a fault-injected one.
 */
const FAULT = (() => {
  try {
    return readEnumEnv('HAC316_FAULT_INJECT', FAULTS);
  } catch (error) {
    // A hard error, never a skip. Exiting cleanly when we are the program, and
    // rethrowing when we are imported, so a test importing SCAN sees the throw
    // rather than losing its runner to process.exit.
    if (isDirectInvocation(import.meta.url)) {
      process.stderr.write(`verify-packet: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
})();

/**
 * The patterns the prohibition scans use, assembled from fragments.
 *
 * This file lives inside the tree it scans. Spelling any of these prohibited
 * tokens out in full here would make the scanner match itself, and every one of
 * these checks would then report a violation it had just created. Assembling
 * the strings is what stops a scanner from being its own finding. It weakens
 * nothing: the pattern that gets compiled is identical to the one the
 * requirement specifies, and `test/verifier-control.test.mjs` proves each one
 * still matches the string it is supposed to catch.
 */
const SCAN = {
  capacityCap: new RegExp(`\\b${['6', '5'].join('')}\\b`),
  backingStore: new RegExp(
    [
      ['re', 'dis'].join(''),
      ['fire', 'store'].join(''),
      ['memory', 'store'].join(''),
      ['span', 'ner'].join(''),
      ['data', 'store'].join(''),
      `${['distri', 'buted'].join('')}[_ -]?store`,
    ].join('|'),
    'i',
  ),
  invariantsOff: new RegExp(
    [
      `${['dis', 'able'].join('')}[_ -]?${['invar', 'iant'].join('')}`,
      ['skip', 'Invariant'].join(''),
      ['INVARIANT', 'DISABLED'].join('_'),
      ['bypass', 'Invariant'].join(''),
    ].join('|'),
    'i',
  ),
  falsifiedTopology: new RegExp(
    [
      ['AGENT', 'TO', 'ANYWHERE'].join('_'),
      ['CONTENT', 'AUTHZ'].join('_'),
      `${['ag', 'ent'].join('')}[_ -]?${['gate', 'way'].join('')}`,
    ].join('|'),
    'i',
  ),
  vendoredSwarm: new RegExp(
    [['ai', 'swarm'].join('-'), ['spec', 'writer'].join('-'), ['swarm', 'templates'].join('/')].join('|'),
    'i',
  ),
  manufacturedTiming: new RegExp(
    [
      `${['sle', 'ep'].join('')}\\(`,
      'setTimeout\\([^)]*[0-9]{3,}',
      ['bar', 'rier'].join(''),
      ['await ', 'delay'].join(''),
      `time\\.${['sle', 'ep'].join('')}`,
    ].join('|'),
  ),
};

/**
 * The file extensions REQ-058's scan reaches (E-07, §0.9).
 *
 * The frozen `--include` list was `*.mjs *.json *.py *.yaml`. Every one of those
 * is a file the experiment *reads*; the one file that makes cloud resources —
 * `bin/10-provision.sh` — is a shell script, and so was outside the scan
 * entirely. The prohibition it is outside of is X-01, "do not retry Agent
 * Gateway": the single most direct way to violate X-01 is a `gcloud` line in the
 * provisioning script, and that was the one place the check could not look. A
 * script carrying a real gateway-creating command reached `PACKET PRE-CLOUD
 * CLEAN`.
 *
 * `*.sh` is therefore added. That is a **widening** of scan scope, and it is
 * disclosed as E-07 for exactly the reason §0.7 had to disclose E-04's
 * narrowing: a change to what a frozen command covers is a change to what the
 * packet claims, in either direction. A widening cannot make a violating tree
 * pass — it can only make more of the tree checkable — but it is still not the
 * frozen command, and an undisclosed difference between the command as written
 * and the command as run is the thing the erratum log exists to prevent.
 */
export const EXECUTABLE_SURFACE_EXTENSIONS = Object.freeze(['mjs', 'json', 'py', 'yaml', 'sh']);

/** `EXECUTABLE_SURFACE_EXTENSIONS`, as the filename test the scan applies. */
export const EXECUTABLE_SURFACE = new RegExp(`\\.(${EXECUTABLE_SURFACE_EXTENSIONS.join('|')})$`);

/**
 * Resource shapes that would mean the falsified S0 topology is being rebuilt.
 *
 * Two independent scans use this: REQ-069 over the declared manifest, and
 * REQ-070 over the provisioning script. Both were incomplete in the same
 * direction, and both were incomplete in a way that let the *current* spelling
 * of a gateway through.
 *
 * REQ-070 listed `network-security`. The command that creates the resource is
 * `gcloud network-services gateways create` — a different product surface, one
 * character-run apart, and not matched. REQ-069's pattern named four API-level
 * type words (`networkAttachment`, `serviceExtension`, `authorizationPolicy`,
 * `egressGateway`) and likewise did not match `network-services gateways`.
 *
 * So the list is one thing now, and it covers the CLI surface as well as the API
 * one. `gateways?` is included on its own: the falsified topology is a gateway,
 * whatever noun the surface of the day puts in front of it. That is the level at
 * which X-01 is written, and matching below it is how this got through twice.
 */
export const FALSIFIED_RESOURCE_SHAPES = Object.freeze([
  'network-security',
  'network-services',
  'networkServices',
  'service-extensions',
  'networkAttachment',
  'network-attachments',
  'serviceExtension',
  'authorizationPolicy',
  'authz-polic',
  'egressGateway',
  'network-endpoint-groups',
]);

/**
 * The same set as a pattern, for text that is not a shell command line.
 *
 * `gateway` is matched here and not merely the product names, because a manifest
 * entry is free-form: `{"type": "gateway", "id": "…"}` names the falsified
 * topology as plainly as any API identifier does.
 */
export const FALSIFIED_RESOURCE_PATTERN = new RegExp(
  [...FALSIFIED_RESOURCE_SHAPES, 'gateways?'].join('|'),
  'i',
);

// ---------------------------------------------------------------------------
// The deliberately broken verifiers
// ---------------------------------------------------------------------------

/** Break the composition verdict, if the fault is installed. */
function faultedVerification(verification) {
  if (FAULT === 'invert-composition') return { ...verification, holds: !verification.holds };
  if (FAULT === 'stub-reread') {
    return { ...verification, source: 'stubbed', total: verification.cap, holds: true };
  }
  return verification;
}

/** Edit a recorded decision before re-derivation, if the fault is installed. */
function faultedDecisions(decisions) {
  if (FAULT !== 'tamper-recorded-decision') return decisions;
  return decisions.map((decision, index) =>
    index === 0
      ? { ...decision, decision: Decision.ALLOW_PARALLEL, reasonCode: Reason.NO_QUALIFYING_COUPLING }
      : decision,
  );
}

// ---------------------------------------------------------------------------
// Requirement bookkeeping
// ---------------------------------------------------------------------------

const Outcome = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  /**
   * The requirement's own verification command cannot be satisfied as written,
   * and no ratified erratum supplies a form that can.
   *
   * Four requirements used to end here — REQ-009, REQ-027, REQ-058, REQ-064 —
   * and they no longer do. Each now has a corrected command under a ratified
   * erratum (§0.1 - §0.3, §0.7), each corrected command passes, and §7.4 states
   * outright that those four "must be executed in their **corrected** form" and
   * that the packet ends at `REQ 74/74 PASS`. Reporting a defect against a
   * command the spec has already superseded would put a permanently un-clearable
   * entry in the ledger and contradict the completion gate: the erratum *is* the
   * operative requirement, so satisfying it is a pass and says so. Each of the
   * four names its governing erratum in its detail, so nothing is hidden by the
   * reclassification — a reader still sees which command was executed and why.
   *
   * The outcome is kept, and kept fatal, because the *category* is real: a
   * future requirement whose command cannot be satisfied and has no erratum must
   * still be able to say so rather than be forced into PASS or FAIL.
   */
  SPEC_DEFECT: 'SPEC_DEFECT',
  /** Belongs to a phase this run did not enter. */
  NOT_EXERCISED: 'NOT_EXERCISED',
};

/**
 * Which phase a gap is waiting on.
 *
 * A `NOT_EXERCISED` entry that carries one of these is a *gate*, and a packet
 * whose only gaps are gates is pre-cloud clean. A `NOT_EXERCISED` entry that
 * carries none is a hole — the suite could not be run, say — and that is a
 * broken packet wearing the same word. Distinguishing them is the whole reason
 * `PACKET PRE-CLOUD CLEAN` can exist without becoming a way to be green while
 * checking nothing.
 */
const Gate = Object.freeze({ PHASE_7: 'phase-7', PHASE_8: 'phase-8' });

const outcomes = [];
const record = (id, phase, outcome, detail, gate) => {
  outcomes.push({ id, phase, outcome, detail, gate: gate ?? null });
};

/**
 * Every id this file knows how to evaluate, whether or not this run selected it.
 *
 * Populated by `check` before any filtering, so `--req` cannot make the ledger
 * look smaller than it is and the correspondence proof below means the same
 * thing in every mode.
 */
const KNOWN_IDS = new Set();

/** The ids this run will evaluate; `null` means all of them. */
let selection = null;

/**
 * How many assertions have been evaluated, ever, in this process.
 *
 * The counter behind the vacuity guard in `check`. Incremented by `must` — and
 * therefore by everything built on it, `noMatch` and `suiteCheck` included —
 * whether the assertion holds or not. It is a count of *questions asked*, not of
 * answers liked.
 */
let assertionsEvaluated = 0;

/**
 * A requirement that was registered, ran, and evaluated nothing.
 *
 * `check` adds the id to `KNOWN_IDS` before the body runs, and a body that
 * returns `undefined` records `PASS`. Those two rules compose into a hole: an
 * empty body — `check('REQ-0NN', 7, () => {})` — is counted in the denominator
 * of `REQ n/m PASS`, satisfies the `REQ-SET` correspondence with `SPEC.md`, and
 * reports `PASS`. So does a body whose assertions were all deleted, or one whose
 * only statement became dead when the field it read was renamed. The set
 * equation proves every declared requirement is *present*; nothing proved any of
 * them *did* anything.
 *
 * It cannot be closed by inspecting the body — a function that "looks like" it
 * checks something is not a fact about what it evaluated — so it is closed by
 * measurement: `must` counts, and a body that recorded a pass while the counter
 * did not move asked nothing. That is reported here as a `FAIL` against the
 * requirement itself, because a requirement that evaluates nothing is exactly as
 * uncovered as one that is missing from the ledger, and the packet already
 * refuses to be green with a missing one.
 *
 * The rule is deliberately narrow. It fires only on a recorded `PASS`:
 * a `NOT_EXERCISED` gate legitimately returns before asserting anything (Phase 8
 * has not run, the suite could not be collected), and a `FAIL` already says the
 * requirement is unsatisfied. Only "passed" is a claim that needed evidence.
 */
export const VACUOUS_DETAIL =
  'the requirement body recorded a pass without evaluating a single assertion; a registered ' +
  'requirement that checks nothing counts in the denominator and reports PASS, which is ' +
  'indistinguishable from coverage it does not have';

/**
 * Whether a finished body's outcome is a claim it did not earn.
 *
 * Pure and exported so the guard can be tested against every case directly
 * rather than inferred from a packet run.
 */
export function isVacuousPass(outcome, assertionsMade) {
  return outcome === Outcome.PASS && assertionsMade === 0;
}

/** Evaluate one requirement; a throw is a failure with the message attached. */
function check(id, phase, body) {
  KNOWN_IDS.add(id);
  if (selection !== null && !selection.has(id)) return undefined;
  const before = assertionsEvaluated;
  const finish = (outcome, detail, gate) => {
    const made = assertionsEvaluated - before;
    if (isVacuousPass(outcome, made)) {
      return record(id, phase, Outcome.FAIL, `${VACUOUS_DETAIL}${detail ? ` (said: ${detail})` : ''}`);
    }
    return record(id, phase, outcome, detail, gate);
  };
  // The control for the guard above: empty the body and keep everything else.
  // A ledger that could not tell this apart from a satisfied requirement is a
  // ledger whose count means nothing, so every id must go red here.
  const effective = FAULT === 'vacuous-requirement' ? () => {} : body;
  try {
    const result = effective();
    if (result === undefined || result === true) return finish(Outcome.PASS, '');
    if (typeof result === 'string') return finish(Outcome.PASS, result);
    return finish(result.outcome, result.detail, result.gate);
  } catch (error) {
    return record(id, phase, Outcome.FAIL, error.message);
  }
}

/**
 * The requirement ids `SPEC.md` declares.
 *
 * Parsed from the heading form every requirement uses — `**REQ-NNN — title**` at
 * line start — rather than from any prose mention, so a citation of REQ-003 in
 * an erratum does not become a requirement and a requirement cannot hide by
 * being cited only in passing. Exported so a test can drive it over fixtures.
 */
export function parseSpecRequirementIds(specText) {
  return new Set([...specText.matchAll(/^\*\*(REQ-\d{3})\b/gm)].map((match) => match[1]));
}

/**
 * Prove the ledger is the spec's requirement set, exactly.
 *
 * Both directions. `missing` is a requirement the spec declares and this file
 * never evaluates — the failure that produced `REQ 52/68 PASS` against a
 * 74-requirement spec. `extra` is an id this file evaluates that the spec does
 * not declare, which would mean the verifier had invented a requirement or that
 * one had been renumbered out from under it.
 */
export function requirementSetCorrespondence({ specIds, verifierIds }) {
  const missing = [...specIds].filter((id) => !verifierIds.has(id)).sort();
  const extra = [...verifierIds].filter((id) => !specIds.has(id)).sort();
  return { missing, extra, agrees: missing.length === 0 && extra.length === 0 };
}

/**
 * Which of the three terminal states a finished ledger is in.
 *
 * Pure and exported so the distinction can be tested directly rather than
 * inferred from an exit code. The middle state is the one that did not exist: a
 * pre-cloud packet and a broken one both printed `PACKET INCOMPLETE` and exited
 * 1, so neither a reader nor CI could tell "the runtime requirements are waiting
 * for Phase 7" from "something is wrong".
 *
 * A gap only counts as waiting if it says what it waits for. `NOT_EXERCISED`
 * with no gate — the suite could not be collected, say — keeps the packet
 * broken, because otherwise the pre-cloud-clean state would be reachable by
 * failing to run checks.
 */
export function terminalState({ outcomes: entries, setAgrees }) {
  const tally = { PASS: 0, FAIL: 0, SPEC_DEFECT: 0, NOT_EXERCISED: 0 };
  for (const entry of entries) tally[entry.outcome] += 1;
  const ungated = entries.filter(
    (entry) => entry.outcome === Outcome.NOT_EXERCISED && !entry.gate,
  );
  if (!setAgrees || tally.FAIL > 0 || tally.SPEC_DEFECT > 0 || ungated.length > 0) {
    return { state: 'INCOMPLETE', exitCode: 1, tally, ungated };
  }
  if (tally.NOT_EXERCISED === 0) return { state: 'OK', exitCode: 0, tally, ungated };
  return { state: 'PRE_CLOUD_CLEAN', exitCode: 3, tally, ungated };
}

/**
 * Every `google.adk.tools.mcp_tool` path referenced under `dir`.
 *
 * The extraction half of REQ-009's corrected command (E-04), lifted out so the
 * scan root can be driven over a fixture. `__pycache__` is skipped — it only
 * echoes the import strings of the `.py` file beside it, and it is gitignored
 * interpreter output — and *nothing else* is: an extension filter here would
 * narrow the frozen command's scope, and §0.7 is where that would have to be
 * disclosed rather than in a `continue`.
 */
export function referencedAdkModules(dir, io = {}) {
  const readDir = io.readDir ?? readdirSync;
  const isDirectory = io.isDirectory ?? ((path) => statSync(path).isDirectory());
  const readFile = io.readFile ?? ((path) => readFileSync(path, 'utf8'));
  const referenced = new Set();
  const walk = (current) => {
    for (const name of readDir(current)) {
      const path = join(current, name);
      if (isDirectory(path)) {
        if (name === '__pycache__') continue;
        walk(path);
        continue;
      }
      for (const match of readFile(path).matchAll(/google\.adk\.tools\.mcp_tool[.a-zA-Z_]*/g)) {
        referenced.add(match[0]);
      }
    }
  };
  walk(dir);
  return referenced;
}

/**
 * One assertion.
 *
 * Counts itself. The count is what makes a requirement that evaluated nothing
 * distinguishable from one that evaluated something and was satisfied — see
 * `VACUOUS_DETAIL`. Counting happens before the test, so an assertion is
 * recorded as asked whichever way it comes out.
 */
/**
 * The evidence files REQ-067 compares across a regeneration.
 *
 * Written out rather than derived, because the requirement is a claim about a
 * *closed* set — "regenerating the V2 producer rewrites nothing" is only a claim
 * if the set of things it could rewrite is fixed. The check that this list is
 * the producer's actual output set is `producerOutputs` below.
 */
export const REGENERATED_OUTPUTS = Object.freeze(['preflight.v2.json', 'fixture.json']);

/**
 * Every evidence file the V2 producer writes, read out of the producer itself.
 *
 * ## The regression this closes
 *
 * `REGENERATED_OUTPUTS` was `['preflight.v2.json']` alone. The producer writes
 * two files (`preflight-v2.mjs:506-507`), so an in-place rewrite of
 * `fixture.json` was invisible inside the very run that caused it — while
 * REQ-010, REQ-011, REQ-019 and the arms' initial-state comparison all read that
 * fixture. The list was widened to two; nothing stopped it being narrowed back,
 * and narrowing it left the whole suite green, because every test asserted
 * things about the comparison function and none asserted what the requirement
 * fed it.
 *
 * A hand-maintained list of a producer's outputs goes stale the moment the
 * producer writes a third file — so it is not maintained by hand any more. This
 * reads the `writeFileSync(join(evidenceDir, '<name>'), …)` calls out of the
 * producer's source and REQ-067 refuses to run unless its own list is exactly
 * that set. Reverting the list, or adding an output and not extending the list,
 * both turn the requirement red.
 *
 * @param producerSource the text of `bin/preflight-v2.mjs`.
 */
export function producerOutputs(producerSource) {
  return [
    ...new Set(
      [...producerSource.matchAll(/writeFileSync\(\s*join\(evidenceDir,\s*'([^']+)'\)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

const must = (condition, message) => {
  assertionsEvaluated += 1;
  if (!condition) throw new Error(message);
};

/**
 * Compare every arm's recorded implementation digest to a **fresh** measurement.
 *
 * ## What comparing the arms to each other could not catch
 *
 * The packet's claim about implementation is that all three arms ran the same
 * code, and REQ-056 asserted it by comparing `perturbation` to `treatment` and
 * `baseline` to `treatment`. Both are comparisons between two recorded fields.
 * Three fields set to the same value satisfy that equation whatever the value
 * is: three zeroes agree, three digests of a build nobody has any more agree,
 * and — the case that actually happens — three digests of the tree as it stood
 * several commits ago agree. Equality across the record says the arms are
 * consistent with each other. It says nothing about whether the record still
 * describes the implementation on disk.
 *
 * That matters here more than it usually would, because the whole packet is an
 * argument about *this* implementation. A `results.json` produced before a change
 * to `src/` or `bin/run-arm.mjs` is evidence about a program that no longer
 * exists, and the reader cannot tell, because the internal comparison is green.
 *
 * So the comparison is against `implementationDigest()` — the same function that
 * produced the recorded value, called now, over the tree as it is. It is
 * deliberately not a re-implementation: measuring the closure a second way would
 * be a second thing to keep in step, and the failure would be ambiguous between
 * "the packet is stale" and "the two measurements disagree about what to hash".
 *
 * @param arms     `results.arms`, keyed by arm name.
 * @param measured the freshly recomputed digest.
 * @returns the problems found; `[]` when every arm matches the tree.
 */
export function implementationFreshness(arms, measured) {
  const problems = [];
  for (const [name, arm] of Object.entries(arms ?? {})) {
    const recorded = arm?.implementationDigest;
    if (typeof recorded !== 'string' || recorded === '') {
      problems.push(`${name}: no implementation digest was measured`);
      continue;
    }
    if (recorded !== measured) {
      problems.push(
        `${name}: recorded implementation ${recorded.slice(0, 12)}… is not the implementation on ` +
          `disk ${measured.slice(0, 12)}…`,
      );
    }
  }
  return problems;
}

/**
 * The five mismatched project ids REQ-072 drives through the teardown guard, and
 * the refusal each one must produce.
 *
 * ## Why the expected code is stated here rather than computed
 *
 * The point of this table is to be an *independent* statement of what the guard
 * should do. Deriving the expectation by calling `guardProjectId` — the guard
 * itself — would make the check a comparison of the tool against itself, which
 * passes for any behaviour the tool happens to have. So the mapping is written
 * out, per probe, from the gate table in `teardown.mjs`'s header:
 *
 *   mode → single-operand → supplied → shape → declared → matches
 *
 * The fifth probe, the declared id with a trailing character, is only
 * constructible once Phase 7 has declared something. Until then the first probe
 * covers the same declaration-gate ground, so this requirement is exercised
 * before Phase 7 rather than deferred to it.
 *
 * @param declared the id `evidence/topology.json` records, or `null`.
 */
export function refusalProbes(declared) {
  return [
    {
      probe: 'interlock-s1-deadbeef',
      // Well-formed and disposable, so it clears the shape fence and reaches the
      // declaration gate. Which of the two G-3 refusals it earns depends on
      // whether anything has been declared at all.
      expected: declared === null ? Refusal.NOT_DECLARED : Refusal.UNDECLARED_ID,
      gate: 'G-3 (declaration)',
    },
    { probe: 'interlock-s0-gate', expected: Refusal.NOT_DISPOSABLE, gate: 'G-4 (shape)' },
    { probe: 'interlock-s2-gate', expected: Refusal.NOT_DISPOSABLE, gate: 'G-4 (shape)' },
    { probe: 'my-production-project', expected: Refusal.NOT_DISPOSABLE, gate: 'G-4 (shape)' },
    ...(declared === null
      ? []
      : [
          {
            probe: `${declared}x`,
            // A trailing character breaks the eight-hex-digit tail, so this is
            // refused on shape before the declaration is ever consulted.
            expected: Refusal.NOT_DISPOSABLE,
            gate: 'G-4 (shape)',
          },
        ]),
  ].filter((entry) => entry.probe !== declared);
}

/**
 * Judge one refusal probe against the refusal it was supposed to produce.
 *
 * ## The assertion this replaces, and why it could not fail
 *
 * REQ-072 used to assert `2 <= status <= 4` and an empty invocation log, for
 * five different mismatched ids. Both halves are satisfied by a teardown that
 * refuses every one of them for the *same wrong reason*: when the `--project=<id>`
 * form stopped being parsed, all five collapsed into `PROJECT_ID_NOT_SUPPLIED`,
 * exit 2, no invocations — in the band, log empty, `REQ 1/1 PASS`. The
 * requirement claimed to prove that five specific mismatches are each caught by
 * the gate that is supposed to catch them, and proved instead that the program
 * exits non-zero when handed something it never read.
 *
 * So three things are asserted per probe, and the middle one is the new one:
 *
 *   1. the exit code is the one the refusal's own table assigns to that code —
 *      not a band, and derived from `REFUSAL_EXIT_CODE` so the two cannot drift;
 *   2. the printed `teardown-refused=<CODE>` is the *specific* expected code,
 *      and is explicitly not `PROJECT_ID_NOT_SUPPLIED`, which is precisely what
 *      a reverted operand parser produces for every probe;
 *   3. the invocation log is empty, so the refusal preceded any spawn.
 *
 * Pure, and exported, so the reverted-parser case can be replayed in a test
 * without reverting the parser.
 *
 * @returns the problems found; `[]` when the probe was refused correctly.
 */
export function judgeRefusalProbe({ probe, expected, gate, status, stdout, invocations: log }) {
  const problems = [];
  const wantedStatus = REFUSAL_EXIT_CODE[expected];
  const printed = /^teardown-refused=(\S+)$/m.exec(stdout ?? '')?.[1] ?? null;

  if (printed === null) {
    problems.push(`${probe}: no teardown-refused=<CODE> line was printed; refusal reason unknown`);
  } else if (printed !== expected) {
    problems.push(
      `${probe}: refused as ${printed}, expected ${expected} from ${gate}` +
        (printed === Refusal.NOT_SUPPLIED
          ? '. That is the refusal a teardown that never read --project=<id> gives for every ' +
            'probe, so this run proves nothing about the gate it names'
          : ''),
    );
  }
  if (printed === Refusal.NOT_SUPPLIED && expected !== Refusal.NOT_SUPPLIED) {
    problems.push(
      `${probe}: the operand was supplied, so ${Refusal.NOT_SUPPLIED} means it was not read`,
    );
  }
  if (status !== wantedStatus) {
    problems.push(`${probe}: exit ${status}, expected ${wantedStatus} for ${expected}`);
  }
  if ((log ?? '') !== '') {
    problems.push(`${probe}: teardown spawned gcloud before refusing: ${log}`);
  }
  return problems;
}

/** Which top-level keys two deployment descriptions disagree about. */
const differingKeys = (left, right) =>
  [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].filter(
    (key) => JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key]),
  );

/** The spec's `test -z "$(grep ...)"` idiom, as a predicate. */
const noMatch = (text, pattern, label) => {
  const found = text
    .split('\n')
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => pattern.test(line));
  must(found.length === 0, `${label}: ${found.map(([n, l]) => `${n}: ${l.trim()}`).join(' | ')}`);
};

// ---------------------------------------------------------------------------
// Loaded artifacts
// ---------------------------------------------------------------------------

const artifacts = {};
for (const [key, path] of Object.entries({
  pins: 'experiments/hac-316/evidence/pins.json',
  v1: 'experiments/hac-316/evidence/preflight.json',
  v2: 'experiments/hac-316/evidence/preflight.v2.json',
  toolchain: 'experiments/hac-316/evidence/toolchain.json',
  fixture: 'experiments/hac-316/evidence/fixture.json',
  arms: 'experiments/hac-316/evidence/arms.json',
  results: 'experiments/hac-316/evidence/results.json',
  // Phase 7. `resources.json` is the frozen declaration and exists before
  // provisioning; `topology.json` is what provisioning actually made and is
  // legitimately absent until it runs. Absence of the second is a gate, absence
  // of the first is a failure — they are not the same missing file.
  resources: 'experiments/hac-316/evidence/resources.json',
  topology: 'experiments/hac-316/evidence/topology.json',
})) {
  artifacts[key] = exists(path) ? readJson(path) : null;
}

const sources = {};
for (const [key, path] of Object.entries({
  globalVerifier: 'experiments/hac-316/src/global-verifier.mjs',
  routing: 'experiments/hac-316/src/routing.mjs',
  baselineIssuer: 'experiments/hac-316/src/baseline-issuer.mjs',
  preflightV2Producer: 'experiments/hac-316/bin/preflight-v2.mjs',
  verifyPacket: 'experiments/hac-316/bin/verify-packet.mjs',
  teardown: 'experiments/hac-316/bin/teardown.mjs',
  provision: 'experiments/hac-316/bin/10-provision.sh',
  spec: 'experiments/hac-316/SPEC.md',
  stateTs: 'src/target/state.ts',
  configTs: 'src/config.ts',
  proxyMainTs: 'src/proxy/main.ts',
  packageJson: 'package.json',
})) {
  sources[key] = exists(path) ? readText(path) : '';
}

// ---------------------------------------------------------------------------
// Core computations, shared by several modes
// ---------------------------------------------------------------------------

/**
 * Assert that `dist/` is the build the packet was pinned to.
 *
 * Re-derivation is only meaningful against the frozen decision path. A stale or
 * hand-edited `dist/` would let this program report "re-derived and it matches"
 * about a function nobody pinned, so every mode that re-derives calls this
 * first.
 *
 * No `symbols` argument. There used to be one — a four-entry
 * `{ arbitrate, asCanonical, genesisRevision, intentDigest }` passed as an
 * override — and it went dead when `pins.json.loadedSymbols` became the computed
 * dependency closure: 44 qualified `module#export` keys, none of which those four
 * unqualified names can name. `measureBuildProvenance` applies caller symbols as
 * overrides *on* the load-bearing set, so four keys that match nothing overrode
 * nothing, and the argument had been silently doing no work. The four `dist/`
 * imports at the top of this file are a different matter and stay: they are the
 * bindings re-derivation actually calls.
 */
function assertDistProvenance() {
  const measured = measureBuildProvenance({ repoRoot });
  const problems = verifyDistProvenance(artifacts.pins?.dist, measured);
  must(
    problems.length === 0,
    `the build being re-derived through is not the pinned one: ${problems.join('; ')}`,
  );
  return measured.digest;
}

/** Re-derive every recorded decision from the inputs arbitration was handed. */
function rederiveArm(armName) {
  assertDistProvenance();
  const arm = artifacts.results?.arms?.[armName];
  must(arm !== undefined, `results.json carries no ${armName} arm`);
  const inputs = arm.arbitrationInputs ?? [];
  must(inputs.length > 0, `${armName}: no arbitration inputs were captured, so nothing can be re-derived`);

  const evidence = readJson(arm.evidencePath);
  const recorded = faultedDecisions(arm.decisions);
  const compared = [];

  for (const input of inputs) {
    const recomputed = arbitrate({
      candidate: input.candidate,
      others: input.storeAnswered
        ? { ok: true, value: input.others }
        : { ok: false, detail: 'store unavailable, as recorded' },
      evidence,
      sourceRevision: arm.sourceRevision,
    });
    const against = recorded.find((entry) => entry.correlationId === input.correlationId);
    must(against !== undefined, `${armName}: no recorded decision for ${input.correlationId}`);
    compared.push({
      correlationId: input.correlationId,
      recorded: { decision: against.decision, reasonCode: against.reasonCode },
      rederived: { decision: recomputed.decision, reasonCode: recomputed.reasonCode },
      matches:
        recomputed.decision === against.decision && recomputed.reasonCode === against.reasonCode,
    });
  }
  return compared;
}

/** The four composition facts, executed rather than asserted. */
async function selfcheckComposition() {
  const lines = [];
  const cases = [
    ['initial', []],
    ['A only', ['alpha']],
    ['B only', ['beta']],
    ['A and B', ['alpha', 'beta']],
  ];
  const expectations = { initial: true, 'A only': true, 'B only': true, 'A and B': false };
  const problems = [];

  for (const [label, services] of cases) {
    const verification = faultedVerification(await runComposition(services));
    lines.push(formatVerdict(label, verification));
    if (verification.source !== 'independent-reread') {
      problems.push(`${label}: verdict did not come from an independent re-read`);
    }
    if (verification.holds !== expectations[label]) {
      problems.push(
        `${label}: expected holds=${expectations[label]}, got ${verification.holds} ` +
          `(${verification.total} vs cap ${verification.cap})`,
      );
    }
  }
  return { lines, problems };
}

// ---------------------------------------------------------------------------
// Vitest, run once for the requirements that own a suite
// ---------------------------------------------------------------------------

let suiteCache;
function suiteResults() {
  if (suiteCache !== undefined) return suiteCache;
  // Strictly. `VITEST=''` is not "inside vitest": reading it as such downgraded
  // every suite-backed requirement to NOT_EXERCISED without saying so, which is
  // a quieter gate wearing the same output as a satisfied one. `insideVitest`
  // also refuses an unparseable value rather than guessing.
  if (insideVitest()) {
    suiteCache = { available: false, reason: 'already running inside vitest' };
    return suiteCache;
  }
  const outputFile = join(mkdtempSync(join(tmpdir(), 'hac316-')), 'vitest.json');
  // The child must run clean. The variable is *removed* rather than blanked:
  // an empty value is now absent by rule, but deleting it says so unambiguously.
  const childEnv = { ...process.env };
  delete childEnv['HAC316_FAULT_INJECT'];
  const run = spawnSync(
    'npx',
    ['vitest', 'run', 'experiments/hac-316/test', '--reporter=json', `--outputFile=${outputFile}`],
    { cwd: repoRoot, encoding: 'utf8', env: childEnv },
  );
  if (!existsSync(outputFile)) {
    suiteCache = { available: false, reason: `vitest produced no report: ${run.stderr?.slice(-400)}` };
    return suiteCache;
  }
  const report = JSON.parse(readFileSync(outputFile, 'utf8'));
  const assertions = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      assertions.push({
        file: file.name,
        title: assertion.fullName ?? assertion.title,
        status: assertion.status,
      });
    }
  }
  suiteCache = { available: true, assertions, passed: run.status === 0 };
  return suiteCache;
}

/** Assert that a suite ran, all of it passed, and it covers the named titles. */
function suiteCheck({ file, minimum, titles = [] }) {
  const suite = suiteResults();
  if (!suite.available) {
    return { outcome: Outcome.NOT_EXERCISED, detail: `test suite not run here (${suite.reason})` };
  }
  const mine = suite.assertions.filter((assertion) => assertion.file.endsWith(file));
  const failed = mine.filter((assertion) => assertion.status !== 'passed');
  must(mine.length > 0, `${file}: no tests were collected`);
  must(failed.length === 0, `${file}: ${failed.map((a) => a.title).join('; ')} did not pass`);
  must(
    mine.length >= minimum,
    `${file}: ${mine.length} tests, requirement asks for at least ${minimum}`,
  );
  for (const title of titles) {
    must(
      mine.some((assertion) => assertion.title.toLowerCase().includes(title.toLowerCase())),
      `${file}: no passing test matching "${title}"`,
    );
  }
  return `${mine.length} tests passed`;
}

// ---------------------------------------------------------------------------
// The requirements
// ---------------------------------------------------------------------------

function phase0() {
  check('REQ-001', 0, () => {
    const pins = artifacts.pins;
    must(/^[0-9a-f]{40}$/.test(pins.greenMainSha ?? ''), 'greenMainSha missing or malformed');
    must(typeof pins.greenMainVerifiedAt === 'string', 'greenMainVerifiedAt missing');
  });

  check('REQ-002', 0, () => {
    const status = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', artifacts.pins.greenMainSha, 'HEAD'],
      { cwd: repoRoot },
    ).status;
    must(status === 0, 'the pinned green main SHA is not an ancestor of HEAD');
  });

  check('REQ-003', 0, () => {
    const want = {
      'experiments/hac-330/evidence/baseline.evidence.json':
        'f716297558dfa325e8eef222623af0a461d0879f739cd7d0f7853d7a1ebd6f22',
      'experiments/hac-330/evidence/perturbed.evidence.json':
        'b6dca507294c46997828f5f36d1018cfb3a72c5dd65b7b6e217ba2aedb3cf02b',
    };
    for (const [path, evidenceFileSha256] of Object.entries(want)) {
      const measured = sha256Hex(readFileSync(join(repoRoot, path)));
      must(measured === evidenceFileSha256, `evidence_file_sha256 drift: ${path}`);
      must(artifacts.pins.artifacts[path] === evidenceFileSha256, `not pinned: ${path}`);
    }
    must(
      artifacts.pins.artifacts.couplingArtifactSha256 ===
        '2c021d0c593aac252c4f7f61d8d6bd03b3bfcccf7a2f647691a1a2b894eb21d6',
      'producer_artifact_sha256 not pinned',
    );
    must(
      artifacts.pins.artifacts.couplingProducerSha === 'defac1e5dce6fb692a48e775fb44854b371cbca4',
      'producer sha not pinned',
    );
  });

  check('REQ-004', 0, () => {
    const changed = git(
      'diff',
      '--name-only',
      AUDIT_SHA,
      '--',
      'experiments/hac-316/evidence/preflight.json',
      'experiments/hac-316/bin/preflight.mjs',
    ).trim();
    must(changed === '', `Preflight V1 was modified: ${changed}`);
  });

  check('REQ-005', 0, () => {
    const v2 = artifacts.v2;
    const need = {
      'schema.version': 2,
      supersedes: 'experiments/hac-316/evidence/preflight.json',
      reason: 'single-target baseline falsified by local invariant/revision enforcement',
      discovered_by: 'swarm audit',
      discovered_before_first_agent_runtime_trial: true,
      discovered_before_cloud_spend: true,
    };
    for (const [path, want] of Object.entries(need)) {
      const got = path.split('.').reduce((node, key) => node?.[key], v2);
      must(got === want, `${path}: expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    }
    const actual = sha256Hex(readFileSync(join(repoRoot, v2.supersedes)));
    must(v2.superseded_sha256 === actual, 'superseded_sha256 does not match V1 on disk');
  });

  check('REQ-006', 0, () => {
    const META = new Set([
      'schema',
      'supersedes',
      'superseded_sha256',
      'reason',
      'discovered_by',
      'discovered_before_first_agent_runtime_trial',
      'discovered_before_cloud_spend',
      'changed_fields',
      'carried_forward',
    ]);
    const flat = (node, prefix = '', out = {}) => {
      for (const [key, value] of Object.entries(node ?? {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) flat(value, path, out);
        else out[path] = JSON.stringify(value);
      }
      return out;
    };
    const a = flat(artifacts.v1);
    const b = flat(artifacts.v2);
    const declared = new Set((artifacts.v2.changed_fields ?? []).map((entry) => entry.path));
    const undeclared = [];
    for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (META.has(path.split('.')[0])) continue;
      if (a[path] !== b[path] && !declared.has(path)) undeclared.push(path);
    }
    for (const entry of artifacts.v2.changed_fields ?? []) {
      must(
        'v1' in entry && 'v2' in entry && Boolean(entry.why),
        `incomplete changed_fields entry: ${entry.path}`,
      );
    }
    must(undeclared.length === 0, `undeclared changes: ${undeclared.join(', ')}`);
    return `${declared.size} declared, 0 undeclared`;
  });

  check('REQ-007', 0, () => {
    const carried = artifacts.v2.carried_forward;
    const want = {
      max_attempts: 3,
      artificial_delay_allowed: false,
      barrier_allowed: false,
      ttl_tuning_after_first_run: false,
      hidden_retry_allowed: false,
      same_intent_required: true,
      evidence_perturbation_required: true,
      independent_observation_required: true,
    };
    for (const [key, value] of Object.entries(want)) {
      must(carried[key] === value, `carried_forward.${key}: expected ${value}`);
    }
  });

  check('REQ-008', 0, () => {
    for (const key of ['python', 'google-adk', 'mcp', 'vertexai', 'node']) {
      const entry = artifacts.toolchain.captured[key];
      must(entry !== undefined, `missing capture: ${key}`);
      must(typeof entry.command === 'string' && entry.command.length > 0, `no command for ${key}`);
      must(typeof entry.stdout === 'string' && entry.stdout.length > 0, `no stdout for ${key}`);
      must(entry.method === 'executed', `${key} is not mechanically captured`);
    }
  });

  check('REQ-009', 0, () => {
    const captured = artifacts.toolchain.adkImports ?? [artifacts.toolchain.adkImport];
    must(captured.length > 0, 'no ADK import was mechanically captured');
    for (const entry of captured) {
      must(entry?.method === 'executed', `${entry?.symbol}: adkImport not mechanically captured`);
      must(typeof entry.modulePath === 'string' && entry.modulePath.length > 0, 'no modulePath');
      must(typeof entry.resolvedFile === 'string' && entry.resolvedFile.length > 0, 'no resolvedFile');
    }

    // The extraction carried an `if (!name.endsWith('.py')) continue;` that the
    // frozen command did not have, while §0.4 and §0.7 both said the scan root
    // and pattern were unchanged. It was consequential — a probe
    // `agents/notes.txt` naming a `google.adk.tools.mcp_tool` path was invisible
    // to the corrected check and visible to the frozen one — and narrowing scope
    // is the one thing an erratum may not do quietly. The filter is gone and
    // §0.7 records that it was there.
    const referenced = referencedAdkModules(join(repoRoot, 'experiments/hac-316/agents'));

    // The substantive requirement: nothing is imported that was not reproduced
    // in the interpreter the agents run on, and nothing was captured that the
    // agents do not use. Both directions, so a capture cannot be padded with
    // paths nobody imports, and an import cannot appear that nobody verified.
    const capturedPaths = new Set(captured.map((entry) => entry.modulePath));
    const uncaptured = [...referenced].filter((path) => !capturedPaths.has(path));
    const unused = [...capturedPaths].filter((path) => !referenced.has(path));
    must(
      uncaptured.length === 0,
      `the agents import ADK paths nobody reproduced: ${uncaptured.join(', ')}`,
    );
    must(unused.length === 0, `captured but never imported: ${unused.join(', ')}`);
    must(referenced.size > 0, 'the agents reference no ADK mcp_tool module at all');

    // Executed in its corrected form (E-04, §0.7), which is the operative
    // command: the frozen cardinality counter demanded exactly one ADK import
    // path, and a post-freeze owner ruling fixed a runtime whose working surface
    // is two modules. The set correspondence above is strictly stricter than the
    // counter it replaced — it admits no uncaptured import and no unused
    // capture — so this is a pass, not a defect worked around.
    return `E-04 corrected form; ${[...capturedPaths].sort().join(', ')}`;
  });

  check('REQ-010', 0, () => {
    must(INITIAL_STATE.totalReservable === 130, 'totalReservable changed');
    must(
      INITIAL_STATE.services.alpha === 40 &&
        INITIAL_STATE.services.beta === 40 &&
        INITIAL_STATE.services.gamma === 20,
      'fixture services changed',
    );
    const digest = `sha256:${sha256Hex(JSON.stringify(asCanonical(INITIAL_STATE)))}`;
    must(
      artifacts.fixture.canonicalFixtureDigest === digest,
      `digest drift: recorded ${artifacts.fixture.canonicalFixtureDigest} actual ${digest}`,
    );
    must(artifacts.fixture.recordedBeforeArms === true, 'fixture digest not declared pre-arm');
  });

  check('REQ-011', 0, () => {
    const fixture = artifacts.fixture;
    must(fixture.projection === true, 'not declared a projection');
    must(fixture.replacesCanonicalFixture === false, 'must not replace the canonical fixture');
    const partitions = fixture.partitions;
    must(
      Object.keys(partitions).sort().join(',') === 'alpha,beta',
      'partitions must be exactly alpha,beta',
    );
    for (const name of ['alpha', 'beta']) {
      must(partitions[name].totalReservable === 130, `${name} must keep totalReservable 130`);
      must(
        Object.keys(partitions[name].services).join(',') === name,
        `${name} must hold only its own service`,
      );
      must(partitions[name].services[name] === 40, `${name} must start at 40`);
    }
    must(fixture.gammaTargetExists === false, 'gamma must not be a target');
  });

  check('REQ-012', 0, () => {
    for (const dir of ['src', 'bin', 'evidence']) {
      const base = join(repoRoot, 'experiments/hac-316', dir);
      for (const name of readdirSync(base)) {
        const text = readFileSync(join(base, name), 'utf8');
        noMatch(text, SCAN.capacityCap, `${dir}/${name} carries a halved partition cap`);
      }
    }
  });

  check('REQ-067', 0, () => {
    const producer = sources.preflightV2Producer;
    must(/dist\/authorization\/canonical\.js/.test(producer), 'V2 producer does not load canonical.js');
    must(/dist\/target\/state\.js/.test(producer), 'V2 producer does not load state.js');
    noMatch(producer, /"sha256:[0-9a-f]{64}"/, 'V2 producer carries a hand-typed digest');

    // Both outputs, not one. The producer writes `preflight.v2.json` *and*
    // `fixture.json` (preflight-v2.mjs:506-507), and capturing only the first
    // meant an in-place change to the fixture was invisible inside the very run
    // that made it — while four other requirements (REQ-010, REQ-011, REQ-019
    // and the arms' initial-state comparison) read that fixture.
    //
    // Which two they are is not taken on trust: the producer is read, and the
    // comparison set has to be exactly what it writes. Narrowing this list back
    // to one file — the regression — fails here before a single byte is
    // compared, rather than passing while checking half of what it claims.
    const WRITTEN = REGENERATED_OUTPUTS;
    const writes = producerOutputs(producer);
    must(
      writes.length > 0,
      'no evidence writes were found in the V2 producer; the output set cannot be confirmed',
    );
    must(
      JSON.stringify([...WRITTEN].sort()) === JSON.stringify(writes),
      `the regeneration comparison covers ${[...WRITTEN].sort().join(', ')} but the producer ` +
        `writes ${writes.join(', ')}; an output that is written and not compared can be rewritten ` +
        'in place by the very run that is supposed to prove it immutable',
    );
    const snapshot = () =>
      Object.fromEntries(WRITTEN.map((name) => [name, readFileSync(join(evidenceDir, name))]));

    const before = snapshot();
    const run = spawnSync(process.execPath, [join(here, 'preflight-v2.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const after = snapshot();
    must(run.status === 0, `regenerating V2 failed: ${run.stderr?.trim().slice(-300)}`);
    const changed = regenerationChanges(before, after);
    must(
      changed.length === 0,
      `regenerating V2 rewrote ${changed.join(', ')}; both of the producer's outputs are ` +
        'immutable once committed',
    );
    return `${WRITTEN.length} outputs unchanged`;
  });
}

function phase1() {
  check('REQ-013', 1, () => {
    must(
      !sources.stateTs.includes('It is not the enforcement mechanism'),
      'the inaccurate prose is still present',
    );
    must(/local[^.]*target integrity/.test(sources.stateTs), 'local target integrity not named');
    must(/composition invariant/.test(sources.stateTs), 'the composition invariant is not named');
  });

  check('REQ-014', 1, () => {
    const changed = git('diff', '--numstat', AUDIT_SHA, '--', 'src/target/state.ts').trim();
    must(changed !== '', 'state.ts is unchanged; the correction was not made');
    const diff = git('diff', '-U0', AUDIT_SHA, '--', 'src/target/state.ts');
    const touched = diff
      .split('\n')
      .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
      .map((line) => line.slice(1).trim());
    const executable = touched.filter((line) => !(line.startsWith('*') || line.startsWith('/*') || line === ''));
    must(
      executable.length === 0,
      `the correction touched non-comment lines: ${executable.join(' | ')}`,
    );
  });

  check('REQ-015', 1, () => {
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (readFileSync(path, 'utf8').includes('computeNext')) offenders.push(path);
      }
    };
    walk(join(repoRoot, 'src'));
    must(offenders.length === 0, `computeNext was extracted: ${offenders.join(', ')}`);
  });
}

function phase2() {
  check('REQ-016', 2, () =>
    suiteCheck({ file: 'partition.test.mjs', minimum: 3, titles: ['partition'] }),
  );

  check('REQ-017', 2, () => {
    // Re-executed here rather than restated: the point of the projection is
    // that both mutations pass locally, and that has to keep being true.
    const state = readJson('experiments/hac-316/evidence/fixture.json');
    for (const service of ['alpha', 'beta']) {
      const partition = state.partitions[service];
      const composed = { ...partition, services: { ...partition.services, [service]: 60 } };
      const total = Object.values(composed.services).reduce((sum, value) => sum + value, 0);
      must(total <= composed.totalReservable, `${service} 40->60 breaches its own partition`);
      must(total === 60, `${service} partition total should be 60, got ${total}`);
    }
    return 'alpha=60 beta=60';
  });

  check('REQ-018', 2, () =>
    suiteCheck({ file: 'partition.test.mjs', minimum: 3, titles: ['UNKNOWN_SERVICE'] }),
  );

  check('REQ-019', 2, () => {
    const fixture = artifacts.fixture;
    must(fixture.targetIds.alpha !== fixture.targetIds.beta, 'targetIds must differ');
    const alpha = genesisRevision(fixture.targetIds.alpha, asCanonical(fixture.partitions.alpha));
    const beta = genesisRevision(fixture.targetIds.beta, asCanonical(fixture.partitions.beta));
    must(alpha !== beta, 'genesis revisions collided');
    must(fixture.genesisRevisions.alpha === alpha, 'recorded alpha genesis revision drifted');
    must(fixture.genesisRevisions.beta === beta, 'recorded beta genesis revision drifted');
    return 'distinct';
  });

  check('REQ-020', 2, () => {
    const text = readText('experiments/hac-316/test/partition.test.mjs');
    must(text.includes('WRONG_TARGET'), 'the suite does not name WRONG_TARGET');
    return suiteCheck({ file: 'partition.test.mjs', minimum: 3, titles: ['cross-target'] });
  });

  check('REQ-021', 2, () => {
    const changed = git('diff', '--name-only', AUDIT_SHA, '--', 'src/')
      .split('\n')
      .filter((line) => line !== '' && line !== 'src/target/state.ts');
    must(changed.length === 0, `src/ carries other changes: ${changed.join(', ')}`);
  });

  check('REQ-022', 2, () => {
    noMatch(
      sources.globalVerifier,
      /(^|[^0-9])(20|130)([^0-9]|$)/,
      'the global verifier carries a magic constant',
    );
    must(sources.globalVerifier.includes('INITIAL_STATE'), 'the verifier does not derive from INITIAL_STATE');
  });

  check('REQ-023', 2, () => ({
    outcome: Outcome.NOT_EXERCISED,
    detail: 'composition self-check runs under --selfcheck-composition; see that mode',
  }));

  check('REQ-024', 2, () => {
    must(
      /reread|independentRead|fetchTargetState/.test(sources.globalVerifier),
      'the verifier does not re-read',
    );
    noMatch(
      sources.globalVerifier,
      /callerAck|acknowledg|reportedState|responseBody\.state/,
      'the verifier trusts something it was told',
    );
  });

  check('REQ-025', 2, () => suiteCheck({ file: 'global-verifier.test.mjs', minimum: 4 }));

  check('REQ-026', 2, () => {
    const control = suiteCheck({ file: 'verifier-control.test.mjs', minimum: 2 });
    if (typeof control === 'object') return control;
    if (FAULT !== null) return `${control}; fault ${FAULT} installed in this run`;
    const broken = spawnSync(process.execPath, [join(here, 'verify-packet.mjs'), '--selfcheck-composition'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, HAC316_FAULT_INJECT: 'invert-composition' },
    });
    must(broken.status !== 0, 'a broken verifier still produced a green self-check');
    return `${control}; broken verifier exits ${broken.status}`;
  });

  check('REQ-066', 2, () => {
    const text = sources.verifyPacket;
    must(
      /from '.*dist\/broker\/pairing\/arbitrate\.js'/.test(text),
      'the verifier does not import the real arbitration function',
    );
    must(/rederive|reDerive|recomputed/.test(text), 'the verifier does not re-derive');
    // The import is only worth anything if `dist/` is the build the packet was
    // pinned to. `dist/` is gitignored and was previously unpinned, so the
    // anti-circularity claim rested on a build nothing in the repository named.
    const distDigest = assertDistProvenance();
    const treatment = rederiveArm('treatment');
    const perturbation = rederiveArm('perturbation');
    const mismatched = [...treatment, ...perturbation].filter((entry) => !entry.matches);
    must(
      mismatched.length === 0,
      `re-derivation disagrees with the record: ${mismatched
        .map((entry) => `${entry.correlationId} recorded ${entry.recorded.decision} rederived ${entry.rederived.decision}`)
        .join('; ')}`,
    );
    return (
      `${treatment.length}/${treatment.length} treatment + ` +
      `${perturbation.length}/${perturbation.length} perturbation, ` +
      `through pinned dist ${distDigest.slice(0, 12)}…`
    );
  });

  check('REQ-027', 2, () => {
    const pattern = SCAN.invariantsOff;
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (pattern.test(readFileSync(path, 'utf8'))) hits.push(path.slice(repoRoot.length + 1));
      }
    };
    walk(join(repoRoot, 'experiments/hac-316'));
    // E-01's exclusion, exactly: `SPEC.md` and nothing else. The filter used to
    // also drop `bin/verify-packet.mjs`, which is a fifth path — and §0.0
    // declares the exclusion set closed at four. It was also unnecessary: the
    // scan patterns in this file are assembled from fragments precisely so the
    // scanner is not its own finding, so the file does not match. Matched on the
    // full repository-relative path, so no same-basename file elsewhere is
    // caught by it.
    const EXCLUDED = new Set(['experiments/hac-316/SPEC.md']);
    const implementation = hits.filter((path) => !EXCLUDED.has(path));
    must(implementation.length === 0, `local invariants are switched off in: ${implementation.join(', ')}`);
    // E-01 corrected form (§0.1). The prohibition X-19 is untouched: every file
    // under experiments/hac-316/ other than this document is still in scope.
    return `E-01 corrected form; ${hits.length} self-match(es) excluded`;
  });
}

function phase3() {
  check('REQ-028', 3, () => {
    const stores = (sources.routing.match(/new InMemoryPendingIntentStore\(/g) ?? []).length;
    const proxies = (sources.routing.match(/new InterlockProxy\(/g) ?? []).length;
    must(stores === 1, `routing.mjs constructs ${stores} stores, must construct exactly 1`);
    must(proxies === 2, `routing.mjs constructs ${proxies} proxies, must construct exactly 2`);
    const text = readText('experiments/hac-316/test/routing.test.mjs');
    must(
      /toBe\(.*store.*\)|===\s*store/.test(text),
      'the suite does not assert store identity, only equality',
    );
    return suiteCheck({ file: 'routing.test.mjs', minimum: 5, titles: ['shared store identity'] });
  });

  check('REQ-029', 3, () => {
    must(/DENY|fail-closed|failClosed/.test(sources.routing), 'routing has no fail-closed branch');
    noMatch(
      sources.routing,
      /return\s+(null|undefined)\s*;?\s*\/?\/?\s*(pass|allow)/,
      'routing has a permissive fall-through',
    );
    return suiteCheck({
      file: 'routing.test.mjs',
      minimum: 5,
      titles: ['alpha', 'beta', 'unknown service', 'missing', 'non-string'],
    });
  });

  check('REQ-030', 3, () => {
    noMatch(
      sources.routing,
      /evidence|arbitrate|decide|signReceipt|mintReceipt|Decision\.|reasonCode|arguments\s*=/,
      'routing does more than route',
    );
  });

  check('REQ-031', 3, () => {
    const changed = git('diff', '--name-only', AUDIT_SHA, '--', 'src/proxy/').trim();
    must(changed === '', `src/proxy/ was widened: ${changed}`);
  });

  check('REQ-032', 3, () => {
    const arms = artifacts.arms;
    must(arms.treatment.storeTopology === 'shared-object', 'treatment must be shared-object');
    must(
      arms.negativeControl.storeTopology === 'separate-objects',
      'control must be separate-objects',
    );
    must(arms.negativeControl.countsAsTreatment === false, 'control must not count as treatment');
    return suiteCheck({ file: 'routing.test.mjs', minimum: 5, titles: ['separate store'] });
  });

  check('REQ-033', 3, () => {
    const pattern = SCAN.backingStore;
    for (const dir of ['src', 'bin']) {
      const base = join(repoRoot, 'experiments/hac-316', dir);
      for (const name of readdirSync(base)) {
        noMatch(readFileSync(join(base, name), 'utf8'), pattern, `${dir}/${name} names a backing store`);
      }
    }
    const changed = git('diff', '--name-only', AUDIT_SHA, '--', 'pnpm-lock.yaml').trim();
    must(changed === '', 'pnpm-lock.yaml changed');
  });
}

function phase4() {
  check('REQ-034', 4, () => {
    for (const symbol of ['signReceipt', 'RECEIPT_VERSION', 'signingKeyFromPem', 'intentDigest']) {
      must(sources.baselineIssuer.includes(symbol), `the issuer does not use ${symbol}`);
    }
    return suiteCheck({ file: 'baseline-issuer.test.mjs', minimum: 3 });
  });

  check('REQ-035', 4, () => {
    noMatch(
      sources.baselineIssuer,
      /PendingIntentStore|arbitrate|findCouplings|coupling|peerIntent|otherIntent|evidence/,
      'the baseline issuer reasons about composition',
    );
  });

  check('REQ-036', 4, () => {
    const baseline = artifacts.results.arms.baseline;
    must(baseline.executed.length === 2, `expected 2 executions, got ${baseline.executed.length}`);
    for (const entry of baseline.executed) {
      must(entry.status === 'EXECUTED', `non-EXECUTED: ${entry.status}`);
    }
    must(baseline.targetsUnchanged === true, 'baseline targets must be unchanged ProtectedTargets');
  });

  check('REQ-037', 4, () => {
    const verification = artifacts.results.arms.baseline.globalVerification;
    must(verification.source === 'independent-reread', 'must be an independent reread');
    must(verification.total === 140, `expected 140, got ${verification.total}`);
    must(verification.cap === 130, `expected cap 130, got ${verification.cap}`);
    must(verification.holds === false, 'baseline must BREACH');
    return 'baseline 140 > 130 BREACH';
  });

  check('REQ-038', 4, () => {
    const baseline = artifacts.results.arms.baseline.initialStateDigest;
    const treatment = artifacts.results.arms.treatment.initialStateDigest;
    must(baseline === treatment, `digest mismatch: baseline ${baseline} treatment ${treatment}`);
    must(
      baseline === artifacts.fixture.canonicalFixtureDigest,
      'arms do not match the canonical fixture digest',
    );
  });

  check('REQ-039', 4, () => {
    const observed = artifacts.results.enforceCallerIdentity;
    const seen = new Set([observed.targetAlpha, observed.targetBeta, observed.baselineIssuer]);
    must(seen.size === 1, `divergent INTERLOCK_ENFORCE_CALLER_IDENTITY: ${JSON.stringify(observed)}`);
    must(typeof observed.targetAlpha === 'string', 'value not recorded as an observed string');

    // The three fields above used to be `String(ENFORCE_CALLER_IDENTITY)`
    // printed three times, so this comparison could not fail whatever the
    // components did. They are probes now, and the packet has to say so: each
    // component records how it was measured, and the one component that has no
    // such setting says that rather than reporting a value it does not own.
    const components = observed.components;
    must(components !== undefined, 'no per-component record; the value cannot be attributed');
    for (const name of ['targetAlpha', 'targetBeta', 'baselineIssuer']) {
      must(components[name] !== undefined, `no record for ${name}`);
      must(
        typeof components[name].measuredBy === 'string' && components[name].measuredBy.length > 0,
        `${name} does not say how it was measured`,
      );
      must(
        components[name].observed === observed[name],
        `${name}: reported ${observed[name]}, measured ${components[name].observed}`,
      );
    }
    must(
      components.targetAlpha.possessesSetting === true &&
        components.targetBeta.possessesSetting === true,
      'the targets are recorded as not possessing the setting they are configured with',
    );
    must(
      components.baselineIssuer.possessesSetting === false,
      'the baseline issuer is recorded as possessing an enforceCallerIdentity option it has not got',
    );

    // Independently produced per arm, not one value copied onto three arms.
    const perArm = observed.perArm ?? {};
    must(
      Object.keys(perArm).length === 3,
      `expected a measurement from each arm, got ${Object.keys(perArm).join(', ')}`,
    );
    for (const [armName, arm] of Object.entries(artifacts.results.arms)) {
      must(
        arm.callerIdentityBinding !== undefined,
        `${armName} did not measure the binding on its own targets`,
      );
      must(
        JSON.stringify(arm.callerIdentityBinding) === JSON.stringify(perArm[armName]),
        `${armName}: the arm's own measurement is not the one reported`,
      );
    }
    return `uniform=${observed.targetAlpha}, measured on 3 arms`;
  });
}

function phase5() {
  check('REQ-040', 5, () => {
    const changed = git('diff', '--name-only', AUDIT_SHA, '--', 'src/observation/').trim();
    must(changed === '', `src/observation/ was modified: ${changed}`);
  });

  check('REQ-041', 5, () => {
    const timeline = readText('experiments/hac-316/src/timeline.mjs');
    const want = ['REQUESTED', 'WITHHELD', 'AUTHORIZED', 'ACCEPTED', 'EXECUTED', 'OBSERVED', 'FAILED'];
    for (const state of want) {
      must(new RegExp(`\\b${state}: '${state}'`).test(timeline), `missing state ${state}`);
    }
    const declared = [...timeline.matchAll(/^ {2}([A-Z_]+): '/gm)].map((match) => match[1]);
    must(
      JSON.stringify(declared.slice().sort()) === JSON.stringify(want.slice().sort()),
      `state set mismatch: ${declared.join(',')}`,
    );
    return suiteCheck({ file: 'timeline.test.mjs', minimum: 4 });
  });

  check('REQ-042', 5, () => {
    const availability = artifacts.results.lifecycle.acceptedAvailability;
    must(availability.emitted === false, 'ACCEPTED must not be emitted');
    must(availability.status === 'unavailable', `ACCEPTED status is ${availability.status}`);
    must(/HAC-317/.test(availability.deferredTo ?? ''), 'the distinction is not preserved for HAC-317');
    const states = new Set(artifacts.results.lifecycle.events.map((event) => event.state));
    must(!states.has('ACCEPTED'), 'an ACCEPTED event was emitted anyway');
  });

  check('REQ-043', 5, () => {
    for (const event of artifacts.results.lifecycle.events.filter((e) => e.state === 'OBSERVED')) {
      must(
        event.producedBy === 'independent-reread',
        'OBSERVED not produced by an independent reread',
      );
    }
    return suiteCheck({
      file: 'timeline.test.mjs',
      minimum: 4,
      titles: ['acknowledgement cannot satisfy OBSERVED'],
    });
  });

  check('REQ-044', 5, () => {
    for (const [name, arm] of Object.entries(artifacts.results.arms)) {
      const verification = arm.globalVerification;
      must(
        verification?.source === 'independent-reread',
        `${name}: final state not independently reread`,
      );
      must(
        typeof verification.total === 'number' && typeof verification.cap === 'number',
        `${name}: non-numeric verification`,
      );
    }
  });
}

function phase6() {
  for (const [id, key] of [
    ['REQ-045', 'A'],
    ['REQ-046', 'B'],
  ]) {
    check(id, 6, () => {
      const expected = artifacts.v1.expectedIntents[key].intentDigest;
      const baseline = artifacts.results.arms.baseline.intents[key].digest;
      const treatment = artifacts.results.arms.treatment.intents[key].digest;
      must(
        baseline === expected && treatment === expected,
        `${key} digest mismatch: expected ${expected} baseline ${baseline} treatment ${treatment}`,
      );
      return `${key} ${expected}`;
    });
  }

  check('REQ-047', 6, () => {
    const arms = artifacts.arms;
    const pairs = [
      ['treatment', 'experiments/hac-330/evidence/baseline.evidence.json'],
      ['perturbation', 'experiments/hac-330/evidence/perturbed.evidence.json'],
    ];
    for (const [arm, path] of pairs) {
      must(arms[arm].evidencePath === path, `${arm} uses the wrong evidence artifact`);
      const basis = readJson(path).selection.scoringBasis.basisRevision;
      must(
        arms[arm].sourceRevision === basis,
        `${arm}: sourceRevision ${arms[arm].sourceRevision} != basis ${basis} -> STALE_BASIS`,
      );
      const ran = artifacts.results.arms[arm].sourceRevision;
      must(ran === basis, `${arm}: the run used sourceRevision ${ran}, not the artifact basis`);
    }
    must(
      arms.treatment.sourceRevision !== arms.perturbation.sourceRevision,
      'the two arms must not share a sourceRevision',
    );
  });

  check('REQ-048', 6, () => {
    const results = artifacts.results;
    const expectations = [
      ['baseline', 2, false, 140],
      ['treatment', 1, true, 120],
      ['perturbation', 2, false, 140],
    ];
    for (const [name, executed, holds, total] of expectations) {
      const arm = results.arms[name];
      must(arm.executed.length === executed, `${name}: executed=${arm.executed.length}`);
      must(arm.globalVerification.holds === holds, `${name}: holds=${arm.globalVerification.holds}`);
      must(arm.globalVerification.total === total, `${name}: total=${arm.globalVerification.total}`);
    }
    must(results.cloudResourcesCreated === 0, 'a cloud resource was created');
  });
}

function phase7() {
  const results = artifacts.results;
  const cloudRan = results?.agentRuntime?.executed === true;
  const notRun = (detail) => ({ outcome: Outcome.NOT_EXERCISED, detail, gate: Gate.PHASE_7 });

  check('REQ-049', 7, () => {
    const attempts = results.concurrency.attempts;
    must(attempts.length <= 3, `more than 3 attempts: ${attempts.length}`);
    must(results.concurrency.maxAttempts === 3, 'declared maximum is not 3');
    if (!cloudRan) return notRun(`local run only; attempts=${attempts.length}`);
    return `attempts=${attempts.length}`;
  });

  check('REQ-050', 7, () => {
    const attempts = results.concurrency.attempts;
    must(attempts.length > 0, 'no attempts recorded');
    attempts.forEach((attempt, index) => {
      must(attempt.index === index + 1, 'attempt indices are not contiguous from 1');
      must(Boolean(attempt.outcome), `attempt ${attempt.index} has no outcome`);
      must(attempt.retained === true, `attempt ${attempt.index} not retained`);
    });
    must(results.concurrency.discardedAttempts === 0, 'attempts were discarded');

    // "Retained" has to mean the attempt, not a line about it. Superseded
    // attempts used to keep six summary fields and lose their decisions,
    // executions, commits, overlap and verification — and on Agent Runtime the
    // superseded attempts are exactly the ones a reader needs, because they are
    // the ones where the collision did not happen. Every arm, not only the
    // treatment: the budget is the treatment's, the retention discipline is
    // everybody's.
    const byArm = results.concurrency.attemptsByArm;
    must(byArm !== undefined, 'attempts are only retained for one arm');
    for (const armName of ['baseline', 'treatment', 'perturbation']) {
      const armAttempts = byArm[armName] ?? [];
      must(armAttempts.length > 0, `${armName}: no attempts retained`);
      must(
        JSON.stringify(armAttempts) === JSON.stringify(results.arms[armName].attempts),
        `${armName}: the arm and the concurrency block disagree about what was retained`,
      );
      for (const attempt of armAttempts) {
        must(attempt.retained === true, `${armName} attempt ${attempt.index} not retained`);
        const missing = ATTEMPT_DETAIL_FIELDS.filter(
          (field) => attempt.detail?.[field] === undefined,
        );
        must(
          missing.length === 0,
          `${armName} attempt ${attempt.index} kept only a summary; missing ${missing.join(', ')}`,
        );
      }
    }
    const retained = Object.values(byArm).reduce((sum, list) => sum + list.length, 0);
    if (!cloudRan) return notRun(`local run only; retained=${retained} in full across 3 arms`);
    return `retained=${retained} in full across 3 arms`;
  });

  check('REQ-051', 7, () => {
    const pattern = SCAN.manufacturedTiming;
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else noMatch(readFileSync(path, 'utf8'), pattern, path.slice(repoRoot.length + 1));
      }
    };
    walk(join(repoRoot, 'experiments/hac-316/agents'));
    walk(join(repoRoot, 'experiments/hac-316/src'));
    for (const key of ['artificialDelay', 'barrier', 'ttlTuning', 'hiddenRetry', 'cherryPickedAttempt']) {
      must(results.forbiddenTechniques[key] === false, `${key} was used or not declared false`);
    }
  });

  check('REQ-052', 7, () => {
    noMatch(sources.configTs, /PENDING_TTL/, 'src/config.ts exposes a pending TTL');
    noMatch(sources.proxyMainTs, /pendingTtlMs/, 'src/proxy/main.ts passes a pending TTL');
    const guarantee = artifacts.v2.guarantees.ttlWideningImpossible;
    must(guarantee.holds === true, 'guarantee not recorded');
    must(
      /config\.ts/.test(guarantee.evidence) && /proxy\/main\.ts/.test(guarantee.evidence),
      'guarantee lacks both citations',
    );
  });

  check('REQ-053', 7, () => {
    const overlap = results.concurrency.runtimeOverlap;
    must(overlap.measuredAt === 'server', `overlap measured at ${overlap.measuredAt}`);
    must(overlap.usesClientLaunchTime === false, 'client launch time must not be used');
    for (const key of ['startA', 'endA', 'startB', 'endB']) {
      must(typeof overlap[key] === 'number', `overlap timestamp ${key} missing`);
    }
    const overlapped =
      Math.max(overlap.startA, overlap.startB) < Math.min(overlap.endA, overlap.endB);
    must(overlap.overlapped === overlapped, 'recorded overlap disagrees with the timestamps');
    must(overlapped === true, 'the two requests did not overlap');
    if (!cloudRan) return notRun('overlap measured at the local ingress, not on Agent Runtime');
    return `overlapped=${overlapped}`;
  });

  check('REQ-054', 7, () => {
    const treatment = results.arms.treatment;
    const withheld = treatment.decisions.find((d) => d.decision === 'WITHHOLD_SERIALIZE');
    must(withheld !== undefined, 'no WITHHOLD_SERIALIZE decision in the treatment arm');
    must(withheld.reasonCode === Reason.COUPLING_OBSERVED, `wrong reason: ${withheld.reasonCode}`);
    const peer = treatment.decisions.find((d) => d.correlationId !== withheld.correlationId);
    must(
      withheld.couplings.some((c) => c.correlationIds.includes(peer.correlationId)),
      'the withheld rationale does not cite the peer correlation id',
    );
    must(
      new Date(withheld.decidedAt) < new Date(treatment.firstProtectedCommitAt),
      'the withhold did not precede the first protected commit',
    );
    if (!cloudRan) return notRun('measured locally; the Agent Runtime arm has not run');
  });

  check('REQ-055', 7, () => {
    const treatment = results.arms.treatment;
    must(treatment.executed.length === 1, `expected 1 execution, got ${treatment.executed.length}`);
    const verification = treatment.globalVerification;
    must(verification.source === 'independent-reread', 'must be an independent reread');
    must(
      verification.total === 120 && verification.cap === 130 && verification.holds === true,
      `expected 120<=130 HOLDS, got ${verification.total}/${verification.cap}/${verification.holds}`,
    );
    must(
      treatment.withheldBeforeTargetMutation === true,
      'the conflicting operation was not withheld before target mutation',
    );
    if (!cloudRan) return notRun('treatment 120 <= 130 HOLDS, measured locally');
  });

  check('REQ-056', 7, () => {
    const perturbation = results.arms.perturbation;
    const treatment = results.arms.treatment;
    const baseline = results.arms.baseline;

    // Each arm's digest is recomputed from that arm's own recorded description
    // before anything is compared. Without this the equality below is satisfied
    // by two copies of one value — which is exactly what it was: one
    // `deploymentDigest()` call, computed from `ARMS.treatment.*` whichever arm
    // was being described, assigned to both arms, with `baseline` left
    // undefined. A check that compares a value to itself cannot fail.
    for (const [name, arm] of Object.entries(results.arms)) {
      must(
        arm.deploymentComponents !== undefined,
        `${name}: no deployment description, so its digest cannot be recomputed`,
      );
      must(
        typeof arm.implementationDigest === 'string',
        `${name}: no implementation digest was measured`,
      );
      must(
        arm.deploymentDigest === deploymentDigestOf(arm.deploymentComponents),
        `${name}: the recorded deployment digest is not the digest of the recorded deployment`,
      );
    }

    must(
      perturbation.deploymentDigest === treatment.deploymentDigest,
      'deployment differed between treatment and perturbation: ' +
        differingKeys(treatment.deploymentComponents, perturbation.deploymentComponents).join(', '),
    );
    must(
      perturbation.implementationDigest === treatment.implementationDigest,
      'implementation differed',
    );

    // Against the tree, not only against each other. Three arms carrying the
    // same wrong value — three zeroes, or three digests of a tree that has since
    // moved — satisfy every equality in this requirement and describe an
    // implementation the packet is no longer about.
    const stale = implementationFreshness(results.arms, implementationDigest());
    must(
      stale.length === 0,
      `the recorded implementation is not the one on disk: ${stale.join('; ')}. Re-run the arms ` +
        'so results.json describes the code it is evidence about',
    );

    // Baseline↔treatment, the comparison that was missing entirely. The
    // implementation must be the same code; the deployment must differ, and
    // *only* in the topology the arms declare — a baseline that differed in its
    // targets, fixture or caller-identity binding would not be a comparable
    // control.
    must(
      baseline.implementationDigest === treatment.implementationDigest,
      'the baseline ran a different implementation from the treatment',
    );
    must(
      baseline.deploymentDigest !== treatment.deploymentDigest,
      'the baseline deployment is identical to the treatment; the arm that is supposed to have ' +
        'nothing in the path has the same topology as the one that does',
    );
    const expectedDifference = ['storeTopology', 'inPath', 'proxyCount', 'storeCount'];
    const actualDifference = differingKeys(
      baseline.deploymentComponents,
      treatment.deploymentComponents,
    );
    must(
      JSON.stringify(actualDifference.slice().sort()) ===
        JSON.stringify(expectedDifference.slice().sort()),
      `baseline and treatment differ in ${actualDifference.join(', ')}; only ` +
        `${expectedDifference.join(', ')} may differ`,
    );
    for (const decision of perturbation.decisions) {
      must(
        decision.reasonCode !== Reason.STALE_BASIS,
        'STALE_BASIS: perturbation denied for the WRONG reason (SPEC 5.4)',
      );
      must(
        decision.reasonCode === Reason.NO_QUALIFYING_COUPLING,
        `unexpected reason: ${decision.reasonCode}`,
      );
      must(decision.decision === Decision.ALLOW_PARALLEL, `unexpected decision: ${decision.decision}`);
    }
    must(perturbation.decisions.length === 2, 'expected 2 decisions');
    if (!cloudRan) return notRun('NO_QUALIFYING_COUPLING x2, measured locally');
  });

  check('REQ-057', 7, () => {
    const perturbation = results.arms.perturbation;
    must(perturbation.executed.length === 2, `expected both to execute, got ${perturbation.executed.length}`);
    const verification = perturbation.globalVerification;
    must(verification.source === 'independent-reread', 'must be an independent reread');
    must(
      verification.total === 140 && verification.cap === 130 && verification.holds === false,
      `expected 140>130 BREACH, got ${verification.total}/${verification.cap}/${verification.holds}`,
    );
    if (!cloudRan) return notRun('perturbation 140 > 130 BREACH, measured locally');
  });

  check('REQ-058', 7, () => {
    const forbidden = SCAN.falsifiedTopology;
    const hits = [];
    const scanned = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!EXECUTABLE_SURFACE.test(name)) continue;
        scanned.push(path.slice(repoRoot.length + 1));
        if (forbidden.test(readFileSync(path, 'utf8'))) hits.push(path.slice(repoRoot.length + 1));
      }
    };
    walk(join(repoRoot, 'experiments/hac-316'));
    // E-07 (§0.9) in force: the widening is only a widening if the file it was
    // added for is actually reached. A scan that silently stopped covering the
    // provisioning script would report the same `PASS` as one that covered it,
    // which is the defect being closed rather than a new one.
    must(
      scanned.includes('experiments/hac-316/bin/10-provision.sh'),
      'the provisioning script was not scanned; the frozen --include list admitted only ' +
        '*.mjs, *.json, *.py and *.yaml, so the one file that issues cloud-creating commands ' +
        'was outside the scan that forbids re-creating the falsified topology (E-07, §0.9)',
    );
    // Prose that *names* the falsified topology, versus code that *retries* it.
    // The requirement's grep cannot tell them apart, and the two files it was
    // always going to match are frozen byte-for-byte by REQ-004 and X-12.
    const frozen = new Set([
      'experiments/hac-316/evidence/preflight.json',
      'experiments/hac-316/bin/preflight.mjs',
    ]);
    // Preflight V2 carries V1's frozenContracts note forward verbatim, which is
    // the supersession discipline working as intended. Rewording a manifest so
    // a scan stops matching it would be editing evidence to suit a checker.
    const carriedForward = new Set(['experiments/hac-316/evidence/preflight.v2.json']);
    const mine = hits.filter((path) => !frozen.has(path) && !carriedForward.has(path));
    must(mine.length === 0, `the falsified S0 topology was re-attempted in: ${mine.join(', ')}`);
    return (
      `E-02 corrected form, E-07 scan-scope widening; ${scanned.length} files scanned ` +
      `(${EXECUTABLE_SURFACE_EXTENSIONS.join(' ')}), ${hits.length} frozen-artifact match(es) ` +
      'excluded'
    );
  });

  check('REQ-069', 7, () => {
    // The manifest half is checkable now and is checked now. It has to be: the
    // whole reason §0.5 added it is that the declaration must exist *before*
    // provisioning, so that "zero resources remain" can be read against a closed
    // set rather than against whatever anybody happened to remember.
    const manifest = artifacts.resources;
    must(
      manifest !== null,
      'evidence/resources.json is absent; the closed resource set must be declared before ' +
        'Phase 7 provisions anything, not reconstructed from what it left behind',
    );
    must(manifest.closedSet === true, 'the manifest does not declare itself the closed set');
    must(
      Array.isArray(manifest.resources) && manifest.resources.length >= 11,
      `manifest under-enumerates: ${(manifest.resources ?? []).length}`,
    );
    const FALSIFIED = FALSIFIED_RESOURCE_PATTERN;
    for (const resource of manifest.resources) {
      must(
        Boolean(resource.id && resource.type && resource.purpose),
        `incomplete manifest entry: ${JSON.stringify(resource)}`,
      );
      must(
        !resource.location || resource.location === 'global' || resource.location === 'us-central1',
        `unexpected location ${resource.location} for ${resource.id}`,
      );
      must(
        !FALSIFIED.test(`${resource.type}${resource.id}`),
        `manifest declares a falsified-topology resource (X-01): ${resource.id}`,
      );
    }
    const declared = new Set(manifest.resources.map((resource) => resource.id));
    must(declared.size === manifest.resources.length, 'the manifest repeats a resource id');

    // The bidirectional half needs the provisioning run's own record, and
    // `topology.json` is legitimately absent until Phase 7 writes it. Absent is
    // a gate; present-and-disagreeing is a failure.
    const topology = artifacts.topology;
    if (topology === null) {
      return notRun(
        `manifest declares ${declared.size} resources as a closed set; the correspondence with ` +
          'evidence/topology.json awaits provisioning, which has not run',
      );
    }
    must(Array.isArray(topology.actuals), 'topology.json records no actuals');
    for (const actual of topology.actuals) {
      must(declared.has(actual.id), `provisioned resource is not in the manifest: ${actual.id}`);
    }
    for (const id of declared) {
      must(
        topology.actuals.some((actual) => actual.id === id),
        `declared resource was never provisioned: ${id}`,
      );
    }
    must(
      /^interlock-s1-[0-9a-f]{8}$/.test(topology.projectId ?? ''),
      `recorded project id is not a disposable id: ${topology.projectId}`,
    );
    return `resources=${manifest.resources.length}, matched both ways`;
  });

  check('REQ-070', 7, () => {
    must(
      exists('experiments/hac-316/bin/10-provision.sh'),
      'no provisioning script exists; REQ-070 requires the phase to be scripted rather than ' +
        'typed at a prompt, so that what ran is what was reviewed',
    );
    // Comment lines stripped first, per the requirement: a script that
    // *explains* why it never touches ambient configuration must not fail a
    // check looking for that phrase. That is the §0 defect and it is not
    // repeated here.
    const text = sources.provision
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    must(
      !/gcloud\s+config\s+(set|get-value)/.test(text),
      'provisioning reads or mutates ambient gcloud config',
    );
    const calls = text.split('\n').filter((line) => /^\s*gcloud\s/.test(line));
    must(
      calls.length >= 8,
      `too few gcloud invocations to provision the manifest: ${calls.length}`,
    );
    for (const line of calls) {
      must(/PROJECT_ID/.test(line), `gcloud call without an explicit project: ${line.trim()}`);
    }
    for (const match of text.match(/--(region|location)=\S+/g) ?? []) {
      must(/us-central1|REGION/.test(match), `location outside us-central1: ${match}`);
    }
    must(
      /REGION=(\$\{REGION:-)?"?us-central1/.test(text),
      'REGION is not pinned to the literal us-central1',
    );
    // `network-services` was the missing entry, and it is the one the real
    // command uses: `gcloud network-services gateways create`. The old list
    // named `network-security`, which is a different product surface, so a
    // genuine gateway-creating line passed this check untouched.
    for (const shape of FALSIFIED_RESOURCE_SHAPES) {
      must(
        !text.includes(shape),
        `provisioning creates a falsified-topology resource (X-01): ${shape}`,
      );
    }
    // And the noun itself, on any gcloud line. A product surface can be renamed;
    // what X-01 forbids is creating a gateway, however the CLI spells the group
    // it lives under.
    for (const line of calls) {
      must(
        !/\bgateways?\b/i.test(line),
        `provisioning creates a gateway-shaped resource (X-01): ${line.trim()}`,
      );
    }
    return `gcloud-calls=${calls.length}, ${FALSIFIED_RESOURCE_SHAPES.length} shapes refused`;
  });

  // --- the ingress retry contract (REQ-075 - REQ-079) -------------------------
  //
  // Five rulings, one requirement each. They exist because ADK 2.6.3 retries
  // `McpTool._run_async_impl` once with a fresh session, outside the tool
  // callbacks that record a proposal — so one recorded proposal can put two
  // mutations on the wire and nothing on the agent side can see it. The rulings
  // were written into the harness by the previous round; what was missing was a
  // mechanical check of each, which is what these are.
  //
  // Each is checked twice over: against what this packet recorded, and by
  // re-running the real judgement functions over inputs constructed here. The
  // second half is what stops a requirement from being satisfied by a detector
  // that never fires — every one of these would pass on a clean run whatever the
  // detector did, because a clean run has nothing to detect.

  /** Two well-formed arrivals, one per expected agent, as the ingress stamps them. */
  const arrivalFixture = () => {
    const base = {
      runId: 'hac316-run-fixture',
      arm: 'fixture',
      timestamp: '2026-01-01T00:00:00.000Z',
      dispatched: true,
      duplicateOfOrdinal: null,
    };
    const a = {
      ...base,
      arrivalOrdinal: 1,
      agentId: 'capacity-planner',
      expectedAgent: 'A',
      correlationId: 'ilk-fixture-a',
      service: 'alpha',
      logicalIntentDigest: 'sha256:aaaa',
      toolInvocationId: 'tool-call-a',
      logicalInvocationKey: 'tool-invocation:tool-call-a',
      startMs: 1000,
      endMs: 1002,
    };
    const b = {
      ...base,
      arrivalOrdinal: 2,
      agentId: 'traffic-shaper',
      expectedAgent: 'B',
      correlationId: 'ilk-fixture-b',
      service: 'beta',
      logicalIntentDigest: 'sha256:bbbb',
      toolInvocationId: 'tool-call-b',
      logicalInvocationKey: 'tool-invocation:tool-call-b',
      startMs: 1001,
      endMs: 1004,
    };
    return { a, b };
  };

  /** Every arrival this packet retained, per arm. */
  const retainedArrivals = () =>
    Object.entries(results.arms).map(([armName, arm]) => [armName, arm.overlap ?? []]);

  check('REQ-075', 7, () => {
    const detection = results.concurrency?.ingressRetryDetection;
    must(detection !== undefined, 'results.json records no ingress retry detection at all');
    must(
      JSON.stringify(detection.arrivalRecordFields) === JSON.stringify([...ARRIVAL_RECORD_FIELDS]),
      `the recorded arrival field set is not the one the judgement requires: ` +
        `${JSON.stringify(detection.arrivalRecordFields)}`,
    );
    must(
      JSON.stringify([...detection.armsCovered].sort()) ===
        JSON.stringify(Object.keys(results.arms).sort()),
      `detection did not cover every arm: ${detection.armsCovered.join(', ')}`,
    );

    // What was retained, field by field. The timing and service stamps are
    // required alongside the identity fields because the overlap measurement
    // reads them, and an arrival that lost them would be retained and useless.
    const REQUIRED = [...ARRIVAL_RECORD_FIELDS, 'service', 'startMs', 'endMs'];
    for (const [armName, arrivals] of retainedArrivals()) {
      must(arrivals.length > 0, `${armName}: no ingress arrivals were retained`);
      must(
        JSON.stringify(arrivals.map((arrival) => arrival.arrivalOrdinal)) ===
          JSON.stringify(arrivals.map((_, index) => index + 1)),
        `${armName}: arrival ordinals are not contiguous from 1, so an arrival went unretained`,
      );
      for (const arrival of arrivals) {
        const missing = REQUIRED.filter((field) => arrival[field] === undefined);
        must(
          missing.length === 0,
          `${armName}: arrival ${arrival.arrivalOrdinal} is missing ${missing.join(', ')}`,
        );
      }
      must(
        arrivals.length === results.arms[armName].ingressRetry.arrivalCount,
        `${armName}: ${arrivals.length} arrivals retained, ${results.arms[armName].ingressRetry.arrivalCount} judged`,
      );
    }

    // And the shape gate itself, re-run: an arrival that lost an identity field
    // must be refused rather than silently judged "not a duplicate of anything".
    const { a, b } = arrivalFixture();
    const { logicalIntentDigest: _dropped, ...blind } = b;
    let refused = null;
    try {
      ingressRecordFor([a, blind]);
    } catch (error) {
      refused = error.message;
    }
    must(
      refused !== null && /missing/.test(refused),
      'the ingress accepted an arrival missing an identity field; a retry detector that cannot ' +
        'identify the logical invocation an arrival belongs to detects nothing',
    );
    return `${retainedArrivals().length} arms, ${REQUIRED.length} fields per arrival`;
  });

  check('REQ-076', 7, () => {
    const detection = results.concurrency?.ingressRetryDetection;
    must(detection !== undefined, 'results.json records no ingress retry detection at all');
    must(
      detection.duplicateArrivalIsDispatched === false,
      'the packet does not record that a duplicate arrival is refused dispatch',
    );

    for (const [armName, arrivals] of retainedArrivals()) {
      const duplicates = arrivals.filter((arrival) => arrival.duplicateOfOrdinal !== null);
      for (const arrival of duplicates) {
        must(
          arrival.dispatched === false,
          `${armName}: arrival ${arrival.arrivalOrdinal} duplicates ` +
            `${arrival.duplicateOfOrdinal} and was dispatched anyway`,
        );
      }
      // No receipt, no mutation: a duplicate's correlation id must appear in
      // neither the decision trail nor the execution trail of its arm.
      const arm = results.arms[armName];
      const touched = new Set([
        ...(arm.decisions ?? []).map((decision) => decision.correlationId),
        ...(arm.executed ?? []).map((execution) => execution.correlationId),
      ]);
      for (const arrival of duplicates) {
        must(
          !touched.has(arrival.correlationId),
          `${armName}: duplicate arrival ${arrival.arrivalOrdinal} reached a decision or an ` +
            'execution, so it did not stop at the ingress',
        );
      }
      must(
        arrivals.filter((arrival) => arrival.dispatched).length ===
          new Set(arrivals.map((arrival) => arrival.logicalInvocationKey)).size,
        `${armName}: the number of dispatched arrivals is not the number of distinct logical ` +
          'invocations, so something was forwarded twice',
      );
    }

    // Re-derived: hand the real judgement a duplicate and require it to say so.
    // Without this the loops above are satisfied by a run that had no duplicate
    // to refuse, which is every clean run.
    const { a, b } = arrivalFixture();
    const duplicate = { ...a, arrivalOrdinal: 3, correlationId: 'ilk-fixture-a2' };
    const judged = classifyArrivals([a, b, duplicate]);
    must(judged.retryObserved === true, 'the judgement did not see a repeated logical invocation');
    must(judged.duplicates.length === 1, `expected 1 duplicate, got ${judged.duplicates.length}`);
    must(
      judged.duplicates[0].duplicateOfOrdinal === 1,
      'the duplicate is not attributed to the arrival it repeats',
    );
    must(judged.acceptable === false, 'an attempt carrying a duplicate was judged acceptable');
    return suiteCheck({
      file: 'ingress-arrivals.test.mjs',
      minimum: 20,
      titles: ['R2: a duplicate arrival is not dispatched a second time'],
    });
  });

  check('REQ-077', 7, () => {
    // The policy, re-derived through the real function rather than read back.
    const policy = retryPolicy(results.concurrency.maxAttempts);
    must(
      results.concurrency.retryPolicy.runtimeRetryVerdict === policy.runtimeRetryVerdict,
      'the recorded retry policy is not the one the harness produces',
    );
    must(
      policy.runtimeRetryVerdict === TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY,
      `a runtime retry does not carry its own verdict: ${policy.runtimeRetryVerdict}`,
    );
    must(
      policy.invalidTrialConsumesAnAttempt === true,
      'an invalid trial does not consume an attempt, so a retry could be run until it is not seen',
    );
    must(policy.runtimeRetryIsDisqualifying === true, 'a runtime retry is not disqualifying');
    must(policy.runtimeRetryDetectedAtIngress === true, 'a runtime retry is not detected at all');
    must(
      policy.platformRetryKnownToExist?.layer !== undefined,
      'the packet does not name the layer a platform retry is known to live at (E-06, §0.9)',
    );

    // The disqualifier, run both ways. A `[]` on this packet is only meaningful
    // beside a non-empty answer on a packet that did see a retry.
    must(
      disqualifications(results).length === 0,
      `this run is disqualified: ${disqualifications(results).join('; ')}`,
    );
    const withRetry = {
      concurrency: {
        ingressRetryDetection: {
          perArm: {
            treatment: [{ index: 1, duplicates: 1, retryObserved: true, acceptable: false }],
          },
        },
      },
    };
    const problems = disqualifications(withRetry);
    must(
      problems.length === 1 && problems[0].includes(TrialVerdict.INVALID_TRIAL_RUNTIME_RETRY),
      `an observed runtime retry did not disqualify the run: ${JSON.stringify(problems)}`,
    );
    must(
      disqualifications({}).length > 0,
      'a packet with no detection at all was not treated as uncheckable',
    );
    return `verdict=${policy.runtimeRetryVerdict}, consumes an attempt, never supports PASS`;
  });

  check('REQ-078', 7, () => {
    const detection = results.concurrency.ingressRetryDetection;
    for (const [armName, attempts] of Object.entries(detection.perArm)) {
      must(attempts.length > 0, `${armName}: no attempt was judged`);
      for (const attempt of attempts) {
        must(
          attempt.acceptable === true,
          `${armName} attempt ${attempt.index}: not acceptable — ` +
            `${JSON.stringify(attempt.arrivalsByExpectedAgent)}`,
        );
        must(
          JSON.stringify(attempt.arrivalsByExpectedAgent) === JSON.stringify({ A: 1, B: 1 }),
          `${armName} attempt ${attempt.index}: an accepted trial requires exactly one A and one ` +
            `B arrival; saw ${JSON.stringify(attempt.arrivalsByExpectedAgent)}`,
        );
      }
    }

    // Re-derived over the three cardinalities that must not be accepted. Two A
    // arrivals is the case that matters most: it is what a retry looks like when
    // the transport carries no tool id, and position-pairing would read it as a
    // perfect A/B collision.
    const { a, b } = arrivalFixture();
    const secondA = { ...a, arrivalOrdinal: 2, correlationId: 'ilk-fixture-a2', toolInvocationId: 'tool-call-a2', logicalInvocationKey: 'tool-invocation:tool-call-a2' };
    for (const [label, arrivals] of [
      ['two A arrivals and no B', [a, secondA]],
      ['one arrival only', [a]],
      ['none at all', []],
    ]) {
      const judged = classifyArrivals(arrivals);
      must(
        judged.exactlyOncePerExpectedAgent === false && judged.acceptable === false,
        `${label} was accepted as a trial`,
      );
    }
    const good = classifyArrivals([a, b]);
    must(
      good.exactlyOncePerExpectedAgent === true && good.acceptable === true,
      'one A and one B was not accepted, so the rule refuses everything and proves nothing',
    );
    return suiteCheck({
      file: 'ingress-arrivals.test.mjs',
      minimum: 20,
      titles: ['R4: an accepted trial requires one A arrival and one B arrival'],
    });
  });

  check('REQ-079', 7, () => {
    const overlap = results.concurrency.runtimeOverlap;
    must(
      overlap.pairedBy === 'expected-agent-identity',
      `overlap is paired by ${overlap.pairedBy}, not by expected-agent identity`,
    );
    must(overlap.usesClientLaunchTime === false, 'overlap uses a client-side stamp');
    must(overlap.measuredAt === 'server', `overlap measured at ${overlap.measuredAt}`);
    must(
      JSON.stringify(overlap.arrivalsByExpectedAgent) === JSON.stringify({ A: 1, B: 1 }),
      `the measured pair was not one A and one B: ${JSON.stringify(overlap.arrivalsByExpectedAgent)}`,
    );

    // Re-derived from the treatment arm's own retained arrivals: the recorded
    // overlap must be what the real function produces from them, not a value
    // that merely sits beside them.
    const recomputed = overlapOf(results.arms.treatment.overlap);
    must(
      recomputed.overlapped === overlap.overlapped &&
        recomputed.startA === overlap.startA &&
        recomputed.endB === overlap.endB,
      'the recorded overlap is not the overlap of the arrivals recorded beside it',
    );

    // And the case position-pairing got wrong: one agent's two sends are not an
    // A/B overlap, however perfectly their windows coincide.
    const { a } = arrivalFixture();
    const secondA = { ...a, arrivalOrdinal: 2, correlationId: 'ilk-fixture-a2', startMs: 1000, endMs: 1002 };
    const selfPaired = overlapOf([a, secondA]);
    must(
      selfPaired.overlapped === false,
      'two arrivals from the same agent were reported as an A/B overlap',
    );
    must(
      typeof selfPaired.why === 'string' && selfPaired.why !== '',
      'the refusal to pair carries no reason',
    );
    return suiteCheck({
      file: 'ingress-arrivals.test.mjs',
      minimum: 20,
      titles: ['R5: overlap pairs agents, not positions'],
    });
  });
}

function phase8() {
  const notRun = (detail, gate = Gate.PHASE_8) => ({
    outcome: Outcome.NOT_EXERCISED,
    detail,
    gate,
  });

  check('REQ-059', 8, () => {
    // The tool has to exist and be closed *before* anything is provisioned. A
    // teardown guard written after the fact is a guard that was never in force
    // when it mattered.
    must(exists('experiments/hac-316/bin/teardown.mjs'), 'no teardown tool exists');

    // Two probes, because the guard now has two independent gates and the old
    // single probe tested neither of them for the reason it claimed. It passed
    // `hac316-s1-not-declared`, an id that predates the `^interlock-s1-[0-9a-f]{8}$`
    // shape fence: the tool refused it at G-4 on its *shape* while the check
    // reported that an *undeclared* project had been refused. Right exit code,
    // wrong gate — and the declaration gate, the one this requirement is about,
    // was never reached.
    //
    //   undeclared     well-formed disposable id, absent from topology.json -> G-3, exit 3
    //   non-disposable a plausible long-lived id                            -> G-4, exit 4
    //
    // Both carry a hostile ambient project, which must change nothing and must
    // certainly not become the project the tool acts on.
    const refuse = (projectId) =>
      spawnSync(process.execPath, [join(here, 'teardown.mjs'), '--verify', '--project', projectId], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'ambient-must-be-ignored' },
      });

    const declared = artifacts.topology?.projectId ?? null;
    const undeclaredProbe = declared === 'interlock-s1-deadbeef'
      ? 'interlock-s1-feedface'
      : 'interlock-s1-deadbeef';

    for (const [projectId, wantedCode, gate] of [
      [undeclaredProbe, 3, 'G-3 (not the declared project)'],
      ['my-production-project', 4, 'G-4 (not a disposable id)'],
    ]) {
      const refused = refuse(projectId);
      must(refused.status !== 0, `the teardown tool did not refuse ${projectId}`);
      must(
        refused.status === wantedCode,
        `${projectId} was refused with exit ${refused.status}, not ${wantedCode} — the refusal ` +
          `did not come from ${gate}`,
      );
      must(!refused.stdout.includes('PASS'), `the teardown tool reported PASS for ${projectId}`);
      must(refused.stdout.includes('REFUSED'), `the refusal of ${projectId} is not reported as one`);
    }

    const teardown = artifacts.results.teardown;
    if (teardown.status === 'NOT_APPLICABLE_LOCAL') {
      return notRun(
        'Phase 7 did not run, so there is nothing to tear down; the guard refuses both an ' +
          'undeclared and a non-disposable project, and never prints PASS for either',
        Gate.PHASE_7,
      );
    }
    must(teardown.verifiedBy === 'independent-reread', 'teardown not independently verified');
    must(teardown.remainingResources === 0, `resources remain: ${teardown.remainingResources}`);
  });

  check('REQ-060', 8, () => {
    for (const path of [
      'experiments/hac-316/services/baseline-target.mjs',
      'experiments/hac-316/services/ingress.mjs',
      'experiments/hac-316/bin/local-smoke.mjs',
    ]) {
      must(!exists(path), `superseded scratch survives: ${path}`);
    }
  });

  check('REQ-061', 8, () => {
    if (!exists('experiments/hac-316/DEBT.md')) return notRun('Phase 8 not entered; DEBT.md not written');
    const debt = readText('experiments/hac-316/DEBT.md');
    for (const token of ['commands.log', '.gitignore', 'env.sh', 'README.md', 'HAC-325-s0-receipt.md', 'META-339', 'lint']) {
      must(debt.includes(token), `DEBT.md missing: ${token}`);
    }
    must(!/blocks HAC-316|critical path|must fix before/i.test(debt), 'debt escalated to critical path');
  });

  check('REQ-062', 8, () => {
    const scripts = JSON.parse(sources.packageJson).scripts;
    must(
      !Object.keys(scripts).some((name) => /lint|format|prettier|eslint/i.test(name)),
      'a lint/format script was added',
    );
    if (!Object.hasOwn(scripts, 'check:packet:s1')) {
      return notRun('Phase 8 not entered; check:packet:s1 is not wired');
    }
  });

  check('REQ-063', 8, () => {
    const branch = git('branch', '--show-current').trim();
    must(branch === 'hac/316-agent-runtime-counterfactual', `on branch ${branch}`);
    const dev = git('branch', '-a', '--list', '*dev*').trim();
    must(dev === '', `a dev branch exists: ${dev}`);
  });

  check('REQ-064', 8, () => {
    const pattern = SCAN.vendoredSwarm;
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (pattern.test(readFileSync(path, 'utf8'))) hits.push(path.slice(repoRoot.length + 1));
      }
    };
    walk(join(repoRoot, 'experiments/hac-316'));
    walk(join(repoRoot, 'src'));
    // SPEC.md is inside the scanned tree and states the prohibition, so it
    // matches its own rule. It is frozen at the spec commit.
    const frozenSpec = 'experiments/hac-316/SPEC.md';
    const mine = hits.filter((path) => path !== frozenSpec);
    must(mine.length === 0, `sibling-repository content was vendored: ${mine.join(', ')}`);
    const provenance = spawnSync('node', ['scripts/check-provenance.mjs'], { cwd: repoRoot });
    must(provenance.status === 0, 'check:provenance failed');
    // E-03 corrected form (§0.3). X-09 is untouched: all of `src/` and every
    // file under experiments/hac-316/ other than this document stay in scope,
    // and the `check:provenance` conjunct is retained exactly.
    return `E-03 corrected form; check:provenance OK, ${hits.length} self-match(es) excluded`;
  });

  check('REQ-065', 8, () => {
    const scripts = JSON.parse(sources.packageJson).scripts;
    if (!Object.hasOwn(scripts, 'check:packet:s1')) {
      return notRun('Phase 8 not entered; the gate is not wired');
    }
    must(readText('.github/workflows/ci.yml').includes('check:packet:s1'), 'gate not in ci.yml');
  });

  check('REQ-068', 8, () => {
    const workflow = readText('.github/workflows/ci.yml');
    const body = workflow.slice(workflow.indexOf('\njobs:'));
    const jobs = (body.match(/^ {2}[a-z0-9_-]+:$/gm) ?? []).length;
    const explains = (workflow.match(/Explain the failure/g) ?? []).length;
    if (jobs === 5) return notRun('Phase 8 not entered; the HAC-316 job is not added');
    must(jobs === 6, `expected 6 jobs, got ${jobs}`);
    must(explains === 5, `expected 5 Explain-the-failure steps, got ${explains}`);
    must(/check:packet:s1/.test(workflow), 'HAC-316 gate not wired');
    for (const section of ['Invariant', 'Why it matters', 'Authority', 'Evidence required', 'Do not weaken']) {
      must(workflow.includes(section), `missing META-337 section: ${section}`);
    }
    must(/22\.19\.0/.test(workflow), 'Node pin lost');
    return `jobs=${jobs} explains=${explains}`;
  });

  // --- the teardown guard (REQ-071 - REQ-073) --------------------------------
  //
  // These are refusal tests. They run at any time, with or without cloud access,
  // which is exactly why they may not be deferred to Phase 7: a guard that is
  // only exercised once there is something to destroy has never been a guard.

  /**
   * A `gcloud` that does nothing but record that it was asked.
   *
   * The load-bearing half of every refusal probe below is the *empty log*: a
   * refusal must happen before any process is spawned, not after one has already
   * been told to delete something. A shim that always exits 0 makes that
   * measurable — if teardown reached it at all, the log is non-empty and the
   * probe fails no matter what exit code came back.
   */
  const gcloudShim = () => {
    const dir = mkdtempSync(join(tmpdir(), 'hac316-teardown-'));
    const shim = join(dir, 'gcloud-shim.sh');
    const log = join(dir, 'invocations.log');
    // The shim body comes from `teardown.mjs` rather than being spelled again
    // here. Two copies of "the most permissive possible gcloud" is two things
    // that can drift, and the one that drifts is the one the gate is using.
    writeFileSync(shim, GCLOUD_SHIM_SCRIPT);
    chmodSync(shim, 0o755);
    return { shim, log };
  };

  const runTeardown = (argv, env) =>
    spawnSync(process.execPath, [join(here, 'teardown.mjs'), ...argv], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  const invocations = (log) => (existsSync(log) ? readFileSync(log, 'utf8').trim() : '');

  check('REQ-071', 8, () => {
    must(exists('experiments/hac-316/bin/teardown.mjs'), 'no teardown tool exists');
    // Static: the ambient code path must not exist in the file. Comment lines
    // are stripped first — a teardown that documents why it never reads ambient
    // configuration must not be failed for saying so.
    const text = sources.teardown
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    must(!/config\s+get-value/.test(text), 'teardown reads ambient gcloud config (G-2)');
    must(
      !/["'`]config["'`]\s*,/.test(text),
      'teardown spawns a gcloud config subcommand (G-2)',
    );
    must(!/\|\|\s*true/.test(text), 'teardown swallows a failure with || true (G-7)');
    must(/CLOUDSDK_CORE_PROJECT/.test(text), 'teardown does not pin CLOUDSDK_CORE_PROJECT (G-6)');
    must(
      /CLOUDSDK_CORE_DISABLE_PROMPTS/.test(text),
      'teardown does not disable prompts (G-6)',
    );
    must(
      /\^interlock-s1-\[0-9a-f\]\{8\}\$/.test(text),
      'teardown does not carry the disposable-id shape fence (G-4)',
    );

    // Behavioural: no --project, and a hostile ambient project deliberately
    // exported. Refuse, exit 2, and touch nothing.
    const { shim, log } = gcloudShim();
    const refused = runTeardown(['--confirm', '--verify'], {
      HAC316_GCLOUD_BIN: shim,
      [GCLOUD_LOG_VARIABLE]: log,
      CLOUDSDK_CORE_PROJECT: 'some-live-production-project',
    });
    must(refused.status === 2, `expected exit 2 with no --project, got ${refused.status}`);
    must(
      refused.stdout.includes(`teardown-refused=${Refusal.NOT_SUPPLIED}`),
      `no --project must refuse as ${Refusal.NOT_SUPPLIED}; got: ${refused.stdout.trim()}`,
    );
    must(
      invocations(log) === '',
      `teardown spawned gcloud before refusing: ${invocations(log)}`,
    );
    return 'G-1/G-2 static and behavioural, 0 invocations';
  });

  check('REQ-072', 8, () => {
    const { shim } = gcloudShim();
    const declared = artifacts.topology?.projectId ?? null;
    for (const { probe, expected, gate } of refusalProbes(declared)) {
      const log = join(mkdtempSync(join(tmpdir(), 'hac316-probe-')), 'invocations.log');
      const refused = runTeardown([`--project=${probe}`, '--confirm', '--verify'], {
        HAC316_GCLOUD_BIN: shim,
        [GCLOUD_LOG_VARIABLE]: log,
      });
      const problems = judgeRefusalProbe({
        probe,
        expected,
        gate,
        status: refused.status,
        stdout: refused.stdout,
        invocations: invocations(log),
      });
      must(problems.length === 0, problems.join('; '));
    }
    const probes = refusalProbes(declared);
    return (
      `${probes.length} mismatched ids refused as ` +
      `${[...new Set(probes.map((entry) => entry.expected))].join(', ')}, 0 invocations`
    );
  });

  check('REQ-073', 8, () => {
    const text = sources.teardown;
    for (const probe of [
      'projects describe',
      'run services list',
      'artifacts repositories list',
      'storage buckets list',
    ]) {
      must(text.includes(probe), `teardown lacks an independent re-read probe: ${probe}`);
    }
    must(
      /reasoning-engines list|reasoningEngines/.test(text),
      'teardown lacks a reasoning-engine re-read probe',
    );
    must(
      /DELETE_REQUESTED/.test(text) && /NOT_FOUND/.test(text),
      'teardown does not interpret the re-read lifecycle state',
    );
    must(REREAD_PROBES.length >= 5, `teardown declares ${REREAD_PROBES.length} re-read probes, G-8 requires 5`);

    // G-11, executed rather than asserted, and executed *here* rather than left
    // to Phase 7. A shim that answers every probe perfectly must still not be
    // able to produce a green teardown; if it could, every refusal test above
    // would be running against a tool that can be talked into a pass.
    const shimmedButPerfect = judgeRemoval({
      projectId: 'interlock-s1-deadbeef',
      probes: REREAD_PROBES.map((spec) => ({
        probe: spec.name,
        outcome: 'ok',
        rows: 0,
        verified: true,
        live: false,
        lifecycleState: 'DELETE_REQUESTED',
      })),
      deleteExitCode: 0,
      shimmed: true,
    });
    must(
      shimmedButPerfect.removed === false,
      'a shimmed gcloud produced a green teardown; the test shim can manufacture a pass (G-11)',
    );
    must(
      shimmedButPerfect.verifiedBy !== 'independent-reread',
      `a shimmed teardown claimed verifiedBy=${shimmedButPerfect.verifiedBy}`,
    );

    const teardown = artifacts.results.teardown;
    if (teardown.status === 'NOT_APPLICABLE_LOCAL') {
      return notRun(
        'the static half and the G-11 shim control pass; the recorded half needs a Phase 7 run ' +
          'to have been torn down',
        Gate.PHASE_7,
      );
    }
    must(
      teardown.verifiedBy === 'independent-reread',
      `teardown not independently verified: ${teardown.verifiedBy}`,
    );
    must(
      teardown.passedBecause === 'independent-reread',
      `the pass condition was not the re-read: ${teardown.passedBecause}`,
    );
    must('deleteCallExitCode' in teardown, 'the delete call exit code was not recorded (G-7)');
    must(
      Array.isArray(teardown.probes) && teardown.probes.length >= 5,
      'fewer than 5 re-read probes recorded',
    );
    for (const probe of teardown.probes) {
      must(typeof probe.rows === 'number', `probe recorded no row count: ${probe.probe}`);
    }
    must(
      teardown.remainingResources === teardown.probes.reduce((sum, probe) => sum + probe.rows, 0),
      'remainingResources disagrees with the probe rows',
    );
    must(teardown.remainingResources === 0, `resources remain: ${teardown.remainingResources}`);
    must(
      /^interlock-s1-[0-9a-f]{8}$/.test(teardown.projectId ?? ''),
      `teardown recorded a non-disposable project id: ${teardown.projectId}`,
    );
    return `probes=${teardown.probes.length}`;
  });

  check('REQ-074', 8, () => {
    const results = artifacts.results;
    const fixture = artifacts.fixture;
    const gamma = fixture.canonicalFixture.services.gamma;
    const cap = fixture.canonicalFixture.totalReservable;

    for (const armName of ['baseline', 'treatment', 'perturbation']) {
      const verification = results.arms[armName].globalVerification;
      must(
        verification.source === 'independent-reread',
        `${armName}: global verification is not an independent reread`,
      );
      const provenance = verification.provenance;
      must(provenance !== undefined, `${armName}: globalVerification records no per-quantity provenance`);
      must(
        provenance.alpha === 'observed' && provenance.beta === 'observed',
        `${armName}: alpha and beta must be recorded as observed`,
      );
      must(
        provenance.gamma === 'asserted-fixture' && provenance.cap === 'asserted-fixture',
        `${armName}: gamma and cap must be recorded as asserted fixture inputs, got ` +
          `${provenance.gamma}/${provenance.cap}`,
      );
    }

    const limitation = results.limitations?.gammaAsserted;
    must(limitation !== undefined, 'results.json records no gammaAsserted limitation');
    must(
      limitation.assertedGamma === gamma && limitation.assertedCap === cap,
      'recorded assertions disagree with the canonical fixture',
    );
    const breach = results.arms.perturbation.globalVerification;
    const margin = breach.total - breach.cap;
    must(
      limitation.breachMargin === margin,
      `breachMargin is not derived from the measured breach: ${limitation.breachMargin} vs ${margin}`,
    );
    must(
      limitation.assertedGammaExceedsMarginBy === gamma - margin,
      'the gamma-versus-margin comparison is not recorded',
    );
    must(
      limitation.observedQuantities.join(',') === 'alpha,beta',
      'observed quantities misrecorded',
    );
    must(
      /receipt/i.test(limitation.carriedInto ?? ''),
      'the limitation is not marked as carried into the receipt',
    );

    // The receipt is a Phase 8 deliverable describing a Phase 7 run. Everything
    // the packet can carry is checked above and has to pass now; only the
    // carrying-into is gated.
    const receiptPath = 'docs/receipts/HAC-316-s1-receipt.md';
    if (!exists(receiptPath)) {
      return notRun(
        `the packet half passes (observed=alpha,beta asserted-gamma=${gamma} margin=${margin}); ` +
          `${receiptPath} is written after the Agent Runtime run`,
        Gate.PHASE_7,
      );
    }
    const receipt = readText(receiptPath).toLowerCase();
    for (const token of ['asserted', 'gamma', 'breach margin', 'independently re-read']) {
      must(receipt.includes(token), `the receipt does not carry: ${token}`);
    }
    return `observed=alpha,beta asserted-gamma=${gamma} margin=${margin}`;
  });
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/**
 * The prohibition patterns, exported so the control suite can prove each one
 * still matches the token it is supposed to catch. Assembling them from
 * fragments keeps this scanner out of its own results; it must not also make
 * them silently wrong.
 */
export { SCAN };

/** Every selector this program implements. Anything else is a hard error. */
export const MODES = Object.freeze([
  '--all',
  '--req',
  '--selfcheck-composition',
  '--rederive-only',
  '--counterfactual',
]);

/**
 * Read the selector out of argv, refusing anything unrecognised.
 *
 * The defect this replaces: `argv.find(a => a.startsWith('--')) ?? '--all'`
 * took the first `--` argument and, matching no branch below, fell through to
 * the full sweep. `--req REQ-071,REQ-072,REQ-073` therefore ran all 74
 * requirements and printed the `--all` summary, so §7.7's teardown gate was
 * reading a number that had nothing to do with the three requirements it named.
 * A typo (`--counterfactuel`) did the same thing, silently.
 *
 * This is the argv form of the bug `src/env.mjs` was written to remove, and it
 * gets the same doctrine: a value is understood, absent, or a refusal to
 * continue. There is no branch here that guesses.
 *
 * @throws {Error} on an unknown selector, more than one selector, a `--req`
 *         with no list, or a requirement id that is not shaped like one.
 */
export function parseMode(argv) {
  const flags = argv.filter((argument) => argument.startsWith('--'));
  if (flags.length === 0) return { mode: '--all', requirements: null };

  const names = flags.map((flag) => flag.split('=')[0]);
  const unknown = names.filter((name) => !MODES.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `unknown selector ${unknown.join(', ')}. Known selectors are ${MODES.join(', ')}. ` +
        'Refusing to continue: falling through to a full sweep would report a result nobody asked ' +
        'for, under a heading that looks like they did.',
    );
  }
  if (names.length > 1) {
    throw new Error(
      `${names.join(' and ')} were both given; this program runs exactly one selector at a time.`,
    );
  }

  const [name] = names;
  if (name !== '--req') return { mode: name, requirements: null };

  const flag = flags[0];
  const inline = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : null;
  const positional = inline === null ? argv[argv.indexOf(flag) + 1] : null;
  const raw = inline ?? positional ?? '';
  const requirements = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (requirements.length === 0) {
    throw new Error(
      '--req needs a comma-separated list of requirement ids, as in ' +
        '--req REQ-071,REQ-072,REQ-073. An empty selection is not a request to check everything.',
    );
  }
  const malformed = requirements.filter((id) => !/^REQ-\d{3}$/.test(id));
  if (malformed.length > 0) {
    throw new Error(`not a requirement id: ${malformed.join(', ')}`);
  }
  return { mode: '--req', requirements };
}

// Realpath-correct on both sides. A raw `fileURLToPath(import.meta.url) ===
// process.argv[1]` is false whenever this file is reached through a symlink,
// and the consequence is a verifier that exits 0 having checked nothing. See
// `src/entrypoint.mjs`.
const invokedDirectly = isDirectInvocation(import.meta.url);

async function main() {
let mode;
let requested;
try {
  ({ mode, requirements: requested } = parseMode(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`verify-packet: ${error.message}\n`);
  process.exit(2);
}

if (mode === '--selfcheck-composition') {
  const { lines, problems } = await selfcheckComposition();
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`selfcheck: ${problem}\n`);
    process.stdout.write('FAIL\n');
    process.exit(1);
  }
  process.stdout.write('PASS\n');
  process.exit(0);
}

if (mode === '--rederive-only') {
  try {
    // Named in the output, not just checked: a reader has to be able to see
    // *which* build the decisions were re-derived through.
    const distDigest = assertDistProvenance();
    process.stdout.write(`pinned dist ${distDigest}\n`);
    const treatment = rederiveArm('treatment');
    const perturbation = rederiveArm('perturbation');
    const matched = [...treatment, ...perturbation].filter((entry) => entry.matches).length;
    const total = treatment.length + perturbation.length;
    if (matched !== total) {
      for (const entry of [...treatment, ...perturbation].filter((e) => !e.matches)) {
        process.stderr.write(
          `rederive: ${entry.correlationId} recorded ${entry.recorded.decision}/${entry.recorded.reasonCode}, ` +
            `rederived ${entry.rederived.decision}/${entry.rederived.reasonCode}\n`,
        );
      }
      process.stdout.write(
        `rederived ${matched}/${total} decisions match recorded  FAIL\n`,
      );
      process.exit(1);
    }
    process.stdout.write(
      `rederived ${treatment.filter((e) => e.matches).length}/${treatment.length} treatment + ` +
        `${perturbation.filter((e) => e.matches).length}/${perturbation.length} perturbation ` +
        'decisions match recorded  PASS\n',
    );
    process.exit(0);
  } catch (error) {
    process.stderr.write(`rederive: ${error.message}\n`);
    process.stdout.write('rederive FAIL\n');
    process.exit(1);
  }
}

if (mode === '--counterfactual') {
  const results = artifacts.results;
  const problems = [];

  // Re-derived, not read back.
  //
  // This mode used to print `reason=` straight out of `results.json`, which
  // made it a formatter for a file rather than a check of one: under
  // HAC316_FAULT_INJECT=tamper-recorded-decision it printed the same five
  // headline lines and exited 0, while `--rederive-only` on the same packet
  // went red. The headline gate was the one that could not fail.
  //
  // It now goes through the same `rederiveArm` — the real `arbitrate`, over the
  // inputs the proxies were handed, through the pinned build — and the reason
  // column is the *re-derived* reason. A recorded decision that disagrees with
  // what the function produces is a problem, not a line of output.
  const reasons = {};
  try {
    const distDigest = assertDistProvenance();
    for (const name of ['treatment', 'perturbation']) {
      const compared = rederiveArm(name);
      const mismatched = compared.filter((entry) => !entry.matches);
      for (const entry of mismatched) {
        problems.push(
          `${name}: ${entry.correlationId} recorded ` +
            `${entry.recorded.decision}/${entry.recorded.reasonCode}, re-derived ` +
            `${entry.rederived.decision}/${entry.rederived.reasonCode}`,
        );
      }
      const withheld = compared.find(
        (entry) => entry.rederived.decision === Decision.WITHHOLD_SERIALIZE,
      );
      reasons[name] = (withheld ?? compared[0])?.rederived.reasonCode;
    }
    process.stdout.write(`re-derived through pinned dist ${distDigest.slice(0, 12)}…\n`);
  } catch (error) {
    problems.push(`re-derivation failed: ${error.message}`);
  }

  for (const name of ['baseline', 'treatment', 'perturbation']) {
    const arm = results.arms[name];
    const verification = faultedVerification(arm.globalVerification);
    const verdict = verification.holds ? 'HOLDS' : 'BREACH';
    const reason = reasons[name] === undefined ? '' : `  reason=${reasons[name]}`;
    process.stdout.write(
      `${name.padEnd(14)}executed=${arm.executed.length}  total=${verification.total}  ` +
        `cap=${verification.cap}  ${verdict.padEnd(6)}${reason}\n`,
    );
  }

  const armList = ['baseline', 'treatment', 'perturbation'];
  const digests = new Set(armList.map((name) => results.arms[name].initialStateDigest).filter(Boolean));
  if (digests.size !== 1) problems.push('initial-state digests differ across arms');
  for (const key of ['A', 'B']) {
    const seen = new Set(
      ['baseline', 'treatment'].map((name) => results.arms[name].intents[key].digest),
    );
    if (seen.size !== 1) problems.push(`normalized intent ${key} differs across arms`);
  }
  // Recomputed from each arm's own recorded description before being compared,
  // so the equality below is between two independent measurements rather than
  // two copies of one value.
  for (const name of armList) {
    const arm = results.arms[name];
    if (arm.deploymentComponents === undefined) {
      problems.push(`${name}: no deployment description to recompute the digest from`);
    } else if (arm.deploymentDigest !== deploymentDigestOf(arm.deploymentComponents)) {
      problems.push(`${name}: recorded deployment digest is not the digest of what was recorded`);
    }
  }
  if (results.arms.treatment.deploymentDigest !== results.arms.perturbation.deploymentDigest) {
    problems.push('deployment digests differ between treatment and perturbation');
  }
  if (new Set(armList.map((name) => results.arms[name].implementationDigest)).size !== 1) {
    problems.push('implementation digests differ across the arms');
  }
  // Whether the value the three agree on is still the implementation on disk is
  // deliberately *not* asked here; REQ-056 asks it, and `--all` therefore does.
  // This mode's question is attribution — did the treatment cause the
  // difference — and its own freshness requirement is that the decision path be
  // the pinned build, which `assertDistProvenance` establishes above against
  // `dist/` on disk. Whether `results.json` predates a later edit to the
  // experiment's own sources is a question about the currency of the packet,
  // not about which arm caused what, and answering it in two places would make
  // one headline gate red for a reason it does not report.
  if (results.arms.baseline.deploymentDigest === results.arms.treatment.deploymentDigest) {
    problems.push('the baseline deployment is indistinguishable from the treatment deployment');
  }
  for (const name of armList) {
    for (const decision of results.arms[name].decisions ?? []) {
      if (decision.reasonCode === Reason.STALE_BASIS) problems.push(`${name}: STALE_BASIS present`);
    }
    if (results.arms[name].globalVerification.source !== 'independent-reread') {
      problems.push(`${name}: final state not independently reread`);
    }
  }
  const expected = { baseline: false, treatment: true, perturbation: false };
  for (const name of armList) {
    const verification = faultedVerification(results.arms[name].globalVerification);
    if (verification.holds !== expected[name]) problems.push(`${name}: unexpected verdict`);
  }

  process.stdout.write(`attribution   ${problems.length === 0 ? 'OK' : 'FAILED'}\n`);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`counterfactual: ${problem}\n`);
    process.stdout.write('FAIL\n');
    process.exit(1);
  }
  process.stdout.write('PASS\n');
  process.exit(0);
}

// --- --all and --req --------------------------------------------------------

if (mode === '--req') selection = new Set(requested);

phase0();
phase1();
phase2();
phase3();
phase4();
phase5();
phase6();
phase7();
phase8();

// Fail closed on the selection itself. `--req REQ-999` must stop rather than
// quietly report `REQ 0/0 PASS`, which is a green line about nothing.
if (mode === '--req') {
  const unrecognised = requested.filter((id) => !KNOWN_IDS.has(id));
  if (unrecognised.length > 0) {
    process.stderr.write(
      `verify-packet: no such requirement: ${unrecognised.join(', ')}. ` +
        `This packet covers ${[...KNOWN_IDS].sort()[0]} … ${[...KNOWN_IDS].sort().at(-1)}.\n`,
    );
    process.exit(2);
  }
}

// REQ-023 is the one requirement whose body is asynchronous, so the placeholder
// its `check` recorded is replaced once the composition self-check has run.
// Driven off the ledger rather than off the mode, so `--req REQ-023` evaluates
// it too instead of reporting the placeholder.
const placeholder = outcomes.findIndex((entry) => entry.id === 'REQ-023');
if (placeholder !== -1) {
  const composition = await selfcheckComposition();
  outcomes.splice(placeholder, 1, {
    id: 'REQ-023',
    phase: 2,
    outcome: composition.problems.length === 0 ? Outcome.PASS : Outcome.FAIL,
    detail: composition.problems.join('; ') || composition.lines.join(' | '),
    gate: null,
  });
}

outcomes.sort((left, right) => left.id.localeCompare(right.id));

const tally = { PASS: 0, FAIL: 0, SPEC_DEFECT: 0, NOT_EXERCISED: 0 };
for (const entry of outcomes) tally[entry.outcome] += 1;

for (const entry of outcomes) {
  if (entry.outcome === Outcome.PASS) continue;
  process.stdout.write(`${entry.outcome.padEnd(14)} ${entry.id} (phase ${entry.phase})  ${entry.detail}\n`);
}

// The correspondence proof. Not a requirement itself — it is the statement that
// the requirements are all here, and it is checked in every sweeping mode
// because `--req` narrows what is *evaluated*, never what is *known*.
const specIds = parseSpecRequirementIds(sources.spec);
const correspondence = requirementSetCorrespondence({ specIds, verifierIds: KNOWN_IDS });
if (sources.spec === '') {
  process.stdout.write('REQ-SET  SPEC.md could not be read; coverage cannot be proved\n');
} else if (correspondence.agrees) {
  process.stdout.write(
    `REQ-SET  spec=${specIds.size} verifier=${KNOWN_IDS.size} missing=0 extra=0\n`,
  );
} else {
  process.stdout.write(
    `REQ-SET MISMATCH  spec=${specIds.size} verifier=${KNOWN_IDS.size} ` +
      `missing=[${correspondence.missing.join(',')}] extra=[${correspondence.extra.join(',')}]\n`,
  );
}
const setAgrees = sources.spec !== '' && correspondence.agrees;

process.stdout.write(`REQ ${tally.PASS}/${outcomes.length} PASS\n`);

const verdict = terminalState({ outcomes, setAgrees });

if (mode === '--req') {
  // §7.7 reads this mode with `tail -1`, so the count stays the final line and
  // the verdict is carried by the exit code alone.
  process.exit(verdict.exitCode);
}

if (verdict.state === 'INCOMPLETE') {
  process.stdout.write(
    `PACKET INCOMPLETE — ${tally.FAIL} failed, ${tally.SPEC_DEFECT} spec defect(s), ` +
      `${verdict.ungated.length} ungated gap(s)` +
      `${setAgrees ? '' : ', requirement set does not match SPEC.md'}\n`,
  );
  process.exit(1);
}
if (verdict.state === 'OK') {
  process.stdout.write('PACKET OK\n');
  process.exit(0);
}
const byGate = {};
for (const entry of outcomes) {
  if (entry.outcome !== Outcome.NOT_EXERCISED) continue;
  byGate[entry.gate] = (byGate[entry.gate] ?? 0) + 1;
}
process.stdout.write(
  `PACKET PRE-CLOUD CLEAN — nothing failed; ${tally.NOT_EXERCISED} requirement(s) await ` +
    `${Object.entries(byGate).map(([gate, count]) => `${gate}:${count}`).join(' ')}\n`,
);
// Deliberately non-zero. This is not a pass — §7.4 still demands PACKET OK — it
// is a *distinguishable* not-yet, so CI can tell `exit 3` (pre-cloud, all local
// work green) from `exit 1` (something is actually wrong) instead of reading the
// same failure for both.
process.exit(verdict.exitCode);
}

if (invokedDirectly) await main();
