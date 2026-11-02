// Unit tests: AS 2444 (extinguishers / blankets), AS 2441 (hose reels), AS 1670.4 (EWS / EIS) and the combined compliance check.
// Rooms of known size at 1:100 (1 m = 1 / MPU points); expected results worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/fve/compliance/index.js');
const MPU = 100 * 25.4 / 72 / 1000, M = v => v / MPU;
const model = (id = 'p') => ({ page: { id, name: 'L1' }, sheet: { kind: 'plan' }, scale: { mPerUnit: MPU } });
const room = (name, type, W, H, x0 = 0, y0 = 0, page = 'p') => ({ page, name, type, area_m2: W * H, bb: [M(x0), M(y0), M(x0 + W), M(y0 + H)], pts: [[M(x0), M(y0)], [M(x0 + W), M(y0)], [M(x0 + W), M(y0 + H)], [M(x0), M(y0 + H)]] });
const dev = (type, x, y, page = 'p') => ({ page, type, x: M(x), y: M(y) });
const only = (std, dets, rooms, opts) => C.check([model()], dets, rooms, [], { ...opts, only: [std] }).findings;

test('AS 2444 4.2.1: 40 × 10 m floor, one extinguisher at one end leaves the far end beyond 15 m; two at 10 m and 30 m cover it', () => {
  const f = only('AS 2444', [dev('ext_abe', 1, 5)], [room('OFFICE', 'OFFICE', 40, 10)]);
  assert.equal(f.length, 1); assert.equal(f[0].rule, 'extinguisher-travel'); assert.equal(f[0].clause, '4.2.1'); assert.ok(f[0].verified);
  assert.ok(Math.abs(f[0].overM - (Math.hypot(39, 5) - 15)) < 1.2, String(f[0].overM));
  assert.deepEqual(only('AS 2444', [dev('ext_abe', 10, 5), dev('ext_abe', 30, 5)], [room('OFFICE', 'OFFICE', 40, 10)]), []);
  assert.deepEqual(only('AS 2444', [], [room('OFFICE', 'OFFICE', 40, 10)]), [], 'no extinguishers in the project: not checked');
});

test('AS 2444 Table 4.1: floor area per extinguisher only when the hazard class is stated', () => {
  const dets = [dev('ext_abe', 10, 5), dev('ext_abe', 30, 5)], rooms = [room('OFFICE', 'OFFICE', 40, 10)];   // 400 m², 2 × 2A
  assert.ok(!only('AS 2444', dets, rooms).some(f => f.rule === 'extinguisher-area'));
  // ordinary hazard, 2A covers 100 m² each → 200 m² < 400 m²: fail; light hazard, 2A covers 300 m² each → 600 m²: fine
  const o = only('AS 2444', dets, rooms, { rules: { as2444: { hazard: 'ordinary' } } }).find(f => f.rule === 'extinguisher-area'); assert.equal(o.limit, 200); assert.equal(o.value, 400);
  assert.ok(!only('AS 2444', dets, rooms, { rules: { as2444: { hazard: 'light' } } }).some(f => f.rule === 'extinguisher-area'));
  // complementing sprinklers: ordinary 2A covers 150 m² each → 300 m², still less than 400 m²
  assert.equal(only('AS 2444', dets, rooms, { rules: { as2444: { hazard: 'ordinary', sprinklered: true } } }).find(f => f.rule === 'extinguisher-area').limit, 300);
});

test('AS 2444 4.4.2 / 4.4.4: switchboard and cooking risks — distance 2–20 m and the right extinguisher closest', () => {
  const sw = room('MSB', 'SWITCH ROOM', 4, 4, 0, 0), kit = room('KITCHEN', 'KITCHEN', 4, 4, 30, 0);
  // switch room centre (2,2): CO2 at (6,2) = 4 m ✓; kitchen centre (32,2): nearest is the ABE at (27,2) = 5 m → not F-class
  const f = only('AS 2444', [dev('ext_co2', 6, 2), dev('ext_abe', 27, 2), dev('ext_abe', 15, 2)], [sw, kit]);
  assert.deepEqual(f.map(x => [x.rule, x.clause, x.level]), [['cooking-extinguisher', '4.4.4', 'warn']]);
  // a wet chemical closest to the kitchen fixes it; a switch room with the nearest unit 25 m away fails
  assert.deepEqual(only('AS 2444', [dev('ext_co2', 6, 2), dev('ext_wc', 28, 2), dev('ext_abe', 15, 2)], [sw, kit]), []);
  const far = only('AS 2444', [dev('ext_abe', 27, 2)], [sw]); assert.ok(far.some(x => x.rule === 'switchboard-extinguisher' && x.level === 'fail' && x.value === 25));
  assert.ok(only('AS 2444', [dev('ext_co2', 2.5, 2)], [sw]).some(x => x.level === 'advisory' && x.limit === 2), 'closer than 2 m');
});

test('AS 2441 10.2: 36 m hose + 4 m stream — straight line beyond 40 m fails, 30–40 m asks for the route; not in a stair', () => {
  const big = room('WAREHOUSE', 'STORE', 90, 10);
  // reel at (5,5): the far end (90, 0/10) is 85.1 m away → fail
  const f = only('AS 2441', [dev('hosereel', 5, 5)], [big]); assert.equal(f[0].rule, 'hose-reel-coverage'); assert.equal(f[0].level, 'fail'); assert.equal(f[0].limit, 40);
  // reels at 25 m and 65 m: worst point ~25.5 m → covered in a straight line, under 30 m → nothing to report
  assert.deepEqual(only('AS 2441', [dev('hosereel', 25, 5), dev('hosereel', 65, 5)], [big]), []);
  // reels at 12 m and 78 m: the middle (45 m) is 33 m from both → check the route
  const r = only('AS 2441', [dev('hosereel', 12, 5), dev('hosereel', 78, 5)], [big]); assert.deepEqual(r.map(x => [x.rule, x.level]), [['hose-reel-route', 'advisory']]);
  const st = only('AS 2441', [dev('hosereel', 2, 2)], [room('STAIR 1', 'STAIR', 4, 6)]); assert.ok(st.some(x => x.rule === 'hose-reel-in-exit' && x.clause === '10.1'));
});

test('AS 1670.4: WIP on each floor, bedrooms need a speaker, rooms without one, plant room VAD, recommended speaker grid', () => {
  const ms = [model('p'), { ...model('q'), page: { id: 'q', name: 'L2' } }];
  const rooms = [room('BED 1', 'BEDROOM', 4, 4, 0, 0), room('OFFICE', 'OFFICE', 12, 6, 10, 0), room('PLANT', 'PLANT ROOM', 5, 5, 30, 0), room('LOBBY', 'LOBBY', 4, 4, 0, 20, 'q')];
  // office 12 × 6 m with one speaker at its centre: reach 2.7·√2 = 3.82 m leaves the ends (6 m away) → grid advisory
  const dets = [dev('speaker', 16, 3), dev('speaker', 32.5, 2.5), dev('wip', 1, 30, 'q'), dev('speaker', 2, 22, 'q')];
  const f = C.check(ms, dets, rooms, [], { only: ['AS 1670.4'] }).findings.map(x => [x.rule, x.level, x.room || x.page]);
  assert.deepEqual(f, [['wip-per-floor', 'warn', 'p'], ['bedroom-speaker', 'warn', 'BED 1'], ['speaker-grid', 'advisory', 'OFFICE'], ['plant-vad', 'advisory', 'PLANT']]);
  assert.deepEqual(C.check(ms, [dev('speaker', 2, 2)], [room('X', 'OFFICE', 4, 4)], [], { only: ['AS 1670.4'] }).findings.map(x => x.rule), ['wip-none'], 'no EIS in the project: one note');
  assert.deepEqual(C.check(ms, [dev('smoke', 2, 2)], rooms, [], { only: ['AS 1670.4'] }).findings, [], 'no EWS devices: not checked');
});

test('combined: standards in order, most severe first, verified flags, per-standard summary', () => {
  const r = C.check([model()], [dev('smoke', 5, 5), dev('ext_abe', 1, 5)], [room('OFFICE', 'OFFICE', 40, 10)], []);
  assert.deepEqual(r.standards.map(s => [s.id, s.verified]), [['AS 1670.1', true], ['AS 1670.4', true], ['AS 2118.1', true], ['AS 2444', true], ['AS 2441', true]]);
  assert.equal(r.findings[0].level, 'fail'); assert.ok(r.findings.every((f, i) => !i || ['fail', 'warn', 'advisory', 'info'].indexOf(r.findings[i - 1].level) <= ['fail', 'warn', 'advisory', 'info'].indexOf(f.level)));
  assert.ok(r.findings.some(f => f.standard === 'AS 1670.1' && f.clause === '5.1.2' && f.verified)); assert.ok(r.findings.filter(f => f.verified === false).every(f => f.clause === null), 'only non-clause notes are unverified');
  assert.ok(r.byStandard['AS 2444'].fail === 1 && r.byStandard['AS 1670.1'].fail === 1);
});

test('AS 1670.4: rooms without a speaker are one question per sheet, listing the rooms', () => {
  const rooms = [room('STORE 1', 'STORE', 4, 4, 0, 0), room('STORE 2', 'STORE', 4, 4, 5, 0), room('WC', 'BATHROOM', 2, 2, 10, 0), room('OFFICE', 'OFFICE', 4, 4, 20, 0)];
  const f = C.check([model()], [dev('speaker', 22, 2), dev('wip', 23, 2)], rooms, [], { only: ['AS 1670.4'] }).findings;
  assert.deepEqual(f.map(x => [x.rule, x.value, x.rooms]), [['room-speaker', 2, ['STORE 1', 'STORE 2']]], 'WC exempt, office has one');
});

test('AS 2118.1 Light Hazard office 12 × 9 m: a 4 × 4.5 m grid of 6 heads complies; 4 heads fail area, spacing and walls', () => {
  const r = room('OFFICE', 'OFFICE', 12, 9), grid = [2, 6, 10].flatMap(x => [2.25, 6.75].map(y => dev('spk_pend', x, y)));
  // 108 m² / 6 = 18 m² ≤ 21 (9.4.2); 4 m and 4.5 m ≤ 4.8 m, 2 m / 2.25 m from walls ≤ 2.4 m (9.4.4)
  assert.deepEqual(only('AS 2118.1', grid, [r]), []);
  const four = only('AS 2118.1', [3, 9].flatMap(x => [2.25, 6.75].map(y => dev('spk_pend', x, y))), [r]);
  // 27 m² per head > 21; nearest head 4.5 m ≤ 4.8 (spacing fine) but 3 m from the end walls > 2.4 m → coverage
  assert.deepEqual(four.map(f => [f.rule, f.clause, f.level]), [['area-per-head', '9.4.2', 'fail'], ['coverage', '9.4.4 / 9.4.4', 'fail']]);
  assert.equal(four[0].value, 27); assert.ok(four.every(f => f.verified && f.standard === 'AS 2118.1'));
  // concealed-space heads protect the void, not the room: they do not count
  assert.ok(only('AS 2118.1', grid.map(d => ({ ...d, type: 'spk_space' })), [r]).length === 0, 'no room heads → not a sprinklered floor here');
});

test('AS 2118.1 reduced coverage (9.4.3), Ordinary Hazard (10.4), minimum distances (5.3 / 5.4), rooms without heads (3.1.1 / 3.1.3)', () => {
  // a 6 × 4 m kitchen in an LH building: one head = 24 m² > 12 m² (9.4.3); two at 1.5 m and 4.5 m: 12 m², 3 m apart, 1.5 m / 2 m from walls
  // (and it sits 3 m from the end walls > 2.1 m)
  assert.deepEqual(only('AS 2118.1', [dev('spk_pend', 3, 2)], [room('KITCHEN', 'KITCHEN', 6, 4)]).map(f => [f.rule, f.clause]), [['area-per-head', '9.4.3'], ['coverage', '9.4.3 / 9.4.3']]);
  assert.deepEqual(only('AS 2118.1', [dev('spk_pend', 1.5, 2), dev('spk_pend', 4.5, 2)], [room('KITCHEN', 'KITCHEN', 6, 4)]), []);
  // the compliant LH office grid under Ordinary Hazard: 18 m² > 12 m² (10.4.2) and 2.25 m from the side walls > 2.1 m (10.4.6)
  const grid = [2, 6, 10].flatMap(x => [2.25, 6.75].map(y => dev('spk_pend', x, y)));
  assert.deepEqual(only('AS 2118.1', grid, [room('OFFICE', 'OFFICE', 12, 9)], { rules: { as2118: { hazard: 'OH' } } }).map(f => [f.rule, f.clause]), [['area-per-head', '10.4.2'], ['coverage', '10.4.4 / 10.4.6']]);
  // car parks are OH whatever the building (A3.2)
  assert.ok(only('AS 2118.1', grid, [room('CAR PARK', 'CARPARK', 12, 9)]).some(f => f.clause === '10.4.2'));
  const close = only('AS 2118.1', [dev('spk_pend', 1, 2), dev('spk_pend', 2.5, 2), dev('spk_pend', .05, 3.5)], [room('STORE 2', 'STORE', 4, 4)]);
  assert.ok(close.some(f => f.rule === 'min-spacing' && f.clause === '5.3' && f.value === 1.5)); assert.ok(close.some(f => f.rule === 'wall-min' && f.clause === '5.4'));
  const none = only('AS 2118.1', [dev('spk_pend', 2, 2)], [room('OFFICE', 'OFFICE', 4, 4), room('STORE 1', 'STORE', 4, 4, 10, 0), room('STAIR 1', 'STAIR', 3, 5, 20, 0)]);
  assert.deepEqual(none.map(f => [f.rule, f.clause, f.level, f.room]), [['no-sprinklers', '3.1.1', 'warn', 'STORE 1'], ['no-sprinklers', '3.1.3', 'advisory', 'STAIR 1']]);
  assert.deepEqual(only('AS 2118.1', [dev('smoke', 2, 2)], [room('OFFICE', 'OFFICE', 4, 4)]), [], 'no sprinklers in the project: not checked');
});
