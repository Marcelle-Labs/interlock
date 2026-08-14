"""What the model proposed, recorded verbatim and never acted upon.

## The one rule

The model **proposes a tool intent**. It authorizes nothing. Every function in
this module records and returns `None`, which is ADK's "carry on unchanged" — a
`before_tool_callback` that returned a dict would short-circuit the tool and let
the model's context decide the outcome, which is precisely the thing HAC-316 must
not allow. Authorization is entirely the deterministic path's: the routing
surface, `arbitrate`, the receipt, and the target's own admission gate. Nothing
here can allow, deny, retry, rewrite an argument or suppress a call.

## Why it is recorded at all

Because trial validity has to be decidable, and some deviations never reach the
wire. If the model calls the wrong tool, calls nothing, or invents an argument,
the ingress sees either a different request or no request, and "no request"
looks identical to "the agent was never dispatched". The proposal record is what
distinguishes a **model failure** from a composition result, and the distinction
is the difference between an invalid trial and evidence.

Deviations are therefore recorded, not corrected. A helper that quietly retried
a bad call, or normalised an argument into the expected one, would turn an
invalid trial into a valid-looking one and hide that it had done so (X-05).

The classification itself does not live here. It lives in
`experiments/hac-316/src/trial.mjs`, on the harness side, so that the component
being judged is not also the judge.

## The signature is ADK's, not one that reads like ADK's

These are `LlmAgent` tool callbacks, and ADK 2.6.3 invokes them **by keyword**:

    google/adk/flows/llm_flows/functions.py:591-593   (text path, before)
        function_response = callback(
            tool=tool, args=function_args, tool_context=tool_context
        )
    google/adk/flows/llm_flows/functions.py:632-637   (text path, after)
        altered_function_response = callback(
            tool=tool,
            args=function_args,
            tool_context=tool_context,
            tool_response=function_response,
        )

and identically on the live/streaming path at `:845-847` and `:891-896`.

An earlier revision named the third parameter `context`. That is not a cosmetic
difference: ADK passes `tool_context=`, so every invocation raised

    TypeError: record_proposed_tool_call() got an unexpected keyword argument 'tool_context'

at Step 2 of `_run_with_trace`, **before** the tool ran at Step 3 — so
`set_reservation` never reached the wire in either arm, and the failure sat
outside the `except` that wraps the tool call. The parameters below are
keyword-only and spelled exactly as ADK spells them, so a rename cannot pass a
positional call by accident, and `test/test_proposals.py` calls them the way ADK
does — through `root_agent.canonical_before_tool_callbacks`, which is the list
ADK itself iterates.

## One tool call is one proposal

A successful invocation produces two records here: what was proposed, and what
came back. They are two phases of one logical proposal, not two proposals. An
earlier revision returned both from `proposals()`, so a single well-behaved tool
call presented as two entries and the harness classified every valid trial
`MULTIPLE_TOOL_CALLS`. `proposals()` therefore returns the `proposed` phase and
nothing else; `records()` still returns the whole trail for anyone who wants it.
"""

from datetime import datetime, timezone
from typing import Any

#: Session-state key the harness reads the proposals back from.
PROPOSED_TOOL_CALLS_KEY = "hac316.proposed_tool_calls"

#: The two phases of one logical proposal. Mirrored on the harness side by
#: `ProposalPhase` in `experiments/hac-316/src/trial.mjs`.
PHASE_PROPOSED = "proposed"
PHASE_RESPONDED = "responded"

#: The keywords ADK 2.6.3 passes, in the order its source passes them. Recorded
#: as data so a test can assert the callbacks still bind them, rather than only
#: asserting that some call happened to work.
BEFORE_TOOL_CALLBACK_KEYWORDS = ("tool", "args", "tool_context")
AFTER_TOOL_CALLBACK_KEYWORDS = ("tool", "args", "tool_context", "tool_response")

#: Where the two tuples above were read from, so a reviewer can check them
#: against the installed package rather than against this comment.
ADK_CALLBACK_CONTRACT_SOURCE = (
    "google/adk/flows/llm_flows/functions.py:591-593 (before) and :632-637 (after); "
    "the live path repeats both at :845-847 and :891-896"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append(tool_context: Any, record: dict[str, Any]) -> None:
    """Append one record to session state, creating the list if needed.

    Failing to record is not survivable: a proposal that vanished would make an
    invalid trial indistinguishable from a valid one, so the exception is left to
    propagate rather than being swallowed into a partial record.

    The assignment through `__setitem__` is how ADK's `State` registers a delta,
    and this has always been written that way. It is not a repair of an earlier
    defect: no revision of this file appended in place. `git show
    b43d363^:experiments/hac-316/agents/_proposals.py` line 51 is the same
    `state[KEY] = [*existing, record]`.
    """
    state = tool_context.state
    existing = state.get(PROPOSED_TOOL_CALLS_KEY) or []
    state[PROPOSED_TOOL_CALLS_KEY] = [*existing, record]


def record_proposed_tool_call(*, tool: Any, args: dict[str, Any], tool_context: Any) -> None:
    """Record the tool call the model proposed. Always returns `None`.

    `None` is ADK's "proceed unchanged". Returning anything else would replace
    the tool's result with a value derived from the model's own context, which
    would make the model's output an authorization. It never is.
    """
    _append(
        tool_context,
        {
            "phase": PHASE_PROPOSED,
            "agent": getattr(tool_context, "agent_name", None),
            "invocation": getattr(tool_context, "invocation_id", None),
            "tool": getattr(tool, "name", None),
            # Verbatim. Not normalised, not defaulted, not repaired — the
            # harness has to see exactly what was proposed in order to classify
            # argument drift as argument drift.
            "arguments": args,
            "at": _now(),
        },
    )
    return None


def record_tool_response(
    *, tool: Any, args: dict[str, Any], tool_context: Any, tool_response: Any
) -> None:
    """Record what came back. Always returns `None`.

    The response is kept because it is what the deterministic path answered, not
    because the agent interprets it. Whether a mutation actually happened is
    settled by an independent re-read of the target, never by what came back
    down the wire.

    This is the *second* phase of the proposal recorded above, not a second
    proposal. `proposals()` does not return it.
    """
    _append(
        tool_context,
        {
            "phase": PHASE_RESPONDED,
            "agent": getattr(tool_context, "agent_name", None),
            "invocation": getattr(tool_context, "invocation_id", None),
            "tool": getattr(tool, "name", None),
            "arguments": args,
            "response": tool_response,
            "at": _now(),
        },
    )
    return None


def records(session_state: Any) -> list[dict[str, Any]]:
    """Every record for one session, both phases, in order.

    The whole trail, for anyone auditing what happened. It is not the thing the
    validity rule counts — `proposals()` is.
    """
    return list(session_state.get(PROPOSED_TOOL_CALLS_KEY) or [])


def proposals(session_state: Any) -> list[dict[str, Any]]:
    """The tool calls the model proposed, one entry per logical proposal.

    Exactly what the trial-validity rule counts: one successful `set_reservation`
    invocation is one entry here, whether or not a response came back.
    """
    return [record for record in records(session_state) if record.get("phase") == PHASE_PROPOSED]


def responses(session_state: Any) -> list[dict[str, Any]]:
    """What the deterministic path answered, in order."""
    return [record for record in records(session_state) if record.get("phase") == PHASE_RESPONDED]


def invocation_record(session_state: Any, error: str | None = None) -> dict[str, Any]:
    """One invocation in the shape `classifyTrial` reads.

    `{"proposals": [...], "error": "..."}` — the same shape
    `experiments/hac-316/src/trial.mjs` documents, built here so the agent side
    and the harness side cannot disagree about which phase counts.
    """
    record: dict[str, Any] = {"proposals": proposals(session_state)}
    if error is not None:
        record["error"] = error
    return record
