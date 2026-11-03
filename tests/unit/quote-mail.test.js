// Unit: quote e-mails — boss review / client quote text, compose links, .eml draft with attachment
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../src/mail/quote-mail.js');
const d = { project: 'L4 fit-out', client: 'Acme Builders', contact: 'Jane Smith', clientEmail: 'jane@acme.com.au', site: '17 Khartoum Rd', qno: 'Q-2026-014', date: '2026-11-03', valid: 30, dwg: 'FS-101 B',
  systems: [{ name: 'Automatic Fire Sprinkler System', sell: 139317 }, { name: 'Fire Detection & Alarm System', sell: 18456 }], ex: 157773, gst: 15777, inc: 173550,
  cost: { direct: 120000, prelim: 9000, cont: 5000, margin: 23773, hrs: 420 }, sow: 'Supply and install …', incl: ['Sprinklers to AS 2118.1 (FER cl. 3.3)'], assum: '- Normal hours', excl: ['Builder\'s works', 'Ceilings'],
  rfiOpen: [{ no: 'RFI-001', q: 'Confirm hazard class' }], pending: 3, company: 'FireTake Pty Ltd', sender: 'Wen', bossEmail: 'boss@firetake.com.au', bossName: 'Tom Lee' };

test('boss review e-mail: price by system, internal cost / margin, things to check, open RFIs, scope lists', () => {
  const m = M.bossMail(d);
  assert.equal(m.to, 'boss@firetake.com.au'); assert.match(m.subject, /^For review: Quote Q-2026-014 – L4 fit-out – \$157,773 ex GST$/);
  for (const s of ['Hi Tom,', 'Automatic Fire Sprinkler System', '$139,317', 'INTERNAL', 'Margin $23,773 (15.1% of sell)', 'labour 420 h', '3 take-off items are still unconfirmed', 'RFI-001: Confirm hazard class', 'INCLUSIONS', "Builder's works"]) assert.ok(m.body.includes(s), s);
});

test('client e-mail: total and systems, inclusions / exclusions, validity; never the internal cost or margin', () => {
  const m = M.clientMail(d);
  assert.equal(m.to, 'jane@acme.com.au'); assert.equal(m.subject, 'Quotation Q-2026-014 – L4 fit-out – Fire Services');
  for (const s of ['Dear Jane,', '$157,773 excluding GST ($173,550 including GST)', 'Automatic Fire Sprinkler System: $139,317', 'Sprinklers to AS 2118.1', 'valid for 30 days', 'FireTake Pty Ltd']) assert.ok(m.body.includes(s), s);
  for (const s of ['INTERNAL', 'Margin', 'Direct cost', 'RFI-001', 'unconfirmed']) assert.ok(!m.body.includes(s), 'client e-mail leaks: ' + s);
});

test('compose links and the .eml draft (X-Unsent, UTF-8 subject, PDF attached)', () => {
  const m = { to: 'jane@acme.com.au; tom@acme.com.au', cc: 'boss@firetake.com.au', subject: 'Quotation – 示例', body: 'Line 1\nLine 2' }, L = M.links(m);
  assert.ok(L.gmail.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=')); assert.match(L.gmail, /&su=Quotation/); assert.match(L.outlook365, /^https:\/\/outlook\.office\.com\/mail\/deeplink\/compose\?to=/);
  assert.ok(L.mailto.startsWith('mailto:jane@acme.com.au,tom@acme.com.au?cc=')); assert.match(L.mailto, /body=Line%201%0ALine%202/);
  const e = M.eml(m, [{ name: 'Q-2026-014.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 test') }]);
  assert.match(e, /^To: jane@acme\.com\.au; tom@acme\.com\.au\r\nCc: boss@firetake\.com\.au\r\nSubject: =\?UTF-8\?B\?/); assert.match(e, /\r\nX-Unsent: 1\r\n/);
  assert.match(e, /Content-Disposition: attachment; filename="Q-2026-014\.pdf"/); assert.ok(e.includes(Buffer.from('%PDF-1.4 test').toString('base64')));
  const body = e.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''); assert.equal(Buffer.from(body, 'base64').toString(), 'Line 1\r\nLine 2');
});
