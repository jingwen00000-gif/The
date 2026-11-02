// Regression: projects that worked must keep working. Each baseline in tests/regression/baselines/<project>.json is the accepted
// output (sheet types, dictionary, detections per page and type, line lengths). Any drift fails; an intended change is accepted with
//   UPDATE_BASELINES=1 npm run test:regression
// Projects whose PDFs are not on this machine are skipped (client drawings are not committed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { all, summary } = require('../lib/projects');
const BASE = path.join(__dirname, 'baselines'), UPDATE = !!process.env.UPDATE_BASELINES;

let app;
test.before(async () => { app = await openApp(); });
test.after(async () => { if (app) await app.browser.close(); });

for (const p of all()) {
  const bf = path.join(BASE, p.name + '.json');
  if (!fs.existsSync(bf) && !UPDATE) continue;
  test(`regression: ${p.name}`, { skip: p.present ? false : 'drawings not on this machine' }, async () => {
    const got = summary(await analyse(app.page, p.files, { library: p.library }));
    if (UPDATE) { fs.writeFileSync(bf, JSON.stringify({ project: p.name, accepted: new Date().toISOString(), ...got }, null, 1)); return; }
    const exp = JSON.parse(fs.readFileSync(bf, 'utf8'));
    assert.deepEqual(got.sheets, exp.sheets, 'sheet types changed');
    assert.deepEqual(got.scales, exp.scales, 'scales changed');
    assert.deepEqual(got.dictionary, exp.dictionary, 'legend dictionary changed');
    const keys = new Set([...Object.keys(exp.detections), ...Object.keys(got.detections)]); const diff = [];
    for (const k of keys) { const a = exp.detections[k] || 0, b = got.detections[k] || 0; if (a !== b) diff.push(`${k}: ${a} → ${b}`); }
    assert.deepEqual(diff, [], 'detections changed:\n  ' + diff.join('\n  '));
    for (const [k, v] of Object.entries(exp.lines)) { const g = got.lines[k]; assert.ok(g != null && Math.abs(g - v) <= Math.max(.1, v * .01), `line ${k}: ${v} → ${g}`); }
  });
}
