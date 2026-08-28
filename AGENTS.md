# AGENTS.md — `Marcelle-Labs/interlock`

Repository-local authority for agents working on **Interlock**. Read this before
editing anything here. The authoritative task contract is always the Linear
issue; this file tells you what this repository owns and what it may not absorb.

If this file and a Linear issue disagree, stop and record the conflict on the
issue rather than picking a side.

## Canonical spelling

The product is **Interlock** — `Interlock` in prose, `interlock` in identifiers
and paths. `Interlok`, `Interloc`, and `InterLoc` are not canonical and must not
appear as names. Visual identity may split the halves (`INTER / LOCK`,
`Inter·lock`) without changing the searchable name.

## What this repository owns

- the Interlock composition engine and reference application;
- Google ADK / Agent Runtime / Agent Gateway adapters and deployment configuration;
- the submission-local, experimental WorkspaceJSON revision-anchor extension;
- frozen fixtures and the Interlock evaluation harness;
- the protected target/tool implementation used by the reference system;
- pending-intent coordination and receipt implementation;
- the independent verifier;
- submission docs, architecture, reproducibility instructions, `DISCLOSURE.md`.

## What this repository must never absorb

- copied WorkspaceJSON source — specification, rules, producer, or mining logic;
- private swarm machinery from `Marcelle-Labs/ai-swarm`;
- reusable Studio implementation adopted merely for convenience;
- secrets of any kind, in any file, including fixtures and evidence packets.

`npm run check:provenance` enforces the first three through
[`provenance/manifest.json`](./provenance/manifest.json) and scans for the
fourth. It runs in CI on every pull request.

## Sibling repositories and what you may do with them

The workspace checks out siblings next to this repository. **Presence in the
workspace is not permission to write.** For the current phase — before HAC-330,
HAC-325 and HAC-326 pass:

| Sibling | Repository | You may | You may not |
| -- | -- | -- | -- |
| `../standard` | `workspacejson/standard` | read, validate against, pin | modify, or add anything Interlock-specific |
| `../cli` | `workspacejson/cli` | read, install, **execute** | modify to make a fixture or demo pass |
| `../integrations` | `workspacejson/integrations` | read, inspect | write; or pre-build the ADK abstraction before S0/S2 contracts exist |
| `../swarm` | `Marcelle-Labs/ai-swarm` | read, execute quality/orchestration tooling | add product-specific Interlock code |
| `../studio` | `Marcelle-Labs/director` | read; write **only** inside the scope a named approved Studio contract authorizes | write outside that scope, or take a dependency on a pinned Studio revision without an approved issue naming it |
| this repository | `Marcelle-Labs/interlock` | write, via an issue branch | push directly to `main` |

Studio is the one row where the default and the exception both matter. It is
read-only by default, and HAC-324 currently holds a bounded write scope for its
capture and harvest work — three merged pull requests against `director`. That
authority is HAC-324's, not the sprint's: no other issue inherits it by
adjacency, and harvesting a capability *toward* Studio is not a dependency *on*
it. `docs/development/workspace.md` records the scope in full.

Each sibling carries its own `AGENTS.md` / `OWNERSHIP.md`. Read the one in the
repository you are about to touch — it outranks this table for that repository.
`workspacejson/standard` in particular forbids proprietary references including
`@marcelle-labs/*`, so the dependency direction stays one-way:
**Interlock consumes upstream; upstream never references Interlock.**

Escalating a disposition needs the authorizing Linear issue (`META-330` for
integrations, an approved Standard issue for standard) and an update to
[`docs/development/workspace.md`](./docs/development/workspace.md). Editing the
manifest alone does not grant permission, and the provenance gate will say so.

## Using the mining path (HAC-330 / S-1)

Execute it from the pinned sibling checkout. Never copy it here.

```sh
cd ../cli && pnpm install --frozen-lockfile && pnpm -r build
```

Then either run the producer, or drive `mine → score → select` directly:

```js
import { mine, score, select } from '../cli/packages/mining-core/dist/index.js';
const selected = select(score(await mine(repoRoot)));
```

Two boundaries that are easy to cross by accident:

- `@workspacejson/mining-core` is `private: true` and unpublished. It cannot be
  installed from a registry. That is intentional.
- The package authorizes `mine → score → select` only. Projecting a selection
  onto `generated.coChange` is a separate staged step it **does not authorize**.
  Consume mined pairs as evidence; do not emit co-change into an artifact on the
  strength of this package.

The canonical reproduction driver is `../cli/evidence/meta-310/meta310-mine.mjs`,
byte-frozen at sha256 `5be5c814caed895b30a26d6fee697e1b65bc01c95789235dc49ad2a3f805e83c`.

## Branching

One bounded Linear issue per change stream. Branch from the current `main`:

```sh
git worktree add ../worktrees/interlock/hac-330-local-concept-gate -b hac/330-local-concept-gate main
```

Naming follows `<team>/<issue-number>-<slug>`, lowercased — `hac/330-…`,
`meta/337-…`. Do not open a long-lived `interlock` integration branch, and do not
fork a repository the organization already controls.

## Local verification

```sh
npm run check:provenance   # provenance boundary; required in CI
```

Add the checks your change needs to `package.json` and to
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) in the same pull
request. Do not weaken a gate to recover green.

## Authoritative external surfaces

| Question | Authority |
| -- | -- |
| What is the task, and is it in scope? | Linear issue (this repository's work is tracked under `HAC-*`/`META-*`) |
| Did CI pass; what is the review state? | GitHub checks on the pull request |
| What does the specification say? | `../standard` at the pinned revision |
| What evidence does the mining path produce? | `../cli` at the pinned revision |
| What may this submission claim? | [`DISCLOSURE.md`](./DISCLOSURE.md) |

Do not hydrate yourself with the whole sprint history. The issue contract, this
file, and the linked ADR/evidence are enough.
