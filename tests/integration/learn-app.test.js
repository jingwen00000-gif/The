// Integration: "learn from a finished job" inside the app (Settings → AI 学习). The estimator picks the job's files; the job is read in a
// sandbox (the open project is restored untouched), scored blind with what was known before, added to this computer's knowledge base,
// and the next job of the same consultant — with no legend — is then recognised from it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { scoreDevices } = require('../lib/metrics');
const TR = path.join(__dirname, '../datasets/training'), JOB = path.join(TR, 'train-acme');
const EVAL = path.join(TR, 'eval-acme-nolegend'), GT = require(path.join(EVAL, 'ground-truth.json'));
const SYN = path.join(__dirname, '../datasets/synthetic-basic/project.pdf');

let app;
test.before(async () => { app = await openApp(); });
test.after(async () => { if (app) await app.browser.close(); });

test('Settings → 从完成项目学习: files in, blind score, local knowledge base, open project restored', async () => {
  const { page } = app;
  // a project is open with one marked device
  await page.evaluate(async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    S.pages = []; S.marks = []; S.runs = []; await openFiles([new File([u], 'current.pdf', { type: 'application/pdf' })]); S.marks.push({ id: 'keep', page: S.pages[0].id, type: 'smoke', x: 10, y: 10 }); },
  fs.readFileSync(SYN).toString('base64'));
  const before = await page.evaluate(() => ({ pages: S.pages.map(p => p.id), name: S.name }));
  await page.waitForFunction(() => window.FT_LEARN_APP && FT_LEARN_APP.ready, null, { timeout: 30000 });
  await page.evaluate(() => FT_LEARN_APP.renderPanel(document.querySelector('#learnPanel') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'learnPanel' })));
  await page.click('#lrnNew');
  await page.fill('#lrName', 'Train Acme');
  await page.setInputFiles('#lrOrig', path.join(JOB, 'original.pdf'));
  await page.setInputFiles('#lrTake', path.join(JOB, 'takeoff.pdf'));
  await page.setInputFiles('#lrXls', [path.join(JOB, 'boq.xlsx'), path.join(JOB, 'quote.xlsx')]);
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.waitForFunction(() => /学习完成|学习失败/.test((document.querySelector('#ftModal[open] h2') || {}).textContent || ''), null, { timeout: 180000 });
  const r = await page.evaluate(async () => { const st = await FT_LEARN_APP.store(); const K = FX.knowledgeBase();
    return { title: document.querySelector('#ftModal h2').textContent, body: document.querySelector('#ftModal').textContent, scores: st.scores, contribs: st.contribs.map(c => c.projectId),
      kbProjects: K.index.projects.map(p => p.projectId), pages: S.pages.map(p => p.id), marks: S.marks.map(m => m.id), name: S.name, rows: document.querySelectorAll('#learnPanel tbody tr').length }; });
  assert.equal(r.title, '学习完成', r.body);
  assert.deepEqual(r.pages, before.pages, 'the open project is back'); assert.deepEqual(r.marks, ['keep']); assert.equal(r.name, before.name);
  assert.deepEqual(r.contribs, ['train-acme']); assert.ok(r.kbProjects.includes('train-acme') && r.kbProjects.length >= 2, 'bundled jobs + the learnt one: ' + r.kbProjects);
  const s = r.scores[0]; assert.equal(s.consultant, 'Acme Fire Consulting'); assert.ok(s.devices >= 40 && s.pricingItems > 0, JSON.stringify(s));
  // the job has its legend: recognition scores it well even blind
  assert.ok(s.score && s.score.f1 >= 90, JSON.stringify(s.score)); assert.ok(s.knowledgeProjects >= 1);
  assert.equal(r.rows, 1, 'the learnt job is listed with its score');
  assert.deepEqual(app.errors, []);
});

test('the consultant\'s next job without a legend is recognised from the job learnt in the app', async () => {
  const { page } = app;
  const KB = await page.evaluate(() => FX.knowledgeBase());
  const R = await analyse(page, [path.join(EVAL, 'project.pdf')], { knowledgeBase: KB, projectId: 'eval-acme-nolegend' });
  const s = scoreDevices(GT.devices, R.detections);
  assert.ok(s.f1 >= 99, JSON.stringify({ f1: s.f1, misses: s.misses.slice(0, 3) })); assert.equal(R.knowledge.consultant, 'Acme Fire Consulting');
});

test('remove a learnt job (back to the bundled base); export → import round trip', async () => {
  const { page } = app;
  const r = await page.evaluate(async () => { const st0 = await FT_LEARN_APP.store(); const rec = st0.scores[0];
    // the second time, the job is scored with itself left out, as the first time
    await FT_LEARN_APP.removeJob('train-acme'); const empty = (await FT_LEARN_APP.store()).contribs.length;
    const kbBundled = FX.knowledgeBase(); const blob = { app: 'FireTake', type: 'learnt-jobs', contribs: st0.contribs, scores: st0.scores };
    const n = await FT_LEARN_APP.importLocal(new File([JSON.stringify(blob)], 'x.json'));
    const st = await FT_LEARN_APP.store();
    return { empty, bundledOnly: kbBundled ? kbBundled.index.projects.map(p => p.projectId) : [], n, contribs: st.contribs.length, scored: st.scores[0].score.f1 === rec.score.f1, kb: FX.knowledgeBase().index.projects.map(p => p.projectId) }; });
  assert.equal(r.empty, 0); assert.ok(!r.bundledOnly.includes('train-acme')); assert.equal(r.n, 1); assert.equal(r.contribs, 1); assert.ok(r.scored); assert.ok(r.kb.includes('train-acme'));
});

test('learning again with the estimator\'s names: a group marked "not a device" is dropped, the names are kept with the job', async () => {
  const { page } = app;
  const b64 = f => fs.readFileSync(path.join(JOB, f)).toString('base64');
  const r = await page.evaluate(async ([o, t]) => { const file = (b, n) => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], n, { type: 'application/pdf' }); };
    const files = { name: 'Train Acme', original: [file(o, 'original.pdf')], takeoff: [file(t, 'takeoff.pdf')] };
    const a = await FT_LEARN_APP.learnJob(files); const cls = a.ex.classes.find(c => c.type && c.n >= 3);
    const b = await FT_LEARN_APP.learnJob({ ...files, markupMap: { classes: { [cls.key]: '-' }, partial: true } });
    const c = await FT_LEARN_APP.learnJob(files);   // the names come back from the stored job
    return { n: cls.n, before: a.rec.devices, after: b.rec.devices, kept: c.rec.devices, map: c.rec.markupMap, others: b.ex.classes.filter(x => x.key !== cls.key && x.type).length }; }, [b64('original.pdf'), b64('takeoff.pdf')]);
  assert.equal(r.after, r.before - r.n, JSON.stringify(r)); assert.equal(r.kept, r.after); assert.ok(r.map && r.map.partial && Object.values(r.map.classes)[0] === '-');
  assert.ok(r.others >= 3, 'the other groups are still named from the symbols under them');
});
