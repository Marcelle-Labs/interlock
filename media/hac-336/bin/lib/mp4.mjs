/**
 * Enough of the ISO base media file format to interrogate a finished cut.
 *
 * Why not `ffprobe`: the gate that reads these values has to run in CI, and CI
 * has no ffmpeg. A gate that silently skips when a tool is absent is not a gate
 * — it is a comment. Duration, geometry and codec all live in fixed offsets
 * inside `moov`, so reading them needs a box walker and nothing else.
 *
 * Deliberately narrow. This parses the boxes needed to answer four questions
 * about a file this repository produced, and is not a general MP4 reader: it
 * assumes a well-formed file and reports what it finds rather than trying to
 * recover from damage.
 */

/** Walk the box tree at `buf[start..end)`, calling `visit(type, payloadRange)`. */
function walk(buf, start, end, visit) {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      // 64-bit size. Node has no readUInt64BE that is safe past 2^53, but a box
      // that large cannot occur in a file this repository writes.
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) return;
    visit(type, p + header, p + size);
    p += size;
  }
}

/** Depth-first search for the first box of `type` under `path`. */
function find(buf, start, end, path) {
  let hit = null;
  walk(buf, start, end, (type, s, e) => {
    if (hit) return;
    if (type !== path[0]) return;
    hit = path.length === 1 ? { start: s, end: e } : find(buf, s, e, path.slice(1));
  });
  return hit;
}

/**
 * Duration in seconds, geometry in pixels, and the sample-description format of
 * the first video track.
 *
 * @param {Buffer} buf whole file
 * @returns {{durationSeconds:number,timescale:number,width:number,height:number,codec:string,brand:string}}
 */
export function inspectMp4(buf) {
  if (buf.length < 16) throw new Error('not an MP4: file is too short to hold a box header');
  const ftyp = find(buf, 0, buf.length, ['ftyp']);
  if (!ftyp) throw new Error('not an MP4: no ftyp box');
  const brand = buf.toString('latin1', ftyp.start, ftyp.start + 4);

  const mvhd = find(buf, 0, buf.length, ['moov', 'mvhd']);
  if (!mvhd) throw new Error('not an MP4: no moov/mvhd box');
  const mvhdVersion = buf[mvhd.start];
  const timescale = mvhdVersion === 1 ? buf.readUInt32BE(mvhd.start + 20) : buf.readUInt32BE(mvhd.start + 12);
  const duration = mvhdVersion === 1
    ? Number(buf.readBigUInt64BE(mvhd.start + 24))
    : buf.readUInt32BE(mvhd.start + 16);
  if (!timescale) throw new Error('MP4 declares a zero movie timescale');

  const tkhd = find(buf, 0, buf.length, ['moov', 'trak', 'tkhd']);
  if (!tkhd) throw new Error('not an MP4: no moov/trak/tkhd box');
  const tkhdVersion = buf[tkhd.start];
  const geomAt = tkhdVersion === 1 ? tkhd.start + 88 : tkhd.start + 76;
  // Track width and height are 16.16 fixed point.
  const width = buf.readUInt32BE(geomAt) / 65536;
  const height = buf.readUInt32BE(geomAt + 4) / 65536;

  const stsd = find(buf, 0, buf.length, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd']);
  // stsd payload: version/flags(4), entry_count(4), then the first entry, whose
  // own header is size(4) + format(4).
  const codec = stsd ? buf.toString('latin1', stsd.start + 12, stsd.start + 16) : 'unknown';

  return {
    durationSeconds: duration / timescale,
    timescale,
    width: Math.round(width),
    height: Math.round(height),
    codec,
    brand,
  };
}

/** Every top-level `trak` handler type, so an unexpected audio track is visible. */
export function trackHandlers(buf) {
  const moov = find(buf, 0, buf.length, ['moov']);
  if (!moov) return [];
  const handlers = [];
  walk(buf, moov.start, moov.end, (type, s, e) => {
    if (type !== 'trak') return;
    const hdlr = find(buf, s, e, ['mdia', 'hdlr']);
    // hdlr payload: version/flags(4), pre_defined(4), handler_type(4).
    if (hdlr) handlers.push(buf.toString('latin1', hdlr.start + 8, hdlr.start + 12));
  });
  return handlers;
}
