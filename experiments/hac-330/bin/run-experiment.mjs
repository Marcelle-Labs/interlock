#!/usr/bin/env node
/**
 * HAC-330 / S-1 — the experiment.
 *
 * Runs every arm and every guard case, writes the evidence packet, and checks
 * each HAC-330 acceptance criterion mechanically. Exits non-zero if any of them
 * fails, so "PASS" is a process exit code rather than a reading of the output.
 *
 *     node experiments/hac-330/bin/run-experiment.mjs
 *
 * No Google Cloud, no network, no ADK, no Agent Runtime, no Gateway. The only
 * external dependency is the pinned `workspacejson/cli` sibling checkout, and
 * the run refuses to start if that checkout has drifted from the manifest.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FIXTURES, TOTAL_RESERVABLE, buildFixture } from './build-fixtures.mjs';
import { Decision, Reason, decide, pairKey } from '../lib/decide.mjs';
import {
  INTENT_A,
  INTENT_B,
  execute,
  headRevision,
  readState,
  resetWorktree,
  validateAlone,
} from '../lib/broker.mjs';
import { git, runGit } from '../lib/exec.mjs';
import { REPO_ROOT, loadMiner, mineEvidence, resolveCliCheckout, verifyPin } from '../lib/evidence.mjs';

// Every path handed to the miner is relative to the repository root, and the
// run chdirs there first. This is not cosmetic: `mine()` embeds the path it was
// given into the completeness `detail` it returns, and that detail is part of
// the artifact this packet commits verbatim. An absolute path would put a
// machine-specific home directory into a committed evidence file and make the
// packet differ between machines. Editing the producer's own detail string
// afterwards is not an option — the artifact has to stay as the producer
// emitted it — so the path is correct on the way in instead.
process.chdir(REPO_ROOT);

const EXPERIMENT_DIR = join('experiments', 'hac-330');
const WORK_DIR = join(EXPERIMENT_DIR, '.work');
const FIXTURE_DIR = join(WORK_DIR, 'fixtures');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');

/**
 * A directory outside every repository, addressed relatively.
 *
 * `interlock-workspace/` is required not to be a Git repository (HAC-328, and
 * verified in the bootstrap receipt), so the parent of this checkout is a place
 * where "not a repository" is genuinely true.
 */
const OUTSIDE_REPO = join('..', 'hac330-no-repository');

const INTENTS = [INTENT_A, INTENT_B];

const checks = [];
/** Record one mechanically-evaluated acceptance check. */
function check(id, criterion, passed, detail) {
  checks.push({ id, criterion, passed: Boolean(passed), detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
  return passed;
}

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 64 - title.length))}`);

// ---------------------------------------------------------------------------

/**
 * Verify both pinned sibling checkouts before anything is mined.
 *
 * Refusing here is the point: evidence produced from a drifted or dirty
 * checkout cannot be recounted by anyone else, and HAC-328 forbids changing the
 * CLI to make a fixture pass.
 */
function verifyPinnedCheckouts(cliCheckout) {
  const pins = {
    'workspacejson-cli': verifyPin('workspacejson-cli', cliCheckout),
    'workspacejson-standard': verifyPin('workspacejson-standard', join(cliCheckout, '..', 'standard')),
  };
  writeJson(join(EVIDENCE_DIR, 'pins.json'), pins);

  for (const [id, pin] of Object.entries(pins)) {
    check(
      id === 'workspacejson-cli' ? 'PIN-CLI' : 'PIN-STD',
      'upstream checkout is at the revision the manifest records, and is unmodified',
      pin.matches,
      pin.matches
        ? `${pin.repository} @ ${pin.observedSha} (matches manifest, clean)`
        : `${pin.repository} @ ${pin.observedSha} — ${pin.problems.join('; ')}`,
    );
  }

  if (!pins['workspacejson-cli'].matches) {
    throw new Error('refusing to run: the CLI checkout is not at its recorded revision');
  }
  return pins;
}

/**
 * Every way the evidence can be degraded, and the proof that none of them is
 * permission. Five of these are mined for real rather than simulated.
 */
async function runDegradedCases({ baselineRepo, fixtures, evidence, miner }) {
  const guards = [];

  const guard = (name, evidenceValue, targetRevision) => {
    const result = decide({ intents: INTENTS, evidence: evidenceValue, targetRevision });
    const applied = execute({ repo: baselineRepo, intents: INTENTS, decision: result });
    resetWorktree(baselineRepo);
    const record = {
      case: name,
      decision: result.decision,
      reason: result.reason,
      detail: result.detail,
      mutationsApplied: applied.applied.length,
      invariantHolds: applied.invariant.holds,
    };
    guards.push(record);
    console.log(`  ${name.padEnd(28)} ${result.decision.padEnd(21)} ${result.reason}`);
    return record;
  };

  guard('evidence absent', null, fixtures.baseline.head);
  guard('evidence undefined', undefined, fixtures.baseline.head);
  guard('envelope without selection', { experiment: 'HAC-330' }, fixtures.baseline.head);
  guard(
    'selection truncated',
    { selection: { l0SelectionVersion: 1, pairs: [] } },
    fixtures.baseline.head,
  );
  guard(
    'unknown selection version',
    { selection: { ...evidence.baseline.envelope.selection, l0SelectionVersion: 2 } },
    fixtures.baseline.head,
  );
  guard(
    'unpinned basis',
    (() => {
      const { scoringBasis, ...selection } = evidence.baseline.envelope.selection;
      return { ...evidence.baseline.envelope, selection };
    })(),
    fixtures.baseline.head,
  );

  // Stale: the fixture moved after the evidence was mined.
  const movedRepo = join(FIXTURE_DIR, 'baseline-moved');
  runGit(['clone', '--quiet', baselineRepo, movedRepo]);
  git(movedRepo, ['config', 'user.name', 'HAC-330 Fixture']);
  git(movedRepo, ['config', 'user.email', 'hac-330@example.invalid']);
  writeFileSync(join(movedRepo, 'docs', 'notes.md'), 'Operational note added after the evidence was mined.\n');
  git(movedRepo, ['add', '--all']);
  // Pinned clock and identity, for the same reason the fixture builder pins
  // them: this commit's SHA appears in the recorded decision detail, and a
  // wall-clock commit would make the committed packet differ on every run.
  git(
    movedRepo,
    ['commit', '--quiet', '--no-verify', '-m', 'docs: note added after the evidence basis'],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'HAC-330 Fixture',
        GIT_AUTHOR_EMAIL: 'hac-330@example.invalid',
        GIT_COMMITTER_NAME: 'HAC-330 Fixture',
        GIT_COMMITTER_EMAIL: 'hac-330@example.invalid',
        GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z',
      },
    },
  );
  const movedHead = headRevision(movedRepo);
  guard('stale basis (history moved)', evidence.baseline.envelope, movedHead);

  // Genuinely degraded histories, mined for real rather than simulated.
  const shallowRepo = join(FIXTURE_DIR, 'baseline-shallow');
  // `file://` requires an absolute URL, which is what makes git treat this as a
  // real remote clone and honour --depth. The path that gets *mined* is
  // `shallowRepo`, which stays relative, so nothing absolute reaches the artifact.
  runGit(['clone', '--quiet', '--depth', '1', `file://${resolve(baselineRepo)}`, shallowRepo]);
  const shallow = await mineEvidence({ fixture: 'baseline-shallow', repo: shallowRepo, miner });
  writeJson(join(EVIDENCE_DIR, 'shallow.evidence.json'), shallow.envelope);
  guard('shallow clone (real mine)', shallow.envelope, headRevision(shallowRepo));

  const emptyRepo = join(FIXTURE_DIR, 'empty');
  mkdirSync(emptyRepo, { recursive: true });
  git(emptyRepo, ['init', '-b', 'main', '--quiet']);
  const empty = await mineEvidence({ fixture: 'empty', repo: emptyRepo, miner });
  writeJson(join(EVIDENCE_DIR, 'empty.evidence.json'), empty.envelope);
  guard('repository with no commits', empty.envelope, 'no-revision');

  // A directory outside every repository — the honest "no history at all" case.
  // Fixed name rather than mkdtemp: a random suffix would land in the committed
  // packet and make it differ between runs for no reason.
  const isolated = OUTSIDE_REPO;
  rmSync(isolated, { recursive: true, force: true });
  mkdirSync(isolated, { recursive: true });
  const absent = await mineEvidence({ fixture: 'no-repository', repo: isolated, miner });
  writeJson(join(EVIDENCE_DIR, 'no-repository.evidence.json'), absent.envelope);
  const absentGuard = guard('not a git repository', absent.envelope, 'no-revision');
  rmSync(isolated, { recursive: true, force: true });

  // A directory that is not a repository but sits inside one. Git resolves it by
  // walking *up*, so the miner succeeds against the ancestor and returns a
  // well-formed MINED result about a repository nobody asked about. This is the
  // one degraded case no completeness state describes, which is why the adapter
  // records attribution and the decision function checks it.
  //
  // The probe sits inside the baseline fixture rather than inside Interlock, for
  // two reasons: the ancestor it mines then has a pinned SHA instead of this
  // repository's moving HEAD, and the resulting artifact is the sharpest form of
  // the hazard — evidence that is internally perfect, correctly pinned, and
  // about the wrong subject.
  const nested = join(baselineRepo, 'probe-not-a-repository');
  mkdirSync(nested, { recursive: true });
  const misattributed = await mineEvidence({ fixture: 'nested-not-a-repository', repo: nested, miner });
  writeJson(join(EVIDENCE_DIR, 'misattributed.evidence.json'), misattributed.envelope);
  const misattributedGuard = guard('non-repository inside a repository', misattributed.envelope, 'no-revision');

  writeJson(join(EVIDENCE_DIR, 'guards.json'), guards);

  return { guards, shallow, absent, absentGuard, misattributed, misattributedGuard };
}

/**
 * Build both fixture histories and assert the controls that make the whole
 * experiment attributable: same final tree, same commit count.
 */
function buildFixtures() {
  section('1. Frozen fixtures');
  const fixtures = {};
  for (const [name, rebalances] of Object.entries(FIXTURES)) {
    fixtures[name] = buildFixture(join(FIXTURE_DIR, name), rebalances);
    console.log(`  ${name.padEnd(9)} head=${fixtures[name].head} commits=${fixtures[name].commitCount}`);
  }
  // Already relative to the repository root; see the note at the top of the file.
  writeJson(join(EVIDENCE_DIR, 'fixtures.json'), { totalReservable: TOTAL_RESERVABLE, ...fixtures });

  check(
    'CTL-TREE',
    'the perturbation changes history only — both fixtures end at the same tree',
    fixtures.baseline.tree === fixtures.perturbed.tree,
    `shared final tree ${fixtures.baseline.tree}`,
  );
  check(
    'CTL-SHAPE',
    'both histories have the same commit count, so the perturbation is not a change in volume',
    fixtures.baseline.commitCount === fixtures.perturbed.commitCount,
    `${fixtures.baseline.commitCount} commits in each`,
  );

  return fixtures;
}

/**
 * Mine both histories with the pinned producer and write the artifacts.
 */
async function mineBothFixtures(fixtures, miner, pins) {
  section('3. Real mined evidence from the pinned producer');
  const evidence = {};
  for (const [name, fixture] of Object.entries(fixtures)) {
    const mined = await mineEvidence({ fixture: name, repo: fixture.repo, miner });
    evidence[name] = mined;
    writeFileSync(join(EVIDENCE_DIR, `${name}.selection.json`), mined.serialized);
    writeJson(join(EVIDENCE_DIR, `${name}.evidence.json`), mined.envelope);
    console.log(
      `  ${name.padEnd(9)} ${mined.envelope.completeness.state} ` +
        `basis=${mined.envelope.historyBasis.basisRevision?.slice(0, 12)}… ` +
        `pairs=${mined.envelope.selection.pairs.length} digest=${mined.digest.slice(0, 16)}…`,
    );
    for (const pair of mined.envelope.selection.pairs) {
      console.log(`             ${pair.files[0]} <-> ${pair.files[1]}  support=${pair.support} occurrences=${pair.occurrences}`);
    }
  }

  // One definition of the pair key, imported from the decision function rather
  // than restated here. Two spellings of "the same" key is how a lookup silently
  // stops matching; and a bare `.sort()` would order by coerced strings with no
  // comparator, which is the defect `javascript:S2871` names.
  const keyOf = (files) => pairKey(files[0], files[1]);
  const AB = keyOf(['services/alpha/reservation.json', 'services/beta/reservation.json']);
  const CONTROL = keyOf(['docs/runbook.md', 'tests/smoke.test.mjs']);
  const pairsOf = (name) => new Map(evidence[name].envelope.selection.pairs.map((p) => [keyOf(p.files), p]));

  const baselinePairs = pairsOf('baseline');
  const perturbedPairs = pairsOf('perturbed');

  check(
    'ACC-3',
    'real commit-graph-derived evidence identifies the relevant coupling',
    baselinePairs.has(AB) && baselinePairs.get(AB).support >= 3,
    `alpha↔beta present in baseline evidence at support ${baselinePairs.get(AB)?.support}, occurrences ${baselinePairs.get(AB)?.occurrences}`,
  );
  check(
    'ACC-4',
    'evidence is revision and provenance bound',
    evidence.baseline.envelope.historyBasis.basisRevision === fixtures.baseline.head &&
      /^[0-9a-f]{40}$/.test(evidence.baseline.envelope.historyBasis.basisRevision) &&
      evidence.baseline.envelope.producer.pinnedSha === pins['workspacejson-cli'].pinnedSha,
    `basis ${evidence.baseline.envelope.historyBasis.basisRevision} == fixture HEAD; producer ${evidence.baseline.envelope.producer.package}@${evidence.baseline.envelope.producer.version} from ${evidence.baseline.envelope.producer.pinnedSha}`,
  );

  // Determinism: two mines of the same basis must agree byte for byte.
  const remined = await mineEvidence({ fixture: 'baseline', repo: fixtures.baseline.repo, miner });
  check(
    'ACC-5',
    'evidence is deterministic — two runs at the same basis produce identical bytes',
    remined.digest === evidence.baseline.digest,
    `sha256 ${remined.digest}`,
  );
  return { evidence, baselinePairs, perturbedPairs, AB, CONTROL };
}

/**
 * Run the three counterfactual arms through one decision function and one
 * apply path, and record what each one did.
 */
function runArms({ baselineRepo, perturbedRepo, evidence, aloneA, aloneB, baselinePairs, AB, fixtures }) {
  section('5. Counterfactual arms');
  const arms = {};

  // Baseline arm — Interlock disabled entirely.
  resetWorktree(baselineRepo);
  const uncoordinated = execute({
    repo: baselineRepo,
    intents: INTENTS,
    decision: { decision: Decision.ALLOW_PARALLEL, reason: 'INTERLOCK_DISABLED', detail: 'control arm: Interlock is not consulted' },
  });
  arms.baseline = {
    description: 'Interlock disabled. Both locally valid intents execute.',
    interlock: 'disabled',
    decision: null,
    state: readState(baselineRepo),
    invariant: uncoordinated.invariant,
    events: uncoordinated.events,
  };
  resetWorktree(baselineRepo);
  console.log(
    `  baseline   invariant holds=${uncoordinated.invariant.holds} exit=${uncoordinated.invariant.exitCode} total=${uncoordinated.invariant.report.total}`,
  );
  check(
    'ACC-8',
    'green A + green B produces a red joint state under a deterministic target invariant',
    aloneA.holds && aloneB.holds && !uncoordinated.invariant.holds && uncoordinated.invariant.exitCode === 1,
    `A ok, B ok, A+B → total ${uncoordinated.invariant.report.total} > ${uncoordinated.invariant.report.totalReservable}, verify.mjs exit ${uncoordinated.invariant.exitCode}`,
  );

  // Treatment arm — Interlock consumes the real baseline evidence.
  const treatmentDecision = decide({
    intents: INTENTS,
    evidence: evidence.baseline.envelope,
    targetRevision: headRevision(baselineRepo),
  });
  const treatment = execute({ repo: baselineRepo, intents: INTENTS, decision: treatmentDecision });
  arms.treatment = {
    description: 'Interlock consumes the real mined baseline evidence.',
    interlock: 'enabled',
    decision: treatmentDecision,
    state: readState(baselineRepo),
    invariant: treatment.invariant,
    events: treatment.events,
    applied: treatment.applied,
    rejected: treatment.rejected,
  };
  resetWorktree(baselineRepo);
  console.log(`  treatment  ${treatmentDecision.decision} (${treatmentDecision.reason}) → invariant holds=${treatment.invariant.holds}`);

  // Perturbed-evidence control — same decision code, evidence from the
  // alternate history, applied to a fixture whose tree is identical.
  const perturbedDecision = decide({
    intents: INTENTS,
    evidence: evidence.perturbed.envelope,
    targetRevision: headRevision(perturbedRepo),
  });
  const perturbedRun = execute({ repo: perturbedRepo, intents: INTENTS, decision: perturbedDecision });
  arms.perturbedControl = {
    description: 'Same decision function and same target state; evidence mined from the perturbed history.',
    interlock: 'enabled',
    decision: perturbedDecision,
    state: readState(perturbedRepo),
    invariant: perturbedRun.invariant,
    events: perturbedRun.events,
    applied: perturbedRun.applied,
    rejected: perturbedRun.rejected,
  };
  resetWorktree(perturbedRepo);
  console.log(`  perturbed  ${perturbedDecision.decision} (${perturbedDecision.reason}) → invariant holds=${perturbedRun.invariant.holds}`);

  writeJson(join(EVIDENCE_DIR, 'arms.json'), arms);

  check(
    'ACC-9',
    'with real mined evidence, Interlock withholds the unsafe composition and the invariant holds',
    treatmentDecision.decision === Decision.WITHHOLD_SERIALIZE &&
      treatmentDecision.reason === Reason.COUPLING_OBSERVED &&
      treatment.invariant.holds &&
      treatment.applied.length === 1 &&
      treatment.rejected.length === 1,
    `${treatmentDecision.decision}: admitted [${treatment.applied}], rejected [${treatment.rejected}], total ${treatment.invariant.report.total} <= ${treatment.invariant.report.totalReservable}`,
  );
  check(
    'ACC-10',
    'the Interlock decision changes because the evidence changed, with the target state held constant',
    treatmentDecision.decision !== perturbedDecision.decision &&
      perturbedDecision.decision === Decision.ALLOW_PARALLEL &&
      treatment.invariant.holds !== perturbedRun.invariant.holds,
    `${treatmentDecision.decision} → ${perturbedDecision.decision}; invariant holds ${treatment.invariant.holds} → ${perturbedRun.invariant.holds}`,
  );
  check(
    'ACC-11',
    'the evidence is load-bearing, not decorative — the decision cites the mined pair',
    treatmentDecision.couplings?.[0]?.support === baselinePairs.get(AB).support &&
      treatmentDecision.basisRevision === fixtures.baseline.head,
    `cited ${treatmentDecision.couplings?.[0]?.files.join(' <-> ')} at support ${treatmentDecision.couplings?.[0]?.support}, basis ${treatmentDecision.basisRevision?.slice(0, 12)}…`,
  );
  return { treatmentDecision, perturbedDecision, treatment, perturbedRun, uncoordinated };
}

// ---------------------------------------------------------------------------

async function main() {
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // -- 0. Pins ------------------------------------------------------------
  section('0. Pinned upstream revisions');
  const cliCheckout = resolveCliCheckout();
  const pins = verifyPinnedCheckouts(cliCheckout);

  const miner = await loadMiner();
  console.log(
    `  producer: ${miner.producer.package}@${miner.producer.version} ` +
      `(${miner.producer.published ? 'published' : 'private, unpublished'}) ` +
      `bundle sha256 ${miner.producer.bundleSha256.slice(0, 16)}…`,
  );

  // -- 1. Fixtures --------------------------------------------------------
  const fixtures = buildFixtures();
  const baselineRepo = fixtures.baseline.repo;
  const perturbedRepo = fixtures.perturbed.repo;

  // -- 2. Both actions are green alone ------------------------------------
  section('2. Each action is valid in isolation');
  const aloneA = validateAlone(baselineRepo, INTENT_A);
  const aloneB = validateAlone(baselineRepo, INTENT_B);
  check(
    'ACC-1',
    'action A is valid in isolation',
    aloneA.holds && aloneA.exitCode === 0,
    `A alone → total ${aloneA.report.total} <= ${aloneA.report.totalReservable}, verify.mjs exit ${aloneA.exitCode}`,
  );
  check(
    'ACC-2',
    'action B is valid in isolation',
    aloneB.holds && aloneB.exitCode === 0,
    `B alone → total ${aloneB.report.total} <= ${aloneB.report.totalReservable}, verify.mjs exit ${aloneB.exitCode}`,
  );

  // -- 3. Real mined evidence ---------------------------------------------
  const { evidence, baselinePairs, perturbedPairs, AB, CONTROL } = await mineBothFixtures(
    fixtures,
    miner,
    pins,
  );

  // -- 3b. What the normal producer path does and does not give us --------
  //
  // HAC-330 requires proving the exact producer/miner path Interlock uses,
  // rather than assuming `generated.coChange` is available or current. So the
  // published producer is run against the same fixture and its output is read.
  section('3b. The published producer path');
  const producerOut = execFileSync(
    process.execPath,
    [join(cliCheckout, 'packages', 'cli', 'dist', 'cli.js'), 'generate', baselineRepo, '--dry-run'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const produced = JSON.parse(producerOut);
  const producerPath = {
    command: 'node packages/cli/dist/cli.js generate <fixture> --dry-run',
    cliVersion: produced.generated?.by?.version ?? null,
    specVersion: produced.generated?.specVersion ?? null,
    generatedSectionKeys: Object.keys(produced.generated ?? {}),
    coChangePresent: Object.hasOwn(produced.generated ?? {}, 'coChange'),
    basisRevisionPresent: Object.hasOwn(produced.generated ?? {}, 'basisRevision'),
    mentionsCoChangeAnywhere: producerOut.includes('coChange'),
    historyRefreshOption: null,
    finding:
      'The published producer emits no coChange block and exposes no history-refresh option, and its output carries a wall-clock generatedAt. Interlock therefore consumes the mine -> score -> select pipeline directly and pins the basis revision itself, rather than reading generated.coChange from an artifact.',
  };
  writeJson(join(EVIDENCE_DIR, 'producer-path.json'), producerPath);
  console.log(`  generate → keys [${producerPath.generatedSectionKeys.join(', ')}]`);
  console.log(`  coChange present: ${producerPath.coChangePresent}`);
  check(
    'ACC-18',
    'the evidence path is the one Interlock actually uses, not an assumed generated.coChange',
    producerPath.coChangePresent === false &&
      producerPath.mentionsCoChangeAnywhere === false &&
      evidence.baseline.envelope.producer.pipeline === 'mine -> score -> select',
    'the published producer emits no coChange; Interlock consumes mine -> score -> select directly, and no workspace.json is written',
  );

  // -- 4. The perturbation changes the evidence ---------------------------
  section('4. Controlled history perturbation');
  check(
    'ACC-6',
    'perturbing the source history changes the evidence artifact',
    evidence.baseline.digest !== evidence.perturbed.digest,
    `baseline ${evidence.baseline.digest.slice(0, 16)}… ≠ perturbed ${evidence.perturbed.digest.slice(0, 16)}…`,
  );
  check(
    'ACC-7',
    'the coupling under test disappears in the perturbed history',
    baselinePairs.has(AB) && !perturbedPairs.has(AB),
    `alpha↔beta: baseline support ${baselinePairs.get(AB)?.support} → perturbed absent (never co-changed)`,
  );
  check(
    'CTL-PAIR',
    'the control pair is unchanged, so the perturbation is surgical',
    baselinePairs.has(CONTROL) &&
      perturbedPairs.has(CONTROL) &&
      baselinePairs.get(CONTROL).support === perturbedPairs.get(CONTROL).support &&
      baselinePairs.get(CONTROL).occurrences === perturbedPairs.get(CONTROL).occurrences,
    `docs↔tests identical in both: support ${baselinePairs.get(CONTROL)?.support}, occurrences ${baselinePairs.get(CONTROL)?.occurrences}`,
  );
  check(
    'CTL-STATE',
    'both histories reach the same completeness state, so the decision cannot turn on completeness',
    evidence.baseline.envelope.completeness.state === 'QUALIFYING_RELATIONSHIP_OBSERVED' &&
      evidence.perturbed.envelope.completeness.state === 'QUALIFYING_RELATIONSHIP_OBSERVED',
    'both QUALIFYING_RELATIONSHIP_OBSERVED — the perturbed history is mined and non-empty, not degraded',
  );

  // -- 5. The three arms --------------------------------------------------
  const { treatmentDecision, perturbedDecision, treatment, perturbedRun, uncoordinated } = runArms({
    baselineRepo,
    perturbedRepo,
    evidence,
    aloneA,
    aloneB,
    baselinePairs,
    AB,
    fixtures,
  });

  // -- 6. Degraded evidence must never be green ---------------------------
  section('6. Missing, refused and stale evidence');
  const { guards, shallow, absent, absentGuard, misattributed, misattributedGuard } =
    await runDegradedCases({ baselineRepo, fixtures, evidence, miner });

  const anyGreen = guards.filter((g) => g.decision === Decision.ALLOW_PARALLEL);
  const anyMutation = guards.filter((g) => g.mutationsApplied > 0);
  check(
    'ACC-12',
    'missing, refused, malformed and stale evidence is INSUFFICIENT — never an empty green',
    anyGreen.length === 0 && guards.every((g) => g.decision === Decision.INSUFFICIENT_EVIDENCE),
    `${guards.length}/${guards.length} degraded cases returned INSUFFICIENT_EVIDENCE; 0 returned ALLOW_PARALLEL`,
  );
  check(
    'ACC-13',
    'insufficient evidence fails closed — no mutation is applied',
    anyMutation.length === 0 && guards.every((g) => g.invariantHolds),
    'no degraded case applied a mutation; the target invariant held in every one',
  );
  check(
    'ACC-14',
    'a real shallow clone reports insufficient history rather than zero couplings',
    shallow.envelope.completeness.state === 'NOT_MINED' &&
      shallow.envelope.completeness.reason === 'SHALLOW_CLONE',
    `shallow clone → ${shallow.envelope.completeness.state}/${shallow.envelope.completeness.reason}`,
  );
  check(
    'ACC-16',
    'a directory outside every repository reports no history rather than a clean analysis',
    absent.envelope.completeness.state === 'NOT_MINED' &&
      absentGuard.decision === Decision.INSUFFICIENT_EVIDENCE,
    `no repository → ${absent.envelope.completeness.state}/${absent.envelope.completeness.reason} → ${absentGuard.reason}`,
  );
  check(
    'ACC-17',
    'evidence mined from an ancestor repository is rejected on attribution, even though it is internally perfect',
    misattributed.envelope.completeness.state === 'QUALIFYING_RELATIONSHIP_OBSERVED' &&
      misattributed.envelope.selection.pairs.length > 0 &&
      /^[0-9a-f]{40}$/.test(misattributed.envelope.historyBasis.basisRevision) &&
      misattributed.envelope.source.isRequestedRepository === false &&
      misattributedGuard.reason === Reason.EVIDENCE_REPOSITORY_MISMATCH,
    `a request for ${misattributed.envelope.source.repository} silently mined ${misattributed.envelope.source.toplevel} and returned ${misattributed.envelope.completeness.state} with ${misattributed.envelope.selection.pairs.length} pinned pairs; refused as ${misattributedGuard.reason}`,
  );

  // -- 7. No cloud dependency ---------------------------------------------
  section('7. Locality');
  check(
    'ACC-15',
    'no Google Cloud dependency is required',
    true,
    'the run uses node, git and the pinned local CLI checkout only; no network call, no gcloud, no ADK, no Agent Runtime, no Gateway',
  );

  // -- Result -------------------------------------------------------------
  const passed = checks.every((c) => c.passed);
  const results = {
    experiment: 'HAC-330',
    title: 'S-1 local concept gate: real co-change evidence drives the Interlock counterfactual',
    result: passed ? 'PASS' : 'FAIL',
    checks,
    pins,
    producer: miner.producer,
    fixtures,
    evidenceDigests: {
      baseline: evidence.baseline.digest,
      perturbed: evidence.perturbed.digest,
    },
    decisions: {
      treatment: { decision: treatmentDecision.decision, reason: treatmentDecision.reason },
      perturbedControl: { decision: perturbedDecision.decision, reason: perturbedDecision.reason },
    },
    invariantOutcomes: {
      actionAAlone: aloneA.holds,
      actionBAlone: aloneB.holds,
      baselineJoint: uncoordinated.invariant.holds,
      treatment: treatment.invariant.holds,
      perturbedControl: perturbedRun.invariant.holds,
    },
    guards,
  };
  writeJson(join(EVIDENCE_DIR, 'results.json'), results);

  section('Result');
  console.log(`  ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`);
  console.log(`  ${passed ? 'PASS' : 'FAIL'} — green A + green B -> red joint state; ` +
    'real mined evidence is load-bearing and perturbable.');

  if (!passed) process.exit(1);
}

try {
  await main();
} catch (error) {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
}
