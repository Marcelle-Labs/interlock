"""Agent B — the traffic shaper.

Raises beta's reservation to 60. Valid on its own: 40 + 60 + 20 = 120, within
the pool of 130. Identical in structure to agent A and differing only in which
service it writes, so any difference in outcome between the two arms cannot be
attributed to a difference between the agents.

The arguments are the ones predeclared in
`experiments/hac-316/evidence/preflight.json` under `expectedIntents.B`, and the
harness refuses the trial if the digest of what was actually sent differs
(REQ-046).
"""

from .._mutation_agent import MutationAgent

root_agent = MutationAgent(
    name="interlock_s1_traffic_shaper",
    description=(
        "Raises beta's reservation from 40 to 60 for the backfill window. "
        "Deterministic; no model in the loop."
    ),
    service="beta",
    reserved=60,
)
