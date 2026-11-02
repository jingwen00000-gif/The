// Unit tests for the geometric legend (CAD line lettering): symbol column found without a box, rows, stroke-lettered status letters,
// colour → status vote, rows typed from a consultant library by geoHash; project-level sheet reclassification; outline fixes.
const test = require('node:test');
const assert = require('node:assert/strict');
const FVE = require('../../app/fve.js');
const M = require('../../src/fve/symbol-engine/index.js');
const { FakePage, OPS } = require('../lib/fakepdf');
const model = (p, id) => FVE.buildModel(p, OPS, { id, name: id });
function frame(p, title, extra) { p.color('000000', .8).rect(10, 10, p.w - 20, p.h - 20); p.line(p.w - 150, 10, p.w - 150, p.h - 10); p.text(p.w - 140, p.h - 50, title, 7); if (extra) p.text(p.w - 140, p.h - 80, extra, 7); return p; }

// stroke lettering, h = 4, top-left at (x, y)
const LETTER = {
  E: (p, x, y) => { p.line(x, y, x, y + 4); p.line(x, y, x + 2.5, y); p.line(x, y + 2, x + 2, y + 2); p.line(x, y + 4, x + 2.5, y + 4); },
  N: (p, x, y) => { p.poly([[x, y + 4], [x, y], [x + 3, y + 4], [x + 3, y]]); },
  D: (p, x, y) => { p.line(x, y, x, y + 4); const pts = []; for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12; pts.push([x + 2 * Math.cos(a), y + 2 + 2 * Math.sin(a)]); } p.poly(pts); },
  R: (p, x, y) => { p.line(x, y, x, y + 4); const pts = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + Math.PI * i / 8; pts.push([x + Math.cos(a), y + 1 + Math.sin(a)]); } p.poly(pts); p.line(x, y + 2, x + 2.5, y + 4); },
};
const SYM = {
  A: (p, x, y) => { p.circle(x + 4, y + 4, 4); p.line(x, y + 4, x + 8, y + 4); p.line(x + 4, y, x + 4, y + 8); },  // circle with a cross
  B: (p, x, y) => { p.rect(x, y, 8, 8); p.line(x, y, x + 8, y + 8); },                                               // square with a diagonal
};
const ROWS = [['A', 'N', '0000ff'], ['A', 'E', '575757'], ['A', 'R', '000000'], ['A', 'D', 'ff0000'], ['B', 'N', '0000ff'], ['B', 'E', '575757'], ['B', 'R', '000000'], ['B', 'D', 'ff0000']];
function legendSheet(extra) {
  const p = frame(new FakePage(), 'LEGEND & NOTES', extra);
  ROWS.forEach(([s, l, col], i) => { const x = 60, y = 60 + i * 20; p.color(col, .35); SYM[s](p, x, y); p.color('000000', .25); LETTER[l](p, x - 6, y - 4);
    for (let k = 0; k < 6; k++) p.line(x + 22 + k * 5, y + 2, x + 25 + k * 5, y + 6); }); // the description, also stroke lettering
  return p;
}

test('stroke letters N / E / R / D and colour classes', async () => {
  for (const L of 'NERD') { const p = new FakePage(); p.color('000000'); LETTER[L](p, 10, 10); const sg = FVE.segments((await model(p, 'x')).objects); assert.equal(FVE.strokeLetter(sg), L, L); }
  assert.equal(FVE.strokeLetter([]), null);
  assert.deepEqual(['0000ff', 'ff0000', '575757', '000000', 'ffffff', '40e0d0', '00ff00', 'ffff00', 'ff00ff', 'dd8822'].map(FVE.colClass), ['blue', 'red', 'grey', 'black', 'white', 'cyan', 'green', 'yellow', 'magenta', 'orange']);
});

test('geometric legend: the symbol column is found without a box; rows, letters and colour status', async () => {
  const m = await model(legendSheet(), 'leg');
  const box = FVE.findLegendColumn(m); assert.ok(box, 'column found');
  assert.ok(box[0] < 54 && box[2] < 82, 'column holds the letters and symbols, not the descriptions: ' + box);
  const rows = FVE.legendColumn(m); assert.equal(rows.length, 8);
  assert.deepEqual(rows.map(r => r.letter), ROWS.map(r => r[1]));
  assert.deepEqual(rows.map(r => r.status), ['new', 'retain', 'relocate', 'remove', 'new', 'retain', 'relocate', 'remove']);
  assert.deepEqual(rows.map(r => r.cls), ['blue', 'grey', 'black', 'red', 'blue', 'grey', 'black', 'red']);
  // the same rows when the estimator draws the box
  assert.equal(FVE.legendColumn(m, [40, 40, 90, 230]).length, 8);
  // nothing to cut: an empty area, or a plan with no coloured column
  assert.deepEqual(FVE.legendColumn(m, [500, 500, 520, 520]), []);
  assert.equal(FVE.findLegendColumn(await model(frame(new FakePage(), 'X'), 'e')), null);
});

test('geometric legend: geoHash ignores status colour; a consultant library types the rows; colour → status map', async () => {
  const m = await model(legendSheet(), 'leg');
  const sy = FVE.geoLegendSymbols(m, FVE.legendColumn(m));
  assert.equal(new Set(sy.slice(0, 4).map(s => s.geoHash)).size, 1, 'one geometry, four colours');
  assert.equal(new Set(sy.slice(4).map(s => s.geoHash)).size, 1);
  assert.notEqual(sy[0].geoHash, sy[4].geoHash);
  assert.ok(sy.every(s => s.geo && !s.type && s.segs.length >= 3 && s.objs.length));
  const library = [{ consultant: 'Test Eng', geoHash: sy[0].geoHash, device: 'smoke' }];
  const D = FVE.projectDictionary([m], { library });
  assert.deepEqual(D.symbols.map(s => s.type), ['smoke', 'smoke', 'smoke', 'smoke', null, null, null, null]);
  assert.equal(D.symbols[0].typeSrc, 'library'); assert.equal(D.geo[0].rows, 8); assert.equal(D.geo[0].typed, 4);
  assert.deepEqual(D.colStatus, { '0000ff': 'new', '575757': 'retain', '000000': 'relocate', 'ff0000': 'remove' });
  assert.ok(D.zones.leg.length, 'the legend column is a zone (never counted as devices)');
  // the estimator's box overrides the automatic column
  assert.equal(FVE.projectDictionary([m], { legendBoxes: { leg: [40, 40, 90, 110] } }).symbols.length, 3);
});

test('sheets: title-block wording shared by the whole set is ignored when classifying', async () => {
  const shared = 'LEVEL 9 - 10 FITOUTS';
  const leg = legendSheet(shared); for (let i = 0; i < 8100; i++) leg.color('000000', .2).line(300 + (i % 90) * 3, 300 + Math.floor(i / 90) * 3, 301 + (i % 90) * 3, 300 + Math.floor(i / 90) * 3);
  const plan = id => { const p = frame(new FakePage(), 'LEVEL ' + id + ' LAYOUT', shared); for (let i = 0; i < 500; i++) p.color('000000').line(20 + i, 20, 20 + i, 400); return model(p, 'L' + id); };
  const models = [await model(leg, 'leg'), await plan(9), await plan(10)];
  assert.equal(models[0].sheet.kind, 'plan', 'alone, the project name makes the legend sheet look like a plan');
  FVE.reclassify(models);
  assert.deepEqual(models.map(m => m.sheet.kind), ['legend', 'plan', 'plan']); assert.equal(models[0].sheet.was, 'plan');
  assert.equal(FVE.reclassify([models[1]]).length, 1, 'one sheet alone is left as it is');
});

test('outlines: a square traced twice is a rect, not a circle; an 8-point star is not a circle', async () => {
  const p = new FakePage(); p.color('ff0000');
  const sq = [[10, 10], [17, 10], [17, 17], [10, 17]]; p.poly(sq.concat(sq, [sq[0]]));
  const st = []; for (let i = 0; i < 8; i++) { const a = i * 3 * Math.PI / 4; st.push([100 + 5 * Math.cos(a), 100 + 5 * Math.sin(a)]); } p.poly(st, true);
  const o = (await model(p, 'x')).objects.filter(x => !x.synthetic);
  assert.equal(o[0].k, 'rect'); assert.equal(o[0].pts.length, 5); assert.ok(Math.abs(o[0].len - 28) < .01);
  assert.equal(o[1].k, 'polygon');
});

test('MSME: status of a detection comes from its own device\'s legend hit, else the legend colour code', () => {
  const graph = { D: { symbols: [], colStatus: { '0000ff': 'new' } } };
  const L = { statusBy: { smoke: 'retain' }, status: 'remove' };
  assert.equal(M.statusFor('smoke', {}, L, graph), 'retain');
  assert.equal(M.statusFor('heat', { hits: [{ type: 'heat', status: 'relocate', score: .9 }] }, L, graph), 'relocate');
  assert.equal(M.statusFor('heat', { desc: { col: '0000ff' } }, L, graph), 'new');
  assert.equal(M.statusFor('heat', {}, L, graph), 'remove');
});

test('legend: an ABBREVIATIONS section in two columns with no dash ("R    RELOCATED") is read', async () => {
  const p = frame(new FakePage(), 'LEGEND');
  p.text(60, 60, 'ABBREVIATIONS', 9); p.text(60, 80, 'E', 6); p.text(120, 80, 'EXISTING', 6); p.text(60, 94, 'R', 6); p.text(120, 94, 'RELOCATED', 6); p.text(60, 108, 'FH', 6); p.text(120, 108, 'FIRE HYDRANT', 6);
  const m = await model(p, 'ab'); const lg = FVE.analyzeLegend(m);
  assert.deepEqual(lg.abbrev, { E: 'EXISTING', R: 'RELOCATED', FH: 'FIRE HYDRANT' });
});
