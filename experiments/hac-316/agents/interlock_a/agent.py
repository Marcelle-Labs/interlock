"""Agent A — the capacity planner.

Raises alpha's reservation to 60. Valid on its own: 60 + 40 + 20 = 120, within
the pool of 130. It has no way to know that agent B is raising beta at the same
time, and no channel through which it could find out. That is not a limitation
of this agent; it is the condition every uncoordinated writer is in.

The values in the instruction are the ones predeclared in
`experiments/hac-316/evidence/preflight.json` under `expectedIntents.A`. The
model is asked for them; it is not made to produce them. If what it proposes
digests to anything other than `expectedIntents.A.intentDigest`, the trial is
classified `MODEL_FAILURE / INVALID_TRIAL` and never counted as composition
evidence (REQ-045).

Built synchronously at module scope: a deployed Agent Runtime imports this
module and expects `root_agent` to already exist.
"""

from .._mutation_agent import build_mutation_agent, business_instruction

root_agent = build_mutation_agent(
    name="interlock_s1_capacity_planner",
    description="Raises alpha's reservation for the reindex window.",
    instruction=business_instruction(
        service="alpha",
        current=40,
        target=60,
        window="reindex window",
    ),
)
