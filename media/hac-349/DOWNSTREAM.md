# HAC-349 — what changed downstream

The public information hierarchy moved from cockpit-first to consequence-first.
`/` is now `media/hac-349/landing.html`; `/cockpit` and `/storyboard` are
unchanged and still resolve.

This file records what HAC-335, HAC-336 and HAC-337 must now consume. HAC-349
deliberately did **not** rewrite their deliverables — that is their scope, and
doing it here would fold final media assembly into a UX issue. Two changes were
made inside this branch because leaving them would have shipped documentation
that was wrong about its own repository; both are named below.

## Made here

| File | Change | Why it could not wait |
| -- | -- | -- |
| `README.md` | The "Can I verify it?" section now names the landing surface as the front door before listing the cockpit deep links. | Without it the deliverable is unreachable from the repository, and the README instructs a reader to enter at the surface that is no longer the entry. |
| `README.md` | `pnpm check:landing` added to the individual-gates table. | `pnpm run check` now runs it. A gate table that omits a gate in the aggregate command is wrong about the build. |
| `vercel.json` | `/` → `/media/hac-349/landing`; cache header for the landing model. | The route change is the deliverable. |
| `package.json`, `.github/workflows/ci.yml` | Three scripts and two CI jobs. | A gate nobody runs is not a gate. |

Nothing else in `media/hac-335`, `media/hac-336` or `media/hac-337` was touched.
All of their gates pass unchanged.

## HAC-335 — README, Devpost, screenshots, asset registry

**Not invalidated.** `judge-sequence.json` was already ordered
consequence-first — hero, causal proof, perturbation, verify, reset, cloud,
controls, architecture, claim boundary — so HAC-349 implements the sequence
HAC-335 already declares rather than contradicting it. `check:package` passes.

**Now stale, and HAC-335's to resolve:**

1. **No capture of the front door exists.** `capture-manifest.json` names four
   `IL-COCK-01x` captures, all of `media/hac-341/cockpit.html`. They are still
   truthful captures of the cockpit, which is unchanged — but the surface a
   judge now meets first has no asset. Needs new landing captures at 1440×900
   (`?static=1` for a deterministic render), registered in
   `asset-registry.json`, with `captureSourceFiles` extended to
   `media/hac-349/landing.html`, `lib/story.mjs` and
   `evidence/landing-model.json` so `captureSourceDigest` binds them.
   `bin/capture-cockpit.mjs` either grows a landing target or gains a sibling.

2. **`judge-sequence.json` step 4 (`seq.verify`, "The Run — verify it")** now
   describes the *second* surface a judge sees. Consider whether steps 1–3 gain
   `"web-root"` in their `surfaces` array, and whether step 4's title should
   distinguish the narrative surface from the verification surface. The ordering
   itself needs no change.

3. **`devpost/05-evidence-and-verification.md`** lists three cockpit deep links
   as the verification path. Correct, and still resolvable — but a judge
   arriving from Devpost should be offered `/` first and the deep links as the
   drill-down.

4. **`README.md` beyond the two lines changed here.** The hero capture is still
   a cockpit frame. If the README is meant to mirror the judge path, the hero
   should become the L1 frame and the cockpit capture should move down to the
   verification section.

5. **`devpost/03-technical-architecture.md`** says "the storyboard and the
   cockpit — are dependency-free HTML". Now three surfaces. Accurate as far as
   it goes; incomplete.

## HAC-336 — final media assembly

**Not invalidated.** The 21-beat cut already follows the same cognitive
sequence, and already carries the four-arm comparison (`B07`) adjacent to the
ablation (`B08`), which is exactly the HAC-349 L2 order. `check:film` passes.

**What HAC-336 must now do:**

1. If any beat is a screen recording or capture of the live site, it must record
   `/`, not `/cockpit`. `frame-manifest.json` currently binds to HAC-324 filmed
   captures and rendered SVG masters, not to site captures, so this is a
   forward constraint rather than a repair.

2. The cut's opening beats (`B02` intents, `B03` coupled, `B04` baseline) now
   have a web counterpart that says the same thing. Keep them consistent — if
   the film's phrasing and the landing's phrasing diverge, a judge who watches
   then reads will think they are two different arguments.

3. Do not reintroduce cockpit-first exposition when assembling. The proof-class
   reset at `B09` and the landing's cloud reset should read as the same
   editorial move.

## HAC-337 — Devpost dry run

**The dry run must now validate a different path.** Previously: open the
cockpit, read the pinned run. Now:

```
/  → L1 thesis → lock baseline → four-arm → ablation → verify → cloud reset
                                                          ↓
                                                      /cockpit deep link
```

Specifically:

1. Verify `/` resolves on the **public custom domain in a logged-out window**.
   The `*.vercel.app` URLs are SSO-protected and are not a valid dry-run target.
2. Verify the four routes from the landing's verify section land on real cockpit
   states, logged out. They are gate-checked against the deep-link contract, but
   the contract is checked in the repository, not against the deployment.
3. Verify the landing model is served — `/media/hac-349/evidence/landing-model.json`
   must return 200. If it does not, the page renders its degraded state, which
   is correct behaviour but not a submission-ready front door.
4. Re-check the cache posture. `/` is a document and the landing model has a
   1-hour cache; the module and asset paths are `max-age=0, must-revalidate` on
   this branch's base, which is the fix for the blank-cockpit defect. A redeploy
   that reintroduces `immutable` on `/media/(.*).mjs` breaks the landing the
   same way it broke the cockpit.

## The gate that is still open

`HAC-348`'s human obligation is **not discharged**. It asked for the remaining
cold read to be run against the assembled judge path once HAC-349 landed. The
kit for that is `media/hac-349/cold-read/HAC-349-assembled-path.md` and it is
unrun.

```
HUMAN COLD READ: NOT RUN.
```

HAC-337's freeze candidate should treat comprehension of the judge path as
**unmeasured**, not as passed. No automated result in this branch may be cited
as a comprehension outcome.
