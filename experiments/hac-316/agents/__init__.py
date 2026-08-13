"""HAC-316 Agent Runtime agents: the two uncoordinated writers.

`interlock_a` raises alpha's reservation, `interlock_b` raises beta's. Each is
individually valid. Their composition is not, and neither agent can see that —
which is the whole hazard the experiment measures.
"""
