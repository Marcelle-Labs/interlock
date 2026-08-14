/**
 * The packet verifier's own contracts: which requirements it covers, which
 * selector it was asked for, and which of three terminal states it ended in.
 *
 * These are not tests of the requirements. They are tests of the machinery that
 * decides *whether a requirement was evaluated at all* — the layer where the
 * three defects this file was written against lived:
 *
 *   - six requirements the spec declared were absent from the ledger entirely,
 *     so `REQ 52/68 PASS` was a percentage of the wrong denominator;
 *   - `--req REQ-071,REQ-072,REQ-073` matched no branch and fell through to a
 *     full sweep, so §7.7's teardown gate read a number about something else;
 *   - a pre-cloud packet and a broken one printed the same last line and the
 *     same exit code, so neither could be checked for.
 *
 * Each is a way of appearing to check something without checking it, which is
 * the only failure mode a verifier has.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  MODES,
  parseMode,
  parseSpecRequirementIds,
  referencedAdkModules,
  requirementSetCorrespondence,
  terminalState,
} from '../bin/verify-packet.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');
const teardown = join(experimentDir, 'bin', 'teardown.mjs');

const runVerifier = (...argv) =>
  spawnSync(process.execPath, [verifier, ...argv], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

// ---------------------------------------------------------------------------
// The selector
// ---------------------------------------------------------------------------

describe('the selector is parsed, never guessed', () => {
  it('defaults to a full sweep only when nothing was asked for', () => {
    expect(parseMode([])).toEqual({ mode: '--all', requirements: null });
  });

  it('reads --req in both spellings', () => {
    expect(parseMode(['--req', 'REQ-071,REQ-072'])).toEqual({
      mode: '--req',
      requirements: ['REQ-071', 'REQ-072'],
    });
    expect(parseMode(['--req=REQ-071,REQ-072'])).toEqual({
      mode: '--req',
      requirements: ['REQ-071', 'REQ-072'],
    });
  });

  it('refuses an unknown selector instead of falling through to --all', () => {
    // The regression. `--counterfactuel` used to be read as "the first argument
    // beginning with --", match no branch, and run the whole packet.
    expect(() => parseMode(['--counterfactuel'])).toThrow(/unknown selector/);
    for (const mode of MODES) expect(() => parseMode([mode, 'REQ-001'])).not.toThrow(/unknown/);
  });

  it('refuses --req with no list rather than reading it as "everything"', () => {
    expect(() => parseMode(['--req'])).toThrow(/comma-separated list/);
    expect(() => parseMode(['--req='])).toThrow(/comma-separated list/);
    expect(() => parseMode(['--req', ' , '])).toThrow(/comma-separated list/);
  });

  it('refuses something that is not a requirement id', () => {
    expect(() => parseMode(['--req', 'REQ-71'])).toThrow(/not a requirement id/);
    expect(() => parseMode(['--req', 'teardown'])).toThrow(/not a requirement id/);
  });

  it('refuses two selectors, because two answers is no answer', () => {
    expect(() => parseMode(['--req', 'REQ-071', '--all'])).toThrow(/one selector at a time/);
  });

  it('exits 2 on every unknown or missing selector, and never sweeps', () => {
    for (const argv of [['--counterfactuel'], ['--req'], ['--req', 'REQ-999'], ['--req', 'REQ-71']]) {
      const run = runVerifier(...argv);
      expect(run.status, argv.join(' ')).toBe(2);
      // The load-bearing half: nothing that looks like a result was printed.
      expect(run.stdout).not.toMatch(/REQ \d+\/\d+ PASS/);
      expect(run.stdout).not.toMatch(/PACKET/);
    }
  });

  it('evaluates exactly the requirements named, and no others', () => {
    const run = runVerifier('--req', 'REQ-071,REQ-072');
    expect(run.stdout).toMatch(/^REQ 2\/2 PASS$/m);
    expect(run.status).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The requirement set
// ---------------------------------------------------------------------------

describe('the ledger is the spec\'s requirement set, exactly', () => {
  it('parses ids from requirement headings and not from prose mentions', () => {
    const ids = parseSpecRequirementIds(
      ['**REQ-001 — a heading**', 'prose citing REQ-002 in passing', '**REQ-074 — another**'].join(
        '\n',
      ),
    );
    expect([...ids].sort()).toEqual(['REQ-001', 'REQ-074']);
  });

  it('finds all 74 declared requirements in SPEC.md, including REQ-069 … REQ-074', () => {
    const ids = parseSpecRequirementIds(readFileSync(join(experimentDir, 'SPEC.md'), 'utf8'));
    expect(ids.size).toBe(74);
    for (const id of ['REQ-069', 'REQ-070', 'REQ-071', 'REQ-072', 'REQ-073', 'REQ-074']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('reports a difference in either direction', () => {
    const both = requirementSetCorrespondence({
      specIds: new Set(['REQ-001', 'REQ-069']),
      verifierIds: new Set(['REQ-001', 'REQ-002']),
    });
    expect(both).toEqual({ missing: ['REQ-069'], extra: ['REQ-002'], agrees: false });
    expect(
      requirementSetCorrespondence({
        specIds: new Set(['REQ-001']),
        verifierIds: new Set(['REQ-001']),
      }).agrees,
    ).toBe(true);
  });

  it('proves the correspondence on the real packet, in every sweeping mode', () => {
    // The proof itself: run the verifier and read the line it prints. Fails if a
    // requirement is added to SPEC.md that the verifier does not evaluate — which
    // is exactly how REQ-069 … REQ-074 went uncounted.
    const run = runVerifier('--req', 'REQ-001');
    expect(run.stdout).toMatch(/^REQ-SET {2}spec=74 verifier=74 missing=0 extra=0$/m);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The terminal state
// ---------------------------------------------------------------------------

const entry = (outcome, gate = null) => ({ id: 'REQ-001', phase: 7, outcome, detail: '', gate });

describe('a pre-cloud packet is distinguishable from a broken one', () => {
  it('is OK only when nothing is outstanding', () => {
    const verdict = terminalState({ outcomes: [entry('PASS'), entry('PASS')], setAgrees: true });
    expect(verdict.state).toBe('OK');
    expect(verdict.exitCode).toBe(0);
  });

  it('is pre-cloud clean when every gap names the phase it awaits', () => {
    const verdict = terminalState({
      outcomes: [entry('PASS'), entry('NOT_EXERCISED', 'phase-7')],
      setAgrees: true,
    });
    expect(verdict.state).toBe('PRE_CLOUD_CLEAN');
    expect(verdict.exitCode).toBe(3);
  });

  it('is incomplete when a gap names no phase', () => {
    // The distinction that makes the middle state safe. A `NOT_EXERCISED` with
    // no gate is the suite failing to collect, not a phase waiting its turn — and
    // if it counted as clean, the state would be reachable by declining to run
    // checks.
    const verdict = terminalState({
      outcomes: [entry('PASS'), entry('NOT_EXERCISED', null)],
      setAgrees: true,
    });
    expect(verdict.state).toBe('INCOMPLETE');
    expect(verdict.exitCode).toBe(1);
    expect(verdict.ungated).toHaveLength(1);
  });

  it('is incomplete on any failure or spec defect, gated gaps notwithstanding', () => {
    for (const bad of ['FAIL', 'SPEC_DEFECT']) {
      const verdict = terminalState({
        outcomes: [entry(bad), entry('NOT_EXERCISED', 'phase-7')],
        setAgrees: true,
      });
      expect(verdict.state, bad).toBe('INCOMPLETE');
      expect(verdict.exitCode, bad).toBe(1);
    }
  });

  it('is incomplete when the requirement set does not match, however many passed', () => {
    const verdict = terminalState({ outcomes: [entry('PASS')], setAgrees: false });
    expect(verdict.state).toBe('INCOMPLETE');
    expect(verdict.exitCode).toBe(1);
  });

  it('exits 3, not 1, for a gated gap on the real packet', () => {
    const run = runVerifier('--req', 'REQ-071,REQ-072,REQ-073');
    expect(run.stdout).toMatch(/NOT_EXERCISED {2}REQ-073/);
    expect(run.stdout).toMatch(/^REQ 2\/3 PASS$/m);
    expect(run.status).toBe(3);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// REQ-009's extraction (E-04)
// ---------------------------------------------------------------------------

describe('the ADK import extraction scans what the frozen command scanned', () => {
  const fixture = {
    '/agents': ['_toolset.py', 'notes.txt', '__pycache__'],
    '/agents/__pycache__': ['_toolset.cpython-312.pyc'],
  };
  const contents = {
    '/agents/_toolset.py': 'from google.adk.tools.mcp_tool.mcp_toolset import McpToolset',
    '/agents/notes.txt': 'see google.adk.tools.mcp_tool.sneaky for details',
    '/agents/__pycache__/_toolset.cpython-312.pyc': 'google.adk.tools.mcp_tool.mcp_toolset',
  };
  const io = {
    readDir: (dir) => fixture[dir],
    isDirectory: (path) => path in fixture,
    readFile: (path) => contents[path],
  };

  it('sees a reference in a file that is not a .py file', () => {
    // The disclosure in §0.7. The corrected command briefly carried an extension
    // filter the frozen command did not have, so a plain text file naming an ADK
    // path was invisible to the check and visible to the command it replaced.
    // Narrowing scope is the one thing an erratum may not do quietly.
    const referenced = referencedAdkModules('/agents', io);
    expect([...referenced].sort()).toEqual([
      'google.adk.tools.mcp_tool.mcp_toolset',
      'google.adk.tools.mcp_tool.sneaky',
    ]);
  });

  it('skips __pycache__, which only ever echoes the .py file beside it', () => {
    const seen = [];
    referencedAdkModules('/agents', { ...io, readFile: (path) => (seen.push(path), contents[path]) });
    expect(seen.some((path) => path.includes('__pycache__'))).toBe(false);
  });

  it('finds both real ADK modules in the committed agents', () => {
    const referenced = referencedAdkModules(join(experimentDir, 'agents'));
    expect([...referenced].sort()).toEqual([
      'google.adk.tools.mcp_tool.mcp_session_manager',
      'google.adk.tools.mcp_tool.mcp_toolset',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The four corrected requirements
// ---------------------------------------------------------------------------

describe('a ratified erratum is the operative command, and passing it is a pass', () => {
  it('reports REQ-009, REQ-027, REQ-058 and REQ-064 as passes naming their erratum', () => {
    const run = runVerifier('--req', 'REQ-009,REQ-027,REQ-058,REQ-064');
    expect(run.stdout).not.toMatch(/SPEC_DEFECT/);
    expect(run.stdout).toMatch(/^REQ 4\/4 PASS$/m);
    expect(run.status).toBe(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Phase 7 artifacts
// ---------------------------------------------------------------------------

describe('the Phase 7 declaration exists before the phase does', () => {
  const manifest = JSON.parse(
    readFileSync(join(experimentDir, 'evidence', 'resources.json'), 'utf8'),
  );

  it('declares itself the closed set and enumerates at least 11 resources', () => {
    expect(manifest.closedSet).toBe(true);
    expect(manifest.recordedBeforeProvisioning).toBe(true);
    expect(manifest.resources.length).toBeGreaterThanOrEqual(11);
  });

  it('gives every resource an id, a type, a purpose and a legal location', () => {
    for (const resource of manifest.resources) {
      expect(resource.id, JSON.stringify(resource)).toBeTruthy();
      expect(resource.type, resource.id).toBeTruthy();
      expect(resource.purpose, resource.id).toBeTruthy();
      if (resource.location) expect(['global', 'us-central1']).toContain(resource.location);
    }
    const ids = manifest.resources.map((resource) => resource.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares no resource from the topology HAC-325 falsified (X-01)', () => {
    for (const resource of manifest.resources) {
      expect(
        /networkAttachment|serviceExtension|authorizationPolicy|egressGateway/i.test(
          `${resource.type}${resource.id}`,
        ),
        resource.id,
      ).toBe(false);
    }
  });

  it('passes REQ-070 and gates REQ-069 on provisioning it has not had', () => {
    const run = runVerifier('--req', 'REQ-069,REQ-070');
    expect(run.stdout).toMatch(/NOT_EXERCISED {2}REQ-069.*awaits provisioning/);
    expect(run.stdout).not.toMatch(/^FAIL/m);
    expect(run.stdout).toMatch(/^REQ 1\/2 PASS$/m);
    expect(run.status).toBe(3);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The teardown probe REQ-059 spawns
// ---------------------------------------------------------------------------

describe('the teardown probe refuses for the reason it claims', () => {
  const refuse = (projectId) =>
    spawnSync(process.execPath, [teardown, '--verify', '--project', projectId], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, CLOUDSDK_CORE_PROJECT: 'ambient-must-be-ignored' },
    });

  it('refuses a well-formed disposable id nothing declared, at the declaration gate', () => {
    // The old probe passed `hac316-s1-not-declared`, which the shape fence
    // rejects at G-4 on its *name* — so REQ-059 reported that an undeclared
    // project had been refused while the declaration gate was never reached.
    const refused = refuse('interlock-s1-deadbeef');
    expect(refused.status).toBe(3);
    expect(refused.stdout).toContain('REFUSED');
    expect(refused.stdout).not.toContain('PASS');
  }, 30_000);

  it('refuses a non-disposable id at the shape fence', () => {
    const refused = refuse('my-production-project');
    expect(refused.status).toBe(4);
    expect(refused.stdout).toContain('REFUSED');
  }, 30_000);

  it('still refuses the stale probe id, but at the shape fence rather than G-3', () => {
    const refused = refuse('hac316-s1-not-declared');
    expect(refused.status).toBe(4);
  }, 30_000);
});
