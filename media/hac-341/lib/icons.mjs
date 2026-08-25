/**
 * HAC-345 — the cockpit's semantic icon vocabulary.
 *
 * One concept, one icon, everywhere. The failure this file exists to prevent is
 * the ordinary one: `Verify this decision` acquires a magnifying glass in the
 * action row and a shield in the drawer, and a judge who has learned the first
 * has to learn the second. A map declared once cannot drift, and the gate
 * refuses a concept that is drawn with something other than what it names.
 *
 * Three rules the rest of this module exists to enforce:
 *
 *   1. Icons supplement text. Nothing here is ever the only carrier of a
 *      proof, status or control meaning — every call site keeps its visible
 *      label, and every glyph emitted here is `aria-hidden`. The vocabulary
 *      reduces re-parsing; it does not encode.
 *   2. The Interlock mechanism is not in this vocabulary. The gate, the mark
 *      and the coordination decision are drawn with the canonical Interlock
 *      geometry from `assets/logo/`. A generic padlock or shield standing in
 *      for the mechanism is exactly the substitution HAC-345 forbids, so
 *      `ShieldCheck` is deliberately absent below.
 *   3. No runtime dependency. The cockpit is one static file with no build
 *      step; adding a package to render a dozen static outlines would cost
 *      more than it buys. The path data is vendored under
 *      `assets/icons/lucide/` with its licence and provenance, and the bodies
 *      below are checked against those bytes by `verify-cockpit.mjs`. Vendoring
 *      without a drift check is just a copy that goes stale.
 *
 * Pure, dependency-free, and usable from Node and the browser alike.
 */

/**
 * Where the vendored geometry came from. Pinned to a commit, not a tag or a
 * branch, on the same reasoning as every other evidence link on this surface.
 */
export const ICON_SOURCE = {
  upstream: 'https://github.com/lucide-icons/lucide',
  release: '1.34.0',
  commit: '1a60fd28ed7111bbf6acedc0896f3d83cd73945a',
  license: 'ISC',
  licenseFile: 'assets/icons/LICENSE-lucide.txt',
  vendorDir: 'assets/icons/lucide',
};

/**
 * Collapse a Lucide source file to its comparable body.
 *
 * Both sides of the drift check run through this one implementation: the
 * module below was produced by it, and the gate re-derives it from the vendored
 * bytes. Two normalizers that agree today are two normalizers that disagree
 * later.
 */
export function lucideBody(svgText) {
  const inner = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(String(svgText))?.[1] ?? '';
  return inner.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}

/**
 * The vendored geometry, keyed by its upstream icon name.
 *
 * Each body is `lucideBody(assets/icons/lucide/<name>.svg)` verbatim. Editing
 * one here without re-vendoring the file fails the gate; re-vendoring without
 * updating the registry digest fails `check:identity`.
 */
export const ICONS = {
  ban: '<circle cx="12" cy="12" r="10" /><path d="M4.929 4.929 19.07 19.071" />',
  'circle-check-big': '<path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" />',
  'circle-x': '<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />',
  'external-link': '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
  'file-check': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="m9 15 2 2 4-4" />',
  gauge: '<path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />',
  'git-branch': '<path d="M15 6a9 9 0 0 0-9 9V3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />',
  'git-compare-arrows': '<circle cx="5" cy="6" r="3" /><path d="M12 6h5a2 2 0 0 1 2 2v7" /><path d="m15 9-3-3 3-3" /><circle cx="19" cy="18" r="3" /><path d="M12 18H7a2 2 0 0 1-2-2V9" /><path d="m9 15 3 3-3 3" />',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
  route: '<circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />',
  'scan-search': '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" />',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />',
};

/**
 * The vocabulary. Concept on the left, and the one thing that may draw it.
 *
 * `meaning` is not decoration: it is the sentence a call site has to be able to
 * say truthfully before it may use the concept, and it is what a reviewer
 * checks a new call site against.
 */
export const SEMANTICS = {
  proofPath: { icon: 'route', meaning: 'the recorded proof walk — a path through this run, not a process that ran' },
  evidence: { icon: 'scan-search', meaning: 'inspect the evidence behind a value that is already on screen' },
  comparison: { icon: 'git-compare-arrows', meaning: 'a controlled comparison between recorded arms or strategies' },
  threshold: { icon: 'gauge', meaning: 'the bound a joint outcome is judged against' },
  lineage: { icon: 'git-branch', meaning: 'the revision the evidence is bound to' },
  pass: { icon: 'circle-check-big', meaning: 'a recorded outcome that holds within its bound' },
  unsafe: { icon: 'circle-x', meaning: 'a recorded outcome that breaches its bound' },
  warning: { icon: 'triangle-alert', meaning: 'qualified, unbound or unavailable — read the caveat beside it' },
  refused: { icon: 'ban', meaning: 'declined, not on the recorded path, or outside what is claimed' },
  replay: { icon: 'rotate-ccw', meaning: 'select and replay a different recorded arm; nothing is executed' },
  artifact: { icon: 'file-check', meaning: 'the frozen raw artifact this surface renders from' },
  external: { icon: 'external-link', meaning: 'leaves this surface for immutable published evidence' },
};

/**
 * Candidates from the HAC-345 shortlist that are deliberately not adopted.
 *
 * Recorded rather than dropped silently, so the question does not reopen as a
 * suggestion during submission polish.
 */
export const REJECTED_CANDIDATES = {
  Equal: 'The held-constant marker pairs with a Δ changed marker. Lucide has no delta, '
    + 'so adopting Equal would split one pair across two drawing systems and make the '
    + 'two halves of a comparison read as different kinds of thing. Both stay mono glyphs.',
  ShieldCheck: 'The only "verified" mechanism on this surface is Interlock itself, and it is '
    + 'drawn with the canonical Interlock geometry. A shield there is the generic-security '
    + 'substitution HAC-345 forbids.',
  Workflow: 'Redundant with lineage. The evidence has one provenance story — a revision — and '
    + 'git-branch states it literally.',
  CircleCheckBig_forStatusChips: 'The state chips already carry three channels (label, glyph, '
    + 'stroke). Adding a fourth would not reduce parsing and would crowd a 9.5px chip.',
};

const SIZES = { sm: 'sm', md: 'md', lg: 'lg' };

/**
 * One decorative glyph, as inline SVG.
 *
 * `aria-hidden` is not optional and is not a parameter. Every call site on this
 * surface keeps the words that carry the meaning, so an icon that announced
 * itself would make a screen reader read the same thing twice. A control that
 * needs a name gets one on the control, where assistive technology looks for it.
 *
 * The stroke is set in CSS against the frozen `--stroke-1`, not by the 2/24
 * ratio the source files carry: at a 14px optical size that ratio renders a
 * 1.17px hairline beside 1.5px chip borders, and the vocabulary would read as a
 * lighter system sitting on top of the grammar rather than as part of it.
 */
export function icon(concept, { size = 'md', extraClass = '' } = {}) {
  const entry = SEMANTICS[concept];
  if (!entry) throw new Error(`unknown semantic icon concept: ${concept}`);
  const body = ICONS[entry.icon];
  if (!body) throw new Error(`semantic concept ${concept} names missing geometry ${entry.icon}`);
  const s = SIZES[size] ?? 'md';
  const cls = `il-ic il-ic--${s}${extraClass ? ` ${extraClass}` : ''}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`
    + ` data-icon="${entry.icon}" data-concept="${concept}">${body}</svg>`;
}

/** Every concept the vocabulary declares. The gate walks this, not a literal. */
export const CONCEPTS = Object.keys(SEMANTICS);
