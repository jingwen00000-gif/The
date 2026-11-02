#!/usr/bin/env node
// Builds a project's ground-truth.json from count markups on its drawings (Bluebeam polygons: one per device),
// using the project's markup-map.json (markup kind+colour → device type, per page). Reproducible and traceable:
//   node tests/validation/truth-from-markups.js validation-projects/44-mandarin
const fs = require('fs'), path = require('path');
const { openApp } = require('../lib/harness');

(async () => {
  const dir = path.resolve(process.argv[2] || ''); const map = JSON.parse(fs.readFileSync(path.join(dir, 'markup-map.json'), 'utf8'));
  const pdf = path.join(dir, 'project.pdf'); const { browser, page } = await openApp();
  const marks = await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    S.pages = []; await openFiles([new File([u], 'project.pdf', { type: 'application/pdf' })]);
    const out = []; for (const p of S.pages.filter(p => p.kind === 'pdf')) { const pg = await pdfPageObj(p); out.push(FVE.markups(await pg.getAnnotations(), pg.getViewport({ scale: 1 }))); }
    return out;
  }, fs.readFileSync(pdf).toString('base64'));
  await browser.close();
  const devices = []; const summary = {};
  for (const [pi, cfg] of Object.entries(map.pages)) {
    const m = marks[+pi] || {};
    for (const [kind, type] of Object.entries(cfg)) {
      if (kind === 'level' || !m[kind]) continue;
      m[kind].at.forEach(([x, y], i) => devices.push({ id: `${type}-${pi}-${String(i + 1).padStart(3, '0')}`, type, level: cfg.level, page: +pi, x: +x.toFixed(2), y: +y.toFixed(2), source: kind, ...((map.familyOnly || []).includes(type) ? { typeLevel: 'family' } : {}) }));
      summary[`${cfg.level}:${type}`] = (summary[`${cfg.level}:${type}`] || 0) + m[kind].at.length;
    }
  }
  const gt = { project: path.basename(dir), status: 'verified-markups', files: ['project.pdf'], source: map.source, notes: map.notes, generatedBy: 'tests/validation/truth-from-markups.js', summary, devices, networks: [], rooms: [] };
  fs.writeFileSync(path.join(dir, 'ground-truth.json'), JSON.stringify(gt, null, 1));
  console.log('wrote', path.join(dir, 'ground-truth.json'), devices.length, 'devices', JSON.stringify(summary));
})();
