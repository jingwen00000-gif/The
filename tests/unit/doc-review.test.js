// Unit: FER / specification review (built-in rules): statements with clause and page, classified into note / incl / excl / rfi
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/docs/doc-review.js');
const FER = `[Page 4]
3.2 Performance Solution 1 – Extended travel distance
The travel distance to an exit of 52 m in lieu of 40 m (DtS D2.5) is supported by the provision of automatic smoke detection throughout the warehouse in accordance with AS 1670.1-2018.
3.3 Sprinkler system
The building shall be provided with a sprinkler system in accordance with AS 2118.1-2017. The hazard class of the storage area is Ordinary Hazard 3 (OH3) and shall be confirmed by the sprinkler designer.
[Page 5]
3.4 The existing hydrant system is to remain and is not part of the works.
3.5 Smoke exhaust to the warehouse shall be provided by the mechanical contractor.
3.6 Occupant warning system (EWIS) to be provided where required by the fire engineer, TBC.
3.7 Portable fire extinguishers shall be provided in accordance with AS 2444-2001.
4.1 Fire hose reels are not required as the building is sprinklered.
5.1 The lift lobby carpet shall be replaced.`;

test('FER rules: points to note, inclusions, exclusions and questions, with clause, page and topic', () => {
  const it = R.rules(FER, { name: 'FER Rev B' }); const by = c => it.filter(x => x.cat === c).map(x => x.clause);
  assert.deepEqual(by('rfi'), ['3.3', '3.6']); assert.deepEqual(by('excl'), ['3.4', '3.5', '4.1']); assert.deepEqual(by('note'), ['3.2']); assert.deepEqual(by('incl'), ['3.3', '3.7']);
  assert.ok(!it.some(x => x.clause === '5.1'), 'not about fire services: left out');
  assert.equal(it.find(x => x.clause === '4.1').topic, 'Hose reels', 'a sprinklered building mentioned in passing does not make it a sprinkler item');
  assert.equal(it.find(x => x.cat === 'note').topic, 'Performance solution'); assert.equal(it.find(x => x.cat === 'note').title, 'Performance Solution 1 – Extended travel distance');
  const q = it.find(x => x.clause === '3.6'); assert.equal(q.page, 5); assert.match(q.rfi, /FER Rev B.*cl\. 3\.6.*p\. 5/); assert.match(q.line, /\(FER Rev B cl\. 3\.6\)$/);
  assert.equal(it.find(x => x.clause === '4.1').line, 'Fire hose reels are not required as the building is sprinklered. (FER Rev B cl. 4.1)');
});

test('file names suggest the category; AI output is checked and shaped like the rules', () => {
  assert.equal(R.guessCat('FER Rev B.pdf'), 'FER'); assert.equal(R.guessCat('Fire Engineering Report - Stage 2.pdf'), 'FER'); assert.equal(R.guessCat('Fire Services Specification.docx'), 'SPEC'); assert.equal(R.guessCat('drawings.pdf'), null);
  const it = R.parseAI({ items: [{ cat: 'rfi', text: 'Hazard class TBC', clause: '3.3' }, { cat: 'bogus', text: 'x' }, { cat: 'excl', text: 'Smoke exhaust by mechanical', line: 'Smoke exhaust (by mechanical)' }] });
  assert.equal(it.length, 2); assert.match(it[0].rfi, /Hazard class TBC/); assert.equal(it[1].line, 'Smoke exhaust (by mechanical)');
  assert.match(R.aiPrompt('text', { kind: 'FER', name: 'FER Rev B' }), /Fire Engineering Report/);
});
