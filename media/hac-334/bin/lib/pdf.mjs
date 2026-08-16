/**
 * Display list -> PDF. Vector, one page, 16:9 page box.
 *
 * The same nodes the SVG backend draws, so the PDF is an encoding of the master
 * rather than a second drawing of it. Text stays text: the base-14 fonts are
 * supplied by the reader, so nothing is embedded, nothing is outlined, and a
 * judge can select and search every label.
 *
 * PDF puts the origin bottom-left, so the page begins with a flip
 * (`1 0 0 -1 0 H cm`) and every node is then emitted in the same top-left
 * coordinates the SVG uses. Text counter-flips through its own text matrix,
 * which is why it comes out upright rather than mirrored.
 *
 * Dependency-free: `node:zlib` is standard library.
 */
import { deflateSync } from 'node:zlib';
import { measure, PDF_FONTS } from './fonts.mjs';

const FONT_KEYS = { Helvetica: 'F1', 'Helvetica-Bold': 'F2', Courier: 'F3', 'Courier-Bold': 'F4' };

/** Two decimal places, which is finer than a PDF point and keeps output stable. */
const n = (v) => String(Math.round(v * 100) / 100);

const rgb = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => (parseInt(v.slice(i, i + 2), 16) / 255).toFixed(4));
};

const CAP = { butt: 0, round: 1, square: 2 };
const JOIN = { miter: 0, round: 1, bevel: 2 };

/** PDF literal strings escape the delimiters and the escape character itself. */
const pdfString = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const dashOp = (d) => (d ? `[${d.split(/[\s,]+/).map(Number).join(' ')}] 0 d\n` : '[] 0 d\n');

/** Four cubic beziers, the standard circle approximation. */
function circleOps(cx, cy, r) {
  const k = 0.5522847498 * r;
  return `${n(cx + r)} ${n(cy)} m\n`
    + `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c\n`
    + `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c\n`
    + `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c\n`
    + `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c\n`;
}

const paint = (fill, stroke) => (fill && stroke ? 'B\n' : fill ? 'f\n' : stroke ? 'S\n' : 'n\n');

function nodeOps(node) {
  let s = 'q\n';
  const { fill, stroke } = node;
  if (fill) s += `${rgb(fill).join(' ')} rg\n`;
  if (stroke) s += `${rgb(stroke).join(' ')} RG\n`;
  if (node.width != null) s += `${n(node.width)} w\n`;

  switch (node.t) {
    case 'rect':
      s += dashOp(node.dash);
      s += `${n(node.x)} ${n(node.y)} ${n(node.w)} ${n(node.h)} re\n${paint(fill, stroke)}`;
      break;
    case 'line':
      s += dashOp(node.dash) + `${CAP[node.cap] ?? 0} J\n`;
      s += `${n(node.x1)} ${n(node.y1)} m\n${n(node.x2)} ${n(node.y2)} l\nS\n`;
      break;
    case 'circle':
      s += dashOp(node.dash) + circleOps(node.cx, node.cy, node.r) + paint(fill, stroke);
      break;
    case 'path': {
      s += dashOp(node.dash) + `${CAP[node.cap] ?? 0} J\n${JOIN[node.join] ?? 0} j\n`;
      // The display list restricts `d` to absolute M/L, so this stays a
      // tokeniser rather than a path parser.
      const cmds = node.d.match(/[ML][^ML]*/g) ?? [];
      for (const c of cmds) {
        const [x, y] = c.slice(1).trim().split(/[\s,]+/).map(Number);
        s += `${n(x)} ${n(y)} ${c[0] === 'M' ? 'm' : 'l'}\n`;
      }
      s += paint(fill, stroke);
      break;
    }
    case 'text': {
      const weight = node.weight >= 500 ? 700 : 400;
      const family = PDF_FONTS[node.mono ? 'mono' : 'sans'][weight];
      const w = measure(node.s, node.size, { mono: node.mono, weight: node.weight, tracking: node.tracking });
      const dx = node.anchor === 'end' ? -w : node.anchor === 'middle' ? -w / 2 : 0;
      s += `BT\n/${FONT_KEYS[family]} ${n(node.size)} Tf\n`;
      if (node.tracking) s += `${n(node.tracking)} Tc\n`;
      s += `1 0 0 -1 ${n(node.x + dx)} ${n(node.y)} Tm\n(${pdfString(node.s)}) Tj\nET\n`;
      break;
    }
    default:
      throw new Error(`unknown display node ${node.t}`);
  }
  return `${s}Q\n`;
}

/**
 * @param {object[]} nodes flattened display list, in top-left coordinates
 * @param {{width:number,height:number,title:string,background:string}} page
 * @returns {Buffer}
 */
export function toPdf(nodes, page) {
  const { width: W, height: H } = page;
  let content = `1 0 0 -1 0 ${n(H)} cm\n`;
  content += `q\n${rgb(page.background).join(' ')} rg\n0 0 ${n(W)} ${n(H)} re\nf\nQ\n`;
  for (const node of nodes) content += nodeOps(node);

  const stream = deflateSync(Buffer.from(content, 'latin1'), { level: 9 });

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] `
      + '/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >> >> '
      + '/Contents 4 0 R >>',
    { stream },
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title (${pdfString(page.title)}) /Producer (Interlock HAC-334 media/hac-334/bin) >>`,
  ];

  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = chunks[0].length;

  objects.forEach((obj, i) => {
    offsets.push(pos);
    let buf;
    if (typeof obj === 'object') {
      const head = Buffer.from(
        `${i + 1} 0 obj\n<< /Length ${obj.stream.length} /Filter /FlateDecode >>\nstream\n`, 'latin1',
      );
      buf = Buffer.concat([head, obj.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    } else {
      buf = Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1');
    }
    chunks.push(buf);
    pos += buf.length;
  });

  const xrefPos = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`
    + `startxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}
