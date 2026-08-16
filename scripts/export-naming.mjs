#!/usr/bin/env node
/**
 * Interlock export naming — the frozen HAC-332 filename grammar, ported.
 *
 *     IL-{FAMILY}-{NNN}-{slug}[-{variant}][-{W}x{H}][-r{NN}][-run{ID}].{ext}
 *
 * HAC-332 remains the authority for this grammar. This module is a
 * repository-native port of the minimum durable contract — vocabulary,
 * formatter, parser, registry audit — so that exports produced here can be
 * validated without importing the design system's tokens, components or
 * templates. It deliberately carries no styling, no registry data and no asset
 * content: those belong to the issue that produces them.
 *
 * Porting rule: the vocabulary below is transcribed from the frozen contract
 * and is not extended here. A surface that needs a token this grammar does not
 * accept records the discrepancy and expresses the distinction in its own
 * manifest metadata; it does not widen the allowlist. HAC-334 hit exactly that
 * case with its five-second variants — see media/hac-334/README.md.
 *
 * Dependency-free and deterministic, so a gate and a developer laptop reach the
 * same verdict.
 */

/** Closed family vocabulary. Adding one is a HAC-332 change, not a local edit. */
export const FAMILIES = {
  LOGO: 'Identity: marks, wordmarks, lockups, favicons, app icons',
  SCAF: 'Export scaffolds: README hero, OG, Devpost, video cards, social frames',
  DIAG: 'Diagrams: architecture boards, node and edge figures, legends',
  PROOF: 'Proof and data: metric figures, receipt figures, before/after panels',
  MOT: 'Motion and video: sequences, openers, transitions',
  SOC: 'Social and marketing derivatives',
  TOK: 'Token and foundation specimens',
  STATE: 'State system specimens',
  EDGE: 'Relationship grammar specimens',
  NODE: 'Node grammar specimens',
  PRIM: 'Presentation primitive specimens',
  TMPL: 'Templates',
  COCK: 'Judge cockpit states: The Run, its layers, and its degraded states',
  VAL: 'Validation harnesses',
};

/**
 * Closed variant vocabulary.
 *
 * `light`/`dark` are theme, `mono` is achromatic, `static` is the frozen
 * reduced-motion twin of an animated asset. None of the four denotes a
 * simplified or abbreviated composition, which is why a five-second board
 * cannot spell its purpose here.
 */
export const VARIANTS = ['light', 'dark', 'mono', 'static'];

export const EXTENSIONS = ['svg', 'png', 'webp', 'mp4', 'webm', 'pdf'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIMS = /^(\d{2,5})x(\d{2,5})$/;
const REV = /^r(\d{2})$/;
const RUN = /^run([a-z0-9]+)$/;
const ID = /^IL-([A-Z]{3,5})-(\d{3})$/;

/**
 * Build the one legal filename for an export.
 *
 * @param {object} spec
 * @param {string} spec.id        registry id, `IL-{FAMILY}-{NNN}`
 * @param {string} spec.slug      lowercase kebab
 * @param {string} [spec.variant] one of VARIANTS
 * @param {number} [spec.width]
 * @param {number} [spec.height]
 * @param {number} [spec.revision] 1 is implied and never written
 * @param {string} [spec.run]      run identity; lowercased and stripped
 * @param {string} spec.ext       one of EXTENSIONS
 * @returns {string}
 */
export function buildExportName({ id, slug, variant, width, height, revision, run, ext }) {
  if (!ID.test(id)) throw new Error(`bad registry id: ${id}`);
  if (!SLUG.test(slug)) throw new Error(`slug must be lowercase kebab: ${slug}`);
  if (!EXTENSIONS.includes(ext)) throw new Error(`unsupported extension: ${ext}`);
  if (variant && !VARIANTS.includes(variant)) throw new Error(`unknown variant: ${variant}`);
  const raster = ext !== 'svg';
  if (raster && !(width && height)) throw new Error('raster and video exports must carry dimensions');
  const parts = [id, slug];
  if (variant) parts.push(variant);
  if (width && height) parts.push(`${width}x${height}`);
  if (revision && revision > 1) parts.push(`r${String(revision).padStart(2, '0')}`);
  if (run) parts.push(`run${String(run).toLowerCase().replace(/[^a-z0-9]/g, '')}`);
  return `${parts.join('-')}.${ext}`;
}

/**
 * Parse a filename from the right, which is the only unambiguous direction —
 * the slug may contain hyphens, so left-to-right cannot tell where it ends.
 *
 * @param {string} name
 * @returns {{valid: true, name: string, id: string, family: string, ext: string,
 *            slug: string, variant?: string, width?: number, height?: number,
 *            revision?: number, run?: string}
 *          | {valid: false, error: string, name: string}}
 */
export function validateExportName(name) {
  const err = (m) => ({ valid: false, error: m, name });
  const dot = name.lastIndexOf('.');
  if (dot < 0) return err('no extension');
  const ext = name.slice(dot + 1);
  if (!EXTENSIONS.includes(ext)) return err(`unsupported extension .${ext}`);
  if (name !== name.replace(/[^A-Za-z0-9.-]/g, '')) {
    return err('only A-Z, a-z, 0-9, hyphen and one dot are allowed');
  }

  const stem = name.slice(0, dot).split('-');
  if (stem.length < 4) return err('too few segments');
  if (stem[0] !== 'IL') return err('must start with IL');
  const family = stem[1];
  const num = stem[2];
  if (!FAMILIES[family]) return err(`unknown family ${family}`);
  if (!/^\d{3}$/.test(num)) return err('index must be three digits');

  const rest = stem.slice(3);
  const out = { valid: true, name, id: `IL-${family}-${num}`, family, ext };

  let m;
  if (rest.length && (m = RUN.exec(rest[rest.length - 1]))) { out.run = m[1]; rest.pop(); }
  if (rest.length && (m = REV.exec(rest[rest.length - 1]))) { out.revision = Number(m[1]); rest.pop(); }
  if (rest.length && (m = DIMS.exec(rest[rest.length - 1]))) {
    out.width = Number(m[1]);
    out.height = Number(m[2]);
    rest.pop();
  }
  if (rest.length > 1 && VARIANTS.includes(rest[rest.length - 1])) out.variant = rest.pop();

  if (!rest.length) return err('missing slug');
  out.slug = rest.join('-');
  if (!SLUG.test(out.slug)) return err(`slug must be lowercase kebab: ${out.slug}`);
  if (ext !== 'svg' && !out.width) return err('raster and video exports must carry dimensions');
  if (out.revision === 1) return err('r01 is implied and must not be written');
  return out;
}

/**
 * Check filenames against a loaded registry. A filename whose prefix is not a
 * registry row is invalid however well-formed the rest of it is: the prefix
 * *is* the registry id, character for character.
 *
 * @param {string[]} names
 * @param {{assets?: {id: string}[]}} registry
 */
export function auditExports(names, registry) {
  const ids = new Set((registry.assets || []).map((a) => a.id));
  return names.map((n) => {
    const r = validateExportName(n);
    if (!r.valid) return r;
    if (!ids.has(r.id)) return { ...r, valid: false, error: `${r.id} is not a registry row` };
    return r;
  });
}
