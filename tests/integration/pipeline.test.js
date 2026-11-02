// Integration: the real app in headless Chromium, synthetic project with exact ground truth.
//   PDF → Geometry → Legend → Detection → Lines        (implemented)
//   Detection → Graph → Network                       (Stage 4, not implemented: reported as todo)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { scoreDevices, scoreLength } = require('../lib/metrics');
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

test('Detection → Graph: devices joined by cabling into a graph', { todo: 'Stage 4 network-graph module not implemented' }, () => {});
test('Graph → Network: loops with device counts and loop lengths', { todo: 'Stage 4 loop-detection module not implemented' }, () => {});
test('Rooms: closed spaces with names and areas', { todo: 'Stage 3 room-detection module not implemented' }, () => {});
