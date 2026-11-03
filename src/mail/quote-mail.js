/* FireTake · quote e-mails: a review e-mail for the boss and the quote e-mail for the client, drafted from the quote

   bossMail(d) / clientMail(d)   → {to, cc, subject, body}   d = quoteData() (see below), built by the app from the open project
   links(m)                      → {gmail, outlook365, outlookcom, mailto}   compose links (text only, no attachments)
   eml(m, attachments)           → an RFC 822 draft (X-Unsent: 1): Outlook / Apple Mail open it as a new message ready to send,
                                    with the quote PDF attached
   quoteData() (in the page)     project, client, quote no., totals by system, cost / margin / hours (internal), scope, inclusions,
                                    assumptions, exclusions, open RFIs, unconfirmed take-off items */
(function(root){
'use strict';
const money=n=>'$'+Math.round(n||0).toLocaleString('en-AU');
const pct=v=>isFinite(v)?(Math.round(v*1000)/10)+'%':'—';
const first=n=>String(n||'').trim().split(/\s+/)[0]||'';
const bullets=(L,max)=>(L||[]).filter(Boolean).slice(0,max||99).map(x=>'  - '+String(x).replace(/^[-•]\s*/,''));

function bossMail(d){const sys=(d.systems||[]).map(s=>`  ${s.name.padEnd(34)} ${money(s.sell)}`);
  const c=d.cost||{}, mp=d.ex?c.margin/d.ex:NaN;
  const warn=[...(d.pending?[`${d.pending} take-off items are still unconfirmed (not priced)`]:[]),...(d.noScale?[`${d.noScale} sheets have no scale (pipe lengths not counted)`]:[]),...(d.warnings||[])];
  const body=[`Hi ${first(d.bossName)||'there'},`,'',`Please review the quote below before it goes to ${d.client||'the client'}.`,'',
    `Project:   ${d.project}${d.site?' — '+d.site:''}`,`Client:    ${d.client||'—'}${d.contact?' (attn '+d.contact+')':''}`,`Quote:     ${d.qno} · ${d.date}${d.valid?' · valid '+d.valid+' days':''}`,...(d.dwg?[`Drawings:  ${d.dwg}`]:[]),'',
    'PRICE (ex GST)',...sys,`  ${'Fire services total'.padEnd(34)} ${money(d.ex)}`,...(d.pf&&d.pf.ex?[`  ${'Passive fire (separate quote)'.padEnd(34)} ${money(d.pf.ex)}`]:[]),`  GST ${money(d.gst)} · inc GST ${money(d.inc)}`,'',
    'INTERNAL — not for the client',`  Direct cost ${money(c.direct)} · prelims ${money(c.prelim)} · contingency ${money(c.cont)}`,`  Margin ${money(c.margin)} (${pct(mp)} of sell) · labour ${Math.round(c.hrs||0)} h${d.programme?' · '+d.programme:''}`,'',
    ...(warn.length?['CHECK BEFORE SENDING',...bullets(warn),'']:[]),
    ...((d.rfiOpen||[]).length?[`OPEN RFIs (${d.rfiOpen.length})`,...bullets(d.rfiOpen.map(r=>`${r.no}: ${r.q}`),10),'']:[]),
    'SCOPE OF WORK',String(d.sow||'').trim()||'  —','',...((d.incl||[]).length?['INCLUSIONS',...bullets(d.incl),'']:[]),
    'ASSUMPTIONS',String(d.assum||'').trim()||'  —','','EXCLUSIONS',...bullets(d.excl),'',
    'The quote PDF is attached. Reply with any changes, or OK to send.','',`Thanks,`,d.sender||''];
  return {to:d.bossEmail||'',cc:'',subject:`For review: Quote ${d.qno} – ${d.project} – ${money(d.ex)} ex GST`,body:body.join('\n')}}

function clientMail(d){const sys=(d.systems||[]).map(s=>`  - ${s.name}: ${money(s.sell)}`);
  const body=[`Dear ${first(d.contact)||'Sir / Madam'},`,'',
    `Thank you for the opportunity to quote the fire services for ${d.project}${d.site?' at '+d.site:''}.`,'',
    `Please find attached our quotation ${d.qno} dated ${d.date}${d.dwg?', based on drawings '+d.dwg:''}.`,'',
    `Our price is ${money(d.ex)} excluding GST (${money(d.inc)} including GST):`,...sys,'',
    ...((d.incl||[]).length?['Our price includes:',...bullets(d.incl,8),'']:[]),
    'Key exclusions:',...bullets(d.excl,8),...((d.excl||[]).length>8?['  - (full list in the attached quotation)']:[]),'',
    `The quotation is valid for ${d.valid||30} days. Please let me know if you have any questions or would like to discuss the scope.`,'',
    'Kind regards,',d.sender||'',...(d.company?[d.company]:[]),...(d.phone?[d.phone]:[]),...(d.email?[d.email]:[])];
  return {to:d.clientEmail||'',cc:d.cc||'',subject:`Quotation ${d.qno} – ${d.project} – Fire Services`,body:body.join('\n')}}

const enc=encodeURIComponent;
function links(m){const q=(o)=>Object.entries(o).filter(([,v])=>v).map(([k,v])=>k+'='+enc(v)).join('&');
  return {gmail:'https://mail.google.com/mail/?view=cm&fs=1&'+q({to:m.to,cc:m.cc,su:m.subject,body:m.body}),
    outlook365:'https://outlook.office.com/mail/deeplink/compose?'+q({to:m.to,cc:m.cc,subject:m.subject,body:m.body}),
    outlookcom:'https://outlook.live.com/mail/0/deeplink/compose?'+q({to:m.to,cc:m.cc,subject:m.subject,body:m.body}),
    mailto:'mailto:'+String(m.to||'').split(/[;,]\s*/).filter(Boolean).map(a=>a.replace(/[^\w.@+-]/g,enc)).join(',')+'?'+q({cc:m.cc,subject:m.subject,body:m.body}).replace(/\+/g,'%20')}}

// base64 of bytes / text (browser and Node)
function b64(bytes){if(typeof Buffer!=='undefined') return Buffer.from(bytes).toString('base64'); let s=''; const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes); for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s)}
const utf8=s=>typeof TextEncoder!=='undefined'?new TextEncoder().encode(s):Buffer.from(s,'utf8');
const wrap=s=>s.replace(/.{1,76}/g,'$&\r\n');
const hdr=s=>/^[\x20-\x7e]*$/.test(s)?s:'=?UTF-8?B?'+b64(utf8(s))+'?=';
// attachments: [{name, type, bytes}]
function eml(m,attachments){const B='----=_FireTake_'+Math.random().toString(36).slice(2), A=attachments||[];
  const head=[`To: ${m.to||''}`,...(m.cc?[`Cc: ${m.cc}`]:[]),`Subject: ${hdr(m.subject||'')}`,'X-Unsent: 1','MIME-Version: 1.0'];
  const text=['Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(b64(utf8(String(m.body||'').replace(/\r?\n/g,'\r\n'))))];
  if(!A.length) return [...head,...text].join('\r\n');
  const parts=[`--${B}`,...text,...A.flatMap(a=>[`--${B}`,`Content-Type: ${a.type||'application/octet-stream'}; name="${hdr(a.name)}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="${hdr(a.name)}"`,'',wrap(b64(a.bytes))]),`--${B}--`,''];
  return [...head,`Content-Type: multipart/mixed; boundary="${B}"`,'',...parts].join('\r\n')}

const NS={bossMail,clientMail,links,eml,money};
root.FT_MAIL=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
