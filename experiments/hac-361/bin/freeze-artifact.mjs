#!/usr/bin/env node
/**
 * HAC-361 artifact freeze.
 *
 *   node experiments/hac-361/bin/freeze-artifact.mjs
 *
 * Writes evidence/artifact-freeze.json. Every digest, duration and geometry is
 * recomputed from the file on disk or read back out of ffprobe. Nothing here is
 * copied from another manifest, because a manifest can describe a file that has
 * since been rebuilt — which is the exact substitution HAC-361 forbids.
 *
 * The rendered output is UNTRACKED at freeze time. That is recorded as a fact
 * rather than hidden: the commit binds the pipeline that produced the media, not
 * the media itself. The sha256 is what binds the media.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(join(here, '..', '..', '..'));
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const ARTIFACT = 'media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4';

/** Files that determine what the artifact says. Digested so a later edit is visible. */
const PIPELINE_INPUTS = [
  'media/hac-336/rc1/evidence/cut-rc1.json',
  'media/hac-336/rc1/evidence/narration-manifest.json',
  'media/hac-336/rc1/evidence/scene-manifest.json',
  'media/hac-336/rc1/evidence/asset-source-map.json',
  'media/hac-336/rc1/evidence/render-manifest.json',
  'media/hac-336/rc1/bin/build-video.mjs',
  'media/hac-336/rc1/POSITIONING.md',
];

const abs = (p) => join(repoRoot, p);
const sha256 = (p) => createHash('sha256').update(readFileSync(abs(p))).digest('hex');
const bytes = (p) => readFileSync(abs(p)).length;

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

const tracked = (p) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', p], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (!existsSync(abs(ARTIFACT))) {
  console.error(`missing artifact: ${ARTIFACT}`);
  process.exit(2);
}

const probe = JSON.parse(execFileSync(FFPROBE, [
  '-v', 'error',
  '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate:format=duration,size',
  '-of', 'json', abs(ARTIFACT),
], { encoding: 'utf8' }));

const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const duration = Number(probe.format.duration);

const freeze = {
  manifestId: 'HAC-361-artifact-freeze',
  issue: 'HAC-361',
  note: 'Derived by experiments/hac-361/bin/freeze-artifact.mjs. Digests are recomputed '
      + 'from disk, not copied from another manifest.',
  frozenAt: new Date().toISOString(),

  repository: 'Marcelle-Labs/interlock',
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  commit: git('rev-parse', 'HEAD'),
  commitSubject: git('log', '-1', '--format=%s'),

  testedMedia: {
    path: ARTIFACT,
    sha256: sha256(ARTIFACT),
    bytes: bytes(ARTIFACT),
    gitTracked: tracked(ARTIFACT),
    trackingNote: tracked(ARTIFACT)
      ? null
      : 'UNTRACKED at freeze time. The commit binds the pipeline that produced this file; '
      + 'the sha256 binds the file. Do not read the commit as a binding of these bytes.',
    runtime: {
      seconds: duration,
      clock: `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`,
    },
    width: Number(v.width),
    height: Number(v.height),
    videoCodec: v.codec_name,
    frameRate: v.r_frame_rate,
    audioCodec: a ? a.codec_name : null,
    audioSampleRate: a ? Number(a.sample_rate) : null,
    audioTracks: probe.streams.filter((s) => s.codec_type === 'audio').length,
  },

  pipelineInputs: PIPELINE_INPUTS.map((p) => ({
    path: p,
    sha256: sha256(p),
    bytes: bytes(p),
    gitTracked: tracked(p),
  })),

  gate: {
    command: 'pnpm run check:rc1',
    script: 'media/hac-336/rc1/bin/verify-rc1.mjs',
    note: 'This gate covers the 215.238s RC1 render. It does not cover any longer assembly.',
  },

  deployment: {
    status: 'PENDING',
    note: 'Set once the frozen bytes are served. The URL is only valid for this experiment '
        + 'after verify-artifact.mjs confirms the served bytes reproduce the sha256 above.',
    testUrl: null,
    servedDigestVerified: false,
  },
};

const out = join(here, '..', 'evidence', 'artifact-freeze.json');
writeFileSync(out, `${JSON.stringify(freeze, null, 2)}\n`);

console.log(`wrote ${out.replace(`${repoRoot}/`, '')}`);
console.log(`  ${ARTIFACT}`);
console.log(`  sha256 ${freeze.testedMedia.sha256}`);
console.log(`  ${freeze.testedMedia.bytes} bytes, ${duration.toFixed(3)}s (${freeze.testedMedia.runtime.clock})`);
console.log(`  commit ${freeze.commit}`);
if (!freeze.testedMedia.gitTracked) console.log('  NOTE: media is untracked; sha256 is the only binding');
