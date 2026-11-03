// Strix FireTake desktop shell (Electron)
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let win;
// the product was renamed (FireTake → Strix FireTake): keep the data where it always was (projects, settings, rate library live in
// the userData folder, which Electron names after the product)
app.setPath('userData', path.join(app.getPath('appData'), 'FireTake'));

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Strix FireTake 消防算量报价',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#E9EDF1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// the menu bar follows the app's language (设置 → 语言; remembered in ft-config.json as lang)
const L = (zh, en) => readCfg().lang === 'en' ? en : zh;
function buildMenu(lang) {
  const isMac = process.platform === 'darwin', en = (lang || readCfg().lang) === 'en', t = (zh, e) => en ? e : zh;
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: t('文件', 'File'), submenu: [
      { label: t('打开备份文件夹', 'Open backup folder'), click: () => shell.openPath(backupDir()) },
      { type: 'separator' },
      isMac ? { role: 'close', label: t('关闭窗口', 'Close window') } : { role: 'quit', label: t('退出', 'Exit') }
    ] },
    { label: t('编辑', 'Edit'), submenu: [
      { role: 'undo', label: t('撤销', 'Undo') }, { role: 'redo', label: t('重做', 'Redo') }, { type: 'separator' },
      { role: 'cut', label: t('剪切', 'Cut') }, { role: 'copy', label: t('复制', 'Copy') }, { role: 'paste', label: t('粘贴', 'Paste') }, { role: 'selectAll', label: t('全选', 'Select all') }
    ] },
    { label: t('视图', 'View'), submenu: [
      { role: 'reload', label: t('重新加载', 'Reload') }, { role: 'toggleDevTools', label: t('开发者工具', 'Developer tools') }, { type: 'separator' },
      { role: 'resetZoom', label: t('实际大小', 'Actual size') }, { role: 'zoomIn', label: t('放大界面', 'Zoom in') }, { role: 'zoomOut', label: t('缩小界面', 'Zoom out') },
      { type: 'separator' }, { role: 'togglefullscreen', label: t('全屏', 'Full screen') }
    ] },
    { label: t('帮助', 'Help'), submenu: [
      { label: t('申请 Anthropic API Key', 'Get an Anthropic API key'), click: () => shell.openExternal('https://console.anthropic.com/') },
      { label: t('关于 Strix FireTake', 'About Strix FireTake'), click: () => dialog.showMessageBox(win, {
        type: 'info', title: t('关于 Strix FireTake', 'About Strix FireTake'),
        message: t('Strix FireTake 消防算量报价 v', 'Strix FireTake Fire Takeoff & Quote v') + app.getVersion(),
        detail: t('图纸算量、澳标核对、被动防火、计价与 Scope of Work / Exclusions 生成。\n数据保存在本机：', 'Drawing take-off, Australian Standards checks, passive fire, pricing and Scope of Work / Exclusions.\nData is stored on this computer: ') + app.getPath('userData')
      }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (win && !win.isDestroyed()) win.setTitle(t('Strix FireTake 消防算量报价', 'Strix FireTake Fire Takeoff & Quote'));
}
ipcMain.handle('set-lang', (_e, { lang }) => { const c = readCfg(); if (c.lang !== lang) { c.lang = lang; writeCfg(c); } buildMenu(lang); return true; });

const toBuf = data => (typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));

// Save a file through the native Save dialog
ipcMain.handle('save-file', async (_e, { name, data }) => {
  const ext = path.extname(name).slice(1).toLowerCase();
  const filters = ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, toBuf(data));
  return r.filePath;
});

// Open an attachment with the system's default program
ipcMain.handle('open-file', async (_e, { name, data }) => {
  const dir = path.join(os.tmpdir(), 'FireTake-docs');
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150) || 'file';
  const p = path.join(dir, Date.now() + '_' + safe);
  fs.writeFileSync(p, toBuf(data));
  const err = await shell.openPath(p);
  return err ? { error: err } : { path: p };
});

// Render quote HTML to an A4 PDF
ipcMain.handle('print-pdf', async (_e, { html, name }) => {
  const tmp = path.join(os.tmpdir(), 'firetake-quote-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true, printBackground: true, margins: { marginType: 'default' } });
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, pdf);
    shell.openPath(r.filePath);
    return r.filePath;
  } finally {
    pw.destroy();
    fs.unlink(tmp, () => {});
  }
});

// mailto: / https: links from the e-mail draft (system mail program, Gmail / Outlook web)
ipcMain.handle('open-external', async (_e, { url }) => { if (/^(https?|mailto):/i.test(String(url))) { await shell.openExternal(String(url)); return true } return false });

// Quote HTML → PDF bytes (no dialog): the attachment of an e-mail draft
ipcMain.handle('pdf-bytes', async (_e, { html }) => {
  const tmp = path.join(os.tmpdir(), 'firetake-mail-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try { await pw.loadFile(tmp); return await pw.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true, printBackground: true, margins: { marginType: 'default' } }); }
  finally { pw.destroy(); fs.unlink(tmp, () => {}); }
});

// Anthropic Messages API (called from the main process)
ipcMain.handle('claude', async (_e, { key, body }) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (j.error && j.error.message) || ('HTTP ' + r.status) };
    return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('') };
  } catch (err) {
    return { error: '无法连接 api.anthropic.com：' + err.message };
  }
});

/* ---------- data folder & backup folder ---------- */
const cfgPath = () => path.join(app.getPath('userData'), 'ft-config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 2)); }
function dataDir() { const d = readCfg().dataDir; return d && fs.existsSync(d) ? d : null; }
function inData(rel) {
  const root = dataDir(); if (!root) throw new Error('未设置数据文件夹');
  const p = path.resolve(root, String(rel || ''));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('非法路径：' + rel);
  return p;
}
// tender inbox: a folder the estimator saves downloaded tenders into (one subfolder per tender); read only — never changed or deleted
function inboxDir() { const d = readCfg().inboxDir; return d && fs.existsSync(d) ? d : null; }
function inInbox(rel) {
  const root = inboxDir(); if (!root) throw new Error('未设置招标收件箱文件夹');
  const p = path.resolve(root, String(rel || ''));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('非法路径：' + rel);
  return p;
}
const SKIP = /^(\.|~\$|Thumbs\.db$|desktop\.ini$|__MACOSX$)/i;
ipcMain.handle('inbox-list', () => {
  const root = inboxDir(); if (!root) return null;
  const out = [], loose = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (SKIP.test(d.name)) continue;
    // files saved straight into the inbox (several tenders' files side by side): listed as folder '' and grouped by job code in the app
    if (d.isFile()) { try { const st = fs.statSync(path.join(root, d.name)); loose.push({ rel: d.name, name: d.name, size: st.size, mtime: st.mtimeMs }); } catch (e) {} continue; }
    if (!d.isDirectory()) continue;
    const files = []; const walk = (rel, depth) => {
      if (depth > 4 || files.length > 400) return;
      for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        if (SKIP.test(e.name)) continue; const r = path.join(rel, e.name);
        if (e.isDirectory()) walk(r, depth + 1); else { const st = fs.statSync(path.join(root, r)); files.push({ rel: r.split(path.sep).join('/'), name: e.name, size: st.size, mtime: st.mtimeMs }); }
      }
    };
    try { walk(d.name, 0); } catch (e) {}
    out.push({ folder: d.name, files, mtime: Math.max(0, ...files.map(f => f.mtime)) });
  }
  if (loose.length) out.push({ folder: '', files: loose.slice(0, 400), mtime: Math.max(0, ...loose.map(f => f.mtime)) });
  return { dir: root, folders: out };
});
ipcMain.handle('inbox-read', (_e, { rel }) => { const p = inInbox(rel); if (!fs.existsSync(p)) return null; return new Uint8Array(fs.readFileSync(p)); });
ipcMain.handle('dir-get', () => ({ dataDir: dataDir(), backupDir: backupDir(), customBackup: !!readCfg().backupDir, inboxDir: inboxDir() }));
ipcMain.handle('dir-choose', async (_e, { kind }) => {
  const key = kind === 'backup' ? 'backupDir' : kind === 'inbox' ? 'inboxDir' : 'dataDir';
  const r = await dialog.showOpenDialog(win, { title: kind === 'backup' ? L('选择备份文件夹', 'Choose the backup folder') : kind === 'inbox' ? L('选择招标收件箱文件夹（每个招标一个子文件夹）', 'Choose the tender inbox folder (one subfolder per tender)') : L('选择项目数据文件夹', 'Choose the project data folder'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const c = readCfg(); c[key] = r.filePaths[0]; writeCfg(c);
  return r.filePaths[0];
});
ipcMain.handle('dir-clear', (_e, { kind }) => { const c = readCfg(); delete c[kind === 'backup' ? 'backupDir' : kind === 'inbox' ? 'inboxDir' : 'dataDir']; writeCfg(c); return true; });
ipcMain.handle('dir-open', (_e, { kind }) => shell.openPath(kind === 'backup' ? backupDir() : kind === 'inbox' ? (inboxDir() || '') : (dataDir() || '')));
ipcMain.handle('fs-write', (_e, { rel, data }) => {
  const p = inData(rel); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', toBuf(data)); fs.renameSync(p + '.tmp', p); return true;
});
ipcMain.handle('fs-read', (_e, { rel, binary }) => {
  const p = inData(rel); if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p); return binary ? new Uint8Array(b) : b.toString('utf8');
});
ipcMain.handle('fs-list', (_e, { rel }) => {
  const p = inData(rel); if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true }).map(d => {
    const st = fs.statSync(path.join(p, d.name)); return { name: d.name, dir: d.isDirectory(), size: st.size, mtime: st.mtimeMs };
  });
});
ipcMain.handle('fs-move', (_e, { from, to }) => {
  const a = inData(from), b = inData(to); if (!fs.existsSync(a)) return false;
  fs.mkdirSync(path.dirname(b), { recursive: true }); fs.renameSync(a, b); return true;
});
ipcMain.handle('fs-delete', (_e, { rel }) => { const p = inData(rel); if (fs.existsSync(p) && fs.statSync(p).isFile()) fs.unlinkSync(p); return true; });

/* ---------- automatic backups ---------- */
function backupDir() {
  const c = readCfg();
  let d = c.backupDir && fs.existsSync(c.backupDir) ? c.backupDir : null;
  if (!d) { const dd = dataDir(); d = dd ? path.join(dd, 'Backups') : path.join(app.getPath('documents'), 'FireTake Backups'); }
  fs.mkdirSync(d, { recursive: true });
  return d;
}
ipcMain.handle('backup-info', () => {
  const dir = backupDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ftbak')).map(f => {
    const st = fs.statSync(path.join(dir, f));
    return { name: f, size: st.size, mtime: st.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
  return { dir, files };
});
ipcMain.handle('backup-write', (_e, { name, data, keep }) => {
  const dir = backupDir();
  const p = path.join(dir, name);
  fs.writeFileSync(p + '.tmp', data, 'utf8');
  fs.renameSync(p + '.tmp', p);
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.ftbak')).sort().reverse();
  all.slice(keep || 14).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
  // the same backup to every signed-in cloud account (Strix FireTake/Backups), in the background
  if (readCfg().cloudBackup !== false && cloud.status().some(x => x.signedIn)) {
    cloudLast = { at: Date.now(), running: true, results: [] };
    cloud.backup(name, Buffer.from(data, 'utf8'), keep || 14).then(r => { cloudLast = { at: Date.now(), running: false, results: r }; }).catch(e => { cloudLast = { at: Date.now(), running: false, results: [{ ok: false, error: e.message }] }; });
  }
  return p;
});

/* ---- cloud accounts (src/cloud/cloud-main.js): sign-in tokens encrypted with the OS (safeStorage), Client IDs in ft-config.json ---- */
const { createCloud } = require('./src/cloud/cloud-main.js');
const cloudFile = () => path.join(app.getPath('userData'), 'cloud-accounts.json');
const cloudStore = {
  all() { try { const raw = fs.readFileSync(cloudFile()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')); } catch (e) { return {}; } },
  get(p) { return this.all()[p] || null; },
  set(p, v) { const a = this.all(); if (v) a[p] = v; else delete a[p]; const t = JSON.stringify(a);
    fs.writeFileSync(cloudFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t, 'utf8')); }
};
const cloud = createCloud({ fetch: (...a) => fetch(...a), store: cloudStore, config: () => readCfg().cloud || {}, openExternal: u => shell.openExternal(u),
  endpoints: process.env.FT_CLOUD_TEST ? JSON.parse(process.env.FT_CLOUD_TEST) : undefined });
let cloudLast = null;
const cloudTry = fn => async (_e, a) => { try { return { ok: true, value: await fn(a || {}) }; } catch (e) { return { ok: false, error: e.message || String(e) }; } };
ipcMain.handle('cloud-status', cloudTry(() => ({ accounts: cloud.status(), config: readCfg().cloud || {}, backup: readCfg().cloudBackup !== false, last: cloudLast, redirect: { google: cloud.redirect('google'), microsoft: cloud.redirect('microsoft'), dropbox: cloud.redirect('dropbox') } })));
ipcMain.handle('cloud-config', cloudTry(({ config, backup }) => { const c = readCfg(); if (config) c.cloud = config; if (backup != null) c.cloudBackup = !!backup; writeCfg(c); return true; }));
ipcMain.handle('cloud-signin', cloudTry(async ({ provider }) => { const r = await cloud.signIn(provider); if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } return r; }));
ipcMain.handle('cloud-signout', cloudTry(({ provider }) => cloud.signOut(provider)));
ipcMain.handle('cloud-list', cloudTry(({ provider, id }) => cloud.list(provider, id)));
ipcMain.handle('cloud-walk', cloudTry(({ provider, id }) => cloud.walk(provider, id, 400, 4)));
ipcMain.handle('cloud-download', cloudTry(async ({ provider, id }) => new Uint8Array(await cloud.download(provider, id))));
ipcMain.handle('cloud-backups', cloudTry(async () => { const out = []; for (const s of cloud.status().filter(x => x.signedIn)) { try { for (const f of await cloud.listApp(s.provider, ['Backups'])) if (/\.ftbak$/i.test(f.name)) out.push({ ...f, provider: s.provider }); } catch (e) { out.push({ provider: s.provider, error: e.message }); } } return out; }));
ipcMain.handle('cloud-backup-now', cloudTry(async ({ name, keep }) => { const p = path.join(backupDir(), name); if (!fs.existsSync(p)) throw new Error('no backup ' + name); return cloud.backup(name, { path: p, size: fs.statSync(p).size }, keep || 14); }));
ipcMain.handle('mail-search', cloudTry(({ provider, q }) => cloud.mailSearch(provider, q, 25)));
ipcMain.handle('mail-message', cloudTry(({ provider, id }) => cloud.mailMessage(provider, id)));
ipcMain.handle('mail-attachment', cloudTry(async ({ provider, msg, id }) => new Uint8Array(await cloud.mailAttachment(provider, msg, id))));
ipcMain.handle('backup-open-dir', () => shell.openPath(backupDir()));
// the backup as a zip written file by file (src/backup/zip-writer.js): memory stays small whatever the size of the projects
const { zipWriter } = require('./src/backup/zip-writer.js');
const bkOpen = new Map();
ipcMain.handle('backup-zip-begin', (_e, { name }) => { const dir = backupDir(), id = crypto.randomBytes(8).toString('hex'), tmp = path.join(dir, name + '.' + id + '.tmp');
  bkOpen.set(id, { z: zipWriter(tmp), tmp, name, dir }); return id; });
ipcMain.handle('backup-zip-add', (_e, { id, name, data }) => { const b = bkOpen.get(id); if (!b) throw new Error('backup not open'); b.z.add(name, Buffer.from(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)); return true; });
ipcMain.handle('backup-zip-abort', (_e, { id }) => { const b = bkOpen.get(id); if (b) { b.z.abort(); bkOpen.delete(id); } return true; });
ipcMain.handle('backup-zip-end', (_e, { id, keep }) => { const b = bkOpen.get(id); if (!b) throw new Error('backup not open'); bkOpen.delete(id);
  const size = b.z.end(), p = path.join(b.dir, b.name); fs.renameSync(b.tmp, p);
  fs.readdirSync(b.dir).filter(f => f.endsWith('.ftbak')).sort().reverse().slice(keep || 14).forEach(f => { try { fs.unlinkSync(path.join(b.dir, f)); } catch (e) {} });
  if (readCfg().cloudBackup !== false && cloud.status().some(x => x.signedIn)) {
    cloudLast = { at: Date.now(), running: true, results: [] };
    cloud.backup(b.name, { path: p, size }, keep || 14).then(r => { cloudLast = { at: Date.now(), running: false, results: r }; }).catch(e => { cloudLast = { at: Date.now(), running: false, results: [{ ok: false, error: e.message }] }; });
  }
  return { path: p, size }; });

/* ---------- updates ----------
   Manifest (JSON, at the URL set in Settings):
   { "version": "1.4.1", "notes": "...", "bundle": "https://.../FireTake-update-1.4.1.ftupd", "sha256": "<hex of bundle file>" }
   Bundle (.ftupd, JSON): { "app": "FireTake", "version": "1.4.1", "files": { "app/index.html": "<base64>", "main.js": "<base64>", ... } }
*/
const vnum = v => String(v || '0').split('.').map(n => parseInt(n) || 0);
const newer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('update-check', async (_e, { url }) => {
  try {
    if (!/^https:\/\//i.test(url)) return { error: '更新地址必须以 https:// 开头' };
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return { error: '无法读取更新信息（HTTP ' + r.status + '）' };
    const m = await r.json();
    return { current: app.getVersion(), latest: m.version, notes: m.notes || '', bundle: m.bundle, sha256: m.sha256, available: newer(m.version, app.getVersion()) };
  } catch (err) { return { error: '检查更新失败：' + err.message }; }
});
function applyBundle(buf, expectSha) {
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (expectSha && sha.toLowerCase() !== String(expectSha).toLowerCase()) throw new Error('更新包校验失败（SHA-256 不一致），已取消');
  const b = JSON.parse(buf.toString('utf8'));
  if (b.app !== 'FireTake' || !b.files) throw new Error('不是 FireTake 更新包');
  const root = __dirname;
  const staged = [];
  for (const [rel, b64] of Object.entries(b.files)) {
    const norm = path.normalize(rel);
    if (norm.startsWith('..') || path.isAbsolute(norm)) throw new Error('更新包包含非法路径：' + rel);
    staged.push([path.join(root, norm), Buffer.from(b64, 'base64')]);
  }
  for (const [p, data] of staged) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }
  return b.version;
}
ipcMain.handle('update-apply', async (_e, { bundle, sha256 }) => {
  try {
    if (!/^https:\/\//i.test(bundle)) return { error: '更新包地址必须以 https:// 开头' };
    const r = await fetch(bundle, { cache: 'no-store' });
    if (!r.ok) return { error: '下载更新包失败（HTTP ' + r.status + '）' };
    const v = applyBundle(Buffer.from(await r.arrayBuffer()), sha256);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
    return { version: v };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('update-apply-file', async () => {
  const r = await dialog.showOpenDialog(win, { title: L('选择 FireTake 更新包', 'Choose a FireTake update package'), filters: [{ name: L('FireTake 更新包', 'FireTake update package'), extensions: ['ftupd'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const v = applyBundle(fs.readFileSync(r.filePaths[0]), null);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
    return { version: v };
  } catch (err) { return { error: err.message }; }
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
