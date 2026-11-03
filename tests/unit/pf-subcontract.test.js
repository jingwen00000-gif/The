// Unit: the Shield Passive Fire price list — item lookup by service, wall / slab and size band (pure part of the app's lookup)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../app/index.html'), 'utf8');
const grab = name => { const a = src.indexOf(name); assert.ok(a > 0, name); let i = src.indexOf('{', a), d = 0; for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(a, j + 1); } };
const PSVC = { PVC: {}, FW: {}, CU: {}, CUL: {}, STL: {}, CAB: {}, CON: {}, TRAY: { area: true }, EMPTY: {} };
const SH = eval('(' + grab('const PF_SUB_SHIELD=').replace(/^const PF_SUB_SHIELD=/, '') + ')');
const pfSubItem = eval('(' + grab('function pfSubItem(') + ')');

test('Shield price list: the right item for each penetration; what it does not price falls back', () => {
  const p = (svc, size, sub) => { const i = pfSubItem(SH, svc, size, sub); return i ? i.n + ' $' + i.price : null; };
  assert.equal(p('PVC', 100, 'PB'), '6 $350'); assert.equal(p('PVC', 100, 'SLAB'), '5 $250'); assert.equal(p('FW', 100, 'SLAB'), '4 $380');
  assert.equal(p('STL', 50, 'PB'), '8 $180'); assert.equal(p('STL', 80, 'PB'), '9 $230'); assert.equal(p('STL', 100, 'CONW'), '9 $230'); assert.equal(p('STL', 150, 'PB'), null, 'over 114 mm OD: not priced');
  assert.equal(p('STL', 65, 'SLAB'), '10a $170'); assert.equal(p('STL', 100, 'SLAB'), '11 $230');
  assert.equal(p('CAB', 10, 'PB'), '1 $120'); assert.equal(p('CAB', 50, 'SLAB'), '2 $400'); assert.equal(p('TRAY', 'm2', 'PB'), '3 $550'); assert.equal(p('TRAY', 'm2', 'SLAB'), null);
  assert.equal(p('CON', 25, 'MAS'), '14 $250'); assert.equal(p('CUL', 25, 'PB'), '12 $300'); assert.equal(p('CU', 25, 'PB'), null); assert.equal(p('CUL', 25, 'SLAB'), null);
  assert.equal(SH.items.length, 17); assert.equal(SH.excl.length, 15); assert.ok(SH.items.filter(i => !i.auto).every(i => /batt|alarm|Bulkhead/i.test(i.desc)), 'reference-only items');
});
