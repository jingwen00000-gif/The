#!/usr/bin/env node
// npm run test:validation — every project with a ground-truth.json (validation-projects/* and tests/datasets/*):
// runs the engine, compares with ground truth, writes tests/results/validation/<project>.json and a summary.
// Gates (tests/modules.json): device recognition F1 and cable accuracy on scored projects. Modules that do not exist yet
// Loops, rooms and AS 1670 findings are scored against ground truth when it has them (otherwise reported).
const fs = require('fs'), path = require('path');
const { openApp, analyse } = require('../lib/harness');
const { scoreLoops, scoreRooms, scoreDevices, scoreLength } = require('../lib/metrics');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'tests/results/validation');
const GATES = require('../modules.json').gates, strict = process.argv.includes('--strict');
// the Learning Engine's knowledge base (data/knowledge); each project is analysed without its own contributions
const KB = require('../lib/knowledge').load();
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

function projects() {
  const list = [];
  for (const base of ['validation-projects', 'tests/datasets']) {
    const dir = path.join(ROOT, base); if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const gtf = path.join(dir, name, 'ground-truth.json'); if (!fs.existsSync(gtf)) continue;
      const gt = JSON.parse(fs.readFileSync(gtf, 'utf8')); const files = (gt.files || ['project.pdf']).map(f => path.join(dir, name, f));
      list.push({ name, dir: path.join(dir, name), gt, files, present: files.every(f => fs.existsSync(f)) });
    }
  }
  return only.length ? list.filter(p => only.includes(p.name)) : list;
}
const scored = gt => (gt.generated || /^verified/.test(gt.status || '')) && (gt.devices || []).length > 0;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const P = projects(); const rows = []; let app = null; let failed = false;
  for (const p of P) {
    const row = { project: p.name, status: p.gt.status || (p.gt.generated ? 'generated' : 'unknown') };
    if (!p.present) { row.result = 'AWAITING DATA'; rows.push(row); continue; }
    if (!scored(p.gt)) { row.result = 'NOT SCORED (no verified ground truth — runs in regression)'; rows.push(row); continue; }
    app = app || await openApp();
    const R = await analyse(app.page, p.files, { library: p.library, knowledgeBase: KB, projectId: p.name });
    const s = scoreDevices(p.gt.devices, R.detections, { tol: p.gt.tolerance || 12 });
    const detection = { project: p.name, precision: s.precision, recall: s.recall, f1: s.f1, falsePositive: s.falsePositive, falseNegative: s.falseNegative, typeAccuracy: s.typeAccuracy, byType: s.byType, confusion: s.confusion };
    const cables = Object.entries(p.gt.lines || {}).map(([k, exp]) => { const got = R.lines.find(l => l.desc === k); return { loop: k, ...scoreLength(exp, got ? got.total_m : 0) }; });
    const network = (p.gt.networks || []).length ? { project: p.name, ...scoreLoops(p.gt.networks, R.loops) } : null;
    const rooms = (p.gt.rooms || []).length ? scoreRooms(p.gt.rooms, R.rooms) : null;
    // AS 1670 findings: scored when the ground truth lists the expected ones ({rule, room?}), otherwise reported
    const found = R.compliance.findings; const exp = p.gt.compliance || null;
    const hit = exp ? exp.filter(e => found.some(f => f.rule === e.rule && (!e.room || f.room === e.room) && (e.page == null || f.page === e.page))).length : null;
    const compliance = { findings: found.length, summary: R.compliance.summary, isolators: R.compliance.isolators, ...(exp ? { expectedIssues: exp.length, detectedIssues: hit, falseWarnings: found.filter(f => f.level === 'fail' && !exp.some(e => e.rule === f.rule && (!e.room || f.room === e.room))).length } : {}) };
    const cableAcc = cables.length ? Math.round(10 * (100 - cables.reduce((a, c) => a + (c.errorPct || 0), 0) / cables.length)) / 10 : null;
    const gates = { device: s.f1 >= GATES.deviceRecognitionF1, cable: cableAcc == null || cableAcc >= GATES.cableAccuracy, network: !network || network.accuracy >= GATES.loopDetection, rooms: !rooms || rooms.roomDetection >= GATES.roomDetection };
    const ok = Object.values(gates).every(Boolean); if (!ok) failed = true;
    const res = { project: p.name, at: new Date().toISOString(), ok, gates, detection, cables, cableAccuracy: cableAcc, network, rooms, compliance,
      timing_s: Object.fromEntries(Object.entries(R.ms).map(([k, v]) => [k, Math.round(v / 100) / 10])), sheets: R.pages.map(x => x.sheet),
      misses: s.misses, falseAlarms: s.falseAlarms, warnings: R.warnings.filter(w => w.level !== 'info').slice(0, 40) };
    fs.writeFileSync(path.join(OUT, p.name + '.json'), JSON.stringify(res, null, 1));
    Object.assign(row, { result: ok ? 'PASS' : 'FAIL', precision: s.precision, recall: s.recall, f1: s.f1, fp: s.falsePositive, fn: s.falseNegative, cableAccuracy: cableAcc, loops: network ? `${network.accuracy}% (${network.matched}/${network.expectedLoops}, length ±${network.lengthErrorPct}%)` : '-', rooms: rooms ? `${rooms.roomDetection}% (area ${rooms.areaAccuracy}%)` : '-', total_s: res.timing_s.total });
    rows.push(row);
  }
  if (app) await app.browser.close();
  fs.writeFileSync(path.join(ROOT, 'tests/results/validation.json'), JSON.stringify({ at: new Date().toISOString(), ok: !failed, rows }, null, 1));
  console.log('\nVALIDATION');
  for (const r of rows) console.log(`  ${r.project.padEnd(18)} ${String(r.result).padEnd(8)} ${r.f1 != null ? `P ${r.precision}  R ${r.recall}  F1 ${r.f1}  FP ${r.fp}  FN ${r.fn}  cable ${r.cableAccuracy ?? '-'}  loops ${r.loops}  rooms ${r.rooms}  ${r.total_s}s` : ''}`);
  process.exit(failed ? 1 : 0);
})();
