#!/usr/bin/env node
/**
 * Browser-level visual contract for the judge cockpit.
 *
 * This deliberately lives beside, rather than inside, the deterministic
 * cockpit gate. Playwright is supplied by CI (or an external local install),
 * so the evidence package remains installable without a browser. The checks
 * measure rendered geometry; a screenshot or source-token assertion cannot
 * prove that a required control is actually visible and usable.
 */
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const base = value('base', 'http://127.0.0.1:4173').replace(/\/$/, '');
const cockpit = `${base}/media/hac-341/cockpit.html`;
const headroom = 48;

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    process.env.PLAYWRIGHT_MODULE && `${process.env.PLAYWRIGHT_MODULE}/index.js`,
    'playwright',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate);
      const api = mod.chromium ? mod : mod.default;
      if (api?.chromium) return api;
    } catch { /* try the next location */ }
  }
  throw new Error([
    'Playwright could not be resolved. Supply PLAYWRIGHT_MODULE from an external install:',
    'PLAYWRIGHT_MODULE=/tmp/il-capture/node_modules/playwright pnpm run check:cockpit:visual',
  ].join('\n'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** A guided address. The walk is a second axis on the same deep link. */
async function gotoGuided(page, guide, arm = 'treatment', query = '') {
  await page.goto(`${cockpit}?run=hac330-local&proof=local&state=run.local.${arm}&guide=${guide}&static=1${query}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.arm-switcher');
}

async function goto(page, query = '') {
  await page.goto(`${cockpit}?run=hac330-local&proof=local&state=run.local.treatment&static=1${query}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.arm-switcher');
}

async function gotoCloud(page) {
  await page.goto(`${cockpit}?run=hac340-cloud&proof=cloud&state=run.cloud.overview&static=1`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.hops');
}

async function box(page, selector, label = selector) {
  const b = await page.locator(selector).boundingBox();
  assert(b, `${label} did not render`);
  return b;
}

async function whollyVisible(page, selector, label, bottom = headroom) {
  const b = await box(page, selector, label);
  const viewport = page.viewportSize();
  assert(b.x >= -0.5 && b.y >= -0.5, `${label} starts outside the viewport`);
  assert(b.x + b.width <= viewport.width + 0.5, `${label} is clipped horizontally`);
  assert(b.y + b.height <= viewport.height - bottom + 0.5,
    `${label} falls below the first-frame contract (bottom ${Math.ceil(b.y + b.height)}px; requires ${bottom}px headroom)`);
}

async function assertNoHorizontalOverflow(page, name) {
  const offenders = await page.evaluate(() => {
    const root = document.documentElement;
    const all = [...document.querySelectorAll('*')];
    const bad = all.filter((el) => {
      const style = getComputedStyle(el);
      // Screen-reader-only content is intentionally 1px and clipped; it is
      // not visual overflow. Only inspect boxes that participate in layout.
      if (style.position === 'absolute' && el.classList.contains('sr')) return false;
      return !['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    }).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(/\s+/)[0]}` : ''}`);
    return { documentOverflow: root.scrollWidth > root.clientWidth + 1, bad };
  });
  assert(!offenders.documentOverflow && offenders.bad.length === 0,
    `${name} has horizontal overflow${offenders.bad.length ? `: ${offenders.bad.join(', ')}` : ''}`);
}

async function assertDesktopFirstFrame(page, name) {
  for (const [selector, label] of [
    ['.run-header', 'run identity'],
    ['.run-thesis', 'causal claim'],
    ['#inputs-title', 'locally valid inputs'],
    ['#evidence-title', 'revision-bound evidence'],
    ['#decision-title', 'coordination decision'],
    ['#outcome-title', 'bounded joint outcome'],
    ['.arm-switcher [role="group"]', 'recorded arm selector'],
    ['.actions[aria-label="Verification actions"]', 'verification controls'],
  ]) await whollyVisible(page, selector, `${name}: ${label}`);
  await assertNoHorizontalOverflow(page, name);
}

async function assertCloudFirstFrame(page, name) {
  for (const [selector, label] of [
    ['header', 'run identity'],
    ['.verdict', 'editorial claim'],
    ['.hops', 'lane-attributed path'],
    ['.res:nth-child(1)', 'decision and receipt'],
    ['.res:nth-child(2)', 'effect'],
    ['.res:nth-child(3)', 'independent observation'],
    ['.controls', 'recorded controls'],
    ['.actions[aria-label="Verification actions"]', 'verification controls'],
  ]) await whollyVisible(page, selector, `${name}: ${label}`);
  await assertNoHorizontalOverflow(page, name);
}

async function assertDrawer(page, name) {
  const trigger = page.getByRole('button', { name: 'Verify this decision' });
  await trigger.click();
  await page.waitForSelector('#drawer[data-open="true"]');
  await whollyVisible(page, '#drawer', `${name}: evidence drawer`, 0);
  assert(await page.locator('#drawer').evaluate((el) => document.activeElement === el),
    `${name}: drawer did not receive focus on open`);
  const main = await box(page, 'main#app', `${name}: run behind drawer`);
  assert(main.width > 0 && main.x >= 0, `${name}: drawer covered the run instead of reserving space`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#drawer[data-open="false"]', { state: 'attached' });
  assert(await trigger.evaluate((el) => document.activeElement === el),
    `${name}: focus did not return to the opener after Escape`);
}

async function assertRawProof(page, name) {
  await page.getByRole('button', { name: 'Show me the raw proof' }).click();
  await page.waitForSelector('#drawer[data-open="true"] pre.shiki-proof');
  const proof = page.locator('pre.shiki-proof');
  assert(await proof.locator('.line').count() > 1, `${name}: raw proof was not syntax-rendered`);
  const source = await page.locator('.proof-source').innerText();
  assert(source.startsWith('Source · '), `${name}: raw proof has no source label`);
  await assertNoHorizontalOverflow(page, `${name}: raw proof`);
}

async function assertLongValues(page, name) {
  await page.evaluate(() => {
    document.querySelector('.evidence-band .attr').textContent = `basis ${'revision-bound-evidence '.repeat(24)}`;
    document.querySelector('.evidence-ledger').textContent = `files ${'very-long-recorded-path.json '.repeat(24)}`;
  });
  await assertNoHorizontalOverflow(page, `${name}: adversarial recorded values`);
}

/**
 * The guided layer, in a browser.
 *
 * Source-level checks can prove the markup says the right thing; only a browser
 * can prove that the emphasised region is still on screen, that the run behind
 * the walk is still operable, and that a step change did not scroll the
 * evidence away.
 */
async function assertGuidedWalk(page, name) {
  // The entry offers a choice and preselects neither path.
  await goto(page);
  await page.waitForSelector('.guide-choice');
  await whollyVisible(page, '.guide-choice', `${name}: entry choice`, 0);
  const picks = page.locator('.guide-choice button');
  assert(await picks.count() === 2, `${name}: the entry does not offer exactly two paths`);
  for (const attr of ['aria-pressed', 'aria-current']) {
    assert(await picks.evaluateAll((els, a) => els.every((el) => !el.getAttribute(a)), attr),
      `${name}: the entry preselects a path`);
  }
  // The choice may not obscure run identity, frozen state, checks or the switch.
  for (const [selector, label] of [
    ['.run-header__facts', 'run identity and checks'],
    ['.switch', 'proof-class switch'],
    ['.run-thesis', 'causal claim'],
  ]) await whollyVisible(page, selector, `${name}: ${label} behind the entry choice`, 0);
  await assertNoHorizontalOverflow(page, `${name}: entry choice`);

  // Walking starts at one, and the cockpit is still a cockpit.
  await page.getByRole('button', { name: 'Walk the proof' }).click();
  await page.waitForSelector('.guide-bar');
  assert((await page.locator('.guide-count').first().innerText()).includes('01'),
    `${name}: the walk did not start at step one`);
  assert(await page.locator('[data-guide-rail] button').count() === 6,
    `${name}: the step rail does not offer all six steps`);
  assert(await page.locator('.arms button[aria-pressed="true"]').isEnabled(),
    `${name}: the arm selector is not operable during the walk`);

  // Every step keeps the four stages and the expert controls on screen, and no
  // step scrolls the reader.
  for (const [step, id] of [
    [1, 'guide.local.validity'], [2, 'guide.local.shared-environment'],
    [3, 'guide.local.evidence-decision'], [4, 'guide.local.outcome'],
    [5, 'guide.local.ablation'], [6, 'guide.local.handoff'],
  ]) {
    await gotoGuided(page, id);
    assert(await page.evaluate(() => scrollY === 0), `${name}: step ${step} scrolled the reader`);
    for (const sel of ['#inputs-title', '#evidence-title', '#decision-title', '#outcome-title']) {
      assert(await page.locator(sel).isVisible(), `${name}: step ${step} removed ${sel} from the run`);
    }
    // Emphasis is positive and non-textual: the current stage is marked, the
    // others are simply unmarked. Nothing anywhere is composited.
    const emphasis = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-guide-em]')].map((el) => ({
        state: el.dataset.guideEm,
        opacity: Number(getComputedStyle(el).opacity),
        filter: getComputedStyle(el).filter,
        shadow: getComputedStyle(el).boxShadow,
      }));
      return { rows, focused: rows.filter((r) => r.state === 'focus').length };
    });
    assert(emphasis.rows.every((r) => r.opacity === 1), `${name}: step ${step} composites a stage with opacity`);
    assert(emphasis.rows.every((r) => r.filter === 'none'), `${name}: step ${step} filters a stage`);
    assert(step === 6 || emphasis.focused > 0, `${name}: step ${step} marks no stage as current`);
    assert(emphasis.rows.filter((r) => r.state === 'focus').every((r) => r.shadow !== 'none'),
      `${name}: the current stage carries no positive emphasis`);
    await assertNoHorizontalOverflow(page, `${name}: step ${step}`);
  }

  // No step may move the run. Emphasis is colour, background and shadow only,
  // so every stage must occupy the same box at every step.
  const geometry = {};
  for (const id of ['guide.local.validity', 'guide.local.shared-environment', 'guide.local.evidence-decision',
    'guide.local.outcome', 'guide.local.ablation', 'guide.local.handoff']) {
    await gotoGuided(page, id);
    geometry[id] = await page.evaluate(() => Object.fromEntries(
      ['.causal-stage', '.evidence-band', '.decision-bar', '.outcome-stage', '.arm-switcher']
        .map((sel) => {
          const b = document.querySelector(sel).getBoundingClientRect();
          return [sel, `${Math.round(b.x)},${Math.round(b.width)},${Math.round(b.height)}`];
        })));
  }
  const steps = Object.keys(geometry);
  for (const sel of Object.keys(geometry[steps[0]])) {
    const seen = new Set(steps.map((k) => geometry[k][sel]));
    // The ablation and handoff steps legitimately change content height; only
    // the horizontal box is compared there, and the rest must not move at all.
    const boxes = [...seen].map((v) => v.split(',').slice(0, 2).join(','));
    assert(new Set(boxes).size === 1,
      `${name}: ${sel} moves between steps (${[...seen].join(' | ')}); emphasis must not participate in layout`);
  }

  // Back and Next work without an arrow key, and neither wraps.
  await gotoGuided(page, 'guide.local.validity');
  assert(await page.locator('[data-guide-back]').isDisabled(), `${name}: Back is live on the first step`);
  await page.locator('[data-guide-next]').click();
  assert((await page.locator('.guide-count').first().innerText()).includes('02'),
    `${name}: Next did not advance the walk`);
  await page.locator('[data-guide-back]').click();
  assert((await page.locator('.guide-count').first().innerText()).includes('01'),
    `${name}: Back did not return the walk`);

  // Arrows move a step only inside the rail.
  await page.locator('button[data-drawer="verify"]').focus();
  await page.keyboard.press('ArrowRight');
  assert((await page.locator('.guide-count').first().innerText()).includes('01'),
    `${name}: an arrow key outside the rail moved the walk`);
  await page.keyboard.press('Escape');
  await page.locator('[data-guide-rail] button[aria-current="step"]').focus();
  await page.keyboard.press('ArrowRight');
  assert((await page.locator('.guide-count').first().innerText()).includes('02'),
    `${name}: an arrow key inside the rail did not move the walk`);
}

/** The ablation swaps a recorded arm and says what moved and what did not. */
async function assertAblation(page, name) {
  await gotoGuided(page, 'guide.local.ablation');
  const evidenceBefore = await box(page, '.evidence-band', `${name}: evidence before ablation`);
  await page.locator('[data-guide-ablate]').click();
  await page.waitForSelector('.mk[data-mk="changed"]');
  const evidenceAfter = await box(page, '.evidence-band', `${name}: evidence after ablation`);
  assert(Math.abs(evidenceAfter.y - evidenceBefore.y) < 240,
    `${name}: the ablation moved the evidence it is about by ${Math.round(Math.abs(evidenceAfter.y - evidenceBefore.y))}px`);
  assert(await page.evaluate(() => scrollY === 0), `${name}: the ablation scrolled the reader`);

  const marks = await page.evaluate(() => ({
    held: [...document.querySelectorAll('.mk[data-mk="held"]')].map((el) => el.textContent.trim()),
    changed: [...document.querySelectorAll('.mk[data-mk="changed"]')].map((el) => el.textContent.trim()),
  }));
  assert(marks.held.length === 4, `${name}: ${marks.held.length} held-constant markers, expected 4`);
  assert(marks.changed.length === 4, `${name}: ${marks.changed.length} changed markers, expected 4`);
  const text = await page.locator('.causal-layout').innerText();
  for (const value of ['ALLOW_PARALLEL', '140 > 130', 'db8a63ec', 'no qualifying coupling']) {
    assert(text.toLowerCase().includes(value.toLowerCase()),
      `${name}: the perturbed arm does not show its recorded ${value}`);
  }
  assert(text.includes('Nothing is executed in the browser'),
    `${name}: the recorded-arm disclaimer was lost during the ablation`);
  await assertNoHorizontalOverflow(page, `${name}: ablation`);

  // Reversible: the same control restores the original evidence.
  await page.locator('[data-guide-ablate]').click();
  await page.waitForSelector('.evidence-band .chip[data-s="coupled"]');
  const restored = await page.locator('.causal-layout').innerText();
  assert(restored.includes('WITHHOLD_SERIALIZE') && restored.includes('120 <= 130'),
    `${name}: restoring the evidence did not return the treatment arm`);
  assert(await page.locator('.mk').count() === 0,
    `${name}: changed markers survived the restore`);
}

/** One side panel, non-modal, focus in and back out. */
async function assertPanels(page, name) {
  await gotoGuided(page, 'guide.local.handoff');
  const verify = page.locator('.guide-step .acts button[data-drawer="verify"]');
  const compare = page.locator('.guide-step .acts button[data-drawer="compare"]');
  await verify.click();
  await page.waitForSelector('#drawer[data-open="true"]');
  assert((await page.locator('.drawer .sub').first().innerText()).includes('selected arm'),
    `${name}: the verification panel does not name the arm it explains`);
  assert(await page.locator('#evidence-title').isVisible() && await page.locator('#decision-title').isVisible(),
    `${name}: opening verification hid the causal context it explains`);
  await compare.click();
  await page.waitForSelector('#drawer[data-panel="compare"]');
  assert(await page.locator('aside[data-open="true"]').count() === 1,
    `${name}: two side panels were open at once`);
  assert(await page.locator('#drawer-title').innerText() === 'Coordination strategies',
    `${name}: the comparison panel did not replace the verification panel`);
  assert(!(await page.locator('main#app').evaluate((el) => el.hasAttribute('inert'))),
    `${name}: the run was made inert while a panel was open`);
  // Arrows move strategies only inside the strategy group.
  const first = await page.locator('.cmp-strats button[aria-pressed="true"]').innerText();
  await page.locator('.cmp-strats button[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert(await page.locator('.cmp-strats button[aria-pressed="true"]').innerText() !== first,
    `${name}: an arrow inside the strategy group did not change the strategy`);
  // Every rendered cell names the field it came from.
  const cells = await page.evaluate(() => [...document.querySelectorAll('.cmp-dim')]
    .map((el) => ({ value: el.querySelector('dd').textContent.trim(), src: el.querySelector('.cmp-src').textContent.trim() })));
  assert(cells.length === 6, `${name}: the comparison shows ${cells.length} dimensions, expected 6`);
  for (const cell of cells) {
    assert(cell.src.startsWith('experiments/hac-343/evidence/'),
      `${name}: a comparison cell cites "${cell.src}" rather than a HAC-343 field`);
    const unbound = cell.value.startsWith('[BIND:');
    const scaffold = await page.locator('.cmp-scaffold').count();
    assert(!unbound || scaffold === 1,
      `${name}: an unresolved binding is shown without the not-evidence label`);
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('#drawer[data-open="false"]', { state: 'attached' });
  assert(await compare.evaluate((el) => document.activeElement === el),
    `${name}: focus did not return to the control that opened the panel`);
}

/** The reduced-motion control describes the state actually in force. */
async function assertReducedMotion(browser, viewport, name) {
  const os = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  try {
    await gotoGuided(os, 'guide.local.ablation', 'perturbed');
    assert(await os.locator('span.guide-motion[role="status"]').count() === 1,
      `${name}: the OS reduced-motion state is not reported`);
    assert(await os.locator('button.guide-motion').count() === 0,
      `${name}: a manual motion control survives the OS preference`);
    assert((await os.locator('.guide-motion').first().innerText()).toLowerCase().includes('system preference'),
      `${name}: the reduced-motion status does not name the system preference`);
    // Reduction changes the transition, never the information.
    assert(await os.locator('.mk').count() === 8,
      `${name}: reduced motion dropped the held/changed markers`);
    assert(await os.locator('[data-guide-rail] button').count() === 6,
      `${name}: reduced motion dropped a step`);
    const durations = await os.evaluate(() => [...document.querySelectorAll('[data-guide-em],[data-il-motion]')]
      .map((el) => getComputedStyle(el).transitionDuration));
    assert(durations.every((d) => d === '0s'), `${name}: a staged transition survived reduced motion`);
  } finally { await os.close(); }

  const manual = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
  try {
    await manual.goto(`${cockpit}?run=hac330-local&proof=local&state=run.local.treatment&guide=guide.local.validity`, { waitUntil: 'networkidle' });
    await manual.waitForSelector('.guide-bar');
    assert((await manual.locator('button.guide-motion').innerText()).toLowerCase() === 'reduce motion',
      `${name}: the motion control does not name the action it will perform`);
    await manual.locator('button.guide-motion').click();
    assert((await manual.locator('button.guide-motion').innerText()).toLowerCase() === 'enable motion',
      `${name}: the motion control does not name the action available after reducing`);
    assert(await manual.locator('button.guide-motion').getAttribute('aria-pressed') === 'true',
      `${name}: the manual motion control does not expose its state`);
    assert(await manual.evaluate(() => document.documentElement.dataset.reducedMotion) === 'true',
      `${name}: manual reduction did not take effect`);
  } finally { await manual.close(); }
}

/** 320 CSS px: one column, causal order, no sideways scroll. */
async function assertNarrow(browser) {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  try {
    await goto(page);
    await page.waitForSelector('.guide-choice');
    const taps = await page.evaluate(() => [...document.querySelectorAll('.guide-choice button')]
      .map((el) => el.getBoundingClientRect().height));
    assert(taps.every((h) => h >= 44), `320px: an entry action is under the 44px tap target`);
    await assertNoHorizontalOverflow(page, '320px entry');

    await gotoGuided(page, 'guide.local.ablation', 'perturbed');
    const order = await page.evaluate(() => {
      const top = (s) => document.querySelector(s).getBoundingClientRect().top + scrollY;
      return { evidence: top('.evidence-band'), decision: top('.decision-bar'), outcome: top('.outcome-stage') };
    });
    assert(order.evidence < order.decision && order.decision < order.outcome,
      '320px: the causal reading order is not evidence, decision, outcome');
    assert(await page.locator('[data-guide-rail]').isVisible() === false,
      '320px: the full step rail is drawn where it cannot fit');
    assert((await page.locator('.guide-count').first().innerText()).includes('05'),
      '320px: the step count is not shown in place of the rail');
    for (const control of ['[data-guide-back]', '[data-guide-next]']) {
      assert(await page.locator(control).isVisible(), `320px: ${control} is not reachable`);
    }
    assert(await page.locator('.mk').count() === 8, '320px: an ablation marker was dropped');
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.mk, .res .v')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    assert(clipped === 0, '320px: an ablation marker or recorded value is clipped');
    await assertNoHorizontalOverflow(page, '320px ablation');
  } finally { await page.close(); }
}

/**
 * WCAG AA, measured rather than asserted.
 *
 * This surface's whole thesis is that a displayed claim resolves to something
 * checkable. The contrast floor was the one claim that did not: "no text muted
 * by opacity, zero AA failures, minimum 5.15:1" lived in a README sentence and
 * a scratch script, so it was true when someone ran it and unfalsifiable
 * afterwards. It is a gate now.
 *
 * Colour is resolved by painting one pixel and reading it back. `fillStyle`
 * round-trips `oklch()` unchanged and this design is oklch throughout, so
 * string parsing silently mis-measured every semantic state colour — the first
 * version of this audit reported four failures that were its own bug.
 */
const MEASURE = () => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  cv.globalCompositeOperation = 'copy';
  const cache = new Map();
  const parse = (c) => {
    if (!c) return null;
    if (cache.has(c)) return cache.get(c);
    let v = null;
    try {
      cv.fillStyle = c;
      cv.fillRect(0, 0, 1, 1);
      const d = cv.getImageData(0, 0, 1, 1).data;
      v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch { v = null; }
    cache.set(c, v);
    return v;
  };
  const over = (f, b) => ({
    r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
  const pageBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  // Opacity composites the whole subtree, so it accumulates down the ancestry.
  const chain = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      o *= Number(getComputedStyle(n).opacity);
    }
    return o;
  };
  const backdrop = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.999) return c;
    }
    return pageBg;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.classList.contains('sr')) continue;
    // Closed panels are `inert`; 1.4.3 exempts inactive components.
    if (el.closest('[inert]') || el.matches(':disabled') || el.closest('button:disabled')) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const fs = Number.parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const total = chain(el);
    const bd = backdrop(el);
    const ownBg = parse(cs.backgroundColor);
    const eBg = ownBg && ownBg.a > 0.999 ? over({ ...ownBg, a: total }, bd) : over({ ...bd, a: total }, bd);
    const eFg = over({ ...fg, a: fg.a * total }, eBg);
    const large = fs >= 24 || (fs >= 18.66 && weight >= 700);
    out.push({
      sel: (el.className || el.tagName).toString().split(/\s+/)[0].slice(0, 28),
      text: el.textContent.trim().slice(0, 30).replace(/\s+/g, ' '),
      fs: +fs.toFixed(1), opacity: +total.toFixed(3),
      ratio: +ratio(eFg, eBg).toFixed(2), required: large ? 3 : 4.5,
    });
  }
  return out;
};

async function assertContrastFloor(browser) {
  const GUIDES = ['guide.local.choice', 'guide.local.free', 'guide.local.validity', 'guide.local.shared-environment',
    'guide.local.evidence-decision', 'guide.local.outcome', 'guide.local.ablation', 'guide.local.handoff'];
  const local = `${cockpit}?run=hac330-local&proof=local`;
  const cloudUrl = `${cockpit}?run=hac340-cloud&proof=cloud&state=run.cloud.overview&static=1`;
  const rows = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    try {
      for (const guide of GUIDES) {
        for (const arm of ['treatment', 'perturbed']) {
          await page.goto(`${local}&state=run.local.${arm}&guide=${guide}&static=1`, { waitUntil: 'networkidle' });
          await page.waitForSelector('main#app *');
          for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px ${guide}/${arm}`, ...r });
        }
      }
      for (const [where, url] of [['cloud', cloudUrl], ['degraded', `${local}&state=run.local.nope&static=1`]]) {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('main#app *');
        for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px ${where}`, ...r });
      }
      // Panels carry the densest small text on the surface, in both classes.
      for (const [url, names] of [
        [`${local}&state=run.local.perturbed&guide=guide.local.free&static=1`,
          ['Verify this decision', 'Compare coordination strategies', 'Show me the raw proof', 'What is not claimed?']],
        [cloudUrl, ['Verify this run', 'Show me the raw proof', 'What is not claimed?']],
      ]) {
        for (const name of names) {
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.getByRole('button', { name }).first().click();
          await page.waitForSelector('#drawer[data-open="true"]');
          for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px panel:${name}`, ...r });
        }
      }
    } finally { await page.close(); }
  }

  const composited = rows.filter((r) => r.opacity < 0.999);
  assert(composited.length === 0,
    `text is muted by opacity, which composites it toward the background and compounds through ancestors: ${
      [...new Set(composited.map((r) => `${r.sel} "${r.text}"`))].slice(0, 5).join('; ')}`);
  const failures = rows.filter((r) => r.ratio < r.required);
  const distinct = [...new Map(failures.map((f) => [`${f.sel}|${f.text}`, f])).values()];
  assert(failures.length === 0,
    `${failures.length} text node(s) under the WCAG AA floor: ${
      distinct.slice(0, 6).map((f) => `${f.sel} "${f.text}" ${f.fs}px ${f.ratio}:1 < ${f.required} [${f.where}]`).join('; ')}`);
  const min = Math.min(...rows.map((r) => r.ratio));
  console.log(`  contrast floor: ${rows.length} text nodes, ${new Set(rows.map((r) => r.where)).size} scenarios, 0 failures, min ${min.toFixed(2)}:1`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
      const name = `${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport });
      const offOrigin = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== new URL(base).origin) offOrigin.push(request.url());
      });
      try {
        await goto(page);
        assert(await page.evaluate(() => scrollY === 0), `${name}: initial render scrolled the reader`);
        await assertDesktopFirstFrame(page, name);
        await assertLongValues(page, name);
        await goto(page);
        await assertDrawer(page, name);
        await goto(page);
        await assertRawProof(page, name);
        await assertGuidedWalk(page, `${name} walk`);
        await assertAblation(page, `${name} ablation`);
        await assertPanels(page, `${name} panels`);
        assert(offOrigin.length === 0, `${name}: unexpected off-origin request(s): ${offOrigin.join(', ')}`);
      } catch (error) { failures.push(error.message); }
      await page.close();

      const cloud = await browser.newPage({ viewport });
      try {
        await gotoCloud(cloud);
        await assertCloudFirstFrame(cloud, `${name} cloud`);
      } catch (error) { failures.push(error.message); }
      await cloud.close();
    }

    for (const viewport of [{ width: 1440, height: 900 }]) {
      try { await assertReducedMotion(browser, viewport, `${viewport.width}x${viewport.height} motion`); }
      catch (error) { failures.push(error.message); }
    }
    try { await assertNarrow(browser); } catch (error) { failures.push(error.message); }
    try { await assertContrastFloor(browser); } catch (error) { failures.push(error.message); }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await goto(mobile);
      for (const [selector, label] of [['.run-header', 'run identity'], ['#inputs-title', 'inputs'], ['#evidence-title', 'evidence']]) {
        await whollyVisible(mobile, selector, `390x844 mobile: ${label}`, 20);
      }
      await assertNoHorizontalOverflow(mobile, '390x844 mobile');
    } catch (error) { failures.push(error.message); }
    await mobile.close();
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(`Cockpit visual contract failed:\n- ${failures.join('\n- ')}`);
  console.log('HAC-341 cockpit visual contract verified (1440x900, 1280x800, 390x844, 320x900),'
    + '\n  including the guided walk, the ablation, the side panels and both reduced-motion resolutions.');
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
