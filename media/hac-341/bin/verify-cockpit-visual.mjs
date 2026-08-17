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
  await page.waitForSelector('#drawer[data-open="false"]');
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
  console.log('HAC-341 cockpit visual contract verified (1440x900, 1280x800, 390x844).');
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
