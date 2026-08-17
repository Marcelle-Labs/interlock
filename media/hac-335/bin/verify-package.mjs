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
 * Every check below has a matching negative case in
 * test/hac-335-package-gates.test.mjs.
 *
 *     node media/hac-335/bin/verify-package.mjs
 */

import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

export function verifyPackage(root = repoRoot) {
  const failures = [];
  const fail = (m) => failures.push(m);
  const readText = (p) => readFileSync(join(root, p), 'utf8');
  const readJson = (p) => JSON.parse(readText(p));
  const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

  /* -- frozen sources of truth -------------------------------------------- */

  const arms = readJson('experiments/hac-330/evidence/arms.json');
  const results = readJson('experiments/hac-330/evidence/results.json');
  const cloud = readJson('experiments/hac-342/evidence/cloud-run.public.json');
  const bindings = readJson('experiments/hac-342/evidence/publication-bindings.json');
  const snapshot = readJson('experiments/hac-342/evidence/runtime-source-snapshot.json');
  const storyboard = readJson('media/hac-333/scene-manifest.json');
  const hac334 = readJson('media/hac-334/evidence/asset-registry.json');
  const renderManifest = readJson('media/hac-334/exports/render-manifest.json');

  const registry = readJson('media/hac-335/evidence/asset-registry.json');
  const ledger = readJson('media/hac-335/evidence/claim-ledger.json');
  const sequence = readJson('media/hac-335/evidence/judge-sequence.json');
  const captures = readJson('media/hac-335/evidence/capture-manifest.json');
  const shots = readJson('media/hac-335/devpost/screenshot-order.json');
  const cockpit = readJson('media/hac-341/evidence/view-model.json');

  /** Judge-facing prose. Everything a judge actually reads. */
  const devpostDir = 'media/hac-335/devpost';
  const proseFiles = [
    'README.md',
    ...readdirSync(join(root, devpostDir))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `${devpostDir}/${f}`),
  ];
  const prose = Object.fromEntries(proseFiles.map((f) => [f, readText(f)]));
  const allProse = Object.values(prose).join('\n');
  const captionText = [
    ...shots.screenshots.map((s) => s.caption),
    shots.thumbnail.proposition,
  ].join('\n');
  const judgeText = `${allProse}\n${captionText}`;

  /* -- 1. the two proof classes never become one run ----------------------- */

  // A single sentence naming both issues is how "one combined experiment" gets
  // in. Allowed only where the sentence is explicitly separating them.
  const SEPARATORS = /neither|separate|different run|two runs|not .*reproduce|does not|apart|reset/i;
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      if (/HAC-330/.test(line) && /HAC-340/.test(line) && !SEPARATORS.test(line)) {
        fail(`${file}: names HAC-330 and HAC-340 in one sentence without separating them: "${line.trim().slice(0, 110)}"`);
      }
    }
  }
  // The synthetic chain that must never appear as one run.
  if (/WITHHOLD_SERIALIZE[\s\S]{0,160}alpha=45/.test(judgeText)) {
    fail('judge copy chains WITHHOLD_SERIALIZE to alpha=45; that sequence is not one run');
  }

  /* -- 2. AUTHORIZED is never an evidenced current state ------------------- */

  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(/AUTHORIZED/g)) {
      const around = text.slice(Math.max(0, m.index - 120), m.index + 120);
      if (!/not|never|no .*lifecycle|is not/i.test(around)) {
        fail(`${file}: AUTHORIZED appears without a negation; it is not an evidenced state`);
      }
    }
  }

  /* -- 3. Agent Runtime / Gateway never appear as participation ------------ */

  for (const [file, text] of Object.entries(prose)) {
    for (const term of ['Agent Runtime', 'Agent Gateway', 'CONTENT_AUTHZ']) {
      for (const m of text.matchAll(new RegExp(term, 'g'))) {
        const around = text.slice(Math.max(0, m.index - 200), m.index + 200);
        if (!/not on|did not|absent|not claimed|no[t]? particip/i.test(around)) {
          fail(`${file}: "${term}" appears without a disclaimer nearby`);
        }
      }
    }
  }

  /* -- 4/5. cloud controls, and wrong-audience is not a cloud control ------ */

  const CONTROLS = {
    forgedHeaderStatus: 403,
    wrongAudienceStatus: 401,
    directBypassStatus: 403,
  };
  for (const [k, expected] of Object.entries(CONTROLS)) {
    if (cloud.controls[k] !== expected) {
      fail(`frozen cloud control ${k} is ${cloud.controls[k]}, expected ${expected}`);
    }
  }
  // The prose row for the 401 must describe an invalid token, never a genuine
  // wrong-audience rejection, because the control sent an invalid token.
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      if (/wrong[- ]audience/i.test(line)) {
        if (!/local parity|not a .*cloud|controlled local/i.test(line)) {
          fail(`${file}: wrong-audience described without marking it local parity: "${line.trim().slice(0, 110)}"`);
        }
      }
    }
  }

  /* -- 6. HAC-330 numerals do not drift ------------------------------------ */

  const armTotals = {};
  for (const [name, arm] of Object.entries(arms)) {
    const found = JSON.stringify(arm).match(/\b1[234]0\b/g) || [];
    armTotals[name] = found;
  }
  const armsBlob = JSON.stringify(arms);
  const EXPECTED_NUMERALS = { baseline: 140, treatment: 120, bound: 130 };
  for (const [label, n] of Object.entries(EXPECTED_NUMERALS)) {
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
  // The prose must quote what the evidence says.
  const proseChecks = allProse.match(/(\d+)\s*\/\s*(\d+)\s*(?:checks)?/gi) || [];
  if (!allProse.includes(`${checksPassed}/${checksTotal}`)) {
    fail(`judge copy does not state the frozen check count ${checksPassed}/${checksTotal}`);
  }
  for (const pair of [`${EXPECTED_NUMERALS.baseline} > ${EXPECTED_NUMERALS.bound}`, `${EXPECTED_NUMERALS.treatment} <= ${EXPECTED_NUMERALS.bound}`]) {
    if (!allProse.includes(pair)) fail(`judge copy no longer states the frozen comparison "${pair}"`);
  }
  // Decisions must match the frozen arms.
  for (const decision of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL']) {
    if (!armsBlob.includes(decision)) fail(`frozen arms no longer contain decision ${decision}`);
    if (!allProse.includes(decision)) fail(`judge copy no longer states decision ${decision}`);
  }

  /* -- 7. alpha=45 does not drift ------------------------------------------ */

  const observedAlpha = cloud.observation?.state?.services?.alpha;
  if (observedAlpha === undefined) fail('public packet has no observation.state.services.alpha');
  if (!allProse.includes(`alpha=${observedAlpha}`)) {
    fail(`judge copy does not state the observed value alpha=${observedAlpha} from the public packet`);
  }

  /* -- 8/9. public evidence URLs are immutable and registered -------------- */

  const urlRe = /https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/Marcelle-Labs\/interlock\/(?:blob\/)?([^/\s)"']+)\/([^\s)"'|]+)/g;
  const registeredUrls = new Set(
    JSON.stringify(registry).match(/https:\/\/[^"\s]+/g) || [],
  );
  const seen = new Set();
  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(urlRe)) {
      const [url, ref] = m;
      seen.add(url);
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        fail(`${file}: evidence URL is not pinned to a commit (ref "${ref}"): ${url}`);
      }
      const known = [...registeredUrls].some((r) => r.split('#')[0] === url.replace(/[).,]+$/, ''));
      if (!known) fail(`${file}: evidence URL is absent from the asset registry: ${url}`);
    }
  }
  if (!seen.size) fail('judge copy contains no immutable evidence URL at all');

  /* -- 10. runtimeSourceUrl is never fabricated ---------------------------- */

  if (snapshot.runtimeSourceShaPublished !== false) {
    fail('runtime-source-snapshot no longer marks the runtime source as unpublished');
  }
  const runtimeSha = snapshot.runtimeSourceSha;
  for (const [file, text] of Object.entries(prose)) {
    if (new RegExp(`https?://[^\\s)"']*${runtimeSha}`).test(text)) {
      fail(`${file}: fabricates a URL for the unpublished runtimeSourceSha`);
    }
  }
  const regBlob = JSON.stringify(registry);
  if (new RegExp(`https?://[^"\\s]*${runtimeSha}`).test(regBlob)) {
    fail('asset registry fabricates a URL for the unpublished runtimeSourceSha');
  }
  if (registry.publicEvidence.runtimeSourceUrl?.state !== 'unavailable / non-public') {
    fail('asset registry does not render runtimeSourceUrl as unavailable / non-public');
  }
  // runtimeSourceSha and evidencePublicationSha must stay distinct values.
  if (registry.publicEvidence.runtimeSourceSha === registry.publicEvidence.evidencePublicationSha) {
    fail('runtimeSourceSha and evidencePublicationSha have collapsed into one value');
  }

  /* -- 11. sourcePacketSha is never described as recomputable -------------- */

  if (bindings.digests.sourcePacketPublished !== false) {
    fail('publication bindings no longer mark the source packet as unpublished');
  }
  if (bindings.deliberatelyUnbound?.runtimeSourceUrl?.state !== 'unavailable / non-public') {
    fail('publication bindings no longer record runtimeSourceUrl as unavailable / non-public');
  }
  const shortSource = bindings.digests.sourcePacketSha256.slice(0, 8);
  for (const [file, text] of Object.entries(prose)) {
    for (const line of text.split('\n')) {
      if (line.includes('sourcePacketSha256') || line.includes(shortSource)) {
        if (/recompute|recomputable|verify it yourself|check it yourself/i.test(line)
          && !/not |no\b|private|unpublished/i.test(line)) {
          fail(`${file}: describes sourcePacketSha256 as recomputable: "${line.trim().slice(0, 110)}"`);
        }
      }
    }
  }

  /* -- 12. no unevidenced agent/target revision ---------------------------- */

  const EVIDENCED_REVISION = 'interlock-hac340-proxy-00002-wzf';
  const cloudBlob = JSON.stringify(cloud);
  if (!cloudBlob.includes(EVIDENCED_REVISION)) {
    fail(`public packet no longer names the evidenced revision ${EVIDENCED_REVISION}`);
  }
  const revisionRe = /interlock-hac340-[a-z]+-\d{5}-[a-z0-9]+/g;
  for (const [file, text] of Object.entries({ ...prose, 'asset-registry.json': regBlob })) {
    for (const m of text.matchAll(revisionRe)) {
      if (m[0] !== EVIDENCED_REVISION) {
        fail(`${file}: names an unevidenced deployment revision ${m[0]}`);
      }
    }
  }

  /* -- 13/14. HAC-319 is not bound, and no metric appears ------------------ */

  const HAC319_METRICS = /\bSPR\b|useful[- ]concurrency|false[- ]block/gi;
  for (const [file, text] of Object.entries(prose)) {
    for (const m of text.matchAll(HAC319_METRICS)) {
      const around = text.slice(Math.max(0, m.index - 200), m.index + 200);
      if (!/not|no |none|unbound|not yet bound|withheld/i.test(around)) {
        fail(`${file}: mentions a HAC-319 metric without marking it unbound`);
      }
      // A metric adjacent to a number is a rendered value, disclaimed or not.
      if (new RegExp(`${m[0]}[^.\\n]{0,24}\\d`, 'i').test(text.slice(m.index))) {
        fail(`${file}: a HAC-319 metric appears next to a numeric value`);
      }
    }
  }
  if (registry.assets.some((a) => a.assetId === 'IL-DIAG-013')) {
    fail('IL-DIAG-013 is in the judge-facing registry; the evaluation shell is not bound');
  }
  for (const s of sequence.steps) {
    const assets = [s.primaryAsset, ...(s.supportingAssets || [])];
    if (assets.includes('IL-DIAG-013')) {
      fail(`judge sequence step ${s.stepId} points at the unbound evaluation shell`);
    }
  }
  if (!sequence.excludedFromJudgePath.some((e) => e.assetId === 'IL-DIAG-013' && e.seamPreserved)) {
    fail('judge sequence does not record IL-DIAG-013 as excluded with its seam preserved');
  }

  /* -- 15/16. screenshots match states the cockpit actually supports ------- */

  const cockpitStates = new Set();
  for (const run of Object.values(cockpit.runs)) {
    for (const arm of run.arms || []) if (arm.semanticState) cockpitStates.add(arm.semanticState);
  }
  // Fall back to the declared deep-link vocabulary where arms do not name them.
  for (const s of cockpit.deepLink?.states || []) cockpitStates.add(s);
  const DECLARED = new Set(['run.local.baseline', 'run.local.treatment', 'run.local.perturbed', 'run.cloud.overview']);
  for (const c of captures.captures) {
    if (!DECLARED.has(c.semanticState) && !cockpitStates.has(c.semanticState)) {
      fail(`capture ${c.assetId} references semantic state ${c.semanticState}, which HAC-341 does not support`);
    }
    const urlProof = /proof=cloud/.test(c.sourceUrl) ? 'B' : 'A';
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

  /* -- 17. every export filename passes the frozen naming contract --------- */

  for (const asset of registry.assets) {
    for (const e of asset.exports) {
      const name = e.file.split('/').pop();
      const v = validateExportName(name);
      if (!v.valid) fail(`export filename violates the naming contract: ${name} — ${v.error}`);
      else if (v.id !== asset.assetId) {
        fail(`export ${name} carries id ${v.id} but is registered under ${asset.assetId}`);
      }
    }
    if (asset.master) {
      const v = validateExportName(asset.master.split('/').pop());
      if (!v.valid) fail(`master filename violates the naming contract: ${asset.master} — ${v.error}`);
    }
  }

  /* -- 18. no derivative is stale relative to its source ------------------- */

  for (const asset of registry.assets) {
    for (const e of asset.exports) {
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
    if (asset.master && asset.masterSha256) {
      const buf = readFileSync(join(root, asset.master));
      if (sha256(buf) !== asset.masterSha256) fail(`master is stale relative to the registry: ${asset.master}`);
    }
  }
  // Consumed HAC-334 derivatives must still match their own render manifest.
  const renderRows = renderManifest.exports || renderManifest.renders || [];
  for (const asset of registry.assets.filter((a) => a.canonicalMasterIssue === 'HAC-334')) {
    for (const e of asset.exports) {
      const name = e.file.split('/').pop();
      const row = renderRows.find((r) => (r.file || r.export || '').endsWith(name));
      if (row && row.sha256 && row.sha256 !== e.sha256) {
        fail(`${name}: HAC-335 registry digest disagrees with the HAC-334 render manifest`);
      }
    }
  }

  /* -- 19. every judge-critical asset is in the registry ------------------- */

  const registered = new Set(registry.assets.map((a) => a.assetId));
  for (const s of sequence.steps) {
    for (const id of [s.primaryAsset, ...(s.supportingAssets || [])].filter(Boolean)) {
      const base = id.replace(/-brief$/, '');
      if (!registered.has(base)) fail(`judge sequence step ${s.stepId} uses ${id}, absent from the registry`);
    }
  }
  for (const s of shots.screenshots) {
    if (!registered.has(s.assetId)) fail(`Devpost screenshot ${s.order} uses ${s.assetId}, absent from the registry`);
    if (!existsSync(join(root, s.file))) fail(`Devpost screenshot ${s.order} points at a missing file: ${s.file}`);
  }
  for (const id of [shots.thumbnail.assetId, shots.architectureUpload.assetId]) {
    if (!registered.has(id)) fail(`Devpost ${id} is absent from the registry`);
  }
  for (const c of captures.captures) {
    if (!registered.has(c.assetId)) fail(`capture ${c.assetId} is absent from the registry`);
  }

  /* -- 20. every material claim is in the ledger --------------------------- */

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
  // The global non-claims HAC-333 froze must all still be represented.
  const ledgerBlob = JSON.stringify(ledger).toLowerCase();
  const REQUIRED_NON_CLAIMS = [
    ['did not run on google cloud', 'HAC-330 did not run on Google Cloud'],
    ['agent runtime', 'Agent Runtime did not participate'],
    ['agent gateway', 'Agent Gateway did not participate'],
    ['content_authz', 'CONTENT_AUTHZ is not on the path'],
    ['exactly-once', 'no exactly-once guarantee'],
    ['fleet-scale', 'no fleet-scale readiness'],
  ];
  for (const [needle, label] of REQUIRED_NON_CLAIMS) {
    if (!ledgerBlob.includes(needle)) fail(`claim ledger no longer carries the frozen non-claim: ${label}`);
  }

  /* -- sequence integrity -------------------------------------------------- */

  const orders = sequence.steps.map((s) => s.order);
  if (orders.some((o, i) => o !== i + 1)) fail('judge sequence steps are not contiguously ordered from 1');
  const causal = sequence.steps.find((s) => s.stepId === 'seq.causal-proof');
  const cloudStep = sequence.steps.find((s) => s.stepId === 'seq.cloud-participation');
  const reset = sequence.steps.find((s) => s.stepId === 'seq.proof-class-reset');
  const arch = sequence.steps.find((s) => s.stepId === 'seq.architecture');
  if (!(causal && cloudStep && reset && arch)) fail('judge sequence is missing a required step');
  else {
    if (!(causal.order < reset.order && reset.order < cloudStep.order)) {
      fail('judge sequence does not place the proof-class reset between the causal proof and cloud participation');
    }
    if (!(causal.order < arch.order)) fail('judge sequence puts architecture before the causal result');
    if (sequence.steps[0].proofClass !== 'A') fail('judge sequence does not open on the controlled local experiment');
  }
  // The hero must be the causal master, never the cockpit.
  if (!sequence.steps[0].primaryAsset.startsWith('IL-PROOF-010')) {
    fail('judge sequence hero is not IL-PROOF-010');
  }
  if (shots.thumbnail.assetId.startsWith('IL-COCK')) {
    fail('Devpost thumbnail is a cockpit capture; the cockpit is a verification surface, not the hero');
  }

  return failures;
}

/* -- cli ------------------------------------------------------------------- */

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
  const registry = JSON.parse(readFileSync(join(repoRoot, 'media/hac-335/evidence/asset-registry.json'), 'utf8'));
  const ledger = JSON.parse(readFileSync(join(repoRoot, 'media/hac-335/evidence/claim-ledger.json'), 'utf8'));
  const sequence = JSON.parse(readFileSync(join(repoRoot, 'media/hac-335/evidence/judge-sequence.json'), 'utf8'));
  const exports = registry.assets.reduce((n, a) => n + a.exports.length, 0);
  console.log('HAC-335 judge package verified');
  console.log(`  judge sequence ${sequence.steps.length} steps, hero ${sequence.steps[0].primaryAsset}, reset at step ${sequence.steps.find((s) => s.stepId === 'seq.proof-class-reset').order}`);
  console.log(`  registry ${registry.assets.length} assets, ${exports} exports, naming contract clean`);
  console.log(`  claim ledger ${ledger.claims.length} claims, every cited id resolved`);
  console.log('  proof classes separate, evidence links commit-pinned, HAC-319 unbound and unrendered');
}
