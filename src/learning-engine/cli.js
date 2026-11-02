#!/usr/bin/env node
/* npm run learn -- <project folder>… [--all <folder of projects>] [--out data/knowledge] [--rebuild]

   For each finished job: load the folder → read original + takeoff in the FireTake engine (headless Chromium, the same code the app
   runs) → diff → extract symbols / consultant / networks / rooms → read BOQ / quote → write the project's knowledge graph and
   contributions → rebuild every library in --out (default data/knowledge) and the app bundle (knowledge.bundle.js).
   Jobs are processed in order and each one already reads with what the earlier ones taught. --rebuild only rebuilds the libraries. */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '../..');
const L = { ingest: require('./project-ingestion'), pricing: require('./pricing-extractor'), builder: require('./knowledge-builder'), db: require('./learning-database') };

async function learn(folders, out, log = console.log) {
  const { openApp } = require(path.join(ROOT, 'tests/lib/harness'));
  const FVE = require(path.join(ROOT, 'app/fve.js'));
  const app = await openApp(); const results = [];
  try {
    for (const dir of folders) {
      const P = L.ingest.loadFolder(dir); if (!P.originalDrawing.length) { log(`skip ${dir}: no PDF`); continue; }
      const t0 = Date.now(); const K = L.db.load(out);
      const b64 = f => [path.basename(f), fs.readFileSync(f).toString('base64')];
      const ex = await app.page.evaluate(input => FT_LEARN.ingest.ingestInApp(input), {
        projectId: P.projectId, original: P.originalDrawing.map(b64), takeoff: P.sameFile ? null : P.takeoffDrawing.map(b64), metadata: P.metadata, markupMap: P.markupMap, knowledge: K });
      const pricing = {};
      for (const k of ['boq', 'quote']) if (P[k]) { const sh = await L.pricing.readXlsx(fs.readFileSync(P[k]), b => zlib.inflateRawSync(b)); pricing[k] = L.pricing.extract(sh, { FVE, source: k }); }
      const files = { original: P.originalDrawing.map(f => path.basename(f)), takeoff: P.takeoffDrawing.map(f => path.basename(f)), boq: P.boq && path.basename(P.boq), quote: P.quote && path.basename(P.quote) };
      const { graph, contributions } = L.builder.build({ projectId: P.projectId, metadata: P.metadata, files }, ex, pricing);
      L.db.saveProject(out, graph, contributions); L.db.save(out);
      const s = graph.summary;
      log(`${P.projectId}: consultant ${ex.consultant.consultant || '?'}${ex.consultant.known ? ' (known)' : ''} · ${s.devices} devices from ${ex.classes.length} markup classes (${ex.classes.map(c => `${c.kind}#${c.colour}→${c.type || '?'} by ${c.how}`).join(', ')}) · ${s.symbols} symbols · ${s.networks} circuits · ${s.rooms} rooms · ${s.pricingItems} priced items · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      results.push({ projectId: P.projectId, summary: s, consultant: ex.consultant, classes: ex.classes, unknownClasses: ex.unknownClasses, boqCheck: graph.pricing.boqCheck });
    }
  } finally { await app.browser.close(); }
  return results;
}

if (require.main === module) (async () => {
  const a = process.argv.slice(2); const flag = n => { const i = a.indexOf(n); return i >= 0 ? a.splice(i, 2)[1] : null; };
  const out = path.resolve(flag('--out') || path.join(ROOT, 'data/knowledge')); const all = flag('--all'); const rebuild = a.includes('--rebuild'); const folders = a.filter(x => !x.startsWith('--'));
  if (all) for (const n of fs.readdirSync(all).sort()) { const d = path.join(all, n); if (fs.statSync(d).isDirectory()) folders.push(d); }
  if (rebuild) { const Lb = L.db.save(out); console.log('rebuilt', out, Lb.index.projects.length, 'projects'); return; }
  if (!folders.length) { console.log('usage: npm run learn -- <project folder>… [--all data/training-projects] [--out data/knowledge]'); process.exit(2); }
  const r = await learn(folders, out); const Lb = L.db.load(out);
  const E = L.db.entries; console.log(`knowledge base ${path.relative(ROOT, out) || out}: ${Lb.index.projects.length} projects · ${E(Lb.symbols).length} symbols · ${E(Lb.consultants).length} consultants · ${((Lb.networks.entries || Lb.networks).patterns || []).length} circuit patterns · ${E(Lb.rooms).length} room types · ${E(Lb.pricing).length} priced items`);
  if (r.some(x => x.unknownClasses.length)) console.log('markup classes nobody could name (add them to the job\'s markup-map.json):', r.flatMap(x => x.unknownClasses.map(k => x.projectId + ' ' + k)).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
module.exports = { learn };
