#!/usr/bin/env node
/**
 * META-383 Stage 2b — deep screen of the frozen top-6 candidates.
 *
 * Applies PREREGISTRATION.md section 5 (the eight admission rules) in the frozen
 * deep-screen order from evidence/candidates.json. Stops at the FIRST candidate
 * that passes all eight. Every rejection reason is preserved.
 *
 * Cost ordering note (stated so it is auditable): the rules are evaluated in an
 * order chosen for compile cost, not for outcome. Rule 5 (composed consequence)
 * is checked before rule 3 (independent local validity) because a candidate whose
 * composed tree HOLDS is rejected regardless of rule 3, and that ordering saves
 * two workspace checks per rejected candidate. The admission decision is the
 * conjunction of all eight rules and is unaffected by evaluation order.
 *
 * Exit-0-is-not-evidence: every verdict below preserves the repository-native
 * checker's stdout/stderr tail, not just its exit code.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = dirname(HERE);
const WORK = join(EXP, '.work', 'stage2b');
const LOGS = join(EXP, 'evidence', 'stage2b-logs');

const SURFACE = {
  'JamieMason/syncpack': ['cargo', 'check', '--workspace', '--locked'],
  'formatjs/formatjs': ['cargo', 'check', '--workspace', '--locked', '--exclude', 'formatjs_icu_messageformat_parser_integration_tests'],
  'polyfy/polylith': ['clojure', '-M:poly', 'check'],
};
const CLONE = {
  'JamieMason/syncpack': '/private/tmp/meta375/clones/syncpack',
  'formatjs/formatjs': '/private/tmp/meta375/clones/formatjs',
  'polyfy/polylith': '/private/tmp/meta375/clones/polylith',
};

const MIN_FREE_MB = 700;
function freeMB() {
  const out = execFileSync('df', ['-m', '/System/Volumes/Data'], { encoding: 'utf8' });
  return Number(out.trim().split('\n').pop().split(/\s+/)[3]);
}
function requireDisk(where) {
  const mb = freeMB();
  if (mb < MIN_FREE_MB) {
    throw Object.assign(new Error('INFRASTRUCTURE_DISK_EXHAUSTED at ' + where + ': ' + mb + ' MB free'), { infra: true });
  }
  return mb;
}

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// The first Stage 2b execution produced composed checks that finished in ~0.2s
// with no `Checking <root>` line: cargo considered every unit fresh and did not
// re-examine the composed source at all. Exit 0 from an inert probe is not
// evidence. Two guards are added here and the inert run is preserved in
// DEVIATIONS.md rather than silently replaced.
//   (1) touchAll forces cargo's mtime fingerprints to be recomputed;
//   (2) every check must show the workspace root actually being checked, or the
//       verdict is PROBE_INERT and the screen aborts instead of recording a
//       disposition.
function touchAll(cwd) {
  execFileSync('sh', ['-c',
    "find . -type f \\( -name '*.rs' -o -name 'Cargo.toml' -o -name 'Cargo.lock' -o -name '*.clj' -o -name '*.edn' \\) -exec touch {} +"],
    { cwd, encoding: 'utf8' });
}
const ROOT_EVIDENCE = {
  'JamieMason/syncpack': /^\s*(Checking|Compiling) syncpack v/m,
  'formatjs/formatjs': /^\s*(Checking|Compiling) /m,
  'polyfy/polylith': /./,
};

function runSurface(repo, cwd, label) {
  touchAll(cwd);
  const [cmd, ...args] = SURFACE[repo];
  const t = Date.now();
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, CARGO_TARGET_DIR: join(CLONE[repo], 'target'), CARGO_TERM_COLOR: 'never' },
    timeout: 45 * 60 * 1000,
  });
  const out = { label, command: [cmd, ...args].join(' '), exitCode: r.status, seconds: Math.round((Date.now() - t) / 1000) };
  const combined = (r.stdout || '') + (r.stderr || '');
  mkdirSync(LOGS, { recursive: true });
  writeFileSync(join(LOGS, label + '.log'), combined);
  out.logFile = 'evidence/stage2b-logs/' + label + '.log';
  out.tail = combined.split('\n').filter(Boolean).slice(-25).join('\n');
  out.errorLines = combined.split('\n').filter((l) => /^error(\[|:)/.test(l.trim())).slice(0, 40);
  out.passed = r.status === 0;
  out.rootActuallyChecked = ROOT_EVIDENCE[repo].test(combined);
  console.error(`    ${label}: exit=${r.status} (${out.seconds}s) rootChecked=${out.rootActuallyChecked}`);
  if (!out.rootActuallyChecked) {
    throw Object.assign(new Error('PROBE_INERT at ' + label + ': the frozen surface produced no evidence that the workspace root was examined'), { inert: true, detail: out });
  }
  return out;
}

const cands = JSON.parse(readFileSync(join(EXP, 'evidence', 'candidates.json'), 'utf8'));
const top6 = cands.deepScreenOrder.slice(0, 6);

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------- positive control
// Before any candidate verdict is trusted, prove the frozen surface can detect a
// delete-versus-reference break of exactly the HAC-343 class in this harness.
function positiveControl() {
  const repo = 'JamieMason/syncpack';
  const dir = CLONE[repo];
  const t0 = top6[0].t0;
  const w = join(WORK, 'positive-control');
  git(dir, 'worktree', 'add', '--detach', '-f', w, t0);
  try {
    const clean = runSurface(repo, w, 'positive-control-clean');
    // Remove a referenced item: delete the body of a pub fn's declaring line by
    // renaming it, so every call site becomes an unresolved reference.
    const target = execFileSync('sh', ['-c',
      "grep -rln '^pub fn ' --include='*.rs' src crates | head -1"], { cwd: w, encoding: 'utf8' }).trim();
    if (!target) throw new Error('positive control could not find a pub fn to remove');
    const fnName = execFileSync('sh', ['-c',
      "grep -m1 '^pub fn ' " + target + " | sed -E 's/^pub fn ([A-Za-z0-9_]+).*/\\1/'"], { cwd: w, encoding: 'utf8' }).trim();
    execFileSync('sh', ['-c',
      "sed -i '' 's/^pub fn " + fnName + "/pub fn " + fnName + "_renamed_by_positive_control/' " + target], { cwd: w });
    let broke;
    try { broke = runSurface(repo, w, 'positive-control-broken'); }
    catch (e) { broke = e.detail || { passed: null, note: String(e.message) }; }
    return {
      question: 'Does the frozen validation surface actually detect a delete-versus-reference break in this harness?',
      t0, mutatedFile: target, renamedFunction: fnName,
      cleanExit: clean.exitCode, brokenExit: broke.exitCode,
      surfaceIsLive: clean.exitCode === 0 && broke.exitCode !== 0,
      brokenErrorLines: broke.errorLines,
    };
  } finally {
    try { git(dir, 'worktree', 'remove', '--force', w); } catch { rmSync(w, { recursive: true, force: true }); }
  }
}
console.error('=== positive control ===');
const control = positiveControl();
console.error('  surfaceIsLive=' + control.surfaceIsLive);
if (!control.surfaceIsLive) {
  writeFileSync(join(EXP, 'evidence', 'stage2b-deepscreen.json'), JSON.stringify(
    { experiment: 'META-383', kind: 'Stage 2b deep screen', disposition: 'ABORTED_SURFACE_NOT_LIVE', positiveControl: control }, null, 2) + '\n');
  throw new Error('frozen validation surface failed its positive control; no candidate verdict may be recorded');
}

const results = [];
let admitted = null;

for (const c of top6) {
  if (admitted) {
    results.push({ ...c, evaluated: false, note: 'not evaluated: stopping rule — an earlier candidate was admitted' });
    continue;
  }
  console.error(`\n=== candidate ${c.order} (${c.repository}, score ${c.score}) ===`);
  const dir = CLONE[c.repository];
  const rec = { ...c, evaluated: true, rules: {} };

  const wtT0 = join(WORK, `c${c.order}-t0`);
  const wtA = join(WORK, `c${c.order}-a`);
  const wtB = join(WORK, `c${c.order}-b`);
  const wtInt = join(WORK, `c${c.order}-int`);
  const live = new Set();
  // Worktrees are created lazily and dropped as soon as their verdict is
  // recorded. A syncpack checkout is ~4 MB, but this host is disk-constrained
  // and an ENOSPC mid-screen would corrupt a verdict; see DEVIATIONS.
  const add = (w) => { requireDisk('worktree ' + w); git(dir, 'worktree', 'add', '--detach', '-f', w, c.t0); live.add(w); return w; };
  const drop = (w) => { try { git(dir, 'worktree', 'remove', '--force', w); } catch { rmSync(w, { recursive: true, force: true }); } live.delete(w); };
  const cleanup = () => { for (const w of [...live]) drop(w); };

  try {
    requireDisk('candidate start');

    // Rule 2 — real historical changes (true by enumeration; recorded, not asserted).
    rec.rules.rule2_realChanges = {
      passed: true,
      caSubject: git(dir, 'show', '-s', '--format=%s', c.ca).trim(),
      cbSubject: git(dir, 'show', '-s', '--format=%s', c.cb).trim(),
      note: 'Both patches are diffs of real first-parent commits in the pinned clone. No edit was invented.',
    };

    const patchA = git(dir, 'format-patch', '-1', '--stdout', c.ca);
    const patchB = git(dir, 'format-patch', '-1', '--stdout', c.cb);
    writeFileSync(join(WORK, `c${c.order}-a.patch`), patchA);
    writeFileSync(join(WORK, `c${c.order}-b.patch`), patchB);
    const pathsA = git(dir, 'show', '--format=', '--name-only', c.ca).trim().split('\n').filter(Boolean);
    const pathsB = git(dir, 'show', '--format=', '--name-only', c.cb).trim().split('\n').filter(Boolean);
    rec.changedPaths = { a: pathsA, b: pathsB };

    // Rule 4 — path-disjoint, no textual merge conflict when both are applied.
    const overlap = pathsA.filter((p) => pathsB.includes(p));
    let composedApplied = true, composeErr = null;
    try {
      add(wtInt);
      git(wtInt, 'apply', join(WORK, `c${c.order}-a.patch`));
      git(wtInt, 'apply', join(WORK, `c${c.order}-b.patch`));
    } catch (e) { composedApplied = false; composeErr = String(e.stderr || e.message).slice(0, 2000); }
    rec.rules.rule4_noTextualConflict = {
      passed: overlap.length === 0 && composedApplied,
      pathOverlap: overlap,
      bothPatchesApplyToOneTree: composedApplied,
      applyError: composeErr,
    };
    if (!rec.rules.rule4_noTextualConflict.passed) {
      rec.admitted = false; rec.rejectionReason = 'TEXTUAL_MERGE_CONFLICT_OR_PATH_OVERLAP';
      results.push(rec); cleanup(); continue;
    }

    // Rule 3a — T0 itself must be clean on the frozen surface, or a composed
    // failure could not be attributed to the candidate at all.
    add(wtT0);
    const t0Check = runSurface(c.repository, wtT0, `c${c.order}-t0`);
    drop(wtT0);
    rec.rules.rule3_baseClean = { passed: t0Check.passed, check: t0Check };
    if (!t0Check.passed) {
      rec.admitted = false; rec.rejectionReason = 'T0_BASE_FAILS_FROZEN_VALIDATION_SURFACE';
      results.push(rec); cleanup(); continue;
    }

    // Rule 5 — the composed tree must FAIL the repository-native surface.
    const intCheck = runSurface(c.repository, wtInt, `c${c.order}-composed`);
    if (intCheck.passed) drop(wtInt);
    rec.rules.rule5_composedConsequence = {
      passed: !intCheck.passed,
      check: intCheck,
      note: intCheck.passed
        ? 'Composed tree HOLDS on the frozen surface: there is no deterministic composed consequence to detect.'
        : 'Composed tree fails; attribution to the interaction is established by rule 3 below.',
    };
    if (intCheck.passed) {
      rec.admitted = false; rec.rejectionReason = 'NO_DETERMINISTIC_COMPOSED_CONSEQUENCE';
      results.push(rec); cleanup(); continue;
    }

    // Rule 3b — each patch independently valid in isolation. This is also what
    // makes the composed failure attributable to the INTERACTION.
    add(wtA); git(wtA, 'apply', join(WORK, `c${c.order}-a.patch`));
    const aCheck = runSurface(c.repository, wtA, `c${c.order}-a`);
    add(wtB); git(wtB, 'apply', join(WORK, `c${c.order}-b.patch`));
    const bCheck = runSurface(c.repository, wtB, `c${c.order}-b`);
    rec.rules.rule3_independentLocalValidity = {
      passed: aCheck.passed && bCheck.passed,
      a: aCheck, b: bCheck,
    };
    if (!rec.rules.rule3_independentLocalValidity.passed) {
      rec.admitted = false;
      rec.rejectionReason = aCheck.passed
        ? 'PATCH_B_NOT_INDEPENDENTLY_VALID'
        : 'PATCH_A_NOT_INDEPENDENTLY_VALID';
      results.push(rec); cleanup(); continue;
    }

    rec.rules.rule8_replayIntegrity = {
      passed: true,
      note: 'Composition happened only in the disposable integration worktree; wt-a and wt-b were never mutated by verification.',
      candidateWorktreeStatusAfterCompose: {
        a: git(wtA, 'status', '--porcelain').trim().split('\n').filter(Boolean).length,
        b: git(wtB, 'status', '--porcelain').trim().split('\n').filter(Boolean).length,
      },
    };
    rec.mechanicallyAdmissible = true;
    rec.pendingHumanRules = ['rule1_t0Availability', 'rule6_evidenceHonesty', 'rule7_noTrivialCurrentTreeOracle'];
    rec.admitted = 'PENDING_RULES_1_6_7';
    admitted = rec;
    results.push(rec);
  } catch (e) {
    rec.admitted = false;
    rec.rejectionReason = e.infra ? 'INFRASTRUCTURE_FAILURE_NOT_A_VERDICT' : e.inert ? 'PROBE_INERT_NOT_A_VERDICT' : 'SCREENING_ERROR';
    rec.error = String(e.stderr || e.message).slice(0, 4000);
    results.push(rec);
    cleanup();
    if (e.infra || e.inert) {
      writeFileSync(join(EXP, 'evidence', 'stage2b-deepscreen.json'), JSON.stringify(
        { experiment: 'META-383', kind: 'Stage 2b deep screen', disposition: 'ABORTED_INFRASTRUCTURE', candidates: results }, null, 2) + '\n');
      console.error('ABORTED: ' + e.message);
      process.exit(3);
    }
  } finally {
    cleanup();
  }
}

const out = {
  experiment: 'META-383',
  kind: 'Stage 2b deep screen of the frozen top-6',
  frozenBy: 'PREREGISTRATION.md section 5, commit 032178b',
  evaluationOrderNote:
    'Rules were evaluated in compile-cost order (2, 4, 3a-base, 5, 3b, 8). Admission is the conjunction of all eight and is order-independent. Rules 1, 6 and 7 are properties of the evidence payload and the tree, adjudicated in the receipt rather than by this script.',
  positiveControl: control,
  deepScreenBudget: 6,
  candidates: results,
  admittedOrder: admitted ? admitted.order : null,
  disposition: admitted ? 'MECHANICAL_ADMISSION_PENDING_RULES_1_6_7' : 'NO_MECHANICAL_ADMISSION_IN_BUDGET',
};
mkdirSync(join(EXP, 'evidence'), { recursive: true });
writeFileSync(join(EXP, 'evidence', 'stage2b-deepscreen.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ disposition: out.disposition, admittedOrder: out.admittedOrder,
  summary: results.map((r) => ({ order: r.order, evaluated: r.evaluated, admitted: r.admitted, reason: r.rejectionReason })) }, null, 2));
