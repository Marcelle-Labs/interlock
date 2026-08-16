/**
 * Display list -> SVG. The canonical master encoding.
 *
 * Emits a `<title>`/`<desc>` pair and `role="img"` so the board carries a text
 * equivalent for its geometry, and keeps every value the display list gave it
 * without reinterpretation.
 */
import { measure, FONT_STACKS } from './fonts.mjs';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dashAttr = (d) => (d ? ` stroke-dasharray="${d}"` : '');
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

function node(n) {
  switch (n.t) {
    case 'rect':
      return `<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${num(n.h)}"`
        + ` fill="${n.fill ?? 'none'}" stroke="${n.stroke ?? 'none'}" stroke-width="${num(n.width)}"`
        + `${dashAttr(n.dash)}${n.opacity === 1 ? '' : ` opacity="${n.opacity}"`}/>`;
    case 'line':
      return `<line x1="${num(n.x1)}" y1="${num(n.y1)}" x2="${num(n.x2)}" y2="${num(n.y2)}"`
        + ` stroke="${n.stroke}" stroke-width="${num(n.width)}"${dashAttr(n.dash)}`
        + ` stroke-linecap="${n.cap}"/>`;
    case 'path':
      return `<path d="${n.d}" fill="${n.fill ?? 'none'}" stroke="${n.stroke ?? 'none'}"`
        + ` stroke-width="${num(n.width)}"${dashAttr(n.dash)} stroke-linecap="${n.cap}"`
        + ` stroke-linejoin="${n.join}"/>`;
    case 'circle':
      return `<circle cx="${num(n.cx)}" cy="${num(n.cy)}" r="${num(n.r)}"`
        + ` fill="${n.fill ?? 'none'}" stroke="${n.stroke ?? 'none'}" stroke-width="${num(n.width)}"`
        + `${dashAttr(n.dash)}/>`;
    case 'text': {
      const anchor = n.anchor === 'start' ? '' : ` text-anchor="${n.anchor === 'end' ? 'end' : 'middle'}"`;
      return `<text x="${num(n.x)}" y="${num(n.y)}"`
        + ` font-family="${FONT_STACKS[n.mono ? 'mono' : 'sans']}"`
        + ` font-size="${num(n.size)}" font-weight="${n.weight}" fill="${n.fill}"`
        + `${anchor}${n.tracking ? ` letter-spacing="${num(n.tracking)}"` : ''}`
        + `${n.opacity === 1 ? '' : ` opacity="${n.opacity}"`}>${esc(n.s)}</text>`;
    }
    default:
      throw new Error(`unknown display node ${n.t}`);
  }
}

/**
 * @param {object[]} nodes flattened display list
 * @param {{width:number,height:number,title:string,desc:string,background:string}} page
 */
export function toSvg(nodes, page) {
  const body = nodes.map(node).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}"`
    + ` role="img" aria-labelledby="board-title board-desc">`
    + `<title id="board-title">${esc(page.title)}</title>`
    + `<desc id="board-desc">${esc(page.desc)}</desc>`
    + `<rect x="0" y="0" width="${page.width}" height="${page.height}" fill="${page.background}"/>`
    + `${body}</svg>\n`;
}

export { measure };
