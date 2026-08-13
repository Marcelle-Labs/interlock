# CLAUDE.md

Repository-local authority for `Marcelle-Labs/interlock` lives in
[`AGENTS.md`](./AGENTS.md). Read it before editing anything in this repository.

Deliberately one pointer rather than two copies: a second authority file drifts
from the first, and an agent that reads the stale one crosses a boundary while
believing it is compliant.

Also relevant, in this order:

1. the Linear issue you are working — the authoritative task contract;
2. [`AGENTS.md`](./AGENTS.md) — what this repository owns and may not absorb;
3. [`docs/development/workspace.md`](./docs/development/workspace.md) — multi-repo layout, permissions matrix, worktrees, verification;
4. [`DISCLOSURE.md`](./DISCLOSURE.md) — what this submission may claim.

Before touching a sibling repository, read that repository's own `AGENTS.md`.
It outranks this repository's guidance for its own contents.
