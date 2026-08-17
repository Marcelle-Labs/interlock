/* Interlock semantic state table — the single source of truth.
   Every state is carried by three channels: colour, glyph, stroke.
   Consumers must not introduce states outside this table. */

export const STATES = {
  "LOCALLY VALID": { key: "local",      glyph: "\u2219", stroke: "dashed", weight: 1,   note: "Valid in its own scope. Nothing has been coordinated yet." },
  "COUPLED":       { key: "coupled",    glyph: "\u29C9", stroke: "solid",  weight: 1.5, note: "Two or more actions now share a constraint." },
  "BLOCKED":       { key: "blocked",    glyph: "\u2016", stroke: "solid",  weight: 2,   note: "Passage refused. The gate is closed." },
  "JOINT REVIEW":  { key: "review",     glyph: "\u2687", stroke: "dashed", weight: 2,   note: "Held pending a decision that no single party can make." },
  "AUTHORIZED":    { key: "authorized", glyph: "\u2AFC", stroke: "solid",  weight: 2,   note: "The gate opened. Passage is permitted, not yet taken." },
  "EXECUTED":      { key: "executed",   glyph: "\u29BF", stroke: "double", weight: 3,   note: "The mutation was committed." },
  "OBSERVED":      { key: "observed",   glyph: "\u25CE", stroke: "dotted", weight: 1.5, note: "Independently witnessed by a party that cannot authorize." },
  "FAILED":        { key: "failed",     glyph: "\u2715", stroke: "solid",  weight: 2,   note: "Terminal. No further passage from this state." },
};

export const STATE_ORDER = Object.keys(STATES);
export const stateVar = (key) => `var(--il-state-${key})`;
