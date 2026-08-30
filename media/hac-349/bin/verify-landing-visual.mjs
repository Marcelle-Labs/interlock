#!/usr/bin/env node
/**
 * Browser-level contract for the HAC-349 judge landing surface.
 *
 * This lives beside, rather than inside, the deterministic landing gate for the
 * reason `media/hac-341/bin/verify-cockpit-visual.mjs` does: Playwright is
 * supplied by CI or an external local install, so the evidence package stays
 * installable without a browser.
 *
 * The checks measure rendered geometry and rendered text. A source assertion can
 * prove the markup says the right thing; only a browser can prove the thesis is
 * actually in the first frame, that the causal figure is not clipped, that the
 * reduced-motion render carries the same proposition, and that no control is
 * unreachable from a keyboard.
 */
import {
  loadPlaywright, HEADROOM, MEASURE, contrastVerdict, overflowReport, visibility,
} from '../../hac-341/bin/lib/browser-contract.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const base = value('base', 'http://127.0.0.1:4173').replace(/\/$/, '');
const landing = `${base}/media/hac-349/landing.html`;

const failures = [];
let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

async function goto(page, query = '?static=1') {
  await page.goto(`${landing}${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.scene');
}

async function box(page, selector, label) {
  const b = await page.locator(selector).first().boundingBox();
  assert(b, `${label} did not render`);
  return b;
}

async function whollyVisible(page, selector, label, bottom = HEADROOM) {
  const v = await visibility(page, selector, bottom);
  assert(v.ok, `${label} ${v.reason ?? ''}`.trim());
}

async function assertNoHorizontalOverflow(page, name) {
  const { documentOverflow, bad } = await overflowReport(page);
  assert(!documentOverflow && bad.length === 0,
    `${name} has horizontal overflow${bad.length ? `: ${bad.join(', ')}` : ''}`);
}

/**
 * The first frame, at a desktop viewport.
 *
 * Everything the L1 contract names has to be inside it, unscrolled: the thesis,
 * the complete causal setup, and exactly one continuation. Anything that is only
 * reachable by scrolling is not in the first fifteen seconds.
 */
async function assertFirstFrame(page, name) {
  for (const [selector, label] of [
    ['h1#thesis', 'consequence-first thesis'],
    ['.lede', 'bounded explanation'],
    ['.env__rule', 'the shared constraint'],
    ['.lane:nth-child(1) .lane__path', 'target A'],
    ['.lane:nth-child(2) .lane__path', 'target B'],
    ['.lane:nth-child(1) .lane__check', 'action A is locally valid'],
    ['.lane:nth-child(2) .lane__check', 'action B is locally valid'],
    ['.joint__value', 'the invalid joint outcome'],
    ['a.cta', 'the continuation'],
  ]) await whollyVisible(page, selector, `${name}: ${label}`);

  assert(await page.evaluate(() => scrollY === 0), `${name}: the page loaded scrolled`);
  await assertNoHorizontalOverflow(page, name);

  /* The first frame must not require cockpit literacy. Judge-facing L1 copy is
     checked for the vocabulary HAC-349 says a first-time reader should not need
     — HAC ids, decision enums, digests, proof-class labels. */
  const above = await page.evaluate((h) => {
    const out = [];
    /* Rendered copy only. `<script>` and `<style>` carry their source as text
       nodes anchored at the top of the document, so walking them would read this
       page's own reasoning about forbidden vocabulary as though a judge could
       see it. Screen-reader-only text is excluded for the opposite reason: it is
       the equivalent of the picture, not extra chrome. */
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
    const walk = (node) => {
      if (node.nodeType === 3) {
        const el = node.parentElement;
        if (el && !el.closest('.sr') && el.getBoundingClientRect().top < h) out.push(node.textContent);
        return;
      }
      if (node.nodeType === 1 && SKIP.has(node.tagName)) return;
      for (const c of node.childNodes) walk(c);
    };
    walk(document.body);
    return out.join(' ');
  }, page.viewportSize().height);
  for (const [pattern, why] of [
    [/HAC-\d+/, 'a HAC issue id'],
    [/WITHHOLD_SERIALIZE|ALLOW_PARALLEL|ALLOW_SERIALIZED/, 'a raw decision enum'],
    [/sha256|[0-9a-f]{16}/, 'a digest'],
    [/A[1-4]_[a-z_]+/, 'an experiment arm id'],
    [/receipt|proof class/i, 'internal proof vocabulary'],
  ]) assert(!pattern.test(above), `${name}: the first frame requires ${why} to read`);

  /* One obvious continuation, not a field of equally weighted choices. */
  const ctas = await page.locator('section.l1 a').count();
  assert(ctas <= 2, `${name}: the first frame offers ${ctas} links; a judge should not choose among many`);
}

/** The argument, in the order HAC-349 requires, all of it actually rendered. */
async function assertNarrative(page, name) {
  const order = await page.evaluate(() => [...document.querySelectorAll('main section')].map((s) => s.id));
  assert(JSON.stringify(order) === JSON.stringify(['understand', 'lock', 'compare', 'ablation', 'verify', 'cloud']),
    `${name}: the judge path is ${order.join(' → ')}, not the HAC-349 sequence`);

  /* The lock is credible before it is limited: one key, then two keys, then the
     miss. The keys themselves are the argument. */
  const keys = await page.evaluate(() => [...document.querySelectorAll('.beat')]
    .map((b) => [...b.querySelectorAll('.key')].map((k) => k.textContent.trim())));
  assert(keys[0]?.length === 1, `${name}: the same-target beat does not show one lock key`);
  assert(keys[1]?.length === 2, `${name}: the cross-target beat does not show two lock keys`);
  assert(new Set(keys[1]).size === 2, `${name}: the two cross-target lock keys are not distinct`);

  /* Both dimensions on every strategy, with their polarity stated. A single
     column ranks the arms wrongly. */
  const arms = await page.evaluate(() => [...document.querySelectorAll('.arm')].map((a) => ({
    id: a.dataset.arm,
    metrics: [...a.querySelectorAll('.metric')].map((m) => ({
      label: m.querySelector('.metric__label')?.textContent.trim(),
      direction: m.querySelector('.metric__dir')?.textContent.trim(),
      figure: m.querySelector('.metric__fig')?.textContent.trim(),
      pips: [...m.querySelectorAll('.pip')].map((p) => p.dataset.on),
    })),
  })));
  assert(arms.length === 4, `${name}: the comparison shows ${arms.length} strategies, not four`);
  for (const arm of arms) {
    assert(arm.metrics.length === 2, `${name}: ${arm.id} shows ${arm.metrics.length} dimensions, not two`);
    for (const m of arm.metrics) {
      assert(/lower is better|higher is better/.test(m.direction ?? ''),
        `${name}: ${arm.id} shows "${m.label}" without stating which direction is better`);
      /* The pips must agree with the fraction beside them. A picture that
         disagrees with its own number is worse than no picture. */
      const [n, d] = String(m.figure).split('/').map(Number);
      assert(m.pips.length === d && m.pips.filter((p) => p === 'true').length === n,
        `${name}: ${arm.id} "${m.label}" draws ${m.pips.filter((p) => p === 'true').length}/${m.pips.length} against the figure ${m.figure}`);
    }
  }

  /* The ablation is adjacent, shows both conditions at once, and says it is
     recorded. */
  const conds = await page.locator('.cond').count();
  assert(conds === 2, `${name}: the ablation shows ${conds} conditions, not both`);
  assert(await page.locator('.recorded-tag').isVisible(),
    `${name}: the ablation does not label its conditions as recorded`);
  const ablationText = await page.locator('#ablation').innerText();
  for (const term of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL']) {
    assert(ablationText.includes(term), `${name}: the exact term ${term} does not reach the ablation`);
  }
  assert(/held back|proceed at the same time/.test(ablationText),
    `${name}: the exact terms appear without their plain-language gloss`);

  await assertNoHorizontalOverflow(page, `${name}: full page`);
}

/**
 * Proof-class separation, as rendered.
 *
 * Nothing from the local evaluation may appear inside the cloud section and
 * nothing from the cloud run may appear above it. This is the cockpit's
 * run-integrity rule applied to one scrolling document.
 */
async function assertProofClassSeparation(page, name) {
  const cloudText = await page.locator('#cloud').innerText();
  const localText = await page.evaluate(() => ['understand', 'lock', 'compare', 'ablation']
    .map((id) => document.getElementById(id).innerText).join('\n'));
  for (const token of ['WITHHOLD_SERIALIZE', 'ALLOW_PARALLEL', '140', '130', 'Per-target lock']) {
    assert(!cloudText.includes(token), `${name}: the cloud section renders the local value "${token}"`);
  }
  /* `EXECUTED` is a state token and is always uppercase; matched case-sensitively
     so it does not collide with this surface's own promise that nothing on it is
     "executed". The rest are names and may be written either way. */
  for (const token of ['gemini', 'Cloud Run', 'ADK', 'receipt']) {
    assert(!new RegExp(token, 'i').test(localText), `${name}: the local argument renders the cloud artifact "${token}"`);
  }
  assert(!localText.includes('EXECUTED'), `${name}: the local argument renders the cloud state EXECUTED`);
  /* The reset must be visible, not just semantic. */
  const contrast = await page.evaluate(() => {
    const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor;
    return { cloud: bg('cloud'), body: getComputedStyle(document.body).backgroundColor };
  });
  assert(contrast.cloud !== contrast.body,
    `${name}: the cloud section shares its ground with the local argument; there is no visual reset`);
}

/** Every meaningful control is reachable and visibly focused. */
async function assertKeyboard(page, name) {
  await goto(page);
  const seen = [];
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        name: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 48),
        outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        height: box.height,
      };
    });
    if (!stop) break;
    seen.push(stop);
  }
  assert(seen.length >= 6, `${name}: only ${seen.length} keyboard stops; controls are unreachable`);
  for (const stop of seen) {
    assert(stop.name.length > 0, `${name}: a ${stop.tag} focus stop has no accessible name`);
    assert(stop.outline, `${name}: "${stop.name}" takes focus without a visible ring`);
    /* 44px, against the frozen tap-target token. Sub-target hit areas are a
       pointer and motor-accessibility failure, not a style preference. */
    assert(stop.height >= 43.5, `${name}: "${stop.name}" is ${Math.round(stop.height)}px tall, under the 44px target`);
  }
  /* The limitations block is a real disclosure control, not a decoration. */
  await page.locator('.limits summary').click();
  assert(await page.locator('.limits[open]').count() === 1,
    `${name}: the limitations disclosure does not open`);
  const limits = await page.locator('.limits').innerText();
  assert(/does not claim|not claimed/i.test(limits) && limits.length > 200,
    `${name}: the limitations disclosure opens onto nothing substantive`);
}

/**
 * Reduced motion carries the same proposition.
 *
 * Not "the page still works" — the rendered text has to be identical, character
 * for character, to the motion render. A proposition that only exists while
 * something is moving is a proposition some readers never receive.
 */
async function assertReducedMotion(browser, viewport, name) {
  const read = async (opts, query) => {
    const page = await browser.newPage({ viewport, ...opts });
    await page.goto(`${landing}${query}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.scene');
    await page.waitForFunction(() => document.documentElement.dataset.motion === 'settled', null, { timeout: 5000 })
      .catch(() => {});
    const text = await page.locator('main').innerText();
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    const settled = await page.evaluate(() => document.documentElement.dataset.motion);
    await page.close();
    return { text, running, settled };
  };
  const motion = await read({ reducedMotion: 'no-preference' }, '');
  const reduced = await read({ reducedMotion: 'reduce' }, '');
  const still = await read({ reducedMotion: 'no-preference' }, '?static=1');

  assert(motion.text === reduced.text,
    `${name}: the reduced-motion render does not carry the same text as the motion render`);
  assert(motion.text === still.text,
    `${name}: the static capture render does not carry the same text as the motion render`);
  assert(reduced.running === 0, `${name}: ${reduced.running} animations still run under prefers-reduced-motion`);
  assert(still.running === 0, `${name}: ${still.running} animations still run under ?static=1`);
  for (const [label, r] of [['motion', motion], ['reduced', reduced], ['static', still]])
    assert(r.settled === 'settled', `${name}: the ${label} render never reached the named settled state`);
}

/** Nothing off-origin, and nothing failed. */
async function assertNetworkAndConsole(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const offOrigin = [];
  const problems = [];
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) offOrigin.push(r.url()); });
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.goto(landing, { waitUntil: 'networkidle' });
  await page.waitForSelector('.scene');
  assert(offOrigin.length === 0, `the landing made off-origin requests: ${offOrigin.slice(0, 3).join(', ')}`);
  assert(problems.length === 0, `the landing reported: ${problems.slice(0, 4).join(' | ')}`);
  await page.close();
}

/** The degraded state is a real render, not a blank success. */
async function assertDegraded(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/media/hac-349/evidence/landing-model.json', (route) => route.fulfill({ status: 500, body: 'x' }));
  await page.goto(landing, { waitUntil: 'networkidle' });
  await page.waitForSelector('.degraded');
  const text = await page.locator('.degraded').innerText();
  assert(/could not be read/i.test(text), 'the degraded state does not say what failed');
  assert(!/\d+\s*\/\s*\d+/.test(text), 'the degraded state still shows a figure; it must not substitute a remembered value');
  assert(await page.locator('.degraded a[href="/cockpit"]').count() === 1,
    'the degraded state offers no route to the verification surface');
  await page.close();
}


/**
 * Block until the page has finished whatever it was going to do.
 *
 * Both conditions, deliberately: `data-motion="settled"` is the page's own
 * claim that it is done, and `getAnimations()` is the browser's. A gate that
 * trusted only the first would pass a page that set the flag early.
 */
async function settle(page) {
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'settled',
    null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'),
    null, { timeout: 5000 }).catch(() => {});
}

async function assertContrastFloor(browser) {
  const rows = [];
  /* Both grounds. The cloud section inverts the field, and an inverted section
     is exactly where a light-theme token silently goes under the floor. */
  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    try {
      for (const [where, query] of [['default', '?static=1'], ['motion', '']]) {
        await page.goto(`${landing}${query}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.scene');
        /* Measure the settled render, not a frame of the transition.
           The first-frame sequence fades in with `animation-fill-mode: both`, so
           an element sampled before its delay elapses reports the opacity it is
           animating *from*. That is a transition, not a styling choice, and
           reporting it as muted text would be measuring the wrong thing — while
           silently excusing genuinely muted text is the failure this check
           exists for. The named settled state is what makes the difference
           checkable rather than a matter of timing luck. */
        await settle(page);
        for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px ${where}`, ...r });
        // The limitations disclosure holds the densest small text on the page.
        await page.locator('.limits summary').click();
        await page.waitForSelector('.limits[open]');
        for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px ${where}:limits`, ...r });
      }
      /* The degraded state is judge-facing too, and is the one render nobody
         looks at until it is the only thing on screen. */
      await page.route('**/media/hac-349/evidence/landing-model.json', (route) => route.fulfill({ status: 500, body: 'x' }));
      await page.goto(`${landing}?static=1`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.degraded');
      for (const r of await page.evaluate(MEASURE)) rows.push({ where: `${viewport.width}px degraded`, ...r });
    } finally { await page.close(); }
  }

  const v = contrastVerdict(rows);
  assert(v.composited.length === 0,
    `text is muted by opacity, which composites it toward the background and compounds through ancestors: ${v.compositedSummary}`);
  assert(v.failures.length === 0,
    `${v.failures.length} text node(s) under the WCAG AA floor: ${v.failureSummary}`);
  console.log(`  contrast floor: ${v.count} text nodes, ${v.scenarios} scenarios, 0 failures, min ${v.min.toFixed(2)}:1`);
}

async function main() {
  const { chromium } = await loadPlaywright('pnpm run check:landing:visual');
  const browser = await chromium.launch();
  try {
    /* The two desktop viewports HAC-349 names. The first-frame contract has to
       hold at both; 1280x800 is the one that fails first. */
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
      const name = `${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport });
      await goto(page);
      await assertFirstFrame(page, name);
      await assertNarrative(page, name);
      await assertProofClassSeparation(page, name);
      await assertKeyboard(page, name);
      await page.close();
    }

    /* Mobile unfolds vertically. The complete desktop argument is not forced
       into one small viewport — only identity, the problem, the two-target /
       shared-environment model and the first continuation have to survive. */
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await goto(mobile);
    for (const [selector, label] of [
      ['.brand', 'identity'], ['h1#thesis', 'thesis'], ['.env__rule', 'the shared constraint'],
      ['.lane:nth-child(1) .lane__path', 'target A'], ['.lane:nth-child(2) .lane__path', 'target B'],
      ['.joint__value', 'the invalid joint outcome'], ['a.cta', 'the continuation'],
    ]) assert(await mobile.locator(selector).first().count() === 1, `390x844: ${label} is missing`);
    await assertNoHorizontalOverflow(mobile, '390x844');
    await assertNarrative(mobile, '390x844');
    await mobile.close();

    /* 320px is where a fixed width or an unbroken path shows up. */
    const narrow = await browser.newPage({ viewport: { width: 320, height: 900 } });
    await goto(narrow);
    await assertNoHorizontalOverflow(narrow, '320x900');
    await narrow.close();

    await assertReducedMotion(browser, { width: 1440, height: 900 }, '1440x900 motion');
    await assertNetworkAndConsole(browser, { width: 1440, height: 900 });
    await assertDegraded(browser, { width: 1440, height: 900 });
    await assertContrastFloor(browser);
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`HAC-349 landing visual gate: ${failures.length} failure(s) across ${checks} checks\n`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`HAC-349 landing visual gate: ${checks} checks passed`);
}

await main();
