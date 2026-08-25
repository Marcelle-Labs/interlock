# Identity harvest — HAC-332 design system, made repository-native

The Interlock identity used to live only in an external design handoff. Every
judge-facing surface therefore approximated it: the cockpit drew the mark as a
CSS rectangle, both surfaces named Geist and loaded no font, and the HAC-333
scene manifest cited a logo file that did not exist in this repository.

This directory closes that gap. After this harvest, HAC-333, HAC-341 and the
downstream HAC-335 packaging build from a clean clone with **no reference to the
handoff directory**. The handoff remains historical design provenance; it is no
longer an implementation dependency.

Source of the harvest: `/Users/user1/Downloads/interlock-handoff/project`
(external intake, not committed, not required at build or run time).

## Fonts

Vendored rather than fetched. A judge-facing surface may not depend on a font
CDN: it would make the rendered frame depend on network conditions, which
defeats deterministic capture and fails offline review.

| | |
| --- | --- |
| Upstream | `https://github.com/vercel/geist-font` |
| Release | `v1.7.2`, published 2026-06-01 |
| Tag commit | `a73329da8fc62afc917f796555202e4997f79b7c` |
| License | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| Reserved Font Name | none declared, so redistribution is unencumbered |
| Modified | no — both faces are the upstream bytes, renamed only |

Only the two variable faces are vendored. They cover the full 100–900 range the
frozen system uses, so the 38 static weights in the upstream archive are not
needed and are not carried.

## Semantic iconography (HAC-345)

Vendored for the same reason the faces are: a judge-facing surface may not
acquire a runtime network dependency, and the cockpit is one static file with no
build step. Twelve outline primitives cover the generic concepts that repeat
across the proof spine — proof path, evidence inspection, controlled comparison,
threshold, lineage, pass, unsafe, warning, refusal, replay, frozen artifact and
external evidence.

| | |
| --- | --- |
| Upstream | `https://github.com/lucide-icons/lucide` |
| Release | `1.34.0`, published 2026-08-24 |
| Commit | `1a60fd28ed7111bbf6acedc0896f3d83cd73945a` |
| License | ISC (`assets/icons/LICENSE-lucide.txt`) |
| Modified | no — each file is the upstream byte content of `icons/<name>.svg` |

The path data is inlined in `media/hac-341/lib/icons.mjs` so the cockpit renders
it without twelve extra requests; `media/hac-341/bin/verify-cockpit.mjs` checks
each inlined body against the vendored bytes, so the copy cannot go stale
silently. Registry row `IL-ICON-001` digest-gates the bytes themselves.

**The Interlock mechanism is not in this vocabulary.** The gate, the mark and
the coordination decision are drawn with `assets/logo/` geometry. `ShieldCheck`
was on the HAC-345 shortlist and is deliberately not vendored: a generic shield
standing in for the mechanism is the substitution the issue forbids. The other
rejected candidates are recorded in `icons.mjs` as `REJECTED_CANDIDATES`.

## What was classified, and what happened to it

| Family | Classification | Disposition | Reason |
| --- | --- | --- | --- |
| `assets/logo/**` | A — canonical shared source | **copied**, all 20 | The identity. Cited by HAC-333 SB-00 and required by HAC-341. |
| `assets/registry.json` | A / B | **reconciled** | Identity + cockpit rows ported preserving IDs; HAC-334's proof band keeps its own generated registry. |
| `assets/naming.js` | A | **already ported** | Landed in HAC-334 as `scripts/export-naming.mjs`. Not duplicated. |
| `tokens/*.css` | A | **copied**, 6 files | Consumed directly by both executable surfaces. |
| `tokens/fonts.css` | A | **rewritten** | Upstream loads a hosted web-font service. Replaced with local `@font-face`. |
| `styles.css` | A | **copied** | The `@import` manifold; every url() is local. |
| `components/_util/{states,edges,nodes}.js` | A | **copied** | Plain data tables — the state, edge and node grammar. Portable without React. |
| `components/brand/Logo.jsx` | A (geometry) / C (wrapper) | **geometry ported** | `LOGO_GEOMETRY` became `assets/brand/logo-geometry.js`. The React wrapper is unusable in a zero-dependency surface. |
| `validation/hostile-contexts.html` | A | **copied** | Identity-adherence harness: the mark in a tab, sidebar, header, navbar, mobile, 16:9 and greyscale. |
| `components/motion/phases.js` | **D — stale** | **rejected** | Encodes a `JOINT REVIEW → AUTHORIZED` lifecycle. The frozen packets emit no such state and every surface gate forbids it. |
| `components/**/*.jsx` (other) | C | **not ported** | React components no executable surface consumes. Their grammar is already carried by the `_util` tables. |
| `components/**/*.card.html`, `guidelines/**` | C | **not ported** | Specimen and documentation surfaces. |
| `templates/**` | C | **not ported** | Design sources, including `judge-cockpit/TheRun.dc.html`, consumed as reconciliation authority and recorded as provenance. |
| `cockpit/state-manifest.json` | B | **reconciled, not copied** | The repository view model is newer post-pivot authority. |
| `storyboard/scene-manifest.json` | B | **reconciled, not copied** | Repository holds `r03`, which supersedes the bundle's `r02`. |
| `architecture/visual-manifest.json` | B | **reconciled, not copied** | HAC-334 already transcribed the export matrix; it is merged and gated. |
| `docs/**` | C | **not ported** | Design documentation; the repository carries its own READMEs. |
| `reference/workspacejson-*` | **D — must not absorb** | **rejected** | Upstream WorkspaceJSON brand assets and website source. `AGENTS.md` forbids absorbing upstream material and `check:provenance` enforces it. |
| `uploads/**` | D — superseded | **rejected** | Pre-pivot historical screenshot. |
| `SKILL.md` | D — stale | **rejected** | Describes a different design system entirely — emerald/aqua palette, Plus Jakarta Sans. An agent following it builds the wrong brand. |
| `_ds_manifest.json`, `_ds_bundle.js`, `_adherence.oxlintrc.json`, `thumbnail.html` | C | **not ported** | Design-tool plumbing and React lint config; no executable surface uses them. |

## Portability of the ported logos

Fourteen files are pure vector geometry and are portable anywhere. Six are not:
the horizontal and compact lockups embed a live `<text>` element in Geist.

That distinction is recorded per file in `assets/registry.json` as
`containsLiveText` and `portability`, and it matters:

- **Executable HTML surfaces** compose the lockup from the canonical symbol
  geometry plus a live wordmark in the vendored face. That is what the frozen
  `Logo` component does, and it renders correctly offline.
- **The text-bearing lockup SVGs** are kept as editable source and as the
  artifact HAC-333 SB-00 cites. They render correctly wherever the local face is
  loaded.
- **A standalone outlined lockup** — for third-party embedding or print, where
  no Geist face is present — is a HAC-335 export concern and is **not** claimed
  here. Nothing in this repository represents a text-bearing SVG as fully
  portable.

## Checksums

| Source (bundle) | Destination | sha256 (16) |
| --- | --- | --- |
| `project/assets/logo/interlock-appicon-dark.svg` | `assets/logo/interlock-appicon-dark.svg` | `c1a0b6211362e8f3` |
| `project/assets/logo/interlock-appicon-light.svg` | `assets/logo/interlock-appicon-light.svg` | `82ecdc806453465c` |
| `project/assets/logo/interlock-favicon-dark.svg` | `assets/logo/interlock-favicon-dark.svg` | `9bbd85135a010e04` |
| `project/assets/logo/interlock-favicon-light.svg` | `assets/logo/interlock-favicon-light.svg` | `0d77f2d19ba96826` |
| `project/assets/logo/interlock-lockup-compact-black.svg` | `assets/logo/interlock-lockup-compact-black.svg` | `49ecd6dbe5b4d5f3` |
| `project/assets/logo/interlock-lockup-compact-white.svg` | `assets/logo/interlock-lockup-compact-white.svg` | `115a16523b766709` |
| `project/assets/logo/interlock-lockup-compact.svg` | `assets/logo/interlock-lockup-compact.svg` | `378cfd216369a81b` |
| `project/assets/logo/interlock-lockup-horizontal-black.svg` | `assets/logo/interlock-lockup-horizontal-black.svg` | `f247bae05b8d5692` |
| `project/assets/logo/interlock-lockup-horizontal-white.svg` | `assets/logo/interlock-lockup-horizontal-white.svg` | `2b68b49f54348822` |
| `project/assets/logo/interlock-lockup-horizontal.svg` | `assets/logo/interlock-lockup-horizontal.svg` | `ba2a132e023e616a` |
| `project/assets/logo/interlock-micro.svg` | `assets/logo/interlock-micro.svg` | `e5a059559db0550d` |
| `project/assets/logo/interlock-state-1.svg` | `assets/logo/interlock-state-1.svg` | `1d83f3d5bc8a3a63` |
| `project/assets/logo/interlock-state-2.svg` | `assets/logo/interlock-state-2.svg` | `d0b077f2ab05275b` |
| `project/assets/logo/interlock-state-3.svg` | `assets/logo/interlock-state-3.svg` | `0fe1c962d45a450f` |
| `project/assets/logo/interlock-state-4.svg` | `assets/logo/interlock-state-4.svg` | `2a1bf9a57775a156` |
| `project/assets/logo/interlock-state-5.svg` | `assets/logo/interlock-state-5.svg` | `f166cc2ffb7f7808` |
| `project/assets/logo/interlock-symbol-black.svg` | `assets/logo/interlock-symbol-black.svg` | `db48b67682f22e9d` |
| `project/assets/logo/interlock-symbol-open.svg` | `assets/logo/interlock-symbol-open.svg` | `5ee1b54ba019fc81` |
| `project/assets/logo/interlock-symbol-white.svg` | `assets/logo/interlock-symbol-white.svg` | `0b5ae476989d9e31` |
| `project/assets/logo/interlock-symbol.svg` | `assets/logo/interlock-symbol.svg` | `3a4325e8ef06ab6a` |

| upstream vercel/geist-font v1.7.2 | `assets/fonts/geist-variable.woff2` | `a369fcf5628ea2aa4e1b9e2ec6a5b3624e365bda588e1f0f2f12b564f728fbb8` |
| upstream vercel/geist-font v1.7.2 | `assets/fonts/geist-mono-variable.woff2` | `fba8f577f38a2bbcbe818efa6348dd58f36303a10b8737c42fefad275be563ab` |
| upstream vercel/geist-font v1.7.2 | `assets/fonts/OFL.txt` | `c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90` |

| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/ban.svg` | `2eba67f86d70bbd5d22e4211d44d7dda86c3397410f714765a12c3cd3ca0ebe3` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/circle-check-big.svg` | `25f075fd621df48282ace8326680a4cd165965e61458d2fd0cc1303cefc179ac` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/circle-x.svg` | `bcd8788901e6f29e1b231a81ba5e707d083d06cb4848a28f29407fab4f8e0b64` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/external-link.svg` | `3891241b8c3bfc3a8a930078f26ffc5a7e9763da6d0162ace2050b28d4c1d1fe` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/file-check.svg` | `c64133f05e44d87830e37c7a9c45a439c5146017f86e91e563f806ff8a2ad4c1` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/gauge.svg` | `d7710543a5085c5a61d0bbac1da8b89ef28e541b38ed739357991dff33d475b5` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/git-branch.svg` | `041f04acc8f92657b849540f0440e2e85d0df0b8da2365611e81b9bebfafc4eb` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/git-compare-arrows.svg` | `312a5913462dd0bd33bb3dae8e136ee2a4396e0906b917be4a2c1dd3c2d2a2a2` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/rotate-ccw.svg` | `622685386ab4017eabfde01cd74550a20b1924df233b353f73b6b155371f2afd` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/route.svg` | `fc169fd38a9963b016ad6d60fd72baa2b0ea8e0cec085bbc53287297c3d8121a` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/scan-search.svg` | `a2919e740bb122bb737542119c1d3c1042bcd62c79d702804553cc95ac768e1e` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/lucide/triangle-alert.svg` | `4866f38b8560d410f21e3226413e0b77997b6dfbb6931fadfe0a0d5aef9ffeb4` |
| upstream lucide-icons/lucide 1.34.0 | `assets/icons/LICENSE-lucide.txt` | `b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57` |
