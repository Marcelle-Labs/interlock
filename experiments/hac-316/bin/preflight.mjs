#!/usr/bin/env node
/**
 * HAC-316 preflight — everything predeclared before a single cloud resource exists.
 *
 * This file is committed *before* the experiment runs, and that ordering is the
 * whole point. The concurrency question HAC-316 turns on is one where it would be
 * trivially easy to look at the result first and then decide what counts as
 * success. Freezing the criteria in a commit that predates the run removes that
 * option: the git history shows the bar was set before the outcome was known.
 *
 * Nothing here is typed by hand that can be derived. The intent digests, the
 * initial-state digest and the evidence identity are all computed from the
 * frozen S2 modules and the committed HAC-330 artifact, so the manifest cannot
 * drift from the code it claims to describe.
 *
 * Run:  node experiments/hac-316/bin/preflight.mjs   (after `pnpm run build`)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');
const dist = join(repoRoot, 'dist');

const load = async (relative) => {
  try {
    return await import(join(dist, relative));
  } catch (error) {
    throw new Error(`cannot load ${relative} from dist/. Run "pnpm run build" first.\n  ${error.message}`);
  }
};

const { canonicalDigest } = await load('authorization/canonical.js');
const { intentDigest } = await load('authorization/intent.js');
const { genesisRevision } = await load('broker/revision/revision.js');
const { INITIAL_STATE, OPERATION_SET_RESERVATION, asCanonical, reservationPath } =
  await load('target/state.js');
const { CORRELATION_HEADER, RECEIPT_HEADER } = await load('correlation.js');
const { RECEIPT_VERSION } = await load('authorization/receipt.js');

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

/**
 * Whether the *source* tree is clean.
 *
 * This experiment's own evidence directory is excluded, and the exclusion is
 * narrow on purpose. The guard exists to stop a manifest being declared from
 * drifted source, which cannot be recounted. It is not supposed to trip on the
 * artifact it is in the middle of writing — which is exactly what it did on the
 * first run, refusing to re-run because its own previous output was untracked.
 */
function sourceIsClean() {
  const dirty = git('status', '--porcelain')
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => !line.slice(3).startsWith('experiments/hac-316/evidence'));
  return { clean: dirty.length === 0, paths: dirty };
}

const evidencePath = join(repoRoot, 'experiments', 'hac-330', 'evidence', 'baseline.evidence.json');
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

/**
 * The two intents, carried over verbatim from the S-1 fixture.
 *
 * HAC-316 forbids inventing a different coupling because it is easier to
 * demonstrate in ADK. These are the same two mutations HAC-330 proved compose
 * into an invalid joint state, against the same fixture, and the coupling
 * between their target paths is the one the pinned miner actually observed.
 */
const EXPECTED_INTENTS = {
  A: {
    agent: 'capacity-planner',
    summary: "raise alpha's reservation from 40 to 60 for the reindex window",
    intent: { operation: OPERATION_SET_RESERVATION, arguments: { service: 'alpha', reserved: 60 } },
    evidencePath: reservationPath('alpha'),
  },
  B: {
    agent: 'traffic-shaper',
    summary: "raise beta's reservation from 40 to 60 for the backfill window",
    intent: { operation: OPERATION_SET_RESERVATION, arguments: { service: 'beta', reserved: 60 } },
    evidencePath: reservationPath('beta'),
  },
};

const totalIfBoth = 60 + 60 + INITIAL_STATE.services.gamma;

const coupling = evidence.selection.pairs.find(
  (pair) =>
    pair.files.includes(EXPECTED_INTENTS.A.evidencePath) &&
    pair.files.includes(EXPECTED_INTENTS.B.evidencePath),
);

const manifest = {
  experiment: 'HAC-316',
  title: 'S1 end-to-end collision proof on real Agent Runtime',
  declaredAt: 'committed before any cloud resource was created; see git history',
  sourceRevision: git('rev-parse', 'HEAD'),
  sourceClean: sourceIsClean().clean,

  toolchain: {
    node: process.version,
    python: '3.12.12',
    'google-adk': '2.6.3',
    mcp: '1.29.0',
    vertexai: '1.164.0',
    note:
      'google-adk 2.6.3 requires mcp>=1.24,<2. A bare `pip install mcp` resolves to 2.0.0 and ' +
      'breaks the import with ModuleNotFoundError: mcp.shared.session. Install `google-adk[mcp]`. ' +
      'The documented import path google.adk.tools.mcp_tool.McpToolset also fails on this version; ' +
      'the working path is google.adk.tools.mcp_tool.mcp_toolset.',
  },

  // --- What is under test, and what is deliberately not -------------------
  frozenContracts: {
    source: 'docs/architecture/enforcement-topology.md (frozen by HAC-326)',
    receiptVersion: RECEIPT_VERSION,
    correlationHeader: CORRELATION_HEADER,
    receiptHeader: RECEIPT_HEADER,
    operation: OPERATION_SET_RESERVATION,
    callerDecisionContract: 'ALLOW | DENY',
    note:
      'HAC-316 reuses these unchanged. It does not introduce a second enforcement path, and it ' +
      'does not retry the AGENT_TO_ANYWHERE / CONTENT_AUTHZ topology HAC-325 falsified.',
  },

  // --- The fixture, identical across both arms ----------------------------
  fixture: {
    initialState: asCanonical(INITIAL_STATE),
    initialStateDigest: canonicalDigest(asCanonical(INITIAL_STATE)),
    genesisRevisionProtectedTarget: genesisRevision('interlock-s1-target', asCanonical(INITIAL_STATE)),
    genesisRevisionBaselineTarget: genesisRevision('interlock-s1-baseline', asCanonical(INITIAL_STATE)),
    invariant: 'sum(services[].reserved) <= totalReservable',
    note:
      'The two targets take different targetIds on purpose — a receipt minted for one must not ' +
      'validate against the other — so their genesis revisions differ by construction. The STATE ' +
      'is identical, which is what parity requires; initialStateDigest is the field that must match.',
  },

  // --- The intents, derived not typed -------------------------------------
  expectedIntents: Object.fromEntries(
    Object.entries(EXPECTED_INTENTS).map(([id, spec]) => [
      id,
      {
        agent: spec.agent,
        summary: spec.summary,
        intent: spec.intent,
        intentDigest: intentDigest(spec.intent),
        evidencePath: spec.evidencePath,
        validAlone: `${spec.intent.arguments.reserved} + others = ${
          spec.intent.arguments.reserved + 40 + INITIAL_STATE.services.gamma
        } <= ${INITIAL_STATE.totalReservable}`,
      },
    ]),
  ),

  counterfactual: {
    claim: 'each intent is valid alone; their composition is not',
    totalIfBothApplied: totalIfBoth,
    totalReservable: INITIAL_STATE.totalReservable,
    compositionBreachesInvariant: totalIfBoth > INITIAL_STATE.totalReservable,
  },

  // --- The evidence the decision reads ------------------------------------
  couplingEvidence: {
    artifact: 'experiments/hac-330/evidence/baseline.evidence.json',
    artifactSha256: evidence.artifact.sha256,
    basisRevision: evidence.selection.scoringBasis.basisRevision,
    producer: `${evidence.producer.package}@${evidence.producer.version}`,
    producerSha: evidence.producer.observedSha,
    observedCoupling: coupling ?? null,
    note:
      'Consumed verbatim from the pinned upstream miner via HAC-330. Not re-derived here, not ' +
      'hand-authored, and not replaced with a coupling that would be easier to demonstrate.',
  },

  // --- PREDECLARED PASS CRITERIA — frozen before the run ------------------
  predeclared: {
    runtimeOverlap: {
      formula: 'max(tool_start_A, tool_start_B) < min(tool_end_A, tool_end_B)',
      measuredAt:
        'the neutral ingress, which is on both arms identically and is the only component that ' +
        'sees both agents. Client launch time is NOT used to infer concurrency.',
    },
    interlockOverlap: {
      criterion:
        'both pending intents are registered before the first protected-target commit, evidenced ' +
        "mechanically by the denied intent's rationale citing the other intent's correlation id " +
        'with reasonCode COUPLING_OBSERVED',
      rationale:
        'That denial is only reachable when both intents were simultaneously present in the ' +
        'pending-intent store. If both are ALLOWed, they did not overlap in the Interlock window, ' +
        'and that is reported as a negative result rather than reinterpreted.',
    },
    trialValidity: {
      rule:
        'digest(A,baseline) == digest(A,treatment) == expectedIntents.A.intentDigest AND ' +
        'digest(B,baseline) == digest(B,treatment) == expectedIntents.B.intentDigest',
      onViolation: 'MODEL_FAILURE / INVALID_TRIAL — never counted as composition evidence',
    },
    concurrencyAttempts: {
      maximum: 3,
      retention: 'every attempt is retained and reported, valid or not; no silent retries',
      onExhaustion: "invoke HAC-316's kill/pivot clause; do not manufacture the collision",
    },
    allowed: [
      'concurrent harness dispatch of both agent invocations',
      'identical warm-up of both runtime resources before measurement',
      'separate sessions per agent',
      'ordinary Agent Runtime concurrency configuration',
    ],
    forbidden: [
      'sleeps inserted into either agent to manufacture overlap',
      'a barrier inside the Interlock proxy',
      'artificial delay at either target',
      'widening the pending-intent TTL until overlap appears',
      'cherry-picking an undisclosed successful attempt',
    ],
  },

  // --- Arm routing, immutable per arm -------------------------------------
  routing: {
    mechanism:
      'A neutral experiment ingress holds one active run_id -> arm binding, set out of band by ' +
      'the harness before each arm. Requests carry no arm selector, so the MCP body — and ' +
      'therefore the intent digest — is byte-identical across arms.',
    arms: {
      baseline: 'ingress -> baseline target (mutation core only, no Interlock in the path)',
      treatment: 'ingress -> frozen S2 proxy -> protected target (receipt validated) -> mutation core',
    },
    ingressConstraints: [
      'no Interlock decision logic',
      'no receipt issuance',
      'no argument transformation',
      'no coupling logic',
      'JSON-RPC body forwarded byte-for-byte; only a run/trace header is added',
      'unknown or unset run binding fails closed',
    ],
  },

  truthModel: {
    states: ['REQUESTED', 'WITHHELD', 'AUTHORIZED', 'ACCEPTED', 'EXECUTED', 'OBSERVED', 'FAILED'],
    rule: 'An MCP or HTTP acknowledgement is never OBSERVED. Only an independent re-read produces OBSERVED.',
  },

  outOfScope: [
    'the HAC-317 production broker',
    'restart recovery (HAC-327)',
    'fleet-scale corpus (HAC-319)',
    'Studio/UI (HAC-320)',
    'generalising the experiment ingress into product infrastructure',
    'promoting any experimental field into WorkspaceJSON Standard',
  ],
};

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(join(evidenceDir, 'preflight.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Fail loudly if the fixture no longer supports the experiment at all.
const problems = [];
if (!manifest.counterfactual.compositionBreachesInvariant) {
  problems.push('the two intents no longer compose into an invariant breach');
}
if (coupling === undefined) {
  problems.push('the committed evidence carries no coupling between the two intents target paths');
}
if (!manifest.sourceClean) {
  problems.push(
    `source tree is dirty (${sourceIsClean().paths.join(', ')}); ` +
      'a preflight declared from drifted source cannot be recounted',
  );
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`preflight: ${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `preflight declared at ${manifest.sourceRevision}\n` +
      `  A ${manifest.expectedIntents.A.intentDigest}\n` +
      `  B ${manifest.expectedIntents.B.intentDigest}\n` +
      `  coupling support ${coupling.support} at basis ${manifest.couplingEvidence.basisRevision}\n` +
      `  composition breaches invariant: ${totalIfBoth} > ${INITIAL_STATE.totalReservable}\n`,
  );
}
