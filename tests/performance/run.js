#!/usr/bin/env node
// npm run test:performance — processing time per project against the targets in tests/modules.json:
// geometry < 30 s, legend < 10 s, network < 10 s (not implemented), total < 60 s.
const fs = require('fs'), path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { all, ROOT } = require('../lib/projects');
const T = require('../modules.json').gates.time;
// the Learning Engine's knowledge base (data/knowledge); each project is analysed without its own contributions
const KB = require('../lib/knowledge').load();
const only = process.argv.slice(2);

(async () => {
  const app = await openApp(); const rows = []; let failed = false;
  for (const p of all().filter(p => p.present && (!only.length || only.includes(p.name)))) {
    const R = await analyse(app.page, p.files, { library: p.library, knowledgeBase: KB, projectId: p.name }); const s = k => Math.round(R.ms[k] / 100) / 10;
    const row = { project: p.name, sheets: R.pages.length, objects: R.pages.reduce((a, x) => a + x.objects, 0), geometry_s: s('geometry') + s('open'), legend_s: s('legend'), detect_s: s('detect'), network_s: null, total_s: s('total') };
    row.ok = { geometry: row.geometry_s < T.geometry_s, legend: row.legend_s < T.legend_s, network: 'NOT IMPLEMENTED', total: row.total_s < T.total_s };
    row.pass = row.ok.geometry && row.ok.legend && row.ok.total; if (!row.pass) failed = true; rows.push(row);
    console.log(`  ${p.name.padEnd(18)} ${row.pass ? 'PASS' : 'FAIL'}  sheets ${row.sheets}  objects ${row.objects}  geometry ${row.geometry_s}s  legend ${row.legend_s}s  detect ${row.detect_s}s  total ${row.total_s}s`);
  }
  await app.browser.close();
  fs.mkdirSync(path.join(ROOT, 'tests/results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tests/results/performance.json'), JSON.stringify({ at: new Date().toISOString(), targets: T, ok: !failed, rows }, null, 1));
  process.exit(failed ? 1 : 0);
})();
