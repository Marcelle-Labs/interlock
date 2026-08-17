/* Interlock node grammar. Each class of thing in an architecture diagram
   owns one border treatment and one glyph, so a reader can classify a box
   without reading it. These are visual primitives only: the facts inside
   them must come from evidence-bound architecture, never from this table. */

export const NODES = {
  agent:     { label: "Agent",              glyph: "\u25B3", border: "1.5px solid",  note: "An autonomous actor proposing change." },
  evidence:  { label: "workspace.json",     glyph: "\u25A6", border: "1px dotted",   note: "Bound repository facts. Descriptive, machine-generated." },
  core:      { label: "Interlock core",     glyph: "\u2AFC", border: "2px solid",    note: "The control plane that holds the gate." },
  receipt:   { label: "Receipt",            glyph: "\u229E", border: "1px solid",    note: "An immutable record of a decision or execution." },
  target:    { label: "Protected target",   glyph: "\u25A3", border: "2px double",   note: "The resource behind the boundary." },
  verifier:  { label: "Independent verifier", glyph: "\u25CE", border: "1.5px dotted", note: "Observes and attests. Cannot authorize." },
  runtime:   { label: "Google runtime",     glyph: "\u2312", border: "1px dashed",   note: "Managed execution environment." },
  external:  { label: "External infrastructure", glyph: "\u2337", border: "1px dashed", note: "Outside the trust boundary." },
};

export const NODE_ORDER = Object.keys(NODES);
