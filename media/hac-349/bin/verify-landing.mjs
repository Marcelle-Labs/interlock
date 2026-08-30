#!/usr/bin/env node
/**
 * Refuses a judge landing surface that has drifted from what the evidence
 * supports.
 *
 * The failure this file exists to prevent is a front door that is easier to
 * read than the evidence is: a figure typed in because it was true last week, a
 * gloss that replaced the token it was supposed to sit beside, a control named
 * "Simulate" over two frozen records, or a simplification that quietly turns a
 * bounded result into a global claim.
 *
 * Every assertion re-derives from the frozen HAC-343 artifacts, so changing the
 * evidence moves the expectation with it. Nothing here asserts a constant for
 * its own sake.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStory, judgeFacing, JUDGE_FACING_FIELDS, ARTIFACTS, EXPORT, RAW,
  FORBIDDEN_CLAIMS, GLOSSES, ARM_FRAMING, L1_SCENARIO, forbiddenHits,
  DISCLAIMER_FIELDS, DISCLAIMER_HEADINGS,
} from '../lib/story.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const readJson = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));
const readText = (...p) => readFileSync(join(repoRoot, ...p), 'utf8');

const errors = [];
const fail = (m) => errors.push(m);
let checks = 0;
const check = (condition, message) => { checks += 1; if (!condition) fail(message); };

const landing = readText('media', 'hac-349', 'landing.html');
const model = readJson('media', 'hac-349', 'evidence', 'landing-model.json');
const exported = readJson('experiments', 'hac-343', 'evidence', 'judge-export.json');
const vercel = readJson('vercel.json');

/* --- 1. identity assets survive a constrained preview host --------------- */

for (const [label, href, path] of [
  ['token entry point', '../../assets/styles.css', ['assets', 'styles.css']],
  ['Geist face', '../../assets/fonts/geist-variable.woff2', ['assets', 'fonts', 'geist-variable.woff2']],
  ['Geist Mono face', '../../assets/fonts/geist-mono-variable.woff2', ['assets', 'fonts', 'geist-mono-variable.woff2']],
]) {
  check(landing.includes(href), `landing does not link the repository-local ${label}`);
  check(existsSync(join(repoRoot, ...path)), `repository-local ${label} is missing`);
}
check(/@font-face\s*\{[^}]*font-family:\s*"Geist"/.test(landing),
  'landing has no direct Geist fallback when a preview host drops CSS imports');
check(/@font-face\s*\{[^}]*font-family:\s*"Geist Mono"/.test(landing),
  'landing has no direct Geist Mono fallback when a preview host drops CSS imports');

/* No off-origin dependency may render this page. A judge-facing surface that
   needs the network to draw is a surface that cannot be captured or reviewed
   offline. Same discipline the cockpit and the storyboard already hold. */
for (const m of landing.matchAll(/(?:src|href)\s*=\s*"(https?:)?\/\/[^"]+"/g)) {
  fail(`landing has an off-origin dependency: ${m[0]}`);
}
checks += 1;

/* --- 2. the model is what the frozen evidence produces ------------------- */

const sources = Object.fromEntries(ARTIFACTS.map((rel) => {
  try { return [rel, JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))]; } catch { return [rel, undefined]; }
}).filter(([, v]) => v !== undefined));

const rebuilt = buildStory(sources);
check(JSON.stringify(judgeFacing(rebuilt)) === JSON.stringify(judgeFacing(model)),
  'the committed landing model is not what its cited artifacts produce; run pnpm run landing:build');

for (const field of JUDGE_FACING_FIELDS) {
  check(judgeFacing(model)?.[field] !== undefined, `judge-facing projection is missing ${field}`);
}
check(model.resolved && model.unresolved.length === 0,
  `landing model has unresolved bindings: ${model.unresolved.join(', ')}`);
check(!JSON.stringify(model).includes('[BIND:'),
  'landing model still carries an unresolved binding marker');

/* --- 3. every prominent figure equals its canonical source --------------- */

/* Panel 1, cell by cell, against the export rather than against a constant. */
exported.panel1.rows.forEach((row, i) => {
  const arm = model.comparison.strategies[i];
  check(arm?.armId === row.arm, `strategy ${i} is ${arm?.armId}, not the export's ${row.arm}`);
  check(arm?.label === row.label, `strategy ${row.arm} is labelled ${arm?.label}, not ${row.label}`);
  check(arm?.invalidCoupled.display === row.coupledUnsafe.display,
    `${row.arm} invalid-coupled is ${arm?.invalidCoupled.display}, not ${row.coupledUnsafe.display}`);
  check(arm?.safeParallelRetained.display === row.safeParallelism.display,
    `${row.arm} safe-parallelism is ${arm?.safeParallelRetained.display}, not ${row.safeParallelism.display}`);
});
check(model.comparison.strategies.length === exported.panel1.rows.length,
  'the landing shows a different number of strategies than the export records');

/* The A3 credibility strip. Without all three figures the per-target lock is a
   straw man: a lock that missed the hazards and is never shown to have locked
   anything, or a lock that is shown locking and never shown paying for it. */
const cred = exported.panel1.perTargetLockCredibility;
for (const [label, got, want] of [
  ['same-target contention serialised', model.lock.sameTarget.figure, cred.serializedSameTargetContention.display],
  ['cross-target pairs parallelised', model.lock.crossTarget.figure, cred.parallelisedCrossTarget.display],
  ['cross-target hazards missed', model.lock.missed.figure, cred.missedCrossTargetHazards.display],
]) check(got === want, `A3 ${label} is ${got}, not the frozen ${want}`);

for (const fig of [cred.serializedSameTargetContention.display, cred.parallelisedCrossTarget.display,
  cred.missedCrossTargetHazards.display]) {
  check(JSON.stringify(model.lock).includes(fig),
    `the lock section omits the A3 credibility figure ${fig}`);
}

/* The lock keys are the argument, so they have to be the recorded ones. */
const rawResults = sources[RAW];
const lockGroupsOf = (scenarioId) => rawResults?.records
  ?.find((r) => r.scenarioId === scenarioId && r.arm === 'A3_per_target_lock' && r.order === 'AB')?.lockGroups;
check(JSON.stringify(model.lock.crossTarget.keys) === JSON.stringify(lockGroupsOf(L1_SCENARIO)),
  'the cross-target lock keys shown are not the recorded lockGroups');
check(model.lock.crossTarget.keys?.length === 2,
  'the cross-target beat does not show two distinct lock keys, which is the whole argument');
check(model.lock.sameTarget.keys?.length === 1,
  'the same-target beat does not show a single lock key');
check(model.lock.crossTarget.concurrent === true && model.lock.sameTarget.concurrent === false,
  'the lock beats contradict the recorded concurrency of their scenarios');

/* Panel 2, both rows, with the decisions the export records. */
exported.panel2.rows.forEach((row, i) => {
  const got = model.ablation.rows[i];
  check(got?.condition === row.condition, `ablation row ${i} condition drifted from the export`);
  check(got?.invalidOutcomes === row.invalidOutcomes.display,
    `ablation row ${i} is ${got?.invalidOutcomes}, not the frozen ${row.invalidOutcomes.display}`);
  check(JSON.stringify(got?.decisions) === JSON.stringify(row.decision),
    `ablation row ${i} decisions drifted from the export`);
});

/* Panel 2 travels with Panel 1 or not at all. Panel 1 alone reads as
   "Interlock is the safe one", which is exactly the reading the export
   forbids. */
check(landing.includes('id="compare"') && landing.includes('id="ablation"'),
  'the four-arm comparison and the evidence ablation are not both on the page');
check(landing.indexOf('id="compare"') < landing.indexOf('id="ablation"'),
  'the evidence ablation does not follow the four-arm comparison');

/* The L1 scene is the experiment's own scenario, and its arithmetic is the
   verifier's, not ours. */
const oracleOf = (arm) => {
  const rec = rawResults?.records?.find((r) => r.scenarioId === L1_SCENARIO && r.arm === arm && r.order === 'AB');
  try { return JSON.parse(rec.oracle.stdout); } catch { return null; }
};
const jointOracle = oracleOf('A1_uncoordinated');
const aloneOracle = oracleOf('A4_interlock');
check(model.scene.joint.total === jointOracle?.total,
  'the joint total on the first frame is not the verifier\'s recorded total');
check(model.scene.ceiling === jointOracle?.totalReservable,
  'the ceiling on the first frame is not the recorded ceiling');
check(model.scene.alone.total === aloneOracle?.total,
  'the single-action total on the first frame is not a recorded verifier total');
check(model.scene.joint.holds === false && model.scene.alone.holds === true,
  'the first frame does not show a locally valid pair composing into an invalid joint outcome');
check(model.scene.actions?.length === 2
  && model.scene.actions[0].path !== model.scene.actions[1].path,
  'the first frame does not show two actions on two different targets');

/* --- 4. the claim gate --------------------------------------------------- */

/*
 * What a judge can read, as one string.
 *
 * The page is mostly a template, so its prose lives in template literals. Both
 * comment forms are stripped first: this file's own reasoning about forbidden
 * phrases is not judge-facing copy, and a gate that flagged its own rationale
 * would push the rationale out of the source.
 */
const strip = (html) => html
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/*
 * The model is scanned too. A forbidden phrase reached through a bound value is
 * the same phrase on screen, and the export is not immune to being paraphrased
 * into one by a later edit upstream.
 *
 * The declared disclaimer lists come out first. `mustNotClaim` says "Interlock
 * is 0% unsafe" *in order to forbid it*, and `outsideScope` says "exactly-once
 * execution" in order to place it outside the experiment — scanning them for
 * forbidden phrases is scanning a prohibition list for prohibitions. They are
 * covered instead by the two checks below, which are stronger than a phrase
 * scan: byte-identical to their frozen source, and rendered under a heading
 * that negates them.
 */
const at = (root, path) => String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), root);
/* A deep copy. `judgeFacing` returns a fresh object whose *values* are still
   references into the model, so deleting a field from it would delete it from
   the model the checks below compare against. */
const scanned = structuredClone(judgeFacing(model));
for (const [field] of DISCLAIMER_FIELDS) {
  const parts = field.split('.');
  const parent = at(scanned, parts.slice(0, -1).join('.'));
  if (parent) delete parent[parts.at(-1)];
}
const judgeCopy = `${strip(landing)}\n${JSON.stringify(scanned)}`;

for (const [field, artifact, path] of DISCLAIMER_FIELDS) {
  const shipped = at(judgeFacing(model), field);
  const frozen = at(sources[artifact], path);
  check(JSON.stringify(shipped) === JSON.stringify(frozen),
    `${field} is not byte-identical to ${artifact}#${path}; a disclaimer was edited rather than carried`);
}
for (const heading of DISCLAIMER_HEADINGS) {
  check(landing.includes(heading),
    `the disclaimer heading "${heading}" is absent; a limitation would render as a result`);
}

for (const hit of forbiddenHits(judgeCopy)) {
  fail(`forbidden claim "${hit.text}" — ${hit.why}\n    …${hit.context}…`);
}
checks += FORBIDDEN_CLAIMS.length;

/* The export's own prohibitions, checked against the copy that ships. A
   `mustNotClaim` entry that changes upstream has to fail here rather than be
   remembered. */
check(Array.isArray(exported.mustNotClaim) && exported.mustNotClaim.length > 0,
  'the judge export no longer declares mustNotClaim; the landing claim gate has lost its authority');
check(JSON.stringify(model.boundary.mustNotClaim) === JSON.stringify(exported.mustNotClaim),
  'the landing does not carry the export\'s current mustNotClaim list');

/* The corpus bound must be reachable, in the export's own words. */
check(model.boundary.corpusBound === exported.limitations.corpusBound,
  'the corpus bound shown is not the export\'s corpus bound');
check(/sixteen|16[- ]scenario/i.test(judgeCopy),
  'the comparison ships without stating the corpus it is bounded to');

/* The negative finding stays on the record rather than being tidied away. */
check(model.boundary.refusalStatement === exported.limitations.inadmissibleEvidence.statement,
  'the refusal-reason mismatch is not carried verbatim from the export');
check(model.boundary.refusalAgreement === exported.limitations.inadmissibleEvidence.exactReasonAgreement.display,
  'the exact refusal-reason agreement figure is not the frozen one');

/* --- 5. recorded, never live -------------------------------------------- */

for (const name of ARM_FRAMING.forbiddenControlNames) {
  const control = new RegExp(`<(?:button|a)\\b[^>]*>[^<]*\\b${name}\\b`, 'i');
  check(!control.test(landing),
    `a control named "${name}" implies the browser recomputes something; nothing on this surface executes`);
}
check(landing.includes(ARM_FRAMING.recordedLabel) || JSON.stringify(model).includes(ARM_FRAMING.recordedLabel),
  'the ablation does not label its conditions as recorded rather than live');
check(/not\s+(executed|recomputed)|nothing[^.]{0,40}executing/i.test(judgeCopy),
  'the surface never states that nothing on it is executed');
/* No <button> at all is the strongest form of the same promise. The page is
   navigation and reading; the only interactive control it needs is a link. */
check(!/<button\b/.test(strip(landing)),
  'the landing renders a button; every affordance here should be a link, so nothing reads as "run"');

/* --- 6. glosses sit beside their tokens, never instead of them ----------- */

for (const { term, gloss, forbidden } of GLOSSES) {
  const inModel = JSON.stringify(model).includes(term);
  if (!inModel) continue;
  check(JSON.stringify(model.glosses).includes(gloss),
    `${term} appears without its gloss`);
  for (const bad of forbidden) {
    check(!new RegExp(`\\b${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(judgeCopy),
      `"${bad}" appears in judge-facing copy; it is the forbidden simplification of ${term}`);
  }
}
/* The exact tokens must survive to the page. Simplifying by hierarchy means the
   precise vocabulary stays available, one level down — not that it is gone. */
for (const term of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL']) {
  check(JSON.stringify(model.ablation).includes(term),
    `${term} no longer reaches the surface; the gloss has replaced the term instead of accompanying it`);
}

/* --- 7. proof-class separation ------------------------------------------ */

/*
 * The cloud block carries no local-evaluation value and the local blocks carry
 * no cloud value. This is the cockpit's run-integrity rule applied to one
 * scrolling page: a reader must not be able to carry a number across the reset
 * and believe it belongs to the other proof.
 */
const cloudBlob = JSON.stringify(model.cloud);
const localBlob = JSON.stringify({ scene: model.scene, lock: model.lock, comparison: model.comparison, ablation: model.ablation });
for (const token of [String(model.scene.joint.total), String(model.scene.ceiling),
  'WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL', 'A4_interlock', 'A3_per_target_lock']) {
  check(!cloudBlob.includes(token),
    `the Google Cloud block carries the local-evaluation value ${token}; the proof classes have leaked`);
}
for (const token of ['gemini', 'Cloud Run', 'receipt', 'ADK']) {
  check(!new RegExp(token, 'i').test(localBlob),
    `the local evaluation blocks carry the cloud artifact ${token}; the proof classes have leaked`);
}
check(/Different proof|different experiment/i.test(landing),
  'the cloud section does not announce itself as a separate proof');
check(landing.indexOf('id="cloud"') > landing.indexOf('id="ablation"'),
  'the Google Cloud section precedes the local causal argument');

/* Cloud copy may only say what the packet supports. */
const vm = sources['media/hac-341/evidence/view-model.json'];
check(JSON.stringify(model.cloud.notClaimed) === JSON.stringify(vm?.runs?.cloud?.claimBoundary?.notClaimed),
  'the cloud claim boundary is not the frozen one');
check(JSON.stringify(model.cloud.controls) === JSON.stringify(vm?.runs?.cloud?.negativeControls),
  'the recorded cloud controls are not the frozen ones');
check((model.cloud.controls ?? []).length === 3,
  'the cloud section shows a number of controls other than the three recorded');
check(JSON.stringify(model.cloud.notOnPath) === JSON.stringify(vm?.runs?.cloud?.notOnPath),
  'the cloud section does not name what is absent from the recorded path');

/* --- 8. the route contract ---------------------------------------------- */

const routeOf = (source) => vercel.rewrites?.find((r) => r.source === source)?.destination;
check(routeOf('/') === '/media/hac-349/landing',
  `/ routes to ${routeOf('/')}, not the consequence-first landing surface`);
check(routeOf('/cockpit') === '/media/hac-341/cockpit',
  'the cockpit is no longer reachable at /cockpit');
check(routeOf('/storyboard') === '/media/hac-333/storyboard',
  'the storyboard was removed rather than demoted; HAC-333 keeps its artifact contract');
check(existsSync(join(repoRoot, 'media', 'hac-341', 'cockpit.html')),
  'the cockpit was deleted rather than reframed as the verification layer');
check(existsSync(join(repoRoot, 'media', 'hac-333', 'storyboard.html')),
  'the storyboard artifact was deleted');

/* The judge must be able to get from the narrative to the proof, and the paths
   must address states the cockpit's deep-link contract actually declares. */
const declared = vm?.deepLink ?? {};
check(model.verify.routes.length >= 3, 'the landing offers fewer than three routes into the cockpit');
check(model.verify.undeclared.length === 0,
  `the landing derived an address the cockpit contract does not declare: ${model.verify.undeclared.join(', ')}`);
for (const r of model.verify.routes) {
  check((declared.runIds ?? []).includes(r.run), `verify route ${r.id} names unknown run ${r.run}`);
  check((declared.proofClasses ?? []).includes(r.proof), `verify route ${r.id} names unknown proof class ${r.proof}`);
  if (r.guide) check((declared.guideStates ?? []).includes(r.guide), `verify route ${r.id} names unknown guided state ${r.guide}`);
  check(r.href.startsWith('/cockpit?'), `verify route ${r.id} does not address the cockpit`);
  /* Information scent, not decoration: a route that could be titled "Learn
     more" is a route that has not told the judge what it opens. */
  check(r.title.split(/\s+/).length >= 3, `verify route ${r.id} has a title too generic to carry scent`);
}
check(model.verify.routes.filter((r) => r.proof === 'local').length >= 3,
  'the local evaluation offers fewer than three verification routes of its own');
check(model.verify.routes.some((r) => r.proof === 'cloud'),
  'the cloud proof offers no route into its own evidence');
/* Generic scent is the failure this replaces. */
check(!/>\s*Learn more\s*</i.test(landing), 'the landing uses a generic "Learn more" affordance');

/* The storyboard stays reachable and stays out of the primary path: exactly one
   reference, in the footer, not among the verification routes. */
const storyboardRefs = [...landing.matchAll(/href="\/storyboard"/g)].length;
check(storyboardRefs === 1,
  `the storyboard is referenced ${storyboardRefs} times; it is a production artifact, not a judge destination`);
check(!/class="path"[^>]*href="\/storyboard"/.test(landing),
  'the storyboard is offered as a verification route');

/* --- 9. accessibility contract the source can carry --------------------- */

check(/<a class="skip"/.test(landing), 'the landing has no skip link');
check(/aria-live="polite"/.test(landing), 'the landing has no live region for the degraded state');
check(/<figcaption class="sr">/.test(landing),
  'the first-frame scene has no text equivalent; the causal visual would depend on layout alone');
for (const m of landing.matchAll(/<svg\b[^>]*>/g)) {
  check(/aria-hidden="true"/.test(m[0]),
    `an SVG on the landing is exposed to assistive technology: ${m[0].slice(0, 80)}`);
}
check(/--tap-target/.test(landing), 'the landing does not size its controls against the 44px target token');
check(/prefers-reduced-motion/.test(landing), 'the landing has no reduced-motion path');
check(/data-motion\s*=\s*.settled.|dataset\.motion\s*=\s*'settled'/.test(landing),
  'the landing never settles at a named hold state, so a capture has nothing deterministic to wait for');

/* --- report -------------------------------------------------------------- */

if (errors.length) {
  console.error(`HAC-349 landing gate: ${errors.length} failure(s) across ${checks} checks\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`HAC-349 landing gate: ${checks} checks passed`);
console.log(`  bindings resolved: ${ARTIFACTS.length} artifacts, 0 unresolved`);
console.log(`  strategies bound to ${EXPORT}: ${model.comparison.strategies.map((s) => `${s.label} ${s.invalidCoupled.display}/${s.safeParallelRetained.display}`).join(', ')}`);
console.log(`  forbidden-claim patterns checked: ${FORBIDDEN_CLAIMS.length}`);
