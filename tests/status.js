#!/usr/bin/env node
// npm run status — modules complete, acceptance status per stage, current accuracy, outstanding issues, technical debt.
// A stage passes only when every module is implemented and every gate it owns is met (definition of done).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), RES = path.join(ROOT, 'tests/results');
const M = require('./modules.json');
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); } catch (e) { return null; } };
const U = read('unit.json'), I = read('integration.json'), G = read('regression.json'), V = read('validation.json'), P = read('performance.json');
const mods = M.stages.flatMap(s => s.modules); const done = mods.filter(m => m.implemented).length;
const scored = (V && V.rows || []).filter(r => r.f1 != null);
const out = [];
out.push(`FireTake status — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '');
out.push(`Modules complete: ${done} / ${mods.length}`);
for (const s of M.stages) {
  const m = s.modules, impl = m.filter(x => x.implemented).length; let pass = impl === m.length;
  if (s.id <= 2) pass = pass && !!(U && U.ok && I && I.ok) && scored.length > 0 && scored.every(r => r.f1 >= M.gates.deviceRecognitionF1);
  out.push(`  Stage ${s.id} ${s.name.padEnd(20)} ${pass ? 'PASS  ' : 'FAILED'}  ${impl}/${m.length} modules` + (m.some(x => !x.implemented) ? `  missing: ${m.filter(x => !x.implemented).map(x => x.id).join(', ')}` : ''));
}
out.push('', 'Acceptance');
const line = (n, s, d) => out.push(`  ${n.padEnd(14)} ${s == null ? 'not run' : s ? 'PASS' : 'FAIL'}${d ? '  ' + d : ''}`);
line('Unit', U && U.ok, U && `${U.pass}/${U.tests}, coverage ${U.coverage ? U.coverage.lines + ' % lines' : '?'} (gate ${M.gates.unitLineCoverage} %)`);
line('Integration', I && I.ok, I && `${I.pass}/${I.tests}${I.todo ? `, ${I.todo} todo` : ''}`);
line('Regression', G && G.ok, G && `${G.pass}/${G.tests}${G.skipped ? `, ${G.skipped} skipped (drawings not on this machine)` : ''}`);
line('Validation', V && V.ok, V && `${scored.length} scored project(s)`);
line('Performance', P && P.ok, P && P.rows.map(r => `${r.project} ${r.total_s}s`).join(', '));
out.push('', 'Current accuracy (device recognition F1, gate ' + M.gates.deviceRecognitionF1 + ' %)');
for (const r of (V && V.rows) || []) out.push(`  ${r.project.padEnd(18)} ${r.f1 != null ? `F1 ${r.f1} %  (P ${r.precision} / R ${r.recall}, FP ${r.fp}, FN ${r.fn})` : r.result}`);
out.push('', 'Outstanding issues');
const issues = [];
for (const r of scored) if (r.f1 < M.gates.deviceRecognitionF1) { let d = null; try { d = JSON.parse(fs.readFileSync(path.join(RES, 'validation', r.project + '.json'))); } catch (e) {}
  const worst = d ? Object.entries(d.detection.byType).map(([k, v]) => [k, v.truth - v.tp, v.fp]).filter(x => x[1] || x[2]).sort((a, b) => b[1] + b[2] - a[1] - a[2]).slice(0, 4).map(([k, fn, fp]) => `${k} −${fn}/+${fp}`).join(', ') : '';
  issues.push(`${r.project}: F1 ${r.f1} % below gate — ${worst}`); }
for (const r of (P && P.rows) || []) if (!r.pass) issues.push(`${r.project}: total ${r.total_s}s over the ${M.gates.time.total_s}s target (detection ${r.detect_s}s)`);
for (const r of (V && V.rows) || []) if (/AWAITING|NOT SCORED/.test(r.result)) issues.push(`${r.project}: ${r.result}`);
out.push(...(issues.length ? issues.map(i => '  - ' + i) : ['  none']));
out.push('', 'Technical debt');
for (const m of mods.filter(m => !m.implemented)) out.push(`  - ${m.id}: ${m.name}${m.note ? ' (' + m.note + ')' : ''}`);
out.push('  - app/index.html still holds the vector matcher (vsmBuild / vsmSearch): integration-tested only; move into FVE for unit tests');
console.log(out.join('\n'));
