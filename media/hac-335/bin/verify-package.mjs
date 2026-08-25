#!/usr/bin/env node
/**
 * HAC-335 — the judge-facing package gate.
 *
 * Dependency-free and deterministic: no browser, no server, no network. It
 * reads the frozen evidence the package claims to rest on and checks that the
 * package still says what that evidence supports.
 *
 * The bar this tries to clear is *not* "a pile of constants that confirm
 * themselves". Wherever a number appears in judge-facing prose, the expected
 * value is read out of the frozen experiment or the public packet and compared
 * against the prose — so editing the evidence and forgetting the copy fails,
 * and editing the copy and forgetting the evidence fails too.
 *
 * Each check below is a named function over a shared context, so a reader can
 * find the invariant they care about without reading the ones they do not.
 * Every check has a matching negative case in
 * test/hac-335-package-gates.test.mjs.
 *
 *     node media/hac-335/bin/verify-package.mjs
 */

import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExportName } from '../../../scripts/export-naming.mjs';
import { captureSourceDigest, captureSourceFiles } from './lib/capture-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The evidenced deployment revision. Any other is unevidenced by definition. */
const EVIDENCED_REVISION = 'interlock-hac340-proxy-00002-wzf';

/** The frozen cloud controls. The field name is the packet's, not ours. */
const CONTROLS = { forgedHeaderStatus: 403, wrongAudienceStatus: 401, directBypassStatus: 403 };

/** Deep-link states HAC-341 declares. */
const DECLARED_STATES = new Set([
  'run.local.baseline',
  'run.local.treatment',
  'run.local.perturbed',
  'run.cloud.overview',
]);

/**
 * A sentence naming both issues is how "one combined experiment" gets in.
 * Allowed only where the sentence is explicitly separating them.
 */
const SEPARATORS = /neither|separate|different run|two runs|not .*reproduce|does not|apart|reset/i;

function loadContext(root) {
  const readText = (p) => readFileSync(join(root, p), 'utf8');
  const readJson = (p) => JSON.parse(readText(p));

  const devpostDir = 'media/hac-335/devpost';
  const proseFiles = [
    'README.md',
    ...readdirSync(join(root, devpostDir))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `${devpostDir}/${f}`),
  ];
  const prose = Object.fromEntries(proseFiles.map((f) => [f, readText(f)]));
  const shots = readJson('media/hac-335/devpost/screenshot-order.json');

  return {
    root,
    arms: readJson('experiments/hac-330/evidence/arms.json'),
    results: readJson('experiments/hac-330/evidence/results.json'),
    cloud: readJson('experiments/hac-342/evidence/cloud-run.public.json'),
    bindings: readJson('experiments/hac-342/evidence/publication-bindings.json'),
    snapshot: readJson('experiments/hac-342/evidence/runtime-source-snapshot.json'),
    renderManifest: readJson('media/hac-334/exports/render-manifest.json'),
    registry: readJson('media/hac-335/evidence/asset-registry.json'),
    ledger: readJson('media/hac-335/evidence/claim-ledger.json'),
    sequence: readJson('media/hac-335/evidence/judge-sequence.json'),
    captures: readJson('media/hac-335/evidence/capture-manifest.json'),
    cockpit: readJson('media/hac-341/evidence/view-model.json'),
    /* The sole source of every HAC-343 figure this package renders. Read here
       so the gate compares prose against the frozen export rather than against
       a number somebody typed twice. */
    judgeExport: readJson('experiments/hac-343/evidence/judge-export.json'),
    shots,
    prose,
    allProse: Object.values(prose).join('\n'),
    judgeText: [
      ...Object.values(prose),
      ...shots.screenshots.map((s) => s.caption),
      shots.thumbnail.proposition,
    ].join('\n'),
  };
}

/* -- 1. the two proof classes never become one run ------------------------- */

function checkProofClassSeparation({ prose, judgeText }, fail) {
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      if (line.includes('HAC-330') && line.includes('HAC-340') && !SEPARATORS.test(line)) {
        fail(`${file}: names HAC-330 and HAC-340 in one sentence without separating them: "${line.trim().slice(0, 110)}"`);
      }
    }
  }
  // The synthetic chain that must never appear as one run.
  if (/WITHHOLD_SERIALIZE[\s\S]{0,160}alpha=45/.test(judgeText)) {
    fail('judge copy chains WITHHOLD_SERIALIZE to alpha=45; that sequence is not one run');
  }
}

/* -- 2/3. unsupported states and non-participating identities -------------- */

/** True when a disclaimer sits close enough to bind to the mention. */
const disclaimed = (text, index, pattern, span) =>
  pattern.test(text.slice(Math.max(0, index - span), index + span));

function checkUnsupportedStates({ prose }, fail) {
  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(/AUTHORIZED/g)) {
      if (!disclaimed(text, m.index, /not|never|no .*lifecycle|is not/i, 120)) {
        fail(`${file}: AUTHORIZED appears without a negation; it is not an evidenced state`);
      }
    }
    for (const term of ['Agent Runtime', 'Agent Gateway', 'CONTENT_AUTHZ']) {
      for (const m of text.matchAll(new RegExp(term, 'g'))) {
        if (!disclaimed(text, m.index, /not on|did not|absent|not claimed|no[t]? particip/i, 200)) {
          fail(`${file}: "${term}" appears without a disclaimer nearby`);
        }
      }
    }
  }
}

/* -- 4/5. cloud controls, and wrong-audience is not a cloud control -------- */

function checkCloudControls({ cloud, prose }, fail) {
  for (const [k, expected] of Object.entries(CONTROLS)) {
    if (cloud.controls[k] !== expected) {
      fail(`frozen cloud control ${k} is ${cloud.controls[k]}, expected ${expected}`);
    }
  }
  // The 401 row must describe an invalid token, never a genuine wrong-audience
  // rejection: the control sent an invalid token.
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      if (/wrong[- ]audience/i.test(line) && !/local parity|not a .*cloud|controlled local/i.test(line)) {
        fail(`${file}: wrong-audience described without marking it local parity: "${line.trim().slice(0, 110)}"`);
      }
    }
  }
}

/* -- 6/7. numerals do not drift, on either side ---------------------------- */

function checkNumerals({ arms, results, cloud, allProse }, fail) {
  const armsBlob = JSON.stringify(arms);
  const EXPECTED = { baseline: 140, treatment: 120, bound: 130 };
  for (const [label, n] of Object.entries(EXPECTED)) {
    if (!armsBlob.includes(String(n))) {
      fail(`frozen HAC-330 arms no longer contain ${label} value ${n}`);
    }
  }

  const checksTotal = results.checks.length;
  const checksPassed = results.checks.filter((c) => c.passed === true).length;
  if (checksTotal !== 24 || checksPassed !== 24) {
    fail(`frozen HAC-330 checks are ${checksPassed}/${checksTotal}, judge copy states 24/24`);
  }
  if (results.result !== 'PASS') fail(`frozen HAC-330 result is ${results.result}, not PASS`);
  if (!allProse.includes(`${checksPassed}/${checksTotal}`)) {
    fail(`judge copy does not state the frozen check count ${checksPassed}/${checksTotal}`);
  }

  for (const pair of [`${EXPECTED.baseline} > ${EXPECTED.bound}`, `${EXPECTED.treatment} <= ${EXPECTED.bound}`]) {
    if (!allProse.includes(pair)) fail(`judge copy no longer states the frozen comparison "${pair}"`);
  }
  for (const decision of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL']) {
    if (!armsBlob.includes(decision)) fail(`frozen arms no longer contain decision ${decision}`);
    if (!allProse.includes(decision)) fail(`judge copy no longer states decision ${decision}`);
  }

  const observedAlpha = cloud.observation?.state?.services?.alpha;
  if (observedAlpha === undefined) fail('public packet has no observation.state.services.alpha');
  else if (!allProse.includes(`alpha=${observedAlpha}`)) {
    fail(`judge copy does not state the observed value alpha=${observedAlpha} from the public packet`);
  }
}

/* -- 8/9. public evidence URLs are immutable and registered ---------------- */

function checkEvidenceUrls({ prose, registry }, fail) {
  const urlRe = /https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/Marcelle-Labs\/interlock\/(?:blob\/)?([^/\s]+)\/([^\s)"'|]+)/g;
  const registeredUrls = JSON.stringify(registry).match(/https:\/\/[^"\s]+/g) || [];
  let seen = 0;

  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(urlRe)) {
      const [url, ref] = m;
      seen += 1;
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        fail(`${file}: evidence URL is not pinned to a commit (ref "${ref}"): ${url}`);
      }
      const bare = url.replace(/[).,]+$/, '');
      if (!registeredUrls.some((r) => r.split('#')[0] === bare)) {
        fail(`${file}: evidence URL is absent from the asset registry: ${url}`);
      }
    }
  }
  if (!seen) fail('judge copy contains no immutable evidence URL at all');
}

/* -- 10/11. withheld things stay withheld ---------------------------------- */

function checkWithheldEvidence({ snapshot, bindings, prose, registry }, fail) {
  if (snapshot.runtimeSourceShaPublished !== false) {
    fail('runtime-source-snapshot no longer marks the runtime source as unpublished');
  }
  const runtimeSha = snapshot.runtimeSourceSha;
  const fabricated = new RegExp(String.raw`https?://[^\s)"']*${runtimeSha}`);
  for (const [file, text] of Object.entries(prose)) {
    if (fabricated.test(text)) fail(`${file}: fabricates a URL for the unpublished runtimeSourceSha`);
  }
  const regBlob = JSON.stringify(registry);
  if (new RegExp(String.raw`https?://[^"\s]*${runtimeSha}`).test(regBlob)) {
    fail('asset registry fabricates a URL for the unpublished runtimeSourceSha');
  }
  if (registry.publicEvidence.runtimeSourceUrl?.state !== 'unavailable / non-public') {
    fail('asset registry does not render runtimeSourceUrl as unavailable / non-public');
  }
  if (registry.publicEvidence.runtimeSourceSha === registry.publicEvidence.evidencePublicationSha) {
    fail('runtimeSourceSha and evidencePublicationSha have collapsed into one value');
  }

  if (bindings.digests.sourcePacketPublished !== false) {
    fail('publication bindings no longer mark the source packet as unpublished');
  }
  if (bindings.deliberatelyUnbound?.runtimeSourceUrl?.state !== 'unavailable / non-public') {
    fail('publication bindings no longer record runtimeSourceUrl as unavailable / non-public');
  }
  const shortSource = bindings.digests.sourcePacketSha256.slice(0, 8);
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      const mentionsSource = line.includes('sourcePacketSha256') || line.includes(shortSource);
      if (mentionsSource
        && /recompute|recomputable|verify it yourself|check it yourself/i.test(line)
        && !/not |no\b|private|unpublished/i.test(line)) {
        fail(`${file}: describes sourcePacketSha256 as recomputable: "${line.trim().slice(0, 110)}"`);
      }
    }
  }
}

/* -- 12. no unevidenced agent/target revision ------------------------------ */

function checkRevisions({ cloud, prose, registry }, fail) {
  if (!JSON.stringify(cloud).includes(EVIDENCED_REVISION)) {
    fail(`public packet no longer names the evidenced revision ${EVIDENCED_REVISION}`);
  }
  const revisionRe = /interlock-hac340-[a-z]+-\d{5}-[a-z0-9]+/g;
  const surfaces = { ...prose, 'asset-registry.json': JSON.stringify(registry) };
  for (const [file, text] of Object.entries(surfaces)) {
    for (const m of text.matchAll(revisionRe)) {
      if (m[0] !== EVIDENCED_REVISION) {
        fail(`${file}: names an unevidenced deployment revision ${m[0]}`);
      }
    }
  }
}

/* -- 13/14. the HAC-343 evaluation is bound, and stays bounded ------------- */

/**
 * HAC-343 went from "no packet exists" to a frozen canonical result, so the
 * rule this gate enforces inverted. It used to prove the evaluation was absent.
 * Absence is no longer the truth, and a gate that still enforced it would keep
 * the package stating something false — which is exactly what it did until this
 * check was rewritten.
 *
 * What replaces it is stricter, not looser. "No number" is trivially checkable;
 * "every number is the frozen one, and none of them travels alone" is the
 * property that actually protects a judge, and it needs the export in hand.
 */
function checkEvaluationBound({ prose, judgeExport, registry, sequence }, fail) {
  const p1 = judgeExport.panel1.rows;
  const cred = judgeExport.panel1.perTargetLockCredibility;
  const p2 = judgeExport.panel2.rows;

  /* Every count the export blesses. A count-shaped token inside a file that
     renders the comparison must be one of these, so a figure cannot be
     mistyped, rounded, or quietly recomputed from the raw records. */
  const frozen = new Set([
    ...p1.flatMap((r) => [r.coupledUnsafe.display, r.safeParallelism.display]),
    cred.serializedSameTargetContention.display,
    cred.parallelisedCrossTarget.display,
    cred.missedCrossTargetHazards.display,
    ...p2.map((r) => r.invalidOutcomes.display),
    judgeExport.provenance.matrix.display,
  ]);
  /* Counts this package already renders for other, separately gated evidence.
     Listed rather than pattern-matched so adding one is a deliberate edit. */
  const OTHER_EVIDENCE = new Set([
    '24/24', '9/9', '3/3', '2/3',
    /* HAC-330's counterfactual is written "the 140/120 counterfactual". It is a
       pair of bound values from a different experiment, not a count, and
       checkNumerals already holds it against the frozen arms. */
    '140/120',
  ]);

  /* A file "renders the comparison" when it names every strategy the export
     names. Anything less is prose mentioning an arm, not a comparison table. */
  const labels = p1.map((r) => r.label);
  const rendersComparison = (text) => labels.every((l) => text.includes(l));

  for (const [file, text] of Object.entries(prose)) {
    if (!rendersComparison(text)) continue;

    for (const m of text.matchAll(/\b\d+\/\d+\b/g)) {
      if (!frozen.has(m[0]) && !OTHER_EVIDENCE.has(m[0])) {
        fail(`${file}: renders ${m[0]}, which is not a frozen HAC-343 display value`);
      }
    }

    /* Panel 1 alone reads as "Interlock is the safe one". The export forbids
       that reading, and the only thing that refutes it is Panel 2 in the same
       place a judge is already looking. */
    for (const row of p2) {
      if (!text.includes(row.condition)) {
        fail(`${file}: shows the four-strategy comparison without the evidence-ablation condition "${row.condition}"`);
      }
    }

    /* Without the strip, A3 is a straw man: a lock that missed the hazards and
       is never shown to have locked anything. */
    for (const [name, fig] of [
      ['same-target contention serialized', cred.serializedSameTargetContention.display],
      ['cross-target pairs parallelised', cred.parallelisedCrossTarget.display],
      ['cross-target hazards missed', cred.missedCrossTargetHazards.display],
    ]) {
      if (!text.includes(fig)) {
        fail(`${file}: shows the comparison without the A3 credibility figure for ${name} (${fig})`);
      }
    }

    if (!/sixteen|16[- ]scenario/i.test(text)) {
      fail(`${file}: renders the comparison without stating the corpus it is bounded to`);
    }
  }

  /* The export names the readings it must never produce. Each one is checked
     against the assembled judge-facing copy, so a forbidden claim fails the
     build rather than a reviewer's attention. */
  /* Every occurrence, not the first. These phrases legitimately appear in this
     package as the negations the export requires ("Interlock is **not** 0%
     unsafe"), so a check that stopped at the first match would find the
     disclaimed one, pass, and never look at the undisclaimed claim below it. */
  const FORBIDDEN = [
    [/\b(0|zero)\s*%?\s*unsafe\b/gi, 'describes Interlock as 0% unsafe'],
    [/safer than (locking|locks|a lock)/gi, 'claims Interlock is safer than locking'],
    [/prevents (all )?(composition|collision)/gi, 'claims Interlock prevents composition hazards'],
    [/statistical(ly)? significan|confidence interval|\bp\s*<\s*0\./gi, 'claims statistical significance'],
  ];
  for (const [file, text] of Object.entries(prose)) {
    for (const [re, why] of FORBIDDEN) {
      for (const m of text.matchAll(re)) {
        if (!disclaimed(text, m.index, /\*\*not\*\*|is not|are not|never|must not|cannot|no confidence interval|no interval|not a sample|exhaustive/i, 90)) {
          fail(`${file}: ${why} — forbidden by judge-export mustNotClaim`);
        }
      }
    }
  }

  /* The statements this package used to make. They are false now, and a revert
     that reintroduced one would otherwise pass every other check here. */
  const STALE = [
    [/no SPR[^.]{0,90}(exists|appears|is shown)/i, 'asserts no SPR value exists'],
    [/evaluation is \*\*not yet bound\*\*/i, 'asserts the evaluation is not yet bound'],
    [/HAC-343[^.]{0,40}not bound/i, 'asserts HAC-343 is not bound'],
  ];
  for (const [file, text] of Object.entries(prose)) {
    for (const [re, why] of STALE) {
      if (re.test(text)) fail(`${file}: ${why}, contradicting the frozen HAC-343 result`);
    }
  }

  /* HAC-319 proper is still unbound, and the bound child must not be allowed to
     imply the unbound parent. IL-DIAG-013 is HAC-319's reserved shell. */
  if (registry.assets.some((a) => a.assetId === 'IL-DIAG-013')) {
    fail('IL-DIAG-013 is in the judge-facing registry; HAC-319 proper is still unbound');
  }
  for (const s of sequence.steps) {
    if ([s.primaryAsset, ...(s.supportingAssets || [])].includes('IL-DIAG-013')) {
      fail(`judge sequence step ${s.stepId} points at the unbound HAC-319 shell`);
    }
  }
  if (!sequence.excludedFromJudgePath.some((e) => e.assetId === 'IL-DIAG-013' && e.seamPreserved)) {
    fail('judge sequence does not record IL-DIAG-013 as excluded with its seam preserved');
  }
}

/* -- 15/16. captures match states the cockpit actually supports ------------ */

function checkCaptures({ captures, cockpit }, fail) {
  const supported = new Set(DECLARED_STATES);
  for (const run of Object.values(cockpit.runs)) {
    for (const arm of run.arms || []) if (arm.semanticState) supported.add(arm.semanticState);
  }

  for (const c of captures.captures) {
    if (!supported.has(c.semanticState)) {
      fail(`capture ${c.assetId} references semantic state ${c.semanticState}, which HAC-341 does not support`);
    }
    const urlProof = c.sourceUrl.includes('proof=cloud') ? 'B' : 'A';
    if (urlProof !== c.proofClass) {
      fail(`capture ${c.assetId} declares proof class ${c.proofClass} but its URL says ${urlProof}`);
    }
    const urlState = c.sourceUrl.match(/state=([^&]+)/)?.[1];
    if (urlState !== c.semanticState) {
      fail(`capture ${c.assetId} declares state ${c.semanticState} but its URL says ${urlState}`);
    }
    const stateClass = c.semanticState.startsWith('run.cloud') ? 'B' : 'A';
    if (stateClass !== c.proofClass) {
      fail(`capture ${c.assetId}: state ${c.semanticState} disagrees with proof class ${c.proofClass}`);
    }
  }
}

/* -- 17/18. naming contract, and nothing stale ----------------------------- */

function checkNamingAndFreshness({ root, registry, renderManifest }, fail) {
  for (const asset of registry.assets) {
    for (const e of asset.exports) {
      const name = e.file.split('/').pop();
      const v = validateExportName(name);
      if (!v.valid) fail(`export filename violates the naming contract: ${name} — ${v.error}`);
      else if (v.id !== asset.assetId) {
        fail(`export ${name} carries id ${v.id} but is registered under ${asset.assetId}`);
      }

      const abs = join(root, e.file);
      if (!existsSync(abs)) {
        fail(`registered export is missing on disk: ${e.file}`);
        continue;
      }
      const buf = readFileSync(abs);
      if (sha256(buf) !== e.sha256) fail(`registered export is stale: ${e.file}`);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w !== e.width || h !== e.height) {
        fail(`${e.file}: PNG header is ${w}x${h}, registry says ${e.width}x${e.height}`);
      }
    }

    if (asset.master) {
      const v = validateExportName(asset.master.split('/').pop());
      if (!v.valid) fail(`master filename violates the naming contract: ${asset.master} — ${v.error}`);
      if (asset.masterSha256 && existsSync(join(root, asset.master))
        && sha256(readFileSync(join(root, asset.master))) !== asset.masterSha256) {
        fail(`master is stale relative to the registry: ${asset.master}`);
      }
    }
  }

  // Consumed HAC-334 derivatives must still match their own render manifest.
  const renderRows = renderManifest.exports || renderManifest.renders || [];
  for (const asset of registry.assets.filter((a) => a.canonicalMasterIssue === 'HAC-334')) {
    for (const e of asset.exports) {
      const name = e.file.split('/').pop();
      const row = renderRows.find((r) => (r.file || r.export || '').endsWith(name));
      if (row?.sha256 && row.sha256 !== e.sha256) {
        fail(`${name}: HAC-335 registry digest disagrees with the HAC-334 render manifest`);
      }
    }
  }
}

/* -- captures still show what the cockpit renders -------------------------- */

/**
 * `capturedFromSha` was recorded and never compared to anything, so editing the
 * cockpit after a capture left four stale screenshots in the judge package with
 * no mechanical signal. A commit SHA cannot close that: the capture lands in
 * the same commit it would have to name. The digest over the render sources can
 * — it is computable before the commit exists and moves on any byte that can
 * change a captured pixel.
 */
function checkCaptureFreshness({ root, captures }, fail) {
  const recorded = captures.captureSourceDigest;
  if (!recorded) {
    fail('capture manifest records no captureSourceDigest; capture freshness is unprovable');
    return;
  }
  let actual;
  try {
    actual = captureSourceDigest(root);
  } catch (e) {
    fail(`cannot compute the capture source digest: ${e.message}`);
    return;
  }
  if (actual !== recorded) {
    fail('cockpit render sources changed since these captures were taken '
      + `(recorded ${recorded.slice(0, 12)}…, current ${actual.slice(0, 12)}…). `
      + 'Re-run media/hac-335/bin/capture-cockpit.mjs and commit the new frames.');
  }
  // The manifest also states which files the digest covers, so a hand-edited
  // manifest that narrows the set is visible rather than merely wrong.
  const declared = captures.captureSourceFiles;
  if (!Array.isArray(declared) || declared.length === 0) {
    fail('capture manifest does not record which sources its digest covers');
    return;
  }
  const expected = captureSourceFiles(root);
  const uncovered = expected.filter((f) => !declared.includes(f));
  if (uncovered.length) {
    fail(`capture source coverage narrowed; not declared: ${uncovered.join(', ')}`);
  }
}

/* -- 19. every judge-critical asset is registered -------------------------- */

function checkRegistryCoverage({ root, registry, sequence, shots, captures }, fail) {
  const registered = new Set(registry.assets.map((a) => a.assetId));
  const currentCapture = new Map(captures.captures.map((c) => [c.assetId, c]));

  for (const s of sequence.steps) {
    for (const id of [s.primaryAsset, ...(s.supportingAssets || [])].filter(Boolean)) {
      const base = id.replace(/-brief$/, '');
      if (!registered.has(base)) fail(`judge sequence step ${s.stepId} uses ${id}, absent from the registry`);
    }
  }
  for (const s of shots.screenshots) {
    if (!registered.has(s.assetId)) fail(`Devpost screenshot ${s.order} uses ${s.assetId}, absent from the registry`);
    if (!existsSync(join(root, s.file))) fail(`Devpost screenshot ${s.order} points at a missing file: ${s.file}`);
    // A historically valid PNG is not evidence for the current cockpit. The
    // source digest establishes that the current capture is fresh; bind every
    // Devpost cockpit slot to that exact capture so an old, still-present file
    // cannot quietly remain in the upload order after recapture.
    const current = currentCapture.get(s.assetId);
    if (current && s.file !== current.file) {
      fail(`Devpost screenshot ${s.order} uses stale ${s.assetId} file ${s.file}; current capture is ${current.file}`);
    }
  }
  for (const id of [shots.thumbnail.assetId, shots.architectureUpload.assetId]) {
    if (!registered.has(id)) fail(`Devpost ${id} is absent from the registry`);
  }
  for (const c of captures.captures) {
    if (!registered.has(c.assetId)) fail(`capture ${c.assetId} is absent from the registry`);
  }
}

/* -- 20. every material claim is in the ledger ----------------------------- */

const REQUIRED_NON_CLAIMS = [
  ['did not run on google cloud', 'HAC-330 did not run on Google Cloud'],
  ['agent runtime', 'Agent Runtime did not participate'],
  ['agent gateway', 'Agent Gateway did not participate'],
  ['content_authz', 'CONTENT_AUTHZ is not on the path'],
  ['exactly-once', 'no exactly-once guarantee'],
  ['fleet-scale', 'no fleet-scale readiness'],
];

function checkClaimLedger({ ledger, sequence, registry }, fail) {
  const ledgerIds = new Set(ledger.claims.map((c) => c.id));
  for (const s of sequence.steps) {
    for (const id of s.claimIds || []) {
      if (!ledgerIds.has(id)) fail(`judge sequence step ${s.stepId} cites ${id}, absent from the claim ledger`);
    }
  }
  for (const a of registry.assets) {
    for (const id of a.claimIds || []) {
      if (!ledgerIds.has(id)) fail(`asset ${a.assetId} cites ${id}, absent from the claim ledger`);
    }
  }
  for (const c of ledger.claims) {
    if (!ledger.classifications[c.classification]) {
      fail(`claim ${c.id} has an unknown classification "${c.classification}"`);
    }
    if (!c.proofSource) fail(`claim ${c.id} has no proof source`);
  }
  const ledgerBlob = JSON.stringify(ledger).toLowerCase();
  for (const [needle, label] of REQUIRED_NON_CLAIMS) {
    if (!ledgerBlob.includes(needle)) fail(`claim ledger no longer carries the frozen non-claim: ${label}`);
  }
}

/* -- identity survives both themes ----------------------------------------- */

/**
 * A markdown `<img>` loads its SVG as a separate, sandboxed document with no
 * inherited `color`, so a root `fill="currentColor"` resolves to black. On a
 * dark README that is an invisible mark: the page silently loses its identity
 * while every other gate still passes.
 *
 * This repository has now hit that class twice — once where the white lockup
 * was re-wrapped without carrying its root fill, and once here — so it earns a
 * check rather than a comment. Theme-fixed `-black`/`-white` variants exist for
 * exactly this, paired inside a `<picture>`.
 */
function checkThemeSafeIdentity({ root, prose }, fail) {
  const imgRe = /<img\b[^>]*\bsrc="([^"]+\.svg)"/g;
  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(imgRe)) {
      const src = m[1];
      if (/^https?:/.test(src)) continue;
      if (!existsSync(join(root, src))) {
        fail(`${file}: embeds a missing SVG: ${src}`);
        continue;
      }
      const rootFill = readFileSync(join(root, src), 'utf8').match(/<svg[^>]*\sfill="([^"]*)"/)?.[1];
      if (rootFill === 'currentColor') {
        fail(`${file}: embeds ${src}, whose root fill is currentColor — it renders black and vanishes on a dark background; pair the theme-fixed -black/-white variants in a <picture>`);
      }
    }
  }
}

/* -- sequence integrity ---------------------------------------------------- */

function checkSequenceOrder({ sequence, shots }, fail) {
  if (sequence.steps.some((s, i) => s.order !== i + 1)) {
    fail('judge sequence steps are not contiguously ordered from 1');
  }

  const step = (id) => sequence.steps.find((s) => s.stepId === id);
  const causal = step('seq.causal-proof');
  const cloudStep = step('seq.cloud-participation');
  const reset = step('seq.proof-class-reset');
  const arch = step('seq.architecture');

  if (!(causal && cloudStep && reset && arch)) {
    fail('judge sequence is missing a required step');
  } else {
    if (!(causal.order < reset.order && reset.order < cloudStep.order)) {
      fail('judge sequence does not place the proof-class reset between the causal proof and cloud participation');
    }
    if (causal.order >= arch.order) fail('judge sequence puts architecture before the causal result');
    if (sequence.steps[0].proofClass !== 'A') fail('judge sequence does not open on the controlled local experiment');
  }

  if (!sequence.steps[0].primaryAsset.startsWith('IL-PROOF-010')) {
    fail('judge sequence hero is not IL-PROOF-010');
  }
  if (shots.thumbnail.assetId.startsWith('IL-COCK')) {
    fail('Devpost thumbnail is a cockpit capture; the cockpit is a verification surface, not the hero');
  }
}

/* -- run ------------------------------------------------------------------- */

/* -- prose asset references resolve on disk ------------------------------- */

/**
 * A README image that 404s is worse here than in most repositories: this one
 * opens with "What changed because Interlock existed?" and answers it in
 * pictures, so a missing capture reads as evidence that is not there.
 *
 * This is not hypothetical. The README pointed at
 * `IL-COCK-010-...-1440x566-...png` while the file on disk — and the entry in
 * capture-manifest.json — was `1440x774`. The capture had been retaken at a
 * different crop height and the prose reference never followed it. Every
 * other gate passed, because nothing compared a prose link against the
 * filesystem.
 *
 * Scoped to media assets rather than every relative link. Document links are a
 * different concern, and checking them here would tie this gate to how
 * completely test/hac-335-package-gates.test.mjs mirrors the repository into
 * its scratch directory — a fixture detail that should not decide whether the
 * package is judged sound.
 */
const ASSET_EXT = /\.(?:png|jpg|jpeg|gif|webp|svg|mp4|webm|pdf)$/i;

function checkProseAssetsResolve({ root, prose }, fail) {
  // Markdown inline links and images: ](target "optional title").
  const TARGET = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const [file, text] of Object.entries(prose)) {
    const fromDir = dirname(join(root, file));

    for (const [, raw] of text.matchAll(TARGET)) {
      if (/^(?:https?:|mailto:|data:|#)/.test(raw)) continue;

      // A fragment or query still leaves a real file that has to exist.
      const path = raw.replace(/[#?].*$/, '');
      if (!path || !ASSET_EXT.test(path)) continue;

      const resolved = path.startsWith('/')
        ? join(root, path.slice(1))
        : join(fromDir, path);

      if (!existsSync(resolved)) {
        fail(`${file} references ${raw}, which does not exist`);
      }
    }
  }
}

const CHECKS = [
  checkProseAssetsResolve,
  checkProofClassSeparation,
  checkUnsupportedStates,
  checkCloudControls,
  checkNumerals,
  checkEvidenceUrls,
  checkWithheldEvidence,
  checkRevisions,
  checkEvaluationBound,
  checkCaptures,
  checkCaptureFreshness,
  checkNamingAndFreshness,
  checkRegistryCoverage,
  checkClaimLedger,
  checkThemeSafeIdentity,
  checkSequenceOrder,
];

export function verifyPackage(root = repoRoot) {
  const ctx = loadContext(root);
  const failures = [];
  const fail = (m) => failures.push(m);
  for (const check of CHECKS) check(ctx, fail);
  return failures;
}

/**
 * Compare real paths. A plain `file://${process.argv[1]}` test silently skips
 * the whole gate when the script is invoked through a symlinked directory —
 * macOS `/var` -> `/private/var` is the common case — and a skipped gate exits
 * 0 with no output, which is indistinguishable from a pass.
 */
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const failures = verifyPackage();
  if (failures.length) {
    console.error('HAC-335 package FAILED');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  const { registry, ledger, sequence } = loadContext(repoRoot);
  const exportCount = registry.assets.reduce((n, a) => n + a.exports.length, 0);
  const resetStep = sequence.steps.find((s) => s.stepId === 'seq.proof-class-reset');
  console.log('HAC-335 judge package verified');
  console.log(`  judge sequence ${sequence.steps.length} steps, hero ${sequence.steps[0].primaryAsset}, reset at step ${resetStep.order}`);
  console.log(`  registry ${registry.assets.length} assets, ${exportCount} exports, naming contract clean`);
  console.log(`  claim ledger ${ledger.claims.length} claims, every cited id resolved`);
  console.log('  proof classes separate, evidence links commit-pinned');
  console.log('  HAC-343 bound to the frozen judge export, panels adjacent; HAC-319 proper still unbound');
}
