# Interlock development workspace

How to stand up the multi-repository surface, and the rules that keep it honest.
Authoritative bootstrap issue: **HAC-328**.

This file is development documentation, not product source.

## Layout

One parent directory that is **not itself a Git repository**, with each
repository checked out as a sibling. Every repository keeps its own history,
remotes, and CI. Nothing is nested inside anything else.

```text
interlock-workspace/            # NOT a git repository
  interlock/                    # Marcelle-Labs/interlock      — writable
  standard/                     # workspacejson/standard       — read-only, pinned
  integrations/                 # workspacejson/integrations   — read / inspect
  cli/                          # workspacejson/cli            — execute / read
  swarm/                        # Marcelle-Labs/ai-swarm       — execute / read
  worktrees/                    # issue worktrees, one per change stream
    interlock/
      hac-330-local-concept-gate/
  interlock.code-workspace      # multi-root editor config; not product source
```

`studio/` is deliberately absent. See [Studio](#studio) below.

## Bootstrap from scratch

```sh
mkdir -p interlock-workspace && cd interlock-workspace

git clone https://github.com/Marcelle-Labs/interlock.git       interlock
git clone https://github.com/workspacejson/standard.git        standard
git clone https://github.com/workspacejson/integrations.git    integrations
git clone https://github.com/workspacejson/cli.git             cli
git clone https://github.com/Marcelle-Labs/ai-swarm.git        swarm

# The evidence path HAC-330/S-1 depends on.
cd cli && pnpm install --frozen-lockfile && pnpm -r build && cd ..

# The provenance gate.
cd interlock && npm run check:provenance
```

Confirm the parent is not a repository — `git -C . rev-parse --show-toplevel`
run in `interlock-workspace/` must fail. If it succeeds, a parent-level history
is blurring provenance and must be removed before any work continues.

Pinned revisions as of bootstrap are recorded in
[`../receipts/HAC-328-bootstrap-receipt.md`](../receipts/HAC-328-bootstrap-receipt.md)
and in [`../../provenance/manifest.json`](../../provenance/manifest.json).

## Who owns what

| Responsibility | Repository |
| -- | -- |
| Interlock composition engine, reference application | `Marcelle-Labs/interlock` |
| Google ADK / Agent Runtime / Gateway adapters, deployment | `Marcelle-Labs/interlock` |
| Submission-local revision-anchor extension | `Marcelle-Labs/interlock` |
| Frozen fixtures, evaluation harness, independent verifier | `Marcelle-Labs/interlock` |
| Pending-intent coordination, receipts | `Marcelle-Labs/interlock` |
| Normative schema, validation semantics, deterministic rules | `workspacejson/standard` |
| Commit-history co-change mining, neutral workspace.json producer | `workspacejson/cli` |
| Host integrations — MCP, Codex, VS Code | `workspacejson/integrations` |
| Agent orchestration, merge gates, quality substrate | `Marcelle-Labs/ai-swarm` |

If you cannot tell which repository should hold a change, it belongs in
`Marcelle-Labs/interlock` until an issue says otherwise. Putting contest-local
code upstream is the expensive mistake; the reverse is cheap to correct.

## Permissions matrix — current phase

Valid **before HAC-330, HAC-325 and HAC-326 pass**. After S-1 + S0 + S2 pass,
this matrix is re-derived from the frozen ADR, and broader HAC-316/HAC-317 work
is authorized. Until then:

| Repository | Disposition | Rule |
| -- | -- | -- |
| `Marcelle-Labs/interlock` | **writable** | bootstrap, S-1, S0, S2, contest-local evidence — via issue branches |
| `workspacejson/standard` | **read-only, pinned** | changes need a separately approved Standard issue |
| `workspacejson/integrations` | **read / inspect** | writable only after S0/S2 prove a reusable seam, under META-330 |
| `workspacejson/cli` | **execute / read** | run it; do not modify it to make a fixture pass |
| `Marcelle-Labs/ai-swarm` | **execute / read** | quality/execution infrastructure under META-331/META-337 only |
| Studio | **not checked out** | read-only for visibility; writable only when an approved Studio issue activates work |

Presence in the workspace is not permission to write. Escalation requires the
authorizing Linear issue plus an update to this table and to
`provenance/manifest.json`; the provenance gate rejects a manifest edit that
grants itself permission.

### Development freeze

Through submission freeze, in the participating WorkspaceJSON / Studio / Swarm
repositories: pause unrelated development; allow break/fix and security work;
allow GTM credibility work that does not touch the specification or the critical
path; allow only Interlock-pulled durable capability work.

**Interlock never waits on a nonessential upstream refactor.** If a reusable seam
is not ready, build the bounded submission-local adapter, record it under
`submissionLocalMachinery` in the manifest, and harvest later.

## Branches and worktrees

One bounded Linear issue per change stream, branched from the current protected
`main`. No forks of repositories the organization controls — they add remote, CI,
and package ambiguity without buying isolation. No single long-lived `interlock`
integration branch — it weakens merge gates and obscures ownership.

```sh
cd interlock-workspace/interlock
git fetch origin
git worktree add ../worktrees/interlock/hac-330-local-concept-gate \
                 -b hac/330-local-concept-gate origin/main
```

Names are `<team>/<issue-number>-<slug>`, lowercased: `hac/330-local-concept-gate`,
`meta/337-quality-gates`. Where a repository already has its own convention,
follow that; the invariant is one issue per change stream, not the exact string.

When the pull request merges:

```sh
git worktree remove ../worktrees/interlock/hac-330-local-concept-gate
git branch -d hac/330-local-concept-gate
```

A worktree's `.git` is a *file* pointing into the primary checkout, so it is not
a nested history. Keep worktrees under `worktrees/`, never inside a repository.

### Changes that span repositories

1. Open a separate issue branch in each canonical repository.
2. Link every pull request to the same Linear issue or parent contract.
3. Merge the upstream, provider-neutral capability first when the downstream
   repository depends on it.
4. Pin the downstream submission to the released version or exact SHA.
5. Keep unrelated cleanup out of the coordinated change.

## Verification

```sh
# Interlock — required on every pull request
cd interlock && npm run check:provenance

# CLI evidence path — prove the mining path still runs
cd cli && pnpm install --frozen-lockfile && pnpm -r build
pnpm --filter @workspacejson/mining-core test
node packages/cli/dist/cli.js generate . --dry-run
```

Green baseline captured at bootstrap is in the
[receipt](../receipts/HAC-328-bootstrap-receipt.md). Do not weaken a gate to
recover green; fix the cause or record the conflict on the issue.

## Not crossing the boundary

Before you write code, ask which side of the line it belongs on.

- **Consume, do not copy.** Upstream code is linked, installed, or executed at a
  pinned revision. If you find yourself pasting upstream source into this
  repository, stop — that is the boundary, and `check:provenance` fails on it.
- **One-way dependency.** Interlock consumes Standard. Standard must never
  reference Interlock; its own `AGENTS.md` forbids `@marcelle-labs/*`.
- **Submission-local means submission-local.** The revision-anchor extension is
  not part of released WorkspaceJSON v0.4 and must never be described as though
  it were.
- **Record it in the same pull request.** Any new dependency, changed pin, or new
  submission-local machinery updates `provenance/manifest.json` alongside the code.
- **No secrets, anywhere.** Not in agent instructions, workspace files, fixtures,
  or evidence packets. Record environment variable *names* only.

## Connected surfaces and what each is for

Small and task-oriented on purpose. Every surface has a named job, a
least-privilege posture, and a fallback.

| Surface | Job | Posture | Fallback |
| -- | -- | -- | -- |
| **Linear** | authoritative issue state, relations, status; agents post progress and conflicts | scoped to the workspace; no admin | read the issue in the browser and paste the contract |
| **GitHub** (`gh`) | repository, pull request, and check state; agents inspect CI before declaring work complete | `repo`, `read:org`, `workflow`, `gist`; no `admin:org` | GitHub web UI |
| **Google Cloud docs + CLI** | S0/S2 Agent Gateway / Agent Runtime / Cloud Run work | authenticated project context only; no unrelated cloud resources | official documentation on the web |
| **Local WorkspaceJSON tooling** | real mining and producer evidence, executed from `../cli` at its pinned revision | local execution, no network credentials | none — this path is required for HAC-330 |

Deliberately **not** configured: broad email, calendar, or CRM connectors;
write-capable production services unrelated to the current issue; any MCP server
that merely duplicates a deterministic local command or a GitHub check without
reducing agent latency.

Optional, only after demonstrated need: SonarQube / Codecov visibility so agents
can read failing findings directly; Greptile / Sourcery result visibility on the
open-source WorkspaceJSON repositories, with non-overlapping responsibilities.

**Never place a secret value in a repository-local agent instruction, workspace
file, fixture, or evidence packet.**

## Studio

`studio/` is checked out — `Marcelle-Labs/director` at
`98857b697fc74b3a4ddb55aa72828b4760e6c86f` — **for visibility only, read-only.**

HAC-328 permits a day-one Studio clone to avoid context switching, and requires
it stay read-only until an approved Studio issue activates work. No such issue is
active, so:

- do not edit anything under `studio/`;
- do not create an Interlock dependency on it;
- it is absent from `provenance/manifest.json` on purpose — the manifest records
  what the submission *consumes*, and Studio is not consumed.

"Studio v3" still does not resolve to one unambiguous line of work: the local
`demo-studio` and `demo-studio-v3` checkouts both point at
`Marcelle-Labs/director`. An approved Studio issue should name the revision
before anything depends on it.

When such an issue lands, move Studio into the permissions matrix above, and
record it in `provenance/manifest.json` with a disclosure line in the same pull
request as the code that consumes it.

## Merge gates on `main`

`main` is protected. Current state:

| Control | Setting |
| -- | -- |
| Pull request required | yes |
| Required status check | `Provenance boundary` |
| Branch must be up to date before merge | yes |
| Linear history required | yes |
| Conversation resolution required | yes |
| Force pushes / deletions | blocked |
| Administrator enforcement | off — matches the convention on the WorkspaceJSON repositories |

Administrator enforcement being off is a break-glass affordance, not a routine
path. **Do not bypass a required check to recover green**, and do not weaken a
gate to make a change fit. Fix the cause, or record the conflict on the issue and
choose the safer boundary. META-337 owns hardening these gates further.

## Known gaps

Recorded rather than papered over. Current state and rationale are in the
[bootstrap receipt](../receipts/HAC-328-bootstrap-receipt.md).

- **`gcloud` is not installed locally.** S0/S2 need it; installing and
  authenticating it, and choosing the project/region, belongs to HAC-325/HAC-326,
  which own that surface. No Google Cloud project context is recorded at
  bootstrap because none is configured yet.
- **`Marcelle-Labs/ai-swarm` cannot be branch-protected.** It is private and the
  organization is on the GitHub Free plan, so protected branches and rulesets
  return HTTP 403 there. It is execute/read for this phase, so no Interlock change
  depends on that gate; META-331/META-337 own its posture.
