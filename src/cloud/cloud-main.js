/* Strix FireTake · cloud accounts (desktop shell side): sign in with Google / Microsoft / Dropbox, then
   - storage: browse folders, read files, upload (chunked, any size) — Google Drive, OneDrive, Dropbox
   - mail: find tender e-mails and their attachments — Gmail, Outlook
   Sign-in is OAuth 2.0 with PKCE through the system browser and a one-off local callback (http://127.0.0.1 / localhost:53682/callback).
   Each company registers its own app with each provider and puts the Client ID in Settings (docs/cloud-setup.md).
   createCloud({fetch, store, openExternal, endpoints, port}) — everything outside is injected, so it runs against a test server too.
   store: {get(key), set(key, value)} — tokens are encrypted by the caller (Electron safeStorage). */
'use strict';
const http = require('http'), crypto = require('crypto');

const PORT = 53682;
const DEFAULT_EP = {
  google: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', user: 'https://openidconnect.googleapis.com/v1/userinfo',
    drive: 'https://www.googleapis.com/drive/v3', upload: 'https://www.googleapis.com/upload/drive/v3', gmail: 'https://gmail.googleapis.com/gmail/v1/users/me' },
  microsoft: { auth: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', graph: 'https://graph.microsoft.com/v1.0' },
  dropbox: { auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', api: 'https://api.dropboxapi.com/2', content: 'https://content.dropboxapi.com/2' }
};
const SCOPES = {
  google: 'openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.readonly',
  microsoft: 'offline_access openid email User.Read Files.ReadWrite Mail.Read',
  dropbox: 'account_info.read files.metadata.read files.content.read files.content.write'
};
const NAMES = { google: 'Google', microsoft: 'Microsoft', dropbox: 'Dropbox' };
const APP_DIR = ['Strix FireTake'];
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function createCloud(o) {
  const F = o.fetch, store = o.store, port = o.port || PORT;
  const EP = JSON.parse(JSON.stringify(DEFAULT_EP)); for (const k of Object.keys(o.endpoints || {})) Object.assign(EP[k], o.endpoints[k]);
  const conf = p => (o.config && o.config()[p]) || {};
  const ep = (p, k) => EP[p][k].replace('{tenant}', conf(p).tenant || 'common');
  const redirect = p => p === 'google' ? `http://127.0.0.1:${port}/callback` : `http://localhost:${port}/callback`;
  const acct = p => store.get(p) || null;

  async function json(r, what) {
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
    if (!r.ok) { const m = j && (j.error_description || (j.error && (j.error.message || j.error_summary || j.error)) || j.error_summary); const e = new Error(`${what}: ${m || ('HTTP ' + r.status)}`); e.status = r.status; throw e; }
    return j;
  }
  const form = d => new URLSearchParams(Object.entries(d).filter(([, v]) => v != null && v !== '')).toString();

  // ---- sign in ----
  function waitForCode(state, timeoutMs) {
    return new Promise((resolve, reject) => {
      const servers = []; let done = false;
      const finish = (err, code) => { if (done) return; done = true; clearTimeout(timer); servers.forEach(s => { try { s.close(); } catch (e) {} }); err ? reject(err) : resolve(code); };
      const handler = (req, res) => {
        const u = new URL(req.url, 'http://localhost'); if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>Strix FireTake</title><body style="font-family:sans-serif;padding:40px"><h2>${ok ? '✓ 已登录 / Signed in' : '登录没有完成 / Sign-in not completed'}</h2><p>${ok ? '可以关闭这个页面，回到 Strix FireTake。 You can close this page and go back to Strix FireTake.' : String(u.searchParams.get('error_description') || u.searchParams.get('error') || '').replace(/[<>&]/g, '')}</p></body>`);
        if (ok) finish(null, u.searchParams.get('code')); else if (u.searchParams.get('error')) finish(new Error(u.searchParams.get('error_description') || u.searchParams.get('error')));
      };
      const timer = setTimeout(() => finish(new Error('sign-in timed out')), timeoutMs || 300000);
      let listening = 0, failed = 0;
      for (const host of ['127.0.0.1', '::1']) {
        const s = http.createServer(handler); servers.push(s);
        s.on('error', e => { failed++; if (!listening && failed === 2) finish(new Error(`port ${port} is in use: ${e.message}`)); });
        s.listen(port, host, () => { listening++; });
      }
    });
  }
  async function signIn(p) {
    const c = conf(p); if (!c.clientId) throw new Error(`${NAMES[p]}: Client ID not set`);
    const verifier = b64url(crypto.randomBytes(48)), challenge = b64url(crypto.createHash('sha256').update(verifier).digest()), state = b64url(crypto.randomBytes(16));
    const q = { client_id: c.clientId, response_type: 'code', redirect_uri: redirect(p), code_challenge: challenge, code_challenge_method: 'S256', state, scope: SCOPES[p] };
    if (p === 'google') Object.assign(q, { access_type: 'offline', prompt: 'consent' });
    if (p === 'microsoft') q.prompt = 'select_account';
    if (p === 'dropbox') q.token_access_type = 'offline';
    const wait = waitForCode(state, o.timeoutMs);
    await o.openExternal(ep(p, 'auth') + '?' + form(q));
    const code = await wait;
    const t = await json(await F(ep(p, 'token'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: redirect(p), client_id: c.clientId, client_secret: c.clientSecret, code_verifier: verifier, scope: p === 'microsoft' ? SCOPES[p] : undefined }) }), `${NAMES[p]} sign-in`);
    const a = { access: t.access_token, refresh: t.refresh_token || '', expires: Date.now() + (t.expires_in || 3600) * 1000 - 60000, email: '' };
    store.set(p, a);
    try { a.email = await whoAmI(p); store.set(p, a); } catch (e) {}
    return { provider: p, email: a.email };
  }
  async function token(p) {
    const a = acct(p); if (!a) throw new Error(`${NAMES[p]}: not signed in`);
    if (a.access && Date.now() < a.expires) return a.access;
    if (!a.refresh) throw new Error(`${NAMES[p]}: sign in again`);
    const c = conf(p);
    const t = await json(await F(ep(p, 'token'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', refresh_token: a.refresh, client_id: c.clientId, client_secret: c.clientSecret, scope: p === 'microsoft' ? SCOPES[p] : undefined }) }), `${NAMES[p]} sign-in`);
    Object.assign(a, { access: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000 - 60000 }); if (t.refresh_token) a.refresh = t.refresh_token;
    store.set(p, a); return a.access;
  }
  async function call(p, url, opt, what) {
    opt = opt || {}; const go = async () => F(url, { ...opt, headers: { ...(opt.headers || {}), authorization: 'Bearer ' + await token(p) } });
    let r = await go(); if (r.status === 401) { const a = acct(p); if (a) { a.expires = 0; store.set(p, a); } r = await go(); }
    return r;
  }
  const callJSON = async (p, url, opt, what) => json(await call(p, url, opt), what || NAMES[p]);
  const bytes = async (r, what) => { if (!r.ok) await json(r, what); return Buffer.from(await r.arrayBuffer()); };
  async function whoAmI(p) {
    if (p === 'google') return (await callJSON(p, ep(p, 'user'))).email || '';
    if (p === 'microsoft') { const m = await callJSON(p, ep(p, 'graph') + '/me'); return m.mail || m.userPrincipalName || ''; }
    const d = await callJSON(p, ep(p, 'api') + '/users/get_current_account', { method: 'POST' }); return (d.email || (d.name && d.name.display_name) || '');
  }
  function signOut(p) { store.set(p, null); return true; }
  function status() { return Object.keys(NAMES).map(p => { const a = acct(p), c = conf(p); return { provider: p, name: NAMES[p], configured: !!c.clientId, signedIn: !!a, email: a ? a.email : '', storage: true, mail: p !== 'dropbox' }; }); }

  // ---- storage ----
  const GFOLDER = 'application/vnd.google-apps.folder';
  const GEXPORT = { 'application/vnd.google-apps.document': ['application/pdf', '.pdf'], 'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'], 'application/vnd.google-apps.presentation': ['application/pdf', '.pdf'], 'application/vnd.google-apps.drawing': ['application/pdf', '.pdf'] };
  // a folder's items: {id, name, folder, size, modified}
  async function list(p, id) {
    const out = [];
    if (p === 'google') {
      let page = ''; do {
        const q = encodeURIComponent(`'${String(id || 'root').replace(/'/g, "\\'")}' in parents and trashed=false`);
        const j = await callJSON(p, `${ep(p, 'drive')}/files?q=${q}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, {}, 'Google Drive');
        for (const f of j.files || []) { const ex = GEXPORT[f.mimeType]; if (f.mimeType !== GFOLDER && /^application\/vnd\.google-apps\./.test(f.mimeType) && !ex) continue;
          out.push({ id: ex ? f.id + '|export|' + ex[0] : f.id, name: f.name + (ex && !f.name.toLowerCase().endsWith(ex[1]) ? ex[1] : ''), folder: f.mimeType === GFOLDER, size: +f.size || 0, modified: f.modifiedTime || '' }); }
        page = j.nextPageToken || '';
      } while (page);
    } else if (p === 'microsoft') {
      let url = `${ep(p, 'graph')}/me/drive/${id ? 'items/' + encodeURIComponent(id) : 'root'}/children?$top=999&$select=id,name,size,folder,file,lastModifiedDateTime`;
      while (url) { const j = await callJSON(p, url, {}, 'OneDrive'); for (const f of j.value || []) out.push({ id: f.id, name: f.name, folder: !!f.folder, size: f.size || 0, modified: f.lastModifiedDateTime || '' }); url = j['@odata.nextLink'] || ''; }
    } else {
      let j = await callJSON(p, ep(p, 'api') + '/files/list_folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: id || '', limit: 2000 }) }, 'Dropbox');
      for (;;) { for (const f of j.entries || []) if (f['.tag'] !== 'deleted') out.push({ id: f.path_lower, name: f.name, folder: f['.tag'] === 'folder', size: f.size || 0, modified: f.server_modified || '' });
        if (!j.has_more) break; j = await callJSON(p, ep(p, 'api') + '/files/list_folder/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cursor: j.cursor }) }, 'Dropbox'); }
    }
    return out.sort((a, b) => (b.folder - a.folder) || a.name.localeCompare(b.name));
  }
  // every file under a folder (as the tender import reads a local folder): {id, name, rel, size}
  async function walk(p, id, max, depth) {
    max = max || 400; depth = depth == null ? 4 : depth; const out = [];
    const go = async (fid, rel, d) => { if (d > depth || out.length >= max) return;
      for (const f of await list(p, fid)) { if (out.length >= max) return; const r = rel ? rel + '/' + f.name : f.name;
        if (f.folder) await go(f.id, r, d + 1); else out.push({ id: f.id, name: f.name, rel: r, size: f.size }); } };
    await go(id, '', 0); return out;
  }
  async function download(p, id) {
    if (p === 'google') { const [fid, , mime] = String(id).split('|');
      return bytes(await call(p, mime ? `${ep(p, 'drive')}/files/${encodeURIComponent(fid)}/export?mimeType=${encodeURIComponent(mime)}` : `${ep(p, 'drive')}/files/${encodeURIComponent(fid)}?alt=media&supportsAllDrives=true`), 'Google Drive'); }
    if (p === 'microsoft') return bytes(await call(p, `${ep(p, 'graph')}/me/drive/items/${encodeURIComponent(id)}/content`), 'OneDrive');
    return bytes(await call(p, ep(p, 'content') + '/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path: id }) } }), 'Dropbox');
  }
  // Google: the id of folder path parts under My Drive (created when missing)
  async function gFolder(p, parts) {
    let parent = 'root';
    for (const name of parts) {
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='${GFOLDER}' and trashed=false`);
      const j = await callJSON(p, `${ep(p, 'drive')}/files?q=${q}&fields=files(id)`, {}, 'Google Drive');
      parent = j.files && j.files[0] ? j.files[0].id : (await callJSON(p, `${ep(p, 'drive')}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: GFOLDER, parents: [parent] }) }, 'Google Drive')).id;
    }
    return parent;
  }
  const CHUNK = { google: 32 * 256 * 1024, microsoft: 32 * 320 * 1024, dropbox: 8 * 1024 * 1024 };
  // upload a file to folder path parts (under Strix FireTake/), replacing one of the same name
  // buf: a Buffer, or {path, size} — a file on disk read a chunk at a time (a backup of many GB)
  function source(buf) { if (buf && buf.path) { const fs = require('fs'), fd = fs.openSync(buf.path, 'r'), size = buf.size != null ? buf.size : fs.fstatSync(fd).size;
      return { total: size, part: (a, b) => { const out = Buffer.alloc(b - a); fs.readSync(fd, out, 0, b - a, a); return out; }, close: () => fs.closeSync(fd) }; }
    const B = Buffer.from(buf); return { total: B.length, part: (a, b) => B.subarray(a, b), close: () => {} }; }
  async function upload(p, parts, name, buf) { const src = source(buf); try { return await upload1(p, parts, name, src); } finally { src.close(); } }
  async function upload1(p, parts, name, src) {
    const total = src.total, C = o.chunk || CHUNK[p], buf = { subarray: (a, b) => src.part(a, Math.min(b == null ? total : b, total)) };
    if (p === 'google') {
      const parent = await gFolder(p, APP_DIR.concat(parts));
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`);
      const old = ((await callJSON(p, `${ep(p, 'drive')}/files?q=${q}&fields=files(id)`, {}, 'Google Drive')).files || [])[0];
      const r = await call(p, old ? `${ep(p, 'upload')}/files/${old.id}?uploadType=resumable` : `${ep(p, 'upload')}/files?uploadType=resumable`, { method: old ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(total) }, body: JSON.stringify(old ? { name } : { name, parents: [parent] }) });
      if (!r.ok) await json(r, 'Google Drive upload'); const loc = r.headers.get('location');
      for (let a = 0; a < total || a === 0; a += C) { const b = Math.min(total, a + C);
        const s = await F(loc, { method: 'PUT', headers: { 'content-range': total ? `bytes ${a}-${b - 1}/${total}` : 'bytes */0' }, body: buf.subarray(a, b) });
        if (s.status === 308) continue; const j = await json(s, 'Google Drive upload'); return { id: j.id, name }; }
      return { name };
    }
    if (p === 'microsoft') {
      const path = APP_DIR.concat(parts, [name]).map(encodeURIComponent).join('/');
      const sess = await callJSON(p, `${ep(p, 'graph')}/me/drive/root:/${path}:/createUploadSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) }, 'OneDrive upload');
      let last = null;
      for (let a = 0; a < total || a === 0; a += C) { const b = Math.min(total, a + C);
        const s = await F(sess.uploadUrl, { method: 'PUT', headers: { 'content-length': String(b - a), 'content-range': `bytes ${a}-${Math.max(a, b - 1)}/${total}` }, body: buf.subarray(a, b) });
        last = await json(s, 'OneDrive upload'); if (!total) break; }
      return { id: last && last.id, name };
    }
    const path = '/' + APP_DIR.concat(parts, [name]).join('/');
    if (total <= C) { const j = await json(await call(p, ep(p, 'content') + '/files/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': asciiJSON({ path, mode: 'overwrite', mute: true }) }, body: buf }), 'Dropbox upload'); return { id: j.path_lower, name }; }
    const st = await json(await call(p, ep(p, 'content') + '/files/upload_session/start', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': '{"close":false}' }, body: buf.subarray(0, C) }), 'Dropbox upload');
    let a = C; for (; a + C < total; a += C) await json(await call(p, ep(p, 'content') + '/files/upload_session/append_v2', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ cursor: { session_id: st.session_id, offset: a }, close: false }) }, body: buf.subarray(a, a + C) }), 'Dropbox upload');
    const j = await json(await call(p, ep(p, 'content') + '/files/upload_session/finish', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': asciiJSON({ cursor: { session_id: st.session_id, offset: a }, commit: { path, mode: 'overwrite', mute: true } }) }, body: buf.subarray(a) }), 'Dropbox upload');
    return { id: j.path_lower, name };
  }
  // Dropbox-API-Arg is an HTTP header: non-ASCII characters escaped
  const asciiJSON = v => JSON.stringify(v).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  // the files in Strix FireTake/<parts> (none when the folder does not exist yet)
  async function listApp(p, parts) {
    try {
      if (p === 'google') return list(p, await gFolder(p, APP_DIR.concat(parts)));
      if (p === 'microsoft') { const j = await callJSON(p, `${ep(p, 'graph')}/me/drive/root:/${APP_DIR.concat(parts).map(encodeURIComponent).join('/')}:/children?$top=999&$select=id,name,size,folder,lastModifiedDateTime`, {}, 'OneDrive'); return (j.value || []).map(f => ({ id: f.id, name: f.name, folder: !!f.folder, size: f.size || 0, modified: f.lastModifiedDateTime || '' })); }
      return await list(p, ('/' + APP_DIR.concat(parts).join('/')).toLowerCase());
    } catch (e) { if (e.status === 404 || e.status === 409) return []; throw e; }
  }
  async function remove(p, id) {
    if (p === 'google') return json(await call(p, `${ep(p, 'drive')}/files/${encodeURIComponent(String(id).split('|')[0])}`, { method: 'DELETE' }), 'Google Drive');
    if (p === 'microsoft') return json(await call(p, `${ep(p, 'graph')}/me/drive/items/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'OneDrive');
    return json(await call(p, ep(p, 'api') + '/files/delete_v2', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: id }) }), 'Dropbox');
  }
  // a backup to every signed-in account (Strix FireTake/Backups), keeping the newest `keep`
  async function backup(name, buf, keep) {
    const res = [];
    for (const s of status().filter(x => x.signedIn)) {
      try { await upload(s.provider, ['Backups'], name, buf);
        const old = (await listApp(s.provider, ['Backups'])).filter(f => !f.folder && /\.ftbak$/i.test(f.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(keep || 14);
        for (const f of old) { try { await remove(s.provider, f.id); } catch (e) {} }
        res.push({ provider: s.provider, ok: true });
      } catch (e) { res.push({ provider: s.provider, ok: false, error: e.message }); }
    }
    return res;
  }

  // ---- mail ----
  const QUERY = { google: 'has:attachment newer_than:60d (tender OR tenders OR RFT OR RFQ OR ITT OR quote OR quotation OR pricing OR "fire services")', microsoft: 'tender OR RFT OR RFQ OR quotation OR pricing' };
  const header = (h, n) => ((h || []).find(x => x.name.toLowerCase() === n) || {}).value || '';
  const addr = s => { const m = String(s || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/); return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: '', email: String(s || '').trim().toLowerCase() }; };
  function gParts(part, out) { out = out || { text: '', html: '', att: [] }; if (!part) return out;
    if (part.filename && part.body && (part.body.attachmentId || part.body.data)) out.att.push({ id: part.body.attachmentId || '', data: part.body.data || '', name: part.filename, size: part.body.size || 0, type: part.mimeType });
    else if (part.mimeType === 'text/plain' && part.body && part.body.data && !out.text) out.text = fromB64url(part.body.data).toString('utf8');
    else if (part.mimeType === 'text/html' && part.body && part.body.data && !out.html) out.html = fromB64url(part.body.data).toString('utf8');
    (part.parts || []).forEach(x => gParts(x, out)); return out; }
  const strip = h => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n');
  // recent tender e-mails: [{id, subject, from:{name,email}, date, snippet, attachments: n}]
  async function mailSearch(p, q, max) {
    max = max || 25;
    if (p === 'google') {
      const j = await callJSON(p, `${ep(p, 'gmail')}/messages?maxResults=${max}&q=${encodeURIComponent(q || QUERY.google)}`, {}, 'Gmail'); const out = [];
      for (const m of j.messages || []) { const d = await callJSON(p, `${ep(p, 'gmail')}/messages/${m.id}?format=full`, {}, 'Gmail'); const h = d.payload && d.payload.headers, P = gParts(d.payload);
        out.push({ id: m.id, subject: header(h, 'subject'), from: addr(header(h, 'from')), date: header(h, 'date'), snippet: d.snippet || '', attachments: P.att.length }); }
      return out;
    }
    if (p === 'microsoft') {
      const j = await callJSON(p, `${ep(p, 'graph')}/me/messages?$top=${max}&$search=${encodeURIComponent('"' + (q || QUERY.microsoft).replace(/"/g, '') + '"')}&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments`, {}, 'Outlook');
      return (j.value || []).filter(m => m.hasAttachments).map(m => ({ id: m.id, subject: m.subject || '', from: { name: (m.from && m.from.emailAddress && m.from.emailAddress.name) || '', email: ((m.from && m.from.emailAddress && m.from.emailAddress.address) || '').toLowerCase() }, date: m.receivedDateTime || '', snippet: m.bodyPreview || '', attachments: 1 }));
    }
    throw new Error('Dropbox has no mail');
  }
  // one e-mail: {subject, from, date, eml: text of a small .eml (headers + plain body), attachments: [{id, name, size}]}
  async function mailMessage(p, id) {
    let subject, from, date, body, att;
    if (p === 'google') { const d = await callJSON(p, `${ep(p, 'gmail')}/messages/${encodeURIComponent(id)}?format=full`, {}, 'Gmail'); const h = d.payload && d.payload.headers, P = gParts(d.payload);
      subject = header(h, 'subject'); from = header(h, 'from'); date = header(h, 'date'); body = P.text || strip(P.html); att = P.att.map((a, i) => ({ id: a.id || 'inline:' + i, name: a.name, size: a.size })); }
    else { const m = await callJSON(p, `${ep(p, 'graph')}/me/messages/${encodeURIComponent(id)}?$select=subject,from,receivedDateTime,body`, { headers: { prefer: 'outlook.body-content-type="text"' } }, 'Outlook');
      const fa = m.from && m.from.emailAddress || {}; subject = m.subject || ''; from = fa.name ? `"${fa.name}" <${fa.address}>` : (fa.address || ''); date = m.receivedDateTime || ''; body = m.body && m.body.contentType === 'html' ? strip(m.body.content) : (m.body && m.body.content || '');
      const A = await callJSON(p, `${ep(p, 'graph')}/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,isInline`, {}, 'Outlook');
      att = (A.value || []).filter(a => (a['@odata.type'] || '#microsoft.graph.fileAttachment') === '#microsoft.graph.fileAttachment').map(a => ({ id: a.id, name: a.name, size: a.size || 0 })); }
    const eml = [`From: ${from}`, `Subject: ${subject}`, `Date: ${date}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', String(body || '').replace(/\r?\n/g, '\r\n')].join('\r\n');
    return { subject, from: addr(from), date, eml, attachments: att };
  }
  async function mailAttachment(p, msgId, attId) {
    if (p === 'google') {
      if (String(attId).startsWith('inline:')) { const d = await callJSON(p, `${ep(p, 'gmail')}/messages/${encodeURIComponent(msgId)}?format=full`, {}, 'Gmail'); return fromB64url(gParts(d.payload).att[+attId.slice(7)].data); }
      const j = await callJSON(p, `${ep(p, 'gmail')}/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attId)}`, {}, 'Gmail'); return fromB64url(j.data);
    }
    return bytes(await call(p, `${ep(p, 'graph')}/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attId)}/$value`), 'Outlook');
  }

  return { signIn, signOut, status, token, list, walk, download, upload, listApp, remove, backup, mailSearch, mailMessage, mailAttachment, redirect, SCOPES, NAMES };
}
module.exports = { createCloud, PORT, SCOPES, NAMES };
