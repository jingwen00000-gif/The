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
    lines: document.querySelectorAll('#ftModal [data-fxl]').length, loops: document.querySelectorAll('#ftModal [data-fxloop]').length, drawn: FX.last.loops.filter(l => l.source === 'drawn').map(l => [l.devices, l.length_m]), rooms: FX.last.rooms.length, as1670: FX.last.compliance && FX.last.compliance.findings.length, as1670ui: /规范检查/.test(document.querySelector('#ftModal').textContent) && /\[5\.1\.2\]|\[4\.1\.2\]/.test(document.querySelector('#ftModal').textContent), dets: FX.last.dets.length, models: FX.models.size }));
  assert.match(r.title, /FVE/); assert.ok(r.rows >= 4, 'one row per device type'); assert.equal(r.lines, 3); assert.equal(r.models, 4);
  assert.ok(r.dets > 50, 'detections ' + r.dets);
  assert.deepEqual(r.drawn.map(x => x[1]), GT.networks.map(n => n.length_m)); assert.ok(r.loops >= 2, 'estimated loops offered'); assert.equal(r.rooms, GT.rooms.length); assert.ok(r.as1670 > 0 && r.as1670ui, 'AS 1670 findings shown');
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


test('review bar 批量删除: this kind on this sheet, this kind on every sheet; confirmed marks untouched; undo restores', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { S.marks = []; S.runs = []; const P = S.pages.filter(q => q.kind === 'pdf');
    for (const pg of P.slice(0, 2)) for (let k = 0; k < 4; k++) { S.marks.push({ id: uid(), page: pg.id, type: 'spk_pend', x: 100 + k * 40, y: 200, pending: true, src: 'match' }); S.marks.push({ id: uid(), page: pg.id, type: 'smoke', x: 100 + k * 40, y: 300, pending: true, src: 'match' }); }
    S.marks.push({ id: 'kept', page: P[0].id, type: 'spk_pend', x: 600, y: 600 }); curPage = P[0].id; await showPage(); changed(); await FT29.rvStart();
    const pend = () => S.marks.filter(m => m.pending).length, x = { kind: 'mark', o: S.marks.find(m => m.pending && m.type === 'spk_pend' && m.page === P[0].id) };
    FT29.rvBulk(x); const opts = [...document.querySelectorAll('#ftModal .ftmbtns button')].map(b => b.textContent); document.querySelector('#ftModal .ftmbtns button').click(); const a = pend();
    FT29.rvBulk({ kind: 'mark', o: S.marks.find(m => m.pending && m.type === 'spk_pend') }); [...document.querySelectorAll('#ftModal .ftmbtns button')].find(b => /所有页面的/.test(b.textContent)).click(); const b = pend();
    const kept = S.marks.some(m => m.id === 'kept'); undo(); const c = pend(); FT29.rvStop();
    renderReview(); const pg = document.querySelector('#rvDelPg'); if (pg) pg.click(); const panel = !!document.querySelector('#ftModal[open]') && /本页全部待确认/.test(document.querySelector('#ftModal').textContent);
    return { opts, a, b, c, kept, panel }; });
  assert.deepEqual(r.opts.slice(0, 4), ['本页的「喷头 下垂型」（4）', '本页全部待确认（8）', '所有页面的「喷头 下垂型」（图标搜索结果）（8）', '所有页面全部待确认（16）']);
  assert.equal(r.a, 12); assert.equal(r.b, 8); assert.ok(r.kept); assert.equal(r.c, 12); assert.ok(r.panel, 'the side panel 清除本页 button opens the same menu');
});

test('tender docs: an FER is reviewed (no API key: built-in rules); ticked items become RFIs, Exclusions and Inclusions on the quote', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { if (!DB.ok || !curId) return { skip: true };
    showTab('docs'); S.rfi = []; S.exclCustom = ''; S.inclCustom = '';
    await addDocs([new File(['3.4 The existing hydrant system is to remain and is not part of the works.\n3.6 Occupant warning system (EWIS) to be provided where required, TBC.\n3.7 Portable fire extinguishers shall be provided in accordance with AS 2444-2001.'], 'Fire Engineering Report.txt', { type: 'text/plain' })], 'TENDER');
    const d = S.docs[S.docs.length - 1]; document.querySelector(`[data-drev="${d.id}"]`).click();
    for (let i = 0; i < 50 && !document.querySelector('#revCard [data-revi]'); i++) await new Promise(r => setTimeout(r, 100));
    const tick = id => { const c = document.querySelector(`#revCard [data-revi="${id}"]`); c.checked = true; c.dispatchEvent(new Event('change')); };
    const by = c => d.review.items.find(x => x.cat === c).id;
    tick(by('rfi')); document.querySelector('[data-revdo="rfi"]').click(); tick(by('excl')); document.querySelector('[data-revdo="excl"]').click(); tick(by('incl')); document.querySelector('[data-revdo="incl"]').click();
    return { cat: d.cat, n: d.review.items.length, rfi: S.rfi.length, excl: S.exclCustom, incl: S.inclCustom, q: quoteText() }; });
  if (r.skip) return;
  assert.equal(r.cat, 'FER'); assert.equal(r.n, 3); assert.equal(r.rfi, 1);
  assert.match(r.excl, /existing hydrant system.*cl\. 3\.4/); assert.match(r.incl, /extinguishers.*cl\. 3\.7/); assert.match(r.q, /INCLUSIONS\n- Portable fire extinguishers/);
});

test('quote e-mail drafts: boss / client tabs from the open quote, boss address remembered, .eml download', async () => {
  const { page } = app;
  await page.evaluate(() => { showTab('quote'); S.email = 'jane@acme.com.au'; S.contact = 'Jane Smith'; });
  await page.evaluate(() => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close(); openMail('boss'); }); await page.waitForSelector('#mlBody');
  const boss = await page.evaluate(() => mlBody.value); await page.fill('#mlTo', 'boss@firetake.com.au'); await page.locator('#mlTo').dispatchEvent('input');
  await page.click('[data-mk="client"]'); const cl = await page.evaluate(() => ({ to: mlTo.value, body: mlBody.value }));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-mv="eml"]')]);
  await page.click('[data-mk="boss"]'); const kept = await page.evaluate(() => mlTo.value); await page.keyboard.press('Escape');
  assert.match(boss, /INTERNAL — not for the client/); assert.ok(!cl.body.includes('INTERNAL')); assert.equal(cl.to, 'jane@acme.com.au'); assert.match(cl.body, /^Dear Jane,/);
  assert.match(dl.suggestedFilename(), /_email\.eml$/); assert.equal(kept, 'boss@firetake.com.au');
});

test('框选比例: a box around the scale note sets the scale (and offers the other sheets of the same size)', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close(); showTab('takeoff');
    const pdfs = S.pages.filter(q => q.kind === 'pdf'); let p = null, it = null;
    for (const q of pdfs) { const t = (await pdfTextItems(q)).find(x => /1\s*:\s*\d{2,4}/.test(x.s)); if (t) { p = q; it = t; break; } }
    if (!p) return { skip: true };
    S.pages.forEach(q => { q.mPerUnit = null; q.ratio = null; }); curPage = p.id; await showPage();
    document.querySelector('#ratioBox').click(); legendDrag = { a: [it.x - 10, it.y - 10] }; legendRect = [it.x - 10, it.y - 10, it.x + (it.w || 40) + 10, it.y + 10];
    await legendUp(); const want = +it.s.match(/1\s*:\s*(\d{2,4})/)[1];
    const modal = !!document.querySelector('#ftModal[open]'); const others = S.pages.filter(q => q !== p && q.kind === 'pdf' && Math.abs(q.w - p.w) < 2).length;
    return { want, ratio: p.ratio, mpu: p.mPerUnit, modal, others }; });
  if (r.skip) return;
  assert.equal(r.ratio, r.want); assert.ok(Math.abs(r.mpu - r.want * 0.0254 / 72) < 1e-9); if (r.others) assert.ok(r.modal, 'offers the same-size sheets');
});

test('tender folder import: fire drawing opened, documents filed (zip expanded), project / client / contact / site / closing date filled', async () => {
  const { page } = app;
  const pdf = fs.readFileSync(path.join(DS, 'project.pdf')).toString('base64');
  const r = await page.evaluate(async b64 => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close();
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const eml = ['From: "Jane Smith" <jane@acmebuild.com.au>', 'Subject: Tender - Hornsby Storage', 'Content-Type: text/plain; charset=utf-8', '', 'Site: 28 Salisbury Road, Asquith NSW 2077. Tenders close 13 November 2026.', '', 'Jane Smith', 'Acme Building Group Pty Ltd', 'M: 0412 345 678'].join('\r\n');
    // a stored (uncompressed) zip with one entry, built by hand
    const enc = new TextEncoder(), name = enc.encode('Fire Services Specification.txt'), data = enc.encode('Sprinklers to AS 2118.1.');
    const crc = (() => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xFFFFFFFF; for (const b of data) x = t[(x ^ b) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; })();
    const loc = new DataView(new ArrayBuffer(30)); loc.setUint32(0, 0x04034b50, true); loc.setUint32(14, crc, true); loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, name.length, true);
    const cen = new DataView(new ArrayBuffer(46)); cen.setUint32(0, 0x02014b50, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true);
    const locLen = 30 + name.length + data.length, end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, 46 + name.length, true); end.setUint32(16, locLen, true);
    const zip = new Blob([loc, name, data, cen, name, end]);
    const items = [['Fire/FS-101.pdf', new File([u], 'FS-101.pdf')], ['Tender Invitation.eml', new File([eml], 'Tender Invitation.eml')], ['FER Rev B.txt', new File(['3.4 Existing hydrant system to remain.'], 'FER Rev B.txt')], ['Specs.zip', new File([zip], 'Specs.zip')]]
      .map(([p, f]) => ({ path: p, name: f.name, size: f.size, read: async () => f }));
    const a = await FT_INBOX_APP.analyse('2026-11-02 Hornsby Storage', items); await FT_INBOX_APP.importOne(a, a.info);
    return { info: a.info, fire: a.G.draw.filter(d => d.fire).length, name: S.name, client: S.client, contact: S.contact, phone: S.phone, site: S.site, notes: S.notes, pages: S.pages.filter(p => p.kind === 'pdf').length, docs: S.docs.map(x => x.cat + ':' + x.name).sort() }; }, pdf);
  assert.equal(r.name, 'Hornsby Storage'); assert.equal(r.client, 'Acme Building Group Pty Ltd'); assert.equal(r.contact, 'Jane Smith'); assert.equal(r.phone, '0412 345 678');
  assert.equal(r.site, '28 Salisbury Road, Asquith NSW 2077'); assert.match(r.notes, /Tender closes: 13 November 2026/); assert.equal(r.fire, 1); assert.ok(r.pages >= 1);
  assert.deepEqual(r.docs, ['EMAIL:Tender Invitation.eml', 'FER:FER Rev B.txt', 'SPEC:Fire Services Specification.txt']);
});

test('several tenders at once: a picked folder is one project (split on request); a re-issue is matched and added to the existing project', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close();
    const mk = (rp, body) => { const f = new File([body || 'x'], rp.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: rp }); return f; };
    const picked = FT_INBOX_APP.fromInput([mk('Nov/Hornsby Storage/Fire/FS-101.pdf'), mk('Nov/Hornsby Storage/FER.txt'), mk('Nov/Lucid/LCE103150-F102.pdf'), mk('Nov/Lucid/Spec.pdf')]);
    const split = [picked.length, ...FT_INBOX.splitTenders(picked[0].folder, picked[0].items, { bySub: true }).map(t => [t.folder, t.items.length])];
    const before = liveProjects().length, id = curId, name = S.name;
    const items = [['Addendum 1.txt', new File(['Addendum 1: hydrant booster relocated.'], 'Addendum 1.txt')]].map(([p, f]) => ({ path: p, name: f.name, size: f.size, read: async () => f }));
    const a = await FT_INBOX_APP.analyse('2026-11-05 Hornsby Storage', items);
    const box = document.createElement('div'); box.innerHTML = FT_INBOX_APP.reviewHTML([a]); const sel = box.querySelector('[data-ibinto]');
    await FT_INBOX_APP.importOne(a, { ...a.info, client: 'Someone Else' }, sel && sel.value);
    return { split, warn: box.textContent.includes('已有相似的项目'), into: sel && sel.value, id, same: curId === id, count: liveProjects().length - before, name: S.name, name0: name, client: S.client, docs: S.docs.map(x => x.cat + ':' + x.name) }; });
  assert.deepEqual(r.split, [1, ['Nov/Hornsby Storage', 2], ['Nov/Lucid', 2]], 'a picked folder is one project; split by subfolder on request');
  assert.ok(r.warn, 'the review says a similar project exists'); assert.equal(r.into, r.id);
  assert.ok(r.same); assert.equal(r.count, 0, 'no new project'); assert.equal(r.name, r.name0); assert.equal(r.client, 'Acme Building Group Pty Ltd', 'filled fields kept');
  assert.ok(r.docs.some(x => /Addendum 1\.txt/.test(x)));
});

test('a drawing whose saved copy is missing: the canvas offers 重新打开, and the re-opened file is linked back to the same page', async () => {
  const { page } = app;
  const pdf = fs.readFileSync(path.join(DS, 'project.pdf')).toString('base64');
  const r = await page.evaluate(async b64 => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close(); showTab('takeoff');
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await newProject(); await openFiles([new File([u], 'FS100 - Level 1.pdf', { type: 'application/pdf' })]);
    const pg = S.pages.find(p => p.kind === 'pdf'); const id = pg.id, n0 = S.pages.filter(p => p.kind === 'pdf').length;
    // the saved copy is gone (as when a OneDrive / zip file could not be read back)
    pdfPageRef.delete(id); bitmaps.delete(id); pg.file = 'FS100 - Level 1.pdf|1'; curPage = id; draw();
    const shown = !document.getElementById('reopenBtn').hidden;
    const stored = (await DB.byProj(curId)).find(f => /FS100/.test(f.name)); const storedOk = !!stored && (await stored.blob.arrayBuffer()).byteLength === u.length;
    await openFiles([new File([u], 'FS100 - Level 1.pdf', { type: 'application/pdf' })]); draw();
    return { shown, storedOk, n0, pages: S.pages.filter(p => p.kind === 'pdf').length, linked: pdfPageRef.has(id), hidden: document.getElementById('reopenBtn').hidden }; }, pdf);
  assert.ok(r.storedOk, 'the drawing is saved as a full copy'); assert.ok(r.shown); assert.equal(r.pages, r.n0, 'no duplicate page'); assert.ok(r.linked); assert.ok(r.hidden);
});

test('page list: × deletes a sheet at once (with its take-off), ticks + 删除选中 delete several, 撤销 brings them back', async () => {
  const { page } = app;
  const pdf = fs.readFileSync(path.join(DS, 'project.pdf')).toString('base64');
  await page.evaluate(async b64 => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close(); showTab('takeoff');
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await newProject(); for (const n of ['A.pdf', 'B.pdf', 'C.pdf']) await openFiles([new File([u], n, { type: 'application/pdf' })]);
    S.pages.forEach((p, i) => S.marks.push({ id: 'pm' + i, page: p.id, type: 'spk_pend', x: 1, y: 1 })); changed(); }, pdf);
  const n0 = await page.evaluate(() => S.pages.length);
  await page.click('#pageBtn');
  await page.click('#pageList [data-pg] >> nth=0 >> [data-pgx]');
  const one = await page.evaluate(() => ({ pages: S.pages.length, marks: S.marks.length }));
  await page.click('#pageUndoBtn');
  const back = await page.evaluate(() => ({ pages: S.pages.length, marks: S.marks.length }));
  await page.click('#pageList [data-pg] >> nth=0 >> [data-pgk]'); await page.click('#pageList [data-pg] >> nth=2 >> [data-pgk]', { modifiers: ['Shift'] });
  await page.click('#pageDelSel'); await page.click('#pageDelSel');
  const many = await page.evaluate(() => S.pages.length);
  await page.click('#pageUndoBtn'); const again = await page.evaluate(() => S.pages.length);
  await page.mouse.click(5, 5); const closed = await page.isHidden('#pagePop');
  assert.equal(one.pages, n0 - 1); assert.ok(one.marks < n0, 'its take-off went with it'); assert.deepEqual(back, { pages: n0, marks: n0 });
  assert.equal(many, n0 - 3); assert.equal(again, n0); assert.ok(closed);
});

test('existing devices are never counted (new build or refurbishment); recessed and surface speakers are separate quote lines', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close();
    await newProject(); S.pages.push({ id: 'pg1', name: 'L1', kind: 'image', w: 1000, h: 800, mPerUnit: 0.01 });
    const add = (type, act) => S.marks.push({ id: uid(), page: 'pg1', type, x: Math.random() * 900, y: Math.random() * 700, ...(act ? { act } : {}) });
    add('speaker'); add('speaker'); add('spk_surf'); add('speaker', 'retain'); add('smoke', 'retain'); add('smoke', 'remove'); add('smoke');
    const qty = () => Object.fromEntries(compute().lines.filter(l => l.k).map(l => [l.k, l.qty]));
    S.ptype = 'NEW'; const nb = { counts: itemCounts(), lines: qty(), mode: markMode(S.marks[3]) };
    S.ptype = 'REFURB'; const rf = { counts: itemCounts(), lines: qty() };
    return { nb, rf, names: [ITEM.speaker.zh, ITEM.spk_surf.zh] }; });
  assert.deepEqual(r.nb.counts, { speaker: 2, spk_surf: 1, smoke: 1 }, 'new build: existing and to-be-removed devices are not counted');
  assert.equal(r.nb.lines.speaker, 2); assert.equal(r.nb.lines.spk_surf, 1); assert.equal(r.nb.lines.smoke, 1); assert.equal(r.nb.mode, 'retain', 'drawn as existing');
  assert.equal(r.rf.lines['speaker@retain'], undefined, 'refurbishment: no line for existing devices'); assert.equal(r.rf.lines['smoke@remove'], 1, 'removal still priced'); assert.equal(r.rf.lines.speaker, 2);
  assert.deepEqual(r.names, ['嵌入式扬声器（吸顶）', '明装扬声器（墙面 / 吊顶下）']);
});

test('tender folder import: another service\'s sheet with a vague name is filed, not opened for take-off', async () => {
  const { page } = app;
  const pdf = fs.readFileSync(path.join(DS, 'project.pdf')).toString('base64');
  const r = await page.evaluate(async b64 => { const d = document.querySelector('#ftModal'); if (d && d.open) d.close();
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    // a one-page PDF written by hand: a hydraulic layout (A1 landscape) that also shows hydrants
    const txt = 'BT /F1 18 Tf 1800 200 Td (HYDRAULIC SERVICES GROUND FLOOR LAYOUT) Tj ET BT /F1 12 Tf 200 900 Td (SEWER DRAINAGE  COLD WATER  HOT WATER  BASIN  WC  FLOOR WASTE  FIRE HYDRANT  FIRE HYDRANT  FIRE HYDRANT) Tj ET';
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2384 1684] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${txt.length} >>\nstream\n${txt}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    const items = [['Plan 1.pdf', new File([u], 'Plan 1.pdf')], ['Plan 2.pdf', new File([out], 'Plan 2.pdf')]].map(([p, f]) => ({ path: p, name: f.name, size: f.size, read: async () => f }));
    const a = await FT_INBOX_APP.analyse('Small job', items); const rows = a.G.draw.map(d => [d.name, d.s.disc, d.take, d.maybe]);
    await FT_INBOX_APP.importOne(a, a.info);
    return { rows, pages: S.pages.filter(p => p.kind === 'pdf').map(p => p.name), docs: S.docs.map(d => d.cat + ':' + d.name) }; }, pdf);
  const byName = Object.fromEntries(r.rows.map(x => [x[0], x])); assert.equal(byName['Plan 2.pdf'][1], 'hydraulic'); assert.equal(byName['Plan 2.pdf'][2], false); assert.equal(byName['Plan 2.pdf'][3], true, 'flagged: hydrants on it');
  assert.ok(r.pages.every(n => !/Plan 2/.test(n))); assert.ok(r.docs.includes('DWG:Plan 2.pdf'));
});
