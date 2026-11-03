/* Strix FireTake · a zip written one file at a time (the backup of every project and drawing, any size).
   Files are stored, not compressed (drawings are compressed already); Zip64 records are added once the zip passes 4 GB.
   const z = zipWriter(path); z.add(name, bytes); …; z.end() → size. Read back by the app's own zip reader (inbox-app.js zipEntries). */
'use strict';
const fs = require('fs');
let TABLE = null;
function crc32(buf) {
  if (typeof require('zlib').crc32 === 'function') return require('zlib').crc32(buf) >>> 0;
  if (!TABLE) { TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
const BIG = 0xFFFFFFFF;
function zipWriter(file) {
  const fd = fs.openSync(file, 'w'); let off = 0; const dir = [];
  const write = b => { fs.writeSync(fd, b); off += b.length; };
  return {
    add(name, data) {
      data = Buffer.isBuffer(data) ? data : Buffer.from(data); const nm = Buffer.from(name, 'utf8'), crc = crc32(data), size = data.length, at = off;
      const z64 = size >= BIG || at >= BIG;
      const ex = z64 ? Buffer.alloc(20) : Buffer.alloc(0);
      if (z64) { ex.writeUInt16LE(1, 0); ex.writeUInt16LE(16, 2); ex.writeBigUInt64LE(BigInt(size), 4); ex.writeBigUInt64LE(BigInt(size), 12); }
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(z64 ? 45 : 20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
      h.writeUInt32LE(crc, 14); h.writeUInt32LE(z64 ? BIG : size, 18); h.writeUInt32LE(z64 ? BIG : size, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(ex.length, 28);
      write(h); write(nm); write(ex); write(data); dir.push({ nm, crc, size, at });
    },
    end() {
      const cdAt = off;
      for (const e of dir) {
        const z64 = e.size >= BIG || e.at >= BIG, ex = z64 ? Buffer.alloc(28) : Buffer.alloc(0);
        if (z64) { ex.writeUInt16LE(1, 0); ex.writeUInt16LE(24, 2); ex.writeBigUInt64LE(BigInt(e.size), 4); ex.writeBigUInt64LE(BigInt(e.size), 12); ex.writeBigUInt64LE(BigInt(e.at), 20); }
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(z64 ? 45 : 20, 4); c.writeUInt16LE(z64 ? 45 : 20, 6); c.writeUInt16LE(0x0800, 8);
        c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(z64 ? BIG : e.size, 20); c.writeUInt32LE(z64 ? BIG : e.size, 24); c.writeUInt16LE(e.nm.length, 28); c.writeUInt16LE(ex.length, 30); c.writeUInt32LE(z64 ? BIG : e.at, 42);
        write(c); write(e.nm); write(ex);
      }
      const cdSize = off - cdAt, many = dir.length >= 0xFFFF || cdAt >= BIG || cdSize >= BIG;
      if (many) {
        const z = Buffer.alloc(56), zAt = off; z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14);
        z.writeBigUInt64LE(BigInt(dir.length), 24); z.writeBigUInt64LE(BigInt(dir.length), 32); z.writeBigUInt64LE(BigInt(cdSize), 40); z.writeBigUInt64LE(BigInt(cdAt), 48); write(z);
        const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(zAt), 8); l.writeUInt32LE(1, 16); write(l);
      }
      const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Math.min(dir.length, 0xFFFF), 8); e.writeUInt16LE(Math.min(dir.length, 0xFFFF), 10);
      e.writeUInt32LE(Math.min(cdSize, BIG), 12); e.writeUInt32LE(many ? BIG : cdAt, 16); write(e);
      fs.closeSync(fd); return off;
    },
    abort() { try { fs.closeSync(fd); } catch (e) {} try { fs.unlinkSync(file); } catch (e) {} }
  };
}
module.exports = { zipWriter, crc32 };
