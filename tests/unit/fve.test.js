// Unit tests for the FireTake Vector Engine (app/fve.js), layer by layer, in plain Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const FVE = require('../../app/fve.js');
const { FakePage, OPS } = require('../lib/fakepdf');

const model = (p, meta) => FVE.buildModel(p, OPS, { id: meta || 'p', name: meta || 'p' });
const kinds = m => m.objects.reduce((o, x) => (o[x.k] = (o[x.k] || 0) + 1, o), {});
// a sheet frame + right-hand title block, as on real drawings
function frame(p, title, scale) { p.color('000000', .8).rect(10, 10, p.w - 20, p.h - 20); p.line(p.w - 150, 10, p.w - 150, p.h - 10); p.text(p.w - 140, p.h - 50, title, 7); if (scale) p.text(p.w - 140, p.h - 30, 'SCALE ' + scale, 6); return p; }

test('geometry helpers', () => {
  assert.deepEqual(FVE.geom.bbOf([[1, 2], [3, -1]]), [1, -1, 3, 2]);
  assert.equal(FVE.geom.plen([[0, 0], [3, 4], [3, 10]]), 11);
  assert.equal(FVE.geom.segDist([0, 5], [-5, 0], [5, 0]), 5);
  assert.ok(FVE.geom.bbHit([0, 0, 2, 2], [1, 1, 3, 3]) && !FVE.geom.bbHit([0, 0, 1, 1], [2, 2, 3, 3]));
});

test('R-tree answers box queries exactly like a full scan', () => {
  let s = 7; const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const items = Array.from({ length: 3000 }, (_, i) => { const x = R() * 1000, y = R() * 800, w = R() * 20; return { i, bb: [x, y, x + w, y + w] }; });
  const t = new FVE.RTree(items, o => o.bb);
  for (let q = 0; q < 50; q++) { const x = R() * 1000, y = R() * 800, Q = [x, y, x + 60, y + 40];
    const a = t.search(...Q).map(o => o.i).sort((a, b) => a - b), b = items.filter(o => FVE.geom.bbHit(o.bb, Q)).map(o => o.i);
    assert.deepEqual(a, b); }
  assert.equal(new FVE.RTree([], o => o.bb).search(0, 0, 10, 10).length, 0);
  assert.ok(t.around(items[0].bb[0], items[0].bb[1], 1).includes(items[0]));
});

test('layer 1: paths become typed objects with colour, weight and dash', async () => {
  const p = new FakePage();
  p.color('ff0000', .5).circle(100, 100, 5).line(10, 300, 60, 300).poly([[0, 400], [10, 410], [30, 405]]).poly([[200, 200], [210, 200], [205, 190]], true);
  p.color('0000ff', .7, [3, 2]).rect(300, 300, 20, 10).line(400, 500, 450, 500);
  p.fillColor('00ff00').circle(500, 100, 3, OPS.fill);
  const m = await model(p); const k = kinds(m);
  assert.equal(k.circle, 2); assert.equal(k.rect, 1); assert.equal(k.polygon, 1); assert.equal(k.polyline, 1); assert.ok(k.line >= 2);
  const c = m.objects.find(o => o.k === 'circle' && o.stroke); assert.equal(c.stroke, 'ff0000'); assert.ok(Math.abs(c.r - 5) < .1); assert.ok(Math.abs(c.c[0] - 100) < .1 && Math.abs(c.c[1] - 100) < .1);
  const d = m.objects.find(o => o.k === 'line' && o.stroke === '0000ff'); assert.equal(d.dash, true); assert.ok(Math.abs(d.w - .7) < 1e-9);
  const f = m.objects.find(o => o.fill === '00ff00'); assert.equal(f.stroke, null);
  assert.equal(m.objects.find(o => o.k === 'rect').stroke, '0000ff');
});

test('layer 1: a square of 4 separate strokes is also a (synthetic) rect; a rectangle is never a circle', async () => {
  const p = new FakePage(); p.color('ff0000').line(0, 0, 10, 0).line(10, 0, 10, 10).line(10, 10, 0, 10).line(0, 10, 0, 0);
  p.color('000000').poly([[100, 100], [900, 100], [900, 700], [100, 700]], true);
  const m = await model(p); const syn = m.objects.filter(o => o.synthetic);
  assert.equal(syn.length, 1); assert.equal(syn[0].k, 'rect');
  assert.ok(!m.objects.some(o => o.k === 'circle'), 'sheet frame misread as a circle');
  assert.equal(FVE.segments(m.objects).filter(s => s.col === 'ff0000').length, 4, 'synthetic loop must not double the strokes');
});

test('layer 1: one path split over two constructPath ops keeps its line', async () => {
  const p = new FakePage(); p.color('000000');
  p.op(OPS.constructPath, [[OPS.moveTo], [0, 800]]); p.op(OPS.constructPath, [[OPS.lineTo], [50, 800]]); p.op(OPS.stroke);
  p.op(OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [0, 700, 10, 700]]); p.op(OPS.endPath); // discarded path
  const m = await model(p); assert.equal(m.objects.length, 1); assert.equal(m.objects[0].len, 50);
});

test('layer 1: transforms, save/restore, form XObjects and curve variants', async () => {
  const p = new FakePage(); p.color('000000');
  p.op(OPS.save); p.op(OPS.transform, [2, 0, 0, 2, 0, 0]); p.line(0, 842, 10, 842); p.op(OPS.restore);
  p.op(OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 100, 0]]); p.line(0, 100, 10, 100); p.op(OPS.paintFormXObjectEnd);
  p.path([OPS.moveTo, OPS.curveTo2, OPS.curveTo3, OPS.closePath], [0, 500, 10, 510, 20, 500, 30, 490, 40, 500]);
  p.path([OPS.moveTo, OPS.lineTo, OPS.lineTo], [0, 100, 10, 100, 10, 110], OPS.fillStroke);
  const m = await model(p);
  const scaled = m.objects.find(o => o.k === 'line' && Math.abs(o.len - 20) < 1e-6); assert.ok(scaled, 'transform applied');
  assert.ok(m.objects.some(o => o.k === 'line' && Math.abs(o.pts[0][0] - 100) < 1e-6), 'form matrix applied');
  assert.ok(m.objects.some(o => o.fill && o.stroke), 'fill+stroke keeps both colours');
});

test('layer 2: text items, joined lines, vertical text', async () => {
  const p = new FakePage(); p.text(100, 100, 'SMOKE').text(122, 100, 'DETECTOR').text(400, 100, 'FAR AWAY').vtext(600, 300, 'UP');
  const m = await model(p);
  assert.equal(m.texts.length, 4); assert.ok(m.texts.find(t => t.s === 'UP').vert);
  assert.ok(m.lines.some(l => l.s === 'SMOKE DETECTOR')); assert.ok(m.lines.some(l => l.s === 'FAR AWAY'));
});

test('layer 2: drawing scale, corrected for the printed sheet size; standards are not scales', () => {
  const T = (s, cx = 1000, cy = 800) => ({ s, cx, cy });
  assert.equal(FVE.findScale([T('SCALE 1:100 @ A3')], { w: 1191, h: 842 }).ratio, 100);
  assert.equal(FVE.findScale([T('1:100@A1')], { w: 1191, h: 842 }).ratio, 200, 'A1 drawing printed at A3 is 1:200 at sheet size');
  assert.equal(FVE.findScale([T('AS 2118.1:2017')], { w: 1191, h: 842 }), null);
  assert.equal(FVE.findScale([T('1:50', 100, 100), T('1:200 @ A3')], { w: 1191, h: 842 }).ratio, 200, 'title block outranks a detail');
  assert.ok(Math.abs(FVE.findScale([T('1:100')], { w: 1191, h: 842 }).mPerUnit - 0.0352777) < 1e-6);
});

test('layer 2: sheet type from the title block and drawing density', async () => {
  const cover = await model(frame(new FakePage(), 'COVER SHEET AND DRAWING LIST'));
  const leg = await model(frame(new FakePage(), 'LEGEND AND NOTES'));
  const pl = frame(new FakePage(), 'LEVEL 3 FIRE SERVICES LAYOUT', '1:100'); for (let i = 0; i < 500; i++) pl.color('000000').line(20 + i, 20, 20 + i, 400);
  const plan = await model(pl);
  const spec = frame(new FakePage(), 'LEVEL 1 FIRE SERVICES LAYOUT'); for (let i = 0; i < 60; i++) spec.text(30, 30 + i * 8, 'GENERAL NOTE ' + i);
  assert.equal(cover.sheet.kind, 'cover'); assert.equal(leg.sheet.kind, 'legend'); assert.equal(plan.sheet.kind, 'plan'); assert.equal((await model(spec)).sheet.kind, 'notes');
  assert.equal(plan.scale.ratio, 100);
});

test('vocabulary: device, status, line class, tags', () => {
  assert.deepEqual(FVE.classifyDesc('EXISTING SMOKE DETECTOR TO BE REMOVED'), { type: 'smoke', status: 'remove' });
  assert.equal(FVE.classifyDesc('CONCEALED SPACE PENDENT SPRINKLER HEAD').type, 'spk_space');
  assert.equal(FVE.classifyDesc('NEW EWIS SPEAKER').status, 'new');
  assert.equal(FVE.classifyDesc('RELOCATED THERMAL DETECTOR').status, 'relocate');
  assert.equal(FVE.classifyDesc('SPRINKLER MAIN PIPEWORK').type, null, 'pipework is not a head');
  assert.equal(FVE.lineClass('FIRE SPRINKLER RANGE PIPEWORK'), 'pipe'); assert.equal(FVE.lineClass('EWIS CABLE'), 'cable');
  assert.equal(FVE.lineClass('NEW BRANCH INTO EXISTING PIPELINE'), null, 'notation, not a run');
  assert.equal(FVE.tagToken('SD-01'), 'SD'); assert.equal(FVE.tagToken('L2-MCP-04'), 'MCP'); assert.equal(FVE.tagToken('HD3'), 'HD');
  assert.equal(FVE.tagToken('CO2'), 'CO2'); assert.equal(FVE.tagToken('THIS IS A LONG NOTE'), null); assert.equal(FVE.tagToken('100'), null);
});

// a small project: legend sheet + plan with a legend symbol drawn at 0.75 size, tags and pipework
async function project() {
  const L = frame(new FakePage(), 'LEGEND AND NOTES');
  L.text(60, 60, 'DRY FIRE SERVICES LEGEND', 9);
  L.color('ff0000').circle(72, 82, 4).line(68, 82, 76, 82); L.text(100, 84, 'ADDRESSABLE SMOKE DETECTOR');
  L.color('ff0000').rect(68, 100, 8, 8).line(68, 108, 76, 100); L.text(100, 106, 'ADDRESSABLE THERMAL DETECTOR');
  L.color('808080').rect(66, 122, 12, 6); L.text(100, 128, 'FLOAT VALVE');
  L.text(330, 60, 'PIPEWORK LEGEND', 9);
  L.color('00ffff', .6).line(330, 82, 390, 82); L.text(405, 84, 'FIRE SPRINKLER RANGE PIPEWORK');
  L.color('ff8000', .6, [4, 2]).line(330, 104, 390, 104); L.text(405, 106, 'FIRE DETECTION LOOP CABLE');
  L.color('00ffff', .6).line(330, 126, 390, 126); L.text(405, 128, 'NEW BRANCH INTO EXISTING PIPELINE');
  L.text(620, 60, 'ABBREVIATIONS', 9); L.text(620, 82, 'WIP - WARDEN INTERCOM POINT'); L.text(620, 96, 'MULTI-CRITERIA DETECTOR'); L.text(620, 110, 'BG'); L.text(650, 110, '- BREAK GLASS ALARM');
  const P = frame(new FakePage(), 'LEVEL 1 FIRE SERVICES LAYOUT', '1:100 @ A3');
  for (let i = 0; i < 4; i++) { const x = 100 + i * 80; P.color('ff0000').circle(x, 300, 3).line(x - 3, 300, x + 3, 300); }
  P.color('000000').circle(500, 400, 4.2); P.text(497, 402, 'SD', 4.5);       // rule: circle + SD
  P.color('000000').rect(600, 396, 12, 8); P.text(601.5, 402, 'WIP', 4);      // project abbreviation
  P.text(700, 600, 'HD');                                                     // tag with no symbol (a note)
  P.text(50, 780, 'XQ1'); P.text(60, 760, 'XQ1'); P.text(70, 740, 'XQ1'); P.text(80, 720, 'XQ1'); // unknown repeated tag
  P.color('00ffff', .6).poly([[100, 200], [500, 200], [500, 260]]);          // 460 pt of range pipe
  P.color('ff8000', .6, [4, 2]).poly([[100, 320], [400, 320], [400, 330], [100, 330]], true); // closed loop cable
  P.text(1100, 500, 'SD'); P.color('000000').circle(1101, 498, 4);          // inside the title block: ignored
  P.annot('Polygon', 'ff0000', 100, 300).annot('Polygon', 'ff0000', 180, 300).annot('Polygon', 'ff0000', 900, 700).annot('Square', '000000', 50, 50);
  const C = frame(new FakePage(), 'COVER SHEET'); C.color('ff0000').circle(200, 200, 3).line(197, 200, 203, 200);
  const ms = [await model(C, 'c'), await model(L, 'l'), await model(P, 'p1')];
  return { ms, D: FVE.projectDictionary(ms) };
}

test('layer 3: legend → project dictionary (symbols, line types, abbreviations)', async () => {
  const { ms, D } = await project();
  const smoke = D.symbols.find(s => s.type === 'smoke'), heat = D.symbols.find(s => s.type === 'heat');
  assert.ok(smoke && heat, 'device rows read'); assert.equal(smoke.key.k, 'circle'); assert.equal(heat.key.k, 'rect');
  assert.ok(D.symbols.find(s => s.desc === 'FLOAT VALVE' && s.type === null), 'unknown entries kept for review');
  const lt = D.lineTypes.filter(l => l.cls); assert.deepEqual(lt.map(l => l.cls).sort(), ['cable', 'pipe']);
  assert.ok(D.lineTypes.find(l => l.desc.includes('LOOP')).dashed);
  assert.equal(D.abbrev.WIP, 'WARDEN INTERCOM POINT'); assert.equal(D.abbrev.BG, 'BREAK GLASS ALARM'); assert.equal(D.abbrev.MULTI, undefined);
  assert.equal(D.tagType.WIP, 'wip'); assert.equal(D.tagType.BG, 'mcp');
  assert.ok(D.zones.l.length >= 2, 'legend zones recorded');
  assert.equal(ms[0].sheet.kind, 'cover');
});

test('layer 4: rules + legend matches → detections with evidence; context rules drop legend, title block, non-plan', async () => {
  const { ms, D } = await project();
  const r = FVE.templateRatios(D.symbols.find(s => s.type === 'smoke'), ms[2]); assert.ok(r.length && Math.abs(r[0].q - .75) < .03, 'symbol scale 0.75 estimated: ' + JSON.stringify(r));
  // page-level voting needs a quorum (6 votes): four circles are not enough, so it falls back to 1:1
  assert.deepEqual(FVE.pageRatios(D, ms[2]).map(x => x.q), [1]);
  // stand-in matcher: the plan's red circles of the right size are the smoke legend symbol
  const match = async (e, m, q) => e.type !== 'smoke' ? [] : m.objects.filter(o => o.k === 'circle' && o.stroke === 'ff0000' && Math.abs(o.r - 4 * q) < .3).map(o => ({ x: o.c[0], y: o.c[1], w: 8 * q, h: 8 * q, score: .97 }));
  const dets = await FVE.detect(ms, D, { match });
  const smoke = dets.filter(d => d.type === 'smoke'); assert.equal(smoke.length, 5, 'four legend symbols + one tagged circle');
  assert.ok(dets.every(d => d.page === 'p1'), 'nothing on the cover or legend');
  assert.ok(dets.find(d => d.type === 'wip' && d.ev[0].project), 'project abbreviation used');
  assert.ok(!dets.some(d => d.x > 1041), 'title block ignored');
  const lone = dets.find(d => d.ev.length === 1 && d.ev[0].tag === 'HD'); assert.ok(lone && lone.conf < .7 && lone.rules.includes('tag-no-shape'));
  assert.ok(dets.find(d => d.ev[0].src === 'tag' && d.ev[0].shape === 'circle').conf > .85);
});

test('lines: legend line types measured on plans in metres (dashed and closed loops included, notations excluded)', async () => {
  const { ms, D } = await project();
  const L = FVE.measureLines(ms, D); const pipe = L.find(l => l.cls === 'pipe'), cable = L.find(l => l.cls === 'cable');
  assert.ok(Math.abs(pipe.total - 460 * 0.0352777) < .05, 'pipe ' + pipe.total);
  assert.ok(Math.abs(cable.total - 620 * 0.0352777) < .1, 'cable ' + cable.total);
  assert.ok(!L.some(l => /BRANCH/.test(l.desc)));
  const ch = FVE.chain([{ a: [0, 0], b: [1, 0] }, { a: [1, 0], b: [1, 1] }, { a: [5, 5], b: [6, 5] }], .1); assert.equal(ch.length, 2); assert.equal(ch[0].length, 3);
});

test('layer 5: verification flags misses, unused legend rows, unknown tags and markups without detections', async () => {
  const { ms, D } = await project();
  const match = async (e, m, q) => e.type !== 'smoke' ? [] : m.objects.filter(o => o.k === 'circle' && o.stroke === 'ff0000' && Math.abs(o.r - 4 * q) < .3).map(o => ({ x: o.c[0], y: o.c[1], w: 6, h: 6, score: .97 }));
  const dets = await FVE.detect(ms, D, { match }); const W = FVE.verify(ms, D, dets); const codes = W.map(w => w.code);
  assert.ok(codes.includes('legend-unused')); assert.ok(codes.includes('legend-unknown'));
  assert.ok(W.find(w => w.code === 'tag-unknown' && w.tag === 'XQ' && w.n === 4), 'XQ1 reads as tag XQ');
  const mk = W.find(w => w.code === 'markup'); assert.equal(mk.n, 3); assert.equal(mk.hit, 2); assert.equal(mk.level, 'warn');
  assert.ok(codes.includes('low-conf'));
  // level-to-level outlier: three plans with ~20 detections and one with 2
  const fake = ['a', 'b', 'c', 'd'].map(id => ({ page: { id }, sheet: { kind: 'plan' }, texts: [], markups: {} }));
  const many = []; ['a', 'b', 'c'].forEach(p => { for (let i = 0; i < 20; i++) many.push({ page: p, type: 'smoke', x: i, y: 0, w: 1, h: 1, conf: .9 }); });
  many.push({ page: 'd', type: 'smoke', x: 0, y: 0, w: 1, h: 1, conf: .9 }, { page: 'd', type: 'smoke', x: 5, y: 0, w: 1, h: 1, conf: .9 });
  assert.ok(FVE.verify(fake, { symbols: [], abbrev: {}, tagType: {} }, many).some(w => w.code === 'low-count' && w.page === 'd'));
});

test('title block: only a black / grey near-full-height border counts, not a coloured riser', async () => {
  const p = frame(new FakePage(), 'LEVEL 1 FIRE SERVICES LAYOUT', '1:100'); p.color('00ffff').line(900, 60, 900, 700);
  const m = await model(p); const tb = FVE.titleBlock(m); assert.equal(tb.length, 1); assert.ok(Math.abs(tb[0][0] - (p.w - 150)) < .01, JSON.stringify(tb));
});

test('layer 5: AI only suggests names for what the rules could not map', async () => {
  assert.deepEqual(await FVE.suggest([], ['smoke'], null), {});
  const s = await FVE.suggest(['PHD - PHOTO DETECTOR'], ['smoke = Smoke detector'], async () => 'x {"items":[{"i":0,"key":"smoke","why":"photoelectric"}]} y');
  assert.deepEqual(s, { 0: { key: 'smoke', why: 'photoelectric' } });
});

test('markups: read by kind and colour, positions in page units', () => {
  const vp = new FakePage().getViewport();
  const m = FVE.markups([{ subtype: 'Polygon', color: [255, 0, 0], rect: [0, 0, 10, 10] }, { subtype: 'Link' }, null], vp);
  assert.equal(m['Polygon#ff0000'].n, 1); assert.deepEqual(m['Polygon#ff0000'].at[0], [5, 837]); assert.equal(Object.keys(m).length, 1);
});
