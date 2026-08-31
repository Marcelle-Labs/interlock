# DISCLOSURE

**Product:** Interlock
**Submission repository:** `Marcelle-Labs/interlock`
**Owning organization:** Marcelle-Labs
**Authoritative bootstrap issue:** HAC-328

This document states, in plain language, what in this submission was built during
the contest and what already existed. The machine-readable record is
[`provenance/manifest.json`](./provenance/manifest.json); it is enforced in CI by
[`scripts/check-provenance.mjs`](./scripts/check-provenance.mjs). Where the two
disagree, the manifest and the script win — this file is the readable summary of
the same facts, not a second source of truth.

## Short version, for Devpost

Interlock is a new application built during the contest. It stands on a
pre-existing open-source specification and toolchain — **workspace.json** —
published by the same organization before the contest began. That upstream work
is **consumed at pinned revisions**, the way any project consumes a dependency.
No upstream source was copied into this repository, and no upstream
specification was changed to make this submission work.

## What is new, created during the contest

Everything in this repository, beginning at commit
`c83a5d0f93d0b81af552a4af0fbdaca3f74ad61a` (repository created 2026-08-12):

- the Interlock composition engine and reference application;
- Google ADK integration and the Cloud Run deployment configuration used by
  the recorded run, together with the Agent Runtime / Agent Gateway
  `CONTENT_AUTHZ` adapters authored for HAC-325 — that insertion point was
  falsified and is not on the recorded path;
- a submission-local, experimental WorkspaceJSON **revision-anchor extension**;
- frozen fixtures and the evaluation harness specific to Interlock;
- the protected target/tool implementation used by the reference system;
- pending-intent coordination and receipt implementation;
- the independent verifier;
- submission documentation, architecture notes, reproducibility instructions, and this file.

## What already existed, and is consumed rather than copied

| Repository | Owner | Pinned at | How it is used |
| -- | -- | -- | -- |
| `workspacejson/standard` | workspacejson | `a3caece60bde12c41105a9987f50afa9e33dcb7b` (`@workspacejson/spec` / `@workspacejson/rules` 0.4.4) | Specification authority — schema, validation semantics, deterministic rules. Read-only and pinned. |
| `workspacejson/cli` | workspacejson | `defac1e5dce6fb692a48e775fb44854b371cbca4` (`@workspacejson/cli` 0.5.2, `@workspacejson/mining-core` 0.0.0) | Real commit-history co-change mining and the neutral producer. Executed as an external tool. |
| `workspacejson/integrations` | workspacejson | `70cfd57ff57c873fb22daaa8d94afa5a14601d27` | Inspected for prior art on host-integration and authorization seams. |
| `Marcelle-Labs/ai-swarm` | Marcelle-Labs | `74e4ee1f9ec083b0dba029b4b2db6339cc49c5fa` | Private development infrastructure — agent orchestration and merge gates. Not part of the submitted product. |

All four are **CONSUMED**: linked, installed, or executed in place at the pinned
revision. None is **COPIED**. `scripts/check-provenance.mjs` fails the build if any
entry is ever marked `COPIED`, and fails if any of these siblings is marked
writable while the current phase says otherwise.

## Third-party content vendored into this repository

One thing is genuinely **copied in** rather than consumed at a pinned revision,
so it is called out separately from the table above.

| What | Upstream | Version | License |
| -- | -- | -- | -- |
| Geist and Geist Mono, variable web faces | `https://github.com/vercel/geist-font` | `v1.7.2`, tag commit `a73329da8fc62afc917f796555202e4997f79b7c` | SIL Open Font License 1.1 |

The two `.woff2` files under `assets/fonts/` are the upstream bytes, unmodified
and renamed only; their SHA-256 digests and the full licence text are recorded in
`assets/HARVEST.md` and `assets/fonts/OFL.txt`. The OFL permits redistribution,
and the upstream copyright line declares no Reserved Font Name.

They are vendored rather than fetched because a judge-facing surface may not
depend on a font CDN: it would make the rendered frame depend on network
conditions, which defeats deterministic capture and offline review. No other
third-party asset is copied into this repository.

### Why the mining path is executed, not vendored

The co-change evidence that drives the Interlock counterfactual comes from
`@workspacejson/mining-core`, the L0 commit-graph mining core inside
`workspacejson/cli`. Two consequences matter for disclosure:

1. That package is `private: true` and unpublished. It cannot be installed from a
   registry, so Interlock executes it from the pinned sibling checkout. This is a
   deliberate boundary, not an oversight — **mining logic is never copied into
   this repository**.
2. The package authorizes `mine → score → select` only. Projecting a selection
   onto `generated.coChange` is a separate, staged step that the package
   explicitly does not authorize. Interlock therefore consumes mined observations
   as *evidence* and does not emit co-change into a `workspace.json` artifact on
   the strength of that package.

The canonical reproduction driver is `evidence/meta-310/meta310-mine.mjs` in
`workspacejson/cli`, byte-frozen at sha256
`5be5c814caed895b30a26d6fee697e1b65bc01c95789235dc49ad2a3f805e83c`. That digest
was verified during HAC-328 bootstrap.

## Submission-local machinery for the S-1 concept gate (HAC-330)

Two pieces of submission-local machinery were authored during the contest for the
S-1 local concept gate. Both live only in this repository.

> **Neither is part of released WorkspaceJSON v0.4** (`@workspacejson/spec` 0.4.4).
> Neither carries specification authority, and neither may be described as a
> WorkspaceJSON feature.

**`hac-330-evidence-adapter`** — a thin wrapper that locates the pinned
`workspacejson/cli` sibling checkout, refuses to run unless that checkout matches
the manifest pin and is clean, executes the upstream `mine → score → select`
pipeline in place, and records provenance around the verbatim result: producer
repository SHA, package version, producer bundle digest, source revision, history
basis revision, and artifact digest. It contains **no mining logic of its own**
and writes **no `workspace.json`**.

It adds exactly one check the upstream package does not make. Git resolves a path
by walking *up* until it finds a repository, so asking the miner about a directory
that is not itself a repository succeeds against the nearest ancestor and returns
a well-formed, correctly-pinned result about a different repository. No
completeness state describes that, because from the miner's side the analysis
genuinely succeeded. The adapter records whether the repository mined is the
repository requested, and Interlock refuses evidence that fails it. This is a
consumer-local defence; the finding is written up in
[`experiments/hac-330/README.md`](./experiments/hac-330/README.md) for a
separately approved upstream issue to consider. **No upstream change was made.**

**`hac-330-fixture-harness`** — the frozen fixtures, protected mutation broker and
evaluation harness for the experiment. It generates two synthetic Git histories
that differ only in which files were historically co-maintained. The histories are
synthetic and are labelled as such everywhere they appear; the **co-change
evidence derived from them is not** — it is produced solely by the pinned upstream
miner reading those commit graphs.

## Submission-local machinery for the S2 enforcement gate (HAC-326)

**`hac-326-fallback-enforcement`** — the bounded Interlock MCP/API proxy, the
deterministic pending-intent arbitration, the Ed25519 authorization receipt, the
protected target that validates that receipt independently, and the evaluation
harness that attacks the target directly and chaos-tests every failure mode.
Authored during the contest; it lives only in this repository.

> **Not part of released WorkspaceJSON v0.4** (`@workspacejson/spec` 0.4.4). It
> carries no specification authority and must not be described as a
> WorkspaceJSON feature.

It **consumes** the co-change evidence artifact produced during HAC-330 —
verbatim, at the revision that artifact is pinned to. It contains no mining logic,
re-derives no co-change, and writes no `workspace.json`. The authorization receipt
is an S2 contract fixture, not a production schema; HAC-317 owns that.

The recorded cloud arm ran on Cloud Run in a disposable Google Cloud project
created for the experiment and deleted at teardown. **No key material is
committed**: signing key pairs are minted per deployment into a gitignored working
directory, and only environment variable *names* appear in source.

## The submission-local revision-anchor extension

The `revision-anchor-extension` is authored during the contest and lives only in
this repository.

> **It is not part of released WorkspaceJSON v0.4** (`@workspacejson/spec` 0.4.4).
> It carries no specification authority, has not been ratified, and must not be
> described as a WorkspaceJSON feature.

After submission it is either harvested into `workspacejson/standard` through a
separately approved Standard issue and ADR, or deleted. `check-provenance.mjs`
requires every submission-local item to carry that statement explicitly.

## Ownership boundary

The dependency direction is one-way and must stay that way:

```
Interlock  ──consumes──▶  standard / cli / integrations
```

`workspacejson/standard` forbids proprietary references — including
`@marcelle-labs/*` — and forbids prescriptive policy in that repository. Nothing
in Interlock may be added to, referenced from, or required by the upstream
specification in order to make this submission work.

## What is deliberately not here

- No copied WorkspaceJSON specification, rules, producer, or mining source.
- No private swarm machinery. `Marcelle-Labs/ai-swarm` is development
  infrastructure and is not submitted as product.
- No Studio implementation adopted for convenience.
- No secrets. Environment variable **names** are recorded in the bootstrap
  receipt; values never are. `check-provenance.mjs` scans for credential-shaped
  strings and fails the build on a hit.

## Keeping this honest

Update `provenance/manifest.json` in the same pull request as the change it
describes, whenever you:

- add or upgrade a dependency on a sibling repository;
- change a pinned revision;
- add submission-local machinery;
- change what any of it is used for.

CI runs `npm run check:provenance` on every pull request. A change that widens
the provenance boundary without recording it does not merge.
