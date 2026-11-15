// Unit: a company profile from an Estimate Master Sheet style workbook (src/company/master-sheet.js) — synthetic sheets, same layout
const test = require('node:test'); const assert = require('node:assert'); const M = require('../../src/company/master-sheet.js');
const S = [
  { name: 'Sheet1', rows: [[null, null, null, null, null, 'Contingency', null, 0.1, 'of cost'], ['Gross Margin (GM%):', 0.15, 'A', 'B']] },
  { name: '4. Price Schedule', rows: [[], ['Sprinkler Head', 'UNIT', 'Material', 'Labour', 'Painting'], ['Exposed Sprinkler', 'Each sprinkler', 98, 75, 9], ['Under Duct', 'Each sprinkler', 120, 150],
    ['Concealed', 'Each sprinkler', 20, 20], ['Semi-recessed', 'Each sprinkler', 120, 155], [], ['Sprinkler Main', null, 'Material', 'Labour'], ['100mm', 'Per Meter', 61, 18.5], ['50mm', 'Per Meter', 35.71, 18],
    [], ['Fire Sprinkler DLP', null, 'Material', 'Labour'], ['Admin', 'Per Project', null, 1500], [], ['FHR', null, 'Material', 'Labour'], ['New', null, 250, 250]] },
  { name: 'FireSense', rows: [[null, null, null, null, 'QTY', 'COST', 'HRS', 'TOTAL COST', 'TOTAL HRS', 'HRS COST'], [], [null, 'Panel', null, null, null, null, null, null, null, 90],
    ['AFP-3030/900-1L-PS5', 'AFP-3030 1-loop, NPS-5 in CAB900', null, null, 0, 3580, 8], ['FSP-851AUS-IV', 'FlashScan PhotoSmoke Detector', null, null, 0, 70, 0.33], ['B501AUS-IV', 'Addressable Detector Base', null, null, 0, 8, 0],
    [null, 'RED 1.5mm2 Twisted - Detector Loop', null, null, null, 0.95, 0.04]] }];
test('reads margin, contingency, labour rate; maps price schedule rows; builds detection items from FireSense parts', () => {
  const P = M.parse(S);
  assert.deepEqual(P.settings, { gm: 15, cont: 10, labour: 90 });
  assert.deepEqual(P.rows.map(r => [r.name, r.m, r.l, r.keys.join(',')]), [['Exposed Sprinkler', 107, 75, 'spk_up,spk_resx,spk_bccom,spk_bcres'], ['Under Duct', 120, 150, 'spk_duct'], ['Concealed', 20, 20, ''],
    ['Semi-recessed', 120, 155, 'spk_pend,spk_semi'], ['100mm', 61, 18.5, 'P:GMS-100'], ['50mm', 35.71, 18, 'P:GMS-50'], ['Admin', 0, 1500, ''], ['New', 250, 250, 'hosereel']]);
  assert.deepEqual(P.dry.find(d => d.key === 'smoke'), { key: 'smoke', parts: ['FSP-851AUS-IV', 'B501AUS-IV'], m: 78, h: 0.33 });
  assert.deepEqual(P.dry.find(d => d.key === 'fip'), { key: 'fip', parts: ['AFP-3030/900-1L-PS5'], m: 3580, h: 8 });
  assert.equal(P.catalog.find(c => /Detector Loop/.test(c.desc)).unit, 'm');
});
test('company pack: labour kept as hours × rate, gross margin as an equal mark-up, overrides respected, unmatched rows to the materials library', () => {
  const P = M.parse(S), pk = M.pack(P, { name: 'Example Fire Pty Ltd', prefix: 'EXF', rows: { 2: ['spk_space'] }, today: '2026-11-15' });
  const c = pk.companies[0], R = c.rates.fs;
  assert.equal(pk.type, 'company-pack'); assert.equal(c.id, 'co_exf'); assert.equal(R.labour, 90); assert.equal(R.margin, 17.65); assert.equal(R.cont, 10);
  assert.deepEqual(R.items.spk_duct, { m: 120, h: 1.667 }); assert.equal(Math.round(R.items.spk_duct.h * 90), 150, 'labour $ unchanged');
  assert.deepEqual(R.items.spk_space, { m: 20, h: 0.222 }, 'the estimator mapped Concealed to concealed-space heads'); assert.deepEqual(R.pipe['GMS-100'], { m: 61, h: 0.206 });
  assert.deepEqual(R.items.smoke, { m: 78, h: 0.33 });
  const own = pk.catalog.items.filter(i => i.supplier === 'Example Fire Pty Ltd price schedule'); assert.deepEqual(own.map(i => i.desc), ['Fire sprinkler dlp – Admin']);
  assert.equal(pk.catalog.items.filter(i => /^FireSense/.test(i.supplier)).length, 4);
});
