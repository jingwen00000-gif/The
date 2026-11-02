// Shared project discovery and output summary for regression / performance / debug.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
function all() {
  const out = [];
  for (const base of ['tests/datasets', 'validation-projects']) {
    const dir = path.join(ROOT, base); if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const gtf = path.join(dir, name, 'ground-truth.json'); if (!fs.existsSync(gtf)) continue;
      const gt = JSON.parse(fs.readFileSync(gtf, 'utf8')); const files = (gt.files || ['project.pdf']).map(f => path.join(dir, name, f));
      // a consultant library the estimator built (library.json: geoHash → device) is what the app would have stored from an earlier job
      const lf = path.join(dir, name, 'library.json'); const library = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')).entries : null;
      out.push({ name, dir: path.join(dir, name), gt, files, library, present: files.every(f => fs.existsSync(f)) });
    }
  }
  return out;
}
function find(nameOrPdf) {
  if (nameOrPdf && nameOrPdf.endsWith('.pdf')) return { name: path.basename(nameOrPdf, '.pdf'), files: [path.resolve(nameOrPdf)], present: fs.existsSync(nameOrPdf) };
  return all().find(p => p.name === nameOrPdf);
}
// what regression compares: sheet types, dictionary size, detections per page and type, line lengths
function summary(R) {
  const det = {}; for (const d of R.detections) { const k = `${d.page}:${d.type}${d.status ? '@' + d.status : ''}`; det[k] = (det[k] || 0) + 1; }
  return { sheets: R.pages.map(p => p.sheet), scales: R.pages.map(p => p.scale ? p.scale.ratio : null),
    dictionary: { symbols: R.dict.symbols.length, typed: R.dict.symbols.filter(s => s.type).length, lineTypes: R.dict.lineTypes.filter(l => l.cls).length, abbrev: Object.keys(R.dict.abbrev).length },
    detections: Object.fromEntries(Object.entries(det).sort()), total: R.detections.length,
    lines: Object.fromEntries(R.lines.map(l => [l.desc, Math.round(l.total_m * 10) / 10])) };
}
module.exports = { all, find, summary, ROOT };
