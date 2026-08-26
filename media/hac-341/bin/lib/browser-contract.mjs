/**
 * Shared browser-contract primitives for the judge surfaces.
 *
 * The cockpit (HAC-341) and the landing surface (HAC-349) are gated separately,
 * because they make different promises. But "does this text meet the contrast
 * floor?" and "does this page overflow horizontally?" are the same questions
 * about both, and they have to be answered by the same code.
 *
 * HAC-349 originally ported `MEASURE` into its own gate verbatim, with a comment
 * saying the two surfaces should be "held to one measurement, not two
 * implementations that agree today". That comment was right and the copy made it
 * false: two implementations that agree today are exactly what a copy produces.
 * This module is the fix. It lives under HAC-341 because the cockpit is where
 * these contracts were established and where `lib/icons.mjs` — already imported
 * by both surfaces — sits.
 *
 * Nothing here asserts. Each export returns a measurement or a verdict, so each
 * gate keeps its own failure style: the cockpit throws on the first problem, the
 * landing gate collects and reports them together.
 */
import { pathToFileURL } from 'node:url';

/**
 * Resolve Playwright from an external install.
 *
 * Browser tooling is deliberately outside the repository package: the evidence
 * gates must stay installable without a browser, so a judge can verify the
 * frozen packets on a machine that has never run Chromium.
 */
export async function loadPlaywright(hint = 'pnpm run check:cockpit:visual') {
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
    `PLAYWRIGHT_MODULE=/tmp/il-capture/node_modules/playwright ${hint}`,
  ].join('\n'));
}

/**
 * Bottom headroom a desktop first frame must leave.
 *
 * One number, so "fits above the fold" means the same thing on both surfaces.
 */
export const HEADROOM = 48;

/**
 * Measure every text node's effective contrast, in the page.
 *
 * Passed to `page.evaluate`, so it must stay self-contained — it cannot close
 * over anything in this module.
 *
 * Two things it does that a naive ratio check does not:
 *
 *   - it resolves the *real* backdrop by walking ancestors until it finds an
 *     opaque background, rather than assuming the page colour;
 *   - it accumulates `opacity` down the whole ancestry, because opacity
 *     composites the entire subtree and multiplies through every ancestor that
 *     sets it. A 0.6 label inside a 0.7 row inside a 0.62 stage renders at 0.26,
 *     and measured 1.81:1 on the cockpit before this existed.
 */
export const MEASURE = () => {
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
    // Closed panels are `inert`; WCAG 1.4.3 exempts inactive components.
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

/**
 * Turn measured rows into the two verdicts a gate cares about.
 *
 * Opacity is reported separately from contrast rather than folded into it. A
 * muted label may still pass the ratio today and stop passing the moment an
 * ancestor changes, so "text is composited" is its own finding.
 */
export function contrastVerdict(rows) {
  const composited = rows.filter((r) => r.opacity < 0.999);
  const failures = rows.filter((r) => r.ratio < r.required);
  const distinct = [...new Map(failures.map((f) => [`${f.sel}|${f.text}`, f])).values()];
  return {
    composited,
    compositedSummary: [...new Set(composited.map((r) => `${r.sel} "${r.text}"`))].slice(0, 5).join('; '),
    failures,
    failureSummary: distinct.slice(0, 6)
      .map((f) => `${f.sel} "${f.text}" ${f.fs}px ${f.ratio}:1 < ${f.required} [${f.where}]`).join('; '),
    min: rows.length ? Math.min(...rows.map((r) => r.ratio)) : Infinity,
    scenarios: new Set(rows.map((r) => r.where)).size,
    count: rows.length,
  };
}

/**
 * Elements whose content is wider than their box, and whether the document
 * itself scrolls sideways.
 *
 * Screen-reader-only content is intentionally 1px and clipped; it is not visual
 * overflow, so it is excluded rather than reported and then waived.
 */
export async function overflowReport(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const bad = [...document.querySelectorAll('*')].filter((el) => {
      const style = getComputedStyle(el);
      if (style.position === 'absolute' && el.classList.contains('sr')) return false;
      return !['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    }).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(/\s+/)[0]}` : ''}`);
    return { documentOverflow: root.scrollWidth > root.clientWidth + 1, bad };
  });
}

/**
 * Whether an element is wholly inside the viewport, with the required headroom.
 *
 * Returns a reason rather than throwing, so each gate phrases its own failure.
 */
export async function visibility(page, selector, bottom = HEADROOM) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) return { ok: false, reason: 'did not render' };
  const viewport = page.viewportSize();
  if (b.x < -0.5 || b.y < -0.5) return { ok: false, reason: 'starts outside the viewport' };
  if (b.x + b.width > viewport.width + 0.5) return { ok: false, reason: 'is clipped horizontally' };
  if (b.y + b.height > viewport.height - bottom + 0.5) {
    return {
      ok: false,
      reason: `falls below the first-frame contract (bottom ${Math.ceil(b.y + b.height)}px; requires ${bottom}px headroom in ${viewport.height}px)`,
    };
  }
  return { ok: true, box: b };
}
