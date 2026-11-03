/* Strix FireTake · tender inbox: a downloaded tender folder → a new project

   The estimator saves each tender into its own subfolder (unzipped or as the downloaded .zip). For a folder:
     classify(path)              fire drawing / other drawing / FER / specification / addendum / e-mail / tender document / skip
     parseEml(text)              the tender e-mail (.eml): from, to, subject, date, plain-text body
     extract(info)               project name, site address, client, contact, e-mail, phone, tender close — from the folder name,
                                 the e-mails and the fire drawings' title-block text
   The page part (scan, review dialog, import) is in the app; nothing in the folder is ever changed or deleted. */
(function(root){
'use strict';
const FIRE=/(^|[^a-z])(fs|fp|fsd|fh|fire)[-_ ]?\d{2,4}|(^|[^a-z])f[-_ ]?\d{3}([^\d]|$)|fire[\s_-]*(services?|protection|sprinkler|hydrant|detection|alarm)|sprinkler|hydrant|hose[\s_-]*reel|detection|\bewis\b|\bfip\b|smoke[\s_-]*detect/i;
const ARCH=/(^|[^a-z])(a|ar|arch|s|st|m|e|h|hy|c|l)[-_ ]?\d{2,4}([^\d]|$)|architect|structur|mechanical|electrical|hydraulic(?!.*fire)|civil|landscape|plans?\b|elevation|section/i;
const TENDERDOC=/tender|rft|rfq|request[\s_-]*for|conditions|schedule|scope|trade[\s_-]*package|price[\s_-]*schedule|bill[\s_-]*of|boq|form|invitation|itt|instructions?/i;
const SKIPRE=/(^|\/)(\.|~\$|thumbs\.db$|desktop\.ini$|__macosx\/)/i;
const ext=n=>(String(n).match(/\.([a-z0-9]{1,5})$/i)||[,''])[1].toLowerCase();

// → {kind:'fire'|'dwg'|'doc'|'email'|'zip'|'skip'|'pdf?', cat}  (cat: the tender-docs category; 'pdf?' = look at the first page)
function classify(path){const p=String(path||''), n=p.split('/').pop(), e=ext(n), low=p.toLowerCase();
  if(SKIPRE.test(p)||!e) return {kind:'skip'};
  if(e==='zip') return {kind:'zip'};
  if(e==='eml'||e==='msg') return {kind:'email',cat:'EMAIL'};
  if(/^(dwg|dxf|rvt|ifc)$/.test(e)) return {kind:'doc',cat:'DWG'};
  if(/^(xlsx|xls|csv)$/.test(e)) return {kind:'doc',cat:/spec/i.test(n)?'SPEC':'TENDER'};
  if(/^(docx|doc|rtf|txt)$/.test(e)) return {kind:'doc',cat:/\bfer\b|fire[\s_-]*eng/i.test(n)?'FER':/spec/i.test(n)?'SPEC':/addend/i.test(n)?'ADD':'TENDER'};
  if(/^(png|jpe?g|tiff?|bmp|heic)$/.test(e)) return {kind:'doc',cat:'OTHER'};
  if(e!=='pdf') return {kind:'doc',cat:'OTHER'};
  if(/\bfer\b|fire[\s_-]*eng(ineer(ing)?)?[\s_-]*(report|brief)|performance[\s_-]*solution/i.test(n)) return {kind:'doc',cat:'FER'};
  if(/spec/i.test(n)) return {kind:'doc',cat:'SPEC'};
  if(/addend/i.test(n)) return {kind:'doc',cat:'ADD'};
  if(FIRE.test(n)||/(^|\/)fire[^/]*\//i.test(low)) return {kind:'fire'};
  if(TENDERDOC.test(n)) return {kind:'doc',cat:'TENDER'};
  if(ARCH.test(n)||/(^|\/)(arch|architect|struct|mech|elec|hydr|civil|drawings?)[^/]*\//i.test(low)) return {kind:'dwg',cat:'DWG'};
  return {kind:'pdf?'}}
// a PDF whose first page reads like a fire services drawing
function pageLooksFire(text){return /FIRE\s+(SERVICES|PROTECTION)|SPRINKLER|HYDRANT|HOSE\s*REEL|FIRE\s+DETECTION|OCCUPANT\s+WARNING|\bEWIS\b|\bFIP\b/i.test(String(text||''))}

/* ---- e-mail ---- */
function decodeQP(s){return s.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(m,h)=>String.fromCharCode(parseInt(h,16)))}
function utf8(bin){try{return decodeURIComponent(escape(bin))}catch(e){return bin}}
function decodeWord(s){return String(s||'').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,(m,cs,enc,t)=>{try{const bin=enc.toUpperCase()==='B'?(typeof atob!=='undefined'?atob(t):Buffer.from(t,'base64').toString('binary')):decodeQP(t.replace(/_/g,' ')); return /utf-?8/i.test(cs)?utf8(bin):bin}catch(e){return t}})}
function b64bin(t){t=t.replace(/\s+/g,''); return typeof atob!=='undefined'?atob(t):Buffer.from(t,'base64').toString('binary')}
function headers(block){const H={}; String(block).replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/).forEach(l=>{const m=l.match(/^([\w-]+):\s*(.*)$/); if(m) H[m[1].toLowerCase()]=m[2]}); return H}
const addr=s=>{s=decodeWord(s||''); const m=s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/); return m?{name:m[1].trim(),email:m[2].trim().toLowerCase()}:{name:'',email:(s.match(/[\w.+-]+@[\w.-]+/)||[''])[0].toLowerCase()}};
function bodyOf(raw,H){const ct=H['content-type']||'text/plain', te=(H['content-transfer-encoding']||'').toLowerCase();
  const bm=ct.match(/boundary="?([^";]+)"?/i);
  if(/multipart/i.test(ct)&&bm){const parts=raw.split('--'+bm[1]); let html='';
    for(const part of parts){const i=part.search(/\r?\n\r?\n/); if(i<0) continue; const h=headers(part.slice(0,i)), b=part.slice(i).replace(/^\s+/,'');
      if(/multipart/i.test(h['content-type']||'')){const t=bodyOf(b,h); if(t) return t; continue}
      if(/attachment/i.test(h['content-disposition']||'')) continue;
      const t=bodyOf(b,h); if(/text\/plain/i.test(h['content-type']||'')) return t; if(/text\/html/i.test(h['content-type']||'')&&!html) html=t}
    return html}
  let t=raw; if(te==='base64') t=b64bin(t); else if(te==='quoted-printable') t=decodeQP(t);
  if(/charset="?utf-?8/i.test(ct)||te==='base64'||te==='quoted-printable') t=utf8(t);
  if(/text\/html/i.test(ct)) t=t.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/[ \t]+/g,' ');
  return t.trim()}
function parseEml(text){const s=String(text||''), i=s.search(/\r?\n\r?\n/); if(i<0) return null; const H=headers(s.slice(0,i));
  return {from:addr(H.from),to:addr(H.to),cc:H.cc||'',subject:decodeWord(H.subject||'').trim(),date:H.date||'',body:bodyOf(s.slice(i).replace(/^\s+/,''),H)}}

/* ---- what the folder says about the project ---- */
const ADDR=/\b\d{1,5}[A-Z]?(?:\s?[-–]\s?\d{1,5}[A-Z]?)?\s+(?:[A-Z][A-Za-z']+\s){1,4}(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Parade|Pde|Highway|Hwy|Place|Pl|Court|Ct|Boulevard|Blvd|Way|Crescent|Cres|Terrace|Tce|Circuit|Cct|Close|Cl)\b\.?,?\s+(?:[A-Z][A-Za-z']+\s){0,3}(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s?\d{4}/i;
const PHONE=/(?:\+?61\s?|0)(?:4\d{2}\s?\d{3}\s?\d{3}|[2378]\s?\d{4}\s?\d{4})|\(0[2378]\)\s?\d{4}\s?\d{4}|1[38]00\s?\d{3}\s?\d{3}/;
const FIRMRE=/^([A-Z][\w&.,' -]{2,60}(?:Pty\.?\s*Ltd\.?|Limited|Group|Constructions?|Builders?|Building|Projects|Developments?|Contracting|Contractors?|Interiors|Fitouts?))\.?\s*$/;   /* a whole signature line ending in a firm word */
const CLOSE=/(tender|quot(?:e|ation)s?|submissions?|pricing|rfq|rft)[^.\n]{0,40}?(clos(?:e|es|ing)|due|by|deadline|submit)[^.\n]{0,25}?((?:\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?)|(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{2,4})?))/i;
const title=s=>String(s||'').toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
function cleanFolder(n){return String(n||'').replace(/[_]+/g,' ').replace(/^\s*(\d{4}[-.]\d{2}[-.]\d{2}|\d{6,8}|\d{1,2}[-.]\d{1,2}[-.]\d{2,4})\s*[-–:]?\s*/,'').replace(/\s*\((\d+|copy)\)$/i,'').replace(/\s+/g,' ').trim()}
function cleanSubject(s){return String(s||'').replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i,'').replace(/^\s*(tender|invitation to tender|itt|rfq|rft|request for (quote|quotation|tender)|quote request|pricing request)\s*[-–:|]\s*/i,'').replace(/\s*[-–|]\s*(fire services?|fire protection|fire)\s*$/i,'').trim()}
// info: {folder, emails:[parsed], texts:[drawing / document text], ownDomain: our company's e-mail domain (skipped as a sender)}
function extract(info){info=info||{}; const out={name:'',site:'',client:'',contact:'',email:'',phone:'',closes:'',sources:{}};
  const mails=(info.emails||[]).filter(Boolean).filter(m=>m.from&&m.from.email&&(!info.ownDomain||!m.from.email.endsWith('@'+info.ownDomain)));
  const m=mails[0]||null;
  out.name=cleanFolder(info.folder); if(out.name) out.sources.name='folder';
  if(!out.name&&m&&m.subject){out.name=cleanSubject(m.subject); out.sources.name='e-mail subject'}
  if(m){out.contact=m.from.name||''; out.email=m.from.email; out.sources.contact='e-mail';
    const body=String(m.body||''), sig=body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const firm=sig.map(l=>(l.match(FIRMRE)||[])[1]).find(Boolean);
    const dom=(m.from.email.split('@')[1]||'').split('.')[0];
    out.client=firm?firm.trim():(dom&&!/^(gmail|outlook|hotmail|bigpond|yahoo|icloud|live|optusnet)$/i.test(dom)?title(dom):'');
    const ph=body.match(PHONE); if(ph) out.phone=ph[0].replace(/\s+/g,' ').trim()}
  const texts=[...(info.texts||[]),...mails.map(x=>x.subject+'\n'+x.body)];
  // the site, not an office: an address after PROJECT / SITE / ADDRESS wins; one after 'Level 6,' or before a phone / e-mail is somebody's office
  let best=null; for(const t of texts){const T=String(t); for(const a of T.matchAll(new RegExp(ADDR.source,'gi'))){const before=T.slice(Math.max(0,a.index-160),a.index), after=T.slice(a.index+a[0].length,a.index+a[0].length+60);
      let sc=0; if(/(PROJECT|SITE|ADDRESS|LOCATION|PREMISES|PROPERTY)\b[^]*$/i.test(before.slice(-160))) sc+=3; if(/(LEVEL|SUITE|UNIT|PO\s*BOX)\s*\d+[A-Z]?\s*,?\s*$/i.test(before)) sc-=3; if(/^\s*(P(h|hone)?|T(el)?|M(ob)?|E(mail)?|F(ax)?)\s*[:.]|www\.|@/i.test(after)) sc-=3;
      if(!best||sc>best.sc) best={sc,v:a[0]}}}
  if(best&&best.sc>-3){out.site=best.v.replace(/\s+/g,' ').replace(/\s,/g,',').trim(); out.sources.site='text'}
  for(const t of texts){const c=String(t).match(CLOSE); if(c){out.closes=c[3].trim(); break}}
  return out}

const NS={classify,pageLooksFire,parseEml,extract,cleanFolder,cleanSubject};
root.FT_INBOX=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
