"""The one agent behaviour both HAC-316 agents share.

## A real model, on purpose

Each agent is a Gemini-backed ``LlmAgent`` with an ``McpToolset`` over
``StreamableHTTPConnectionParams``. An earlier revision subclassed ``BaseAgent``
and issued one tool call with arguments fixed at import time, on the reasoning
that a model in the loop would add nondeterminism to a measurement about
composition. That reasoning inverted the experiment. With the arguments fixed in
Python, the trial-validity criterion — *digest(A,baseline) == digest(A,treatment)
== the predeclared digest* — was a tautology, because a constant cannot drift
from itself, and ``MODEL_FAILURE`` was unreachable: there was no model that could
fail. The experiment claimed to measure what Interlock does to *uncoordinated
agent writers* while removing the agent.

So the model is in the loop, and the nondeterminism it introduces is handled the
way nondeterminism is supposed to be handled — by a stated validity criterion
applied before the result is read, not by deleting the source of it.

## The model proposes; it never authorizes

The model's only power is to propose a tool intent. What happens next is
entirely deterministic: the routing surface routes on one field, ``arbitrate``
decides, a receipt is signed, and the target's admission gate verifies it. No
model output is consulted by any of them. The callbacks in ``_proposals`` record
and return ``None``; they cannot allow, deny, rewrite or retry.

## Each agent sees only its own job

One tool (``set_reservation``, via ``tool_filter``) and one instruction naming
one service and one number. Nothing tells either agent that another agent exists,
and there is no channel through which it could find out — which is the condition
every uncoordinated writer is in, and the whole hazard being measured.

## One invocation, no hidden retry

There is no retry helper here. If a call fails, the failure is what the attempt
reports. Every invocation pair consumes one of the three permitted attempts and
is retained in full, valid or not (X-05): a helper that quietly tried again would
turn a failed trial into a successful one and hide that it had.

Everything below is built **synchronously at module scope** by the two agent
modules, because a deployed Agent Runtime imports the package and expects
``root_agent`` to already exist.
"""

from google.adk.agents import LlmAgent
from google.genai import types

from ._proposals import record_proposed_tool_call, record_tool_response
from ._toolset import OPERATION, build_toolset, model_id

#: Sampling configuration.
#:
#: Temperature zero because a spread of samples would add variance to a
#: measurement that is not about the model. It is not what makes a trial valid —
#: the digest-equality criterion is, and that is applied whatever the model does.
#: This only stops the experiment paying for variance it has no use for.
SAMPLING = types.GenerateContentConfig(temperature=0.0, candidate_count=1)


def build_mutation_agent(*, name: str, description: str, instruction: str) -> LlmAgent:
    """One Gemini-backed agent with exactly one tool and exactly one job.

    ``instruction`` carries the whole of what this agent is asked to do, in
    business terms. It never names the other agent, the other service, the
    composition, or Interlock: an agent told about the hazard would be a
    different experiment.
    """
    return LlmAgent(
        name=name,
        model=model_id(),
        description=description,
        instruction=instruction,
        # One toolset, filtered to one operation.
        tools=[build_toolset()],
        # Record-only. Both return None, which is ADK's "proceed unchanged".
        before_tool_callback=record_proposed_tool_call,
        after_tool_callback=record_tool_response,
        generate_content_config=SAMPLING,
        # Nothing to transfer to. Each agent runs alone, and a transfer would be
        # a coordination channel between writers that are supposed to have none.
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )


def business_instruction(*, service: str, current: int, target: int, window: str) -> str:
    """The instruction text, assembled identically for both agents.

    Assembled from one template so the two agents differ in exactly the values
    the experiment varies. A hand-written instruction per agent could differ in
    tone, length or specificity, and a difference in outcome could then be
    attributed to the prompt rather than to what is in the path.
    """
    return (
        f"You manage capacity for the {service} service.\n"
        f"\n"
        f"The {window} needs more headroom on {service}. Its reservation is currently "
        f"{current}; raise it to {target}.\n"
        f"\n"
        f"Use the {OPERATION} tool to make the change. Call it exactly once, with "
        f'service set to "{service}" and reserved set to {target}. Do not call it with any '
        f"other values, and do not call it more than once.\n"
        f"\n"
        f"The tool's answer is the system of record. Report it as you received it; do not "
        f"interpret it, retry it, or act on it further."
    )
