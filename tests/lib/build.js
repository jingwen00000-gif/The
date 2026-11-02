// Builds the single-file web edition the tests drive (same output as make_web.py, Node only so the test chain needs no Python):
// every local <script src> (app/*.js, ../src/**) is inlined, the pdf.js worker goes where <!--PDFWORKER--> marks it.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'tests/.cache/firetake-test.html');
const APP = path.join(ROOT, 'app');

function localScripts(html) { return [...html.matchAll(/<script src="((?!https?:)[^"]+)"><\/script>/g)].map(m => path.resolve(APP, m[1])); }
function build() {
  let s = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  s = s.replace(/<script src="((?!https?:)[^"]+)"><\/script>/g, (_, f) => '<script>' + (fs.existsSync(path.resolve(APP, f)) ? fs.readFileSync(path.resolve(APP, f), 'utf8') : '/* ' + f + ' not built yet */').replace(/<\/script/g, '<\\/script') + '</script>');
  if (s.split('<!--PDFWORKER-->').length !== 2) throw new Error('build: <!--PDFWORKER--> not found once');
  s = s.replace('<!--PDFWORKER-->', () => '<script>' + fs.readFileSync(path.join(APP, 'pdf.worker.js'), 'utf8').replace(/<\/script/g, '<\\/script') + '</script>');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '﻿' + s);
  return OUT;
}
// rebuild only when a source file is newer than the cached build
function ensureBuild() {
  const html = path.join(APP, 'index.html');
  const src = [html, path.join(APP, 'pdf.worker.js'), ...localScripts(fs.readFileSync(html, 'utf8'))].filter(f => fs.existsSync(f)).map(f => fs.statSync(f).mtimeMs);
  if (!fs.existsSync(OUT) || fs.statSync(OUT).mtimeMs < Math.max(...src)) return build();
  return OUT;
}
module.exports = { build, ensureBuild, ROOT };
if (require.main === module) console.log('built', build());
