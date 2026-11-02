// Builds the single-file web edition the tests drive (same output as make_web.py, Node only so the test chain needs no Python).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'tests/.cache/firetake-test.html');

function build() {
  let s = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
  for (const [f, tag] of [['builtin.js', '<script src="builtin.js"></script>'], ['pdf.js', '<script src="pdf.js"></script>'],
    ['fve.js', '<script src="fve.js"></script>'], ['pdf.worker.js', '<!--PDFWORKER-->']]) {
    const js = fs.readFileSync(path.join(ROOT, 'app', f), 'utf8').replace(/<\/script/g, '<\\/script');
    if (s.split(tag).length !== 2) throw new Error('build: tag not found once: ' + tag);
    s = s.replace(tag, () => '<script>' + js + '</script>');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '﻿' + s);
  return OUT;
}
// rebuild only when a source file is newer than the cached build
function ensureBuild() {
  const src = ['index.html', 'builtin.js', 'pdf.js', 'fve.js', 'pdf.worker.js'].map(f => fs.statSync(path.join(ROOT, 'app', f)).mtimeMs);
  if (!fs.existsSync(OUT) || fs.statSync(OUT).mtimeMs < Math.max(...src)) return build();
  return OUT;
}
module.exports = { build, ensureBuild, ROOT };
if (require.main === module) console.log('built', build());
