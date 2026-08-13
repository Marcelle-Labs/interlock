#!/usr/bin/env node
/**
 * Mechanically capture the toolchain HAC-316's agents actually run on.
 *
 * Preflight V1 asserted five toolchain values as literals. An asserted version
 * is a version nobody checked: it is equally consistent with the environment
 * that was measured once, the environment that was remembered, and the
 * environment that never existed. Every value here is the verbatim stdout of a
 * command this file ran, and the command is recorded next to its output so the
 * capture can be repeated and disagreed with.
 *
 * V1 also carried a *prose* note about which ADK import path works. Prose is
 * not evidence. `adkImport` below reproduces the import in the real interpreter
 * and records where Python resolved it, so the agents and the manifest cannot
 * disagree about which module is in use.
 *
 * Run:
 *   HAC316_PYTHON=/path/to/venv/bin/python \
 *     node experiments/hac-316/bin/capture-toolchain.mjs
 *
 * `HAC316_PYTHON` defaults to `python3`. Nothing is installed by this script —
 * the ADK toolchain lives in the agent environment, never in this repository
 * (SPEC 2.4.1, X-20).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const evidenceDir = join(experimentDir, 'evidence');

const python = process.env['HAC316_PYTHON'] ?? 'python3';

/**
 * Run one command and keep what it said.
 *
 * Failures are recorded as failures rather than thrown away: a capture that
 * silently omitted an unavailable tool would read as "not required" instead of
 * "not measured", and REQ-008 exists to make that distinction unfakeable.
 */
function capture(label, file, args) {
  const command = [file, ...args].join(' ');
  try {
    const stdout = execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { label, command, method: 'executed', stdout: stdout.trim(), ok: true };
  } catch (error) {
    return {
      label,
      command,
      method: 'failed',
      stdout: '',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** `importlib.metadata` version of an installed distribution. */
const distributionVersion = (name) =>
  capture(name, python, [
    '-c',
    `import importlib.metadata as m; print(m.version(${JSON.stringify(name)}))`,
  ]);

/**
 * `vertexai` ships inside `google-cloud-aiplatform` and has no distribution of
 * its own, so `importlib.metadata.version("vertexai")` raises. The module's own
 * `__version__` is the value that describes what the agent imports.
 */
const vertexai = capture('vertexai', python, [
  '-c',
  'import vertexai; print(vertexai.__version__)',
]);

const captured = {
  python: capture('python', python, ['-V']),
  'google-adk': distributionVersion('google-adk'),
  mcp: distributionVersion('mcp'),
  vertexai,
  node: capture('node', process.execPath, ['--version']),
};

/**
 * Which `google.adk.tools.mcp_tool.*` module the agents import, reproduced.
 *
 * The resolved file is recorded relative to `site-packages`. An absolute path
 * would pin the manifest to one machine's directory layout, which is not a fact
 * about the toolchain; the relative path is what another checkout can compare.
 */
const MODULE_PATH = 'google.adk.tools.mcp_tool.mcp_toolset';
const adkProbe = capture('adkImport', python, [
  '-c',
  'import importlib, sysconfig, os, json\n' +
    `m = importlib.import_module(${JSON.stringify(MODULE_PATH)})\n` +
    'from google.adk.tools.mcp_tool.mcp_toolset import McpToolset\n' +
    'root = sysconfig.get_paths()["purelib"]\n' +
    'print(json.dumps({\n' +
    '  "modulePath": m.__name__,\n' +
    '  "resolvedFile": os.path.relpath(m.__file__, root),\n' +
    '  "symbol": McpToolset.__name__,\n' +
    '}))\n',
]);

const parsedProbe = adkProbe.ok ? JSON.parse(adkProbe.stdout.trim().split('\n').at(-1)) : null;

const adkImport = {
  method: adkProbe.method,
  command: adkProbe.command,
  stdout: adkProbe.stdout,
  modulePath: parsedProbe?.modulePath ?? '',
  resolvedFile: parsedProbe?.resolvedFile ?? '',
  symbol: parsedProbe?.symbol ?? '',
  resolvedFileIsRelativeTo: 'the interpreter sysconfig purelib (site-packages) root',
  note:
    'Reproduced by importing the module in the interpreter the agents run on. Preflight V1 ' +
    'recorded as prose that google.adk.tools.mcp_tool.McpToolset "also fails on this version". ' +
    'That claim is not reproduced by this capture and is therefore not promoted; see ' +
    'preflight.v2.json changed_fields for toolchain.note.',
};

const manifest = {
  experiment: 'HAC-316',
  purpose:
    'mechanically captured toolchain for the Agent Runtime arms; every value is the verbatim ' +
    'stdout of the recorded command, none is asserted',
  interpreter: python,
  captured,
  adkImport,
};

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(join(evidenceDir, 'toolchain.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const problems = Object.values(captured)
  .filter((entry) => !entry.ok)
  .map((entry) => `${entry.label}: ${entry.command} failed — ${entry.detail}`);
if (!adkProbe.ok) problems.push(`adkImport: ${adkProbe.command} failed — ${adkProbe.detail}`);

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`capture-toolchain: ${problem}\n`);
  process.exitCode = 1;
} else {
  for (const [name, entry] of Object.entries(captured)) {
    process.stdout.write(`${name.padEnd(12)} ${entry.stdout}\n`);
  }
  process.stdout.write(`adkImport    ${adkImport.modulePath} -> ${adkImport.resolvedFile}\n`);
}
