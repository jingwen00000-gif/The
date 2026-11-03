// Unit: tender inbox — file sorting, the tender e-mail, project / client / contact / address / closing date
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../src/inbox/tender-inbox.js');
const k = p => { const c = I.classify(p); return c.kind + (c.cat ? ':' + c.cat : ''); };

test('files: fire drawings, other drawings, FER / spec / addenda, e-mails, tender documents, zips, junk', () => {
  assert.equal(k('Drawings/LCE103150-F102.pdf'), 'fire'); assert.equal(k('FS-101 Ground Floor.pdf'), 'fire'); assert.equal(k('Fire Services Layout L2.pdf'), 'fire');
  assert.equal(k('Fire/Level 3.pdf'), 'fire', 'a PDF in a Fire folder'); assert.equal(k('A-101 Ground Floor Plan.pdf'), 'dwg:DWG'); assert.equal(k('Architectural/GA L1.pdf'), 'doc:DWG', 'an architectural folder is filed without reading');
  assert.equal(k('FER Rev B.pdf'), 'doc:FER'); assert.equal(k('Fire Engineering Report.pdf'), 'doc:FER'); assert.equal(k('Fire Services Specification.pdf'), 'doc:SPEC'); assert.equal(k('Addendum 02.pdf'), 'doc:ADD');
  assert.equal(k('Tender Invitation.eml'), 'email:EMAIL'); assert.equal(k('RFT Conditions.pdf'), 'doc:TENDER'); assert.equal(k('Trade Breakup.xlsx'), 'doc:TENDER');
  assert.equal(k('Package.zip'), 'zip'); assert.equal(k('.DS_Store'), 'skip'); assert.equal(k('__MACOSX/x.pdf'), 'skip'); assert.equal(k('~$draft.docx'), 'skip');
  assert.equal(k('Untitled scan 3.pdf'), 'pdf?', 'decided from its first page'); assert.ok(I.pageLooksFire('PROPOSED FIRE SERVICES LEVEL 2 ARRANGEMENT')); assert.ok(!I.pageLooksFire('GENERAL ARRANGEMENT PLAN'));
});

const EML = ['From: "Jane Smith" <jane.smith@acmebuild.com.au>', 'To: estimating@strixfire.com.au', 'Subject: RE: Tender - National Storage Hornsby - Fire Services', 'Date: Mon, 2 Nov 2026 09:14:00 +1100',
  'Content-Type: multipart/alternative; boundary="b1"', '', '--b1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '',
  'Hi team,', '', 'Please find the tender documents for 28 Salisbury Road Asquith NSW 2077 attached. Tenders close Friday 13th November 2026 at 2pm.', '',
  'Kind regards,', 'Jane Smith', 'Senior Estimator', 'Acme Building Group Pty Ltd', 'M: 0412 345 678', '', '--b1', 'Content-Type: text/html; charset=utf-8', '', '<p>html</p>', '--b1--'].join('\r\n');

test('the tender e-mail: sender, subject, plain body', () => {
  const m = I.parseEml(EML);
  assert.deepEqual(m.from, { name: 'Jane Smith', email: 'jane.smith@acmebuild.com.au' }); assert.equal(m.subject, 'RE: Tender - National Storage Hornsby - Fire Services'); assert.match(m.body, /^Hi team,/);
  const b64 = I.parseEml('From: =?UTF-8?B?5byg5LiJ?= <zs@x.com.au>\r\nSubject: =?UTF-8?B?5oql5Lu3?=\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('你好').toString('base64'));
  assert.equal(b64.from.name, '张三'); assert.equal(b64.subject, '报价'); assert.equal(b64.body, '你好');
});

test('project, client, contact, address and closing date from the folder, the e-mail and the drawings', () => {
  const m = I.parseEml(EML);
  const x = I.extract({ folder: '2026-11-02 National Storage Hornsby', emails: [m], texts: ['PROJECT DETAILS NATIONAL STORAGE - HORNSBY 28 SALISBURY ROAD, ASQUITH NSW 2077'], ownDomain: 'strixfire.com.au' });
  assert.equal(x.name, 'National Storage Hornsby'); assert.equal(x.client, 'Acme Building Group Pty Ltd'); assert.equal(x.contact, 'Jane Smith'); assert.equal(x.email, 'jane.smith@acmebuild.com.au');
  assert.equal(x.phone, '0412 345 678'); assert.equal(x.site, '28 SALISBURY ROAD, ASQUITH NSW 2077'); assert.equal(x.closes, 'Friday 13th November 2026');
  // no folder name: the e-mail subject; our own e-mails are not the client
  const y = I.extract({ folder: '', emails: [{ from: { name: 'Me', email: 'me@strixfire.com.au' }, subject: 'x', body: '' }, m], ownDomain: 'strixfire.com.au' });
  assert.equal(y.name, 'National Storage Hornsby'); assert.equal(y.contact, 'Jane Smith');
  assert.equal(I.cleanFolder('20261102_Tender (2)'), 'Tender');
});

test('site address: the PROJECT address, not the consultant office in the title block', () => {
  const tb = 'Lucid Level 6, 4-6 Bligh Street Sydney NSW 2000 Phone: (02) 9080 5533 Email: sydney@lucid.com.au ISSUED FOR TENDER PROJECT DETAILS NATIONAL STORAGE - HORNSBY 28 SALISBURY ROAD, ASQUITH NSW 2077 FIRE SERVICES';
  assert.equal(I.extract({ folder: 'x', texts: [tb] }).site, '28 SALISBURY ROAD, ASQUITH NSW 2077');
  assert.equal(I.extract({ folder: 'x', texts: ['Level 6, 4-6 Bligh Street Sydney NSW 2000 Phone: 02 9080 5533'] }).site, '', 'only an office: no site');
});

test('discipline of a sheet: fire vs hydraulic (with hydrants), electrical (with detectors), mechanical; notes naming other trades do not count', () => {
  const fire = 'PROPOSED FIRE SERVICES LEVEL 2 ARRANGEMENT EAST. SPRINKLER HEAD PENDENT x 40. HOSE REEL. SMOKE DETECTOR. NOTES: COORDINATE WITH MECHANICAL SERVICES AND ARCHITECTURAL AND STRUCTURAL LAYOUT.';
  const hyd = 'HYDRAULIC SERVICES GROUND FLOOR LAYOUT. SEWER DRAINAGE. COLD WATER. HOT WATER. BASIN. WC. FLOOR WASTE. DOWNPIPE. FIRE HYDRANT. FIRE HYDRANT. FIRE HYDRANT BOOSTER.';
  const ele = 'ELECTRICAL SERVICES LIGHTING LAYOUT LEVEL 1. LED DOWNLIGHT. LED DOWNLIGHT. EXIT SIGN. EMERGENCY LIGHT. GPO. GPO. SWITCHBOARD DB-1. SMOKE DETECTOR (BY FIRE CONTRACTOR).';
  const mech = 'MECHANICAL SERVICES LAYOUT LEVEL 1. SUPPLY AIR DIFFUSER. RETURN AIR GRILLE. FCU-01. DUCT 400x300. FIRE DAMPER. EXHAUST FAN.';
  assert.equal(I.discipline(fire).disc, 'fire'); assert.equal(I.discipline(hyd).disc, 'hydraulic'); assert.equal(I.discipline(ele).disc, 'electrical'); assert.equal(I.discipline(mech).disc, 'mechanical');
  assert.equal(I.discipline(hyd).fire.hydrant, 3, 'hydrants on the hydraulic sheet are reported');
  assert.equal(I.discipline('', 'H-201 Ground Floor.pdf').disc, 'hydraulic'); assert.equal(I.discipline('', 'FS-101.pdf').disc, 'fire'); assert.equal(I.discipline('', 'E-101.pdf').disc, 'electrical');
  // a combined set: only the fire pages; the hydraulic page with hydrants is flagged
  const s = I.summarise([fire, hyd, ele, mech], 'Combined drawings.pdf');
  assert.equal(s.disc, 'fire'); assert.deepEqual(s.firePages, [0]); assert.deepEqual(s.withFire, [1]); assert.equal(s.pages, 4);
  assert.equal(I.summarise([hyd, ele], 'Services.pdf').disc !== 'fire', true);
});

test('a folder is one project whatever its subfolders; split by subfolder on request; loose files grouped by job code', () => {
  const it = p => ({ path: p, name: p.split('/').pop() });
  const job = ['01 Architectural Drawings/A-101.pdf', '02 Architectural Specification & Schedules/Spec.pdf', '04 Services Drawings & Specs/FS-101.pdf', '09 Reports/FER.pdf', 'contect infor .png'].map(it);
  assert.equal(I.splitTenders('21-ossary-st-mascot-new-build-self-storage', job).length, 1);
  assert.deepEqual(I.subfolders(job).length, 4);
  const T = I.splitTenders('Downloads', ['Hornsby/Fire/FS-101.pdf', 'Hornsby/FER.pdf', 'Lucid/LCE103150-F102.pdf', 'LCE2001-F1.pdf', 'LCE2001-F2.pdf'].map(it), { bySub: true });
  assert.deepEqual(T.map(t => [t.folder, t.items.map(i => i.path)]), [['Downloads/Hornsby', ['Fire/FS-101.pdf', 'FER.pdf']], ['Downloads/Lucid', ['LCE103150-F102.pdf']], ['Downloads', ['LCE2001-F1.pdf', 'LCE2001-F2.pdf']]]);
  assert.deepEqual(I.groupLoose(['LCE103150-F102.pdf', 'LCE103150-F103.pdf', '2405 - Hornsby FS-101.pdf', '2405 - Hornsby FS-102.pdf', 'Tender.eml'].map(it), '').map(g => [g.folder, g.items.length]),
    [['LCE103150', 2], ['2405', 2], ['', 1]]);
  assert.equal(I.jobCode('20261102 scan.pdf'), ''); assert.equal(I.jobCode('2026-11-02 notes.pdf'), ''); assert.equal(I.jobCode('FS-101.pdf'), '');
  assert.equal(I.tenderName('Downloads/2026-11-02 National Storage Hornsby'), 'National Storage Hornsby'); assert.equal(I.tenderName('Downloads · LCE2001'), 'LCE2001');
});

test('numbered folders say what the files are: documents filed, architectural / structural drawings filed without reading, services drawings read', () => {
  const k = p => { const c = I.classify(p); return c.kind + (c.cat ? ':' + c.cat : ''); };
  assert.equal(k('01 Architectural Drawings/A-101 Ground Floor.pdf'), 'doc:DWG');
  assert.equal(k('03 Structural & Civil Documents/S-001.pdf'), 'doc:DWG');
  assert.equal(k('02 Architectural Specification & Schedules/Door Schedule.pdf'), 'doc:SPEC');
  assert.equal(k('04 Services Drawings & Specs/FS-101 Fire Services Ground.pdf'), 'fire');
  assert.equal(k('04 Services Drawings & Specs/Drawing 7.pdf'), 'pdf?');
  assert.equal(k('07 BCA & DDA/BCA Report fire detection.pdf'), 'doc:OTHER');
  assert.equal(k('08 PPR, Prelims & Contract/Prelims.pdf'), 'doc:TENDER');
  assert.equal(k('09 Reports/Fire Engineering Report.pdf'), 'doc:FER');
});

test('the same project again: matched by name or site address', () => {
  const P = [{ id: 'a', name: 'Proposed National Storage, Hornsby', site: '' }, { id: 'b', name: 'Lucid', site: '12 Smith Street, Parramatta NSW 2150' }];
  assert.equal(I.sameProject({ name: 'National Storage Hornsby' }, P).p.id, 'a');
  assert.equal(I.sameProject({ name: 'Lucid Apartments Stage 2', site: '12 Smith St Parramatta' }, P), null);
  assert.equal(I.sameProject({ name: 'Other', site: '12 Smith Street Parramatta NSW 2150' }, P).why, 'site');
  assert.equal(I.sameProject({ name: 'Khartoum Road' }, P), null);
});

test('a folder is one project even with zips inside (site photos are zipped); split by subfolder / zip only on request', () => {
  const it = p => ({ path: p, name: p.split('/').pop() });
  const Q = ['10-king-street-common-area-refurbishment (1).zip', '21-ossary-st-mascot-new-build-self-storage.zip'].map(it);
  assert.equal(I.splitTenders('Quote', Q).length, 1);
  assert.equal(I.splitTenders('21-ossary', ['04 Services/FS-101.pdf', 'Site Photos.zip', 'Specs.zip'].map(it)).length, 1);
  assert.deepEqual(I.splitTenders('Quote', Q, { bySub: true }).map(t => I.tenderName(t.folder)), ['10 King Street Common Area Refurbishment', '21 Ossary St Mascot New Build Self Storage']);
  assert.equal(I.splitTenders('Quote', ['a.zip', 'b.zip', 'notes.txt'].map(it), { bySub: true }).length, 3, 'loose non-zip files stay together');
  assert.equal(I.splitTenders('afterSentDocuments', ['docs0/a.pdf', 'docs1/b.pdf', 'docs10/c.pdf'].map(it)).length, 1);
});
