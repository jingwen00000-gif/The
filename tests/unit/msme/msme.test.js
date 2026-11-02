// Unit tests for the Multi-Layer Symbol Matching Engine (src/fve/symbol-engine), each layer and the fused result, in plain Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const FVE = require('../../../app/fve.js');
const M = require('../../../src/fve/symbol-engine/index.js');
const { FakePage, OPS } = require('../../lib/fakepdf');
const model = (p, id) => FVE.buildModel(p, OPS, { id, name: id });
function frame(p, title, scale) { p.color('000000', .8).rect(10, 10, p.w - 20, p.h - 20); p.line(p.w - 150, 10, p.w - 150, p.h - 10); p.text(p.w - 140, p.h - 50, title, 7); if (scale) p.text(p.w - 140, p.h - 30, 'SCALE ' + scale, 6); return p; }
const objsOf = async draw => { const p = new FakePage(); draw(p); return (await model(p, 'x')).objects; };

test('fingerprint: scale-invariant — the same block at 0.64× has the same geoHash', async () => {
  const sym = k => p => p.color('ff0000').circle(100, 100, 5 * k).line(100 - 5 * k, 100, 100 + 5 * k, 100);
  const a = M.fingerprint.describe(await objsOf(sym(1))), b = M.fingerprint.describe(await objsOf(sym(.64)));
  assert.equal(a.kind, 'circle'); assert.equal(a.inner.line, 1);
  assert.equal(M.fingerprint.geoHash(a), M.fingerprint.geoHash(b)); assert.ok(M.fingerprint.similarity(a, b) > .95);
  assert.match(M.fingerprint.geoHash(a), /^GEO_[0-9A-Z]{5}$/);
});

test('fingerprint: different symbols separate; two empty outlines say little', async () => {
  const bar = M.fingerprint.describe(await objsOf(p => p.color('ff0000').circle(100, 100, 5).line(95, 100, 105, 100)));
  const cross = M.fingerprint.describe(await objsOf(p => p.color('ff0000').circle(100, 100, 5).line(96.5, 96.5, 103.5, 103.5).line(96.5, 103.5, 103.5, 96.5)));
  const sq = M.fingerprint.describe(await objsOf(p => p.color('ff0000').rect(95, 95, 10, 10).line(95, 100, 105, 100)));
  const e1 = M.fingerprint.describe(await objsOf(p => p.color('ff0000').rect(95, 95, 10, 10)));
  const e2 = M.fingerprint.describe(await objsOf(p => p.color('ff0000').rect(195, 95, 20, 10)));
  const tail = M.fingerprint.describe(await objsOf(p => p.color('ff0000').circle(100, 100, 5).line(95, 100, 105, 100).line(105, 100, 112, 100)));
  assert.ok(M.fingerprint.similarity(bar, cross) < .85, 'bar vs cross');
  assert.ok(M.fingerprint.similarity(bar, sq) < .3, 'circle vs square');
  assert.ok(M.fingerprint.similarity(e1, e2) <= .45, 'empty outlines capped');
  assert.ok(tail.ext > .5 && M.fingerprint.similarity(bar, tail) < M.fingerprint.similarity(bar, bar));
  assert.match(M.fingerprint.fingerprint({ device: 'smoke', geoHash: 'GEO_A312F', text: 'SD' }), /^SMOKE_FP_[0-9A-Z]{5}$/);
});

test('fusion: weights as specified — G75 T100 L100 C85 N80 → 90.5 %', () => {
  const f = M.fusion.fuse({ geometry: { smoke: .75 }, text: { smoke: 1 }, legend: { smoke: 1 }, context: { smoke: .85 }, network: { smoke: .8 } });
  assert.equal(f.device, 'smoke'); assert.equal(f.confidence, 90.5); assert.deepEqual(f.sources, ['Geometry', 'Text', 'Legend', 'Context', 'Network']);
});

test('fusion: weak layers do not dilute, single sources are discounted, bare tags held down, legend dissent costs', () => {
  const strong = M.fusion.fuse({ text: { wip: .95 }, legend: { wip: .95 }, geometry: { mcp: .3 }, context: { smoke: .2 } });
  assert.ok(Math.abs(strong.confidence - 90.3) < .2, JSON.stringify(strong));
  const single = M.fusion.fuse({ text: { smoke: .95 } }); assert.ok(single.confidence < 80 && single.confidence > 75);
  const bare = M.fusion.fuse({ text: { heat: .95 } }, { hasShape: false }); assert.ok(bare.confidence < 50);
  const dissent = M.fusion.fuse({ geometry: { smoke: .9 }, text: { smoke: .95 }, legend: { heat: .85 } });
  assert.equal(dissent.device, 'smoke'); assert.ok(dissent.confidence < 60);
  assert.equal(M.fusion.fuse({ geometry: { smoke: .2 } }), null, 'no real opinion anywhere');
});

test('text: exact 95, phrase 90, numbered 80; project abbreviations first; far tags fade', async () => {
  const D = { tagType: { SP: 'spk_pend' } };
  assert.deepEqual(['SD', 'SMOKE DET', 'SD01'].map(s => M.text.resolve(s, D, FVE).kind), ['exact', 'phrase', 'numbered']);
  assert.equal(M.text.resolve('SP', D, FVE).type, 'spk_pend', 'project: SP = sprinkler'); assert.equal(M.text.resolve('OFFICE', D, FVE), null);
  const p = new FakePage(); p.text(100, 102, 'SD', 4); p.text(140, 102, 'HD', 4); const m = await model(p, 'x');
  const s = M.text.score({ c: [102, 100], size: 8 }, { m, D: { tagType: {} }, FVE }).scores;
  assert.ok(s.smoke > .9 && (s.heat || 0) < .7, JSON.stringify(s));
});

test('context: neighbours vote by distance, identical geometry votes by share', () => {
  const lab = [...Array(6)].map((_, i) => ({ ref: i, page: 'p', c: [100 + i * 20, 100], size: 6, device: 'smoke', geoHash: 'GEO_AAAAA' })).concat([{ ref: 9, page: 'p', c: [300, 100], size: 6, device: 'mcp', geoHash: 'GEO_BBBBB' }]);
  const idx = M.context.prepare(lab);
  const s = M.context.score({ ref: 99, page: 'p', c: [160, 110], size: 6, geoHash: 'GEO_CCCCC' }, { contextIndex: idx }).scores;
  assert.ok(s.smoke > .7 && (s.mcp || 0) < .2, JSON.stringify(s));
  const g = M.context.score({ ref: 98, page: 'q', c: [0, 0], size: 6, geoHash: 'GEO_AAAAA' }, { contextIndex: idx }).scores;
  assert.equal(g.smoke, 1, 'six identical blocks labelled smoke');
  assert.deepEqual(M.context.score({ ref: 1, page: 'p', c: [0, 0], size: 6 }, {}).scores, {});
});

// a small project: legend (smoke, heat with label 'HD', detection loop cable, EWIS cable), plan with a loop through detectors
async function project() {
  const L = frame(new FakePage(), 'LEGEND AND NOTES'); L.text(60, 60, 'DRY FIRE SERVICES LEGEND', 9);
  L.color('ff0000').circle(72, 82, 4).line(68, 82, 76, 82); L.text(100, 84, 'ADDRESSABLE SMOKE DETECTOR');
  L.color('ff0000').rect(66, 98, 12, 9); L.text(68, 105, 'HD', 5); L.text(100, 106, 'ADDRESSABLE THERMAL DETECTOR');
  L.text(330, 60, 'CABLE LEGEND', 9); L.color('ff8000', .6, [4, 2]).line(330, 82, 390, 82); L.text(405, 84, 'FIRE DETECTION LOOP CABLE');
  const P = frame(new FakePage(), 'LEVEL 1 FIRE SERVICES LAYOUT', '1:100 @ A3');
  const xs = [100, 180, 260, 340, 420, 500];
  xs.forEach(x => P.color('ff0000').circle(x, 300, 3).line(x - 3, 300, x + 3, 300));
  P.color('ff0000').rect(595, 295.5, 9, 6.75); P.text(596, 301, 'HD', 3.75);            // heat with its legend label, at plan scale
  P.color('ff8000', .6, [4, 2]).poly([[100, 300], [600, 300]]);                           // detection loop through all of them
  P.color('ff0000').circle(700, 300, 3).line(697, 297, 703, 303);                          // a smoke-like symbol with a slash: not the legend block
  const ms = [await model(L, 'l'), await model(P, 'p')]; return { ms, D: FVE.projectDictionary(ms) };
}

test('legend: exact hit, label written on the symbol, consultant library', async () => {
  const { ms, D } = await project(); M.geometry.legendIndex(D);
  const heat = D.symbols.find(s => s.type === 'heat'); assert.deepEqual(heat.tags, ['HD']);
  const L1 = M.legend.score({ hits: [{ type: 'smoke', score: .97, entry: 'sy0', status: 'new' }] }, { D }); assert.equal(L1.scores.smoke, .97); assert.equal(L1.status, 'new');
  const L2 = M.legend.score({ textEv: [{ text: 'HD', type: 'heat', kind: 'exact', score: .95 }] }, { D }); assert.ok(L2.scores.heat >= .9 && L2.ev[0].src === 'label');
  const L3 = M.legend.score({ geoHash: 'GEO_LIB01' }, { D, library: [{ consultant: 'Northrop', geoHash: 'GEO_LIB01', device: 'mcp' }], consultant: 'Northrop' });
  assert.equal(L3.scores.mcp, .9);
  assert.deepEqual(M.legend.score({ geoHash: 'GEO_LIB01' }, { D, library: [{ consultant: 'Other', geoHash: 'GEO_LIB01', device: 'mcp' }], consultant: 'Northrop' }).scores, {});
});

test('network: the legend cable traced on the plan; devices on it vote; circuit name gives a family prior', async () => {
  const { ms, D } = await project(); const nets = M.network.build(ms[1], D, FVE);
  assert.equal(nets.length, 1); assert.ok(/LOOP/.test(nets[0].desc));
  assert.ok(M.network.attach({ c: [260, 300], size: 6 }, nets)); assert.equal(M.network.attach({ c: [260, 340], size: 6 }, nets), null);
  const prior = M.network.score({ ref: 1, page: 'p', c: [260, 300], size: 6 }, { networks: { p: nets }, netMembers: {} }).scores; assert.equal(prior.smoke, .5);
  const mem = { [nets[0].id]: [1, 2, 3].map(r => ({ ref: r, device: 'smoke' })) };
  const s = M.network.score({ ref: 9, page: 'p', c: [420, 300], size: 6 }, { networks: { p: nets }, netMembers: mem }).scores; assert.equal(s.smoke, 1);
});

test('engine: matchSymbol output, five-layer detections, learning', async () => {
  const { ms, D } = await project();
  const match = async (e, m, q) => e.type !== 'smoke' ? [] : m.objects.filter(o => o.k === 'circle' && o.stroke === 'ff0000' && Math.abs(o.r - 4 * q) < .3 && m.objects.some(l => l.k === 'line' && l.stroke === 'ff0000' && Math.abs(l.pts[0][1] - o.c[1]) < .01 && Math.abs(l.pts[1][1] - o.c[1]) < .01 && Math.abs(l.pts[0][0] - (o.c[0] - o.r)) < .01)).map(o => ({ x: o.c[0], y: o.c[1], w: 8 * q * 1.6, h: 8 * q * 1.6, score: .97 }));
  const dets = await M.run(ms, D, { match, consultant: 'Acme' }, { FVE });
  const smoke = dets.filter(d => d.type === 'smoke'), heat = dets.filter(d => d.type === 'heat');
  assert.equal(smoke.length, 6, JSON.stringify(dets.map(d => [d.type, d.x, d.conf])));
  assert.equal(heat.length, 1, 'heat found by its legend label');
  for (const d of smoke) { assert.ok(d.conf >= .9); assert.ok(d.sources.includes('Legend') && d.sources.includes('Geometry')); assert.match(d.fingerprint, /^SMOKE_FP_/); }
  assert.ok(smoke.some(d => d.sources.includes('Network')), 'loop membership counted');
  assert.ok(!dets.some(d => Math.abs(d.x - 700) < 5 && d.conf > .9), 'slashed look-alike not taken as the legend block');
  assert.ok(dets.learn.length >= 1 && dets.learn.every(l => l.consultant === 'Acme'));
  const r = M.matchSymbol({ c: [100, 300], size: 6, hits: [{ type: 'smoke', score: .97 }], page: 'p' }, { D, FVE, m: ms[1] });
  assert.equal(r.device, 'smoke'); assert.ok(r.confidence > 85 && Array.isArray(r.sources) && r.fingerprint);
  // library limits, stated as they are: the library adds evidence at scoring time (legend test above); it does not yet propose
  // candidates on its own, so a project without a legend finds nothing from the library alone
  const P2 = frame(new FakePage(), 'LEVEL 2 FIRE SERVICES LAYOUT', '1:100 @ A3'); [100, 200, 300].forEach(x => P2.color('ff0000').circle(x, 300, 3).line(x - 3, 300, x + 3, 300));
  const m2 = await model(P2, 'p2'); const d2 = await M.run([m2], { ...FVE.projectDictionary([m2]), symbols: [] }, { library: dets.learn, consultant: 'Acme' }, { FVE });
  assert.equal(d2.length, 0, 'library-driven candidates are not implemented yet (tests/modules.json: consultant-library-candidates)');
});
