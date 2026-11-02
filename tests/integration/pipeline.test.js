// Integration: the real app in headless Chromium, synthetic project with exact ground truth.
//   PDF → Geometry → Legend → Detection → Lines        (implemented)
//   Detection → Graph → Network, Rooms               (loop engine, room engine)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { scoreDevices, scoreLength, scoreLoops, scoreRooms } = require('../lib/metrics');
const DS = path.join(__dirname, '../datasets/synthetic-basic');
const GT = require(path.join(DS, 'ground-truth.json'));

let app, R;
test.before(async () => { app = await openApp(); R = await analyse(app.page, [path.join(DS, 'project.pdf')]); });
test.after(async () => { if (app) await app.browser.close(); });

test('PDF → Geometry: every sheet read, typed and scaled', () => {
  assert.deepEqual(R.pages.map(p => p.sheet), ['cover', 'legend', 'plan', 'plan']);
  for (const p of R.pages.filter(p => p.sheet === 'plan')) { assert.equal(p.scale.ratio, 100); assert.ok(p.kinds.circle > 10 && p.kinds.rect > 10 && p.kinds.line > 10 && p.kinds.polygon > 0, JSON.stringify(p.kinds)); }
  assert.ok(R.ms.geometry < 5000, `geometry ${R.ms.geometry} ms`);
  assert.deepEqual(app.errors, []);
});

test('Geometry → Legend: project dictionary', () => {
  assert.deepEqual(R.dict.symbols.map(s => s.type).sort(), ['heat', 'mcp', 'smoke', 'speaker']);
  assert.deepEqual(R.dict.lineTypes.filter(l => l.cls).map(l => l.cls).sort(), ['cable', 'pipe', 'pipe']);
  assert.equal(R.dict.tagType.WIP, 'wip');
});

test('Geometry → Detection: F1 ≥ 99 % against ground truth, nothing on cover or legend', () => {
  const s = scoreDevices(GT.devices, R.detections);
  assert.ok(s.f1 >= 99, JSON.stringify({ f1: s.f1, misses: s.misses.slice(0, 5), falseAlarms: s.falseAlarms.slice(0, 5) }));
  assert.equal(s.typeAccuracy, 100);
  assert.ok(!R.detections.some(d => d.page < 2), 'detections on cover / legend sheet');
});

test('Detection → Lines: pipe and cable lengths within 1 %', () => {
  for (const [desc, exp] of Object.entries(GT.lines)) {
    const got = R.lines.find(l => l.desc === desc); assert.ok(got, 'missing line type ' + desc);
    const e = scoreLength(exp, got.total_m); assert.ok(e.errorPct < 1, `${desc}: ${JSON.stringify(e)}`);
  }
});

test('Detection → Graph: devices joined by the legend\'s loop cable, ordered along it', () => {
  const drawn = R.loops.filter(l => l.source === 'drawn');
  assert.equal(drawn.length, 2); assert.ok(drawn.every(l => l.circuit === 'detection' && l.closed && l.chains === 1));
  // every device the generator put on the loop is a member, in the order the cable visits them
  for (const l of drawn) { const on = GT.devices.filter(d => d.page === l.page && d.how === 'legend' && /smoke|heat/.test(d.type));
    assert.ok(on.every(d => l.members.some(m => Math.hypot(m[0] - d.x, m[1] - d.y) < 3)), 'loop member missing');
    const idx = on.map(d => l.members.findIndex(m => Math.hypot(m[0] - d.x, m[1] - d.y) < 3)); const steps = idx.slice(1).map((v, k) => (v - idx[k] + l.members.length) % l.members.length);
    assert.ok(steps.every(v => v === 1 || v === 2) || steps.every(v => v === l.members.length - 1 || v === l.members.length - 2), 'members follow the cable: ' + steps.join(',')); }
});
test('Graph → Network: loops with device counts and loop lengths against ground truth; estimates for devices no cable reaches', async () => {
  const s = scoreLoops(GT.networks, R.loops);
  assert.equal(s.accuracy, 100, JSON.stringify(s.loops)); assert.equal(s.lengthErrorPct, 0);
  const est = R.loops.filter(l => l.source === 'estimated'); assert.ok(est.length >= 2 && est.every(l => l.length_m > 0)); assert.ok(est.every(l => l.note === (l.circuit === 'detection' ? 'devices the drawn cable does not reach' : 'no cable drawn')));
  assert.ok(est.some(l => l.circuit === 'ewis' && /^SPK/.test(l.pattern)));
  // the estimator on the looped devices themselves, against the drawn cable (generator route: room order, not shortest): within 35 %
  const LOOPS = require('../../src/fve/network/loop-engine.js'); const MPU = 100 * 25.4 / 72 / 1000;
  for (const l of R.loops.filter(x => x.source === 'drawn')) {
    const dets = l.members.map(([x, y, type]) => ({ page: l.page, x, y, type })); const pg = R.pages[l.page];
    const [e] = LOOPS.estimate([{ page: { id: l.page, w: pg.w, h: pg.h }, sheet: { kind: 'plan' }, scale: { mPerUnit: MPU } }], dets, [], {});
    assert.equal(e.devices, l.devices); const err = Math.abs(e.length_m - l.length_m) / l.length_m; assert.ok(err < .35, `estimate ${e.length_m} m vs drawn ${l.length_m} m`);
  }
});
test('Rooms: closed spaces with names and areas', () => {
  const s = scoreRooms(GT.rooms, R.rooms); assert.equal(s.roomDetection, 100); assert.equal(s.areaAccuracy, 100);
  assert.ok(R.rooms.find(r => r.type === 'PLANT ROOM').devices.heat >= 1);
});
test('AS 1670: a room whose half-diagonal exceeds the detector reach fails coverage; smoke in a kitchen is flagged; no panel noted', () => {
  const C = R.compliance; assert.ok(C.findings.every(f => f.rule && f.level && f.msg));
  // synthetic rooms are 8.2 × 7.9 m: half-diagonal 5.7 m > heat reach 7.2 / √2 = 5.09 m, so one heat detector cannot cover one
  const oneHeat = R.rooms.filter(r => r.devices.heat === 1 && !r.devices.smoke); assert.ok(oneHeat.length >= 1);
  for (const r of oneHeat) assert.ok(C.findings.some(f => f.rule === 'coverage' && f.level === 'fail' && f.room === r.name && f.page === r.page), r.name);
  const kitchenSmoke = R.rooms.filter(r => r.type === 'KITCHEN' && r.devices.smoke); assert.equal(C.findings.filter(f => f.rule === 'detector-type').length, kitchenSmoke.length);
  assert.ok(C.findings.some(f => f.rule === 'fip')); assert.ok(!C.findings.some(f => f.rule === 'mcp'), 'every plan has a call point');
});
