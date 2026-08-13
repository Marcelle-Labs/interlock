# Interlock

Composition engine and reference application for the WorkspaceJSON **Interlock**
contest submission.

Interlock is new work, created during the contest. It builds on the pre-existing
open-source **workspace.json** specification and toolchain, consumed at pinned
revisions and never copied. [`DISCLOSURE.md`](./DISCLOSURE.md) is the full
provenance statement; [`provenance/manifest.json`](./provenance/manifest.json) is
the machine-readable record CI enforces.

## Status

Bootstrapped under **HAC-328**. Implementation begins with HAC-330 (S-1),
HAC-325 (S0) and HAC-326 (S2).

## Getting started

This repository is one root of a multi-repository workspace. Clone it as a
sibling of the WorkspaceJSON repositories it consumes — the layout, permissions
matrix, and branch policy are in
[`docs/development/workspace.md`](./docs/development/workspace.md).

```sh
npm run check:provenance
```

## Working here

| Read this | For |
| -- | -- |
| [`AGENTS.md`](./AGENTS.md) | what this repository owns, and what it must never absorb |
| [`docs/development/workspace.md`](./docs/development/workspace.md) | workspace layout, permissions, worktrees, verification, connected surfaces |
| [`DISCLOSURE.md`](./DISCLOSURE.md) | what this submission may claim |
| [`docs/receipts/`](./docs/receipts/) | bootstrap receipt — pinned revisions and green baseline |

Work happens on short-lived issue branches from `main`, one bounded Linear issue
per change stream. No forks, no long-lived integration branch.
