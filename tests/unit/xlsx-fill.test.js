// Unit: filling the builder's own Excel schedule (src/quote/xlsx-fill.js) — layout, styles and formulas kept; checked with openpyxl
const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const os = require('os'); const path = require('path'); const zlib = require('zlib'); const { execFileSync } = require('child_process');
const X = require('../../src/quote/xlsx-fill.js');
// unzip with node (the app uses its own reader + DecompressionStream)
function unzip(buf) { const out = {}; let e = buf.length - 22; while (buf.readUInt32LE(e) !== 0x06054b50) e--; let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for (let k = 0; k < n; k++) { const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString(); p += 46 + nl + xl + cl; const s = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), d = buf.slice(s, s + cs);
    out[name] = new Uint8Array(m === 8 ? zlib.inflateRawSync(d) : d); } return out; }
const SRC = path.join(__dirname, '../datasets/builder-schedule/schedule.xlsx');
test('builder schedule: header, description and amount columns found; rows suggested to systems; totals and by-others rows left alone', () => {
  const W = X.read(unzip(fs.readFileSync(SRC))), s = W.sheets[0];
  assert.equal(s.name, 'Trade Breakup'); assert.equal(s.header, 3); assert.equal(s.descCol, 'B'); assert.equal(s.amountCol, 'D');
  assert.deepEqual(s.rows.map(r => [r.desc, X.suggest(r.desc), r.formula]), [['Fire sprinkler system incl. design', 'sys:SPR', false], ['Fire hydrant system', 'sys:HYD', false], ['Fire hose reels', 'sys:HR', false],
    ["Booster assembly and town's main connection", 'sys:TMB', false], ['Fire detection, alarm & EWIS', 'sys:DET', false], ['Passive fire - service penetrations', 'pf', false], ['Builders work in connection (by others)', '', false],
    ['Sub-total', '', true], ['GST', '', true], ['TOTAL inc GST', '', true]]);
});
test('filled workbook: amounts written, formulas and styles kept, a formula cell never overwritten; opens in openpyxl', () => {
  const E = unzip(fs.readFileSync(SRC)), W = X.read(E), s = W.sheets[0];
  const r = X.fill(E, s.path, [{ ref: 'D4', value: 152340.456 }, { ref: 'D5', value: 48200 }, { ref: 'D6', value: 6400 }, { ref: 'D9', value: 12000 }, { ref: 'D11', value: 1 }]);
  assert.equal(r.written, 4); assert.deepEqual(r.skipped, ['D11']);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xf-')), 'out.xlsx'); fs.writeFileSync(f, X.zip(r.entries));
  const py = `import openpyxl,sys,json\nwb=openpyxl.load_workbook(sys.argv[1]); ws=wb['Trade Breakup']\nprint(json.dumps([ws['D4'].value,ws['D5'].value,ws['D6'].value,ws['D9'].value,ws['D11'].value,ws['D13'].value,ws['B3'].value,ws['B3'].font.b,ws['A1'].value,ws['E10'].value]))`;
  assert.deepEqual(JSON.parse(execFileSync('python3', ['-I', '-c', py, f]).toString()), [152340.46, 48200, 6400, 12000, '=SUM(D4:D10)', '=D11+D12', 'Description', true, 'HORNSBY STORAGE - FIRE SERVICES PRICE SCHEDULE', 'By builder']);
  assert.match(new TextDecoder().decode(r.entries['xl/workbook.xml']), /fullCalcOnLoad="1"/);
});
