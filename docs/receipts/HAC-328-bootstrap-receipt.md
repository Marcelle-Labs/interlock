# HAC-328 bootstrap receipt

Recorded **2026-08-13 (UTC)** on `hac/328-bootstrap-workspace`.
Authoritative issue: [HAC-328](https://linear.app/marcelle-labs/issue/HAC-328).

This receipt records the state the workspace was bootstrapped into, so a fresh
agent can reproduce it and so later drift is visible. Environment variable
**names** appear here; values never do.

## 1. Local workspace tree

The parent directory is **not** a Git repository, and no repository is nested
inside another.

```text
interlock-workspace/                       # not a git repository (verified)
  interlock/                               # Marcelle-Labs/interlock
  standard/                                # workspacejson/standard
  integrations/                            # workspacejson/integrations
  cli/                                     # workspacejson/cli
  swarm/                                   # Marcelle-Labs/ai-swarm
  worktrees/
    interlock/
      hac-328-bootstrap-workspace/         # issue worktree (.git is a file)
  interlock.code-workspace                 # multi-root editor config; not product source
```

Verification performed at bootstrap:

- `git -C interlock-workspace rev-parse --show-toplevel` → fails, as required.
- `find . -name .git -maxdepth 3` → exactly five entries, all at depth 1.
- The worktree's `.git` is a regular file pointing into `interlock/.git/worktrees/`,
  so it is not a nested history.

## 2. Repositories, remotes, initial revisions, disposition

| Repository | Remote | Initial SHA | Ref | Disposition |
| -- | -- | -- | -- | -- |
| `Marcelle-Labs/interlock` | `https://github.com/Marcelle-Labs/interlock.git` | `c83a5d0f93d0b81af552a4af0fbdaca3f74ad61a` | `main` | **writable** |
| `workspacejson/standard` | `https://github.com/workspacejson/standard.git` | `a3caece60bde12c41105a9987f50afa9e33dcb7b` | `main` | read-only, **pinned** |
| `workspacejson/cli` | `https://github.com/workspacejson/cli.git` | `defac1e5dce6fb692a48e775fb44854b371cbca4` | `main` | execute / read |
| `workspacejson/integrations` | `https://github.com/workspacejson/integrations.git` | `70cfd57ff57c873fb22daaa8d94afa5a14601d27` | `main` | read / inspect |
| `Marcelle-Labs/ai-swarm` | `https://github.com/Marcelle-Labs/ai-swarm.git` | `74e4ee1f9ec083b0dba029b4b2db6339cc49c5fa` | `main` | execute / read |

All five were clean with zero modified files at clone time.

### Package versions at pin

| Package | Version | Source |
| -- | -- | -- |
| `@workspacejson/spec` | 0.4.4 | `workspacejson/standard` |
| `@workspacejson/rules` | 0.4.4 | `workspacejson/standard` |
| `@workspacejson/cli` | 0.5.2 | `workspacejson/cli` |
| `@workspacejson/mining-core` | 0.0.0 | `workspacejson/cli` — `private: true`, unpublished |
| `agents-audit` | 0.4.4 | `workspacejson/cli` — frozen compatibility bridge |

`workspacejson/standard` publishes no tags or releases, so the contest baseline
is pinned by **SHA**, not by tag. `@workspacejson/spec` 0.4.4 is the released
v0.4 line that pin corresponds to.

### Studio

| Repository | Remote | SHA at bootstrap | Ref | Disposition |
| -- | -- | -- | -- | -- |
| `Marcelle-Labs/director` | `https://github.com/Marcelle-Labs/director.git` | `98857b697fc74b3a4ddb55aa72828b4760e6c86f` | `main` | **read-only, visibility only** |

Present at `studio/`, clean, cloned by another actor in the sprint rather than by
this bootstrap. HAC-328 permits a day-one Studio clone for visibility and
requires it stay read-only until an approved Studio issue activates work. No such
issue is active, so **`studio/` is read-only** and no Interlock change may depend
on it.

It is deliberately **absent from `provenance/manifest.json`**: the manifest
records what the submission consumes, and Studio is not consumed. If Studio code
is ever consumed, it gets a manifest entry and a disclosure line in the same pull
request as the code that consumes it.

One open question remains. The local `demo-studio` and `demo-studio-v3` checkouts
both point at `Marcelle-Labs/director`, so "Studio v3" still does not resolve to
one unambiguous remote or revision by name. The clone settles which *repository*
is meant; it does not settle which line of work is "v3". An approved Studio issue
should name the revision before anything depends on it.

## 3. Branch protection and required checks

| Repository | Protection |
| -- | -- |
| `Marcelle-Labs/interlock` | **protected** — PR required; required check `Provenance boundary`; strict (up-to-date) merges; linear history; conversation resolution; force-push and deletion blocked; `enforce_admins` off |
| `workspacejson/standard` | protected — `test (20)`, `test (22)`, `Four-path producer conformance`, `Greptile Review` |
| `workspacejson/cli` | protected — `test (20)`, `test (22)`, `Compatibility parity vs frozen source` |
| `workspacejson/integrations` | protected — `build-and-smoke (20)`, `build-and-smoke (22)`, `Greptile Review` |
| `Marcelle-Labs/ai-swarm` | **unavailable** — private repository on a GitHub Free organization; protection and rulesets both return HTTP 403 |

`enforce_admins` is off on `Marcelle-Labs/interlock`, matching the convention on
all three WorkspaceJSON repositories. It is a break-glass affordance, not a
routine path: no routine agent bypass of required checks, and no weakening a gate
to recover green.

See [§9](#9-conflicts-and-decisions-recorded) for the protection timeline — this
repository was private and unprotectable at the start of bootstrap.

## 4. Branch and worktree policy

- Protected `main`; short-lived branch-per-issue, worktree-per-agent.
- Naming `<team>/<issue-number>-<slug>`, lowercased — `hac/330-local-concept-gate`,
  `meta/337-quality-gates`.
- **No forks** of repositories the organization controls.
- **No long-lived `interlock` integration branch.**
- Worktrees live under `interlock-workspace/worktrees/<repo>/<branch>/`, never
  inside a repository.

Bootstrap itself was performed this way: branch `hac/328-bootstrap-workspace`,
worktree `worktrees/interlock/hac-328-bootstrap-workspace`, pull request
[#1](https://github.com/Marcelle-Labs/interlock/pull/1).

## 5. Toolchain

| Tool | Version |
| -- | -- |
| Node.js | v22.19.0 |
| npm | 10.9.8 |
| pnpm | 10.24.0 |
| Python | 3.12.12 |
| uv | 0.11.31 |
| git | 2.52.0 |
| GitHub CLI | 2.86.0 |
| Google Cloud CLI | **not installed** |
| OS | macOS 26.1, arm64 |

CI pins Node to `22.19.0` on `ubuntu-24.04`.

Node v22.19.0 matches the environment recorded for the frozen META-310 evidence
run exactly. That run also records pnpm 9.0.0; the local pnpm is 10.24.0, which
does not affect reproduction because the frozen runner installs with **npm**, not
pnpm.

### Google Cloud

No Google Cloud project, account, or region is recorded, because `gcloud` is not
installed and no project context is configured. Selecting and authenticating that
surface belongs to HAC-325 (S0) and HAC-326 (S2), which own the Agent Gateway and
Agent Runtime work. Recording a placeholder here would be a fabricated
reproducibility claim.

## 6. Connected surfaces

Configured, each with a named job and a fallback:

| Surface | Job | Credential posture | Fallback |
| -- | -- | -- | -- |
| **Linear** (MCP) | authoritative issue state and relations; agents post progress, receipts, and conflicts | workspace-scoped; no admin operations used | read the issue in the browser |
| **GitHub** (`gh` CLI) | repository, PR, and check state; branch protection administration | token scopes `gist`, `read:org`, `repo`, `workflow` — no `admin:org` | GitHub web UI |
| **Local WorkspaceJSON tooling** | real mining and producer evidence from `cli/` at its pinned revision | local execution only; no network credential | none — this path is required for HAC-330 |
| **Google Cloud docs / CLI** | S0/S2 only | **not yet configured** — see above | official documentation |

Deliberately not configured: broad email, calendar, or CRM connectors;
write-capable production services unrelated to the current issue; any MCP server
that duplicates a deterministic local command or a GitHub check without reducing
agent latency. SonarQube/Codecov and Greptile/Sourcery visibility remain optional,
pending demonstrated need.

### Environment variable names

Names only. No values are recorded anywhere in this repository.

| Name | Where | Note |
| -- | -- | -- |
| `NPM_TOKEN` | `cli/.npmrc` | referenced by the pinned CLI checkout; **unset locally**, which is correct — the CLI's install and build do not need it, and `workspacejson/standard` documents that no npm publish credential should exist yet |

## 7. Install and bootstrap commands

```sh
mkdir -p interlock-workspace && cd interlock-workspace

git clone https://github.com/Marcelle-Labs/interlock.git       interlock
git clone https://github.com/workspacejson/standard.git        standard
git clone https://github.com/workspacejson/integrations.git    integrations
git clone https://github.com/workspacejson/cli.git             cli
git clone https://github.com/Marcelle-Labs/ai-swarm.git        swarm

cd cli && pnpm install --frozen-lockfile && pnpm -r build && cd ..
cd interlock && npm run check:provenance
```

## 8. Green baseline

### `Marcelle-Labs/interlock` — writable

| Check | Result |
| -- | -- |
| `npm run check:provenance` | **PASS** — 6 entries checked, disclosure covers all |
| Required authority files present | **PASS** — all 6 |
| Canonical product spelling | **PASS** |
| CI on `hac/328-bootstrap-workspace` (run `31654476832`) | **success** — job `Provenance boundary` |

The provenance gate is **red-tested**, so a pass means something. All four
negative cases fail as they should:

| Injected boundary crossing | Result |
| -- | -- |
| upstream dependency marked `COPIED` | FAIL, exit 1 |
| pinned sibling escalated to `WRITABLE` | FAIL, exit 1 |
| submission-local machinery claiming released-spec authority | FAIL, exit 1 |
| credential-shaped string in the manifest | FAIL, exit 1 |

### `workspacejson/cli` — execute/read, the HAC-330 evidence dependency

Not writable, so this is a capability verification rather than a merge gate.

| Check | Result |
| -- | -- |
| `pnpm install --frozen-lockfile` | clean, exit 0 |
| `pnpm -r build` | clean, exit 0 |
| `pnpm --filter @workspacejson/mining-core test` | **97/97 passed** |
| `node packages/cli/dist/cli.js generate . --dry-run` | exit 0 — `specVersion 0.4`, 115 files indexed |
| `mine → score → select` on real history | `QUALIFYING_RELATIONSHIP_OBSERVED` |
| `evidence/meta-310/meta310-mine.mjs` digest | **matches** published `sha256 5be5c814…f805e83c` |
| Working tree after all runs | **clean** — the pinned checkout was not mutated |

Mining result against `workspacejson/cli` at `defac1e5`: 57 first-parent
transitions, 7,231 observed pairs at ≥1 co-occurrence, 41 scored, 41 selected
(`minSupport` 3, cap 50, `capBound` false).

`Marcelle-Labs/ai-swarm` is execute/read this phase and has no Interlock-owned
baseline; META-331/META-337 own its verification.

## 9. Conflicts and decisions recorded

1. **Branch protection was unavailable at the start of bootstrap.**
   `Marcelle-Labs/interlock` was private under a GitHub Free organization, so
   protection and rulesets both returned HTTP 403. Making the repository public
   to unlock protection was deliberately **not** done as a bootstrap side effect —
   submission posture belongs to HAC-329. The repository was subsequently made
   public by another actor during the sprint, at which point protection became
   available and was applied as recorded in §3. The submission-posture decision
   remains HAC-329's to ratify.

2. **`gcloud` is absent.** No Google Cloud identifiers are recorded. Owned by
   HAC-325/HAC-326. See §5.

3. **Studio identity is ambiguous.** `demo-studio` and `demo-studio-v3` both
   point at `Marcelle-Labs/director`. Studio is excluded from the workspace until
   an approved Studio issue names one remote. See §2.

4. **Concurrent pull request collision.** PR
   [#2](https://github.com/Marcelle-Labs/interlock/pull/2) (META-337, quality
   gates) was opened one minute after PR #1 and adds `.github/workflows/ci.yml`,
   `.gitignore`, and `package.json` — all three of which PR #1 also creates.

   PR #1 was merged at `2026-08-13T00:29:54Z` by another actor in the sprint,
   about two minutes after it was opened and before this receipt was written.
   That ordering is what HAC-328's cross-repository rule prescribes — base
   capability first, dependent change rebases onto it — but it was not a decision
   this bootstrap made or coordinated. Two consequences are open:

   - **PR #2 must rebase onto `main`** and reconcile those three files rather
     than create them. It cannot merge as-is.
   - The merge landed **before** branch protection was applied (§3), so it did
     not pass through the gate that now governs `main`. The content is the
     reviewed content of PR #1 and CI was green on it (run `31654476832`), so
     this is a recorded gap in process, not in content.

   This receipt therefore lands as its own pull request, rebased onto the new
   `main`, rather than as part of PR #1.

5. **A redundant Interlock checkout exists** at `/Users/user1/dev/interlock`,
   predating this workspace. It is clean and identical to `origin/main`. It is
   not nested and does not blur provenance, but two checkouts of the submission
   repository invite editing the wrong one. Recommended removal once no session
   is using it; not removed here because it is an active working directory.

## 10. Provenance and disclosure

| Artifact | Path |
| -- | -- |
| Machine-readable manifest | [`provenance/manifest.json`](../../provenance/manifest.json) |
| Manifest shape | [`provenance/manifest.schema.json`](../../provenance/manifest.schema.json) |
| Enforcing gate | [`scripts/check-provenance.mjs`](../../scripts/check-provenance.mjs) |
| Human-readable disclosure | [`DISCLOSURE.md`](../../DISCLOSURE.md) |

Established **before** substantive cross-repository implementation, as HAC-328
requires. Every recorded dependency is `CONSUMED` at a pinned revision; none is
`COPIED`. The submission-local revision-anchor extension is recorded as **not
part of released WorkspaceJSON v0.4**, with a harvest-or-delete disposition.
