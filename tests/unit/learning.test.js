// Unit tests for the Learning Engine (src/learning-engine) and its recognition layers (MSME knowledge-matcher, FVE historical symbols).
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const FVE = require('../../app/fve.js');
const M = require('../../src/fve/symbol-engine/index.js');
const L = { db: require('../../src/learning-engine/learning-database.js'), pricing: require('../../src/learning-engine/pricing-extractor.js'), diff: require('../../src/learning-engine/drawing-diff.js'),
  consultant: require('../../src/learning-engine/consultant-extractor.js'), symbols: require('../../src/learning-engine/symbol-extractor.js'), network: require('../../src/learning-engine/network-extractor.js'),
  rooms: require('../../src/learning-engine/room-extractor.js'), builder: require('../../src/learning-engine/knowledge-builder.js'), ingest: require('../../src/learning-engine/project-ingestion.js') };
const { FakePage, OPS } = require('../lib/fakepdf');
const { xlsx } = require('../lib/xlsxwriter');
const model = (p, id) => FVE.buildModel(p, OPS, { id, name: id });
const inflate = b => zlib.inflateRawSync(b);
function frame(p, title, extra) { p.color('000000', .8).rect(10, 10, p.w - 20, p.h - 20); p.line(p.w - 150, 10, p.w - 150, p.h - 10); p.text(p.w - 140, p.h - 50, title, 7); (extra || []).forEach((t, i) => p.text(p.w - 140, p.h - 120 + i * 10, t, 5)); return p; }
const smoke = (p, x, y) => { p.color('ff0000', .5).circle(x, y, 4); p.line(x - 4, y, x + 4, y); };
const heat = (p, x, y) => { p.color('ff0000', .5).rect(x - 4, y - 4, 8, 8); p.line(x - 4, y + 4, x + 4, y - 4); };

test('pricing: .xlsx read (deflated and stored), header found, items keyed with the work done, totals and quote sections', async () => {
  const boq = xlsx([{ name: 'BOQ', rows: [['Job BOQ'], [], ['Item', 'Description', 'Qty', 'Unit', 'Supply Rate', 'Install Rate', 'Total'],
    ['1', 'Photoelectric smoke detector', 10, 'ea', 45, 65, 1100], ['2', 'Relocate existing smoke detector', 3, 'ea', null, 110, 330], ['3', 'FIP loop cable 2C 1.5mm2', 200, 'm', 1.5, 4.5, null], ['4', 'New semi-recessed sprinkler (hard pipe)', 4, 'ea', 90, 190, 1120], [], ['', 'TOTAL', '', '', '', '', 2550]] }], true);
  const sh = await L.pricing.readXlsx(boq, inflate); assert.equal(sh[0].name, 'BOQ'); assert.equal(sh[0].rows[3][1], 'Photoelectric smoke detector');
  const r = L.pricing.extract(sh, { FVE });
  assert.deepEqual(r.items.map(i => i.key), ['smoke', 'smoke@relocate', 'cable_fip', 'spk_semi']);
  assert.equal(r.items[0].rate, 110); assert.equal(r.items[2].total, 1200); assert.deepEqual(r.totals.map(t => t.amount), [2550]);
  // an FPS quote sheet: QTY / RATE header with the level name where 'Description' would be, sections between
  const fps = await L.pricing.readXlsx(xlsx([{ name: 'Level 9', rows: [[null, 'COST'], ['Level 9', 'QTY', 'RATE', 'SUBTOTAL'], [], ['DETECTION'], ['New white smoke detector', 5, 230, 1150], ['Delete detector', 4, 65, 260]] }], false), inflate);
  const f = L.pricing.extract(fps, { FVE }); assert.deepEqual(f.items.map(i => [i.section, i.key, i.qty, i.rate]), [['DETECTION', 'smoke', 5, 230], ['DETECTION', 'smoke@remove', 4, 65]]);
  const q = L.pricing.extract(await L.pricing.readXlsx(xlsx([{ name: 'Q', rows: [['Fire Detection', 1000], ['Total (ex GST)', 1000]] }]), inflate), {});
  assert.equal(q.sections[0].amount, 1000); assert.equal(q.totals[0].label, 'Total (ex GST)');
  await assert.rejects(L.pricing.readXlsx(Buffer.from('not a zip'), inflate));
});

test('consultant: role columns, wrapped copyright line, e-mail domain merged with the company line, known logo', async () => {
  const lines = (arr) => ({ page: { w: 1000, h: 700 }, objects: [], texts: arr.map(([s, x, y]) => ({ s, x, cx: x, cy: y })), lines: arr.map(([s, x, y]) => ({ s, x, x1: x + 50, cy: y })) });
  const a = L.consultant.extract([lines([['CLIENT', 800, 620], ['NUTRITION PHARMACEUTICALS PTY LTD', 800, 630], ['remains the property of Millimetre', 900, 650], ['Consulting Engineers. Reproduction', 900, 658]])], {});
  assert.equal(a.consultant, 'Millimetre Consulting Engineers');
  const b = L.consultant.extract([lines([['ACME FIRE CONSULTING PTY LTD', 860, 600], ['E: design@acmefire.com.au', 860, 612]])], {}); assert.equal(b.consultant, 'Acme Fire Consulting'); assert.deepEqual(b.emailDomains, ['acmefire']);
  const c = L.consultant.extract([lines([['CONSULTANT', 800, 600], ['Evolved Engineering', 800, 612]])], { metadata: {} }); assert.equal(c.consultant, 'Evolved Engineering');
  const known = [{ consultant: 'Acme Fire Consulting', aliases: {}, emailDomains: { acmefire: 1 }, logoHashes: { LOGO_X: 1 } }];
  const d = L.consultant.extract([lines([['E: someone@acmefire.com.au', 860, 612]])], { known }); assert.equal(d.consultant, 'Acme Fire Consulting'); assert.ok(d.known);
  assert.equal(L.consultant.extract([lines([])], { metadata: { consultant: 'From Metadata' } }).consultant, 'From Metadata');
  const p = new FakePage(); p.color('2e75b6', .8).rect(1060, 600, 20, 14); p.line(1060, 600, 1080, 614); p.circle(1100, 607, 6); frame(p, 'X');
  assert.match(L.consultant.logoHash(await model(p, 'l'), FVE), /^LOGO_/);
});

// an original plan, and the takeoff: the same plan with count markups, an MCP ringed in the drawing, a device ID and a note
async function pair() {
  const draw = p => { frame(p, 'LEVEL 1 LAYOUT', ['ACME FIRE CONSULTING PTY LTD']); for (let i = 0; i < 6; i++) smoke(p, 100 + i * 60, 200); heat(p, 100, 300); heat(p, 160, 300); p.color('000000', 1).rect(60, 150, 500, 220); p.text(300, 360, 'OFFICE', 6); return p; };
  const o = draw(new FakePage()), t = draw(new FakePage());
  for (let i = 0; i < 6; i++) t.annot('Circle', 'ff00ff', 100 + i * 60, 200, 7);
  t.annot('Square', '00c000', 100, 300, 7); t.annot('Square', '00c000', 160, 300, 7);
  t.color('ff6600', .9).circle(400, 300, 8); t.text(170, 190, 'SD-02', 4);
  t.annots.push({ subtype: 'FreeText', color: [255, 0, 0], rect: [80, 842 - 820, 260, 842 - 808], contentsObj: { str: 'ALLOW 10% SPARE CABLE' } });
  const mo = await model(o, 'o'), mt = await model(t, 't'); const vp = t.getViewport();
  const annT = [t.annots.map(a => L.diff.normAnnot(a, vp, c => Array.from(c).map(v => v.toString(16).padStart(2, '0')).join('')))];
  return { mo, mt, annT };
}

test('drawing diff: markups, flattened rings, added words and notes; sheets paired by title when the sets differ', async () => {
  const { mo, mt, annT } = await pair();
  const d = L.diff.diff([mo], [mt], annT, null, { FVE });
  assert.equal(d.additions.filter(a => a.src === 'annotation').length, 8);
  assert.deepEqual(d.additions.filter(a => a.src === 'vector').map(a => [a.kind, a.colour]), [['ring', 'ff6600']]);
  assert.deepEqual(d.labels.map(l => [l.src, l.token]), [['text', 'SD']]);
  assert.deepEqual(d.annotations.filter(a => a.kind === 'note').map(a => a.text), ['ALLOW 10% SPARE CABLE']);
  const other = await model(frame(new FakePage(), 'COVER'), 'c');
  assert.deepEqual(L.diff.pairPages([mo], [other, mt]), [[0, 1]]);
});

test('symbols: classes typed by the legend under them, the markup text or the estimator key; templates; tag-only outlines become abbreviations', async () => {
  const { mo, mt, annT } = await pair();
  const d = L.diff.diff([mo], [mt], annT, null, { FVE });
  const dets = [...[0, 1, 2, 3, 4, 5].map(i => ({ page: 'o', type: 'smoke', x: 100 + i * 60, y: 200, w: 8, h: 8, status: 'new' })), { page: 'o', type: 'heat', x: 100, y: 300, w: 8, h: 8 }, { page: 'o', type: 'heat', x: 160, y: 300, w: 8, h: 8 }];
  const r = L.symbols.extract([mo], d, { FVE, MSME: M, dets, D: { symbols: [], tagType: {}, lineTypes: [] } });
  const cls = Object.fromEntries(r.classes.map(c => [c.key, [c.type, c.how]]));
  assert.deepEqual(cls['annotation:Circle#ff00ff'], ['smoke', 'legend under markups']);
  assert.deepEqual(cls['annotation:Square#00c000'], ['heat', 'legend under markups']);
  assert.deepEqual(cls['vector:ring#ff6600'], [null, 'unknown']); assert.deepEqual(r.unknownClasses, ['vector:ring#ff6600']);
  assert.equal(r.devices.filter(x => x.type === 'smoke').length, 6); assert.equal(r.devices.find(x => x.type === 'smoke').label, undefined);
  const sm = r.symbols.find(s => s.deviceType === 'smoke'); assert.equal(sm.n, 6); assert.match(sm.geoHash, /^GEO_/); assert.ok(sm.template.segs.length >= 3 && sm.template.key.k === 'circle');
  assert.equal(r.abbreviations.SD, 'smoke', 'the estimator wrote SD-02 beside a smoke detector');
  // the estimator's key wins, page by page
  const k = L.symbols.extract([mo], d, { FVE, MSME: M, dets, markupMap: { pages: { 0: { 'Circle#ff00ff': 'smoke', 'ring#ff6600': 'mcp' } } }, D: { symbols: [], lineTypes: [] } });
  assert.deepEqual(k.classes.map(c => c.how).sort(), ['markup-map', 'markup-map', 'not in markup-map']);
  // words on the markups name a class when nothing else does
  d.additions.filter(a => a.colour === '00c000').forEach(a => { a.contents = 'Thermal Detector'; });
  const w = L.symbols.extract([mo], d, { FVE, MSME: M, dets: [], D: { symbols: [], lineTypes: [] } });
  assert.deepEqual(w.classes.find(c => c.colour === '00c000').how, 'markup text');
});

test('network: a dashed loop cable through the devices → closed circuit, order, pattern, metres', async () => {
  const p = frame(new FakePage(), 'LEVEL 1 LAYOUT', ['SCALE 1:100']); const devs = [];
  const pts = [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]];
  p.color('ff8000', .6, [4, 2]).poly(pts); [[150, 104, 'smoke'], [250, 104, 'smoke'], [304, 200, 'heat'], [200, 304, 'mcp'], [96, 150, 'fip']].forEach(([x, y, type]) => devs.push({ page: 0, type, x, y }));
  const m = await model(p, 'n'); m.sheet = { kind: 'plan' }; m.scale = { ratio: 100, mPerUnit: 100 * 25.4 / 72 / 1000 };
  const D = { lineTypes: [{ cls: 'cable', desc: 'FIRE DETECTION LOOP CABLE', stroke: 'ff8000', w: .6, dashed: true }], zones: {} };
  const n = L.network.extract([m], D, devs, { FVE });
  assert.equal(n.length, 1); assert.ok(n[0].closed); assert.equal(n[0].circuit, 'detection'); assert.equal(n[0].devices, 5);
  assert.equal(n[0].sequence[0], 'FIP'); assert.equal(n[0].pattern, 'FIP->SD*2->HD->MCP'); assert.ok(Math.abs(n[0].length_m - 800 * m.scale.mPerUnit) < .5, String(n[0].length_m));
  assert.equal(L.network.compress(['SD', 'SD', 'HD']), 'SD*2->HD'); assert.equal(L.network.circuitOf('EWIS CABLE'), 'ewis');
  assert.deepEqual(L.network.measurements([m], { annotations: [{ kind: 'measure', page: 0, len: 100, text: '12 m' }] }).map(x => x.paper), [100]);
});

test('rooms: named room inside a closed outline, area from scale, devices inside; coloured outlines are not rooms', async () => {
  const { mo } = await pair(); mo.sheet = { kind: 'plan' }; mo.scale = { ratio: 100, mPerUnit: 100 * 25.4 / 72 / 1000 };
  const r = L.rooms.extract([mo], [{ page: 0, type: 'smoke', x: 100, y: 200 }, { page: 0, type: 'heat', x: 900, y: 600 }], { FVE });
  assert.equal(r.length, 1); assert.equal(r[0].type, 'OFFICE'); assert.deepEqual(r[0].devices, { smoke: 1 }); assert.ok(Math.abs(r[0].area_m2 - 500 * 220 * mo.scale.mPerUnit ** 2) < .1);
  assert.equal(L.rooms.roomType('MAIN SWITCH ROOM'), 'SWITCH ROOM'); assert.equal(L.rooms.roomType('L3 COMMS'), 'COMMUNICATIONS ROOM'); assert.equal(L.rooms.roomType('123456'), null);
});

test('database: rebuilt from project contributions, re-ingestion replaces, recognition leaves a project\'s own knowledge out', () => {
  const sym = (h, t, n, extra) => ({ geoHash: h, deviceType: t, n, fingerprint: 'X', desc: {}, template: { objs: [{ k: 'circle', bb: [-4, -4, 4, 4], pts: [[0, 0]], stroke: 'ff0000', closed: true, r: 4 }], segs: [], cols: ['ff0000'], key: { k: 'circle', col: 'ff0000', size: 4 }, bb: [-4, -4, 4, 4] }, ...extra });
  const A = { projectId: 'A', consultant: 'Acme Fire Consulting', consultantKeys: { emailDomains: ['acmefire'], aliases: [], logoHash: 'LOGO_1' }, symbols: [sym('GEO_1', 'smoke', 10)], abbreviations: { SD: 'smoke' },
    conventions: { statusColours: { '0000ff': 'new', '808080': 'retain' }, legendStyle: 'text', scales: [100], lineTypes: [] }, networks: [{ circuit: 'detection', desc: 'LOOP', mix: { smoke: 10 }, sequence: ['SD', 'SD'], pattern: 'SD*2', devices: 10, length_m: 90 }],
    rooms: [{ type: 'OFFICE', area_m2: 50, devices: { smoke: 2 } }], pricing: { items: [{ key: 'smoke', description: 'Smoke detector', supply: 45, install: 65, rate: 110, qty: 10, unit: 'ea' }] }, summary: { devices: 10 } };
  const B = { projectId: 'B', consultant: 'Other Eng', symbols: [sym('GEO_1', 'heat', 2), sym('GEO_2', 'mcp', 4)], networks: [], rooms: [], pricing: { items: [{ key: 'smoke', description: 'SD', supply: 55, install: 75 }] } };
  const Lb = L.db.rebuild([A, B]); const E = L.db.entries;
  assert.equal(Lb.symbols.schema, L.db.SCHEMA); assert.equal(E(Lb.symbols).length, 3);
  const g1 = E(Lb.symbols).find(s => s.geoHash === 'GEO_1' && s.deviceType === 'smoke'); assert.equal(g1.agreement, .83);
  assert.equal(E(Lb.pricing)[0].supplyCost.avg, 50); assert.equal(E(Lb.pricing)[0].labourRatio.n, 2);
  assert.equal(E(Lb.rooms)[0].expectedDevices[0].per100m2, 4); assert.equal(Lb.networks.entries.loops.metresPerDevice.avg, 9);
  const r = L.db.forRecognition(Lb, { consultant: 'acmefire' }); assert.ok(r.consultantKnown); assert.equal(r.consultant, 'Acme Fire Consulting');
  assert.deepEqual(r.templates.map(t => t.geoHash + ':' + t.deviceType + ':' + t.consultantMatch), ['GEO_1:smoke:true', 'GEO_2:mcp:false'], 'own symbols, plus others seen ≥ 3 times with agreement; a disputed reading (GEO_1 as heat) is left out');
  assert.equal(r.abbrev.SD, 'smoke'); assert.equal(r.statusColours['0000ff'], 'new'); assert.equal(r.networkPriors[0].share.smoke, 1);
  const ex = L.db.forRecognition(Lb, { consultant: 'Acme Fire Consulting', excludeProject: 'A' }); assert.ok(!ex.library.some(s => s.device === 'smoke'), 'project A is not taught to itself');
  assert.ok(L.db.forRecognition(Lb, { consultant: 'nobody' }).templates.some(t => t.geoHash === 'GEO_2'));
  assert.deepEqual(E([1]), [1]); assert.deepEqual(E(null), []);
});

test('builder: project graph + contributions; BOQ quantities checked against the takeoff counts', () => {
  const ex = { consultant: { consultant: 'Acme', aliases: [], emailDomains: ['acme'], logoHash: null }, sheets: [], devices: [{ type: 'smoke' }, { type: 'smoke' }], rooms: [], networks: [], measurements: [], symbols: [], classes: [], labels: [], notes: [], unknownClasses: [], abbreviations: {}, conventions: {}, diffStats: {}, legend: {} };
  const { graph, contributions } = L.builder.build({ projectId: 'P1' }, ex, { boq: { items: [{ key: 'smoke', qty: 3 }, { key: 'cable_fip', qty: 100 }], totals: [] } });
  assert.deepEqual(graph.pricing.boqCheck, [{ key: 'smoke', boq: 3, takeoff: 2, diff: -1 }]); assert.equal(contributions.consultant, 'Acme'); assert.equal(graph.summary.devices, 2);
});

test('ingestion: original / takeoff found by name; a single marked-up PDF is both', () => {
  const fs = require('fs'), os = require('os'), path = require('path'); const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ftl-'));
  for (const f of ['Tender Issue.pdf', 'Takeoff - counted.pdf', 'BOQ.xlsx', 'quote.xlsx']) fs.writeFileSync(path.join(d, f), '');
  fs.writeFileSync(path.join(d, 'metadata.json'), '{"projectId":"J-1"}');
  const P = L.ingest.loadFolder(d); assert.equal(P.projectId, 'J-1'); assert.deepEqual(P.originalDrawing.map(f => path.basename(f)), ['Tender Issue.pdf']); assert.deepEqual(P.takeoffDrawing.map(f => path.basename(f)), ['Takeoff - counted.pdf']);
  assert.ok(P.boq.endsWith('BOQ.xlsx') && P.quote.endsWith('quote.xlsx')); assert.ok(!P.sameFile);
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ftl-')); fs.writeFileSync(path.join(d2, 'project.pdf'), ''); const Q = L.ingest.loadFolder(d2); assert.ok(Q.sameFile);
});

test('recognition: historical symbols join the dictionary only where the legend has nothing; knowledge layers score them', async () => {
  const p = frame(new FakePage(), 'LEGEND'); const m = await model(p, 'lg');
  const tmpl = { objs: [{ k: 'circle', bb: [-4, -4, 4, 4], c: [0, 0], r: 4, pts: [[4, 0], [0, 4], [-4, 0], [0, -4], [4, 0]], stroke: 'ff0000', closed: true, len: 25 }], segs: [{ a: [-4, 0], b: [4, 0], L: 8, c: 'ff0000', col: 'ff0000' }, { a: [0, -4], b: [0, 4], L: 8 }, { a: [4, 0], b: [0, 4], L: 5.6 }], vsegs: null, cols: ['ff0000'], key: { k: 'circle', col: 'ff0000', size: 4 }, bb: [-4, -4, 4, 4], shapes: ['circle'] };
  const K = { templates: [{ geoHash: 'GEO_A', deviceType: 'smoke', n: 5, consultantMatch: true, template: tmpl, desc: {} }, { geoHash: 'GEO_B', deviceType: 'heat', n: 9, consultantMatch: false, template: tmpl, desc: {} }],
    library: [{ geoHash: 'GEO_A', device: 'smoke', consultant: 'Acme', n: 5 }], abbrev: { XD: 'smoke' }, statusColours: { '0000ff': 'new', '808080': 'retain' } };
  const D = FVE.projectDictionary([m], { knowledge: K });
  assert.deepEqual(D.symbols.filter(s => s.hist).map(s => s.type), ['smoke', 'heat']); assert.equal(D.hist, 2); assert.deepEqual(D.colStatus, K.statusColours);
  const hid = D.symbols.find(s => s.hist && s.type === 'smoke').id;
  const s = M.knowledge.score({ hits: [{ entry: hid, type: 'smoke', score: .97 }], geoHash: 'GEO_A', textEv: [{ text: 'XD' }] }, { D, knowledge: K });
  assert.ok(s.historical.scores.smoke > .9 && s.consultant.scores.smoke >= .95);
  assert.deepEqual(M.knowledge.score({}, { D, knowledge: null }).historical.scores, {});
  // with this project's own legend covering smoke, only this consultant's other devices are added
  const D2 = FVE.projectDictionary([m], { knowledge: K }); D2.symbols = D2.symbols.filter(x => !x.hist);
  const withLegend = FVE.projectDictionary([m], { knowledge: { ...K, templates: K.templates.map(t => ({ ...t, deviceType: t.deviceType === 'smoke' ? 'mcp' : t.deviceType })) } });
  assert.ok(withLegend.symbols.every(x => !x.hist || x.consultantMatch || !withLegend.symbols.some(y => y.type && !y.hist)));
  // fusion: the knowledge layers take part only with an opinion
  const f = M.fusion.fuse({ geometry: { smoke: .9 }, historical: { smoke: .95 }, consultant: { smoke: .95 } }); assert.deepEqual(f.sources, ['Geometry', 'Historical', 'Consultant']);
  assert.equal(M.fusion.fuse({ geometry: { smoke: .9 }, legend: { smoke: .9 } }).sources.length, 2);
});

test('count tables: rows read, tied to markup groups by total (split groups, colour preference), uncoloured text boxes ignored', () => {
  const CT = require('../../src/learning-engine/count-table.js');
  const w = (s, x, y) => ({ s, x, x1: x + s.length * 5, cx: x + s.length * 2.5, cy: y, h: 8 });
  const words = [w('NEW', 100, 90), w('Description', 60, 110), w('Quantity', 200, 110), w('Unit', 260, 110),
    w('Concealed', 50, 125), w('head', 100, 125), w('21', 210, 125), w('Count', 258, 125),
    w('SEMI-RECESSED', 40, 140), w('CEILING', 110, 140), w('PENDANT', 150, 140), w('24', 210, 140), w('Count', 258, 140),
    w('100mm', 60, 155), w('29.07', 205, 155), w('m', 262, 155),
    w('Relocate', 420, 90), w('Description', 380, 110), w('Quantity', 520, 110), w('Unit', 580, 110),
    w('Count', 330, 125), w('Concealed', 370, 125), w('head', 420, 125), w('R', 445, 125), w('18', 530, 125), w('Count', 578, 125)];
  const tabs = CT.read({ texts: [] }, [], words);
  assert.deepEqual(tabs.map(t => [t.status, t.rows.map(r => [r.description, r.qty, r.unit, r.status])]),
    [['new', [['Concealed head', 21, 'Count', 'new'], ['SEMI-RECESSED CEILING PENDANT', 24, 'Count', 'new'], ['100mm', 29.07, 'm', 'new']]], ['relocate', [['Concealed head R', 18, 'Count', 'relocate']]]]);
  const ann = (subtype, colour, contents, n) => Array.from({ length: n }, () => ({ subtype, colour, contents, bb: [0, 0, 1, 1] }));
  const annots = [...ann('Polygon', '000000', '21', 21), ...ann('Polygon', '000000', '18', 18), ...ann('Polygon', 'ff0000', '7', 7), ...ann('Polygon', 'ff0000', '17', 17),
    ...ann('PolyLine', 'ff0000', '29.07 m', 1), ...ann('Square', null, '4.01', 1)];
  const m = CT.match(tabs, annots, null);
  assert.deepEqual(m.rows.map(r => [r.description, r.group, r.type]), [['Concealed head', 'Polygon#000000|21', 'spk_conc'], ['SEMI-RECESSED CEILING PENDANT', 'Polygon#ff0000|7 + Polygon#ff0000|17', 'spk_semi'],
    ['100mm', 'PolyLine#ff0000|29.07 m', null], ['Concealed head R', 'Polygon#000000|18', 'spk_conc']]);
  assert.deepEqual(m.map['Polygon#000000|18'], { type: 'spk_conc', status: 'relocate', description: 'Concealed head R', qty: 18 });
  // two rows of the same total: the colour each description had elsewhere settles it; unsettled stays unmapped
  const two = [{ status: 'new', rows: [{ description: 'RECESSED CEILING SPEAKER', qty: 25, unit: 'Count', status: 'new' }, { description: 'SMOKE DETECTOR', qty: 25, unit: 'Count', status: 'new' }] }];
  const an2 = [...ann('Polygon', 'ff0000', '25', 25), ...ann('Polygon', '008040', '25', 25)];
  assert.deepEqual(Object.entries(CT.match(two, an2, null, { 'RECESSED CEILING SPEAKER': '008040', 'SMOKE DETECTOR': 'ff0000' }).map).map(([k, v]) => [k, v.type]), [['Polygon#008040|25', 'speaker'], ['Polygon#ff0000|25', 'smoke']]);
  assert.ok(CT.match(two, an2, null).rows.every(r => r.ambiguous) && !Object.keys(CT.match(two, an2, null).map).length);
  assert.equal(CT.statusOf('Relocate'), 'relocate'); assert.equal(CT.typeOf('FH'), 'hydrant');
});

test('metrics: a takeoff counting work items only does not hold existing-to-remain detections against recognition', () => {
  const { scoreDevices } = require('../lib/metrics');
  const truth = [{ page: 0, x: 0, y: 0, type: 'smoke', status: 'new' }, { page: 0, x: 100, y: 0, type: 'smoke', status: 'relocate' }];
  const dets = [{ page: 0, x: 1, y: 0, type: 'smoke', status: 'new', conf: 1 }, { page: 0, x: 101, y: 0, type: 'smoke', status: 'relocate', conf: 1 }, { page: 0, x: 300, y: 0, type: 'smoke', status: 'retain', conf: 1 }];
  assert.equal(scoreDevices(truth, dets).falsePositive, 0);
  assert.equal(scoreDevices(truth.map(({ status, ...t }) => t), dets).falsePositive, 1, 'truth without statuses: every detection counts');
});
