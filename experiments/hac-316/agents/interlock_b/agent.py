"""Agent B — the traffic shaper.

Raises beta's reservation to 60. Valid on its own: 40 + 60 + 20 = 120, within
the pool of 130. Identical in structure to agent A and differing only in which
service it writes, which window it names and nothing else — so any difference in
outcome between the two arms cannot be attributed to a difference between the
agents.

The values in the instruction are the ones predeclared in
`experiments/hac-316/evidence/preflight.json` under `expectedIntents.B`. The
model is asked for them; it is not made to produce them. If what it proposes
digests to anything other than `expectedIntents.B.intentDigest`, the trial is
classified `MODEL_FAILURE / INVALID_TRIAL` and never counted as composition
evidence (REQ-046).

Built synchronously at module scope: a deployed Agent Runtime imports this
module and expects `root_agent` to already exist.
"""

from .._mutation_agent import build_mutation_agent, business_instruction

root_agent = build_mutation_agent(
    name="interlock_s1_traffic_shaper",
    description="Raises beta's reservation for the backfill window.",
    instruction=business_instruction(
        service="beta",
        current=40,
        target=60,
        window="backfill window",
    ),
)
