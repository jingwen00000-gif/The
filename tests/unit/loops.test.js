// Unit tests: loop engine (drawn + estimated loops), room engine (rooms, expectations from finished jobs), rates from finished jobs.
const test = require('node:test');
const assert = require('node:assert/strict');
const FVE = require('../../app/fve.js');
require('../../src/fve/symbol-engine/index.js'); require('../../src/learning-engine/room-extractor.js');
const LOOPS = require('../../src/fve/network/loop-engine.js');
const ROOMS = require('../../src/fve/rooms/room-engine.js');
const RATES = require('../../src/fve/rates-from-history.js');
const { FakePage, OPS } = require('../lib/fakepdf');
const MPU = 100 * 25.4 / 72 / 1000;
const plan = async draw => { const p = new FakePage(); p.color('000000', .8).rect(10, 10, p.w - 20, p.h - 20); p.line(p.w - 150, 10, p.w - 150, p.h - 10); draw(p); const m = await FVE.buildModel(p, OPS, { id: 'p1', name: 'p1' }); m.sheet = { kind: 'plan' }; m.scale = { ratio: 100, mPerUnit: MPU }; return m; };
const det = (type, x, y) => ({ page: 'p1', type, x, y, w: 9.6, h: 9.6 });
const LT = { id: 'lt0', cls: 'cable', desc: 'FIRE DETECTION LOOP CABLE', stroke: 'ff8000', w: .6, dashed: true };

test('drawn loop: dashed cable traced, devices it turns at are on it in order, a device it only passes is not', async () => {
  const pts = [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]];
  const m = await plan(p => p.color('ff8000', .6, [4, 2]).poly(pts));
  const dets = [det('fip', 100, 100), det('smoke', 300, 100), det('heat', 300, 300), det('smoke', 100, 300), det('smoke', 200, 112), det('speaker', 300, 200)];
  const L = LOOPS.detect([m], { lineTypes: [LT], zones: {} }, dets, { FVE });
  assert.equal(L.length, 1); const l = L[0];
  assert.equal(l.source, 'drawn'); assert.ok(l.closed && l.panel); assert.equal(l.devices, 3, 'the smoke detector 12 pt off the cable run is not on it');
  assert.equal(l.pattern, 'FIP->SD->HD->SD'); assert.ok(Math.abs(l.length_m - 800 * MPU) < .3, String(l.length_m)); assert.deepEqual(l.mix, { fip: 1, smoke: 2, heat: 1 });
});

test('drawn loop: a cable broken at device symbols is one loop; radial (open) loops are not closed', async () => {
  const m = await plan(p => { p.color('ff8000', .6).line(100, 100, 196, 100); p.line(204, 100, 296, 100); p.line(304, 100, 400, 100); });
  const L = LOOPS.detect([m], { lineTypes: [{ ...LT, dashed: false }], zones: {} }, [det('smoke', 200, 100), det('smoke', 300, 100), det('mcp', 400, 100), det('fip', 100, 100)], { FVE });
  assert.equal(L.length, 1); assert.equal(L[0].chains, 3); assert.equal(L[0].devices, 3); assert.ok(!L[0].closed); assert.equal(L[0].sequence[0], 'FIP');
});

test('estimated loops: orthogonal route from the panel, split at the device limit, slack and drops, labelled; covered devices skipped', async () => {
  const m = await plan(() => {});
  const dets = [det('fip', 50, 50)]; for (let i = 0; i < 10; i++) dets.push(det('smoke', 100 + i * 50, 100)); dets.push(det('speaker', 100, 400), det('speaker', 200, 400));
  const E = LOOPS.estimate([m], dets, [], { maxDevices: 6 });
  const d = E.filter(l => l.circuit === 'detection'); assert.deepEqual(d.map(l => l.devices), [6, 4]); assert.ok(d.every(l => l.source === 'estimated' && l.closed && l.panel && l.note === 'no cable drawn'));
  // route: FIP (50,50) → 6 detectors along y=100 → back to the FIP: |dx|+|dy| = 50+50 + 250 + (300+50) = 700 pt
  assert.equal(d[0].paper, 700); assert.ok(Math.abs(d[0].length_m - (700 * MPU * 1.1 + 6 * 1.5)) < .01);
  assert.equal(E.find(l => l.circuit === 'ewis').devices, 2);
  assert.equal(LOOPS.estimate([m], dets, new Set(dets.filter(x => x.type === 'smoke')), {}).filter(l => l.circuit === 'detection').length, 0);
  const r = LOOPS.route([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 20, y: 0 }], null, false); assert.deepEqual(r.order.map(p => p.x), [0, 5, 10, 20]); assert.equal(r.L, 20);
  const R = LOOPS.run([m], { lineTypes: [], zones: {} }, dets, { knowledge: { loops: { metresPerDevice: { n: 4, avg: 8 } } } }); assert.equal(R[0].historical_m, R[0].devices * 8);
  assert.equal(LOOPS.circuitOfType('speaker'), 'ewis'); assert.equal(LOOPS.circuitOfType('spk_pend'), null);
});

test('rooms: detected on the project; finished jobs\' expectations raise questions, not devices', async () => {
  const m = await plan(p => { p.color('000000', 1).rect(60, 60, 200, 150); p.text(120, 180, 'PLANT ROOM', 6); p.rect(300, 60, 200, 150); p.text(360, 180, 'OFFICE', 6); });
  const rooms = ROOMS.detect([m], [det('smoke', 100, 100), det('smoke', 400, 100)], { FVE });
  assert.deepEqual(rooms.map(r => [r.type, r.devices]), [['PLANT ROOM', { smoke: 1 }], ['OFFICE', { smoke: 1 }]]); assert.equal(rooms[0].page, 'p1');
  const K = { rooms: [{ room: 'PLANT ROOM', n: 6, expectedDevices: [{ device: 'heat', presence: .9 }, { device: 'smoke', presence: .3 }] }, { room: 'OFFICE', n: 2, expectedDevices: [{ device: 'speaker', presence: 1 }] }] };
  const W = ROOMS.expectations(rooms, K); assert.equal(W.length, 1); assert.equal(W[0].code, 'room-expectation'); assert.equal(W[0].device, 'heat'); assert.equal(W[0].level, 'ask');
  assert.deepEqual(ROOMS.expectations(rooms, null), []);
});

test('rates from finished jobs: suggestions from the pricing library, applied to items, work-type overrides and cable', () => {
  const S = { rates: { labour: 100, items: { smoke: { m: 45, h: .5 } }, pipe: { 'CBH-1': { m: 1, h: .05 } } } };
  const ctx = { labourRate: v => v, items: { smoke: {}, heat: {} }, label: k => k, cost: k => k === 'smoke' ? 95 : 70 };
  const KB = { pricing: { schema: 'x', entries: [
    { item: 'smoke', supplyCost: { n: 3, median: 40 }, installCost: { n: 3, median: 70 }, rate: { n: 3, median: 110 }, sources: { A: 1, B: 1, C: 1 } },
    { item: 'smoke@remove', rate: { n: 2, median: 60 }, labourRatio: { n: 2, median: 1 }, sources: { A: 1, B: 1 } },
    { item: 'cable_fip', supplyCost: { n: 1, median: 1.6 }, installCost: { n: 1, median: 4.4 }, sources: { A: 1 } }, { item: 'pipe', rate: { n: 1, median: 30 }, sources: { A: 1 } }] } };
  const rows = RATES.suggestions(KB, S, ctx);
  assert.deepEqual(rows.map(r => r.key).sort(), ['cable_fip', 'smoke', 'smoke@remove'], 'only items the app prices');
  const sm = rows.find(r => r.key === 'smoke'); assert.deepEqual(sm.set, { m: 40, h: .7 }); assert.equal(sm.diffPct, 16); assert.equal(sm.n, 3);
  assert.deepEqual(rows.find(r => r.key === 'smoke@remove').set, { m: 0, h: .6 });
  assert.equal(RATES.apply(S, rows), 3); assert.deepEqual(S.rates.items.smoke, { m: 40, h: .7 }); assert.deepEqual(S.rates.actRates['smoke@remove'], { m: 0, h: .6 }); assert.deepEqual(S.rates.pipe['CBH-1'], { m: 1.6, h: .044 });
  assert.ok(S.rateSrc.history);
});

test('network layer: the device mix finished jobs found on this kind of circuit is a prior', () => {
  const M = require('../../src/fve/symbol-engine/index.js');
  const nets = { p: [{ id: 'n1', desc: 'FIRE DETECTION LOOP CABLE', segs: [[[0, 0], [100, 0]]], bb: [0, 0, 100, 0] }] }; const c = { page: 'p', c: [50, 1], size: 6, ref: 1 };
  const base = M.network.score(c, { networks: nets }).scores, k = M.network.score(c, { networks: nets, knowledge: { networkPriors: [{ circuit: 'detection', loops: 4, share: { smoke: .8, heat: .15 } }] } }).scores;
  assert.equal(base.smoke, .5); assert.ok(k.smoke > .7 && k.heat === .5);
  const one = M.network.score(c, { networks: nets, knowledge: { networkPriors: [{ circuit: 'detection', loops: 1, share: { smoke: .9 } }] } }).scores; assert.equal(one.smoke, .5, 'one loop is not a pattern yet');
});
