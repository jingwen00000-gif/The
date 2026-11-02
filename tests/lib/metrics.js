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
  // only detections of a family the truth counts ON THAT SHEET are false positives (smoke detectors drawn on a wet sheet are not, when
  // the estimator counts them on the dry sheet)
  const famPage = new Set(T.map(t => t.page + '|' + fam(t.type)));
  const fpList = D.filter((d, j) => !ud.has(j) && famPage.has(d.page + '|' + fam(d.type)));
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

// loops: each ground-truth loop matched to a found loop on its sheet (most devices first); matched when devices are within 10 % and length
// within 5 %. Estimated loops count only for ground truth marked estimated (a drawn loop is measured, not guessed).
function scoreLoops(truth, loops) {
  const used = new Set(), rows = [];
  for (const t of truth) {
    const cand = loops.filter((l, i) => !used.has(i) && l.page === t.page && (t.estimated || l.source === 'drawn') && (!t.circuit || l.circuit === t.circuit))
      .map(l => ({ l, i: loops.indexOf(l), d: Math.abs(l.devices - t.devices) })).sort((a, b) => a.d - b.d)[0];
    if (cand) used.add(cand.i);
    const devErr = cand ? r1(100 * Math.abs(cand.l.devices - t.devices) / (t.devices || 1)) : null, lenErr = cand && t.length_m && cand.l.length_m != null ? r1(100 * Math.abs(cand.l.length_m - t.length_m) / t.length_m) : null;
    rows.push({ id: t.id, page: t.page, expectedDevices: t.devices, devices: cand ? cand.l.devices : null, devicesErrorPct: devErr, expected_m: t.length_m, length_m: cand ? cand.l.length_m : null, lengthErrorPct: lenErr,
      matched: !!cand && devErr <= 10 && (lenErr == null || lenErr <= 5), closed: cand ? cand.l.closed : null });
  }
  const m = rows.filter(r => r.matched).length, le = rows.filter(r => r.lengthErrorPct != null);
  return { expectedLoops: truth.length, detectedLoops: loops.filter(l => l.source === 'drawn').length, estimatedLoops: loops.filter(l => l.source === 'estimated').length, matched: m,
    accuracy: truth.length ? r1(100 * m / truth.length) : null, lengthErrorPct: le.length ? r1(le.reduce((a, r) => a + r.lengthErrorPct, 0) / le.length) : null, loops: rows };
}
// rooms: matched by sheet and name; area error on the matched ones
function scoreRooms(truth, rooms) {
  const used = new Set(); let named = 0; const errs = [];
  for (const t of truth) { const i = rooms.findIndex((r, k) => !used.has(k) && r.page === t.page && String(r.name).toUpperCase() === String(t.name).toUpperCase()); if (i < 0) continue; used.add(i); named++; if (t.area && rooms[i].area_m2) errs.push(100 * Math.abs(rooms[i].area_m2 - t.area) / t.area); }
  return { expected: truth.length, found: rooms.length, matched: named, roomDetection: truth.length ? r1(100 * named / truth.length) : null, areaAccuracy: errs.length ? r1(100 - errs.reduce((a, b) => a + b, 0) / errs.length) : null };
}

module.exports = { scoreLoops, scoreRooms, scoreDevices, scoreCounts, scoreLength, norm, fam, ALIAS, FAMILY };
