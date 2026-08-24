/**
 * Proves the HAC-324 filmed-run gate fails on the defects it exists to catch.
 *
 * The risk this addresses is specific to a *derived* evidence record. The
 * emitted packet sits right beside the derived one, so a derivation that
 * quietly changed an execution fact would look corroborated rather than
 * contradicted. Each case below breaks one property and expects the gate to
 * notice.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEEDED = ['experiments/hac-324'];
const GATE = 'experiments/hac-324/bin/verify-filmed-run.mjs';

let pristine;
const scratch = [];

beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac324-pristine-'));
  for (const rel of NEEDED) cpSync(join(repoRoot, rel), join(pristine, rel), { recursive: true });
});
afterAll(() => {
  for (const d of [pristine, ...scratch]) rmSync(d, { recursive: true, force: true });
});

const run = (dir) => {
  const r = spawnSync(process.execPath, [join(dir, GATE)], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function perturbed(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'hac324-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  const api = {
    dir,
    json: (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')),
    writeJson: (f, o) => writeFileSync(join(dir, f), `${JSON.stringify(o, null, 2)}\n`),
  };
  mutate(api);
  return run(dir);
}

const RECORD = 'experiments/hac-324/evidence/filmed-run.json';
const RAW = 'experiments/hac-324/evidence/filmed-run.raw.json';
const PKG = 'experiments/hac-324/evidence/capture-package.json';

describe('the gate accepts the filmed-run record as built', () => {
  it('passes unmodified', () => {
    const r = run(pristine);
    expect(r.out).toContain('HAC-324 filmed-run record verified');
    expect(r.code).toBe(0);
  });
});

describe('the derivation cannot rewrite the run', () => {
  it('fails when an execution fact is changed in the derived record', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.decision = 'DENY';
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/execution fact "decision" differs/);
  });

  it('fails when the observation is altered', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.observation.state.services.alpha = 46;
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/execution fact "observation" differs/);
  });

  it('fails when a control is relaxed', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.controls.directBypassStatus = 200;
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/execution fact "controls" differs/);
  });

  it('fails when the record is hand-edited away from what the producer builds', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.principalProjection.note = 'hand edited';
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not what build-filmed-run\.mjs produces/);
  });

  it('fails when an environment field other than the principal is rewritten', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.resources.region = 'europe-west1';
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/resources\.region differs/);
  });
});

describe('the correction itself must stay true', () => {
  it('fails when the record still names the provisioning caller as observer', () => {
    const r = perturbed((p) => {
      const rec = p.json(RECORD);
      rec.resources.observerPrincipal = rec.resources.operatorPrincipal;
      p.writeJson(RECORD, rec);
    });
    expect(r.code).toBe(1);
    // The rebuild check catches it first; either message proves the point.
    expect(r.out).toMatch(/observerPrincipal was not corrected|not what build-filmed-run\.mjs produces/);
  });

  it('fails when the operator value no longer preserves what the packet emitted', () => {
    const r = perturbed((p) => {
      const raw = p.json(RAW);
      raw.resources.observerPrincipal = 'user:someone-else@example.invalid';
      p.writeJson(RAW, raw);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not what build-filmed-run\.mjs produces|does not preserve/);
  });
});

describe('the capture package and the record cannot drift apart', () => {
  it('fails when the package names a different run', () => {
    const r = perturbed((p) => {
      const pkg = p.json(PKG);
      pkg.filmedRunId = 'ilk-hac340-cloud-0000000000000';
      p.writeJson(PKG, pkg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/capture package names run/);
  });

  it('fails when the package disagrees about who observed', () => {
    const r = perturbed((p) => {
      const pkg = p.json(PKG);
      pkg.externalCallerPrincipal = 'user:qwynn@marcellelabs.io';
      p.writeJson(PKG, pkg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/disagree about who performed the observation/);
  });

  it('fails when a frame no longer matches its recorded digest', () => {
    const r = perturbed((p) => {
      const pkg = p.json(PKG);
      pkg.frames[0].sha256 = '0'.repeat(64);
      p.writeJson(PKG, pkg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/does not match its recorded sha256/);
  });

  it('fails when a frame is recorded as failing the capture-quality floor', () => {
    const r = perturbed((p) => {
      const pkg = p.json(PKG);
      pkg.frames[1].qualityPass = false;
      p.writeJson(PKG, pkg);
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/failing the capture-quality floor/);
  });

  it('fails when teardown is not complete', () => {
    const r = perturbed((p) => {
      p.writeJson('experiments/hac-324/evidence/teardown.json', { status: 'pending' });
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/teardown evidence is not complete/);
  });
});
