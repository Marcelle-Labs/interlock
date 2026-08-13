"""The single place HAC-316's agents reach Interlock's MCP surface.

Both agents talk to the same tool through the same toolset construction, and
that is the point: the two arms must differ only in what is *in the path*, never
in what the caller sent. If each agent built its own client, a difference in
headers or serialization would change the intent digest, and the parity check
that makes the arms comparable (REQ-045, REQ-046) would be comparing two
different requests.

Each agent is given **only** the tool it needs. `tool_filter` narrows the MCP
surface to `set_reservation`, so a model that wanted to do something else has
nothing to reach for. That narrowing is not an authorization decision: nothing
an agent proposes authorizes anything, and the deterministic path in front of
the targets decides. It keeps the measurement about one thing.

The ADK import paths are not chosen from documentation. They are the paths
`experiments/hac-316/evidence/toolchain.json` records as reproduced in the
interpreter these agents run on. Two modules are named because ADK 2.6.3 puts
the two symbols in two places: `McpToolset` is defined in `mcp_toolset`, and
`StreamableHTTPConnectionParams` is defined in `mcp_session_manager` and merely
re-exported by the first. Importing each from where it is defined means a
release that stops re-exporting cannot silently change which object is built.

Nothing here delays, retries or coordinates. No pause is inserted, no rendezvous
is arranged, and no second attempt is hidden inside a helper: overlap between the
two agents has to come from dispatching them concurrently, or it has to be
reported as absent (X-04, X-05).

Everything is constructed **synchronously at module scope** by the callers of
this module. A deployed Agent Runtime imports the agent package and expects
`root_agent` to already exist; an agent assembled inside a coroutine does not
exist at import time and cannot be deployed.
"""

import os

from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset

#: The protected operation. Frozen by HAC-326; not redefined here.
OPERATION = "set_reservation"

#: How long one call may take before it is reported as failed. A deadline, not a
#: delay — it bounds how long a hung call blocks the measurement, and it never
#: causes the caller to wait when the answer is already available.
CALL_TIMEOUT_SECONDS = 30.0


def _required(name: str, why: str) -> str:
    """A required environment value, with no default and no guess."""
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} is unset. {why}")
    return value.strip()


def ingress_url() -> str:
    """Where the arm under test is listening.

    Supplied by the harness rather than baked in, because the same agent image
    runs against the baseline issuer and against the routing surface. An agent
    that knew which arm it was in could behave differently in one of them.
    """
    return _required(
        "HAC316_INGRESS_URL",
        "The agent does not guess an endpoint: a default would silently send a measured "
        "request somewhere nobody declared.",
    )


def model_id() -> str:
    """Which Gemini model backs the agents.

    Required, with no default, for the same reason the ingress URL is: the model
    is part of what the packet has to record about the trial, and a hard-coded
    fallback would let a run report a model nobody chose. Phase 7 supplies it and
    records what it supplied.
    """
    return _required(
        "HAC316_MODEL",
        "The agent does not guess a model: the model is part of what the trial record has to "
        "state, and a default would put a value in the packet that nobody selected.",
    )


def build_toolset() -> McpToolset:
    """The MCP toolset the agents call `set_reservation` through."""
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=ingress_url(),
            timeout=CALL_TIMEOUT_SECONDS,
        ),
        tool_filter=[OPERATION],
    )
