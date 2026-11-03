// Unit: cloud accounts (src/cloud/cloud-main.js) against simulated Google / Microsoft / Dropbox services —
// sign-in (PKCE through a local callback), token refresh, folders, downloads, chunked uploads, backups, Gmail / Outlook
const test = require('node:test'); const assert = require('node:assert'); const http = require('http'); const crypto = require('crypto');
const { createCloud } = require('../../src/cloud/cloud-main.js');

const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const J = (v, status, headers) => new Response(JSON.stringify(v), { status: status || 200, headers: { 'content-type': 'application/json', ...(headers || {}) } });
const store = () => { const m = {}; return { get: k => m[k] || null, set: (k, v) => { if (v) m[k] = JSON.parse(JSON.stringify(v)); else delete m[k]; }, m }; };
const signedIn = (s, p, extra) => s.set(p, { access: 'A-' + p, refresh: 'R-' + p, expires: Date.now() + 3600e3, email: p + '@x.com', ...(extra || {}) });

test('sign in: PKCE through the local callback, the code exchanged with the verifier, the account e-mail kept; an expired token is refreshed', async () => {
  const s = store(); let challenge = '', refreshed = 0;
  const fetch = async (url, o) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) { const f = new URLSearchParams(o.body);
      if (f.get('grant_type') === 'refresh_token') { assert.equal(f.get('refresh_token'), 'R1'); refreshed++; return J({ access_token: 'A2', expires_in: 3600 }); }
      assert.equal(f.get('code'), 'CODE'); assert.equal(f.get('client_secret'), 'SEC');
      assert.equal(b64url(crypto.createHash('sha256').update(f.get('code_verifier')).digest()), challenge, 'the verifier matches the challenge sent to the browser');
      return J({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }); }
    if (url.includes('userinfo')) return J({ email: o.headers.authorization === 'Bearer A1' ? 'est@company.com.au' : '?' });
    if (url.includes('/drive/v3/files?')) return J({ files: [] });
    throw new Error('unexpected ' + url);
  };
  const cloud = createCloud({ fetch, store: s, port: 53991, config: () => ({ google: { clientId: 'CID', clientSecret: 'SEC' } }),
    openExternal: async u => { const q = new URL(u).searchParams; assert.equal(q.get('client_id'), 'CID'); assert.equal(q.get('code_challenge_method'), 'S256'); assert.match(q.get('scope'), /gmail\.readonly/);
      assert.equal(q.get('access_type'), 'offline'); challenge = q.get('code_challenge');
      setTimeout(() => http.get(`${q.get('redirect_uri')}?code=CODE&state=${q.get('state')}`, r => r.resume()), 20); } });
  const r = await cloud.signIn('google');
  assert.equal(r.email, 'est@company.com.au'); assert.equal(s.m.google.refresh, 'R1');
  assert.deepEqual(cloud.status().find(x => x.provider === 'google'), { provider: 'google', name: 'Google', configured: true, signedIn: true, email: 'est@company.com.au', storage: true, mail: true });
  s.m.google.expires = 0; await cloud.list('google'); assert.equal(refreshed, 1); assert.equal(s.m.google.access, 'A2');
  cloud.signOut('google'); assert.equal(cloud.status().find(x => x.provider === 'google').signedIn, false);
});

test('a wrong state on the callback is refused (no token request)', async () => {
  let asked = false;
  const cloud = createCloud({ fetch: async () => { asked = true; return J({}); }, store: store(), port: 53992, timeoutMs: 600, config: () => ({ dropbox: { clientId: 'K' } }),
    openExternal: async u => { const q = new URL(u).searchParams; assert.equal(q.get('token_access_type'), 'offline'); setTimeout(() => http.get(`${q.get('redirect_uri')}?code=EVIL&state=wrong`, r => r.resume()), 20); } });
  await assert.rejects(cloud.signIn('dropbox'), /timed out/); assert.equal(asked, false);
});

test('folders: Google Drive (Google Docs exported), OneDrive (paged), Dropbox (continued); walk gives relative paths; download', async () => {
  const s = store(); ['google', 'microsoft', 'dropbox'].forEach(p => signedIn(s, p));
  const fetch = async (url, o) => {
    const u = decodeURIComponent(url);
    if (u.includes("'root' in parents")) return J({ files: [{ id: 'F1', name: 'Tender 21 Ossary', mimeType: 'application/vnd.google-apps.folder' }, { id: 'D1', name: 'Scope', mimeType: 'application/vnd.google-apps.document' }, { id: 'X', name: 'Form', mimeType: 'application/vnd.google-apps.form' }] });
    if (u.includes("'F1' in parents")) return J({ files: [{ id: 'P1', name: 'FS-101.pdf', mimeType: 'application/pdf', size: '5' }, { id: 'F2', name: 'Specs', mimeType: 'application/vnd.google-apps.folder' }] });
    if (u.includes("'F2' in parents")) return J({ files: [{ id: 'P2', name: 'Spec.pdf', mimeType: 'application/pdf', size: '3' }] });
    if (u.includes('/files/P1?alt=media')) return new Response('%PDF1');
    if (u.includes('/files/D1/export?mimeType=application/pdf')) return new Response('%PDFdoc');
    if (u.includes('graph.microsoft.com/v1.0/me/drive/root/children')) return J({ value: [{ id: 'm1', name: 'a.pdf', size: 1, file: {} }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' });
    if (u === 'https://graph.microsoft.com/v1.0/next') return J({ value: [{ id: 'm2', name: 'Job', folder: { childCount: 1 } }] });
    if (u.includes('/files/list_folder/continue')) return J({ entries: [{ '.tag': 'file', name: 'b.pdf', path_lower: '/b.pdf', size: 2 }], has_more: false });
    if (u.includes('/files/list_folder')) return J({ entries: [{ '.tag': 'folder', name: 'Quotes', path_lower: '/quotes' }], has_more: true, cursor: 'c1' });
    if (u.includes('content.dropboxapi.com/2/files/download')) { assert.equal(JSON.parse(o.headers['Dropbox-API-Arg']).path, '/b.pdf'); return new Response('DBX'); }
    throw new Error('unexpected ' + u);
  };
  const cloud = createCloud({ fetch, store: s, config: () => ({}), openExternal: async () => {} });
  const g = await cloud.list('google'); assert.deepEqual(g.map(f => [f.name, f.folder]), [['Tender 21 Ossary', true], ['Scope.pdf', false]], 'Google Docs exported as PDF, forms skipped');
  assert.deepEqual((await cloud.walk('google', 'F1')).map(f => f.rel).sort(), ['FS-101.pdf', 'Specs/Spec.pdf']);
  assert.equal((await cloud.download('google', 'P1')).toString(), '%PDF1'); assert.equal((await cloud.download('google', g[1].id)).toString(), '%PDFdoc');
  assert.deepEqual((await cloud.list('microsoft')).map(f => f.name), ['Job', 'a.pdf']);
  assert.deepEqual((await cloud.list('dropbox')).map(f => f.name), ['Quotes', 'b.pdf']); assert.equal((await cloud.download('dropbox', '/b.pdf')).toString(), 'DBX');
});

test('uploads: chunked to Google Drive, OneDrive and Dropbox; the bytes arrive whole; backups keep the newest', async () => {
  const s = store(); ['google', 'microsoft', 'dropbox'].forEach(p => signedIn(s, p));
  const data = Buffer.from('0123456789abcdefghij'); const got = { google: [], microsoft: [], dropbox: [] }; const removed = [];
  const fetch = async (url, o) => {
    const u = decodeURIComponent(url);
    // Google: folders found / created, resumable session, 308 until the last chunk
    if (u.includes("mimeType='application/vnd.google-apps.folder'")) return J({ files: u.includes("name='Strix FireTake'") ? [{ id: 'G0' }] : [] });
    if (u.endsWith('/drive/v3/files?fields=id') && o.method === 'POST') return J({ id: 'GB' });
    if (u.includes("'GB' in parents and trashed=false") && !u.includes("mimeType='")) return J({ files: u.includes("name='") ? [] : [{ id: 'old1', name: 'FireTake-backup-2026-01-01.ftbak', mimeType: 'x' }, { id: 'new1', name: 'FireTake-backup-2026-11-03.ftbak', mimeType: 'x' }] });
    if (u.includes('/upload/drive/v3/files?uploadType=resumable')) { assert.deepEqual(JSON.parse(o.body).parents, ['GB']); return new Response('', { status: 200, headers: { location: 'https://upload.google/sess' } }); }
    if (u === 'https://upload.google/sess') { got.google.push(Buffer.from(o.body)); const end = +o.headers['content-range'].match(/-(\d+)\//)[1]; return end + 1 < data.length ? new Response('', { status: 308 }) : J({ id: 'GF' }); }
    if (u.includes('/drive/v3/files/old1') && o.method === 'DELETE') { removed.push('google:old1'); return new Response('', { status: 204 }); }
    // OneDrive: an upload session by path
    if (u.includes('/me/drive/root:/Strix FireTake/Backups/FireTake-backup-2026-11-03.ftbak:/createUploadSession')) return J({ uploadUrl: 'https://upload.ms/sess' });
    if (u === 'https://upload.ms/sess') { got.microsoft.push(Buffer.from(o.body)); const end = +o.headers['content-range'].match(/-(\d+)\//)[1]; return end + 1 < data.length ? J({ nextExpectedRanges: [] }, 202) : J({ id: 'MF' }, 201); }
    if (u.includes('/me/drive/root:/Strix FireTake/Backups:/children')) return J({ value: [{ id: 'mo', name: 'FireTake-backup-2026-01-01.ftbak' }, { id: 'mn', name: 'FireTake-backup-2026-11-03.ftbak' }] });
    if (u.includes('/me/drive/items/mo') && o.method === 'DELETE') { removed.push('microsoft:mo'); return new Response('', { status: 204 }); }
    // Dropbox: upload session start / append / finish
    if (u.includes('/upload_session/start')) { got.dropbox.push(Buffer.from(o.body)); return J({ session_id: 'S' }); }
    if (u.includes('/upload_session/append_v2')) { const a = JSON.parse(o.headers['Dropbox-API-Arg']); assert.equal(a.cursor.offset, got.dropbox.reduce((n, b) => n + b.length, 0)); got.dropbox.push(Buffer.from(o.body)); return J({}); }
    if (u.includes('/upload_session/finish')) { const a = JSON.parse(o.headers['Dropbox-API-Arg']); assert.equal(a.commit.path, '/Strix FireTake/Backups/FireTake-backup-2026-11-03.ftbak'); got.dropbox.push(Buffer.from(o.body)); return J({ path_lower: a.commit.path.toLowerCase() }); }
    if (u.includes('/files/list_folder')) return J({ entries: [{ '.tag': 'file', name: 'FireTake-backup-2026-01-01.ftbak', path_lower: '/strix firetake/backups/o' }, { '.tag': 'file', name: 'FireTake-backup-2026-11-03.ftbak', path_lower: '/strix firetake/backups/n' }], has_more: false });
    if (u.includes('/files/delete_v2')) { removed.push('dropbox:' + JSON.parse(o.body).path); return J({}); }
    throw new Error('unexpected ' + o.method + ' ' + u);
  };
  const cloud = createCloud({ fetch, store: s, config: () => ({}), openExternal: async () => {}, chunk: 8 });
  const r = await cloud.backup('FireTake-backup-2026-11-03.ftbak', data, 1);
  assert.deepEqual(r.map(x => [x.provider, x.ok, x.error]), [['google', true, undefined], ['microsoft', true, undefined], ['dropbox', true, undefined]]);
  for (const p of ['google', 'microsoft', 'dropbox']) { assert.equal(Buffer.concat(got[p]).toString(), data.toString(), p + ' bytes whole'); assert.ok(got[p].length >= 3, p + ' in chunks'); }
  assert.deepEqual(removed.sort(), ['dropbox:/strix firetake/backups/o', 'google:old1', 'microsoft:mo'], 'older backups removed');
});

test('mail: Gmail and Outlook tender e-mails, the message as a small .eml, attachments downloaded', async () => {
  const s = store(); signedIn(s, 'google'); signedIn(s, 'microsoft');
  const msg = { id: 'g1', snippet: 'Please find attached', payload: { headers: [{ name: 'Subject', value: 'Tender - 21 Ossary St Mascot' }, { name: 'From', value: '"Jane Smith" <jane@acme.com.au>' }, { name: 'Date', value: 'Mon, 3 Nov 2026 09:00:00 +1100' }],
    mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain', body: { data: b64url('Site: 21 Ossary Street, Mascot NSW 2020\nTenders close 13 November 2026') } }, { mimeType: 'application/pdf', filename: 'FS-101.pdf', body: { attachmentId: 'att1', size: 4 } }, { mimeType: 'text/plain', filename: 'note.txt', body: { data: b64url('hi'), size: 2 } }] } };
  const fetch = async (url, o) => {
    const u = decodeURIComponent(url);
    if (u.includes('/gmail/v1/users/me/messages?')) { assert.match(u, /has:attachment/); return J({ messages: [{ id: 'g1' }] }); }
    if (u.includes('/messages/g1?format=full')) return J(msg);
    if (u.includes('/messages/g1/attachments/att1')) return J({ data: b64url('%PDF') });
    if (u.includes('graph.microsoft.com/v1.0/me/messages?')) return J({ value: [{ id: 'o1', subject: 'RFQ Fire', from: { emailAddress: { name: 'Bob', address: 'Bob@Builder.com.au' } }, receivedDateTime: '2026-11-03T00:00:00Z', hasAttachments: true }, { id: 'o2', subject: 'lunch', hasAttachments: false }] });
    if (u.includes('/me/messages/o1?')) { assert.equal(o.headers.prefer, 'outlook.body-content-type="text"'); return J({ subject: 'RFQ Fire', from: { emailAddress: { name: 'Bob', address: 'bob@builder.com.au' } }, body: { contentType: 'text', content: 'Hello' } }); }
    if (u.includes('/me/messages/o1/attachments?')) return J({ value: [{ '@odata.type': '#microsoft.graph.fileAttachment', id: 'a1', name: 'Specs.zip', size: 3 }, { '@odata.type': '#microsoft.graph.itemAttachment', id: 'a2', name: 'fwd' }] });
    if (u.includes('/me/messages/o1/attachments/a1/$value')) return new Response('ZIP');
    throw new Error('unexpected ' + u);
  };
  const cloud = createCloud({ fetch, store: s, config: () => ({}), openExternal: async () => {} });
  const L = await cloud.mailSearch('google'); assert.deepEqual(L.map(m => [m.subject, m.from.email, m.attachments]), [['Tender - 21 Ossary St Mascot', 'jane@acme.com.au', 2]]);
  const m = await cloud.mailMessage('google', 'g1'); assert.match(m.eml, /^From: "Jane Smith" <jane@acme.com.au>\r\nSubject: Tender - 21 Ossary St Mascot/); assert.match(m.eml, /Tenders close 13 November 2026/);
  assert.deepEqual(m.attachments.map(a => a.name), ['FS-101.pdf', 'note.txt']);
  assert.equal((await cloud.mailAttachment('google', 'g1', 'att1')).toString(), '%PDF'); assert.equal((await cloud.mailAttachment('google', 'g1', m.attachments[1].id)).toString(), 'hi');
  const O = await cloud.mailSearch('microsoft'); assert.deepEqual(O.map(x => [x.id, x.from.email]), [['o1', 'bob@builder.com.au']], 'only e-mails with attachments');
  const om = await cloud.mailMessage('microsoft', 'o1'); assert.deepEqual(om.attachments.map(a => a.name), ['Specs.zip']); assert.equal((await cloud.mailAttachment('microsoft', 'o1', 'a1')).toString(), 'ZIP');
  // the .eml goes through the tender inbox's own reader
  const I = require('../../src/inbox/tender-inbox.js'); const e = I.parseEml(m.eml); assert.equal(e.from.email, 'jane@acme.com.au'); assert.equal(I.extract({ folder: I.cleanSubject(m.subject), emails: [e] }).closes, '13 November 2026');
});
