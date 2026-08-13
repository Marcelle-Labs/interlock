"""HAC-316 Agent Runtime agents: the two uncoordinated writers.

`interlock_a` raises alpha's reservation, `interlock_b` raises beta's. Each is
a Gemini-backed `LlmAgent` with one MCP tool and one business instruction, and
each is individually valid. Their composition is not, and neither agent can see
that — which is the whole hazard the experiment measures.

The model proposes the tool intent. It authorizes nothing: the routing surface,
`arbitrate`, the receipt and the target's admission gate are all deterministic
and consult no model output. A proposal that is not the predeclared one makes
the trial `MODEL_FAILURE / INVALID_TRIAL`, never a composition verdict.
"""
