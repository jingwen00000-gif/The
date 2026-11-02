#!/usr/bin/env node
// npm run debug:legend -- <project name | file.pdf>
// Writes debug/<project>/: dictionary.json (legend analysis), detections.json, warnings.json, log.txt, and one SVG overlay per sheet
// (legend zones, title block, legend symbols, detections coloured by type with confidence). network / rooms / compliance report
// that their modules do not exist yet.
const fs = require('fs'), path = require('path');
const { openApp, analyse } = require('./lib/harness');
const { find, ROOT } = require('./lib/projects');
const [kind, target] = process.argv.slice(2);
const TODO = { network: 'Stage 4 network-graph / loop-detection', rooms: 'Stage 3 room-detection', compliance: 'Stage 3 AS 1670 checks' };
if (TODO[kind]) { console.error(`debug:${kind}: the ${TODO[kind]} module is not implemented yet — nothing to debug. See npm run status.`); process.exit(2); }
if (kind !== 'legend') { console.error('usage: npm run debug:legend -- <project | file.pdf>'); process.exit(1); }
const p = find(target); if (!p || !p.present) { console.error('project or PDF not found: ' + target); process.exit(1); }
const COL = { smoke: '#d32f2f', heat: '#ef6c00', speaker: '#1565c0', spk_surf: '#1565c0', mcp: '#6a1b9a', relay: '#00838f', sounder: '#f9a825', wip: '#2e7d32' };
const esc = s => String(s).replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[c]);

(async () => {
  const app = await openApp(); const R = await analyse(app.page, p.files); await app.browser.close();
  const dir = path.join(ROOT, 'debug', p.name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dictionary.json'), JSON.stringify(R.dict, null, 1));
  fs.writeFileSync(path.join(dir, 'detections.json'), JSON.stringify(R.detections, null, 1));
  fs.writeFileSync(path.join(dir, 'warnings.json'), JSON.stringify(R.warnings, null, 1));
  const log = [`project ${p.name}`, `timing ms ${JSON.stringify(Object.fromEntries(Object.entries(R.ms).map(([k, v]) => [k, Math.round(v)])))}`];
  R.pages.forEach(pg => log.push(`sheet ${pg.i} ${pg.sheet.padEnd(9)} scale ${pg.scale ? '1:' + pg.scale.ratio : '-'}  objects ${pg.objects}  texts ${pg.texts}  ${pg.title}`));
  log.push(`legend sections: ${R.dict.sources.map(s => s.sections.join(' | ')).join(' || ')}`);
  R.dict.symbols.forEach(s => log.push(`  symbol ${s.id} ${String(s.type || '?').padEnd(10)} ${String(s.status || '').padEnd(8)} ${s.desc}  [${s.shapes.join(',')}] key ${s.key ? s.key.k + ' ' + s.key.size.toFixed(2) : '-'}`));
  R.dict.lineTypes.forEach(l => log.push(`  line ${l.id} ${String(l.cls || '-').padEnd(6)} #${l.stroke} ${l.dashed ? 'dashed' : 'solid'}${l.dupOf ? ' (duplicate style)' : ''} ${l.desc}`));
  log.push(`abbreviations: ${Object.entries(R.dict.abbrev).map(([k, v]) => k + '=' + v).join('; ')}`);
  const by = {}; R.detections.forEach(d => { const k = `sheet ${d.page} ${d.type}`; by[k] = (by[k] || 0) + 1; }); Object.entries(by).forEach(([k, n]) => log.push(`detections ${k}: ${n}`));
  R.lines.forEach(l => log.push(`length ${l.desc}: ${Math.round(l.total_m * 10) / 10} m`));
  R.warnings.forEach(w => log.push(`${w.level.toUpperCase()} ${w.msg}`));
  fs.writeFileSync(path.join(dir, 'log.txt'), log.join('\n') + '\n');
  // overlays (page units; open next to the PDF page to compare)
  R.pages.forEach(pg => {
    const W = Math.round(pg.w), H = Math.round(pg.h); const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`, `<rect width="${W}" height="${H}" fill="#fff" stroke="#999"/>`, `<text x="20" y="30" font-size="18">${esc(p.name)} · sheet ${pg.i} · ${pg.sheet} · ${esc(pg.title)}</text>`];
    for (const s of R.dict.symbols) if (s.bb && R.pages[pg.i] && pg.sheet === 'legend') svg.push(`<rect x="${s.bb[0]}" y="${s.bb[1]}" width="${s.bb[2] - s.bb[0]}" height="${s.bb[3] - s.bb[1]}" fill="none" stroke="${s.type ? '#2e7d32' : '#9e9e9e'}"/>`);
    for (const d of R.detections.filter(d => d.page === pg.i)) { const c = COL[d.type] || '#000'; svg.push(`<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${Math.max(4, Math.max(d.w, d.h) * .7).toFixed(1)}" fill="none" stroke="${c}" stroke-width="1.2" opacity="${(.4 + .6 * d.conf).toFixed(2)}"/><text x="${(d.x + 6).toFixed(1)}" y="${(d.y - 6).toFixed(1)}" font-size="6" fill="${c}">${esc(d.type)} ${Math.round(d.conf * 100)}</text>`); }
    svg.push('</svg>'); fs.writeFileSync(path.join(dir, `sheet-${pg.i}.svg`), svg.join('\n'));
  });
  console.log(log.slice(0, 12).join('\n') + '\n…\nwrote ' + path.relative(ROOT, dir) + '/ (dictionary.json, detections.json, warnings.json, log.txt, sheet-*.svg)');
})();
