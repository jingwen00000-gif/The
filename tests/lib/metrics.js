// Scoring against ground truth: devices are matched one to one by page, position and type (greedy, nearest first).
// Type aliases let ground truth use drawing codes (SD, HD, MCP …) or FireTake item keys.
const ALIAS = { SD: 'smoke', HD: 'heat', MCP: 'mcp', FIP: 'fip', WIP: 'wip', SPK: 'speaker', SPKR: 'speaker', VAD: 'sounder', IO: 'relay', 'I/O': 'relay',
  FS: 'flowsw', FHR: 'hosereel', FH: 'hydrant', EXT: 'ext_abe', FB: 'blanket', CSD: 'cs_smoke' };
// families: a speaker found as 'surface speaker' is still a speaker for recognition accuracy (type accuracy is reported separately)
const FAMILY = { spk_surf: 'speaker', proj_spk: 'speaker', horn: 'speaker', cs_smoke: 'smoke', duct_probe: 'smoke',
  spk_pend: 'sprinkler', spk_up: 'sprinkler', spk_side: 'sprinkler', spk_semi: 'sprinkler', spk_space: 'sprinkler', spk_conc: 'sprinkler', spk_duct: 'sprinkler',
  ext_abe: 'extinguisher', ext_co2: 'extinguisher', ext_wc: 'extinguisher', ext_afff: 'extinguisher' };
const norm = t => ALIAS[t] || t;
const fam = t => FAMILY[norm(t)] || norm(t);
const r1 = v => Math.round(v * 10) / 10;

function scoreDevices(truth, dets, opts = {}) {
  const tol = opts.tol || 12;
  const T = truth.filter(d => d.verified !== false && d.x != null), D = dets.slice();
  const pairs = [];
  T.forEach((t, i) => D.forEach((d, j) => { if (d.page !== t.page) return; const dist = Math.hypot(d.x - t.x, d.y - t.y); if (dist <= tol) pairs.push([dist, i, j]); }));
  pairs.sort((a, b) => a[0] - b[0]);
  const ut = new Set(), ud = new Set(); let tp = 0, typeOk = 0, typed = 0; const confusion = {};
  for (const [, i, j] of pairs) {
    if (ut.has(i) || ud.has(j)) continue; const t = T[i], d = D[j];
    if (fam(t.type) !== fam(d.type)) continue; // a wrong device on the right spot is a miss and a false alarm
    ut.add(i); ud.add(j); tp++; if (t.typeLevel === 'family') continue; typed++; // family-level truth judges recognition, not sub-type
    if (norm(t.type) === norm(d.type)) typeOk++; else { const k = norm(t.type) + '→' + d.type; confusion[k] = (confusion[k] || 0) + 1; }
  }
  // only detections of families the truth covers on pages the truth covers count as false positives
  const fams = new Set(T.map(t => fam(t.type))), pages = new Set(T.map(t => t.page));
  const fpList = D.filter((d, j) => !ud.has(j) && pages.has(d.page) && fams.has(fam(d.type)));
  const fnList = T.filter((t, i) => !ut.has(i));
  const fp = fpList.length, fn = fnList.length;
  const precision = tp + fp ? 100 * tp / (tp + fp) : 100, recall = tp + fn ? 100 * tp / (tp + fn) : 100;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const byType = {};
  for (const t of T) { const k = fam(t.type); (byType[k] = byType[k] || { truth: 0, tp: 0, fp: 0 }).truth++; }
  T.forEach((t, i) => { if (ut.has(i)) byType[fam(t.type)].tp++; });
  for (const d of fpList) { const k = fam(d.type); (byType[k] = byType[k] || { truth: 0, tp: 0, fp: 0 }).fp++; }
  return { precision: r1(precision), recall: r1(recall), f1: r1(f1), truePositive: tp, falsePositive: fp, falseNegative: fn,
    typeAccuracy: typed ? r1(100 * typeOk / typed) : null, typeScored: typed, confusion, byType,
    misses: fnList.slice(0, 50).map(t => ({ page: t.page, x: r1(t.x), y: r1(t.y), type: t.type })),
    falseAlarms: fpList.slice(0, 50).map(d => ({ page: d.page, x: r1(d.x), y: r1(d.y), type: d.type, conf: r1(d.conf * 100) / 100 })) };
}

// counts only (truth without positions): per family
function scoreCounts(expected, dets) {
  const got = {}; for (const d of dets) got[fam(d.type)] = (got[fam(d.type)] || 0) + 1;
  const rows = Object.entries(expected).map(([k, n]) => ({ type: k, expected: n, actual: got[fam(k)] || 0, errorPct: n ? r1(100 * Math.abs((got[fam(k)] || 0) - n) / n) : null }));
  return rows;
}

function scoreLength(expected, actual) { return { expected: r1(expected), actual: r1(actual), errorPct: expected ? r1(100 * Math.abs(actual - expected) / expected) : null }; }

module.exports = { scoreDevices, scoreCounts, scoreLength, norm, fam, ALIAS, FAMILY };
