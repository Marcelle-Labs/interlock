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
"""

from datetime import datetime, timezone
from typing import Any

#: Session-state key the harness reads the proposals back from.
PROPOSED_TOOL_CALLS_KEY = "hac316.proposed_tool_calls"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append(context: Any, record: dict[str, Any]) -> None:
    """Append one record to session state, creating the list if needed.

    Failing to record is not survivable: a proposal that vanished would make an
    invalid trial indistinguishable from a valid one, so the exception is left to
    propagate rather than being swallowed into a partial record.
    """
    state = context.state
    existing = state.get(PROPOSED_TOOL_CALLS_KEY) or []
    state[PROPOSED_TOOL_CALLS_KEY] = [*existing, record]


def record_proposed_tool_call(tool: Any, args: dict[str, Any], context: Any) -> None:
    """Record the tool call the model proposed. Always returns `None`.

    `None` is ADK's "proceed unchanged". Returning anything else would replace
    the tool's result with a value derived from the model's own context, which
    would make the model's output an authorization. It never is.
    """
    _append(
        context,
        {
            "phase": "proposed",
            "agent": getattr(context, "agent_name", None),
            "invocation": getattr(context, "invocation_id", None),
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
    tool: Any, args: dict[str, Any], context: Any, tool_response: Any
) -> None:
    """Record what came back. Always returns `None`.

    The response is kept because it is what the deterministic path answered, not
    because the agent interprets it. Whether a mutation actually happened is
    settled by an independent re-read of the target, never by what came back
    down the wire.
    """
    _append(
        context,
        {
            "phase": "responded",
            "agent": getattr(context, "agent_name", None),
            "invocation": getattr(context, "invocation_id", None),
            "tool": getattr(tool, "name", None),
            "arguments": args,
            "response": tool_response,
            "at": _now(),
        },
    )
    return None


def proposals(session_state: dict[str, Any]) -> list[dict[str, Any]]:
    """Everything recorded for one session, in order. Empty when nothing was."""
    return list(session_state.get(PROPOSED_TOOL_CALLS_KEY) or [])
