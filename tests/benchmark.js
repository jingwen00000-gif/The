#!/usr/bin/env node
// npm run benchmark — runs validation and performance, then writes benchmarks/latest.md from the results.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), RES = path.join(ROOT, 'tests/results');
if (!process.argv.includes('--no-run')) for (const s of ['tests/validation/run.js', 'tests/performance/run.js']) spawnSync(process.execPath, [s], { cwd: ROOT, stdio: 'inherit' });
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); } catch (e) { return null; } };
const V = read('validation.json') || { rows: [] }, P = read('performance.json') || { rows: [] }, U = read('unit.json'), I = read('integration.json'), G = read('regression.json');
const det = n => read(`validation/${n}.json`);
const L = [];
L.push(`# FireTake benchmark`, '', `Generated ${new Date().toISOString()} · engine app/fve.js ${require(path.join(ROOT, 'app/fve.js')).version}`, '');
L.push('## Test suites', '', '| Suite | Result | Detail |', '|---|---|---|');
for (const [n, s] of [['Unit', U], ['Integration', I], ['Regression', G]]) L.push(`| ${n} | ${s ? (s.ok ? 'PASS' : 'FAIL') : 'not run'} | ${s ? `${s.pass}/${s.tests} passed${s.todo ? `, ${s.todo} todo (modules not implemented)` : ''}${s.coverage ? `, coverage ${s.coverage.lines} % lines / ${s.coverage.branches} % branches` : ''}` : ''} |`);
L.push('', '## Geometry extraction and legend detection', '', '| Project | Sheets | Objects | Geometry s | Legend s |', '|---|---|---|---|---|');
for (const r of P.rows) L.push(`| ${r.project} | ${r.sheets} | ${r.objects} | ${r.geometry_s} | ${r.legend_s} |`);
L.push('', '## Device recognition', '', '| Project | Ground truth | Precision % | Recall % | F1 % | FP | FN | Type accuracy % | Result |', '|---|---|---|---|---|---|---|---|---|');
for (const r of V.rows) { const d = det(r.project); L.push(`| ${r.project} | ${r.status} | ${r.precision ?? '–'} | ${r.recall ?? '–'} | ${r.f1 ?? '–'} | ${r.fp ?? '–'} | ${r.fn ?? '–'} | ${d && d.detection.typeAccuracy != null ? d.detection.typeAccuracy : '–'} | ${r.result} |`); }
const per = V.rows.filter(r => det(r.project)).map(r => [r.project, det(r.project).detection.byType]);
if (per.length) { L.push('', '### By device family', '', '| Project | Family | Truth | Found | False alarms |', '|---|---|---|---|---|'); for (const [n, bt] of per) for (const [k, v] of Object.entries(bt)) L.push(`| ${n} | ${k} | ${v.truth} | ${v.tp} | ${v.fp} |`); }
L.push('', '## Cable / pipe lengths', '', '| Project | Line type | Expected m | Actual m | Error % |', '|---|---|---|---|---|');
for (const r of V.rows) { const d = det(r.project); if (d) for (const c of d.cables) L.push(`| ${r.project} | ${c.loop} | ${c.expected} | ${c.actual} | ${c.errorPct} |`); }
L.push('', '## Loop detection', '', 'Drawn loops matched to ground truth on their sheet: devices within 10 %, length within 5 %. Estimated loops (no cable reaches the devices) are reported by the app, not scored.', '', '| Project | Loop | Expected devices | Found | Device error % | Expected m | Found m | Length error % | Matched |', '|---|---|---|---|---|---|---|---|---|');
for (const r of V.rows) { const d = det(r.project); if (d && d.network) for (const l of d.network.loops) L.push(`| ${r.project} | ${l.id} | ${l.expectedDevices} | ${l.devices ?? '–'} | ${l.devicesErrorPct ?? '–'} | ${l.expected_m} | ${l.length_m ?? '–'} | ${l.lengthErrorPct ?? '–'} | ${l.matched ? 'yes' : 'no'} |`); }
L.push('', '## Room detection', '', '| Project | Expected | Found | Matched by name | Detection % | Area accuracy % |', '|---|---|---|---|---|---|');
for (const r of V.rows) { const d = det(r.project); if (d && d.rooms) L.push(`| ${r.project} | ${d.rooms.expected} | ${d.rooms.found} | ${d.rooms.matched} | ${d.rooms.roomDetection} | ${d.rooms.areaAccuracy ?? '–'} |`); }
L.push('', '## Standards checks', '', 'AS 1670.1:2018, AS 1670.4:2015, AS 2444—2001 and AS 2441—2005 limits (checked against the supplied standards) on the recognised layout; see docs/compliance.md.', '', '| Project | Fail | Warn | Advisory | Info | Isolators needed | Expected found |', '|---|---|---|---|---|---|---|');
for (const r of V.rows) { const d = det(r.project); if (d && d.compliance) { const c = d.compliance, s = c.summary || {}; L.push(`| ${r.project} | ${s.fail || 0} | ${s.warn || 0} | ${s.advisory || 0} | ${s.info || 0} | ${c.isolators} | ${c.expectedIssues != null ? c.detectedIssues + ' / ' + c.expectedIssues : '–'} |`); } }
L.push('');
L.push('## Processing time', '', '| Project | Geometry s | Legend s | Detection s | Network s | Total s | Target ≤ 60 s |', '|---|---|---|---|---|---|---|');
for (const r of P.rows) L.push(`| ${r.project} | ${r.geometry_s} | ${r.legend_s} | ${r.detect_s} | n/a | ${r.total_s} | ${r.ok.total ? 'PASS' : 'FAIL'} |`);
fs.mkdirSync(path.join(ROOT, 'benchmarks'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'benchmarks/latest.md'), L.join('\n') + '\n');
console.log('wrote benchmarks/latest.md');
