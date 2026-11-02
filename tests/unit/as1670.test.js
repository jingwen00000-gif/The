// Unit tests: AS 1670.1 checks on rooms of known size (1:100, so 1 m = 1 / MPU points).
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../src/fve/compliance/as1670-1.js');
const MPU = 100 * 25.4 / 72 / 1000, M = v => v / MPU;
const model = (id = 'p') => ({ page: { id, name: 'L1' }, sheet: { kind: 'plan' }, scale: { mPerUnit: MPU } });
// a W × H m room with its top-left corner at (10, 10) m
const room = (name, type, W, H, x0 = 10, y0 = 10) => ({ page: 'p', name, type, area_m2: W * H, bb: [M(x0), M(y0), M(x0 + W), M(y0 + H)], pts: [[M(x0), M(y0)], [M(x0 + W), M(y0)], [M(x0 + W), M(y0 + H)], [M(x0), M(y0 + H)]] });
const dev = (type, x, y) => ({ page: 'p', type, x: M(x), y: M(y) });
const rules = f => f.findings.map(x => x.rule);

test('coverage: 20 × 10 m room — one smoke detector leaves the corners (11.2 m away > 7.35 m), two at 5 m and 15 m cover it; heat needs more', () => {
  const r = room('OFFICE 1', 'OFFICE', 20, 10), base = [dev('mcp', 11, 11), dev('fip', 12, 11)];
  const one = A.check([model()], [dev('smoke', 20, 15), ...base], [r], []);
  const c = one.findings.find(f => f.rule === 'coverage'); assert.ok(c && c.level === 'fail'); assert.ok(Math.abs(c.overM - (Math.hypot(10, 5) - 10.4 / Math.SQRT2)) < .4, String(c.overM));
  assert.deepEqual(rules(A.check([model()], [dev('smoke', 15, 15), dev('smoke', 25, 15), ...base], [r], [])), [], 'corners at 7.07 m are within 7.35 m');
  assert.deepEqual(rules(A.check([model()], [dev('heat', 15, 15), dev('heat', 25, 15), ...base], [r], [])), ['coverage'], 'heat reach is 7.2 / √2 = 5.09 m');
  // the limits are parameters
  assert.deepEqual(rules(A.check([model()], [dev('heat', 15, 15), dev('heat', 25, 15), ...base], [r], [], { rules: { coverage: { heatSpacing: 10.4 } } })), []);
});

test('rooms: no detector (exempt types skipped), smoke in a kitchen, detector against the wall', () => {
  const base = [dev('mcp', 1, 1), dev('fip', 2, 1)];
  const f = A.check([model()], [dev('smoke', 32.5, 12.5), dev('smoke', 10.2, 12), ...base],
    [room('MEETING 2', 'MEETING ROOM', 6, 5), room('STORE 1', 'STORE', 4, 4, 0, 40), room('WC', 'BATHROOM', 3, 3, 0, 30), room('KITCHEN', 'KITCHEN', 5, 5, 30, 10)], []);
  // MEETING 2: its detector 0.2 m from the wall (its far corner, 6.5 m away, is still covered); STORE 1: nothing; WC: exempt; KITCHEN: smoke
  assert.deepEqual(f.findings.map(x => [x.rule, x.level, x.room]), [['wall-gap', 'warn', 'MEETING 2'], ['no-detection', 'warn', 'STORE 1'], ['detector-type', 'advisory', 'KITCHEN']]);
  assert.equal(f.findings[0].value, .2); assert.equal(f.checkedRooms, 4);
});

test('loops: isolators every 40 devices, panel capacity; plans need a manual call point; the project a panel', () => {
  const f = A.check([model(), { ...model('q'), page: { id: 'q', name: 'L2' } }], [dev('smoke', 5, 5), { ...dev('heat', 5, 5), page: 'q' }, { ...dev('mcp', 6, 6), page: 'q' }], [],
    [{ id: 'L1', page: 'p', circuit: 'detection', devices: 90, source: 'drawn' }, { id: 'L2', page: 'p', circuit: 'detection', devices: 300, source: 'estimated' }, { id: 'E1', page: 'p', circuit: 'ewis', devices: 500 }]);
  const by = r => f.findings.filter(x => x.rule === r);
  assert.deepEqual(by('isolators').map(x => x.value), [3, 8]); assert.equal(f.isolators, 11);
  assert.deepEqual(by('loop-capacity').map(x => x.loop), ['L2']); assert.deepEqual(by('mcp').map(x => x.page), ['p']); assert.equal(by('fip').length, 1);
  assert.deepEqual(Object.keys(f.summary).sort(), ['info', 'warn']); assert.equal(f.findings[0].level, 'warn', 'most severe first');
});
