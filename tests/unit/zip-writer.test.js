// Unit: the backup zip (src/backup/zip-writer.js) — written file by file, read back by an independent reader (Python's zipfile)
const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const { zipWriter, crc32 } = require('../../src/backup/zip-writer.js');
test('backup zip: entries stored with their CRC, names in UTF-8, readable by a standard zip reader', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftzip-')), f = path.join(dir, 'b.ftbak');
  const z = zipWriter(f); const big = Buffer.alloc(300000, 7);
  z.add('backup.json', Buffer.from('{"app":"FireTake"}')); z.add('files/0', big); z.add('项目.json', Buffer.from('[]')); const size = z.end();
  assert.equal(size, fs.statSync(f).size);
  const py = `import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps([[i.filename,i.file_size,i.CRC] for i in z.infolist()]))\nassert z.testzip() is None\nprint(z.read('backup.json').decode())`;
  const out = execFileSync('python3', ['-I', '-c', py, f]).toString().trim().split('\n');
  assert.deepEqual(JSON.parse(out[0]), [['backup.json', 18, crc32(Buffer.from('{"app":"FireTake"}'))], ['files/0', 300000, crc32(big)], ['项目.json', 2, crc32(Buffer.from('[]'))]]);
  assert.equal(out[1], '{"app":"FireTake"}');
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926, 'standard CRC-32 check value');
});
test('backup zip: more than 65 535 entries use Zip64 records and still read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftzip-')), f = path.join(dir, 'many.ftbak');
  const z = zipWriter(f); for (let i = 0; i < 70000; i++) z.add('f/' + i, Buffer.from([i & 255])); z.end();
  const n = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(len(z.infolist()), z.read("f/69999")[0])', f]).toString().trim();
  assert.equal(n, '70000 ' + (69999 & 255));
});
