# Semantic icon vocabulary — vendored Lucide primitives

Twelve outline primitives, vendored verbatim, for the generic concepts that
repeat throughout the judge-facing surfaces: proof path, evidence inspection,
controlled comparison, threshold, lineage, pass, unsafe, warning, refusal,
replay, frozen artifact and external evidence.

## What is not here

The Interlock mechanism. The gate, the mark and the coordination decision are
drawn with the canonical Interlock geometry in [`../logo/`](../logo/) and with
[`../brand/logo-geometry.js`](../brand/logo-geometry.js). A generic padlock,
shield or gate standing in for the mechanism would make the product-specific
claim with a stock outline, and the identity gate refuses it.

`ShieldCheck` was on the HAC-345 shortlist and is deliberately not vendored for
that reason. The rejected candidates and their reasons are recorded in
[`../../media/hac-341/lib/icons.mjs`](../../media/hac-341/lib/icons.mjs)
as `REJECTED_CANDIDATES`.

## Why vendored rather than installed

The cockpit is one static HTML file with no build step, served directly. A
runtime package to render twelve static outlines would add a dependency, a
bundle and a network surface to a page whose whole contract is that it renders
identically offline. The path data is inlined in `icons.mjs` and checked against
these bytes by `media/hac-341/bin/verify-cockpit.mjs`, so the copy cannot go
stale silently.

## Provenance

| | |
| --- | --- |
| Upstream | `https://github.com/lucide-icons/lucide` |
| Release | `1.34.0`, published 2026-08-24 |
| Commit | `1a60fd28ed7111bbf6acedc0896f3d83cd73945a` |
| License | ISC — [`LICENSE-lucide.txt`](./LICENSE-lucide.txt) |
| Modified | no — each file is the upstream byte content of `icons/<name>.svg` |

Rendered stroke weight is set by the consuming surface against the frozen
`--stroke-1` token rather than by the source files' 2/24 ratio. At the 13–22px
optical sizes this vocabulary is used at, that ratio renders a hairline beside
1.5px chip borders and the icons read as a lighter system sitting on top of the
grammar instead of as part of it. The geometry itself is unmodified.
