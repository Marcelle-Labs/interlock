"""Agent A — the capacity planner.

Raises alpha's reservation to 60. Valid on its own: 60 + 40 + 20 = 120, within
the pool of 130. It has no way to know that agent B is raising beta at the same
time, and no channel through which it could find out. That is not a limitation
of this agent; it is the condition every uncoordinated writer is in.

The arguments are the ones predeclared in
`experiments/hac-316/evidence/preflight.json` under `expectedIntents.A`, and the
harness refuses the trial if the digest of what was actually sent differs
(REQ-045).
"""

from .._mutation_agent import MutationAgent

root_agent = MutationAgent(
    name="interlock_s1_capacity_planner",
    description=(
        "Raises alpha's reservation from 40 to 60 for the reindex window. "
        "Deterministic; no model in the loop."
    ),
    service="alpha",
    reserved=60,
)
