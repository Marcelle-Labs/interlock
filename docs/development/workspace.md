# Interlock development workspace

How to stand up the multi-repository surface, and the rules that keep it honest.
Authoritative bootstrap issue: **HAC-328**.

This file is development documentation, not product source.

## Layout

`/Users/user1/dev/` is the physical workspace root. It is **not itself a Git
repository**, and it never becomes one — `git rev-parse --show-toplevel` run there
must fail. Every member repository keeps its own history, remotes, and CI, and
nothing is nested inside anything else.

```text
/Users/user1/dev/                       # NOT a git repository — physical root
  interlock/                            # Marcelle-Labs/interlock      — canonical, writable
  mlabs_portfolio/                      # Marcelle-Labs/mlabs_portfolio — canonical publication surface
  worktrees/interlock/                  # issue worktrees, attached to interlock/
  interlock-workspace/                  # FROZEN-PROOF workspace — manifest-pinned
    standard/  cli/  integrations/  swarm/  studio/
  …                                     # unrelated projects — NOT workspace members
```

### Membership is explicit, never ambient

**Being a child of the root is not membership.** `/Users/user1/dev/` is a general
development directory that also holds unrelated projects. A repository is a
workspace member only if it appears in the registry below and in the
[permissions matrix](#permissions-matrix--current-phase).

An unlisted child of the root is **out of scope and confers no authority** — not
read, not execute, not write. If you need one, add it to the registry and the
matrix under an authorizing issue first. Do not infer a disposition from the fact
that a directory happens to sit next to a member.

### Registry — workspace members and canonical working copies

A member's *canonical working copy* is the checkout work actually happens in.
Which of the two workspaces it belongs to — current-development or frozen-proof —
is given by the `At manifest pin` column and explained under
[temporal separation](#temporal-separation--current-development-and-frozen-proof).

Dispositions are **not** repeated here; the permissions matrix is their single
source, and duplicating them is how the two records drift into disagreeing.

| Member | Repository | Canonical working copy | At manifest pin |
| -- | -- | -- | -- |
| interlock | `Marcelle-Labs/interlock` | `/Users/user1/dev/interlock` | n/a — writable, moves |
| marcellelabs.io | `Marcelle-Labs/mlabs_portfolio` | `/Users/user1/dev/mlabs_portfolio` | n/a — not consumed |
| standard | `workspacejson/standard` | `interlock-workspace/standard` | yes — `a3caece` |
| cli | `workspacejson/cli` | `interlock-workspace/cli` | yes — `defac1e` |
| integrations | `workspacejson/integrations` | `interlock-workspace/integrations` | yes — `70cfd57` |
| swarm | `Marcelle-Labs/ai-swarm` | `interlock-workspace/swarm` | yes — `74e4ee1` |
| studio | `Marcelle-Labs/director` | `interlock-workspace/studio` | n/a — not consumed |

Worktrees are not separate members. They live under
`/Users/user1/dev/worktrees/interlock/`, attached to the canonical `interlock`
checkout, and inherit its disposition. A worktree's `.git` is a *file* pointing
into its primary checkout, so it must sit beside that checkout and cannot be
relocated without detaching it.

## Temporal separation — current development and frozen proof

`/Users/user1/dev/` holds **two workspaces standing at two different points in
time**, and that separation is deliberate.

| | Current-development workspace | Frozen-proof workspace |
| -- | -- | -- |
| Location | siblings directly under `/Users/user1/dev/` | `/Users/user1/dev/interlock-workspace/` |
| Members | `interlock`, `mlabs_portfolio`, `worktrees/` | `standard`, `cli`, `integrations`, `swarm` |
| Revision policy | tracks `main`, moves freely | held at `provenance/manifest.json` pins |
| Purpose | feature and product work | reproducing frozen Interlock evidence |
| Mutation | normal issue-branch workflow | none before submission freeze |

`interlock-workspace/` is **not stale, and not an ordinary workspace child.** It is
the manifest-pinned evidence and reproduction environment: its dependency
checkouts match the exact revisions the frozen Interlock proof was produced from.
The active siblings are newer *on purpose*, and being newer is what disqualifies
them from an evidence run.

Read the two as a pair. The current-development copies answer "what does the code
do now?" The pinned copies answer "what did the published result actually come
from?" Those are different questions and they need different revisions. Collapsing
them into one tree would not tidy anything — it would destroy the second answer.

### Rules

- `interlock-workspace/` is the **canonical dependency source for reproducing
  frozen Interlock evidence.** Evidence runs resolve dependencies from there and
  nowhere else.
- Its dependency checkouts **must remain at the `provenance/manifest.json` pins.**
- Active sibling repositories under the root are **development copies** and must
  **not** be substituted into a frozen-evidence run — not even when they are
  newer, and especially not because they are newer.
- **Feature and product development uses the current sibling repos.** Do not
  mutate the pinned evidence copies to make development convenient.
- **Evidence and reproduction commands must fail** when a required dependency
  checkout is off its recorded manifest SHA, or dirty. Run the
  [pin preflight](#pin-preflight--run-before-any-evidence-command) first; the
  HAC-330 adapter enforces the same rule for `cli` on its own.
- **Do not rename, relocate, refresh, or fast-forward the pinned evidence
  workspace before submission freeze.** Not to tidy the tree, not to pick up an
  upstream fix, not to clear a warning.

That last rule is the one most likely to be broken with good intentions. A
fast-forward looks harmless and leaves no trace in the working tree, but its
effect is irreversible in practice: once the evidence environment has moved, you
can no longer demonstrate that a published result came from the revision it
claims. The pin is not a version preference. It is the claim.

### Do not substitute these

Every pinned repository has at least one off-pin copy elsewhere under the root.
They are development copies, and they are not interchangeable:

| Repository | Frozen-proof copy — use this | Development copy — never substitute |
| -- | -- | -- |
| `workspacejson/cli` | `interlock-workspace/cli` @ `defac1e` | `/Users/user1/dev/cli` @ `fbfa7c9` |
| `workspacejson/standard` | `interlock-workspace/standard` @ `a3caece` | `workspacejson-projects/standard` @ `a034339` |
| `workspacejson/integrations` | `interlock-workspace/integrations` @ `70cfd57` | `workspacejson-projects/integrations` @ `0795c59` |
| `Marcelle-Labs/ai-swarm` | `interlock-workspace/swarm` @ `74e4ee1` | — |

Recorded revisions are current as of this writing; the preflight is the
authority, not this table.

### Two remnants that are not members

Also under `interlock-workspace/`, and covered by none of the above:

- `interlock-workspace/interlock` — a bootstrap checkout at `e3ae5fd` (HAC-328),
  far behind the canonical copy. It is neither a development copy nor a pinned
  evidence dependency; Interlock does not consume itself. Do not edit it, and do
  not read current state from it.
- `interlock-workspace/interlock.code-workspace` — a multi-root editor config
  describing the pre-`/Users/user1/dev/` topology. Editor convenience, not
  authority.

Leave both in place until submission freeze lifts. Removing them is a change to
the evidence workspace, and the rule above does not carve out an exception for
changes that feel like cleanup.

An external or awkwardly-placed canonical path is **recorded, not corrected**. Do
not move, copy, re-clone, or symlink a repository merely to tidy the tree. That
manufactures a second copy of a history, which is the exact ambiguity the
one-repository-one-history rule exists to prevent.

## Bootstrap from scratch

Reproducing the current topology, not the bootstrap one. This stands up **both**
workspaces: the current-development siblings under `$WS`, and the frozen-proof
environment under `$WS/interlock-workspace` checked out at the manifest pins. The
pin checkouts are not optional — a clone left on `main` is a development copy and
must not be used for evidence.

```sh
WS=~/dev                                   # physical workspace root
mkdir -p "$WS/interlock-workspace" && cd "$WS"

git clone https://github.com/Marcelle-Labs/interlock.git        interlock
git clone https://github.com/Marcelle-Labs/mlabs_portfolio.git  mlabs_portfolio

cd "$WS/interlock-workspace"
git clone https://github.com/workspacejson/standard.git         standard
git clone https://github.com/workspacejson/integrations.git     integrations
git clone https://github.com/workspacejson/cli.git              cli
git clone https://github.com/Marcelle-Labs/ai-swarm.git         swarm

# Check the four pinned dependencies out at the manifest pins, not at main.
git -C standard     checkout a3caece60bde12c41105a9987f50afa9e33dcb7b
git -C integrations checkout 70cfd57ff57c873fb22daaa8d94afa5a14601d27
git -C cli          checkout defac1e5dce6fb692a48e775fb44854b371cbca4
git -C swarm        checkout 74e4ee1f9ec083b0dba029b4b2db6339cc49c5fa

# The evidence path HAC-330/S-1 depends on.
cd "$WS/interlock-workspace/cli" && pnpm install --frozen-lockfile && pnpm -r build

# The provenance gate.
cd "$WS/interlock" && npm run check:provenance
```

Confirm that neither the physical root nor the frozen-proof workspace is itself a
repository —
`git rev-parse --show-toplevel` run in `$WS` and in `$WS/interlock-workspace`
must fail in both. If either succeeds, a parent-level history is blurring
provenance and must be removed before any work continues.

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
| Canonical Marcelle Labs web and publication surface (`marcellelabs.io`, Insights) | `Marcelle-Labs/mlabs_portfolio` |

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
| `Marcelle-Labs/director` (Studio) | **read-only by default** | writable only within the scope a named approved Studio contract authorizes — currently **HAC-324**, for its capture/harvest work only. No other issue inherits it. See [Studio](#studio) |
| `Marcelle-Labs/mlabs_portfolio` | **writable — MAR-390 only** | the marcellelabs.io publication surface. Task-scoped: see below. Reverts to read / inspect when MAR-390 completes |

Presence in the workspace is not permission to write. Escalation requires the
authorizing Linear issue plus an update to this table and, **where the change is
something the submission consumes**, to `provenance/manifest.json`; the
provenance gate rejects a manifest edit that grants itself permission.

### Task-scoped write authority

Most rows above are phase dispositions: they hold until a gate passes and the
matrix is re-derived. `Marcelle-Labs/mlabs_portfolio` is not one of those. Its
write authority is **bound to a single issue and lapses with it**:

| Field | Value |
| -- | -- |
| Authorizing issue | **MAR-390** — publish the Interlock composition-safety article to `/insights/when-valid-agent-actions-fail-together` |
| Scope | only the work MAR-390 describes: one article, its assets, and the metadata/index surfaces that already exist |
| Not authorized | site redesign, new CMS or content framework, parallel blog system, dependency upgrades, unrelated content edits |
| On completion | disposition returns to **read / inspect**. Re-authorizing needs another active issue and another row change |

This is deliberately narrower than a phase disposition. A publication surface
that is writable by default is one where an agent can quietly change public
claims; binding the authority to the issue that justifies it means the authority
expires on its own rather than persisting because nobody remembered to revoke it.

Write authority is bound to the **resolved deploy-connected source**, recorded in
[the marcellelabs.io publication surface](#the-marcellelabsio-publication-surface)
below — not to a repository that merely carries a matching name.

### Development freeze

Through submission freeze, in the participating WorkspaceJSON / Studio / Swarm
repositories: pause unrelated development; allow break/fix and security work;
allow GTM credibility work that does not touch the specification or the critical
path; allow only Interlock-pulled durable capability work.

**Interlock never waits on a nonessential upstream refactor.** If a reusable seam
is not ready, build the bounded submission-local adapter, record it under
`submissionLocalMachinery` in the manifest, and harvest later.

This policy governs the upstream repositories themselves — what may land on their
`main`. It says nothing about the frozen-proof checkouts, which do not move at
all. Break/fix work being permitted upstream is **not** license to pull that fix
into `interlock-workspace/`; see
[temporal separation](#temporal-separation--current-development-and-frozen-proof).
An upstream fix reaches evidence only by a deliberate re-pin — a manifest change
under its own issue, never a `git pull`.

## Branches and worktrees

One bounded Linear issue per change stream, branched from the current protected
`main`. No forks of repositories the organization controls — they add remote, CI,
and package ambiguity without buying isolation. No single long-lived `interlock`
integration branch — it weakens merge gates and obscures ownership.

```sh
cd ~/dev/interlock
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
a nested history. Keep worktrees under `~/dev/worktrees/<repo>/`, beside the
canonical checkout they belong to and never inside a repository.

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
cd ~/dev/interlock && npm run check:provenance
```

### Pin preflight — run before any evidence command

An evidence run against an off-pin or dirty checkout is worse than no run: it
goes green and attests to a revision nobody published. Verify the frozen-proof
workspace first, and treat a non-zero exit as a stop, not a warning.

```sh
cd ~/dev/interlock
EVID=~/dev/interlock-workspace
fail=0
while read -r repo sha; do
  case "$repo" in
    workspacejson/standard)     dir=standard ;;
    workspacejson/cli)          dir=cli ;;
    workspacejson/integrations) dir=integrations ;;
    Marcelle-Labs/ai-swarm)     dir=swarm ;;
    *) echo "unmapped repository: $repo"; fail=1; continue ;;
  esac
  actual=$(git -C "$EVID/$dir" rev-parse HEAD 2>/dev/null)
  dirty=$(git -C "$EVID/$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$actual" != "$sha" ]; then
    echo "OFF PIN  $dir  expected $sha  got ${actual:-<missing>}"; fail=1
  elif [ "$dirty" != "0" ]; then
    echo "DIRTY    $dir  $dirty modified path(s)"; fail=1
  else
    echo "at pin   $dir  $sha"
  fi
done < <(node -e '
  const m = require("./provenance/manifest.json");
  for (const d of m.dependencies) console.log(d.repository, d.pinnedSha);
')
[ "$fail" = "0" ] || { echo "Evidence environment is not reproducible. Do not run frozen-evidence commands."; exit 1; }
echo "Evidence environment matches provenance/manifest.json."
```

If it reports `OFF PIN`, **do not** fast-forward or reset the pinned checkout to
make it pass — that is the prohibited mutation, and it destroys the thing the
preflight exists to protect. Find out what moved it and record the conflict on
the issue.

### Evidence path

```sh
# Prove the mining path still runs, from the FROZEN-PROOF workspace only.
# NOT ~/dev/cli, which is a development copy sitting ahead of the pin.
cd ~/dev/interlock-workspace/cli && pnpm install --frozen-lockfile && pnpm -r build
pnpm --filter @workspacejson/mining-core test
node packages/cli/dist/cli.js generate . --dry-run
```

The publication surface has its own commands; see
[the marcellelabs.io publication surface](#the-marcellelabsio-publication-surface).

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

## Workspace participants and submission dependencies

Two records, two different questions. Conflating them is what puts a repository
in the wrong one.

- The **registry and permissions matrix** answer *may an agent touch this, and
  under whose authority?* Their scope is every member repository.
- **`provenance/manifest.json`** answers *what does the submitted Interlock system
  consume?* Its scope is dependencies only.

A repository can be fully governed and still be absent from the manifest. The
manifest is not an inventory of the workspace; it is the consumption record of
the submission.

### Outbound and non-consumed surfaces

Some members carry information *outward* — they publish, present, or link to
Interlock — or sit in the workspace for visibility without being consumed at all.
The dependency arrow points away from the submission, or does not exist.

These are **workspace participants, not submission-consumed dependencies.** They
are registered, governed, and deliberately excluded from the manifest.

| Participant | Relationship to the submission | Manifest |
| -- | -- | -- |
| `Marcelle-Labs/mlabs_portfolio` | outbound publication — publishes an article *about* Interlock and links to its frozen evidence | excluded |
| `Marcelle-Labs/director` (Studio) | visibility only — nothing consumes it | excluded |

Exclusion reason of record, for both: **workspace participant, not
submission-consumed dependency.**

Recording either as a manifest `dependency` would be wrong three times over. It
asserts an inbound dependency the submission does not have. It forces an entry in
`DISCLOSURE.md`, which governs what the *submission* may claim — not what Marcelle
Labs publishes elsewhere. And `scripts/check-provenance.mjs` refuses a `WRITABLE`
dependency outright: only `Marcelle-Labs/interlock` is writable in the manifest's
model, and that refusal is correct rather than an obstacle to route around.

Write authority for a participant therefore lives in the permissions matrix,
bound to an authorizing issue — never in the manifest.

**When a participant becomes consumed**, it stops being a participant. If the
submission begins linking, installing, or executing it, add it to the manifest
with a pinned SHA and a disclosure line, in the same pull request as the code
that consumes it.

The reverse flow does not qualify. If the submission's own evidence moves outward
into a participant — article assets copied into the site, say — that is an
**outbound** provenance event. It belongs on the authorizing issue and in the
receiving repository, and it does not change what Interlock consumes.

## The marcellelabs.io publication surface

`Marcelle-Labs/mlabs_portfolio` is the repository that deploys `marcellelabs.io`.
It was resolved from the deployment, not from its name, because MAR-390 records
that the obvious candidate is stale.

**The name trap.** `qmarcelle/marcelle-labs` is the discoverable-looking site
repository, and its `package.json` (Next.js 14.2.5, React 18) is what a search
finds first. No Vercel project on the `marcelle labs` team is linked to it, and
it is not checked out anywhere in this workspace. Writing to it would have
produced a green local build and changed nothing on the live site.

**How the real source was established**, in the order the evidence was taken:

1. `marcellelabs.io` answers with `x-vercel-id: iad1::…` behind Cloudflare, so
   the origin is Vercel, not the Netlify plugin its `package.json` still carries.
2. The Vercel project `marcelle-labs` (`prj_Aka74GQMAoq9RL9D9bNurYz5ERvm`) holds
   the `marcellelabs.io` and `www.marcellelabs.io` aliases.
3. That project's git link is `Marcelle-Labs/mlabs_portfolio`.
4. Its production deployment reports `githubCommitRef: main` and
   `githubCommitSha: b02bc80…`.
5. The live `/insights` slugs match `blog/*.mdx` in that repository one-for-one,
   which confirms the running Insights pipeline is the one in this checkout.

| Field | Value |
| -- | -- |
| Repository | `Marcelle-Labs/mlabs_portfolio` (private, GitHub id `1192224902`) |
| Canonical working copy | `/Users/user1/dev/mlabs_portfolio` — external to this root |
| Branch | `main` |
| Production HEAD | `b02bc8048b5d2f2c9858c05187359f96f9b51a57` |
| Vercel project | `marcelle-labs` / `prj_Aka74GQMAoq9RL9D9bNurYz5ERvm` |
| Stack | Next.js 15.1.11, React 19.0.3, Velite MDX (`blog/*.mdx`), App Router |
| Insights route | `src/app/insights/[slug]` |

The local checkout is at the production HEAD. If it drifts, re-resolve from the
deployment rather than assuming `main` is what is serving.

### Manifest status

Excluded from `provenance/manifest.json` as a **workspace participant, not a
submission-consumed dependency** — see
[outbound and non-consumed surfaces](#outbound-and-non-consumed-surfaces) for the
general rule. Its capability boundary is the permissions matrix, where MAR-390
binds it.

## Studio

`studio/` is checked out — `Marcelle-Labs/director` on `main`, currently at
`81a0535acac9a3b58b2b948ed9e600a9c2c59af9` (2026-08-23) — **for visibility only,
read-only.**

It has moved since HAC-328 bootstrap recorded
`98857b697fc74b3a4ddb55aa72828b4760e6c86f`. The checkout fast-forwarded and is
clean, with no local commits, so read-only was not violated — but a visibility
clone that silently tracks `main` is not a pin, and nothing may depend on its
revision until an approved Studio issue names one.

HAC-328 permits a day-one Studio clone to avoid context switching, and requires
it stay read-only until an approved Studio issue activates work.

**Read-only by default is not read-only always, and an earlier version of this
section said the stronger thing.** It claimed no approved Studio work was active
while HAC-324 was landing merged pull requests against `Marcelle-Labs/director`
(#7, #8, #9: capture-integrity guarantees that block promotion, capturing a
declared command rather than a hardcoded one, and recording that raw cloud config
output is credential-bearing). A boundary that describes the repository
incorrectly is worse than a loose one, because the next agent reads it, finds the
merged commits, and has to guess which is true.

The real rule:

- **Studio is read-only by default.** No Interlock issue may write to
  `Marcelle-Labs/director`, or take a dependency on a pinned Studio revision,
  without an approved Studio contract that names the writable scope.
- **A named approved Studio contract may authorize a bounded write scope.**
  HAC-324 is such a contract, for its specific capture and harvest work.
- **Authority does not spread.** Other Interlock issues do not inherit HAC-324's
  write scope by adjacency, by sharing a milestone, or by harvesting toward it.
- **No currently active contract authorizes HAC-350 to write to or depend on a
  pinned Studio repository revision.** HAC-324 separately authorizes bounded
  Director work for its named capture/harvest scope. Studio remains read-only for
  all other Interlock work unless an approved issue explicitly names the writable
  scope and revision.

So, for everything that is not HAC-324's named scope:

- do not edit anything under `studio/`;
- do not create an Interlock dependency on it;
- it is absent from `provenance/manifest.json` on purpose, as a **workspace
  participant, not a submission-consumed dependency** — see
  [outbound and non-consumed surfaces](#outbound-and-non-consumed-surfaces).

Harvesting *toward* a repository is not depending on it. HAC-350's reusable
machinery — the deterministic time axis at `media/hac-334/bin/lib/motion.mjs` —
is `submissionLocalMachinery` harvested toward Studio under HAC-324's ownership;
nothing HAC-350 renders reads a Studio revision, and the manifest correctly stays
silent.

That last point is what keeps HAC-350 honest. Its reusable machinery — the
deterministic time axis at `media/hac-334/bin/lib/motion.mjs` — is
`submissionLocalMachinery` harvested *toward* Studio under HAC-324's ownership.
Harvesting toward a repository is not depending on it: nothing HAC-350 renders
reads a Studio revision, and the manifest correctly stays silent.

"Studio v3" still does not resolve to one unambiguous line of work: the local
`demo-studio` and `demo-studio-v3` checkouts both point at
`Marcelle-Labs/director`, and `demo-studio-v3` is an `architecture/v3-remodel`
spike whose `@studio/*` packages are empty stubs. An approved Studio issue should
name the revision before anything depends on it.

When such an issue lands, move Studio into the permissions matrix above with the
scope it authorizes, and record it in `provenance/manifest.json` with a
disclosure line in the same pull request as the code that consumes it.

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
