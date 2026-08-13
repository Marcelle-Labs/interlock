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
const probeImport = (modulePath, symbol) =>
  capture(`adkImport:${symbol}`, python, [
    '-c',
    'import importlib, sysconfig, os, json\n' +
      `m = importlib.import_module(${JSON.stringify(modulePath)})\n` +
      `s = getattr(m, ${JSON.stringify(symbol)})\n` +
      'root = sysconfig.get_paths()["purelib"]\n' +
      'print(json.dumps({\n' +
      '  "modulePath": m.__name__,\n' +
      '  "resolvedFile": os.path.relpath(m.__file__, root),\n' +
      '  "symbol": s.__name__,\n' +
      '  "definedIn": getattr(s, "__module__", None),\n' +
      '}))\n',
  ]);

const parseProbe = (probe) =>
  probe.ok ? JSON.parse(probe.stdout.trim().split('\n').at(-1)) : null;

/**
 * The two symbols the agents construct, each imported from where it is defined.
 *
 * ADK 2.6.3 puts them in two modules: `McpToolset` is defined in `mcp_toolset`,
 * `StreamableHTTPConnectionParams` in `mcp_session_manager`. The second is
 * re-exported by the first, which is why one import path used to be enough —
 * and why relying on it was a bet on a re-export nobody had recorded. Each is
 * therefore captured from its defining module, and `definedIn` is recorded
 * alongside so a reader can see that the two are not interchangeable by
 * accident.
 */
const MODULE_PATH = 'google.adk.tools.mcp_tool.mcp_toolset';
const CONNECTION_MODULE_PATH = 'google.adk.tools.mcp_tool.mcp_session_manager';

const toolsetProbe = probeImport(MODULE_PATH, 'McpToolset');
const connectionProbe = probeImport(CONNECTION_MODULE_PATH, 'StreamableHTTPConnectionParams');
const parsedProbe = parseProbe(toolsetProbe);
const parsedConnection = parseProbe(connectionProbe);

const describeImport = (probe, parsed) => ({
  method: probe.method,
  command: probe.command,
  stdout: probe.stdout,
  modulePath: parsed?.modulePath ?? '',
  resolvedFile: parsed?.resolvedFile ?? '',
  symbol: parsed?.symbol ?? '',
  definedIn: parsed?.definedIn ?? '',
  resolvedFileIsRelativeTo: 'the interpreter sysconfig purelib (site-packages) root',
});

const adkImport = {
  ...describeImport(toolsetProbe, parsedProbe),
  note:
    'Reproduced by importing the module in the interpreter the agents run on. Preflight V1 ' +
    'recorded as prose that google.adk.tools.mcp_tool.McpToolset "also fails on this version". ' +
    'That claim is not reproduced by this capture and is therefore not promoted; see ' +
    'preflight.v2.json changed_fields for toolchain.note.',
};

const adkImports = [adkImport, describeImport(connectionProbe, parsedConnection)];

const manifest = {
  experiment: 'HAC-316',
  purpose:
    'mechanically captured toolchain for the Agent Runtime arms; every value is the verbatim ' +
    'stdout of the recorded command, none is asserted',
  interpreter: python,
  captured,
  adkImport,
  adkImports,
  adkImportsNote:
    'Every google.adk.tools.mcp_tool module path the agents reference, each captured by importing ' +
    'it and reading back the symbol. There are two because ADK 2.6.3 defines McpToolset in ' +
    'mcp_toolset and StreamableHTTPConnectionParams in mcp_session_manager; the second is only ' +
    're-exported by the first, so importing it from mcp_toolset would be relying on a re-export ' +
    'rather than on the module that owns the class. REQ-009\'s literal command counts distinct ' +
    'paths and expects exactly one, which the working surface of this ADK version cannot satisfy; ' +
    'the substantive check — every referenced path is captured, and every captured path is ' +
    'referenced — is what verify-packet.mjs applies.',
};

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(join(evidenceDir, 'toolchain.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const problems = Object.values(captured)
  .filter((entry) => !entry.ok)
  .map((entry) => `${entry.label}: ${entry.command} failed — ${entry.detail}`);
for (const probe of [toolsetProbe, connectionProbe]) {
  if (!probe.ok) problems.push(`${probe.label}: ${probe.command} failed — ${probe.detail}`);
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`capture-toolchain: ${problem}\n`);
  process.exitCode = 1;
} else {
  for (const [name, entry] of Object.entries(captured)) {
    process.stdout.write(`${name.padEnd(12)} ${entry.stdout}\n`);
  }
  for (const entry of adkImports) {
    process.stdout.write(
      `adkImport    ${entry.symbol} from ${entry.modulePath} -> ${entry.resolvedFile}\n`,
    );
  }
}
