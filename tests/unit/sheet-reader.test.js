// Unit: reading a sheet's title block (src/fve/sheet-reader.js) and the drawing register (missing drawings, older revisions)
const test = require('node:test'); const assert = require('node:assert');
const R = require('../../src/fve/sheet-reader.js');
const page = { w: 2384, h: 1684 };
// a labelled title block like Lucid's: the value under its label, larger
const lucid = (no, rev, title) => [{ s: 'DRAWING', x: 1527, y: 1600, h: 8 }, { s: title, x: 1526, y: 1616, h: 14 }, { s: 'FIRE SERVICES', x: 1526, y: 1583, h: 14 },
  { s: 'DRAWING NO.', x: 1994, y: 1620, h: 8 }, { s: no, x: 1994, y: 1642, h: 20 }, { s: 'REVISION', x: 2277, y: 1620, h: 8 }, { s: rev, x: 2289, y: 1642, h: 20 },
  { s: "REV'N", x: 79, y: 1636, h: 7 }, { s: 'P1', x: 84, y: 1624, h: 9 }, { s: 'SCALE: 1:100', x: 2121, y: 1571, h: 10 }, { s: 'NSW 2000', x: 1082, y: 1626, h: 10 }];
test('title block with labels: drawing number, revision, title, level; revision table and postcode ignored', () => {
  const s = R.readSheet(lucid('LCE103150-F102', 'T1', 'PROPOSED FIRE SERVICES LEVEL 2 ARRANGEMENT - WEST'), page);
  assert.deepEqual([s.dwg, s.rev, s.title, s.type, s.level, s.times], ['LCE103150-F102', 'T1', 'PROPOSED FIRE SERVICES LEVEL 2 ARRANGEMENT - WEST', 'plan', 'L2', 1]);
  assert.equal(R.readSheet(lucid('F001', 'C', 'LEGEND OF SYMBOLS AND GENERAL NOTES'), page).type, 'legend');
  assert.equal(R.readSheet(lucid('F200', 'T1', 'WET FIRE SCHEMATIC'), page).type, 'schematic');
  assert.equal(R.readSheet(lucid('F300', 'T1', 'DETAILS SHEET 1'), page).type, 'detail');
});
test('title block without text labels (drawn as line work): the large drawing number low right, the title stacked above it', () => {
  const T = [{ s: 'Level 9 - 10 Fitouts', x: 2077, y: 1239, h: 27 }, { s: 'NSW 2000', x: 2077, y: 1297, h: 27 }, { s: 'FIRE SERVICES', x: 2077, y: 1401, h: 24 }, { s: 'LEVEL 9', x: 2077, y: 1429, h: 24 },
    { s: 'FIRE SERVICES LAYOUT', x: 2077, y: 1458, h: 24 }, { s: 'P251317-F-L09-101', x: 2077, y: 1644, h: 24 }, { s: 'A', x: 2321, y: 1644, h: 24 }, { s: '1:100@A1', x: 2077, y: 1592, h: 12 }];
  const s = R.readSheet(T, page, { name: 'F-L09-101.pdf' });
  assert.deepEqual([s.dwg, s.rev, s.title, s.level], ['P251317-F-L09-101', 'A', 'FIRE SERVICES LEVEL 9 FIRE SERVICES LAYOUT', 'L9']);
});
test('levels: basements, ground, ordinal floors, roof; a typical floor gives its multiplier', () => {
  const L = t => { const r = R.levelOf(t); return r.level + (r.times > 1 ? ' x' + r.times : ''); };
  assert.equal(L('LEVEL 2-8 TYPICAL FLOOR PLAN'), 'L2-L8 x7'); assert.equal(L('TYPICAL FLOOR LEVELS 3 TO 12'), 'L3-L12 x10'); assert.equal(L('L5–L9 SPRINKLER LAYOUT'), 'L5-L9 x5');
  assert.equal(L('BASEMENT 2 WET FIRE'), 'B2'); assert.equal(L('BASEMENT - WET FIRE'), 'B'); assert.equal(L('LOWER GROUND FLOOR'), 'LG'); assert.equal(L('GROUND FLOOR LAYOUT'), 'G');
  assert.equal(L('FIRST FLOOR - WET FIRE'), 'L1'); assert.equal(L('LEVEL 04 DRY FIRE LAYOUT'), 'L4'); assert.equal(L('ROOF PLAN'), 'Roof'); assert.equal(L('SITE PLAN'), '');
});
test('register: older revisions of a drawing, gaps in a numbered series, sheets the drawing list names that are not in the set', () => {
  const rows = [{ page: 'a', dwg: 'F100', rev: 'P3' }, { page: 'b', dwg: 'F100', rev: 'T1' }, { page: 'c', dwg: 'F101', rev: 'T1' }, { page: 'd', dwg: 'F102', rev: 'T1' }, { page: 'e', dwg: 'F104', rev: 'T1' },
    { page: 'f', dwg: 'F000', rev: 'T1', listed: ['F100', 'F101', 'F102', 'F103', 'F104', 'F301'] }, { page: 'g', dwg: 'F300', rev: 'T1' }];
  const r = R.register(rows);
  assert.deepEqual(r.older, [{ page: 'a', dwg: 'F100', rev: 'P3', newer: 'T1', newerPage: 'b' }]);
  assert.deepEqual(r.missing, ['F103', 'F301']);
  assert.ok(R.revCmp('C', 'B') > 0 && R.revCmp('T1', 'P4') > 0 && R.revCmp('A', 'T2') > 0 && R.revCmp('03', '02') > 0);
});
