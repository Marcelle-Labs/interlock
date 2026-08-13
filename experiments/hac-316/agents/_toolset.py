"""The single place HAC-316's agents reach Interlock's MCP surface.

Both agents talk to the same tool through the same toolset construction, and
that is the point: the two arms must differ only in what is *in the path*, never
in what the caller sent. If each agent built its own client, a difference in
headers or serialization would change the intent digest, and the parity check
that makes the arms comparable (REQ-045, REQ-046) would be comparing two
different requests.

The ADK import path is not chosen from documentation. It is the path
`experiments/hac-316/evidence/toolchain.json` records as reproduced in the
interpreter these agents run on, and REQ-009 cross-checks that exactly one such
path appears anywhere in this package.

Nothing here delays, retries or coordinates. There is no sleep, no barrier and
no second attempt hidden inside a helper: overlap between the two agents has to
come from dispatching them concurrently, or it has to be reported as absent
(X-04, X-05).
"""

import os

from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, StreamableHTTPConnectionParams

#: The protected operation. Frozen by HAC-326; not redefined here.
OPERATION = "set_reservation"

#: How long one call may take before it is reported as failed. A deadline, not a
#: delay — it bounds how long a hung call blocks the measurement, and it never
#: causes the caller to wait when the answer is already available.
CALL_TIMEOUT_SECONDS = 30.0


def ingress_url() -> str:
    """Where the arm under test is listening.

    Supplied by the harness rather than baked in, because the same agent image
    runs against the baseline issuer and against the routing surface. An agent
    that knew which arm it was in could behave differently in one of them.
    """
    url = os.environ.get("HAC316_INGRESS_URL")
    if not url:
        raise RuntimeError(
            "HAC316_INGRESS_URL is unset. The agent does not guess an endpoint: a default would "
            "silently send a measured request somewhere nobody declared."
        )
    return url


def build_toolset() -> McpToolset:
    """The MCP toolset the agents call `set_reservation` through."""
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=ingress_url(),
            timeout=CALL_TIMEOUT_SECONDS,
        ),
        tool_filter=[OPERATION],
    )
