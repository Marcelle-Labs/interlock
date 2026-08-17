#!/usr/bin/env node
/**
 * HAC-335 — cockpit capture.
 *
 * Captures the judge-facing frames from the *real* merged HAC-341 cockpit. It
 * drives a browser against a served repository root and writes PNGs plus a
 * provenance manifest. Nothing here draws a cockpit: if the executable surface
 * changes, these frames change with it, and if it cannot be served, this fails
 * rather than producing artwork.
 *
 * Two deliberate properties:
 *
 * 1. **Crops are derived, not guessed.** The judge crop is the bounding box of
 *    `main#app` — exactly the rendered content, dropping only unused canvas.
 *    media/hac-341/README.md quotes "~top 500px" / "~top 600px" as measured
 *    guidance; measuring it here means a layout change moves the crop instead
 *    of silently clipping a proof value out of frame.
 * 2. **Every capture asserts its own content.** A frame that no longer contains
 *    the tokens it is cited for is a failure, not a quietly stale PNG.
 *
 * This is tooling, not a gate. It needs a browser and a server, so it is not
 * wired into `pnpm check`; `verify-package.mjs` gates the committed results
 * without either. Playwright is intentionally not a repository dependency —
 * see media/hac-335/README.md.
 *
 *     node media/hac-335/bin/capture-cockpit.mjs [--base http://127.0.0.1:4173]
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureSourceDigest, captureSourceFiles } from './lib/capture-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OUT = resolve(ROOT, 'media/hac-335/captures');
const MANIFEST = resolve(ROOT, 'media/hac-335/evidence/capture-manifest.json');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = arg('base', 'http://127.0.0.1:4173');
const COCKPIT = `${BASE}/media/hac-341/cockpit.html`;
const VIEWPORT = { width: 1440, height: 900 };
const CROP_PAD = 12;

/**
 * The screenshot sequence. Fewer frames with distinct judge jobs beats one
 * frame per available state — each row below answers a question no other row
 * answers, and `requires` is the set of tokens that must survive the crop for
 * the frame to still support `supportedClaim`.
 */
const CAPTURES = [
  {
    id: 'IL-COCK-010',
    slug: 'run-local-treatment',
    judgeQuestion: 'Can I verify the causal claim myself?',
    proofClass: 'A',
    proofClassLabel: 'CONTROLLED LOCAL EXPERIMENT',
    run: 'hac330-local',
    sourceIssue: 'HAC-330',
    semanticState: 'run.local.treatment',
    query: 'run=hac330-local&proof=local&state=run.local.treatment',
    crop: 'main#app',
    requires: [
      'CONTROLLED LOCAL EXPERIMENT',
      'Intent A',
      'Intent B',
      'COUPLED',
      'joint bound <= 130',
      'WITHHOLD_SERIALIZE',
      '140 > 130',
      '120 <= 130',
      '24/24',
    ],
    forbids: ['alpha=45', 'EXECUTED', 'gemini', '403'],
    supportedClaim:
      'The merged cockpit renders the frozen HAC-330 treatment arm: two locally valid intents, a coupled shared environment bounded at 130, the deterministic WITHHOLD_SERIALIZE decision, and 120 <= 130 against the 140 > 130 baseline, with 24/24 checks.',
    targetSurface: ['readme', 'devpost-screenshot'],
  },
  {
    id: 'IL-COCK-011',
    slug: 'run-local-perturbed',
    judgeQuestion: 'What happens if the evidence changes?',
    proofClass: 'A',
    proofClassLabel: 'CONTROLLED LOCAL EXPERIMENT',
    run: 'hac330-local',
    sourceIssue: 'HAC-330',
    semanticState: 'run.local.perturbed',
    query: 'run=hac330-local&proof=local&state=run.local.perturbed',
    crop: 'main#app',
    requires: ['CONTROLLED LOCAL EXPERIMENT', 'ALLOW_PARALLEL', '140 > 130', 'FROZEN ARM'],
    forbids: ['alpha=45', 'EXECUTED', 'gemini'],
    supportedClaim:
      'Selecting the frozen perturbed-evidence arm in the merged cockpit shows ALLOW_PARALLEL and 140 > 130. The arm is a recorded result; nothing is recomputed in the browser.',
    targetSurface: ['readme', 'devpost-screenshot'],
  },
  {
    id: 'IL-COCK-012',
    slug: 'run-cloud-overview',
    judgeQuestion: 'What actually ran on Google Cloud?',
    proofClass: 'B',
    proofClassLabel: 'GOOGLE CLOUD PARTICIPATION',
    run: 'ilk-hac340-cloud-1786730369123',
    sourceIssue: 'HAC-340',
    semanticState: 'run.cloud.overview',
    query: 'run=hac340-cloud&proof=cloud&state=run.cloud.overview',
    crop: 'main#app',
    requires: [
      'GOOGLE CLOUD PARTICIPATION',
      'gemini-3.5-flash',
      'Google ADK 1.35.1',
      'Cloud Run-hosted agent',
      'Interlock MCP proxy',
      'ALLOW + authorization receipt',
      'EXECUTED',
      'OBSERVED',
      'alpha=45',
      '403',
      '401',
      'Not on the recorded path',
    ],
    forbids: ['WITHHOLD_SERIALIZE', '24/24', 'Baseline arm'],
    supportedClaim:
      'The merged cockpit renders the frozen HAC-340 cloud run: the lane-attributed path from Google to Interlock to the protected target to an independent observer, ALLOW + authorization receipt, EXECUTED, OBSERVED alpha=45, the 403/401/403 controls, and the not-on-the-recorded-path strip.',
    targetSurface: ['readme', 'devpost-screenshot'],
  },
  {
    id: 'IL-COCK-013',
    slug: 'run-cloud-evidence',
    judgeQuestion: 'Where is the immutable evidence, and what is withheld?',
    proofClass: 'B',
    proofClassLabel: 'GOOGLE CLOUD PARTICIPATION',
    run: 'ilk-hac340-cloud-1786730369123',
    sourceIssue: 'HAC-340',
    semanticState: 'run.cloud.overview',
    drawer: 'Verify this run',
    query: 'run=hac340-cloud&proof=cloud&state=run.cloud.overview',
    // The anchored panel beside the still-readable run column is the point, so
    // the crop is the union of both rather than either alone.
    crop: 'union:main#app,aside#drawer',
    requires: [
      'IMMUTABLE PUBLIC EVIDENCE',
      'TRANSPORT PROVENANCE',
      'APPLICATION PROVENANCE',
      'unavailable / non-public',
      'interlock-hac340-proxy-00002-wzf',
    ],
    forbids: ['WITHHOLD_SERIALIZE', '24/24'],
    supportedClaim:
      'The evidence panel exposes commit-pinned public evidence, keeps transport provenance separate from application provenance, and renders the runtime source URL as unavailable / non-public rather than fabricating a link. The panel is anchored, so the causal column stays readable behind it.',
    targetSurface: ['devpost-screenshot'],
  },
];

/**
 * Resolve playwright from outside the repository. ESM ignores `NODE_PATH`, so
 * an out-of-tree install is addressed explicitly via `PLAYWRIGHT_MODULE`.
 */
async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    process.env.PLAYWRIGHT_MODULE && `${process.env.PLAYWRIGHT_MODULE}/index.js`,
    'playwright',
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      const mod = await import(c.startsWith('/') ? `file://${c}` : c);
      // playwright ships CJS; a path import lands the exports on `default`.
      const resolved = mod.chromium ? mod : mod.default;
      if (resolved?.chromium) return resolved;
    } catch {
      /* try the next candidate */
    }
  }

  console.error(
    [
      'playwright could not be resolved, and it is deliberately not a dependency of',
      'this repository — the deterministic core and every gate must stay installable',
      'without a browser. Install it outside the repository to re-capture:',
      '',
      '    mkdir -p /tmp/il-capture && cd /tmp/il-capture',
      '    npm init -y && npm i playwright && npx playwright install chromium',
      '',
      '    cd <repo> && PLAYWRIGHT_MODULE=/tmp/il-capture/node_modules/playwright \\',
      '      node media/hac-335/bin/capture-cockpit.mjs',
      '',
      'The committed captures are gated by verify-package.mjs, which needs neither',
      'a browser nor a server.',
    ].join('\n'),
  );
  process.exit(2);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * The commit the captured surface was served from, read out of the git
 * directory rather than by shelling out. Two reasons: a subprocess resolved
 * through `PATH` is an injection surface in a script that also writes committed
 * artifacts, and `.git` is a *file* inside a worktree, so the naive read is
 * wrong exactly where this issue is developed.
 */
function gitSha() {
  let gitDir = join(ROOT, '.git');
  if (!existsSync(gitDir)) throw new Error('no .git found; cannot record the captured commit');

  // A linked worktree stores `gitdir: <path>` in a plain file where a normal
  // checkout has a directory.
  if (statSync(gitDir).isFile()) {
    const pointer = readFileSync(gitDir, 'utf8').trim();
    if (!pointer.startsWith('gitdir:')) throw new Error(`unrecognised .git file: ${pointer.slice(0, 40)}`);
    gitDir = pointer.slice(7).trim();
  }

  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref:')) return head;
  const ref = head.slice(4).trim();

  // A worktree's own gitdir holds HEAD but not the ref store; `commondir`
  // points at the checkout that does.
  const commonFile = join(gitDir, 'commondir');
  const common = existsSync(commonFile)
    ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim())
    : gitDir;

  for (const dir of new Set([gitDir, common])) {
    const loose = join(dir, ref);
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();

    // Packed refs: the common case for a freshly cloned checkout.
    const packed = join(dir, 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const [sha, name] = line.split(' ');
        if (name === ref) return sha;
      }
    }
  }
  throw new Error(`cannot resolve ${ref} to a commit`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  mkdirSync(OUT, { recursive: true });
  mkdirSync(dirname(MANIFEST), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const records = [];
  const failures = [];

  for (const c of CAPTURES) {
    // `static=1` forces the reduced-motion resolution: no in-flight animation
    // can land in a frame, so re-running this produces the same pixels.
    const url = `${COCKPIT}?${c.query}&static=1`;
    await page.goto(url, { waitUntil: 'networkidle' });

    if (c.drawer) {
      await page.getByRole('button', { name: c.drawer }).click();
      await page.waitForTimeout(400); // anchored panel transition settles
    }

    const text = await page.evaluate(() => document.body.innerText);
    for (const token of c.requires) {
      if (!text.includes(token)) failures.push(`${c.id}: required token absent: ${token}`);
    }
    for (const token of c.forbids) {
      if (text.includes(token)) failures.push(`${c.id}: cross-class token present: ${token}`);
    }

    let clip = null;
    if (c.crop) {
      // `union:a,b` crops to whichever anchor extends furthest down — used when
      // an open panel is taller than the run column beside it.
      const anchors = c.crop.startsWith('union:') ? c.crop.slice(6).split(',') : [c.crop];
      let height = 0;
      for (const a of anchors) {
        const box = await page.locator(a.trim()).boundingBox();
        if (!box) {
          failures.push(`${c.id}: crop anchor ${a.trim()} not found`);
          continue;
        }
        // The anchor's own box can be stretched by layout (a column with a
        // min-height fills the viewport whether or not it has content that far
        // down). The real extent is the furthest-down descendant that actually
        // renders something, so measure that.
        const inked = await page.locator(a.trim()).evaluate((el) => {
          let bottom = 0;
          for (const node of el.querySelectorAll('*')) {
            const r = node.getBoundingClientRect();
            if (r.height === 0 || r.width === 0) continue;
            const s = getComputedStyle(node);
            if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
            bottom = Math.max(bottom, r.bottom);
          }
          return Math.ceil(bottom);
        });
        height = Math.max(height, inked || Math.ceil(box.bottom));
      }
      if (height > 0) {
        // A descendant's box can sit a fraction under its own last text line;
        // pad so the crop never grazes a glyph.
        clip = {
          x: 0,
          y: 0,
          width: VIEWPORT.width,
          height: Math.min(height + CROP_PAD, VIEWPORT.height),
        };
      }
    }

    const name = `${c.id}-${c.slug}-${clip ? `${clip.width}x${clip.height}` : `${VIEWPORT.width}x${VIEWPORT.height}`}-run${c.run.replace(/[^a-z0-9]/g, '')}.png`;
    const file = resolve(OUT, name);
    const buf = await page.screenshot(clip ? { clip } : {});
    writeFileSync(file, buf);

    records.push({
      assetId: c.id,
      file: `media/hac-335/captures/${name}`,
      sha256: sha256(buf),
      judgeQuestion: c.judgeQuestion,
      proofClass: c.proofClass,
      proofClassLabel: c.proofClassLabel,
      sourceIssue: c.sourceIssue,
      run: c.run,
      semanticState: c.semanticState,
      drawerPanel: c.drawer || null,
      sourceUrl: `/media/hac-341/cockpit.html?${c.query}&static=1`,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
      width: clip ? clip.width : VIEWPORT.width,
      height: clip ? clip.height : VIEWPORT.height,
      cropAnchor: c.crop,
      reducedMotion: true,
      staticCapture: true,
      provenanceType: 'screenshot',
      supportedClaim: c.supportedClaim,
      requiredTokens: c.requires,
      forbiddenTokens: c.forbids,
      targetSurface: c.targetSurface,
    });

    console.log(`  ${name}  (${records.at(-1).width}x${records.at(-1).height})`);
  }

  await browser.close();

  if (consoleErrors.length) {
    failures.push(`cockpit emitted console errors during capture: ${consoleErrors.join(' | ')}`);
  }

  if (failures.length) {
    console.error('\ncapture FAILED');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  const manifest = {
    manifestId: 'HAC-335-capture-manifest',
    issue: 'HAC-335',
    generator: 'media/hac-335/bin/capture-cockpit.mjs',
    capturedFromSha: gitSha(),
    capturedSurface: 'media/hac-341/cockpit.html (merged executable surface)',
    servedFrom: 'repository root — the cockpit resolves shared identity from /assets',
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    // Provenance answers "which commit was served". Freshness answers "are
    // these still what the cockpit renders", which a commit SHA cannot: the
    // capture is committed in the same commit it would have to name. The
    // digest is computable before that commit exists and moves whenever a byte
    // that can change a captured pixel changes.
    captureSourceDigest: captureSourceDigest(ROOT),
    captureSourceFiles: captureSourceFiles(ROOT),
    note:
      'Real captures of the merged cockpit. Pixels inside each frame are unmodified. ' +
      'Crops drop unused canvas only; the crop height is the measured bounding box of ' +
      'main#app, never a hand-typed number. captureSourceDigest binds these frames to ' +
      'the render sources they came from; verify-package.mjs fails if they drift apart.',
    captures: records,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\ncaptured ${records.length} frames from ${gitSha().slice(0, 12)}`);
  console.log(`manifest ${MANIFEST.replace(`${ROOT}/`, '')}`);
}

await main();
