#!/usr/bin/env node
// Ground truth from a takeoff whose estimator left Bluebeam count tables (Description / Quantity / Unit per section on each sheet):
// the Learning Engine reads the tables, ties each row to its markup group by total, and every markup of a tied group is a device of the
// row's type and status, at the markup's own position. Rows the tables leave ambiguous are not used.
//   node tests/validation/truth-from-count-tables.js <training folder> <validation folder>
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { openApp } = require('../lib/harness');
const I = require('../../src/learning-engine/project-ingestion');
(async () => {
  const src = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]); const P = I.loadFolder(src);
  const words = P.takeoffDrawing.flatMap(f => I.bboxWords(cp.execFileSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 })));
  const b64 = f => [path.basename(f), fs.readFileSync(f).toString('base64')];
  const app = await openApp();
  const ex = await app.page.evaluate(i => FT_LEARN.ingest.ingestInApp(i), { projectId: path.basename(out), original: P.originalDrawing.map(b64), takeoff: P.sameFile ? null : P.takeoffDrawing.map(b64), takeoffWords: words, metadata: P.metadata });
  await app.browser.close();
  const tied = new Set(ex.countTables.flatMap(t => t.rows.filter(r => r.groups.length && !r.ambiguous && r.type).map(r => t.page + '|' + r.groups.join('|'))));
  const rowOf = d => ex.countTables.find(t => t.page === d.page)?.rows.find(r => !r.ambiguous && r.groups.includes(d.grp));
  const fam = t => /^spk_/.test(t) ? 'sprinkler' : /^(speaker|spk_surf|horn)$/.test(t) ? 'speaker' : t;
  const devices = ex.devices.filter(d => rowOf(d)).map((d, i) => { const r = rowOf(d); return { id: `${r.type}-${d.page}-${String(i + 1).padStart(3, '0')}`, type: r.type, status: r.status, page: d.page, x: d.mx, y: d.my, source: d.grp, row: r.description }; });
  const summary = {}; devices.forEach(d => { const k = `${d.page}:${d.type}@${d.status}`; summary[k] = (summary[k] || 0) + 1; });
  const tables = ex.countTables.map(t => ({ page: t.page, rows: t.rows.map(r => ({ description: r.description, status: r.status, qty: r.qty, unit: r.unit, type: r.type, groups: r.groups, ambiguous: r.ambiguous })) }));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'ground-truth.json'), JSON.stringify({ project: path.basename(out), status: 'verified-count-tables', files: ['project.pdf'],
    source: "Estimator's Bluebeam count tables on the takeoff (one row per markup group, totals checked against the markups); positions are the markup centres",
    generatedBy: 'tests/validation/truth-from-count-tables.js', tolerance: 20, summary, countTables: tables, devices, networks: [], rooms: [] }, null, 1));
  console.log('wrote', path.join(out, 'ground-truth.json'), devices.length, 'devices', JSON.stringify(summary));
})().catch(e => { console.error(e); process.exit(1); });
