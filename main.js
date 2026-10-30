// FireTake desktop shell (Electron)
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'FireTake 消防算量报价',
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
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: '文件', submenu: [
      { label: '打开备份文件夹', click: () => shell.openPath(backupDir()) },
      { type: 'separator' },
      isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
    ] },
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ] },
    { label: '视图', submenu: [
      { role: 'reload', label: '重新加载' }, { role: 'toggleDevTools', label: '开发者工具' }, { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大界面' }, { role: 'zoomOut', label: '缩小界面' },
      { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }
    ] },
    { label: '帮助', submenu: [
      { label: '申请 Anthropic API Key', click: () => shell.openExternal('https://console.anthropic.com/') },
      { label: '关于 FireTake', click: () => dialog.showMessageBox(win, {
        type: 'info', title: '关于 FireTake',
        message: 'FireTake 消防算量报价 v' + app.getVersion(),
        detail: '图纸算量、澳标核对、被动防火、计价与 Scope of Work / Exclusions 生成。\n数据保存在本机：' + app.getPath('userData')
      }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

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
ipcMain.handle('dir-get', () => ({ dataDir: dataDir(), backupDir: backupDir(), customBackup: !!readCfg().backupDir }));
ipcMain.handle('dir-choose', async (_e, { kind }) => {
  const r = await dialog.showOpenDialog(win, { title: kind === 'backup' ? '选择备份文件夹' : '选择项目数据文件夹', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const c = readCfg(); c[kind === 'backup' ? 'backupDir' : 'dataDir'] = r.filePaths[0]; writeCfg(c);
  return r.filePaths[0];
});
ipcMain.handle('dir-clear', (_e, { kind }) => { const c = readCfg(); delete c[kind === 'backup' ? 'backupDir' : 'dataDir']; writeCfg(c); return true; });
ipcMain.handle('dir-open', (_e, { kind }) => shell.openPath(kind === 'backup' ? backupDir() : (dataDir() || '')));
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
  return p;
});
ipcMain.handle('backup-open-dir', () => shell.openPath(backupDir()));

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
  const r = await dialog.showOpenDialog(win, { title: '选择 FireTake 更新包', filters: [{ name: 'FireTake 更新包', extensions: ['ftupd'] }], properties: ['openFile'] });
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
