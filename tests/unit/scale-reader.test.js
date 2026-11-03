// Unit: reading the scale from a boxed area — scale notes (with sheet-size correction) and scale bars
const test = require('node:test');
const assert = require('node:assert/strict');
const { readScale, paperOf } = require('../../src/fve/scale-reader.js');
const A1 = { w: 2384, h: 1684 }, A3 = { w: 1191, h: 842 };
const t = (s, x, y, w = s.length * 5, h = 8) => ({ s, x, y, w, h });

test('scale note: SCALE 1:100 → 1:100; text outside the box is ignored', () => {
  const r = readScale([t('SCALE', 100, 100), t('1:100', 135, 100), t('1:500', 900, 900)], [90, 90, 200, 110], A1);
  assert.equal(r.how, 'note'); assert.equal(r.ratio, 100); assert.ok(Math.abs(r.mPerUnit - 100 * 0.0254 / 72) < 1e-12);
  assert.equal(readScale([t('1 : 200', 100, 100)], [90, 90, 200, 110], A1).ratio, 200);
});

test('scale note with a sheet size: 1:100 @ A1 on an A1 sheet stays 1:100, printed on A3 it measures 1:200', () => {
  assert.equal(paperOf(A1), 'A1'); assert.equal(paperOf(A3), 'A3');
  const items = [t('1:100', 100, 100), t('@', 130, 100), t('A1', 140, 100)], box = [90, 90, 200, 110];
  const a = readScale(items, box, A1); assert.equal(a.ratio, 100); assert.equal(a.note, null);
  const b = readScale(items, box, A3); assert.ok(Math.abs(b.ratio - 200) < 1, String(b.ratio)); assert.deepEqual(b.note, { written: '1:100 @ A1', sheet: 'A3' });
  // two notes: the one for this sheet size wins
  assert.equal(readScale([t('1:100 @ A1', 100, 100, 50), t('1:200 @ A3', 100, 115, 50)], [90, 90, 200, 125], A3).ratio, 200);
});

test('scale bar: numbers 0 5 10 20 m along a line give metres per point; mm bars too', () => {
  const ptPerM = 1 / (100 * 0.0254 / 72); // 1 m at 1:100, in points
  const bar = [0, 5, 10, 20].map(v => t(String(v), 200 + v * ptPerM - 3, 300, 6)).concat([t('m', 200 + 20 * ptPerM + 10, 300, 6)]);
  const r = readScale(bar, [150, 280, 200 + 21 * ptPerM, 320], A1); assert.equal(r.how, 'bar'); assert.equal(r.ratio, 100); assert.deepEqual(r.bar, [0, 5, 10, 20]);
  const ptPerMM = ptPerM / 1000; const mmBar = [0, 1000, 2000].map(v => t(String(v), 200 + v * ptPerMM - 6, 300, 12)).concat([t('mm', 260, 300, 10)]);
  assert.equal(readScale(mmBar, [150, 280, 300, 320], A1).ratio, 100);
});

test('nothing readable: no text in the box, or text without a scale', () => {
  assert.equal(readScale([t('1:100', 900, 900)], [0, 0, 100, 100], A1).error, 'no-text');
  assert.equal(readScale([t('GROUND FLOOR PLAN', 10, 10, 80)], [0, 0, 100, 30], A1).error, 'no-scale');
});
