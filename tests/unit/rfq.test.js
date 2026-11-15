// Unit: supplier quotes (src/quote/rfq.js) — packages from the bill, the sheet suppliers fill in, replies read back, levelling
const test = require('node:test'); const assert = require('node:assert'); const Q = require('../../src/quote/rfq.js');
const lines = [{ kind: 'item', k: 'spk_pend', sys: 'SPR', desc: 'Pendant sprinkler', qty: 120 }, { kind: 'item', k: 'spk_pend', sys: 'SPR', desc: 'Pendant sprinkler', qty: 30 },
  { kind: 'item', k: 'smoke', sys: 'DET', desc: 'Smoke detector', qty: 40 }, { kind: 'pipe', mk: 'GMS', dn: 50, sys: 'SPR', desc: 'DN50 GMS', qty: 210.4 },
  { kind: 'pipe', mk: 'GMS', dn: 50, sys: 'HYD', desc: 'DN50 GMS', qty: 20 }, { kind: 'pipe', mk: 'GMS', dn: 25, sys: 'SPR', desc: 'DN25 sprinkler drops / arm-overs', qty: 50, drop: true },
  { kind: 'item', k: 'smoke@remove', sys: 'DEMO', desc: 'Remove', qty: 3, demo: true }];
test('the bill for suppliers: items merged across levels, pipe merged across systems by size, removals left out; packages per system + pipe', () => {
  const R = Q.fromLines(lines);
  assert.deepEqual(R.map(r => [r.code, r.qty, r.unit]), [['I:spk_pend', 150, 'ea'], ['I:smoke', 40, 'ea'], ['P:GMS-50', 231, 'm'], ['P:GMS-25', 50, 'm']]);
  assert.equal(R.find(r => r.code === 'P:GMS-25').desc, 'DN25 pipe');
  assert.deepEqual(Q.packages(R, { SPR: 'Sprinkler', DET: 'Detection' }).map(p => [p.name, p.codes]), [['Sprinkler – equipment', ['I:spk_pend']], ['Detection – equipment', ['I:smoke']], ['Pipe and fittings', ['P:GMS-50', 'P:GMS-25']]]);
});
test('price sheet out, reply read back by code (or by description), quotes levelled; cheapest per line and incomplete quotes', () => {
  const R = Q.fromLines(lines), pkg = { id: 'p', name: 'All', codes: R.map(r => r.code), suppliers: [] };
  const sh = Q.sheetRows(pkg, R, { project: 'Hornsby', company: 'FPS' }); assert.deepEqual(sh[4].map(c => c.v), ['Code', 'Description', 'Qty', 'Unit', 'Rate $ ex GST', 'Amount $']);
  assert.deepEqual(sh[5].slice(0, 4), ['I:spk_pend', 'Pendant sprinkler', 150, 'ea']); assert.equal(sh[5][5].f, 'C6*E6'); assert.equal(sh[sh.length - 1][5].f, 'SUM(F6:F9)');
  // supplier A fills the sheet; supplier B sends their own layout with descriptions only
  const a = sh.map(r => r.slice()); a[5][4] = 14.5; a[6][4] = '$32.00'; a[7][4] = 18; a[8][4] = 9.1;
  const A = Q.readReply(a, R); assert.deepEqual(A, { 'I:spk_pend': 14.5, 'I:smoke': 32, 'P:GMS-50': 18, 'P:GMS-25': 9.1 });
  const B = Q.readReply([['Quote 4471'], ['Item', 'Description', 'Unit rate'], [1, 'Pendant sprinkler', 13.9], [2, 'DN50 GMS', 19.5]], R); assert.deepEqual(B, { 'I:spk_pend': 13.9, 'P:GMS-50': 19.5 });
  pkg.suppliers = [{ id: 'a', name: 'A', prices: A }, { id: 'b', name: 'B', prices: B }];
  const L = Q.level(pkg, R);
  assert.deepEqual(L.lines.map(l => l.best), ['b', 'a', 'a', 'a']); assert.equal(Math.round(L.totals.a), Math.round(150 * 14.5 + 40 * 32 + 231 * 18 + 50 * 9.1)); assert.equal(L.missing.b, 2); assert.equal(L.missing.a, undefined);
  assert.equal(Math.round(L.cheapest), Math.round(150 * 13.9 + 40 * 32 + 231 * 18 + 50 * 9.1));
  pkg.choice = 'cheapest'; assert.deepEqual(Q.chosenRates(pkg, R)['I:spk_pend'], { rate: 13.9, supplier: 'b' });
  pkg.choice = 'b'; assert.deepEqual(Object.keys(Q.chosenRates(pkg, R)), ['I:spk_pend', 'P:GMS-50']);
});
