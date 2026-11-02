// Runs the real app (web edition) in headless Chromium and drives the FireTake Vector Engine end to end:
// PDF → objects/text (layer 1–2) → project dictionary (layer 3) → detections (layer 4, with the app's vector matcher) → verify + line lengths.
const fs = require('fs');
const { chromium } = require('playwright');
const { ensureBuild } = require('./build');

async function openApp() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // FT_FLAGS=A,B sets window.A = window.B = true before the app loads (A/B switches while bisecting a change)
  if (process.env.FT_FLAGS) await page.addInitScript(f => f.split(',').forEach(k => globalThis[k] = true), process.env.FT_FLAGS);
  await page.goto('file://' + ensureBuild());
  await page.waitForFunction(() => typeof FVE === 'object' && typeof openFiles === 'function', null, { timeout: 30000 });
  return { browser, page, errors };
}

// pdfs: [path] (one project may span several files). Returns timings, per-page models summary, dictionary, detections, warnings, lines.
async function analyse(page, pdfs, opts = {}) {
  const files = pdfs.map(f => [f.split('/').pop(), fs.readFileSync(f).toString('base64')]);
  return page.evaluate(async ({ files, opts }) => {
    const t0 = performance.now();
    S.pages = [];
    for (const [n, b64] of files) {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await openFiles([new File([u], n, { type: 'application/pdf' })]);
    }
    const pages = S.pages.filter(p => p.kind === 'pdf' && pdfPageRef.get(p.id));
    const t1 = performance.now(); const models = [];
    for (const p of pages) models.push(await FVE.buildModel(await pdfPageObj(p), pdfjsLib.OPS, { id: p.id, name: p.name, index: models.length }));
    // Learning Engine: who drew the set, then what the knowledge base knows about them (the project's own contributions left out)
    let K = null, consultant = null;
    if (opts.knowledgeBase) { consultant = FT_LEARN.consultant.extract(models, { known: FT_LEARN.db.entries(opts.knowledgeBase.consultants) });
      K = FT_LEARN.db.forRecognition(opts.knowledgeBase, { consultant: consultant.consultant, excludeProject: opts.projectId || null }); }
    // naming legend rows: the estimator's library and this consultant's own history only (another consultant's geoHash is a coincidence)
    const library = [].concat(opts.library || [], K ? K.library.filter(e => e.consultant) : []);
    const t2 = performance.now(); const D = FVE.projectDictionary(models, { library: library.length ? library : null, knowledge: K });
    const t3 = performance.now();
    const dets = await FVE.detect(models, D, { library: opts.library || null, knowledge: K, match: async (e, m, q) => {
      const p = S.pages.find(x => x.id === m.page.id); const T = await fveTemplate(e); if (!T) return [];
      return (await vsmSearch(p, T, q || 1)).filter(h => h.score >= (opts.minScore || .85));
    } });
    const t4 = performance.now(); const warn = FVE.verify(models, D, dets); const lines = FVE.measureLines(models, D); const t5 = performance.now();
    const idx = id => pages.findIndex(p => p.id === id);
    return {
      knowledge: K ? { consultant: consultant.consultant, known: K.consultantKnown, templates: K.templates.length, historical: D.hist, library: K.library.length } : null,
      ms: { open: t1 - t0, geometry: t2 - t1, legend: t3 - t2, detect: t4 - t3, verify: t5 - t4, total: t5 - t0 },
      pages: models.map((m, i) => ({ i, name: m.page.name, w: m.page.w, h: m.page.h, sheet: m.sheet.kind, title: m.sheet.title, scale: m.scale, objects: m.objects.length, texts: m.texts.length,
        kinds: m.objects.reduce((o, x) => (o[x.k] = (o[x.k] || 0) + 1, o), {}), markups: Object.fromEntries(Object.entries(m.markups || {}).map(([k, g]) => [k, { n: g.n, at: g.at }])) })),
      dict: { sources: D.sources, abbrev: D.abbrev, tagType: D.tagType,
        geo: D.geo, symbols: D.symbols.map(s => ({ id: s.id, desc: s.desc, type: s.type, typeSrc: s.typeSrc, geoHash: s.geoHash, status: s.status, tags: s.tags, shapes: s.shapes, color: s.color, key: s.key, bb: s.bb })),
        lineTypes: D.lineTypes.map(l => ({ id: l.id, desc: l.desc, cls: l.cls, stroke: l.stroke, w: l.w, dashed: l.dashed, dupOf: !!l.dupOf })), zones: D.zones },
      detections: dets.map(d => ({ page: idx(d.page), x: d.x, y: d.y, w: d.w, h: d.h, type: d.type, status: d.status, conf: d.conf, entry: d.entry, src: [...new Set(d.ev.map(e => e.src))].sort().join('+'), rules: d.rules })),
      warnings: warn.map(w => ({ ...w, page: w.page ? idx(w.page) : undefined })),
      lines: lines.map(l => ({ id: l.id, desc: l.desc, cls: l.cls, status: l.status, dashed: l.dashed, total_m: l.total, unscaled: l.unscaled,
        pages: Object.fromEntries(Object.entries(l.pages).map(([k, v]) => [idx(k), { m: v.m, paper: v.paper, chains: v.chains.length, ratio: v.ratio }])) }))
    };
  }, { files, opts });
}

module.exports = { openApp, analyse };
