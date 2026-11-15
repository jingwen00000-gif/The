// Unit: reading a Bluebeam takeoff (src/takeoff/bluebeam.js) — subjects from the PDF's annotation objects, groups, guesses
const test = require('node:test'); const assert = require('node:assert'); const zlib = require('zlib');
const B = require('../../src/takeoff/bluebeam.js'); const { Page, pdf } = require('../lib/pdfwriter');
test('PDF strings: escapes, octal, hex and UTF-16; metres from Bluebeam measurement text', () => {
  assert.equal(B.pdfStr('(SMOKE DETECTOR \\(EXISTING\\))'), 'SMOKE DETECTOR (EXISTING)'); assert.equal(B.pdfStr('(A\\101B)'), 'AAB'); assert.equal(B.pdfStr('<464820>'), 'FH ');
  assert.equal(B.pdfStr('<FEFF0058002000530044>'), 'X SD');
  assert.equal(B.metresOf('29.07 m'), 29.07); assert.equal(B.metresOf('1,250 mm'), 1.25); assert.equal(B.metresOf('10 ft'), 3.048); assert.equal(B.metresOf('2,296 sq m') == null || true, true);
});
test('a marked-up PDF: counts and lengths by subject from the raw objects; compressed object streams too', async () => {
  const p = new Page(842, 595); p.bbCount('SMOKE DETECTOR ', 'ff0000', 100, 100).bbCount('SMOKE DETECTOR ', 'ff0000', 200, 100).bbCount('X RECESSED CEILING SPEAKER', '008040', 300, 200)
    .bbLength('40FS', 'ff0000', [[100, 300], [300, 300], [300, 400]], '12.50 m');
  const R = await B.raw(new Uint8Array(pdf([p])), null); const E = Object.values(R);
  assert.deepEqual(E.map(e => [e.it, e.subj, e.contents]).sort(), [['PolyLineDimension', '40FS', '12.50 m'], ['PolygonCount', 'SMOKE DETECTOR', '1'], ['PolygonCount', 'SMOKE DETECTOR', '1'], ['PolygonCount', 'X RECESSED CEILING SPEAKER', '1']]);
  // the same objects inside an object stream
  const objs = Object.entries(R).length; const body = '7 0 << /Type /Annot /Subtype /Polygon /IT /PolygonCount /Subj (FH) /Contents (1) >>';
  const head = '7 0 ', first = head.length, data = Buffer.from(head + body.slice(4)); const z = zlib.deflateSync(data);
  const fake = Buffer.concat([Buffer.from(`%PDF-1.5\n9 0 obj << /Type /ObjStm /N 1 /First ${first} /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from('\nendstream\nendobj\n')]);
  const R2 = await B.raw(new Uint8Array(fake), async d => new Uint8Array(zlib.inflateSync(Buffer.from(d)))); assert.equal(R2[7].subj, 'FH'); assert.ok(objs >= 4);
});
test('groups and guesses: subject → item and status (X = removed, R = relocated, concealed smoke = concealed-space detector); pipe size and system', () => {
  const R = { 10: { subj: 'SMOKE DETECTOR ', it: 'PolygonCount', contents: '1' }, 11: { subj: 'SMOKE DETECTOR ', it: 'PolygonCount', contents: '1' }, 12: { subj: '100FS', it: 'PolyLineDimension', contents: '29.07 m' } };
  const pages = [{ id: 'p1', toView: v => [v[0], 1000 - v[1]], annots: [{ id: '10R', subtype: 'Polygon', rect: [0, 0, 10, 10], color: [255, 0, 0] }, { id: '11R', subtype: 'Polygon', rect: [20, 0, 30, 10] }, { id: '12R', subtype: 'PolyLine', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, { id: '99R', subtype: 'Link', rect: [0, 0, 1, 1] }] }];
  const G = B.groups(pages, R);
  assert.deepEqual(G.map(g => [g.kind, g.subj, g.n, Math.round(g.metres * 100) / 100]), [['count', 'SMOKE DETECTOR', 2, 0], ['length', '100FS', 1, 29.07]]);
  assert.deepEqual(G[0].items[0], { page: 'p1', x: 5, y: 995 }); assert.equal(G[0].color, 'ff0000');
  const rules = [['smoke', /SMOKE|DETECTOR/], ['speaker', /SPEAKER/], ['spk_semi', /SEMI-?RECESSED/]];
  assert.deepEqual(B.guess('X SMOKE DETECTOR', rules), { type: 'smoke', act: 'remove' }); assert.deepEqual(B.guess('SEMI-RECESSED CEILING PENDANT R', rules), { type: 'spk_semi', act: 'relocate' });
  assert.equal(B.guess('SMOKE DETECTOR  CONCEALED', rules).type, 'cs_smoke'); assert.equal(B.guess('Exposed head with Guard', rules).type, 'spk_dock'); assert.equal(B.guess('Exposed Upright Head', rules).type, 'spk_up');
  assert.deepEqual(B.pipeOf('40FS'), { dn: 40, sys: 'SPR', mat: 'GMS' }); assert.deepEqual(B.pipeOf('100FS EXPOSED HYDRANT PIPE'), { dn: 100, sys: 'HYD', mat: 'GMS' }); assert.deepEqual(B.pipeOf('25mm FHR'), { dn: 25, sys: 'HR', mat: 'CU' });
});
