// Integration: FVE / MSME inside the app UI — the G key runs the engine on every sheet, shows the results table, and "加入计数"
// turns the detections into pending marks (status, relocation pairs) and the legend's pipe / cable line types into pending runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { openApp } = require('../lib/harness');
const { scoreDevices } = require('../lib/metrics');
const DS = path.join(__dirname, '../datasets/synthetic-basic');
const GT = require(path.join(DS, 'ground-truth.json'));

let app;
test.before(async () => {
  app = await openApp(); const { page } = app;
  await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    S.pages = []; S.marks = []; S.runs = []; await openFiles([new File([u], 'project.pdf', { type: 'application/pdf' })]);
  }, fs.readFileSync(path.join(DS, 'project.pdf')).toString('base64'));
});
test.after(async () => { if (app) await app.browser.close(); });

test('G key: FVE + MSME run on all sheets and the results table opens', async () => {
  const { page } = app;
  await page.evaluate(() => showTab('takeoff'));
  await page.keyboard.press('g');
  await page.waitForFunction(() => window.FX && FX.last && document.querySelector('#ftModal[open]'), null, { timeout: 120000 });
  const r = await page.evaluate(() => ({ title: document.querySelector('#ftModal').textContent, rows: document.querySelectorAll('#ftModal [data-fxon]').length,
    lines: document.querySelectorAll('#ftModal [data-fxl]').length, loops: document.querySelectorAll('#ftModal [data-fxloop]').length, drawn: FX.last.loops.filter(l => l.source === 'drawn').map(l => [l.devices, l.length_m]), rooms: FX.last.rooms.length, dets: FX.last.dets.length, models: FX.models.size }));
  assert.match(r.title, /FVE/); assert.ok(r.rows >= 4, 'one row per device type'); assert.equal(r.lines, 3); assert.equal(r.models, 4);
  assert.ok(r.dets > 50, 'detections ' + r.dets);
  assert.deepEqual(r.drawn.map(x => x[1]), GT.networks.map(n => n.length_m)); assert.ok(r.loops >= 2, 'estimated loops offered'); assert.equal(r.rooms, GT.rooms.length);
});

test('加入计数: detections become pending marks matching ground truth; line types become pending runs', async () => {
  const { page } = app;
  await page.getByRole('button', { name: '加入计数', exact: true }).click();
  const r = await page.evaluate(() => { const idx = id => S.pages.findIndex(p => p.id === id);
    return { marks: S.marks.map(m => ({ page: idx(m.page), x: m.x, y: m.y, type: m.type, conf: m.conf, src: m.src, pending: m.pending })), runs: S.runs.map(x => ({ sys: x.sys, mat: x.mat, dn: x.dn, n: x.pts.length, src: x.src })) }; });
  assert.ok(r.marks.every(m => m.src === 'fve' && m.pending && m.conf > 0));
  const s = scoreDevices(GT.devices, r.marks.map(m => ({ ...m, conf: m.conf })));
  assert.ok(s.f1 >= 99, JSON.stringify({ f1: s.f1, misses: s.misses.slice(0, 3), fa: s.falseAlarms.slice(0, 3) }));
  assert.ok(r.runs.length > 0 && r.runs.every(x => /^fve/.test(x.src) && x.n >= 2));
  assert.ok(r.runs.some(x => x.sys === 'DET' && x.mat === 'CBH') && r.runs.some(x => x.sys === 'SPR'), JSON.stringify([...new Set(r.runs.map(x => x.sys))]));
  assert.ok(r.runs.filter(x => x.src === 'fve-loop-estimate').length >= 2 && r.runs.some(x => x.src === 'fve-loop-estimate' && x.dn === 3), 'estimated loops added as cable (EWIS code 3)');
  // running it again adds nothing twice
  const again = await page.evaluate(() => { const d = FX.showResults(FX.last); const res = FX.commit(d, false); d.close(); return res; });
  assert.equal(again.marks, 0); assert.ok(again.dup > 50);
  assert.deepEqual(app.errors, []);
});

test('consultant library: learnt per consultant, read back filtered; consultant guessed from the title block e-mail', async () => {
  const r = await app.page.evaluate(() => {
    localStorage.removeItem('ft_fve_library');
    FX.libLearn('Evolved Engineering', [{ geoHash: 'GEO_AAAAA', device: 'smoke' }, { geoHash: 'GEO_BBBBB', device: 'heat' }]);
    FX.libLearn('Other Eng', [{ geoHash: 'GEO_AAAAA', device: 'heat' }]);
    FX.libLearn('Evolved Engineering', [{ geoHash: 'GEO_AAAAA', device: 'cs_smoke' }]); // renamed: replaces, no duplicate
    const m = { page: { w: 1000, h: 700 }, texts: [{ s: 'E: someone@evolvedengineering.com.au', cx: 900, cy: 600 }, { s: 'FIRE SERVICES', cx: 900, cy: 650 }] };
    return { ev: FX.libFor('evolved engineering'), oth: FX.libFor('Other Eng'), all: FX.libAll().length, cons: FX.consultantOf([m]),
      dn: [FX.lineDn({ desc: 'FIRE RATED EWIS CABLE' }, 'CBH'), FX.lineDn({ desc: 'FIP LOOP CABLE' }, 'CBH'), FX.lineDn({ desc: 'DN50 RANGE PIPE' }, 'GMS')] };
  });
  assert.deepEqual(r.ev.map(e => e.device).sort(), ['cs_smoke', 'heat']); assert.deepEqual(r.oth.map(e => e.device), ['heat']); assert.equal(r.all, 3);
  assert.equal(r.cons, 'Evolvedengineering'); assert.deepEqual(r.dn, [4, 1, 50]);
});

test('rates from finished jobs: the pricing library suggests rates, ticked rows go into this project\'s rate table', async () => {
  const r = await app.page.evaluate(() => {
    const L = FT_LEARN.db.rebuild([{ projectId: 'J1', consultant: 'X', symbols: [], networks: [], rooms: [], pricing: { items: [
      { key: 'smoke', description: 'Smoke detector', supply: 40, install: 69, rate: 109, unit: 'ea' }, { key: 'smoke@remove', description: 'Delete detector', rate: 65 }, { key: 'cable_fip', description: 'FIP loop cable', supply: 1.5, install: 4.6, unit: 'm' }] } }]);
    FX.importKnowledge(L); const before = costRateOf('smoke'); const { d, rows } = FT_RATES.show();
    d.querySelectorAll('[data-rh]').forEach(c => c.checked = true); [...d.querySelectorAll('button')].find(b => b.textContent === '采用勾选的单价').click();
    const out = { rows: rows.map(x => [x.key, x.where, x.learnt]), before, after: costRateOf('smoke'), m: S.rates.items.smoke.m, act: S.rates.actRates && S.rates.actRates['smoke@remove'], actCost: costRateOf('smoke@remove'), cable: S.rates.pipe['CBH-1'], btn: !!document.getElementById('ratesHistory') };
    localStorage.removeItem('ft_knowledge'); return out; });
  assert.deepEqual(r.rows.map(x => x[0]).sort(), ['cable_fip', 'smoke', 'smoke@remove']); assert.ok(r.btn, 'button on the rates page');
  assert.equal(r.m, 40); assert.ok(Math.abs(r.after - 109) < .5, `smoke all-in ${r.after}`); assert.ok(r.act && Math.abs(r.actCost - 65) < .5, `remove all-in ${r.actCost}`);
  assert.equal(r.cable.m, 1.5);
});

