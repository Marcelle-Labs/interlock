/* Interlock relationship grammar — the deterministic edge table.
   A reader should be able to name the relationship from the line alone,
   before reading its label. Pattern carries meaning; colour is optional
   emphasis only. */

export const EDGES = {
  intent:        { label: "Intent",        dash: "5 4",  weight: 1.5, head: "open",     tail: "none", note: "An agent proposes an action. Nothing is committed." },
  evidence:      { label: "Evidence",      dash: "1 3",  weight: 1,   head: "dot",      tail: "none", note: "A fact is supplied from workspace.json or another bound source." },
  coupling:      { label: "Coupling",      dash: "0",    weight: 2,   head: "bar",      tail: "bar",  note: "Two actions are bound by a shared constraint. Symmetric: no direction." },
  authorization: { label: "Authorization", dash: "0",    weight: 3,   head: "gate",     tail: "none", note: "A decision passes through the gate. The heaviest line in the system." },
  mutation:      { label: "Mutation",      dash: "0",    weight: 2,   head: "solid",    tail: "none", note: "State is actually changed at the target." },
  observation:   { label: "Observation",   dash: "2 5",  weight: 1,   head: "ring",     tail: "none", note: "A party watches but cannot authorize or mutate." },
  refusal:       { label: "Refusal",       dash: "0",    weight: 2,   head: "stop",     tail: "none", note: "The gate declined. The path terminates at the boundary." },
  bypass:        { label: "Bypass rejected", dash: "3 3", weight: 2,  head: "cross",    tail: "none", note: "An attempt to route around the gate was rejected." },
};

export const EDGE_ORDER = Object.keys(EDGES);
