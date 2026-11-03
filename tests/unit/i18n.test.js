// Unit: the English interface — every piece of Chinese text in the app and its modules translates with no Chinese left over
// (the translator replaces known phrases inside a text, so a missing phrase shows up as half-Chinese, half-English text)
const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const vm = require('vm'); const path = require('path');
const R = path.join(__dirname, '../..');
test('English: no Chinese left after translation', () => {
  const H = fs.readFileSync(R + '/app/index.html', 'utf8'); const a = H.indexOf('const I18N={'), b = H.indexOf('const I18N_ORIG=');
  const ctx = { LANG: 'en' }; vm.createContext(ctx);
  vm.runInContext(H.slice(a, b).replace(/^const /gm, 'var ').replace(/^let LANG[^\n]*/m, '').replace(/\nfunction T\(/, '\nT=function(') + ';this.T=T', ctx);
  const learn = fs.readFileSync(R + '/src/learning-engine/learn-app.js', 'utf8').match(/Object\.assign\(I18N,\{[\s\S]*?\}\);/); if (learn) vm.runInContext(learn[0], ctx);
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const files = [R + '/app/index.html', R + '/app/fve.js', ...walk(R + '/src')]; const CJK = /[一-鿿]/, bad = [];
  for (const f of files) {
    let s = fs.readFileSync(f, 'utf8'); if (f.endsWith('index.html')) s = s.slice(0, a) + s.slice(b);
    s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
    for (const piece of s.split(/['"`<>\n]|\$\{|\}/)) {
      const t = piece.trim(); if (!CJK.test(t) || t === '中文' || t === '中' || /\.test\(|\.replace\(|\/\[|\|[^ ]/.test(t)) continue;
      ctx.LANG = 'en'; const o = ctx.T(t); if (CJK.test(o)) bad.push(path.relative(R, f) + ': ' + t.slice(0, 80) + ' → ' + o.slice(0, 80));
    }
  }
  assert.deepEqual([...new Set(bad)], [], 'add these to the I18N table in app/index.html');
});
