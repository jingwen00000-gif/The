#!/usr/bin/env node
// npm run generate:testdata also writes the Learning Engine fixtures (tests/datasets/training/):
//   train-acme/           a finished job: original.pdf (the consultant's set, with legend), takeoff.pdf (the same set with the
//                         estimator's markups: Circle count markups per device colour, speaker markups labelled 'Speaker', MCPs ringed
//                         in a flattened vector colour, device-ID labels and a note as FreeText), boq.xlsx, quote.xlsx, metadata.json,
//                         answer.json (what extraction must recover: every device position and type)
//   eval-acme-nolegend/   the same consultant's next job WITHOUT a legend sheet (project.pdf + ground-truth.json): recognition has
//                         only what the knowledge base learnt from train-acme
const fs = require('fs'), path = require('path');
const { pdf } = require('../lib/pdfwriter');
const { xlsx } = require('../lib/xlsxwriter');
const G = require('./generate');
const OUT = path.join(__dirname, 'training');
const ACME = { name: 'ACME FIRE CONSULTING PTY LTD', email: 'design@acmefire.com.au', logo: '2e75b6' };
const MARK = { smoke: 'ff00ff', heat: '00c000', speaker: '00b0f0', wip: '7030a0' }; // the estimator's count colours (Circle markups)
const RING = 'ff6600';                                                              // MCPs: ringed in the drawing itself (flattened)

function sheets(plans, withLegend) {
  G.setConsultant(ACME);
  const out = [G.coverSheet()]; if (withLegend) out.push(G.legendSheet());
  const devices = [], networks = [];
  for (const [level, seed, c, r] of plans) { const s = G.planSheet(level, seed, c, r), page = out.length; out.push(s.p); s.devices.forEach(d => devices.push({ ...d, page })); s.networks.forEach(n => networks.push({ ...n, page })); }
  G.setConsultant(null); return { pages: out, devices, networks };
}
const clone = p => Object.assign(Object.create(Object.getPrototypeOf(p)), p, { ops: p.ops.slice(), annots: (p.annots || []).slice() });

function trainAcme() {
  const dir = path.join(OUT, 'train-acme'); fs.mkdirSync(dir, { recursive: true });
  const { pages, devices } = sheets([[1, 21, 4, 3], [2, 22, 4, 3]], true);
  fs.writeFileSync(path.join(dir, 'original.pdf'), pdf(pages));
  const tk = pages.map(clone); let n = 0;
  for (const d of devices) { const p = tk[d.page];
    if (d.type === 'mcp') { p.stroke(RING, .9).circle(d.x, d.y, 8); continue; }
    p.annot('Circle', MARK[d.type], d.x - 7, d.y - 7, 14, 14, d.type === 'speaker' ? 'Speaker' : '', 'Count');
    if (d.type === 'smoke' && n++ % 4 === 0) p.annot('FreeText', 'ff0000', d.x + 8, d.y - 14, 26, 9, `SD-${String(n).padStart(2, '0')}`);
  }
  tk[2].annot('FreeText', 'ff0000', 80, 790, 160, 12, 'ALLOW 10% SPARE ON LOOP CABLE');
  fs.writeFileSync(path.join(dir, 'takeoff.pdf'), pdf(tk));
  const cnt = t => devices.filter(d => d.type === t).length;
  fs.writeFileSync(path.join(dir, 'boq.xlsx'), xlsx([{ name: 'BOQ', rows: [
    ['ACME job — fire detection BOQ'], [],
    ['Item', 'Description', 'Qty', 'Unit', 'Supply Rate', 'Install Rate', 'Total'],
    ['1', 'Photoelectric smoke detector incl. base', cnt('smoke'), 'ea', 45, 65, cnt('smoke') * 110],
    ['2', 'Thermal detector incl. base', cnt('heat'), 'ea', 38, 62, cnt('heat') * 100],
    ['3', 'Manual call point', cnt('mcp'), 'ea', 55, 70, cnt('mcp') * 125],
    ['4', 'Recessed fire speaker', cnt('speaker'), 'ea', 60, 75, cnt('speaker') * 135],
    ['5', 'Warden intercom point', cnt('wip'), 'ea', 420, 180, cnt('wip') * 600],
    ['6', 'FIP loop cable 2C 1.5mm2 fire rated', 520, 'm', 1.6, 4.4, 520 * 6],
    [], ['', 'TOTAL', '', '', '', '', null]] }]));
  fs.writeFileSync(path.join(dir, 'quote.xlsx'), xlsx([{ name: 'Quote', rows: [['Section', 'Amount'], ['Fire Detection & Alarm', 18950], ['Emergency Warning', 6400], ['Total (ex GST)', 25350]] }], false));
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ projectId: 'TRAIN-ACME-001', name: 'Test Building fit-out', client: 'Test Client', date: '2025-06-30', note: 'synthetic training project; consultant is left for the title block' }, null, 1));
  fs.writeFileSync(path.join(dir, 'answer.json'), JSON.stringify({ devices: devices.map(({ id, type, page, x, y }) => ({ id, type, page, x, y })) }, null, 1));
  return { name: 'train-acme', pages: pages.length, devices: devices.length };
}

function evalNoLegend() {
  const dir = path.join(OUT, 'eval-acme-nolegend'); fs.mkdirSync(dir, { recursive: true });
  const { pages, devices, networks } = sheets([[3, 31, 4, 3], [4, 32, 4, 3]], false);
  fs.writeFileSync(path.join(dir, 'project.pdf'), pdf(pages));
  fs.writeFileSync(path.join(dir, 'ground-truth.json'), JSON.stringify({ project: 'eval-acme-nolegend', status: 'generated', note: 'no legend sheet: recognition depends on the knowledge base learnt from train-acme',
    files: ['project.pdf'], devices: devices.map(({ how, ...d }) => d), networks, rooms: [] }, null, 1));
  return { name: 'eval-acme-nolegend', pages: pages.length, devices: devices.length };
}

if (require.main === module) { console.log(trainAcme()); console.log(evalNoLegend()); }
module.exports = { trainAcme, evalNoLegend, MARK, RING, ACME };
