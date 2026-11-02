// The Learning Engine's knowledge base for the test runners: data/knowledge (FT_KNOWLEDGE=off disables it, FT_KNOWLEDGE=<dir> points elsewhere).
const path = require('path');
const db = require('../../src/learning-engine/learning-database');
function load() { const v = process.env.FT_KNOWLEDGE; if (v === 'off') return null; const dir = v || path.resolve(__dirname, '../../data/knowledge'); const L = db.load(dir); return L.index && L.index.projects && L.index.projects.length ? L : null; }
module.exports = { load };
