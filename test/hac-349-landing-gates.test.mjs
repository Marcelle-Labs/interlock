/**
 * HAC-349 — contracts for the judge landing surface.
 *
 * The landing gate (`media/hac-349/bin/verify-landing.mjs`) checks the surface
 * that exists. These tests check the gate: that its claim patterns actually bite
 * on the assertive form of every phrase they forbid, that the negation window
 * does not swallow a real overclaim, and that the story derivation degrades to
 * visible `[BIND: …]` markers rather than to plausible numbers when the frozen
 * evidence is missing or altered.
 *
 * A claim gate that has never been shown to fail is a comment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildStory, judgeFacing, JUDGE_FACING_FIELDS, ARTIFACTS, EXPORT, RAW, VIEW_MODEL,
  FORBIDDEN_CLAIMS, GLOSSES, ARM_FRAMING, DISCLAIMER_FIELDS, DISCLAIMER_HEADINGS,
  L1_SCENARIO, assertedWithoutNegation, forbiddenHits, bind,
} from '../media/hac-349/lib/story.mjs';

const repoRoot = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));
const sources = Object.fromEntries(ARTIFACTS.map((rel) => [rel, read(rel)]));
const story = buildStory(sources);
const model = read('media/hac-349/evidence/landing-model.json');
const exported = read(EXPORT);
const landing = readFileSync(join(repoRoot, 'media/hac-349/landing.html'), 'utf8');

describe('the committed model is the derivation', () => {
  it('rebuilds byte-identically from the frozen artifacts', () => {
    expect(judgeFacing(story)).toEqual(judgeFacing(model));
  });

  it('carries every judge-facing field', () => {
    for (const field of JUDGE_FACING_FIELDS) expect(judgeFacing(model)[field]).toBeDefined();
  });

  it('resolves every binding', () => {
    expect(model.unresolved).toEqual([]);
    expect(model.resolved).toBe(true);
    expect(JSON.stringify(model)).not.toContain('[BIND:');
  });
});

describe('the figures are the frozen ones', () => {
  it('reproduces Panel 1 exactly, in the export\'s own order', () => {
    expect(model.comparison.strategies.map((s) => [s.armId, s.invalidCoupled.display, s.safeParallelRetained.display]))
      .toEqual(exported.panel1.rows.map((r) => [r.arm, r.coupledUnsafe.display, r.safeParallelism.display]));
  });

  it('reproduces the per-target-lock credibility strip', () => {
    const cred = exported.panel1.perTargetLockCredibility;
    expect(model.lock.sameTarget.figure).toBe(cred.serializedSameTargetContention.display);
    expect(model.lock.crossTarget.figure).toBe(cred.parallelisedCrossTarget.display);
    expect(model.lock.missed.figure).toBe(cred.missedCrossTargetHazards.display);
  });

  it('reproduces Panel 2 including the decisions', () => {
    expect(model.ablation.rows.map((r) => [r.condition, r.invalidOutcomes, r.decisions]))
      .toEqual(exported.panel2.rows.map((r) => [r.condition, r.invalidOutcomes.display, r.decision]));
  });

  it('draws the first frame from the experiment\'s own scenario, not an illustration', () => {
    const rec = read(RAW).records.find((r) => r.scenarioId === L1_SCENARIO
      && r.arm === 'A1_uncoordinated' && r.order === 'AB');
    const oracle = JSON.parse(rec.oracle.stdout);
    expect(model.scene.joint.total).toBe(oracle.total);
    expect(model.scene.ceiling).toBe(oracle.totalReservable);
    expect(model.scene.joint.holds).toBe(false);
    expect(model.scene.alone.holds).toBe(true);
    // Two actions, two different targets. Without that the first frame is not
    // showing the composition problem at all.
    expect(model.scene.actions).toHaveLength(2);
    expect(model.scene.actions[0].path).not.toBe(model.scene.actions[1].path);
  });

  it('shows one lock key for the same-target beat and two for the cross-target beat', () => {
    expect(model.lock.sameTarget.keys).toHaveLength(1);
    expect(model.lock.crossTarget.keys).toHaveLength(2);
    expect(new Set(model.lock.crossTarget.keys).size).toBe(2);
    expect(model.lock.crossTarget.keys).toEqual(read(RAW).records
      .find((r) => r.scenarioId === L1_SCENARIO && r.arm === 'A3_per_target_lock' && r.order === 'AB').lockGroups);
  });
});

describe('absent or altered evidence degrades visibly', () => {
  it('renders [BIND: …] rather than a plausible figure when the export is missing', () => {
    const partial = buildStory({ [RAW]: sources[RAW], [VIEW_MODEL]: sources[VIEW_MODEL] });
    expect(partial.resolved).toBe(false);
    expect(partial.comparison.strategies[3].invalidCoupled.display).toContain('[BIND:');
    // No substitute is derived from anywhere else.
    expect(partial.comparison.strategies.map((s) => s.invalidCoupled.display))
      .not.toContain(exported.panel1.rows[3].coupledUnsafe.display);
  });

  it('renders [BIND: …] for the first frame when the raw results are missing', () => {
    const partial = buildStory({ [EXPORT]: sources[EXPORT], [VIEW_MODEL]: sources[VIEW_MODEL] });
    expect(partial.resolved).toBe(false);
    expect(String(partial.scene.joint.total)).toContain('[BIND:');
  });

  it('reports a verify route the cockpit contract does not declare as unresolved', () => {
    const contractless = structuredClone(sources[VIEW_MODEL]);
    contractless.deepLink.guideStates = contractless.deepLink.guideStates
      .filter((s) => s !== 'guide.local.ablation');
    const partial = buildStory({ ...sources, [VIEW_MODEL]: contractless });
    expect(partial.resolved).toBe(false);
    expect(partial.verify.routes.map((r) => r.id)).not.toContain('why-changed');
    expect(partial.verify.undeclared.join()).toContain('guide.local.ablation');
  });

  it('does not silently accept a moved pointer', () => {
    const moved = structuredClone(sources[EXPORT]);
    delete moved.panel1.perTargetLockCredibility.parallelisedCrossTarget;
    const partial = buildStory({ ...sources, [EXPORT]: moved });
    expect(partial.lock.crossTarget.figure).toContain('[BIND:');
    expect(partial.resolved).toBe(false);
  });

  it('binds nothing from an empty source set', () => {
    expect(bind({}, EXPORT, 'panel1.rows.0.label').resolved).toBe(false);
  });
});

describe('the claim gate bites', () => {
  /*
   * The assertive form of every forbidden phrase, with no negation nearby. If a
   * pattern stops matching its own overclaim it has been loosened, and the gate
   * that depends on it is decorative.
   */
  const ASSERTIONS = [
    'Interlock is 0% unsafe across the corpus.',
    'The system is 100% safe on every scenario.',
    'Interlock is safe and parallel.',
    'Interlock is safer than locking.',
    'Interlock prevents composition hazards.',
    'Locks do not work for this problem.',
    'The intent was paused for safety.',
    'Without coordination the result is a catastrophic failure of the budget.',
    'The three controls show the route is secure.',
    'The improvement is statistically significant.',
    'We report a 95% confidence interval on the rate.',
    'Interlock is production-ready today.',
    'Interlock guarantees exactly-once execution.',
    'The coordinator is restart-safe.',
    'The run used Agent Runtime to host the agents.',
    'Traffic was mediated by Agent Gateway.',
    'The policy was evaluated by CONTENT_AUTHZ.',
  ];

  it.each(ASSERTIONS)('refuses %s', (copy) => {
    expect(forbiddenHits(copy).length).toBeGreaterThan(0);
  });

  it('permits the same phrases when they are disclaimed', () => {
    const disclaimed = [
      'Interlock is not 0% unsafe: the ablation arm produced invalid outcomes by design.',
      'This does not claim Interlock is safer than locking.',
      'Production readiness was not tested and is not production-ready in any sense claimed here.',
      'Agent Runtime and Agent Gateway are not on the recorded path.',
      'No confidence interval is reported, because the corpus is not a sample.',
    ];
    for (const copy of disclaimed) expect(forbiddenHits(copy), copy).toEqual([]);
  });

  it('does not let a negation elsewhere in the document excuse a distant claim', () => {
    const copy = `Nothing here is a security claim.${' filler'.repeat(60)} The route is secure.`;
    expect(forbiddenHits(copy).length).toBeGreaterThan(0);
  });

  it('does not let a pattern that contains its own negation excuse itself', () => {
    // Both of these carry a negator inside the forbidden phrase. Before they
    // were marked absolute the window read that negator as a disclaimer and
    // passed them.
    for (const copy of ['Locks do not work for this problem.',
      'Without coordination the result is a catastrophic failure.']) {
      expect(forbiddenHits(copy), copy).not.toEqual([]);
    }
  });

  it('still applies the negation window to the patterns that need it', () => {
    // If every pattern were absolute, the page could not print its own
    // limitations, which is the failure mode in the other direction.
    expect(forbiddenHits('Restart safety is not claimed and was not tested.')).toEqual([]);
  });

  it('covers every mustNotClaim entry the export declares', () => {
    // Each prohibition must have at least one pattern that catches its
    // assertive form, so an entry added upstream cannot go unenforced.
    const assertive = {
      'Interlock is 0% unsafe': 'Interlock is 0% unsafe.',
      'Interlock prevents composition hazards': 'Interlock prevents composition hazards.',
      'Interlock is safer than locking': 'Interlock is safer than locking.',
      'A 100% / 0% headline': 'A 100% safe headline over all sixteen scenarios.',
      'Statistically significant': 'The result is statistically significant.',
      'Production-ready, exactly-once, or restart-safe': 'It is production-ready and exactly-once.',
    };
    expect(exported.mustNotClaim).toHaveLength(Object.keys(assertive).length);
    for (const [prefix, copy] of Object.entries(assertive)) {
      expect(exported.mustNotClaim.some((m) => m.startsWith(prefix)), prefix).toBe(true);
      expect(forbiddenHits(copy).length, `no pattern catches "${copy}"`).toBeGreaterThan(0);
    }
  });
});

describe('simplification is a hierarchy, not a discount', () => {
  it('keeps the exact decision tokens on the surface', () => {
    for (const term of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL', 'ALLOW_SERIALIZED']) {
      expect(JSON.stringify(model.ablation)).toContain(term);
    }
  });

  it('ships a gloss beside every token it ships', () => {
    for (const { term, gloss } of GLOSSES) {
      if (!JSON.stringify(model.ablation).includes(term)) continue;
      expect(model.glosses.find((g) => g.term === term)?.gloss).toBe(gloss);
    }
  });

  it('never ships the forbidden replacement for a token', () => {
    const copy = `${landing}\n${JSON.stringify(model)}`;
    for (const { forbidden } of GLOSSES) {
      for (const bad of forbidden) expect(copy).not.toMatch(new RegExp(`\\b${bad}\\b`, 'i'));
    }
  });

  it('keeps the gate-only lists out of the shipped model', () => {
    // A model carrying its own list of banned phrases would trip the scan that
    // reads it.
    expect(JSON.stringify(model)).not.toContain('forbiddenControlNames');
    expect(model.glosses.every((g) => g.forbidden === undefined)).toBe(true);
  });
});

describe('recorded, never live', () => {
  it('names no control the way an execution would be named', () => {
    for (const name of ARM_FRAMING.forbiddenControlNames) {
      expect(landing).not.toMatch(new RegExp(`<(?:button|a)\\b[^>]*>[^<]*\\b${name}\\b`, 'i'));
    }
  });

  it('offers no button at all, so nothing reads as "run"', () => {
    const body = landing.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(body).not.toMatch(/<button\b/);
  });

  it('labels the ablation conditions as recorded', () => {
    expect(model.ablation.framing.recordedLabel).toContain('NOT RECOMPUTED');
    expect(model.ablation.framing.recordedNote).toMatch(/not?\s|nothing/i);
  });
});

describe('the disclaimers stay verbatim and stay labelled', () => {
  it.each(DISCLAIMER_FIELDS)('%s is byte-identical to its frozen source', (field, artifact, path) => {
    const at = (root, p) => String(p).split('.').reduce((v, k) => (v == null ? undefined : v[k]), root);
    expect(at(model, field)).toEqual(at(sources[artifact], path));
  });

  it.each(DISCLAIMER_HEADINGS)('renders under the heading "%s"', (heading) => {
    expect(landing).toContain(heading);
  });

  it('keeps the negative refusal finding on the record', () => {
    expect(model.boundary.refusalStatement).toBe(exported.limitations.inadmissibleEvidence.statement);
    expect(model.boundary.refusalAgreement)
      .toBe(exported.limitations.inadmissibleEvidence.exactReasonAgreement.display);
  });
});

describe('proof classes do not leak', () => {
  const cloudBlob = JSON.stringify(model.cloud);
  const localBlob = JSON.stringify({
    scene: model.scene, lock: model.lock, comparison: model.comparison, ablation: model.ablation,
  });

  it.each(['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL', 'A4_interlock', '140', '130'])(
    'keeps the local value %s out of the cloud block', (token) => {
      expect(cloudBlob).not.toContain(token);
    });

  it.each(['gemini', 'Cloud Run', 'ADK', 'receipt'])(
    'keeps the cloud artifact %s out of the local blocks', (token) => {
      expect(localBlob).not.toMatch(new RegExp(token, 'i'));
    });

  it('shows exactly the three recorded cloud controls', () => {
    expect(model.cloud.controls).toEqual(read(VIEW_MODEL).runs.cloud.negativeControls);
    expect(model.cloud.controls).toHaveLength(3);
  });
});

describe('the route hierarchy', () => {
  const vercel = read('vercel.json');
  const routeOf = (source) => vercel.rewrites.find((r) => r.source === source)?.destination;

  it('makes / the consequence-first surface', () => {
    expect(routeOf('/')).toBe('/media/hac-349/landing');
  });

  it('keeps the cockpit at /cockpit as the verification layer', () => {
    expect(routeOf('/cockpit')).toBe('/media/hac-341/cockpit');
  });

  it('demotes the storyboard without deleting it', () => {
    expect(routeOf('/storyboard')).toBe('/media/hac-333/storyboard');
    // Reachable, once, from the footer — never as a verification route.
    expect([...landing.matchAll(/href="\/storyboard"/g)]).toHaveLength(1);
    expect(landing).not.toMatch(/class="path"[^>]*href="\/storyboard"/);
  });

  it('addresses only states the cockpit contract declares', () => {
    const declared = read(VIEW_MODEL).deepLink;
    expect(model.verify.undeclared).toEqual([]);
    for (const r of model.verify.routes) {
      expect(declared.runIds).toContain(r.run);
      expect(declared.proofClasses).toContain(r.proof);
      if (r.guide) expect(declared.guideStates).toContain(r.guide);
    }
  });

  it('uses no generic affordance', () => {
    expect(landing).not.toMatch(/>\s*Learn more\s*</i);
    for (const r of model.verify.routes) expect(r.title.split(/\s+/).length).toBeGreaterThanOrEqual(3);
  });
});
