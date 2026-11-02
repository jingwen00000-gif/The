// Integration: the Learning Engine end to end, in the real app engine.
//   train-acme (original.pdf + takeoff.pdf + boq.xlsx + quote.xlsx) → knowledge base → the same consultant's next job WITHOUT a legend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { learn } = require('../../src/learning-engine/cli');
const db = require('../../src/learning-engine/learning-database');
const { openApp, analyse } = require('../lib/harness');
const { scoreDevices } = require('../lib/metrics');
const TR = path.join(__dirname, '../datasets/training');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-knowledge-'));
const EVAL = path.join(TR, 'eval-acme-nolegend'), GT = require(path.join(EVAL, 'ground-truth.json'));
let res;
test.before(async () => { res = await learn([path.join(TR, 'train-acme')], OUT, () => {}); });

test('ingestion → diff → extraction recovers the takeoff exactly; consultant, BOQ and quote read', () => {
  const g = JSON.parse(fs.readFileSync(path.join(OUT, 'projects/TRAIN-ACME-001/knowledge-graph.json'), 'utf8'));
  const ans = require(path.join(TR, 'train-acme/answer.json'));
  const s = scoreDevices(ans.devices, g.devices.map(d => ({ ...d, conf: 1 })));
  assert.equal(s.f1, 100, JSON.stringify(s.misses.slice(0, 3))); assert.equal(s.typeAccuracy, 100);
  assert.equal(g.consultant.consultant, 'Acme Fire Consulting'); assert.deepEqual(g.consultant.emailDomains, ['acmefire']);
  assert.deepEqual(Object.fromEntries(g.markupClasses.map(c => [c.key, c.how])), { 'annotation:Circle#ff00ff': 'legend under markups', 'annotation:Circle#00b0f0': 'markup text', 'annotation:Circle#00c000': 'legend under markups', 'annotation:Circle#7030a0': 'legend under markups', 'vector:ring#ff6600': 'legend under markups' });
  assert.ok(g.pricing.boqCheck.every(c => c.diff === 0), JSON.stringify(g.pricing.boqCheck)); assert.equal(g.pricing.totals.find(t => /Total/.test(t.label)).amount, 25350);
  assert.deepEqual(g.notes.map(n => n.text), ['ALLOW 10% SPARE ON LOOP CABLE']); assert.ok(g.labels.length >= 8);
  assert.equal(g.networks.length, 2); assert.ok(g.networks.every(n => n.closed && n.circuit === 'detection' && n.length_m > 100));
  assert.ok(g.rooms.length >= 18 && g.rooms.every(r => r.area_m2 > 0));
});

test('knowledge base: libraries written, one entry per symbol, the consultant with keys and conventions', () => {
  const L = db.load(OUT), E = db.entries;
  assert.deepEqual(E(L.symbols).map(s => s.deviceType).sort(), ['heat', 'mcp', 'smoke', 'speaker']);
  assert.ok(E(L.symbols).every(s => s.template && (s.template.vsegs || s.template.segs).length >= 3 && /^GEO_/.test(s.geoHash)));
  const c = E(L.consultants)[0]; assert.equal(c.consultant, 'Acme Fire Consulting'); assert.ok(c.emailDomains.acmefire && Object.keys(c.logoHashes).length === 1);
  assert.equal(c.abbreviations.WIP && Object.keys(c.abbreviations.WIP)[0], 'wip');
  assert.ok(E(L.pricing).find(p => p.item === 'smoke').installCost.avg === 65);
  assert.ok(E(L.rooms).find(r => r.room === 'PLANT ROOM').expectedDevices.some(d => d.device === 'heat' && d.presence === 1));
  assert.ok(fs.readFileSync(path.join(OUT, 'knowledge.bundle.js'), 'utf8').startsWith('/* generated'));
  // learning the same job again replaces it (no double counting)
  const n = E(L.symbols).find(s => s.deviceType === 'smoke').n; const L2 = db.save(OUT); assert.equal(E(L2.symbols).find(s => s.deviceType === 'smoke').n, n);
});

test('recognition: the consultant\'s next job without a legend — knowledge base lifts F1 from tags only to ≥ 99', async () => {
  const app = await openApp();
  try {
    const R0 = await analyse(app.page, [path.join(EVAL, 'project.pdf')], {});
    const R1 = await analyse(app.page, [path.join(EVAL, 'project.pdf')], { knowledgeBase: db.load(OUT), projectId: 'eval-acme-nolegend' });
    const s0 = scoreDevices(GT.devices, R0.detections), s1 = scoreDevices(GT.devices, R1.detections);
    assert.ok(s0.f1 < 40, `without knowledge only tagged devices are found: ${s0.f1}`);
    assert.ok(s1.f1 >= 99, JSON.stringify({ f1: s1.f1, misses: s1.misses.slice(0, 3), fa: s1.falseAlarms.slice(0, 3) })); assert.equal(s1.typeAccuracy, 100);
    assert.equal(R1.knowledge.consultant, 'Acme Fire Consulting'); assert.ok(R1.knowledge.known && R1.knowledge.historical === 4);
    assert.ok(R1.detections.some(d => /historical/.test(d.src) && /consultant/.test(d.src)));
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});
test.after(() => fs.rmSync(OUT, { recursive: true, force: true }));
