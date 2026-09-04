/* @ds-bundle: {"format":4,"namespace":"WorkspaceJsonDesignSystem_b8d83c","components":[{"name":"FAMILIES","sourcePath":"assets/naming.js"},{"name":"VARIANTS","sourcePath":"assets/naming.js"},{"name":"EXTENSIONS","sourcePath":"assets/naming.js"},{"name":"EDGES","sourcePath":"components/_util/edges.js"},{"name":"EDGE_ORDER","sourcePath":"components/_util/edges.js"},{"name":"NODES","sourcePath":"components/_util/nodes.js"},{"name":"NODE_ORDER","sourcePath":"components/_util/nodes.js"},{"name":"STATES","sourcePath":"components/_util/states.js"},{"name":"STATE_ORDER","sourcePath":"components/_util/states.js"},{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"GateSequence","sourcePath":"components/brand/GateSequence.jsx"},{"name":"GATE_STAGES","sourcePath":"components/brand/GateSequence.jsx"},{"name":"LOGO_GEOMETRY","sourcePath":"components/brand/Logo.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Caption","sourcePath":"components/content/Caption.jsx"},{"name":"CodeBlock","sourcePath":"components/content/CodeBlock.jsx"},{"name":"ComparisonPanel","sourcePath":"components/content/ComparisonPanel.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"MetricCard","sourcePath":"components/data-display/MetricCard.jsx"},{"name":"ReceiptCard","sourcePath":"components/data-display/ReceiptCard.jsx"},{"name":"StateCard","sourcePath":"components/data-display/StateCard.jsx"},{"name":"StateChip","sourcePath":"components/data-display/StateChip.jsx"},{"name":"ArchNode","sourcePath":"components/diagram/ArchNode.jsx"},{"name":"EdgeDefs","sourcePath":"components/diagram/Edge.jsx"},{"name":"Edge","sourcePath":"components/diagram/Edge.jsx"},{"name":"Legend","sourcePath":"components/diagram/Legend.jsx"},{"name":"Timeline","sourcePath":"components/diagram/Timeline.jsx"},{"name":"Callout","sourcePath":"components/feedback/Callout.jsx"},{"name":"EndCardMotion","sourcePath":"components/motion/EndCardMotion.jsx"},{"name":"END_CARD_STEPS","sourcePath":"components/motion/EndCardMotion.jsx"},{"name":"GateStinger","sourcePath":"components/motion/GateStinger.jsx"},{"name":"STINGER_PHASES","sourcePath":"components/motion/GateStinger.jsx"},{"name":"MotionSpec","sourcePath":"components/motion/MotionSpec.jsx"},{"name":"TitleCardMotion","sourcePath":"components/motion/TitleCardMotion.jsx"},{"name":"TITLE_CARD_STEPS","sourcePath":"components/motion/TitleCardMotion.jsx"},{"name":"PHASES","sourcePath":"components/motion/phases.js"},{"name":"REST","sourcePath":"components/motion/phases.js"},{"name":"FULL","sourcePath":"components/motion/phases.js"},{"name":"TOTAL_MS","sourcePath":"components/motion/phases.js"},{"name":"CARD_IN","sourcePath":"components/motion/phases.js"},{"name":"CARD_OUT","sourcePath":"components/motion/phases.js"},{"name":"LAYER_CSS","sourcePath":"components/motion/phases.js"},{"name":"PRESETS","sourcePath":"components/scaffolds/Scaffold.jsx"},{"name":"Scaffold","sourcePath":"components/scaffolds/Scaffold.jsx"}],"sourceHashes":{"assets/naming.js":"0b607b999910","components/_util/edges.js":"f5c165771dc7","components/_util/nodes.js":"bf8c8d3be093","components/_util/states.js":"d721461d2f0e","components/_util/styles.js":"f69d34f03c84","components/actions/Button.jsx":"e2d64ba7c863","components/brand/GateSequence.jsx":"275ce593d057","components/brand/Logo.jsx":"95a1ab007038","components/content/Caption.jsx":"e9a6db73b7ec","components/content/CodeBlock.jsx":"e48477bf4b83","components/content/ComparisonPanel.jsx":"211a46bed87a","components/data-display/Badge.jsx":"c92f31915e11","components/data-display/Card.jsx":"fe5b8029d9a0","components/data-display/MetricCard.jsx":"14c7ebec12fb","components/data-display/ReceiptCard.jsx":"3be9ccd2c47e","components/data-display/StateCard.jsx":"bdc72559f0a8","components/data-display/StateChip.jsx":"0f460a5c16a8","components/diagram/ArchNode.jsx":"1dfdcc667a3e","components/diagram/Edge.jsx":"df68670b7d3b","components/diagram/Legend.jsx":"ed61ed008e95","components/diagram/Timeline.jsx":"c18623c36e72","components/feedback/Callout.jsx":"516665a6a24c","components/motion/EndCardMotion.jsx":"28f6565a3358","components/motion/GateStinger.jsx":"313d1da8aa98","components/motion/MotionSpec.jsx":"df6cb0ba3220","components/motion/TitleCardMotion.jsx":"ffb2fec9e5ef","components/motion/phases.js":"1da85da7dfa5","components/scaffolds/Scaffold.jsx":"0a057aca68fd","reference/workspacejson-website/DocsScreen.jsx":"80feafb4ae3b","reference/workspacejson-website/ExamplesScreen.jsx":"90cc3308c77d","reference/workspacejson-website/Footer.jsx":"007e77c65bed","reference/workspacejson-website/GettingStartedScreen.jsx":"90d18e50fe9a","reference/workspacejson-website/Header.jsx":"176cc7486179","reference/workspacejson-website/HomeScreen.jsx":"1b447f806743","reference/workspacejson-website/app.jsx":"b847fdbe7ea5"},"inlinedExternals":[],"unexposedExports":[{"name":"auditExports","sourcePath":"assets/naming.js"},{"name":"buildExportName","sourcePath":"assets/naming.js"},{"name":"stateVar","sourcePath":"components/_util/states.js"},{"name":"useInjectedStyles","sourcePath":"components/_util/styles.js"},{"name":"useReducedMotion","sourcePath":"components/motion/phases.js"},{"name":"useSequence","sourcePath":"components/motion/phases.js"},{"name":"useWidth","sourcePath":"components/motion/phases.js"},{"name":"validateExportName","sourcePath":"assets/naming.js"}]} */

(() => {

const __ds_ns = (window.WorkspaceJsonDesignSystem_b8d83c = window.WorkspaceJsonDesignSystem_b8d83c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/naming.js
try { (() => {
/* Interlock export naming — frozen convention.
   One deterministic filename per exported asset, derived from the registry so
   the registry and the filesystem cannot drift apart.

     IL-{FAMILY}-{NNN}-{slug}[-{variant}][-{W}x{H}][-r{NN}][-run{ID}].{ext}

   Import this rather than hand-typing an export name. */

const FAMILIES = {
  LOGO: "Identity: marks, wordmarks, lockups, favicons, app icons",
  SCAF: "Export scaffolds: README hero, OG, Devpost, video cards, social frames",
  DIAG: "Diagrams: architecture boards, node and edge figures, legends",
  PROOF: "Proof and data: metric figures, receipt figures, before/after panels",
  MOT: "Motion and video: sequences, openers, transitions",
  SOC: "Social and marketing derivatives",
  TOK: "Token and foundation specimens",
  STATE: "State system specimens",
  EDGE: "Relationship grammar specimens",
  NODE: "Node grammar specimens",
  PRIM: "Presentation primitive specimens",
  TMPL: "Templates",
  COCK: "Judge cockpit states: The Run, its layers, and its degraded states",
  VAL: "Validation harnesses"
};
const VARIANTS = ["light", "dark", "mono", "static"];
const EXTENSIONS = ["svg", "png", "webp", "mp4", "webm", "pdf"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIMS = /^(\d{2,5})x(\d{2,5})$/;
const REV = /^r(\d{2})$/;
const RUN = /^run([a-z0-9]+)$/;
const ID = /^IL-([A-Z]{3,5})-(\d{3})$/;

/** Build the one legal filename for an export. */
function buildExportName({
  id,
  slug,
  variant,
  width,
  height,
  revision,
  run,
  ext
}) {
  if (!ID.test(id)) throw new Error(`bad registry id: ${id}`);
  if (!SLUG.test(slug)) throw new Error(`slug must be lowercase kebab: ${slug}`);
  if (!EXTENSIONS.includes(ext)) throw new Error(`unsupported extension: ${ext}`);
  if (variant && !VARIANTS.includes(variant)) throw new Error(`unknown variant: ${variant}`);
  const raster = ext !== "svg";
  if (raster && !(width && height)) throw new Error("raster and video exports must carry dimensions");
  const parts = [id, slug];
  if (variant) parts.push(variant);
  if (width && height) parts.push(`${width}x${height}`);
  if (revision && revision > 1) parts.push(`r${String(revision).padStart(2, "0")}`);
  if (run) parts.push(`run${String(run).toLowerCase().replace(/[^a-z0-9]/g, "")}`);
  return `${parts.join("-")}.${ext}`;
}

/** Parse a filename from the right, which is the only unambiguous direction. */
function validateExportName(name) {
  const err = m => ({
    valid: false,
    error: m,
    name
  });
  const dot = name.lastIndexOf(".");
  if (dot < 0) return err("no extension");
  const ext = name.slice(dot + 1);
  if (!EXTENSIONS.includes(ext)) return err(`unsupported extension .${ext}`);
  if (name !== name.replace(/[^A-Za-z0-9.-]/g, "")) return err("only A-Z, a-z, 0-9, hyphen and one dot are allowed");
  const stem = name.slice(0, dot).split("-");
  if (stem.length < 4) return err("too few segments");
  if (stem[0] !== "IL") return err("must start with IL");
  const family = stem[1],
    num = stem[2];
  if (!FAMILIES[family]) return err(`unknown family ${family}`);
  if (!/^\d{3}$/.test(num)) return err("index must be three digits");
  let rest = stem.slice(3);
  const out = {
    valid: true,
    name,
    id: `IL-${family}-${num}`,
    family,
    ext
  };
  let m;
  if (rest.length && (m = RUN.exec(rest[rest.length - 1]))) {
    out.run = m[1];
    rest.pop();
  }
  if (rest.length && (m = REV.exec(rest[rest.length - 1]))) {
    out.revision = Number(m[1]);
    rest.pop();
  }
  if (rest.length && (m = DIMS.exec(rest[rest.length - 1]))) {
    out.width = +m[1];
    out.height = +m[2];
    rest.pop();
  }
  if (rest.length > 1 && VARIANTS.includes(rest[rest.length - 1])) {
    out.variant = rest.pop();
  }
  if (!rest.length) return err("missing slug");
  out.slug = rest.join("-");
  if (!SLUG.test(out.slug)) return err(`slug must be lowercase kebab: ${out.slug}`);
  if (ext !== "svg" && !out.width) return err("raster and video exports must carry dimensions");
  if (out.revision === 1) return err("r01 is implied and must not be written");
  return out;
}

/** Check a set of filenames against a loaded registry.json. */
function auditExports(names, registry) {
  const ids = new Set((registry.assets || []).map(a => a.id));
  return names.map(n => {
    const r = validateExportName(n);
    if (!r.valid) return r;
    if (!ids.has(r.id)) return {
      ...r,
      valid: false,
      error: `${r.id} is not a registry row`
    };
    return r;
  });
}
Object.assign(__ds_scope, { FAMILIES, VARIANTS, EXTENSIONS, buildExportName, validateExportName, auditExports });
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/naming.js", error: String((e && e.message) || e) }); }

// components/_util/edges.js
try { (() => {
/* Interlock relationship grammar — the deterministic edge table.
   A reader should be able to name the relationship from the line alone,
   before reading its label. Pattern carries meaning; colour is optional
   emphasis only. */

const EDGES = {
  intent: {
    label: "Intent",
    dash: "5 4",
    weight: 1.5,
    head: "open",
    tail: "none",
    note: "An agent proposes an action. Nothing is committed."
  },
  evidence: {
    label: "Evidence",
    dash: "1 3",
    weight: 1,
    head: "dot",
    tail: "none",
    note: "A fact is supplied from workspace.json or another bound source."
  },
  coupling: {
    label: "Coupling",
    dash: "0",
    weight: 2,
    head: "bar",
    tail: "bar",
    note: "Two actions are bound by a shared constraint. Symmetric: no direction."
  },
  authorization: {
    label: "Authorization",
    dash: "0",
    weight: 3,
    head: "gate",
    tail: "none",
    note: "A decision passes through the gate. The heaviest line in the system."
  },
  mutation: {
    label: "Mutation",
    dash: "0",
    weight: 2,
    head: "solid",
    tail: "none",
    note: "State is actually changed at the target."
  },
  observation: {
    label: "Observation",
    dash: "2 5",
    weight: 1,
    head: "ring",
    tail: "none",
    note: "A party watches but cannot authorize or mutate."
  },
  refusal: {
    label: "Refusal",
    dash: "0",
    weight: 2,
    head: "stop",
    tail: "none",
    note: "The gate declined. The path terminates at the boundary."
  },
  bypass: {
    label: "Bypass rejected",
    dash: "3 3",
    weight: 2,
    head: "cross",
    tail: "none",
    note: "An attempt to route around the gate was rejected."
  }
};
const EDGE_ORDER = Object.keys(EDGES);
Object.assign(__ds_scope, { EDGES, EDGE_ORDER });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/_util/edges.js", error: String((e && e.message) || e) }); }

// components/_util/nodes.js
try { (() => {
/* Interlock node grammar. Each class of thing in an architecture diagram
   owns one border treatment and one glyph, so a reader can classify a box
   without reading it. These are visual primitives only: the facts inside
   them must come from evidence-bound architecture, never from this table. */

const NODES = {
  agent: {
    label: "Agent",
    glyph: "\u25B3",
    border: "1.5px solid",
    note: "An autonomous actor proposing change."
  },
  evidence: {
    label: "workspace.json",
    glyph: "\u25A6",
    border: "1px dotted",
    note: "Bound repository facts. Descriptive, machine-generated."
  },
  core: {
    label: "Interlock core",
    glyph: "\u2AFC",
    border: "2px solid",
    note: "The control plane that holds the gate."
  },
  receipt: {
    label: "Receipt",
    glyph: "\u229E",
    border: "1px solid",
    note: "An immutable record of a decision or execution."
  },
  target: {
    label: "Protected target",
    glyph: "\u25A3",
    border: "2px double",
    note: "The resource behind the boundary."
  },
  verifier: {
    label: "Independent verifier",
    glyph: "\u25CE",
    border: "1.5px dotted",
    note: "Observes and attests. Cannot authorize."
  },
  runtime: {
    label: "Google runtime",
    glyph: "\u2312",
    border: "1px dashed",
    note: "Managed execution environment."
  },
  external: {
    label: "External infrastructure",
    glyph: "\u2337",
    border: "1px dashed",
    note: "Outside the trust boundary."
  }
};
const NODE_ORDER = Object.keys(NODES);
Object.assign(__ds_scope, { NODES, NODE_ORDER });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/_util/nodes.js", error: String((e && e.message) || e) }); }

// components/_util/states.js
try { (() => {
/* Interlock semantic state table — the single source of truth.
   Every state is carried by three channels: colour, glyph, stroke.
   Consumers must not introduce states outside this table. */

const STATES = {
  "LOCALLY VALID": {
    key: "local",
    glyph: "\u2219",
    stroke: "dashed",
    weight: 1,
    note: "Valid in its own scope. Nothing has been coordinated yet."
  },
  "COUPLED": {
    key: "coupled",
    glyph: "\u29C9",
    stroke: "solid",
    weight: 1.5,
    note: "Two or more actions now share a constraint."
  },
  "BLOCKED": {
    key: "blocked",
    glyph: "\u2016",
    stroke: "solid",
    weight: 2,
    note: "Passage refused. The gate is closed."
  },
  "JOINT REVIEW": {
    key: "review",
    glyph: "\u2687",
    stroke: "dashed",
    weight: 2,
    note: "Held pending a decision that no single party can make."
  },
  "AUTHORIZED": {
    key: "authorized",
    glyph: "\u2AFC",
    stroke: "solid",
    weight: 2,
    note: "The gate opened. Passage is permitted, not yet taken."
  },
  "EXECUTED": {
    key: "executed",
    glyph: "\u29BF",
    stroke: "double",
    weight: 3,
    note: "The mutation was committed."
  },
  "OBSERVED": {
    key: "observed",
    glyph: "\u25CE",
    stroke: "dotted",
    weight: 1.5,
    note: "Independently witnessed by a party that cannot authorize."
  },
  "FAILED": {
    key: "failed",
    glyph: "\u2715",
    stroke: "solid",
    weight: 2,
    note: "Terminal. No further passage from this state."
  }
};
const STATE_ORDER = Object.keys(STATES);
const stateVar = key => `var(--il-state-${key})`;
Object.assign(__ds_scope, { STATES, STATE_ORDER, stateVar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/_util/states.js", error: String((e && e.message) || e) }); }

// components/_util/styles.js
try { (() => {
/* Injects a component's stylesheet once, keyed by id. Rules reference
   design-system CSS custom properties so components stay themeable. */
function useInjectedStyles(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
Object.assign(__ds_scope, { useInjectedStyles });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/_util/styles.js", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
  font-family: var(--font-sans); font-weight: var(--fw-medium);
  letter-spacing: var(--ls-heading);
  border-radius: var(--radius-sm);
  border: var(--stroke-hair) solid transparent;
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: var(--transition-interactive);
  -webkit-tap-highlight-color: transparent;
}
.il-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.il-btn[aria-disabled="true"], .il-btn:disabled { opacity: 0.4; pointer-events: none; }
.il-btn--sm { min-height: 32px; padding: 0 var(--sp-3); font-size: var(--fs-caption); }
.il-btn--md { min-height: var(--tap-target); padding: 0 var(--sp-5); font-size: var(--fs-body-sm); }
.il-btn--lg { min-height: 52px; padding: 0 var(--sp-6); font-size: var(--fs-body); }

.il-btn--primary { background: var(--surface-invert); color: var(--text-invert); border-color: var(--surface-invert); }
.il-btn--primary:hover { background: var(--il-n-70); border-color: var(--il-n-70); }
:root[data-theme="dark"] .il-btn--primary:hover { background: var(--il-n-20); border-color: var(--il-n-20); }

.il-btn--secondary { background: transparent; color: var(--text-body); border-color: var(--border-default); }
.il-btn--secondary:hover { border-color: var(--border-ink); color: var(--text-heading); background: var(--surface-sunken); }

.il-btn--ghost { background: transparent; color: var(--text-muted); }
.il-btn--ghost:hover { color: var(--text-heading); background: var(--surface-sunken); }

.il-btn__icon { display: inline-flex; font-size: 1.05em; line-height: 0; }
`;

/** Squared action button. Renders an <a> when `href` is set. */
function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  iconLeft,
  iconRight,
  disabled = false,
  onClick,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-btn-css", CSS);
  const cls = `il-btn il-btn--${variant} il-btn--${size} ${className}`.trim();
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, iconLeft ? /*#__PURE__*/React.createElement("span", {
    className: "il-btn__icon"
  }, iconLeft) : null, /*#__PURE__*/React.createElement("span", null, children), iconRight ? /*#__PURE__*/React.createElement("span", {
    className: "il-btn__icon"
  }, iconRight) : null);
  if (href && !disabled) return /*#__PURE__*/React.createElement("a", _extends({
    className: cls,
    href: href,
    onClick: onClick
  }, rest), inner);
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    type: "button",
    disabled: disabled,
    "aria-disabled": disabled || undefined,
    onClick: onClick
  }, rest), inner);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Canonical geometry. 48-unit grid; do not re-draw these numbers. */
const ARMS = ["M2.889 6 L9.111 6 L17.2 14.089 L17.2 20.311 Z", "M45.111 6 L38.889 6 L30.8 14.089 L30.8 20.311 Z", "M2.889 42 L9.111 42 L17.2 33.911 L17.2 27.689 Z", "M45.111 42 L38.889 42 L30.8 33.911 L30.8 27.689 Z"];
const LEAF_L = "M18.6 16.2 L23.2 19.4 L23.2 28.6 L18.6 31.8 Z";
const LEAF_R = "M29.4 16.2 L24.8 19.4 L24.8 28.6 L29.4 31.8 Z";
const MICRO = ["M0.672 3.5 L6.328 3.5 L9.4 6.572 L9.4 12.228 Z", "M23.328 3.5 L17.672 3.5 L14.6 6.572 L14.6 12.228 Z", "M0.672 20.5 L6.328 20.5 L9.4 17.428 L9.4 11.772 Z", "M23.328 20.5 L17.672 20.5 L14.6 17.428 L14.6 11.772 Z", "M9.4 6 L11 6 L11 18 L9.4 18 Z", "M14.6 6 L13 6 L13 18 L14.6 18 Z"];

/* The frozen geometry, published so motion assets animate the canonical paths
   instead of redrawing them. Read-only: any change here is a change to the mark. */
const LOGO_GEOMETRY = {
  GRID: 48,
  ARMS,
  LEAF_L,
  LEAF_R,
  MICRO,
  GATE_TRAVEL: 1.6
};
const CSS = `
.il-logo { display: inline-flex; align-items: center; color: var(--text-heading); }
.il-logo--stacked { flex-direction: column; }
.il-logo__mark { display: block; flex: none; }
.il-logo__leaf { transition: transform var(--dur-gate) var(--ease-mech); }
.il-logo[data-gate="open"] .il-logo__leaf--l { transform: translateX(-1.6px); }
.il-logo[data-gate="open"] .il-logo__leaf--r { transform: translateX(1.6px); }
.il-logo__word {
  font-family: var(--font-sans); font-weight: var(--fw-medium);
  letter-spacing: var(--ls-display); line-height: 1; color: currentColor;
}
@media (prefers-reduced-motion: reduce) { .il-logo__leaf { transition: none; } }
`;

/**
 * The Interlock mark. `variant` picks the lockup; `gate` drives the one
 * meaningful state the mark carries (closed by default, open only when
 * something has actually been authorized).
 */
function Logo({
  variant = "horizontal",
  // horizontal | stacked | symbol | micro
  size = 32,
  // symbol height in px
  gate = "closed",
  // closed | open
  color,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-logo-css", CSS);
  const micro = variant === "micro" || size <= 12;
  const style = color ? {
    color
  } : undefined;
  const mark = micro ? /*#__PURE__*/React.createElement("svg", {
    className: "il-logo__mark",
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true"
  }, MICRO.map((d, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: d
  }))) : /*#__PURE__*/React.createElement("svg", {
    className: "il-logo__mark",
    viewBox: "0 0 48 48",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true"
  }, ARMS.map((d, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: d
  })), /*#__PURE__*/React.createElement("path", {
    className: "il-logo__leaf il-logo__leaf--l",
    d: LEAF_L
  }), /*#__PURE__*/React.createElement("path", {
    className: "il-logo__leaf il-logo__leaf--r",
    d: LEAF_R
  }));
  if (variant === "symbol" || micro) {
    return /*#__PURE__*/React.createElement("span", _extends({
      className: `il-logo ${className}`.trim(),
      "data-gate": gate,
      style: style,
      role: "img",
      "aria-label": "Interlock"
    }, rest), mark);
  }
  const stacked = variant === "stacked";
  const wordSize = stacked ? size * 0.54 : size * 0.71;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `il-logo ${stacked ? "il-logo--stacked" : ""} ${className}`.trim(),
    "data-gate": gate,
    style: {
      ...style,
      gap: stacked ? size * 0.2 : size * 0.29
    },
    role: "img",
    "aria-label": "Interlock"
  }, rest), mark, /*#__PURE__*/React.createElement("span", {
    className: "il-logo__word",
    style: {
      fontSize: wordSize
    }
  }, "Interlock"));
}
Object.assign(__ds_scope, { LOGO_GEOMETRY, Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/brand/GateSequence.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STAGES = [{
  n: 1,
  title: "Independent trajectories",
  body: "Two agents act in separate scopes. Each is locally valid."
}, {
  n: 2,
  title: "Shared constraint detected",
  body: "A dependency common to both paths is found in bound evidence."
}, {
  n: 3,
  title: "Coupling at the boundary",
  body: "The two actions are bound. Neither proceeds alone."
}, {
  n: 4,
  title: "Authorization pause",
  body: "The gate holds. Its state changes visibly before anything moves."
}, {
  n: 5,
  title: "Synchronized passage",
  body: "The aperture opens and both actions cross together."
}];
const CSS = `
.il-gateseq { display: grid; gap: var(--sp-4); }
.il-gateseq__row { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--sp-3); align-items: start; }
.il-gateseq__cell { display: grid; gap: var(--sp-3); justify-items: center; text-align: center; padding: var(--sp-3) var(--sp-2); border-top: var(--stroke-2) solid var(--border-hair); }
.il-gateseq__cell[data-active="true"] { border-top-color: var(--border-ink); }
.il-gateseq__stage { position: relative; }
.il-gateseq__n { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); color: var(--text-faint); }
.il-gateseq__t { font-family: var(--font-sans); font-size: var(--fs-caption); font-weight: var(--fw-medium); color: var(--text-heading); margin: 0; letter-spacing: var(--ls-heading); }
.il-gateseq__b { font-size: var(--fs-micro); line-height: 1.5; color: var(--text-muted); margin: 0; max-width: 15rem; }
.il-gateseq__ghost { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.il-gateseq__slot { width: 2px; background: var(--border-default); }
`;

/**
 * The five-state causal model, rendered as a static strip. This is the
 * reduced-motion equivalent of the animated mark: it shows every stage at
 * once instead of stepping through them, so nothing is lost when motion is
 * suppressed. `active` highlights one stage for stills and title cards.
 */
function GateSequence({
  size = 48,
  active = null,
  labels = true,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-gateseq-css", CSS);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-gateseq ${className}`.trim()
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "il-gateseq__row"
  }, STAGES.map(s => /*#__PURE__*/React.createElement("div", {
    className: "il-gateseq__cell",
    key: s.n,
    "data-active": active === s.n ? "true" : undefined
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-gateseq__n"
  }, String(s.n).padStart(2, "0")), /*#__PURE__*/React.createElement("span", {
    className: "il-gateseq__stage"
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    variant: "symbol",
    size: size,
    gate: s.n === 5 ? "open" : "closed"
  })), labels ? /*#__PURE__*/React.createElement("p", {
    className: "il-gateseq__t"
  }, s.title) : null, labels ? /*#__PURE__*/React.createElement("p", {
    className: "il-gateseq__b"
  }, s.body) : null))));
}
const GATE_STAGES = STAGES;
Object.assign(__ds_scope, { GateSequence, GATE_STAGES });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/GateSequence.jsx", error: String((e && e.message) || e) }); }

// components/content/Caption.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-caption { display: grid; gap: var(--sp-1); padding-top: var(--sp-2); border-top: var(--stroke-hair) solid var(--border-hair); font-family: var(--font-mono); font-size: var(--fs-micro); line-height: 1.55; color: var(--text-muted); letter-spacing: var(--ls-mono); }
.il-caption__id { color: var(--text-faint); }
.il-caption__prov { color: var(--text-faint); }
.il-caption--unbound { border-top-style: dashed; }
`;

/**
 * The caption that travels with every figure. `source` is the proof
 * dependency; without one the caption self-labels as a specimen so an
 * illustrative graphic can never be read as evidence.
 */
function Caption({
  id,
  children,
  source,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-caption-css", CSS);
  return /*#__PURE__*/React.createElement("figcaption", _extends({
    className: `il-caption ${source ? "" : "il-caption--unbound"} ${className}`.trim()
  }, rest), /*#__PURE__*/React.createElement("span", null, id ? /*#__PURE__*/React.createElement("span", {
    className: "il-caption__id"
  }, id, " \xB7 ") : null, children), /*#__PURE__*/React.createElement("span", {
    className: "il-caption__prov"
  }, source ? /*#__PURE__*/React.createElement(React.Fragment, null, "source ", source) : /*#__PURE__*/React.createElement(React.Fragment, null, "specimen \xB7 illustrative, not evidence-bound")));
}
Object.assign(__ds_scope, { Caption });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Caption.jsx", error: String((e && e.message) || e) }); }

// components/content/CodeBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-code { border: var(--stroke-hair) solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-code); overflow: hidden; }
.il-code__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-bottom: var(--stroke-hair) solid var(--border-hair); font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-faint); letter-spacing: var(--ls-mono); }
.il-code__name { color: var(--text-muted); }
.il-code__copy { font: inherit; color: var(--text-faint); background: none; border: var(--stroke-hair) solid var(--border-hair); border-radius: var(--radius-sm); padding: 1px var(--sp-2); cursor: pointer; transition: var(--transition-interactive); }
.il-code__copy:hover { color: var(--text-heading); border-color: var(--border-strong); }
.il-code pre { margin: 0; padding: var(--sp-4); overflow-x: auto; }
.il-code code { font-family: var(--font-mono); font-size: var(--fs-caption); line-height: 1.65; color: var(--text-body); letter-spacing: var(--ls-mono); white-space: pre; }
.il-code--inline-num pre { counter-reset: l; }
`;

/** Framed source. Evidence you can copy, so it stays checkable. */
function CodeBlock({
  code = "",
  filename,
  language,
  copyable = true,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-code-css", CSS);
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-code ${className}`.trim()
  }, rest), filename || language || copyable ? /*#__PURE__*/React.createElement("div", {
    className: "il-code__bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-code__name"
  }, filename), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: "var(--sp-3)",
      alignItems: "center"
    }
  }, language ? /*#__PURE__*/React.createElement("span", null, language) : null, copyable ? /*#__PURE__*/React.createElement("button", {
    className: "il-code__copy",
    type: "button",
    onClick: copy
  }, copied ? "copied" : "copy") : null)) : null, /*#__PURE__*/React.createElement("pre", null, /*#__PURE__*/React.createElement("code", null, code)));
}
Object.assign(__ds_scope, { CodeBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/CodeBlock.jsx", error: String((e && e.message) || e) }); }

// components/content/ComparisonPanel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-compare { display: grid; grid-template-columns: 1fr 1fr; border: var(--stroke-hair) solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.il-compare__side { padding: var(--sp-5); background: var(--surface-card); }
.il-compare__side + .il-compare__side { border-left: var(--stroke-2) solid var(--border-ink); }
.il-compare__side--before { background: var(--surface-sunken); }
.il-compare__eyebrow { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); margin: 0 0 var(--sp-3); }
.il-compare__title { font-size: var(--fs-h4); font-weight: var(--fw-medium); letter-spacing: var(--ls-heading); color: var(--text-heading); margin: 0 0 var(--sp-3); }
.il-compare__list { display: grid; gap: var(--sp-2); margin: 0; padding: 0; list-style: none; }
.il-compare__list li { display: grid; grid-template-columns: 1rem 1fr; gap: var(--sp-2); font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-body); }
.il-compare__list li::before { content: attr(data-glyph); font-family: var(--font-mono); color: var(--text-faint); }
@media (max-width: 640px) { .il-compare { grid-template-columns: 1fr; } .il-compare__side + .il-compare__side { border-left: none; border-top: var(--stroke-2) solid var(--border-ink); } }
`;

/** Two-column before/after or counterfactual panel. The heavy centre rule is
 *  the boundary: left is the world without the intervention, right is with. */
function ComparisonPanel({
  before,
  after,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-compare-css", CSS);
  const side = (s, which) => /*#__PURE__*/React.createElement("div", {
    className: `il-compare__side il-compare__side--${which}`
  }, /*#__PURE__*/React.createElement("p", {
    className: "il-compare__eyebrow"
  }, s.eyebrow || which), /*#__PURE__*/React.createElement("h3", {
    className: "il-compare__title"
  }, s.title), /*#__PURE__*/React.createElement("ul", {
    className: "il-compare__list"
  }, (s.items || []).map((it, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    "data-glyph": s.glyph || (which === "before" ? "\u2715" : "\u2AFC")
  }, it))));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-compare ${className}`.trim()
  }, rest), side(before || {}, "before"), side(after || {}, "after"));
}
Object.assign(__ds_scope, { ComparisonPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/ComparisonPanel.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-badge {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  padding: 1px var(--sp-2);
  font-family: var(--font-mono); font-size: var(--fs-micro); font-weight: var(--fw-medium);
  letter-spacing: var(--ls-label); text-transform: uppercase; line-height: 1.7;
  border: var(--stroke-hair) solid var(--border-default);
  border-radius: var(--radius-sm); color: var(--text-muted); white-space: nowrap;
}
.il-badge--ink { color: var(--text-invert); background: var(--surface-invert); border-color: var(--surface-invert); }
.il-badge--outline { color: var(--text-heading); border-color: var(--border-ink); }
.il-badge--quiet { border-color: transparent; background: var(--surface-sunken); }
.il-badge--spec { border-style: dashed; }
`;

/** Non-state metadata pill: version, tier, licence, spec status. Product
 *  state uses StateChip instead, never this. */
function Badge({
  children,
  variant = "quiet",
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-badge-css", CSS);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `il-badge il-badge--${variant} ${className}`.trim()
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-card {
  display: block; padding: var(--sp-5);
  background: var(--surface-card);
  border: var(--stroke-hair) solid var(--border-hair);
  border-radius: var(--radius-md);
  text-decoration: none; color: inherit;
  transition: var(--transition-interactive);
}
a.il-card:hover { border-color: var(--border-strong); box-shadow: var(--elev-1); }
a.il-card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.il-card--sunken { background: var(--surface-sunken); }
.il-card--ruled { border: none; border-top: var(--stroke-2) solid var(--border-ink); border-radius: 0; padding-left: 0; padding-right: 0; background: none; }
.il-card__eyebrow { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); margin: 0 0 var(--sp-3); }
.il-card__title { font-size: var(--fs-h4); font-weight: var(--fw-medium); letter-spacing: var(--ls-heading); color: var(--text-heading); margin: 0 0 var(--sp-2); }
.il-card__body { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); margin: 0; }
`;

/** Neutral surface card. `ruled` drops the box for a top-rule block. */
function Card({
  eyebrow,
  title,
  href,
  variant = "default",
  children,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-card-css", CSS);
  const Tag = href ? "a" : "div";
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: `il-card il-card--${variant} ${className}`.trim(),
    href: href
  }, rest), eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "il-card__eyebrow"
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h3", {
    className: "il-card__title"
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    className: "il-card__body"
  }, children) : null);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/data-display/MetricCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-metric { display: grid; gap: var(--sp-2); padding: var(--sp-4) var(--sp-5); background: var(--surface-card); border: var(--stroke-hair) solid var(--border-hair); border-radius: var(--radius-md); }
.il-metric__label { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); margin: 0; }
.il-metric__value { font-family: var(--font-mono); font-size: var(--fs-h2); font-weight: var(--fw-medium); letter-spacing: -0.02em; line-height: 1; color: var(--text-heading); margin: 0; font-variant-numeric: tabular-nums; }
.il-metric__unit { font-size: 0.5em; color: var(--text-muted); margin-left: 0.35em; }
.il-metric__note { font-size: var(--fs-caption); line-height: var(--lh-tight); color: var(--text-muted); margin: 0; }
.il-metric__source { display: flex; align-items: center; gap: var(--sp-2); margin: 0; padding-top: var(--sp-2); border-top: var(--stroke-hair) dotted var(--border-default); font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-faint); }
.il-metric[data-unbound="true"] { border-style: dashed; }
.il-metric[data-unbound="true"] .il-metric__value { color: var(--text-faint); }
`;

/**
 * A number that has to survive being questioned. `source` is required for
 * any factual metric; a card with no source renders in the unbound style so
 * an unsourced number cannot pass for evidence.
 */
function MetricCard({
  label,
  value,
  unit,
  note,
  source,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-metric-css", CSS);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-metric ${className}`.trim(),
    "data-unbound": source ? undefined : "true"
  }, rest), /*#__PURE__*/React.createElement("p", {
    className: "il-metric__label"
  }, label), /*#__PURE__*/React.createElement("p", {
    className: "il-metric__value"
  }, value, unit ? /*#__PURE__*/React.createElement("span", {
    className: "il-metric__unit"
  }, unit) : null), note ? /*#__PURE__*/React.createElement("p", {
    className: "il-metric__note"
  }, note) : null, /*#__PURE__*/React.createElement("p", {
    className: "il-metric__source"
  }, source ? /*#__PURE__*/React.createElement(React.Fragment, null, "source ", source) : /*#__PURE__*/React.createElement(React.Fragment, null, "specimen \xB7 not evidence-bound")));
}
Object.assign(__ds_scope, { MetricCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/MetricCard.jsx", error: String((e && e.message) || e) }); }

// components/data-display/StateChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-state {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  padding: 2px var(--sp-2) 2px var(--sp-1);
  font-family: var(--font-mono); font-size: var(--fs-micro);
  font-weight: var(--fw-medium); letter-spacing: var(--ls-state);
  text-transform: uppercase; line-height: 1.6; white-space: nowrap;
  color: var(--il-state-c);
  background: color-mix(in srgb, var(--il-state-c) var(--state-tint), transparent);
  border: var(--il-state-w) var(--il-state-s) color-mix(in srgb, var(--il-state-c) var(--state-edge), transparent);
  border-radius: var(--radius-sm);
}
.il-state__glyph {
  display: inline-grid; place-items: center;
  width: 1.15em; height: 1.15em; font-size: 1.15em; line-height: 1;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--il-state-c) 16%, transparent);
}
.il-state--lg { font-size: var(--fs-caption); padding: 4px var(--sp-3) 4px var(--sp-2); }
.il-state--bare { background: none; border-color: transparent; padding-left: 0; }
`;

/**
 * The canonical rendering of one of the eight Interlock states. Colour,
 * glyph and border treatment are all set from the state table, so the chip
 * stays readable in greyscale and at projection distance.
 */
function StateChip({
  state,
  size = "md",
  bare = false,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-state-css", CSS);
  const def = __ds_scope.STATES[state];
  if (!def) return null;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `il-state ${size === "lg" ? "il-state--lg" : ""} ${bare ? "il-state--bare" : ""} ${className}`.trim(),
    style: {
      "--il-state-c": `var(--il-state-${def.key})`,
      "--il-state-s": def.stroke,
      "--il-state-w": `${def.weight}px`
    },
    title: def.note
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "il-state__glyph",
    "aria-hidden": "true"
  }, def.glyph), state);
}
Object.assign(__ds_scope, { StateChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/StateChip.jsx", error: String((e && e.message) || e) }); }

// components/data-display/ReceiptCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-receipt { background: var(--surface-card); border: var(--stroke-hair) solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.il-receipt__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-bottom: var(--stroke-hair) dashed var(--border-default); }
.il-receipt__kind { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); }
.il-receipt__rows { display: grid; }
.il-receipt__row { display: grid; grid-template-columns: 10.5rem 1fr; gap: var(--sp-4); padding: var(--sp-2) var(--sp-4); font-family: var(--font-mono); font-size: var(--fs-caption); line-height: 1.55; }
.il-receipt__row + .il-receipt__row { border-top: var(--stroke-hair) solid var(--surface-sunken); }
.il-receipt__k { color: var(--text-faint); letter-spacing: var(--ls-mono); }
.il-receipt__v { color: var(--text-body); word-break: break-all; }
.il-receipt__foot { padding: var(--sp-3) var(--sp-4); border-top: var(--stroke-hair) dashed var(--border-default); font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-faint); }
`;

/** Fixed-field record of something that happened. Field order is part of the
 *  grammar: identity, then action, then decision, then witness. */
function ReceiptCard({
  kind = "receipt",
  state,
  rows = [],
  footer,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-receipt-css", CSS);
  return /*#__PURE__*/React.createElement("section", _extends({
    className: `il-receipt ${className}`.trim()
  }, rest), /*#__PURE__*/React.createElement("header", {
    className: "il-receipt__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-receipt__kind"
  }, kind), state ? /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: state
  }) : null), /*#__PURE__*/React.createElement("div", {
    className: "il-receipt__rows"
  }, rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    className: "il-receipt__row",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-receipt__k"
  }, r.label), /*#__PURE__*/React.createElement("span", {
    className: "il-receipt__v"
  }, r.value)))), footer ? /*#__PURE__*/React.createElement("footer", {
    className: "il-receipt__foot"
  }, footer) : null);
}
Object.assign(__ds_scope, { ReceiptCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/ReceiptCard.jsx", error: String((e && e.message) || e) }); }

// components/data-display/StateCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-statecard {
  display: grid; gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--surface-card);
  border: var(--stroke-hair) solid var(--border-hair);
  border-left: var(--stroke-3) var(--il-sc-s) var(--il-sc-c);
  border-radius: var(--radius-md);
}
.il-statecard__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.il-statecard__id { font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-faint); letter-spacing: var(--ls-mono); }
.il-statecard__title { font-family: var(--font-sans); font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--text-heading); margin: 0; letter-spacing: var(--ls-heading); }
.il-statecard__body { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); margin: 0; }
.il-statecard__meta { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-4); font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-faint); }
.il-statecard__meta b { font-weight: var(--fw-medium); color: var(--text-muted); }
`;

/** A single state in a lifecycle: what it is, what it means, what it blocks. */
function StateCard({
  state,
  title,
  id,
  children,
  meta = [],
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-statecard-css", CSS);
  const def = __ds_scope.STATES[state] || __ds_scope.STATES["LOCALLY VALID"];
  return /*#__PURE__*/React.createElement("article", _extends({
    className: `il-statecard ${className}`.trim(),
    style: {
      "--il-sc-c": `var(--il-state-${def.key})`,
      "--il-sc-s": def.stroke === "double" ? "solid" : def.stroke
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "il-statecard__head"
  }, /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: state
  }), id ? /*#__PURE__*/React.createElement("span", {
    className: "il-statecard__id"
  }, id) : null), title ? /*#__PURE__*/React.createElement("h3", {
    className: "il-statecard__title"
  }, title) : null, children ? /*#__PURE__*/React.createElement("p", {
    className: "il-statecard__body"
  }, children) : null, meta.length ? /*#__PURE__*/React.createElement("div", {
    className: "il-statecard__meta"
  }, meta.map((m, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, /*#__PURE__*/React.createElement("b", null, m.label), " ", m.value))) : null);
}
Object.assign(__ds_scope, { StateCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/StateCard.jsx", error: String((e && e.message) || e) }); }

// components/diagram/ArchNode.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-node {
  display: grid; gap: var(--sp-1);
  min-width: 9rem; padding: var(--sp-3) var(--sp-4);
  background: var(--surface-card);
  border: var(--il-node-b) var(--border-strong);
  border-radius: var(--radius-md);
  text-align: left;
}
.il-node--core { border-color: var(--border-ink); background: var(--surface-invert); color: var(--text-invert); }
.il-node--core .il-node__kind, .il-node--core .il-node__sub { color: color-mix(in srgb, currentColor 62%, transparent); }
.il-node--core .il-node__label { color: currentColor; }
.il-node--external, .il-node--runtime { background: var(--surface-sunken); }
.il-node__kind { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); }
.il-node__glyph { font-size: 1.15em; line-height: 1; }
.il-node__label { font-family: var(--font-sans); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); letter-spacing: var(--ls-heading); color: var(--text-heading); }
.il-node__sub { font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-muted); }
`;

/** One box in an architecture diagram, classified by the node grammar. */
function ArchNode({
  kind = "agent",
  label,
  sub,
  showKind = true,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-node-css", CSS);
  const def = __ds_scope.NODES[kind] || __ds_scope.NODES.agent;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-node il-node--${kind} ${className}`.trim(),
    style: {
      "--il-node-b": def.border
    }
  }, rest), showKind ? /*#__PURE__*/React.createElement("span", {
    className: "il-node__kind"
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-node__glyph",
    "aria-hidden": "true"
  }, def.glyph), def.label) : null, /*#__PURE__*/React.createElement("span", {
    className: "il-node__label"
  }, label), sub ? /*#__PURE__*/React.createElement("span", {
    className: "il-node__sub"
  }, sub) : null);
}
Object.assign(__ds_scope, { ArchNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/diagram/ArchNode.jsx", error: String((e && e.message) || e) }); }

// components/diagram/Edge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Terminal markers. Every marker is drawn in userSpaceOnUse-free units so
   the same defs work at any diagram scale. */
function EdgeDefs({
  idPrefix = "il"
}) {
  const m = (id, w, h, refX, child) => /*#__PURE__*/React.createElement("marker", {
    id: `${idPrefix}-${id}`,
    key: id,
    markerWidth: w,
    markerHeight: h,
    refX: refX,
    refY: h / 2,
    orient: "auto",
    markerUnits: "strokeWidth"
  }, child);
  return /*#__PURE__*/React.createElement("defs", null, m("open", 6, 6, 5, /*#__PURE__*/React.createElement("path", {
    d: "M0.5 0.8 L5 3 L0.5 5.2",
    fill: "none",
    stroke: "context-stroke",
    strokeWidth: "1"
  })), m("solid", 6, 6, 5, /*#__PURE__*/React.createElement("path", {
    d: "M0 0.6 L5.4 3 L0 5.4 Z",
    fill: "context-stroke"
  })), m("dot", 5, 5, 4, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "2.5",
    r: "1.6",
    fill: "context-stroke"
  })), m("ring", 6, 6, 5, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2",
    fill: "none",
    stroke: "context-stroke",
    strokeWidth: "0.9"
  })), m("bar", 4, 6, 2, /*#__PURE__*/React.createElement("path", {
    d: "M2 0.4 L2 5.6",
    stroke: "context-stroke",
    strokeWidth: "1.4"
  })), m("stop", 4, 7, 2.5, /*#__PURE__*/React.createElement("path", {
    d: "M2.4 0.2 L2.4 6.8",
    stroke: "context-stroke",
    strokeWidth: "2"
  })), m("gate", 7, 8, 6, /*#__PURE__*/React.createElement("g", {
    stroke: "context-stroke",
    strokeWidth: "1.3",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.2 0.4 L2.2 2.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2.2 5.4 L2.2 7.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4.4 2.2 L6.2 4 L4.4 5.8"
  }))), m("cross", 7, 7, 3.5, /*#__PURE__*/React.createElement("g", {
    stroke: "context-stroke",
    strokeWidth: "1.3"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1 L6 6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 1 L1 6"
  }))));
}

/**
 * One relationship, drawn to the grammar. Give it a path `d` for real
 * diagrams, or leave it out for the default horizontal specimen segment.
 */
function Edge({
  kind = "intent",
  d,
  width = 120,
  height = 24,
  color = "currentColor",
  idPrefix = "il",
  label,
  className = "",
  ...rest
}) {
  const spec = __ds_scope.EDGES[kind] || __ds_scope.EDGES.intent;
  const path = d || `M2 ${height / 2} L${width - 10} ${height / 2}`;
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: `il-edge ${className}`.trim(),
    width: width,
    height: height,
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": label || spec.label
  }, rest), /*#__PURE__*/React.createElement(EdgeDefs, {
    idPrefix: idPrefix
  }), /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: color,
    strokeWidth: spec.weight,
    strokeDasharray: spec.dash === "0" ? undefined : spec.dash,
    strokeLinecap: "butt",
    markerEnd: spec.head !== "none" ? `url(#${idPrefix}-${spec.head})` : undefined,
    markerStart: spec.tail !== "none" ? `url(#${idPrefix}-${spec.tail})` : undefined
  }));
}
Object.assign(__ds_scope, { EdgeDefs, Edge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/diagram/Edge.jsx", error: String((e && e.message) || e) }); }

// components/diagram/Legend.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-legend { display: grid; gap: var(--sp-3); padding: var(--sp-4); border: var(--stroke-hair) solid var(--border-hair); border-radius: var(--radius-md); background: var(--surface-card); }
.il-legend__title { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); margin: 0; }
.il-legend__items { display: grid; gap: var(--sp-2) var(--sp-5); }
.il-legend__item { display: grid; grid-template-columns: 4.5rem 1fr; align-items: center; gap: var(--sp-3); }
.il-legend__key { display: flex; align-items: center; justify-content: flex-start; color: var(--text-heading); }
.il-legend__swatch { width: 14px; height: 14px; border-radius: var(--radius-sm); border: var(--il-lg-w) var(--il-lg-s) var(--il-lg-c); background: color-mix(in srgb, var(--il-lg-c) var(--state-tint), transparent); }
.il-legend__glyph { margin-left: var(--sp-2); font-size: var(--fs-body-sm); color: var(--il-lg-c); line-height: 1; }
.il-legend__box { width: 34px; height: 16px; border: var(--il-lg-b) var(--border-strong); border-radius: 2px; }
.il-legend__name { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-mono); color: var(--text-body); }
.il-legend__note { color: var(--text-faint); }
`;

/** The key that makes a diagram self-describing. Ship one with every board. */
function Legend({
  kind = "edges",
  title,
  notes = false,
  columns = 1,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-legend-css", CSS);
  const heading = title || (kind === "states" ? "State grammar" : kind === "nodes" ? "Node grammar" : "Relationship grammar");
  let items;
  if (kind === "states") {
    items = Object.entries(__ds_scope.STATES).map(([name, d]) => ({
      name,
      note: d.note,
      key: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
        className: "il-legend__swatch"
      }), /*#__PURE__*/React.createElement("span", {
        className: "il-legend__glyph",
        "aria-hidden": "true"
      }, d.glyph)),
      style: {
        "--il-lg-c": `var(--il-state-${d.key})`,
        "--il-lg-s": d.stroke === "double" ? "solid" : d.stroke,
        "--il-lg-w": `${d.weight}px`
      }
    }));
  } else if (kind === "nodes") {
    items = Object.entries(__ds_scope.NODES).map(([k, d]) => ({
      name: d.label,
      note: d.note,
      key: /*#__PURE__*/React.createElement("span", {
        className: "il-legend__box"
      }),
      style: {
        "--il-lg-b": d.border
      }
    }));
  } else {
    items = Object.entries(__ds_scope.EDGES).map(([k, d]) => ({
      name: d.label,
      note: d.note,
      key: /*#__PURE__*/React.createElement(__ds_scope.Edge, {
        kind: k,
        width: 62,
        height: 14,
        idPrefix: `lg-${k}`
      }),
      style: undefined
    }));
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-legend ${className}`.trim()
  }, rest), /*#__PURE__*/React.createElement("p", {
    className: "il-legend__title"
  }, heading), /*#__PURE__*/React.createElement("div", {
    className: "il-legend__items",
    style: {
      gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`
    }
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    className: "il-legend__item",
    key: it.name,
    style: it.style
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-legend__key"
  }, it.key), /*#__PURE__*/React.createElement("span", {
    className: "il-legend__name"
  }, it.name, notes ? /*#__PURE__*/React.createElement("span", {
    className: "il-legend__note"
  }, " \xB7 ", it.note) : null)))));
}
Object.assign(__ds_scope, { Legend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/diagram/Legend.jsx", error: String((e && e.message) || e) }); }

// components/diagram/Timeline.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-timeline { display: grid; gap: 0; }
.il-timeline--h { grid-auto-flow: column; grid-auto-columns: 1fr; }
.il-timeline__step { position: relative; display: grid; gap: var(--sp-2); align-content: start; padding: var(--sp-4) var(--sp-4) var(--sp-4) 0; }
.il-timeline--h > .il-timeline__step + .il-timeline__step { border-left: var(--stroke-hair) solid var(--border-hair); padding-left: var(--sp-4); }
.il-timeline--v > .il-timeline__step { padding: 0 0 var(--sp-5) var(--sp-6); border-left: var(--stroke-hair) solid var(--border-hair); }
.il-timeline--v > .il-timeline__step:last-child { border-left-color: transparent; padding-bottom: 0; }
.il-timeline__n { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); color: var(--text-faint); }
.il-timeline--v .il-timeline__n { position: absolute; left: 0; transform: translateX(-50%); width: 1.5rem; height: 1.5rem; display: grid; place-items: center; background: var(--surface-page); border: var(--stroke-hair) solid var(--border-default); border-radius: var(--radius-round); }
.il-timeline__title { font-family: var(--font-sans); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); letter-spacing: var(--ls-heading); color: var(--text-heading); margin: 0; }
.il-timeline__body { font-size: var(--fs-caption); line-height: var(--lh-body); color: var(--text-muted); margin: 0; }
`;

/** An ordered sequence of states. The only sanctioned way to show a lifecycle. */
function Timeline({
  steps = [],
  orientation = "horizontal",
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-timeline-css", CSS);
  const h = orientation === "horizontal";
  return /*#__PURE__*/React.createElement("ol", _extends({
    className: `il-timeline il-timeline--${h ? "h" : "v"} ${className}`.trim(),
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0
    }
  }, rest), steps.map((s, i) => /*#__PURE__*/React.createElement("li", {
    className: "il-timeline__step",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-timeline__n"
  }, String(i + 1).padStart(2, "0")), s.state ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: s.state
  })) : null, s.title ? /*#__PURE__*/React.createElement("p", {
    className: "il-timeline__title"
  }, s.title) : null, s.body ? /*#__PURE__*/React.createElement("p", {
    className: "il-timeline__body"
  }, s.body) : null)));
}
Object.assign(__ds_scope, { Timeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/diagram/Timeline.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const KINDS = {
  note: {
    glyph: "\u2261",
    color: "var(--il-state-local)",
    label: "Note"
  },
  evidence: {
    glyph: "\u25A6",
    color: "var(--il-state-observed)",
    label: "Evidence"
  },
  constraint: {
    glyph: "\u2016",
    color: "var(--il-state-blocked)",
    label: "Constraint"
  },
  decision: {
    glyph: "\u2AFC",
    color: "var(--il-state-authorized)",
    label: "Decision"
  },
  hazard: {
    glyph: "\u2715",
    color: "var(--il-state-failed)",
    label: "Hazard"
  }
};
const CSS = `
.il-callout { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border: var(--stroke-hair) solid color-mix(in srgb, var(--il-co-c) var(--state-edge), transparent); border-left-width: var(--stroke-3); border-left-color: var(--il-co-c); border-radius: var(--radius-md); background: color-mix(in srgb, var(--il-co-c) 6%, var(--surface-card)); }
.il-callout__glyph { font-size: var(--fs-h4); line-height: 1.35; color: var(--il-co-c); }
.il-callout__label { display: block; font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--il-co-c); margin-bottom: var(--sp-1); }
.il-callout__body { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-body); }
.il-callout__body > :first-child { margin-top: 0; }
.il-callout__body > :last-child { margin-bottom: 0; }
`;

/** Aside. The kind names what the reader is being handed, not how to feel. */
function Callout({
  kind = "note",
  title,
  children,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-callout-css", CSS);
  const def = KINDS[kind] || KINDS.note;
  return /*#__PURE__*/React.createElement("aside", _extends({
    className: `il-callout ${className}`.trim(),
    style: {
      "--il-co-c": def.color
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "il-callout__glyph",
    "aria-hidden": "true"
  }, def.glyph), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "il-callout__label"
  }, title || def.label), /*#__PURE__*/React.createElement("div", {
    className: "il-callout__body"
  }, children)));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Callout.jsx", error: String((e && e.message) || e) }); }

// components/motion/phases.js
try { (() => {
/* Interlock motion — the canonical cadence.
   One timing table for every animated asset in the system. The five phases are
   the product model, not a style choice: independent trajectories, shared
   constraint detected, coupling at the boundary, authorization pause with a
   visible gate state change, synchronized passage. Durations come from
   tokens/motion.css and are repeated here in ms because JavaScript timers
   cannot read a CSS custom property.

   Nothing loops. Every asset built on this table ships a reduced-motion
   equivalent that carries the same information as a static composition. */

const PHASES = [{
  n: 1,
  id: "independent",
  name: "Independent trajectories",
  state: "LOCALLY VALID",
  dur: 560,
  body: "Four paths arrive in their own scopes, staggered by one step each. Each is valid where it lives. Nothing is coordinated yet.",
  reduced: "Stage 1 of the static strip."
}, {
  n: 2,
  id: "constraint",
  name: "Shared constraint detected",
  state: "LOCALLY VALID",
  dur: 340,
  body: "A dependency common to the paths is found in bound evidence. The boundary is drawn as an intent line: dashed, not yet binding.",
  reduced: "Stage 2 of the static strip."
}, {
  n: 3,
  id: "coupling",
  name: "Coupling at the boundary",
  state: "COUPLED",
  dur: 440,
  body: "The line goes solid and takes a bar at each end. The gate materialises closed. Neither side proceeds alone.",
  reduced: "Stage 3 of the static strip."
}, {
  n: 4,
  id: "authorization",
  name: "Authorization pause",
  state: "JOINT REVIEW",
  endState: "AUTHORIZED",
  dur: 1220,
  body: "700ms held with nothing moving, then the two leaves separate on the mechanical curve. The gate changes state before anything crosses it. This phase is the whole argument of the product and is never shortened.",
  reduced: "Stage 4 of the static strip, gate closed, held state visible."
}, {
  n: 5,
  id: "passage",
  name: "Synchronized passage",
  state: "EXECUTED",
  dur: 520,
  body: "Both pairs cross the open aperture in the same frame. Synchronised, not sequential: that is what coupling bought.",
  reduced: "Stage 5 of the static strip, gate open."
}];

/* The resting frame. Not a sixth state: the mark returns to canonical geometry
   with the gate closed, because the gate is closed by default and re-arms after
   passage. No asset rests in an opened or substituted state. */
const REST = {
  n: 6,
  id: "rest",
  name: "Canonical lockup",
  state: null,
  dur: 380,
  body: "The gate closes, the wordmark resolves, the mark rests in the frozen geometry of the primary lockup.",
  reduced: "The primary lockup, gate closed."
};
const FULL = [...PHASES, REST];
const TOTAL_MS = FULL.reduce((a, p) => a + p.dur, 0);

/* Card motion reuses the same vocabulary: staged reveal, felt hold, gate wipe. */
const CARD_IN = [{
  id: "frame",
  name: "Frame and rule",
  dur: 220
}, {
  id: "mark",
  name: "Mark",
  dur: 260
}, {
  id: "title",
  name: "Title",
  dur: 380
}, {
  id: "meta",
  name: "Subtitle and footer",
  dur: 220
}, {
  id: "hold",
  name: "Hold",
  dur: 700
}];
const CARD_OUT = {
  id: "wipe",
  name: "Gate wipe",
  dur: 520
};

/** True when the environment, or an explicit override, asks for reduced motion. */
function useReducedMotion(force = "auto") {
  const [pref, setPref] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setPref(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (force === "reduce") return true;
  if (force === "no-preference") return false;
  return pref;
}

/**
 * Steps once through `steps`, then stops. Phase 0 is the pre-roll frame;
 * phase i means step i has begun. Under reduced motion it resolves immediately
 * to the final phase and no timer is ever set.
 */
function useSequence(steps, {
  play = "auto",
  reduced = false,
  onComplete
} = {}) {
  const last = steps.length;
  const [phase, setPhase] = React.useState(reduced ? last : 0);
  const [run, setRun] = React.useState(0);
  React.useEffect(() => {
    if (reduced) {
      setPhase(last);
      return;
    }
    if (play === "hold") {
      setPhase(0);
      return;
    }
    if (play === "end") {
      setPhase(last);
      return;
    }
    setPhase(0);
    const timers = [];
    let t = 40;
    steps.forEach((s, i) => {
      timers.push(setTimeout(() => setPhase(i + 1), t));
      t += s.dur;
    });
    if (onComplete) timers.push(setTimeout(onComplete, t));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, reduced, play, last]);
  return {
    phase,
    run,
    replay: () => setRun(n => n + 1)
  };
}

/** Measures one element's width once per dependency change. */
function useWidth(ref, deps = []) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    if (ref.current) setW(ref.current.getBoundingClientRect().width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return w;
}

/* Layer staging shared by the title card and the end card. A layer is one of
   the scaffold's own regions; nothing here redraws scaffold geometry. */
const LAYER_CSS = `
.il-cardmo { position: relative; }
.il-cardmo .il-scaffold__top,
.il-cardmo .il-scaffold__title,
.il-cardmo .il-scaffold__sub,
.il-cardmo .il-scaffold__foot { transition: opacity var(--dur-base) var(--ease-enter), transform var(--dur-base) var(--ease-enter); }
.il-cardmo[data-r="0"] .il-scaffold__top,
.il-cardmo[data-r="0"] .il-scaffold__title, .il-cardmo[data-r="1"] .il-scaffold__title,
.il-cardmo[data-r="0"] .il-scaffold__sub, .il-cardmo[data-r="1"] .il-scaffold__sub, .il-cardmo[data-r="2"] .il-scaffold__sub,
.il-cardmo[data-r="0"] .il-scaffold__foot, .il-cardmo[data-r="1"] .il-scaffold__foot, .il-cardmo[data-r="2"] .il-scaffold__foot, .il-cardmo[data-r="3"] .il-scaffold__foot { opacity: 0; transform: translateY(4px); }
.il-cardmo[data-r="0"] .il-scaffold__rule { transform: scaleX(0); }
.il-cardmo .il-scaffold__rule { transform-origin: left center; transition: transform var(--dur-slow) var(--ease-standard); }
`;
Object.assign(__ds_scope, { PHASES, REST, FULL, TOTAL_MS, CARD_IN, CARD_OUT, useReducedMotion, useSequence, useWidth, LAYER_CSS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/motion/phases.js", error: String((e && e.message) || e) }); }

// components/motion/GateStinger.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Quadrant table: where each canonical arm comes from, and where it goes when
   the aperture opens. Offsets are in the mark's own 48-unit grid. */
const Q = [{
  k: "tl",
  ax: -6,
  ay: -6,
  px: 3,
  py: 3
}, {
  k: "tr",
  ax: 6,
  ay: -6,
  px: -3,
  py: 3
}, {
  k: "bl",
  ax: -6,
  ay: 6,
  px: 3,
  py: -3
}, {
  k: "br",
  ax: 6,
  ay: 6,
  px: -3,
  py: -3
}];
const CSS = `
.il-sting { display: inline-grid; justify-items: center; gap: var(--sp-5); color: var(--text-heading); }
.il-sting__row { position: relative; display: flex; align-items: center; transition: transform var(--dur-slow) var(--ease-standard); }
.il-sting__mark { display: block; flex: none; overflow: visible; transition: transform var(--dur-slow) var(--ease-standard); }
.il-sting__word { font-family: var(--font-sans); font-weight: var(--fw-medium); letter-spacing: var(--ls-display); line-height: 1; white-space: pre; transition: opacity var(--dur-base) var(--ease-enter), transform var(--dur-slow) var(--ease-standard); }
.il-sting__word[data-s="out"] { opacity: 0; transform: translateX(8px); }
.il-sting__arm { transition: transform var(--dur-slow) var(--ease-enter), opacity var(--dur-slow) var(--ease-enter); }
.il-sting__arm[data-s="pre"] { opacity: 0; }
.il-sting__arm[data-s="pass"] { transition-duration: var(--dur-gate); transition-timing-function: var(--ease-mech); }
.il-sting__axis { stroke: currentColor; stroke-width: 1; transform-origin: 24px 24px; transition: opacity var(--dur-fast) linear, transform var(--dur-base) var(--ease-standard), stroke-width var(--dur-fast) linear; }
.il-sting__axis[data-s="off"] { opacity: 0; transform: scaleY(0); transition-duration: var(--dur-slow); }
.il-sting__axis[data-s="intent"] { stroke-dasharray: 5 4; opacity: 0.45; }
.il-sting__axis[data-s="coupling"] { stroke-dasharray: none; stroke-width: 1.5; opacity: 0.9; }
.il-sting__bar { transition: opacity var(--dur-fast) linear; }
.il-sting__bar[data-s="off"] { opacity: 0; }
.il-sting__leaf { transition: transform var(--dur-gate) var(--ease-mech), opacity var(--dur-fast) linear; }
.il-sting__leaf[data-s="off"] { opacity: 0; }
.il-sting__leaf[data-s="open"] { transition-delay: var(--dur-hold); }
.il-sting__leaf--l[data-s="open"] { transform: translateX(-1.6px); }
.il-sting__leaf--r[data-s="open"] { transform: translateX(1.6px); }
.il-sting__late { opacity: 0; animation: il-appear var(--dur-fast) linear var(--dur-hold) forwards; }
.il-sting__chips { display: flex; align-items: center; gap: var(--sp-2); }
.il-sting__note { display: grid; justify-items: center; gap: var(--sp-2); text-align: center; }
.il-sting__lab { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-muted); }
.il-sting__body { font-size: var(--fs-caption); line-height: 1.5; color: var(--text-muted); margin: 0; max-width: 46ch; text-wrap: pretty; }
.il-sting__static { display: grid; justify-items: center; gap: var(--sp-6); }
@media (prefers-reduced-motion: reduce) {
  .il-sting__row, .il-sting__mark, .il-sting__word, .il-sting__arm, .il-sting__axis, .il-sting__bar, .il-sting__leaf { transition: none !important; }
}
`;

/**
 * The logo stinger. One pass through the five-state model on the canonical
 * geometry, resolving to the primary lockup with the gate closed. It never
 * loops and it never rests in an opened or substituted state.
 *
 * `device` runs the rejected `Inter [mark] lock` sequence as a motion device:
 * legal for the video opener only, because it resolves to the canonical lockup.
 * Under reduced motion the component renders the static five-stage strip
 * instead of stepping through frames.
 */
function GateStinger({
  size = 96,
  variant = "horizontal",
  // horizontal | symbol
  device = false,
  play = "auto",
  // auto | hold | end
  annotate = false,
  control = false,
  reducedMotion = "auto",
  // auto | reduce | no-preference
  onComplete,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-sting-css", CSS);
  const reduced = __ds_scope.useReducedMotion(reducedMotion);
  const {
    phase,
    replay
  } = __ds_scope.useSequence(__ds_scope.FULL, {
    play,
    reduced,
    onComplete
  });
  const showWord = variant !== "symbol";
  const useDevice = device && showWord;
  const wordRef = React.useRef(null);
  const interRef = React.useRef(null);
  const lockRef = React.useRef(null);
  const wordW = __ds_scope.useWidth(wordRef, [size, useDevice]);
  const interW = __ds_scope.useWidth(interRef, [size, useDevice]);
  const lockW = __ds_scope.useWidth(lockRef, [size, useDevice]);
  const atRest = phase >= __ds_scope.FULL.length;
  const wordSize = size * 0.71;
  const G = size * 0.29; // canonical lockup gap
  const g = size * 0.22; // device gap, either side of the substituted mark
  const M = size;
  if (reduced) {
    return /*#__PURE__*/React.createElement("div", _extends({
      className: `il-sting__static ${className}`.trim(),
      "data-il-static": "true"
    }, rest), /*#__PURE__*/React.createElement(__ds_scope.Logo, {
      variant: variant === "symbol" ? "symbol" : "horizontal",
      size: size,
      gate: "closed"
    }), /*#__PURE__*/React.createElement(__ds_scope.GateSequence, {
      size: Math.max(28, size * 0.4),
      labels: annotate
    }));
  }
  const armState = phase === 0 ? "pre" : phase === 5 ? "pass" : "rest";
  const axisState = phase < 2 ? "off" : phase >= 6 ? "off" : phase < 3 ? "intent" : "coupling";
  const barState = phase < 3 || phase >= 6 ? "off" : "on";
  const leafState = phase < 3 ? "off" : phase < 4 ? "closed" : phase < 6 ? "open" : "closed";
  const step = phase === 0 ? __ds_scope.PHASES[0] : __ds_scope.FULL[Math.min(phase, __ds_scope.FULL.length) - 1];
  let rowShift = 0;
  let markShift = 0;
  let interShift = 0;
  let lockShift = 0;
  if (useDevice) {
    const T = interW + g + M + g + lockW;
    const Tf = M + G + interW + lockW;
    rowShift = atRest ? (T - Tf) / 2 : 0;
    markShift = atRest ? -(interW + g) : 0;
    interShift = atRest ? M + G : 0;
    lockShift = atRest ? G - 2 * g : 0;
  } else if (showWord) {
    rowShift = atRest ? 0 : (wordW + G) / 2;
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-sting ${className}`.trim(),
    "data-il-motion": "run",
    "data-phase": phase
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "il-sting__row",
    style: {
      transform: `translateX(${rowShift}px)`,
      gap: useDevice ? g : showWord ? G : 0
    }
  }, useDevice ? /*#__PURE__*/React.createElement("span", {
    ref: interRef,
    className: "il-sting__word",
    "data-s": "in",
    style: {
      fontSize: wordSize,
      transform: `translateX(${interShift}px)`
    }
  }, "Inter") : null, /*#__PURE__*/React.createElement(Mark, {
    size: size,
    phase: phase,
    armState: armState,
    axisState: axisState,
    barState: barState,
    leafState: leafState,
    style: {
      transform: `translateX(${markShift}px)`
    }
  }), useDevice ? /*#__PURE__*/React.createElement("span", {
    ref: lockRef,
    className: "il-sting__word",
    "data-s": "in",
    style: {
      fontSize: wordSize,
      transform: `translateX(${lockShift}px)`
    }
  }, "lock") : null, showWord && !useDevice ? /*#__PURE__*/React.createElement("span", {
    ref: wordRef,
    className: "il-sting__word",
    "data-s": atRest ? "in" : "out",
    style: {
      fontSize: wordSize
    }
  }, "Interlock") : null), annotate ? /*#__PURE__*/React.createElement("div", {
    className: "il-sting__note"
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-sting__lab"
  }, String(step.n).padStart(2, "0"), " \xB7 ", step.name), step.state ? /*#__PURE__*/React.createElement("span", {
    className: "il-sting__chips"
  }, /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: step.state
  }), step.endState ? /*#__PURE__*/React.createElement("span", {
    className: "il-sting__late"
  }, /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: step.endState
  })) : null) : null, /*#__PURE__*/React.createElement("p", {
    className: "il-sting__body"
  }, step.body)) : null, control ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: replay,
    style: {
      font: "inherit",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-micro)",
      letterSpacing: "var(--ls-label)",
      textTransform: "uppercase",
      padding: "4px 10px",
      background: "transparent",
      color: "var(--text-muted)",
      border: "1px solid var(--border-hair)",
      borderRadius: "var(--radius-sm)",
      cursor: "pointer"
    }
  }, "Replay") : null);
}

/* The canonical mark, animated. Geometry comes from Logo, never from here. */
function Mark({
  size,
  phase,
  armState = "rest",
  axisState = "coupling",
  barState = "on",
  leafState = "closed",
  style
}) {
  const {
    ARMS,
    LEAF_L,
    LEAF_R
  } = __ds_scope.LOGO_GEOMETRY;
  return /*#__PURE__*/React.createElement("svg", {
    className: "il-sting__mark",
    viewBox: "0 0 48 48",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true",
    style: style
  }, /*#__PURE__*/React.createElement("line", {
    className: "il-sting__axis",
    x1: "24",
    y1: "7",
    x2: "24",
    y2: "41",
    "data-s": axisState
  }), /*#__PURE__*/React.createElement("rect", {
    className: "il-sting__bar",
    "data-s": barState,
    x: "21.5",
    y: "6.4",
    width: "5",
    height: "1.4"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "il-sting__bar",
    "data-s": barState,
    x: "21.5",
    y: "40.2",
    width: "5",
    height: "1.4"
  }), ARMS.map((d, i) => /*#__PURE__*/React.createElement("path", {
    key: Q[i].k,
    className: "il-sting__arm",
    "data-s": armState,
    d: d,
    style: {
      transform: armState === "pre" ? `translate(${Q[i].ax}px, ${Q[i].ay}px)` : armState === "pass" ? `translate(${Q[i].px}px, ${Q[i].py}px)` : "none",
      transitionDelay: phase === 1 ? `${i * 90}ms` : "0ms"
    }
  })), /*#__PURE__*/React.createElement("path", {
    className: "il-sting__leaf il-sting__leaf--l",
    "data-s": leafState,
    d: LEAF_L
  }), /*#__PURE__*/React.createElement("path", {
    className: "il-sting__leaf il-sting__leaf--r",
    "data-s": leafState,
    d: LEAF_R
  }));
}
const STINGER_PHASES = [...__ds_scope.PHASES, __ds_scope.REST];
Object.assign(__ds_scope, { GateStinger, STINGER_PHASES });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/motion/GateStinger.jsx", error: String((e && e.message) || e) }); }

// components/motion/MotionSpec.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.il-mspec { display: grid; gap: var(--sp-3); font-family: var(--font-sans); }
.il-mspec__head, .il-mspec__row { display: grid; grid-template-columns: 2.5rem minmax(11rem, 1.1fr) 8.5rem minmax(9rem, 1fr) 4.5rem; gap: var(--sp-4); align-items: baseline; }
.il-mspec__head { font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); padding-bottom: var(--sp-2); border-bottom: var(--stroke-2) solid var(--border-ink); }
.il-mspec__row { padding: var(--sp-3) 0; border-bottom: var(--stroke-hair) solid var(--border-hair); }
.il-mspec__n { font-family: var(--font-mono); font-size: var(--fs-caption); color: var(--text-faint); }
.il-mspec__name { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-heading); letter-spacing: var(--ls-heading); }
.il-mspec__body { font-size: var(--fs-micro); line-height: 1.5; color: var(--text-muted); margin: var(--sp-1) 0 0; text-wrap: pretty; }
.il-mspec__bar { height: 6px; background: var(--il-n-99); }
:root[data-theme="dark"] .il-mspec__bar { background: var(--il-n-05); }
.il-mspec__track { display: grid; gap: var(--sp-1); }
.il-mspec__ms { font-family: var(--font-mono); font-size: var(--fs-micro); color: var(--text-muted); }
.il-mspec__red { font-family: var(--font-mono); font-size: var(--fs-micro); line-height: 1.5; color: var(--text-muted); }
.il-mspec__total { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--text-faint); padding-top: var(--sp-2); }
`;

/**
 * The motion cadence, stated as a table. Every animated asset in the system is
 * built on these six rows, so a reviewer can check a video against the spec
 * rather than against taste. Durations are the ms values of the motion tokens.
 */
function MotionSpec({
  compact = false,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-mspec-css", CSS);
  const max = Math.max(...__ds_scope.FULL.map(p => p.dur));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-mspec ${className}`.trim()
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "il-mspec__head"
  }, /*#__PURE__*/React.createElement("span", null, "#"), /*#__PURE__*/React.createElement("span", null, "Phase"), /*#__PURE__*/React.createElement("span", null, "State"), /*#__PURE__*/React.createElement("span", null, "Duration"), /*#__PURE__*/React.createElement("span", null, "Static")), __ds_scope.FULL.map(p => /*#__PURE__*/React.createElement("div", {
    className: "il-mspec__row",
    key: p.id
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__n"
  }, String(p.n).padStart(2, "0")), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__name"
  }, p.name), compact ? null : /*#__PURE__*/React.createElement("p", {
    className: "il-mspec__body"
  }, p.body)), /*#__PURE__*/React.createElement("span", null, p.state ? /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: p.state
  }) : /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__ms"
  }, "rest"), p.endState ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StateChip, {
    state: p.endState
  })) : null), /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__bar",
    style: {
      width: `${p.dur / max * 100}%`
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__ms"
  }, p.dur, "ms")), /*#__PURE__*/React.createElement("span", {
    className: "il-mspec__red"
  }, p.n <= 5 ? `stage ${p.n}/5` : "lockup"))), /*#__PURE__*/React.createElement("div", {
    className: "il-mspec__total"
  }, /*#__PURE__*/React.createElement("span", null, "One pass, no loop"), /*#__PURE__*/React.createElement("span", null, (__ds_scope.TOTAL_MS / 1000).toFixed(2), "s total")));
}
Object.assign(__ds_scope, { MotionSpec });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/motion/MotionSpec.jsx", error: String((e && e.message) || e) }); }

// components/scaffolds/Scaffold.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Fixed export geometries. Every judge-facing surface starts from one of
   these so nothing is composed ad hoc at the wrong aspect ratio. */
const PRESETS = {
  "readme-hero": {
    w: 1280,
    h: 400,
    pad: 64,
    logo: 56,
    title: 52,
    kind: "wide"
  },
  "og": {
    w: 1200,
    h: 630,
    pad: 80,
    logo: 64,
    title: 74,
    kind: "card"
  },
  "devpost": {
    w: 1200,
    h: 675,
    pad: 80,
    logo: 64,
    title: 78,
    kind: "card"
  },
  "video-title": {
    w: 1920,
    h: 1080,
    pad: 128,
    logo: 96,
    title: 116,
    kind: "card"
  },
  "video-end": {
    w: 1920,
    h: 1080,
    pad: 128,
    logo: 112,
    title: 84,
    kind: "end"
  },
  "social": {
    w: 1080,
    h: 1080,
    pad: 88,
    logo: 64,
    title: 78,
    kind: "card"
  }
};
const CSS = `
.il-scaffold { position: relative; display: grid; box-sizing: border-box; overflow: hidden; background: var(--surface-page); color: var(--text-heading); font-family: var(--font-sans); }
.il-scaffold[data-tone="ink"] { background: var(--il-n-99); color: var(--il-n-05); }
.il-scaffold[data-tone="paper"] { background: var(--il-paper); color: var(--il-n-99); }
.il-scaffold__grid { position: absolute; inset: 0; background-image: var(--grid-fine); opacity: var(--grid-fine-opacity); pointer-events: none; }
.il-scaffold__inner { position: relative; display: grid; align-content: space-between; height: 100%; }
.il-scaffold__top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-5); }
.il-scaffold__eyebrow { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: var(--ls-label); opacity: 0.55; }
.il-scaffold__title { font-weight: var(--fw-medium); letter-spacing: var(--ls-display); line-height: var(--lh-display); margin: 0; text-wrap: balance; }
.il-scaffold__sub { line-height: 1.35; opacity: 0.62; margin: 0; max-width: 34ch; }
.il-scaffold__foot { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-5); font-family: var(--font-mono); opacity: 0.5; }
.il-scaffold__rule { height: 2px; background: currentColor; opacity: 0.9; }
.il-scaffold--end .il-scaffold__inner { justify-items: center; align-content: center; text-align: center; gap: var(--sp-6); }
`;

/**
 * A fixed-geometry export frame. Preset sets the pixel size, padding and
 * type scale; everything inside is ordinary design-system markup, so the
 * frame never invents its own rules.
 */
function Scaffold({
  preset = "og",
  tone = "paper",
  eyebrow,
  title,
  subtitle,
  footLeft,
  footRight,
  grid = true,
  children,
  scale = 1,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-scaffold-css", CSS);
  const p = PRESETS[preset] || PRESETS.og;
  const isEnd = p.kind === "end";
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-scaffold ${isEnd ? "il-scaffold--end" : ""} ${className}`.trim(),
    "data-tone": tone,
    "data-preset": preset,
    style: {
      width: p.w,
      height: p.h,
      padding: p.pad,
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: "top left"
    }
  }, rest), grid ? /*#__PURE__*/React.createElement("div", {
    className: "il-scaffold__grid"
  }) : null, /*#__PURE__*/React.createElement("div", {
    className: "il-scaffold__inner",
    style: {
      gap: p.pad * 0.5
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "il-scaffold__top"
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    variant: isEnd ? "stacked" : "horizontal",
    size: p.logo,
    gate: isEnd ? "open" : "closed"
  }), eyebrow ? /*#__PURE__*/React.createElement("span", {
    className: "il-scaffold__eyebrow",
    style: {
      fontSize: p.logo * 0.24
    }
  }, eyebrow) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: p.pad * 0.28,
      justifyItems: isEnd ? "center" : "start"
    }
  }, title ? /*#__PURE__*/React.createElement("h1", {
    className: "il-scaffold__title",
    style: {
      fontSize: p.title
    }
  }, title) : null, subtitle ? /*#__PURE__*/React.createElement("p", {
    className: "il-scaffold__sub",
    style: {
      fontSize: p.title * 0.32
    }
  }, subtitle) : null, children), /*#__PURE__*/React.createElement("div", {
    className: "il-scaffold__foot",
    style: {
      fontSize: p.logo * 0.22
    }
  }, /*#__PURE__*/React.createElement("span", null, footLeft), /*#__PURE__*/React.createElement("span", null, footRight))));
}
Object.assign(__ds_scope, { PRESETS, Scaffold });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/scaffolds/Scaffold.jsx", error: String((e && e.message) || e) }); }

// components/motion/EndCardMotion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* The end card is the one surface where the gate is allowed to rest open,
   because by then something has actually been authorized and executed. The
   opening is held first: the pause is the point. */
const STEPS = [{
  id: "frame",
  name: "Frame",
  dur: 220
}, {
  id: "mark",
  name: "Stacked mark, gate closed",
  dur: 300
}, {
  id: "gate",
  name: "Hold, then the gate opens",
  dur: 1220
}, {
  id: "title",
  name: "Closing line",
  dur: 380
}, {
  id: "meta",
  name: "Next step and receipt",
  dur: 260
}];
const CSS = `${__ds_scope.LAYER_CSS}
.il-ecm { display: block; overflow: hidden; }
.il-ecm[data-r="0"] .il-logo[data-gate="open"] .il-logo__leaf--l,
.il-ecm[data-r="1"] .il-logo[data-gate="open"] .il-logo__leaf--l,
.il-ecm[data-r="0"] .il-logo[data-gate="open"] .il-logo__leaf--r,
.il-ecm[data-r="1"] .il-logo[data-gate="open"] .il-logo__leaf--r { transform: none; }
.il-ecm .il-logo__leaf { transition-delay: var(--dur-hold); }
@media (prefers-reduced-motion: reduce) { .il-ecm .il-logo__leaf { transition: none !important; transition-delay: 0ms !important; } }
`;

/**
 * End-card motion. The stacked lockup arrives with the gate closed, the pause
 * is held, the gate opens on the mechanical curve, and only then does the
 * closing line resolve. Nothing loops; the card holds its final frame.
 *
 * Under reduced motion the card renders assembled, gate open, in one frame.
 */
function EndCardMotion({
  preset = "video-end",
  tone = "ink",
  eyebrow,
  title,
  subtitle,
  footLeft,
  footRight,
  play = "auto",
  reducedMotion = "auto",
  onComplete,
  scale = 1,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-ecm-css", CSS);
  const reduced = __ds_scope.useReducedMotion(reducedMotion);
  const {
    phase
  } = __ds_scope.useSequence(STEPS, {
    play,
    reduced,
    onComplete
  });
  const p = __ds_scope.PRESETS[preset] || __ds_scope.PRESETS["video-end"];
  const reveal = reduced ? STEPS.length : Math.min(phase, STEPS.length);
  /* Map the end card's own step list onto the shared layer-reveal scale. */
  const dataR = reveal === 0 ? 0 : reveal <= 3 ? 1 : reveal === 4 ? 2 : 4;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-cardmo il-ecm ${className}`.trim(),
    "data-il-motion": "run",
    "data-r": dataR,
    style: {
      width: p.w,
      height: p.h,
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: "top left"
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Scaffold, {
    preset: preset,
    tone: tone,
    eyebrow: eyebrow,
    title: title,
    subtitle: subtitle,
    footLeft: footLeft,
    footRight: footRight
  }));
}
const END_CARD_STEPS = STEPS;
Object.assign(__ds_scope, { EndCardMotion, END_CARD_STEPS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/motion/EndCardMotion.jsx", error: String((e && e.message) || e) }); }

// components/motion/TitleCardMotion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `${__ds_scope.LAYER_CSS}
.il-tcm { display: block; overflow: hidden; }
.il-tcm__half { position: absolute; inset: 0; transition: transform var(--dur-gate) var(--ease-mech); }
.il-tcm__half--l { clip-path: inset(0 50% 0 0); }
.il-tcm__half--r { clip-path: inset(0 0 0 50%); }
.il-tcm[data-wipe="out"] .il-tcm__half--l { transform: translateX(-100%); }
.il-tcm[data-wipe="out"] .il-tcm__half--r { transform: translateX(100%); }
.il-tcm__behind { position: absolute; inset: 0; display: grid; place-items: center; }
@media (prefers-reduced-motion: reduce) { .il-tcm__half { transition: none !important; } }
`;
const STEPS = [...__ds_scope.CARD_IN, __ds_scope.CARD_OUT];

/**
 * The title-card transition. The card assembles one layer at a time on the
 * standard stage cadence, holds for the felt pause, then leaves through a gate
 * wipe: the frame splits at the aperture line and the two halves travel out on
 * the mechanical curve, exactly as the gate leaves do.
 *
 * Under reduced motion the card renders once, assembled, and does not wipe.
 */
function TitleCardMotion({
  preset = "video-title",
  tone = "paper",
  eyebrow,
  title,
  subtitle,
  footLeft,
  footRight,
  behind,
  exit = true,
  play = "auto",
  reducedMotion = "auto",
  onComplete,
  scale = 1,
  className = "",
  ...rest
}) {
  __ds_scope.useInjectedStyles("il-tcm-css", CSS);
  const reduced = __ds_scope.useReducedMotion(reducedMotion);
  const steps = exit ? STEPS : __ds_scope.CARD_IN;
  const {
    phase
  } = __ds_scope.useSequence(steps, {
    play,
    reduced,
    onComplete
  });
  const reveal = reduced ? __ds_scope.CARD_IN.length : Math.min(phase, __ds_scope.CARD_IN.length);
  const dataR = reduced ? __ds_scope.CARD_IN.length : Math.max(0, reveal - 1);
  const wiping = exit && !reduced && phase > __ds_scope.CARD_IN.length;
  const card = /*#__PURE__*/React.createElement(__ds_scope.Scaffold, {
    preset: preset,
    tone: tone,
    eyebrow: eyebrow,
    title: title,
    subtitle: subtitle,
    footLeft: footLeft,
    footRight: footRight
  });
  const p = __ds_scope.PRESETS[preset] || __ds_scope.PRESETS["video-title"];
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `il-cardmo il-tcm ${className}`.trim(),
    "data-il-motion": "run",
    "data-r": dataR,
    "data-wipe": wiping ? "out" : "in",
    style: {
      width: p.w,
      height: p.h,
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: "top left"
    }
  }, rest), behind ? /*#__PURE__*/React.createElement("div", {
    className: "il-tcm__behind"
  }, behind) : null, /*#__PURE__*/React.createElement("div", {
    className: "il-tcm__half il-tcm__half--l"
  }, card), /*#__PURE__*/React.createElement("div", {
    className: "il-tcm__half il-tcm__half--r",
    "aria-hidden": "true"
  }, card));
}
const TITLE_CARD_STEPS = STEPS;
Object.assign(__ds_scope, { TitleCardMotion, TITLE_CARD_STEPS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/motion/TitleCardMotion.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/DocsScreen.jsx
try { (() => {
// Docs reading view — the Spec page: sidebar + prose + right TOC.
function DocsScreen() {
  const {
    CodeBlock,
    Callout,
    ComparisonTable,
    Badge
  } = window.WorkspaceJsonDesignSystem_b8d83c;
  const nav = [["Start", ["Getting Started"]], ["Reference", ["Spec v0.4", "Examples", "Audit CLI", "Ecosystem"]], ["About", ["Governance", "Changelog", "FAQ"]]];
  const toc = ["Introduction", "File location", "Schema", "Stability", "Security"];
  const minimal = `{
  "manual": {},
  "generated": {
    "specVersion": "0.4",
    "generatedAt": "2026-06-02T00:00:00.000Z",
    "by": { "name": "your-tool", "version": "1.0.0" }
  },
  "agents": {},
  "health": {}
}`;
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-docs"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "wjk-sidebar"
  }, nav.map(([group, items]) => /*#__PURE__*/React.createElement("div", {
    className: "wjk-sidebar__group",
    key: group
  }, /*#__PURE__*/React.createElement("p", {
    className: "wjk-sidebar__head"
  }, group), items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it,
    href: "#",
    className: "wjk-sidebar__link" + (it === "Spec v0.4" ? " is-active" : "")
  }, it))))), /*#__PURE__*/React.createElement("article", {
    className: "wjk-article"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-breadcrumb"
  }, "workspace.json ", /*#__PURE__*/React.createElement("span", null, "/"), " Specification v0.4"), /*#__PURE__*/React.createElement("h1", {
    className: "wjk-h1"
  }, "workspace.json v0.4 Specification"), /*#__PURE__*/React.createElement(Callout, {
    type: "quote"
  }, "Version v0.4 \xB7 Status: Active \xB7 License: Apache 2.0 \xB7 Proposed: AAIF"), /*#__PURE__*/React.createElement("p", {
    className: "wjk-lead"
  }, "This document specifies workspace.json v0.4, a JSON file format for structured codebase intelligence consumed by AI coding agents. Where AGENTS.md addresses the prescriptive layer, workspace.json addresses the descriptive layer."), /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2",
    id: "rel"
  }, "1.2 Relationship to AGENTS.md"), /*#__PURE__*/React.createElement("p", null, "AGENTS.md and workspace.json address complementary concerns:"), /*#__PURE__*/React.createElement(ComparisonTable, {
    columns: ["", "AGENTS.md", "workspace.json"],
    rows: [{
      label: "Layer",
      cells: ["Prescriptive", "Descriptive"]
    }, {
      label: "Authored by",
      cells: ["Humans", "Tooling"]
    }, {
      label: "Content type",
      cells: ["Prose instructions", "Structured data"]
    }, {
      label: "Machine-generated",
      cells: [false, true]
    }]
  }), /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2",
    id: "loc"
  }, "2.1 Default Location"), /*#__PURE__*/React.createElement("p", null, "The canonical location for workspace.json is ", /*#__PURE__*/React.createElement("code", null, ".agents/workspace.json"), ", relative to the repository root."), /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2",
    id: "min"
  }, "6.1 Minimal Valid File"), /*#__PURE__*/React.createElement("p", null, "All four top-level sections are required. ", /*#__PURE__*/React.createElement("code", null, "manual"), ", ", /*#__PURE__*/React.createElement("code", null, "agents"), ", and ", /*#__PURE__*/React.createElement("code", null, "health"), " may be empty objects."), /*#__PURE__*/React.createElement(CodeBlock, {
    lang: "json",
    title: ".agents/workspace.json",
    code: minimal
  }), /*#__PURE__*/React.createElement(Callout, {
    type: "danger",
    title: "Never commit these"
  }, "Secrets or credentials, PII, content snippets, and absolute paths MUST NOT appear in workspace.json. Generators MUST enforce these exclusions."), /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2",
    id: "stab"
  }, "4. Stability Annotations"), /*#__PURE__*/React.createElement("p", null, "Fields carry one of three stability markers: ", /*#__PURE__*/React.createElement(Badge, {
    variant: "stable"
  }, "stable"), " ", /*#__PURE__*/React.createElement(Badge, {
    variant: "experimental"
  }, "experimental"), " ", /*#__PURE__*/React.createElement(Badge, {
    variant: "danger"
  }, "deprecated")), /*#__PURE__*/React.createElement(Callout, {
    type: "tip"
  }, "Run ", /*#__PURE__*/React.createElement("code", null, "npx agents-audit --json"), " for machine-readable output.")), /*#__PURE__*/React.createElement("nav", {
    className: "wjk-toc"
  }, /*#__PURE__*/React.createElement("p", {
    className: "wjk-toc__head"
  }, "On this page"), toc.map((t, i) => /*#__PURE__*/React.createElement("a", {
    key: t,
    href: "#",
    className: "wjk-toc__link" + (i === 1 ? " is-active" : "")
  }, t))));
}
window.DocsScreen = DocsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/DocsScreen.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/ExamplesScreen.jsx
try { (() => {
// Examples screen — tabbed workspace.json samples.
function ExamplesScreen() {
  const {
    CodeBlock,
    Badge
  } = window.WorkspaceJsonDesignSystem_b8d83c;
  const tabs = [{
    label: "TypeScript Monorepo",
    desc: "A large TypeScript monorepo with pnpm workspaces and mixed runtime targets. The frameworkManifest shows both Next.js (web) and Hono (API).",
    code: `{
  "manual": {
    "description": "TypeScript monorepo: web dashboard, API server, shared packages.",
    "techStack": ["TypeScript", "Next.js 15", "Hono", "Drizzle ORM"],
    "fragileFiles": [
      { "path": "packages/contracts/src/index.ts",
        "reason": "Shared types. Changes cascade to all consumers." }
    ]
  },
  "generated": {
    "specVersion": "0.4",
    "by": { "name": "agents-audit", "version": "0.6.2" },
    "fragility": [
      { "file": "packages/contracts/src/index.ts", "fragilityScore": 0.81 }
    ]
  },
  "agents": { "primaryAgentFile": "AGENTS.md" },
  "health": { "intelligenceState": "CONFIDENT", "codebaseHealth": 0.81 }
}`
  }, {
    label: "Python Package",
    desc: "A pure Python library with pytest and mypy. The generator has fewer signals than a TS monorepo, so the manual section carries more weight.",
    code: `{
  "manual": {
    "description": "Pure Python library for structured data validation.",
    "techStack": ["Python 3.11+", "pytest", "mypy", "Hatch"],
    "conventions": ["mypy strict mode enforced in CI"]
  },
  "generated": {
    "specVersion": "0.4",
    "by": { "name": "agents-audit", "version": "0.6.2" },
    "frameworkManifest": [{ "name": "pytest", "version": "8.1.2" }]
  },
  "agents": { "primaryAgentFile": "AGENTS.md" },
  "health": { "intelligenceState": "OBSERVING", "confidence": 0.61 }
}`
  }, {
    label: "Polyglot Repo",
    desc: "A Rust CLI plus a TypeScript web frontend under one root. frameworkManifest lists frameworks from both ecosystems.",
    code: `{
  "manual": {
    "description": "Polyglot: Rust CLI tool + TypeScript web frontend.",
    "techStack": ["Rust", "TypeScript", "React", "Vite"],
    "coChangePatterns": [
      { "files": ["schema/event.json", "src/cli/src/event.rs", "web/src/types/event.ts"],
        "note": "Schema changes require simultaneous Rust and TS updates." }
    ]
  },
  "generated": {
    "specVersion": "0.4",
    "by": { "name": "agents-audit", "version": "0.6.2" }
  },
  "agents": { "primaryAgentFile": "AGENTS.md" },
  "health": { "intelligenceState": "CONFIDENT", "codebaseHealth": 0.72 }
}`
  }];
  const [active, setActive] = React.useState(0);
  const t = tabs[active];
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-shell wjk-examples"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-page-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wjk-eyebrow"
  }, "Reference"), /*#__PURE__*/React.createElement("h1", {
    className: "wjk-h1"
  }, "Examples"), /*#__PURE__*/React.createElement("p", {
    className: "wjk-lead"
  }, "Three workspace.json examples, synthesized from real open-source repository structures.")), /*#__PURE__*/React.createElement("div", {
    className: "wjk-tabs"
  }, tabs.map((tab, i) => /*#__PURE__*/React.createElement("button", {
    key: tab.label,
    type: "button",
    className: "wjk-tab" + (i === active ? " is-active" : ""),
    onClick: () => setActive(i)
  }, tab.label))), /*#__PURE__*/React.createElement("p", {
    className: "wjk-example-desc"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "neutral",
    dot: true
  }, "synthesized"), " ", t.desc), /*#__PURE__*/React.createElement(CodeBlock, {
    lang: "json",
    title: ".agents/workspace.json",
    code: t.code
  }));
}
window.ExamplesScreen = ExamplesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/ExamplesScreen.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/Footer.jsx
try { (() => {
// Site footer — three link columns + attribution, per workspacejson.dev.
function Footer() {
  const cols = [["About", ["Overview", "Governance", "Changelog", "License (Apache 2.0)"]], ["Resources", ["Spec", "Audit Tool", "Examples", "FAQ"]], ["Project", ["GitHub", "npm: agents-audit", "npm: @workspacejson/spec", "npm: @workspacejson/rules"]]];
  return /*#__PURE__*/React.createElement("footer", {
    className: "wjk-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-footer__cols"
  }, cols.map(([title, items]) => /*#__PURE__*/React.createElement("div", {
    className: "wjk-footer__col",
    key: title
  }, /*#__PURE__*/React.createElement("p", {
    className: "wjk-footer__head"
  }, title), /*#__PURE__*/React.createElement("ul", null, items.map(it => /*#__PURE__*/React.createElement("li", {
    key: it
  }, /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, it))))))), /*#__PURE__*/React.createElement("p", {
    className: "wjk-footer__note"
  }, "The specification is maintained in public and authored by the team at", " ", /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "vreko.dev"), ". workspace.json is licensed under Apache 2.0 and proposed for AAIF donation."));
}
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/Footer.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/GettingStartedScreen.jsx
try { (() => {
// Getting Started screen — numbered steps with code, per the docs.
function GettingStartedScreen() {
  const {
    CodeBlock,
    Callout,
    Button
  } = window.WorkspaceJsonDesignSystem_b8d83c;
  const steps = [{
    n: 1,
    title: "Install agents-audit",
    body: "No installation required. Run directly with npx.",
    code: "npx agents-audit",
    lang: "bash"
  }, {
    n: 2,
    title: "Run your first audit",
    body: "From your repository root. It audits AGENTS.md even without workspace.json present.",
    code: "cd your-repo\nnpx agents-audit",
    lang: "bash"
  }, {
    n: 3,
    title: "Create a minimal workspace.json",
    body: "All four top-level sections are required; three may be empty.",
    code: `{
  "manual": {},
  "generated": {
    "specVersion": "0.4",
    "generatedAt": "2026-05-12T00:00:00.000Z",
    "by": { "name": "manual", "version": "0.0.0" }
  },
  "agents": {},
  "health": {}
}`,
    lang: "json"
  }, {
    n: 4,
    title: "Add CI validation",
    body: "The --fail-on=error flag makes the step a blocking gate.",
    code: `- name: Audit
  run: npx --yes agents-audit --fail-on=error`,
    lang: "bash"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-shell wjk-gs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-page-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wjk-eyebrow"
  }, "Start"), /*#__PURE__*/React.createElement("h1", {
    className: "wjk-h1"
  }, "Getting Started"), /*#__PURE__*/React.createElement("p", {
    className: "wjk-lead"
  }, "Add workspace.json to your repository, run your first audit, and validate it in CI.")), /*#__PURE__*/React.createElement(Callout, {
    type: "tip"
  }, /*#__PURE__*/React.createElement("b", null, "TL;DR"), ": run ", /*#__PURE__*/React.createElement("code", null, "npx agents-audit scan ."), " in your repository right now for a hygiene score."), /*#__PURE__*/React.createElement("div", {
    className: "wjk-steps"
  }, steps.map(s => /*#__PURE__*/React.createElement("div", {
    className: "wjk-step",
    key: s.n
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-step__num"
  }, s.n), /*#__PURE__*/React.createElement("div", {
    className: "wjk-step__body"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "wjk-h3"
  }, s.title), /*#__PURE__*/React.createElement("p", null, s.body), /*#__PURE__*/React.createElement(CodeBlock, {
    lang: s.lang,
    code: s.code,
    showDots: false,
    title: s.lang === "json" ? ".agents/workspace.json" : "terminal"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "wjk-gs-cta"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    href: "#"
  }, "Read the full v0.4 spec"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    href: "#"
  }, "See real examples")));
}
window.GettingStartedScreen = GettingStartedScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/GettingStartedScreen.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/Header.jsx
try { (() => {
// Shared header/nav for the workspace.json site.
function Header({
  current,
  onNav
}) {
  const links = [["spec", "Spec"], ["getting-started", "Getting Started"], ["examples", "Examples"], ["faq", "FAQ"]];
  return /*#__PURE__*/React.createElement("header", {
    className: "wjk-header"
  }, /*#__PURE__*/React.createElement("a", {
    className: "wjk-brand",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav("home");
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "wjk-brand__wm"
  }, "workspace", /*#__PURE__*/React.createElement("span", null, ".json"))), /*#__PURE__*/React.createElement("nav", {
    className: "wjk-nav"
  }, links.map(([id, label]) => /*#__PURE__*/React.createElement("a", {
    key: id,
    href: "#",
    className: "wjk-nav__link" + (current === id ? " is-active" : ""),
    onClick: e => {
      e.preventDefault();
      onNav(id);
    }
  }, label))), /*#__PURE__*/React.createElement("div", {
    className: "wjk-header__right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "wjk-search",
    type: "button"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wjk-search__icon"
  }, "\u2315"), /*#__PURE__*/React.createElement("span", null, "Search"), /*#__PURE__*/React.createElement("kbd", null, "\u2318K")), /*#__PURE__*/React.createElement("a", {
    className: "wjk-icon-link",
    href: "#",
    title: "GitHub",
    "aria-label": "GitHub"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    width: "18",
    height: "18",
    fill: "currentColor",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38l-.01-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.72-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
  })))));
}
window.Header = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/Header.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/HomeScreen.jsx
try { (() => {
// Home / splash screen — composes the DS Hero, TrustBar, Cards.
function HomeScreen({
  onNav
}) {
  const {
    Hero,
    TrustBar,
    Card,
    Button,
    Badge
  } = window.WorkspaceJsonDesignSystem_b8d83c;
  const features = [["Spec", "Clear boundaries for human and machine authored context.", "The spec separates manual guidance from generated intelligence so tools can reason about codebases without replacing the developer's instructions."], ["Schema", "Published JSON Schema with a stable validation contract.", "Integrations can validate structure, enforce required fields, and keep generated output aligned with the documented contract."], ["Audit", "Reference tooling for keeping repository context fresh.", "agents-audit checks for drift, stale references, and confidence signals so the documentation matches the codebase."]];
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-home"
  }, /*#__PURE__*/React.createElement(Hero, {
    eyebrow: "Open standard for agent context",
    title: "Structured codebase intelligence for AI agents.",
    lead: "workspace.json gives codebases a machine-readable layer of context so AI tools, CI, and contributors stay aligned with what is actually in the repository.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => onNav("spec")
    }, "Read the spec"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => onNav("examples")
    }, "See examples"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => onNav("getting-started")
    }, "Inspect the audit tool")),
    footnote: "Apache 2.0. Public RFC process. Canonical spec source in the agents-audit monorepo."
  }), /*#__PURE__*/React.createElement("div", {
    className: "wjk-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-trust-wrap"
  }, /*#__PURE__*/React.createElement(TrustBar, {
    items: [{
      label: "Rendered docs",
      value: "workspacejson.dev"
    }, {
      label: "Canonical spec source",
      value: "agents-audit"
    }, {
      label: "Reference schema",
      value: "v1.json"
    }, {
      label: "Tooling",
      value: "agents-audit"
    }]
  })), /*#__PURE__*/React.createElement("section", {
    className: "wjk-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-features"
  }, features.map(([eb, t, b]) => /*#__PURE__*/React.createElement(Card, {
    key: eb,
    eyebrow: eb,
    title: t
  }, b)))), /*#__PURE__*/React.createElement("section", {
    className: "wjk-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-blogbar"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2"
  }, "From the blog"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement("span", null, "\u2192")
  }, "All posts")), /*#__PURE__*/React.createElement("div", {
    className: "wjk-features"
  }, /*#__PURE__*/React.createElement(Card, {
    href: "#",
    meta: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("time", null, "May 6, 2026"), /*#__PURE__*/React.createElement(Badge, {
      variant: "neutral"
    }, "spec")),
    title: "workspace.json vs AGENTS.md: Prescriptive vs Descriptive Context"
  }, "A direct comparison of the two leading AI codebase context formats and why the distinction matters for agent reliability."), /*#__PURE__*/React.createElement(Card, {
    href: "#",
    meta: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("time", null, "May 15, 2026"), /*#__PURE__*/React.createElement(Badge, {
      variant: "neutral"
    }, "ai-context")),
    title: "Local daemon vs cloud: where behavioral intelligence should live"
  }, "Why workspace.json is generated by a local daemon observing the commit record, not a cloud service reading your source."))), /*#__PURE__*/React.createElement("section", {
    className: "wjk-section wjk-prose"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-explain"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2"
  }, "What it is"), /*#__PURE__*/React.createElement("p", null, "workspace.json is a JSON file that describes a codebase to AI agents. It captures file structure, conventions, framework versions, and fragility signals derived from observing how the codebase is actually used: behavioral codebase intelligence derived from the commit record, not from reading the source.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "wjk-h2"
  }, "Why it exists"), /*#__PURE__*/React.createElement("p", null, "AGENTS.md gives AI coding tools a place to read instructions. Those instructions are prose, written by humans, and they age quickly. workspace.json is for the descriptive layer: what is true about the code right now, regenerated by tools that observe the codebase."))))));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// reference/workspacejson-website/app.jsx
try { (() => {
// FAQ screen — accordion of common questions.
function FaqScreen() {
  const qs = [["Is workspace.json a replacement for AGENTS.md?", "No. They compose. AGENTS.md is the prescriptive layer (what agents should do, in prose); workspace.json is the descriptive layer (what is true about the codebase, in structured data). A repo may have both, either, or neither."], ["Who generates workspace.json?", "Tooling that observes the codebase over time, such as the reference implementation Vreko or the agents-audit CLI. Developers commit the result to version control so the whole team shares one view."], ["Where does the file live?", "The canonical location is .agents/workspace.json, relative to the repository root. Consumers also fall back to legacy locations during version transitions."], ["Is it safe to commit?", "Yes. The schema explicitly excludes secrets, PII, content snippets, and absolute paths. Generators MUST enforce these exclusions."], ["What license is it under?", "Apache 2.0. The specification is proposed for donation to the AAIF upon reaching adoption milestones."]];
  const [open, setOpen] = React.useState(0);
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-shell wjk-faq"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wjk-page-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wjk-eyebrow"
  }, "About"), /*#__PURE__*/React.createElement("h1", {
    className: "wjk-h1"
  }, "Frequently asked questions")), /*#__PURE__*/React.createElement("div", {
    className: "wjk-acc"
  }, qs.map(([q, a], i) => /*#__PURE__*/React.createElement("div", {
    className: "wjk-acc__item" + (i === open ? " is-open" : ""),
    key: i
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "wjk-acc__q",
    onClick: () => setOpen(i === open ? -1 : i)
  }, /*#__PURE__*/React.createElement("span", null, q), /*#__PURE__*/React.createElement("span", {
    className: "wjk-acc__chev"
  }, i === open ? "−" : "+")), i === open ? /*#__PURE__*/React.createElement("p", {
    className: "wjk-acc__a"
  }, a) : null))));
}
window.FaqScreen = FaqScreen;
function App() {
  const [screen, setScreen] = React.useState("home");
  const onNav = s => {
    setScreen(s);
    if (typeof document !== "undefined") document.querySelector(".wjk-scroll").scrollTop = 0;
  };
  const map = {
    home: window.HomeScreen,
    spec: window.DocsScreen,
    "getting-started": window.GettingStartedScreen,
    examples: window.ExamplesScreen,
    faq: window.FaqScreen
  };
  const Screen = map[screen] || window.HomeScreen;
  return /*#__PURE__*/React.createElement("div", {
    className: "wjk-app"
  }, /*#__PURE__*/React.createElement(Header, {
    current: screen,
    onNav: onNav
  }), /*#__PURE__*/React.createElement("div", {
    className: "wjk-scroll"
  }, /*#__PURE__*/React.createElement(Screen, {
    onNav: onNav
  }), /*#__PURE__*/React.createElement(Footer, null)));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "reference/workspacejson-website/app.jsx", error: String((e && e.message) || e) }); }

__ds_ns.FAMILIES = __ds_scope.FAMILIES;

__ds_ns.VARIANTS = __ds_scope.VARIANTS;

__ds_ns.EXTENSIONS = __ds_scope.EXTENSIONS;

__ds_ns.EDGES = __ds_scope.EDGES;

__ds_ns.EDGE_ORDER = __ds_scope.EDGE_ORDER;

__ds_ns.NODES = __ds_scope.NODES;

__ds_ns.NODE_ORDER = __ds_scope.NODE_ORDER;

__ds_ns.STATES = __ds_scope.STATES;

__ds_ns.STATE_ORDER = __ds_scope.STATE_ORDER;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.GateSequence = __ds_scope.GateSequence;

__ds_ns.GATE_STAGES = __ds_scope.GATE_STAGES;

__ds_ns.LOGO_GEOMETRY = __ds_scope.LOGO_GEOMETRY;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Caption = __ds_scope.Caption;

__ds_ns.CodeBlock = __ds_scope.CodeBlock;

__ds_ns.ComparisonPanel = __ds_scope.ComparisonPanel;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.ReceiptCard = __ds_scope.ReceiptCard;

__ds_ns.StateCard = __ds_scope.StateCard;

__ds_ns.StateChip = __ds_scope.StateChip;

__ds_ns.ArchNode = __ds_scope.ArchNode;

__ds_ns.EdgeDefs = __ds_scope.EdgeDefs;

__ds_ns.Edge = __ds_scope.Edge;

__ds_ns.Legend = __ds_scope.Legend;

__ds_ns.Timeline = __ds_scope.Timeline;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.EndCardMotion = __ds_scope.EndCardMotion;

__ds_ns.END_CARD_STEPS = __ds_scope.END_CARD_STEPS;

__ds_ns.GateStinger = __ds_scope.GateStinger;

__ds_ns.STINGER_PHASES = __ds_scope.STINGER_PHASES;

__ds_ns.MotionSpec = __ds_scope.MotionSpec;

__ds_ns.TitleCardMotion = __ds_scope.TitleCardMotion;

__ds_ns.TITLE_CARD_STEPS = __ds_scope.TITLE_CARD_STEPS;

__ds_ns.PHASES = __ds_scope.PHASES;

__ds_ns.REST = __ds_scope.REST;

__ds_ns.FULL = __ds_scope.FULL;

__ds_ns.TOTAL_MS = __ds_scope.TOTAL_MS;

__ds_ns.CARD_IN = __ds_scope.CARD_IN;

__ds_ns.CARD_OUT = __ds_scope.CARD_OUT;

__ds_ns.LAYER_CSS = __ds_scope.LAYER_CSS;

__ds_ns.PRESETS = __ds_scope.PRESETS;

__ds_ns.Scaffold = __ds_scope.Scaffold;

})();
