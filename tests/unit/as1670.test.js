// Unit tests: AS 1670.1:2018 checks on rooms of known size (1:100, so 1 m = 1 / MPU points); expectations worked out by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../src/fve/compliance/as1670-1.js');
const MPU = 100 * 25.4 / 72 / 1000, M = v => v / MPU;
const model = (id = 'p') => ({ page: { id, name: 'L1' }, sheet: { kind: 'plan' }, scale: { mPerUnit: MPU } });
const room = (name, type, W, H, x0 = 10, y0 = 10) => ({ page: 'p', name, type, area_m2: W * H, bb: [M(x0), M(y0), M(x0 + W), M(y0 + H)], pts: [[M(x0), M(y0)], [M(x0 + W), M(y0)], [M(x0 + W), M(y0 + H)], [M(x0), M(y0 + H)]] });
const dev = (type, x, y) => ({ page: 'p', type, x: M(x), y: M(y) });
const base = [dev('mcp', 1, 1), dev('fip', 2, 1)];
const rules = f => f.findings.map(x => x.rule);

test('5.1.2 / 4.1.2 coverage: any point within 7 m (smoke) / 5 m (heat) of a detector', () => {
  const r = room('OFFICE 1', 'OFFICE', 20, 9);
  // one smoke detector at the centre (20, 14.5): corner 10.97 m away > 7 m → fail
  const one = A.check([model()], [dev('smoke', 20, 14.5), ...base], [r], []).findings.find(f => f.rule === 'coverage');
  assert.equal(one.clause, '5.1.2'); assert.ok(Math.abs(one.overM - (Math.hypot(10, 4.5) - 7)) < .4, String(one.overM));
  // two at 5 m and 15 m along the room: corners √(5² + 4.5²) = 6.73 m ≤ 7 m, and 10 m apart ≤ 10 m → nothing
  assert.deepEqual(rules(A.check([model()], [dev('smoke', 15, 14.5), dev('smoke', 25, 14.5), ...base], [r], [])), []);
  // the same two as heat detectors: 6.73 m > 5 m (4.1.2), and 10 m apart > 7 m (4.1.2)
  const h = A.check([model()], [dev('heat', 15, 14.5), dev('heat', 25, 14.5), ...base], [r], []).findings;
  assert.deepEqual(h.map(x => [x.rule, x.clause]).sort(), [['coverage', '4.1.2'], ['detector-spacing', '4.1.2']]);
  assert.equal(h.find(x => x.rule === 'detector-spacing').value, 10);
  // limits are parameters (another ceiling profile / listing)
  assert.deepEqual(rules(A.check([model()], [dev('heat', 15, 14.5), dev('heat', 25, 14.5), ...base], [r], [], { rules: { coverage: { heatReachM: 7 }, spacing: { heatM: 10 } } })), []);
});

test('4.1.4 / 5.1.4 wall gap, 3.28 locations without detectors, C3.2 nuisance advisory', () => {
  const f = A.check([model()], [dev('smoke', 32.5, 12.5), dev('smoke', 10.2, 12), ...base],
    [room('MEETING 2', 'MEETING ROOM', 6, 5), room('STORE 1', 'STORE', 4, 4, 0, 40), room('WC', 'BATHROOM', 1.5, 2, 0, 30), room('BATH 2', 'BATHROOM', 2, 2.5, 5, 30), room('KITCHEN', 'KITCHEN', 5, 5, 30, 10)], []);
  // MEETING 2: 0.2 m from the wall (far corner 6.5 m: covered); STORE 1: nothing; WC 3 m² < 3.5 m²: exempt; BATH 2 5 m²: not exempt
  assert.deepEqual(f.findings.map(x => [x.rule, x.clause, x.level, x.room]), [['wall-gap', '5.1.4', 'warn', 'MEETING 2'], ['no-detection', '3.28', 'warn', 'STORE 1'], ['no-detection', '3.28', 'warn', 'BATH 2'], ['detector-type', 'C3.2', 'advisory', 'KITCHEN']]);
  assert.equal(f.findings[0].value, .2); assert.ok(f.findings.every(x => x.verified));
});

test('2.6 isolators every 40 devices; panel capacity is not a clause; 3.14.2 one MCP on the project; panel noted', () => {
  const ms = [model(), { ...model('q'), page: { id: 'q', name: 'L2' } }];
  const f = A.check(ms, [dev('smoke', 5, 5), { ...dev('heat', 5, 5), page: 'q' }], [],
    [{ id: 'L1', page: 'p', circuit: 'detection', devices: 90, source: 'drawn' }, { id: 'L2', page: 'p', circuit: 'detection', devices: 300, source: 'estimated' }, { id: 'E1', page: 'p', circuit: 'ewis', devices: 500 }]);
  const by = r => f.findings.filter(x => x.rule === r);
  assert.deepEqual(by('isolators').map(x => [x.value, x.clause]), [[3, '2.6'], [8, '2.6']]); assert.equal(f.isolators, 11);
  assert.deepEqual(by('loop-capacity').map(x => [x.loop, x.clause, x.verified]), [['L2', null, false]]);
  assert.deepEqual(by('mcp').map(x => x.clause), ['3.14.2']); assert.equal(by('fip').length, 1);
  assert.ok(!A.check(ms, [dev('smoke', 5, 5), { ...dev('mcp', 6, 6), page: 'q' }], [], []).findings.some(x => x.rule === 'mcp'), 'one MCP anywhere satisfies 3.14.2');
});
