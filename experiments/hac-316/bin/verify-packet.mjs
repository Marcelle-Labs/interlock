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
 *   node experiments/hac-316/bin/verify-packet.mjs --selfcheck-composition
 *   node experiments/hac-316/bin/verify-packet.mjs --rederive-only
 *   node experiments/hac-316/bin/verify-packet.mjs --counterfactual
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { intentDigest } from '../../../dist/authorization/intent.js';
import { Decision, Reason, arbitrate } from '../../../dist/broker/pairing/arbitrate.js';
import { asCanonical, INITIAL_STATE } from '../../../dist/target/state.js';
import { genesisRevision } from '../../../dist/broker/revision/revision.js';

import { ATTEMPT_DETAIL_FIELDS, deploymentDigestOf, runComposition } from './run-arm.mjs';
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
const FAULTS = Object.freeze(['invert-composition', 'stub-reread', 'tamper-recorded-decision']);

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
  /** The requirement's own verification command cannot be satisfied as written. */
  SPEC_DEFECT: 'SPEC_DEFECT',
  /** Belongs to a phase this run did not enter. */
  NOT_EXERCISED: 'NOT_EXERCISED',
};

const outcomes = [];
const record = (id, phase, outcome, detail) => {
  outcomes.push({ id, phase, outcome, detail });
};

/** Evaluate one requirement; a throw is a failure with the message attached. */
function check(id, phase, body) {
  try {
    const result = body();
    if (result === undefined || result === true) return record(id, phase, Outcome.PASS, '');
    if (typeof result === 'string') return record(id, phase, Outcome.PASS, result);
    return record(id, phase, result.outcome, result.detail);
  } catch (error) {
    return record(id, phase, Outcome.FAIL, error.message);
  }
}

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
 * The functions whose loaded source text is bound to `pins.json`.
 *
 * These are the very bindings this file imported, not paths re-read from disk:
 * the point is to bind what will actually be *called*.
 */
const PINNED_SYMBOLS = { arbitrate, asCanonical, genesisRevision, intentDigest };

/**
 * Assert that `dist/` is the build the packet was pinned to.
 *
 * Re-derivation is only meaningful against the frozen decision path. A stale or
 * hand-edited `dist/` would let this program report "re-derived and it matches"
 * about a function nobody pinned, so every mode that re-derives calls this
 * first.
 */
function assertDistProvenance() {
  const measured = measureBuildProvenance({ repoRoot, symbols: PINNED_SYMBOLS });
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

    const agentsDir = join(repoRoot, 'experiments/hac-316/agents');
    const referenced = new Set();
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === '__pycache__') continue;
          walk(path);
          continue;
        }
        if (!name.endsWith('.py')) continue;
        for (const match of readFileSync(path, 'utf8').matchAll(
          /google\.adk\.tools\.mcp_tool[.a-zA-Z_]*/g,
        )) {
          referenced.add(match[0]);
        }
      }
    };
    walk(agentsDir);

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

    if (referenced.size !== 1) {
      return {
        outcome: Outcome.SPEC_DEFECT,
        detail:
          "the requirement's cross-check counts distinct google.adk.tools.mcp_tool paths in the " +
          'agents and expects exactly 1. On google-adk 2.6.3 the two symbols the agents construct ' +
          'live in two modules — McpToolset is defined in mcp_toolset, ' +
          'StreamableHTTPConnectionParams in mcp_session_manager (mcp_toolset only re-exports it) ' +
          `— so the literal command cannot pass. Referenced: ${[...referenced].sort().join(', ')}. ` +
          'Substantively PASS: both paths are mechanically captured in toolchain.json by ' +
          'importing them in the interpreter the agents run on, every referenced path is ' +
          'captured, and every captured path is referenced. Importing the connection params from ' +
          'mcp_toolset instead would collapse the count to 1 by relying on a re-export rather ' +
          'than on the module that defines the class.',
      };
    }
    return [...capturedPaths].join(', ');
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
    const WRITTEN = ['preflight.v2.json', 'fixture.json'];
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
    const implementation = hits.filter((path) => !path.endsWith('SPEC.md') && !path.endsWith('verify-packet.mjs'));
    must(implementation.length === 0, `local invariants are switched off in: ${implementation.join(', ')}`);
    if (hits.length > 0) {
      return {
        outcome: Outcome.SPEC_DEFECT,
        detail:
          `the requirement's own grep scans experiments/hac-316/ including SPEC.md, which quotes ` +
          `the pattern at line 1057, so the literal command cannot pass. Self-matches: ` +
          `${hits.join(', ')}. Substantively PASS: no implementation file switches a local ` +
          'invariant off.',
      };
    }
    return undefined;
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
  const notRun = (detail) => ({ outcome: Outcome.NOT_EXERCISED, detail });

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
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(mjs|json|py|yaml)$/.test(name)) continue;
        if (forbidden.test(readFileSync(path, 'utf8'))) hits.push(path.slice(repoRoot.length + 1));
      }
    };
    walk(join(repoRoot, 'experiments/hac-316'));
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
    if (hits.length > 0) {
      return {
        outcome: Outcome.SPEC_DEFECT,
        detail:
          "the requirement's grep covers experiments/hac-316/**/*.{mjs,json,py,yaml}, which " +
          'includes Preflight V1 and its producer. Both name the falsified topology in prose and ' +
          'both are frozen byte-for-byte, so the literal command could not pass at the audit SHA ' +
          `either. Matches: ${hits.join(', ')}. Substantively PASS: no HAC-316 code, config or ` +
          'agent re-attempts that topology; every match is prose recording that it was falsified.',
      };
    }
    return undefined;
  });
}

function phase8() {
  const notRun = (detail) => ({ outcome: Outcome.NOT_EXERCISED, detail });

  check('REQ-059', 8, () => {
    // The tool has to exist and be closed *before* anything is provisioned. A
    // teardown guard written after the fact is a guard that was never in force
    // when it mattered.
    must(exists('experiments/hac-316/bin/teardown.mjs'), 'no teardown tool exists');
    const refused = spawnSync(
      process.execPath,
      [join(here, 'teardown.mjs'), '--verify', '--project', 'hac316-s1-not-declared'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        // Ambient project set on purpose: it must change nothing, and it must
        // certainly not become the project the tool acts on.
        env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'ambient-must-be-ignored' },
      },
    );
    must(refused.status !== 0, 'the teardown tool did not refuse an undeclared project');
    must(!refused.stdout.includes('PASS'), 'the teardown tool reported PASS with nothing declared');
    must(refused.stdout.includes('REFUSED'), 'the refusal is not reported as one');

    const teardown = artifacts.results.teardown;
    if (teardown.status === 'NOT_APPLICABLE_LOCAL') {
      return notRun(
        'Phase 7 did not run, so there is nothing to tear down; the guard refuses an undeclared ' +
          'project and never prints PASS for one',
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
    if (hits.includes(frozenSpec)) {
      return {
        outcome: Outcome.SPEC_DEFECT,
        detail:
          "the requirement's grep scans experiments/hac-316/, which contains SPEC.md — and SPEC.md " +
          'states the prohibition (X-09) and quotes the pattern in the command itself, so it ' +
          'matches. Frozen at the spec commit, so the literal command could not pass there ' +
          'either. Substantively PASS: nothing was vendored and check:provenance passes.',
      };
    }
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

// Realpath-correct on both sides. A raw `fileURLToPath(import.meta.url) ===
// process.argv[1]` is false whenever this file is reached through a symlink,
// and the consequence is a verifier that exits 0 having checked nothing. See
// `src/entrypoint.mjs`.
const invokedDirectly = isDirectInvocation(import.meta.url);

async function main() {
const mode = process.argv.slice(2).find((argument) => argument.startsWith('--')) ?? '--all';

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

// --- --all ------------------------------------------------------------------

phase0();
phase1();
phase2();
phase3();
phase4();
phase5();
phase6();
phase7();
phase8();

const composition = await selfcheckComposition();
outcomes.splice(
  outcomes.findIndex((entry) => entry.id === 'REQ-023'),
  1,
  {
    id: 'REQ-023',
    phase: 2,
    outcome: composition.problems.length === 0 ? Outcome.PASS : Outcome.FAIL,
    detail: composition.problems.join('; ') || composition.lines.join(' | '),
  },
);

outcomes.sort((left, right) => left.id.localeCompare(right.id));

const tally = { PASS: 0, FAIL: 0, SPEC_DEFECT: 0, NOT_EXERCISED: 0 };
for (const entry of outcomes) tally[entry.outcome] += 1;

for (const entry of outcomes) {
  if (entry.outcome === Outcome.PASS) continue;
  process.stdout.write(`${entry.outcome.padEnd(14)} ${entry.id} (phase ${entry.phase})  ${entry.detail}\n`);
}

process.stdout.write(`REQ ${tally.PASS}/${outcomes.length} PASS\n`);
if (tally.FAIL === 0 && tally.SPEC_DEFECT === 0 && tally.NOT_EXERCISED === 0) {
  process.stdout.write('PACKET OK\n');
  process.exit(0);
}
process.stdout.write(
  `PACKET INCOMPLETE — ${tally.FAIL} failed, ${tally.SPEC_DEFECT} spec defect(s), ` +
    `${tally.NOT_EXERCISED} not yet exercised\n`,
);
process.exit(1);
}

if (invokedDirectly) await main();
