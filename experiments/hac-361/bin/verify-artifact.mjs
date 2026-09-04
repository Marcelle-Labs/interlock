#!/usr/bin/env node
/**
 * HAC-361 artifact gate.
 *
 *   node experiments/hac-361/bin/verify-artifact.mjs            # local only
 *   node experiments/hac-361/bin/verify-artifact.mjs --url URL  # local + served bytes
 *
 * Two questions, and they are not the same question:
 *
 *   1. Is the file on disk still the file that was frozen?
 *   2. Do the bytes a respondent actually downloads reproduce that digest?
 *
 * (2) is the one that matters. A hosting layer that transcodes, re-muxes or
 * range-truncates would leave the recorded digest describing a file nobody
 * watched, and the pre/post comparison would rest on an artifact we cannot name.
 * HAC-361 says to reject such a path rather than weaken the provenance claim, so
 * this exits non-zero instead of warning.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(join(here, '..', '..', '..'));

const freezePath = join(here, '..', 'evidence', 'artifact-freeze.json');
if (!existsSync(freezePath)) {
  console.error('no evidence/artifact-freeze.json — run freeze-artifact.mjs first');
  process.exit(2);
}
const freeze = JSON.parse(readFileSync(freezePath, 'utf8'));
const want = freeze.testedMedia.sha256;
const wantBytes = freeze.testedMedia.bytes;

const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i === -1 ? null : process.argv[i + 1];
})();
const url = argUrl ?? freeze.deployment?.testUrl ?? null;

let failed = 0;
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};

console.log('local media');
const localPath = join(repoRoot, freeze.testedMedia.path);
if (!existsSync(localPath)) {
  check(false, 'frozen media present', freeze.testedMedia.path);
} else {
  const buf = readFileSync(localPath);
  const got = createHash('sha256').update(buf).digest('hex');
  check(buf.length === wantBytes, 'byte count unchanged', `${buf.length} vs ${wantBytes}`);
  check(got === want, 'sha256 unchanged', got === want ? want : `${got} != ${want}`);
}

console.log('\npipeline inputs');
for (const input of freeze.pipelineInputs) {
  const p = join(repoRoot, input.path);
  if (!existsSync(p)) {
    check(false, input.path, 'missing');
    continue;
  }
  const got = createHash('sha256').update(readFileSync(p)).digest('hex');
  check(got === input.sha256, input.path, got === input.sha256 ? null : 'changed since freeze');
}

console.log('\nserved bytes');
if (!url) {
  console.log('  SKIP  no URL. Pass --url, or set deployment.testUrl once the media is served.');
  console.log('        The protocol may NOT be frozen until this section passes.');
} else {
  console.log(`  url   ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  check(res.ok, 'HTTP 200', `${res.status} ${res.statusText}`);
  const ct = res.headers.get('content-type') ?? '';
  check(ct.startsWith('video/'), 'content-type is video/*', ct || '(none)');
  const served = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(served).digest('hex');
  check(served.length === wantBytes, 'served byte count', `${served.length} vs ${wantBytes}`);
  check(got === want, 'served sha256 reproduces the frozen digest',
    got === want ? want : `${got} != ${want} — this path rewrites the media; reject it`);
}

console.log(failed === 0 ? '\nOK' : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
