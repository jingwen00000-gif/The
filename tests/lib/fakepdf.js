// A stand-in for a pdf.js page: draw with simple commands, get back what pdf.js would hand FVE (operator list, text content,
// annotations, viewport). Lets the engine be unit-tested in plain Node without a browser or real PDFs.
const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19,
  stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, closeFillStroke: 25, eoFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
  constructPath: 91, setLineWidth: 2, setDash: 3, setStrokeRGBColor: 58, setFillRGBColor: 59, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const K = 0.5522847498;
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
// coordinates are given top-left like FVE's output; stored bottom-left like PDF (the viewport flips them back)
class FakePage {
  constructor(w = 1191, h = 842) { this.w = w; this.h = h; this.fn = []; this.args = []; this.items = []; this.annots = []; }
  op(f, a = null) { this.fn.push(f); this.args.push(a); return this; }
  Y(y) { return this.h - y; }
  color(hex, w = 0.5, dash) { this.op(OPS.setStrokeRGBColor, rgb(hex)); this.op(OPS.setLineWidth, [w]); this.op(OPS.setDash, [dash || [], 0]); return this; }
  fillColor(hex) { return this.op(OPS.setFillRGBColor, rgb(hex)); }
  path(ops, coords, paint = OPS.stroke) { this.op(OPS.constructPath, [ops, coords]); return this.op(paint); }
  line(x1, y1, x2, y2) { return this.path([OPS.moveTo, OPS.lineTo], [x1, this.Y(y1), x2, this.Y(y2)]); }
  poly(pts, close) { const ops = [], c = []; pts.forEach((p, i) => { ops.push(i ? OPS.lineTo : OPS.moveTo); c.push(p[0], this.Y(p[1])); }); if (close) ops.push(OPS.closePath); return this.path(ops, c); }
  rect(x, y, w, h, paint) { return this.path([OPS.rectangle], [x, this.Y(y + h), w, h], paint); }
  circle(cx, cy, r, paint) { const Y = v => this.Y(v), k = K * r; return this.path([OPS.moveTo, OPS.curveTo, OPS.curveTo, OPS.curveTo, OPS.curveTo],
    [cx + r, Y(cy), cx + r, Y(cy - k), cx + k, Y(cy - r), cx, Y(cy - r), cx - k, Y(cy - r), cx - r, Y(cy - k), cx - r, Y(cy), cx - r, Y(cy + k), cx - k, Y(cy + r), cx, Y(cy + r), cx + k, Y(cy + r), cx + r, Y(cy + k), cx + r, Y(cy)], paint); }
  text(x, y, s, size = 6) { this.items.push({ str: s, transform: [size, 0, 0, size, x, this.Y(y)], width: s.length * size * 0.55 }); return this; }
  vtext(x, y, s, size = 6) { this.items.push({ str: s, transform: [0, size, -size, 0, x, this.Y(y)], width: s.length * size * 0.55 }); return this; }
  annot(subtype, hex, x, y, r = 5) { this.annots.push({ subtype, color: rgb(hex), rect: [x - r, this.Y(y) - r, x + r, this.Y(y) + r] }); return this; }
  // what pdf.js returns
  getViewport() { const h = this.h; return { width: this.w, height: this.h, rotation: 0, convertToViewportPoint: (x, y) => [x, h - y], convertToViewportRectangle: r => [r[0], h - r[1], r[2], h - r[3]] }; }
  async getOperatorList() { return { fnArray: this.fn, argsArray: this.args }; }
  async getTextContent() { return { items: this.items }; }
  async getAnnotations() { return this.annots; }
}
module.exports = { FakePage, OPS };
