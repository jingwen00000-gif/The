#!/usr/bin/env node
// npm run generate:testdata — synthetic fire services projects with exact ground truth.
//   synthetic-basic   cover + legend + 2 plans: legend symbols (drawn 1.33× plan size), tag-only devices, project abbreviations,
//                     rooms, pipework and a detection loop of known length, distractors (columns, grid bubbles, notes)
//   synthetic-large   the same rules on 6 larger plans, for performance / stress
// Output: tests/datasets/<name>/project.pdf + ground-truth.json (positions in PDF points, top-left origin, page = sheet index)
const fs = require('fs'), path = require('path');
const { Page, pdf } = require('../lib/pdfwriter');
const W = 1191, H = 842, MPU = 100 * 25.4 / 72 / 1000; // A3 at 1:100 → metres per point
const RED = 'ff0000', BLUE = '0000ff', CYAN = '00ffff', PURPLE = '7f00ff', ORANGE = 'ff8000', GREY = '808080';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// device symbols at scale k (legend k = 1, plans k = 0.75)
const SYM = {
  smoke: (p, x, y, k) => { p.stroke(RED, .5).circle(x, y, 4 * k).line(x - 4 * k, y, x + 4 * k, y); },
  heat: (p, x, y, k) => { p.stroke(RED, .5).rect(x - 4 * k, y - 4 * k, 8 * k, 8 * k).line(x - 4 * k, y + 4 * k, x + 4 * k, y - 4 * k); },
  mcp: (p, x, y, k) => { p.stroke(RED, .5).rect(x - 3.5 * k, y - 3.5 * k, 7 * k, 7 * k).rect(x - 1.75 * k, y - 1.75 * k, 3.5 * k, 3.5 * k); },
  speaker: (p, x, y, k) => { p.stroke(BLUE, .5).rect(x - 4 * k, y - 1.5 * k, 2.5 * k, 3 * k).poly([[x - 1.5 * k, y - 1.5 * k], [x + 3.5 * k, y - 4 * k], [x + 3.5 * k, y + 4 * k], [x - 1.5 * k, y + 1.5 * k]], true); },
};
// the consultant's lines in the title block (training sets only; the scored datasets have none)
let CONSULTANT = null; const setConsultant = c => { CONSULTANT = c; };
function titleBlock(p, title, scale) {
  const x = W - 150; p.stroke('000000', .8).rect(10, 10, W - 20, H - 20).line(x, 10, x, H - 10);
  if (CONSULTANT) { p.text(x + 8, H - 140, CONSULTANT.name, 6).text(x + 8, H - 128, 'E: ' + CONSULTANT.email, 5); if (CONSULTANT.logo) { p.stroke(CONSULTANT.logo, .8).rect(x + 10, H - 175, 20, 14).line(x + 10, H - 175, x + 30, H - 161).circle(x + 45, H - 168, 6); } }
  p.text(x + 8, H - 80, 'PROJECT: TEST BUILDING', 6).text(x + 8, H - 60, 'DRAWING TITLE', 5).text(x + 8, H - 50, title, 7);
  if (scale) p.text(x + 8, H - 30, `SCALE ${scale}`, 6);
}

function legendSheet() {
  const p = new Page(W, H); titleBlock(p, 'LEGEND AND NOTES', null);
  let x = 60, y = 60; p.text(x, y, 'DRY FIRE SERVICES LEGEND', 9); y += 24;
  for (const [k, d] of [['smoke', 'ADDRESSABLE SMOKE DETECTOR'], ['heat', 'ADDRESSABLE THERMAL DETECTOR'], ['mcp', 'MANUAL CALL POINT'], ['speaker', 'RECESSED FIRE SPEAKER']]) {
    SYM[k](p, x + 12, y - 2, 1); p.text(x + 40, y, d, 6); y += 22;
  }
  x = 330; y = 60; p.text(x, y, 'PIPEWORK LEGEND', 9); y += 24;
  for (const [c, d, dash] of [[PURPLE, 'FIRE SPRINKLER MAIN PIPEWORK'], [CYAN, 'FIRE SPRINKLER RANGE PIPEWORK'], [ORANGE, 'FIRE DETECTION LOOP CABLE', [4, 2]]]) {
    p.stroke(c, .6, dash).line(x, y - 2, x + 60, y - 2); p.text(x + 75, y, d, 6); y += 22;
  }
  x = 620; y = 60; p.text(x, y, 'ABBREVIATIONS', 9); y += 22;
  for (const t of ['FIP - FIRE INDICATOR PANEL', 'SD - SMOKE DETECTOR', 'WIP - WARDEN INTERCOM POINT', 'RL - REDUCED LEVEL']) { p.text(x, y, t, 6); y += 14; }
  return p;
}
function coverSheet() {
  const p = new Page(W, H); titleBlock(p, 'COVER SHEET AND DRAWING LIST', null);
  p.text(60, 80, 'DRAWING LIST', 9).text(60, 100, 'F000 COVER SHEET', 6).text(60, 112, 'F001 LEGEND', 6).text(60, 124, 'F101 LEVEL 1 LAYOUT', 6);
  p.text(60, 200, 'TYPICAL DETECTOR', 6); SYM.smoke(p, 140, 198, .75); // a typical on the cover is not a device
  return p;
}

// one plan: rooms in a grid, devices inside rooms, tag-only devices, pipework, a loop cable through the detectors
function planSheet(level, seed, cols, rows) {
  const R = rng(seed), p = new Page(W, H); titleBlock(p, `LEVEL ${level} FIRE SERVICES LAYOUT`, '1:100 @ A3');
  const devices = [], rooms = []; const ox = 60, oy = 70, cw = (W - 260) / cols, ch = (H - 170) / rows;
  const names = ['OFFICE', 'MEETING', 'PLANT ROOM', 'STORE', 'KITCHEN', 'OFFICE', 'CORRIDOR', 'LOBBY', 'COMMS', 'OFFICE'];
  p.stroke('000000', 1.2);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = ox + i * cw, y = oy + j * ch, name = names[(i * rows + j + seed) % names.length];
    p.rect(x, y, cw, ch); p.text(x + cw / 2 - name.length * 1.6, y + ch - 8, name, 5.5);
    rooms.push({ name, level: `L${String(level).padStart(2, '0')}`, area: +(cw * ch * MPU * MPU).toFixed(2), bb: [x, y, x + cw, y + ch] });
  }
  const id = t => `${t.toUpperCase()}-${level}-${String(devices.length + 1).padStart(3, '0')}`;
  const put = (type, x, y, how) => devices.push({ id: id(type), type, level: `L${String(level).padStart(2, '0')}`, x: +x.toFixed(2), y: +y.toFixed(2), how });
  // legend symbols, scaled like an annotative block (0.75 of the legend)
  rooms.forEach((rm, n) => {
    const [x0, y0, x1, y1] = rm.bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const type = rm.name === 'PLANT ROOM' || rm.name === 'KITCHEN' ? 'heat' : 'smoke';
    const k = 1 + Math.floor(R() * 2);
    for (let q = 0; q < k; q++) { const x = x0 + cw * (.3 + .4 * q), y = cy - ch * .15 + R() * 6; SYM[type](p, x, y, .75); put(type, x, y, 'legend'); }
    if (n % 3 === 0) { const x = x1 - 12, y = y0 + 12; SYM.speaker(p, x, y, .75); put('speaker', x, y, 'legend'); }
    if (n % 5 === 1) { const x = x0 + 8, y = y1 - 16; SYM.mcp(p, x, y, .75); put('mcp', x, y, 'legend'); }
  });
  // tag-only devices: a plain circle with 'SD' inside (rule: circle + SD = smoke), a box with 'WIP' (project abbreviation)
  for (let q = 0; q < 3; q++) { const rm = rooms[(q * 4 + seed) % rooms.length]; const x = rm.bb[0] + cw * .5 + 18, y = rm.bb[1] + ch * .72;
    p.stroke('000000', .4).circle(x, y, 4.2); p.text(x - 3.2, y + 2, 'SD', 4.5); put('smoke', x, y, 'tag'); }
  { const rm = rooms[1]; const x = rm.bb[0] + 20, y = rm.bb[1] + 20; p.stroke('000000', .4).rect(x - 6, y - 4, 12, 8); p.text(x - 4.6, y + 2, 'WIP', 4); put('wip', x, y, 'abbrev'); }
  // distractors: columns (plain circles), grid bubbles with letters, a note that mentions devices
  p.stroke(GREY, .4); for (let q = 0; q < 6; q++) p.circle(ox + q * cw * .9 + 30, oy - 10, 3.2);
  for (let q = 0; q < cols; q++) { p.circle(ox + q * cw, oy - 34, 7); p.text(ox + q * cw - 2, oy - 32, String.fromCharCode(65 + q), 6); }
  p.text(ox, H - 40, 'NOTE: SMOKE DETECTORS AND MCP TO BE INSTALLED TO AS1670.1', 5);
  // pipework: one main along the top of the rooms, ranges dropping into each column
  const lines = { main: 0, range: 0, loop: 0 };
  const mainY = oy + 6; p.stroke(PURPLE, .6).line(ox + 10, mainY, ox + cols * cw - 10, mainY); lines.main += (cols * cw - 20) * MPU;
  for (let i = 0; i < cols; i++) { const x = ox + i * cw + cw * .15; const pts = [[x, mainY], [x, oy + rows * ch - 20]]; p.stroke(CYAN, .6).poly(pts); lines.range += (pts[1][1] - pts[0][1]) * MPU; }
  // detection loop: dashed cable visiting every legend detector in order, back to the start
  const det = devices.filter(d => d.how === 'legend' && (d.type === 'smoke' || d.type === 'heat')); const loop = det.map(d => [d.x, d.y + 7]); loop.push(loop[0]);
  p.stroke(ORANGE, .6, [4, 2]).poly(loop); for (let i = 1; i < loop.length; i++) lines.loop += Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]) * MPU;
  return { p, devices, rooms: rooms.map(({ bb, ...r }) => r), networks: [{ id: `LOOP-L${level}`, type: 'FIRE_LOOP', devices: det.length, length_m: +lines.loop.toFixed(2) }],
    lines: { 'FIRE SPRINKLER MAIN PIPEWORK': +lines.main.toFixed(2), 'FIRE SPRINKLER RANGE PIPEWORK': +lines.range.toFixed(2), 'FIRE DETECTION LOOP CABLE': +lines.loop.toFixed(2) } };
}

function project(name, plans) {
  const sheets = [coverSheet(), legendSheet()]; const gt = { project: name, generated: true, units: 'PDF points, top-left origin; page = sheet index (0-based)', devices: [], networks: [], rooms: [], lines: {} };
  plans.forEach(([level, seed, c, r]) => { const s = planSheet(level, seed, c, r), page = sheets.length; sheets.push(s.p);
    s.devices.forEach(d => gt.devices.push({ ...d, page })); gt.networks.push(...s.networks); gt.rooms.push(...s.rooms);
    for (const [k, v] of Object.entries(s.lines)) gt.lines[k] = +((gt.lines[k] || 0) + v).toFixed(2); });
  gt.summary = gt.devices.reduce((o, d) => (o[d.type] = (o[d.type] || 0) + 1, o), {});
  const dir = path.join(__dirname, name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.pdf'), pdf(sheets.map(s => s.p || s)));
  fs.writeFileSync(path.join(dir, 'ground-truth.json'), JSON.stringify(gt, null, 1));
  return { name, sheets: sheets.length, devices: gt.devices.length, rooms: gt.rooms.length };
}

if (require.main === module) {
  console.log(project('synthetic-basic', [[1, 3, 4, 3], [2, 7, 4, 3]]));
  console.log(project('synthetic-large', [[1, 11, 7, 5], [2, 12, 7, 5], [3, 13, 7, 5], [4, 14, 7, 5], [5, 15, 7, 5], [6, 16, 7, 5]]));
}
module.exports = { project, SYM, MPU, W, H, planSheet, legendSheet, coverSheet, setConsultant, rng };
