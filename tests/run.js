#!/usr/bin/env node
// Test entry point used by the npm scripts. Runs node:test suites with a readable reporter on screen and a TAP file +
// JSON summary in tests/results/ (npm run status and the benchmark read those).
//   node tests/run.js unit | integration | regression | all
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), RES = path.join(ROOT, 'tests/results');
fs.mkdirSync(RES, { recursive: true });
const GATES = require('./modules.json').gates;

function ensureData() { if (!fs.existsSync(path.join(ROOT, 'tests/datasets/synthetic-basic/project.pdf'))) spawnSync(process.execPath, ['tests/datasets/generate.js'], { cwd: ROOT, stdio: 'inherit' }); }

function suite(name) {
  const tap = path.join(RES, name + '.tap');
  const args = ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${tap}`];
  if (name === 'unit') args.push('--experimental-test-coverage', '--test-coverage-include=app/fve.js', '--test-coverage-include=src/**/*.js', `--test-coverage-lines=${GATES.unitLineCoverage}`,
    '--test-reporter=lcov', `--test-reporter-destination=${path.join(RES, 'lcov.info')}`);
  else args.push('--test-concurrency=1');
  args.push(`tests/${name}/**/*.test.js`);
  const t0 = Date.now(); const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  const txt = fs.existsSync(tap) ? fs.readFileSync(tap, 'utf8') : '';
  const num = k => { const m = txt.match(new RegExp('^# ' + k + ' (\\d+)', 'm')); return m ? +m[1] : 0; };
  const sum = { suite: name, ok: r.status === 0, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), todo: num('todo'), seconds: (Date.now() - t0) / 1000, at: new Date().toISOString() };
  if (name === 'unit' && fs.existsSync(path.join(RES, 'lcov.info'))) {
    const l = fs.readFileSync(path.join(RES, 'lcov.info'), 'utf8'); const lf = [...l.matchAll(/^LF:(\d+)/gm)].reduce((a, m) => a + +m[1], 0), lh = [...l.matchAll(/^LH:(\d+)/gm)].reduce((a, m) => a + +m[1], 0);
    const bf = [...l.matchAll(/^BRF:(\d+)/gm)].reduce((a, m) => a + +m[1], 0), bh = [...l.matchAll(/^BRH:(\d+)/gm)].reduce((a, m) => a + +m[1], 0);
    sum.coverage = { lines: lf ? Math.round(1000 * lh / lf) / 10 : null, branches: bf ? Math.round(1000 * bh / bf) / 10 : null };
  }
  fs.writeFileSync(path.join(RES, name + '.json'), JSON.stringify(sum, null, 1));
  return sum;
}

const which = process.argv[2] || 'all'; ensureData();
const order = which === 'all' ? ['unit', 'integration', 'regression'] : [which];
const out = order.map(suite);
if (which === 'all') {
  for (const s of ['validation/run.js', 'performance/run.js']) out.push({ suite: s.split('/')[0], ok: spawnSync(process.execPath, ['tests/' + s], { cwd: ROOT, stdio: 'inherit' }).status === 0 });
}
console.log('\n' + out.map(s => `${s.ok ? 'PASS' : 'FAIL'}  ${s.suite}${s.tests != null ? `  (${s.pass}/${s.tests} passed${s.todo ? `, ${s.todo} todo` : ''}${s.coverage ? `, coverage ${s.coverage.lines} % lines` : ''})` : ''}`).join('\n'));
process.exit(out.every(s => s.ok) ? 0 : 1);
