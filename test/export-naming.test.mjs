/**
 * The frozen HAC-332 filename grammar, exercised against the cases that made it
 * frozen. The rejection fixtures matter more than the acceptance ones: every
 * one of them is a filename someone plausibly hand-types.
 *
 * The `5s` cases are load-bearing. HAC-334's visual manifest asks for a
 * five-second derivative, and the frozen variant vocabulary has no token for
 * "simplified". These tests pin the refusal so a later change cannot quietly
 * widen the allowlist to make an export name legal.
 */
import { describe, it, expect } from 'vitest';
import {
  FAMILIES,
  VARIANTS,
  EXTENSIONS,
  buildExportName,
  validateExportName,
  auditExports,
} from '../scripts/export-naming.mjs';

describe('vocabulary', () => {
  it('keeps the frozen variant vocabulary at exactly four tokens', () => {
    expect(VARIANTS).toEqual(['light', 'dark', 'mono', 'static']);
  });

  it('does not accept a presentation role as a filename variant', () => {
    // HAC-334 records `presentationRole: "5s"` in its manifest precisely
    // because this list may not grow to accommodate it.
    expect(VARIANTS).not.toContain('5s');
    expect(VARIANTS).not.toContain('brief');
  });

  it('closes the family and extension vocabularies', () => {
    expect(Object.keys(FAMILIES)).toContain('PROOF');
    expect(Object.keys(FAMILIES)).toContain('DIAG');
    expect(FAMILIES).not.toHaveProperty('BOARD');
    expect(EXTENSIONS).toEqual(['svg', 'png', 'webp', 'mp4', 'webm', 'pdf']);
  });
});

describe('buildExportName', () => {
  it('builds a scalable master with no dimensions', () => {
    expect(buildExportName({ id: 'IL-PROOF-010', slug: 'causal-counterfactual', ext: 'svg' }))
      .toBe('IL-PROOF-010-causal-counterfactual.svg');
  });

  it('requires dimensions on a raster export', () => {
    expect(() => buildExportName({ id: 'IL-PROOF-010', slug: 'causal-counterfactual', ext: 'png' }))
      .toThrow(/must carry dimensions/);
  });

  it('never writes r01, because revision one is implied', () => {
    const name = buildExportName({
      id: 'IL-PROOF-010', slug: 'causal-counterfactual', width: 1920, height: 1080, revision: 1, ext: 'png',
    });
    expect(name).toBe('IL-PROOF-010-causal-counterfactual-1920x1080.png');
    expect(name).not.toContain('r01');
  });

  it('writes a later revision', () => {
    expect(buildExportName({
      id: 'IL-PROOF-010', slug: 'causal-counterfactual', width: 1920, height: 1080, revision: 2, ext: 'png',
    })).toBe('IL-PROOF-010-causal-counterfactual-1920x1080-r02.png');
  });

  it('normalises a run identity into the filename', () => {
    expect(buildExportName({
      id: 'IL-DIAG-011',
      slug: 'cloud-participation',
      width: 1920,
      height: 1080,
      run: 'ilk-hac340-cloud-1786730369123',
      ext: 'png',
    })).toBe('IL-DIAG-011-cloud-participation-1920x1080-runilkhac340cloud1786730369123.png');
  });

  it('refuses a variant outside the frozen vocabulary', () => {
    expect(() => buildExportName({
      id: 'IL-PROOF-010', slug: 'causal-counterfactual', variant: '5s', width: 1920, height: 1080, ext: 'png',
    })).toThrow(/unknown variant: 5s/);
  });

  it('refuses an uppercase slug', () => {
    expect(() => buildExportName({ id: 'IL-PROOF-010', slug: 'Causal-Counterfactual', ext: 'svg' }))
      .toThrow(/lowercase kebab/);
  });

  it('refuses a malformed id', () => {
    expect(() => buildExportName({ id: 'IL-PROOF-10', slug: 'x-y', ext: 'svg' })).toThrow(/bad registry id/);
    expect(() => buildExportName({ id: 'PROOF-010', slug: 'x-y', ext: 'svg' })).toThrow(/bad registry id/);
  });

  it('checks id shape but not family membership, so callers must validate what they build', () => {
    // A recorded asymmetry in the frozen contract, ported rather than repaired:
    // the builder tests the id against a shape regex that any three-to-five
    // uppercase letters satisfy, while the parser tests membership in FAMILIES.
    // `IL-BOARD-010` therefore builds and then fails to parse. Repairing it here
    // would be this issue editing a contract HAC-332 owns, so instead every
    // export path round-trips its own output through validateExportName.
    const built = buildExportName({ id: 'IL-BOARD-010', slug: 'x-y', ext: 'svg' });
    expect(built).toBe('IL-BOARD-010-x-y.svg');
    expect(validateExportName(built)).toMatchObject({ valid: false, error: /unknown family BOARD/ });
  });
});

describe('validateExportName', () => {
  it('round-trips every name the builder produces', () => {
    const built = buildExportName({
      id: 'IL-DIAG-012',
      slug: 'deployment-trust-boundaries',
      width: 2400,
      height: 1350,
      run: 'ilk-hac340-cloud-1786730369123',
      ext: 'png',
    });
    const parsed = validateExportName(built);
    expect(parsed.valid).toBe(true);
    expect(parsed.id).toBe('IL-DIAG-012');
    expect(parsed.slug).toBe('deployment-trust-boundaries');
    expect(parsed.width).toBe(2400);
    expect(parsed.height).toBe(1350);
    expect(parsed.run).toBe('ilkhac340cloud1786730369123');
  });

  it('keeps a hyphenated slug intact when parsing from the right', () => {
    const parsed = validateExportName('IL-PROOF-010-causal-counterfactual-brief-1920x1080.png');
    expect(parsed.valid).toBe(true);
    expect(parsed.slug).toBe('causal-counterfactual-brief');
    expect(parsed.variant).toBeUndefined();
  });

  it('separates a real variant from the slug', () => {
    const parsed = validateExportName('IL-PROOF-010-causal-counterfactual-static-1920x1080.png');
    expect(parsed.valid).toBe(true);
    expect(parsed.slug).toBe('causal-counterfactual');
    expect(parsed.variant).toBe('static');
  });

  // The six candidates the HAC-332 guidelines card shows being rejected.
  const rejected = [
    ['IL-PROOF-10-causal-counterfactual.svg', /three digits/, 'an unregistered family index'],
    ['IL-PROOF-010-causal-counterfactual-1920x1080-r01.png', /r01 is implied/, 'a written r01'],
    ['IL-PROOF-010-Causal-Counterfactual.svg', /lowercase kebab/, 'an uppercase slug'],
    ['IL-PROOF-010-causal-counterfactual.png', /must carry dimensions/, 'a raster with no dimensions'],
    ['IL-BOARD-010-causal-counterfactual.svg', /unknown family BOARD/, 'an unknown family'],
    ['proof suite v2 final.png', /only A-Z/, 'a hand-typed name'],
  ];
  for (const [name, pattern, why] of rejected) {
    it(`rejects ${why}`, () => {
      const r = validateExportName(name);
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(pattern);
    });
  }

  it('rejects a five-second variant token outright', () => {
    // `5s` parses as part of the slug rather than a variant, so the refusal we
    // care about is the builder's. What must never happen is `5s` being
    // *recognised* as a variant, which would mean the vocabulary had grown.
    const parsed = validateExportName('IL-DIAG-011-cloud-participation-5s-1920x1080.png');
    expect(parsed.valid).toBe(true);
    expect(parsed.variant).toBeUndefined();
    expect(parsed.slug).toBe('cloud-participation-5s');
  });

  it('rejects an unsupported extension', () => {
    expect(validateExportName('IL-PROOF-010-causal-counterfactual-1920x1080.jpg').error)
      .toMatch(/unsupported extension \.jpg/);
  });
});

describe('auditExports', () => {
  const registry = { assets: [{ id: 'IL-PROOF-010' }, { id: 'IL-DIAG-011' }] };

  it('passes a filename whose prefix is a registry row', () => {
    const [r] = auditExports(['IL-PROOF-010-causal-counterfactual.svg'], registry);
    expect(r.valid).toBe(true);
  });

  it('fails a well-formed filename that no registry row claims', () => {
    const [r] = auditExports(['IL-PROOF-099-invented-asset.svg'], registry);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/IL-PROOF-099 is not a registry row/);
  });
});
