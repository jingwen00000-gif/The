// Minimal vector PDF writer for test drawings: lines, polylines, rects, circles (Bézier), dashes, colours, standard-font text.
// Coordinates are given top-left (the frame FireTake and FVE use); the writer flips them to PDF's bottom-left.
const K = 0.5522847498;
class Page {
  constructor(w, h) { this.w = w; this.h = h; this.ops = []; }
  y(v) { return +(this.h - v).toFixed(3); }
  f(v) { return +(+v).toFixed(3); }
  stroke(hex, w = 0.5, dash) { const [r, g, b] = rgb(hex); this.ops.push(`${r} ${g} ${b} RG ${this.f(w)} w ${dash ? `[${dash.join(' ')}] 0 d` : '[] 0 d'}`); return this; }
  fill(hex) { const [r, g, b] = rgb(hex); this.ops.push(`${r} ${g} ${b} rg`); return this; }
  line(x1, y1, x2, y2) { this.ops.push(`${this.f(x1)} ${this.y(y1)} m ${this.f(x2)} ${this.y(y2)} l S`); return this; }
  poly(pts, close) { this.ops.push(pts.map((p, i) => `${this.f(p[0])} ${this.y(p[1])} ${i ? 'l' : 'm'}`).join(' ') + (close ? ' h S' : ' S')); return this; }
  rect(x, y, w, h) { this.ops.push(`${this.f(x)} ${this.y(y + h)} ${this.f(w)} ${this.f(h)} re S`); return this; }
  fillRect(x, y, w, h) { this.ops.push(`${this.f(x)} ${this.y(y + h)} ${this.f(w)} ${this.f(h)} re f`); return this; }
  circlePath(cx, cy, r) { const y = v => this.y(v), f = v => this.f(v), k = K * r;
    return `${f(cx + r)} ${y(cy)} m ${f(cx + r)} ${y(cy - k)} ${f(cx + k)} ${y(cy - r)} ${f(cx)} ${y(cy - r)} c ${f(cx - k)} ${y(cy - r)} ${f(cx - r)} ${y(cy - k)} ${f(cx - r)} ${y(cy)} c ` +
      `${f(cx - r)} ${y(cy + k)} ${f(cx - k)} ${y(cy + r)} ${f(cx)} ${y(cy + r)} c ${f(cx + k)} ${y(cy + r)} ${f(cx + r)} ${y(cy + k)} ${f(cx + r)} ${y(cy)} c`; }
  circle(cx, cy, r) { this.ops.push(this.circlePath(cx, cy, r) + ' S'); return this; }
  disc(cx, cy, r) { this.ops.push(this.circlePath(cx, cy, r) + ' f'); return this; }
  text(x, y, s, size = 6, hex = '000000') { const [r, g, b] = rgb(hex); const e = String(s).replace(/([()\\])/g, '\\$1');
    this.ops.push(`BT ${r} ${g} ${b} rg /F1 ${this.f(size)} Tf ${this.f(x)} ${this.y(y)} Td (${e}) Tj ET`); return this; }
}
const rgb = hex => [0, 2, 4].map(i => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3));
function pdf(pages) {
  const objs = []; const add = s => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  for (const p of pages) { const stream = p.ops.join('\n'); const c = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`)); }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
module.exports = { Page, pdf };
