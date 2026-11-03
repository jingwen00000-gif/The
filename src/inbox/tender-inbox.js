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
const DOCDIR=/(^|\/)[\d\s._-]*[^/]*\b(reports?|bca|dda|access|ppr|prelim\w*|contracts?|specs?|specifications?|schedules?|other\s+documents?|vertical\s+transport|elevators?|lifts?|town\s+planning|geotech\w*|surveys?|photos?|correspondence)\b[^/]*\//i;
const DOCDIR_CAT=d=>/spec/i.test(d)?'SPEC':/prelim|contract|ppr|schedule/i.test(d)?'TENDER':'OTHER';
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
  // a PDF in a documents folder (not a drawings folder) is a document: '09 Reports/BCA Report - fire detection.pdf'
  {const dirs=p.split('/').slice(0,-1), d=dirs.find(x=>DOCDIR.test(x+'/')&&!/drawing|dwg|plans?\b|services/i.test(x)); if(d&&!/(^|[\d\s._-])fire/i.test(d)) return {kind:'doc',cat:DOCDIR_CAT(d)}}
  if(FIRE.test(n)||/(^|\/)[\d\s._-]*fire[^/]*\//i.test(low)) return {kind:'fire'};
  // a drawing in an architectural / structural / civil / landscape folder: filed without reading every page (large sets)
  if(!FIRE.test(n)&&p.split('/').slice(0,-1).some(x=>/^[\d\s._-]*(arch|architect\w*|struct\w*|civil|landscape)\b/i.test(x)&&!/services|fire/i.test(x))) return {kind:'doc',cat:'DWG'};
  if(TENDERDOC.test(n)) return {kind:'doc',cat:'TENDER'};
  if(ARCH.test(n)||/(^|\/)[\d\s._-]*(arch|architect|struct|mech|elec|hydr|civil|drawings?)[^/]*\//i.test(low)) return {kind:'dwg',cat:'DWG'};
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
  out.name=tenderName(info.folder); if(out.name) out.sources.name='folder';
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

/* ---- which service a drawing sheet is ----
   discipline(text, name) → {disc, score, fire:{device: count}, fireCount, why}
   disc: fire | hydraulic | electrical | mechanical | architectural | structural | civil | other
   Strong clues: the title block's heading (FIRE SERVICES / HYDRAULIC SERVICES …) and the drawing number prefix (FS-101, H-201, E-101 …);
   weaker: what is drawn and labelled (sprinklers, hydrants vs basins, sewer; lights, GPOs; ducts, diffusers). fire lists the fire
   devices named on the sheet, so a hydraulic sheet with hydrants or an electrical sheet with smoke detectors can be flagged. */
// [discipline, sheet title (the service heading a title: 'PROPOSED FIRE SERVICES LEVEL 2 ARRANGEMENT', 'MECHANICAL SERVICES LAYOUT'), a bare mention
//  ('… SERVICES' in the title block or the notes — notes name the other trades all the time, so it weighs little), drawing number prefix]
const DISC=[
  ['fire',/(?:FIRE\s+(?:SERVICES|PROTECTION|SPRINKLER|HYDRANT|DETECTION)|(?:WET|DRY)\s+FIRE|SPRINKLER|FIRE\s+&\s+EWIS)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/FIRE\s+(?:SERVICES|PROTECTION)/g,/(^|[^A-Z0-9])(FS|FP|FSD|FH|FD|F)[-_ ]?\d{2,4}/],
  ['hydraulic',/(?:HYDRAULIC|PLUMBING|DRAINAGE|SANITARY|STORMWATER|SEWER(?:AGE)?)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/HYDRAULIC\s+SERVICES/g,/(^|[^A-Z0-9])(H|HY|HYD|P)[-_ ]?\d{2,4}/],
  ['electrical',/(?:ELECTRICAL|LIGHTING|POWER|COMMUNICATIONS?|SECURITY)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/ELECTRICAL\s+SERVICES/g,/(^|[^A-Z0-9])(E|EL|ELE)[-_ ]?\d{2,4}/],
  ['mechanical',/(?:MECHANICAL|HVAC|AIR[-\s]CONDITIONING|VENTILATION)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/MECHANICAL\s+SERVICES/g,/(^|[^A-Z0-9])(M|ME|MECH)[-_ ]?\d{2,4}/],
  ['architectural',/(?:ARCHITECTURAL|GENERAL\s+ARRANGEMENT|REFLECTED\s+CEILING)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/ARCHITECT/g,/(^|[^A-Z0-9])(A|AR|ARC|DA)[-_ ]?\d{2,4}/],
  ['structural',/(?:STRUCTURAL|FOOTING|SLAB|REINFORCEMENT)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/STRUCTURAL\s+ENGINEER/g,/(^|[^A-Z0-9])(S|ST|STR)[-_ ]?\d{2,4}/],
  ['civil',/(?:CIVIL|BULK\s+EARTHWORKS|SITEWORKS|ROAD)(?:SERVICES\s+)?[^\n]{0,40}?(?:LAYOUT|PLAN|ARRANGEMENT|SCHEMATIC|DETAILS?|COVER|LEGEND|NOTES|SECTIONS?|ELEVATIONS?)/g,/CIVIL\s+ENGINEER/g,/(^|[^A-Z0-9])(C|CV|CIV)[-_ ]?\d{2,4}/]];
const WORDS={
  fire:{sprinkler:/SPRINKLER|\bSPK\b|PENDENT|PENDANT|UPRIGHT\s+HEAD/g,hydrant:/HYDRANT/g,hosereel:/HOSE\s*REEL/g,detector:/SMOKE\s+DETECTOR|HEAT\s+DETECTOR|THERMAL\s+DETECTOR|\bVESDA\b|ASPIRAT/g,
    ewis:/\bEWIS\b|OCCUPANT\s+WARNING|\bSPEAKER\b|STROBE/g,fip:/\bFIP\b|FDCIE|FIRE\s+INDICATOR/g,booster:/BOOSTER|FIRE\s+PUMP|JOCKEY/g,extinguisher:/EXTINGUISHER|FIRE\s+BLANKET/g},
  hydraulic:/SEWER|STORMWATER|\bSW\b|HOT\s+WATER|COLD\s+WATER|\bHWU\b|\bTMV\b|\bWC\b|BASIN|SINK|FLOOR\s+WASTE|DOWNPIPE|GAS\s+(METER|LINE|PIPE)|GREASE\s+ARRESTOR|BACKFLOW/g,
  electrical:/\bGPO\b|LIGHT(ING)?\s+FITTING|LUMINAIRE|SWITCHBOARD|\bDB[-\s]?\d|\bMSB\b|DATA\s+OUTLET|\bLED\b|DOWNLIGHT|EXIT\s+SIGN|EMERGENCY\s+LIGHT/g,
  mechanical:/\bDUCT|DIFFUSER|\bAHU\b|\bFCU\b|\bVAV\b|EXHAUST\s+FAN|SUPPLY\s+AIR|RETURN\s+AIR|OUTSIDE\s+AIR|CONDENSER|SPLIT\s+SYSTEM|FIRE\s+DAMPER|\bGRILLE/g};
const LABEL={fire:'消防',hydraulic:'给排水',electrical:'电气',mechanical:'机械 / 空调',architectural:'建筑',structural:'结构',civil:'土建 / 市政',other:'其他'};
function discipline(text,name){const T=String(text||'').toUpperCase(), N=String(name||'').toUpperCase().replace(/\.PDF$/,''); const sc={}, why=[];
  for(const [d,title,bare,num] of DISC){const t=(T.match(title)||[]).length, m=(T.match(bare)||[]).length; if(t){sc[d]=(sc[d]||0)+6+Math.min(1,t-1)*2; why.push(d+':title')} else if(m){sc[d]=(sc[d]||0)+2; why.push(d+':mention')} if(num.test(N)){sc[d]=(sc[d]||0)+5; why.push(d+':number')}}
  const fire={}; let fc=0; for(const [k,re] of Object.entries(WORDS.fire)){const n=(T.match(re)||[]).length; if(n){fire[k]=n; fc+=n}}
  sc.fire=(sc.fire||0)+Math.min(8,fc*.5);
  for(const d of ['hydraulic','electrical','mechanical']){const n=(T.match(WORDS[d])||[]).length; if(n) sc[d]=(sc[d]||0)+Math.min(8,n*.5)}
  const best=Object.entries(sc).sort((a,b)=>b[1]-a[1])[0]; const disc=best&&best[1]>=2?best[0]:'other';
  return {disc,label:LABEL[disc],score:best?Math.round(best[1]*10)/10:0,fire,fireCount:fc,why}}
// a drawing set (pages) → which pages are fire services, which carry fire devices on another service's sheet
function summarise(pages,name){const P=pages.map((t,i)=>({i,...discipline(t,pages.length===1?name:'')}));
  const firePages=P.filter(p=>p.disc==='fire').map(p=>p.i), withFire=P.filter(p=>p.disc!=='fire'&&p.fireCount>=3).map(p=>p.i);
  const all=discipline(pages.join('\n'),name), counts={}; P.forEach(p=>counts[p.disc]=(counts[p.disc]||0)+1);
  const fire={}; for(const p of P) for(const [k,n] of Object.entries(p.fire)) fire[k]=(fire[k]||0)+n;
  const disc=firePages.length?'fire':((Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||['other'])[0]);
  return {disc,label:LABEL[disc],pages:P.length,firePages,withFire,counts,fire,all}}


/* ---- a contact card: an e-mail signature / business card as text (typed, or read from a screenshot) ----
   parseContact(text, {ownDomain}) → {contact, role, client, email, phone, mobile, office}
   'ALEX MORGAN / ESTIMATING MANAGER / T +61 2 9000 1234 / M +61 400 111 222 / E a.morgan@buildco.com.au / A Headquarters, …'
   → Alex Morgan, Estimating Manager, Buildco, a.morgan@buildco.com.au, +61 400 111 222 (mobile), +61 2 9000 1234 */
const ROLE=/\b(manager|estimator|estimating|director|coordinator|co-ordinator|engineer|supervisor|administrator|officer|lead|head|principal|partner|associate|procurement|contracts?|project|site|construction|commercial|senior|junior|assistant|cadet|foreman|ceo|coo|cfo|gm)\b/i;
const FREEMAIL=/^(gmail|outlook|hotmail|bigpond|yahoo|icloud|live|optusnet|me|msn|protonmail)$/i;
// an Australian number written the usual way: +61 400 111 222, +61 2 9000 1234, 0400 111 222, 02 9000 1234, 1300 123 456
function auPhone(x){const d=String(x||'').replace(/[^\d+]/g,''), n=d.replace(/^\+/,'');
  let m; if((m=n.match(/^61(4\d{2})(\d{3})(\d{3})$/))) return `+61 ${m[1]} ${m[2]} ${m[3]}`; if((m=n.match(/^61([2378])(\d{4})(\d{4})$/))) return `+61 ${m[1]} ${m[2]} ${m[3]}`;
  if((m=n.match(/^(04\d{2})(\d{3})(\d{3})$/))) return `${m[1]} ${m[2]} ${m[3]}`; if((m=n.match(/^(0[2378])(\d{4})(\d{4})$/))) return `${m[1]} ${m[2]} ${m[3]}`; if((m=n.match(/^(1[38]00)(\d{3})(\d{3})$/))) return `${m[1]} ${m[2]} ${m[3]}`;
  return String(x||'').trim()}
function parseContact(text,opt){opt=opt||{}; const own=String(opt.ownDomain||'').toLowerCase();
  const raw=String(text||'').replace(/\r/g,''), L=raw.split('\n').map(l=>l.replace(/[|•·]+/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const out={contact:'',role:'',client:'',email:'',phone:'',mobile:'',office:''};
  const emails=[...raw.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map(m=>m[0].toLowerCase()).filter(e=>!own||!e.endsWith('@'+own));
  out.email=emails[0]||'';
  const ph=re=>{for(const l of L){const m=l.match(re); if(m){const n=(l.slice(m.index+m[0].length).match(/\+?[\d()][\d ()-]{7,}\d/)||[])[0]; if(n) return n.replace(/\s+/g,' ').trim()}} return ''};
  out.mobile=ph(/^(?:M|Mob(?:ile)?|Cell)\b\.?\s*:?/i); out.phone=ph(/^(?:T|P|Ph(?:one)?|Tel(?:ephone)?|Office|Direct|D)\b\.?\s*:?/i);
  if(!out.mobile){const m=raw.match(/(?:\+?61\s?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}/); if(m) out.mobile=m[0].trim()}
  if(!out.phone){const m=raw.match(PHONE); if(m&&m[0].trim()!==out.mobile) out.phone=m[0].trim()}
  out.mobile=auPhone(out.mobile); out.phone=auPhone(out.phone); if(out.phone===out.mobile) out.phone='';
  const addr=L.find(l=>/^(?:A|Address|Add)\b\.?\s*:?\s+\S/i.test(l)); if(addr) out.office=addr.replace(/^(?:A|Address|Add)\b\.?\s*:?\s*/i,'');
  // the person: the first short line of words only (2–4 words), not a role, not a firm, before the phone lines
  const isName=l=>/^[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){1,3}$/.test(l)&&!ROLE.test(l)&&!FIRMRE.test(l)&&!/\b(regards|thanks|cheers|kind|best|sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|office|hq|headquarters)\b/i.test(l);
  const iName=L.findIndex(isName); if(iName>=0){out.contact=title(L[iName]).replace(/\bMc([a-z])/g,(m,c)=>'Mc'+c.toUpperCase()); const r=L[iName+1]; if(r&&ROLE.test(r)&&r.length<60) out.role=title(r)}
  // the firm: a line ending in a firm word, else the e-mail / web domain (a logo word equal to the domain confirms it)
  const firm=L.map(l=>(l.match(FIRMRE)||[])[1]).find(Boolean);
  const dom=(out.email.split('@')[1]||(raw.match(/\b(?:www\.)?([a-z0-9-]+)\.(?:com|net|org)(?:\.au)?\b/i)||[])[1]||'').split('.')[0];
  out.client=firm?firm.trim():(dom&&!FREEMAIL.test(dom)?(L.find(l=>l.replace(/\s+/g,'').toLowerCase()===dom.toLowerCase())?title(dom):title(dom.replace(/[-_]+/g,' '))):'');
  return out}
// a file that holds the client's contact details: 'contact info.png', 'contect infor .png', 'Client details.txt', '联系人.jpg'
const isContactFile=n=>/conta?c?e?ct|联系|client[\s_-]*(details?|info)|signature|business[\s_-]*card/i.test(String(n||''));
/* ---- several tenders at once ---- */
const NS_EXTRA={};
// a folder that sorts one tender's files (Fire, Drawings, Specs, 01 Architectural …) rather than being a tender of its own
const CAT_DIR=/^(?:fire(?:\s+(?:services?|protection|drawings?))?|fs|drawings?|dwgs?|plans?|pdfs?|cad|specs?|specifications?|documents?|docs?|tender(?:\s+(?:documents?|docs?|drawings?))?|itt|rft|rfq|architectur(?:al|e)|arch|hydraulics?|hyd|plumbing|electrical|elec|mechanical|mech|hvac|structural|struct|civil|services|consultants?|reports?|fer|bca|ncc|addend(?:a|um)(?:\s*\d+)?|rev(?:ision)?s?(?:\s*[a-z0-9]+)?|issued?(?:\s+for\s+\w+)?|for\s+tender|transmittals?|emails?|correspondence|scope|schedules?|bom|boq|photos?|images?|old|superseded|archive|misc|other|general|landscape|civil\s+&\s+structural|survey|geotech(?:nical)?|town\s+planning|da|cc|ifc)$/i;
function isCategoryFolder(n){return CAT_DIR.test(String(n||'').replace(/^[\s\d._-]*(?=[a-z])/i,'').replace(/[_]+/g,' ').trim())}
// a job / project code at the start of a file name: 'LCE103150-F102.pdf' → LCE103150, '2405 - Hornsby FS-101.pdf' → 2405 (dates are not codes)
function jobCode(name){const b=String(name||'').split('/').pop().replace(/\.[a-z0-9]+$/i,''); const m=b.match(/^([A-Z]{0,5}\d{4,7}[A-Z]?)(?=$|[\s_.-])/i);
  if(!m) return ''; const c=m[1].toUpperCase(); if(/^(19|20)\d{6}$/.test(c)||/^(19|20)\d{2}$/.test(c)&&/^\d{4}[-_.]\d{2}[-_.]\d{2}/.test(b)) return ''; return c}
// loose files (no folder of their own): one group per job code; files without a code (the e-mail, the FER) join the only group, or a group of their own
// a downloaded tender zip's name as a tender name: '10-king-street-common-area-refurbishment (1).zip' → '10-king-street-common-area-refurbishment'
const zipName=n=>String(n||'').split('/').pop().replace(/\.zip$/i,'').replace(/\s*\((\d+|copy)\)\s*$/i,'').trim();
const isZip=it=>/\.zip$/i.test(it.name||it.path||'');
function groupLoose(items,label){const zips=items.filter(isZip);
  // several downloaded zips side by side: each zip is one tender (the platforms send one zip per job)
  if(zips.length>1){const rest=items.filter(i=>!isZip(i)); const out=zips.map(z=>({folder:(label?label+'/':'')+zipName(z.name),items:[z]}));
    return out.concat(rest.length?groupLoose(rest,label):[])}
  const by=new Map(), none=[]; for(const it of items){const c=jobCode(it.name); if(c){if(!by.has(c)) by.set(c,[]); by.get(c).push(it)} else none.push(it)}
  const codes=[...by.keys()].filter(c=>by.get(c).length>1||!none.length||by.size===1);
  if(codes.length<=1) return items.length?[{folder:(codes[0]&&label?label+' · '+codes[0]:label||codes[0]||''),items}]:[];
  const out=codes.map(c=>({folder:label?label+' · '+c:c,items:by.get(c)})); const rest=none.concat([...by.keys()].filter(c=>!codes.includes(c)).flatMap(c=>by.get(c)));
  if(rest.length) out.push({folder:label||'',items:rest,loose:true}); return out}
// one picked / inbox folder → the tenders in it. items: [{path relative to the folder, name, …}]
// A folder is always one project, whatever is inside: subfolders (01 Architectural Drawings, 09 Reports …) and zips
// (site photos are often zipped) are that project's files. opt.bySub (the review's 分开 button, used only on request)
// makes one tender per subfolder and per zip at the top of the folder.
function subfolders(items){const S=new Set(); for(const it of items){const i=it.path.indexOf('/'); if(i>0) S.add(it.path.slice(0,i))} return [...S]}
function splitParts(items){return subfolders(items).length+items.filter(i=>!i.path.includes('/')&&isZip(i)).length}
function splitTenders(folder,items,opt){opt=opt||{}; if(!opt.bySub||splitParts(items)<2) return [{folder,items}];
  const join=s=>folder?folder+'/'+s:s, loose=items.filter(i=>!i.path.includes('/')), zips=loose.filter(isZip), rest=loose.filter(i=>!isZip(i));
  const out=subfolders(items).map(s=>({folder:join(s),items:items.filter(i=>i.path.startsWith(s+'/')).map(i=>({...i,path:i.path.slice(s.length+1)}))}))
    .concat(zips.map(z=>({folder:join(zipName(z.name)),items:[z]})));
  return rest.length?out.concat([{folder,items:rest}]):out}
NS_EXTRA.zipName=zipName; NS_EXTRA.subfolders=subfolders; NS_EXTRA.splitParts=splitParts;
// the last part of a tender's folder key, as its name
function tenderName(folder){let n=cleanFolder(String(folder||'').split('/').pop().split(' · ').pop());
  // a platform's file-style name: '21-ossary-st-mascot-new-build-self-storage' → '21 Ossary St Mascot New Build Self Storage'
  if(!/\s/.test(n)&&/[a-z]-[a-z]/i.test(n)&&n===n.toLowerCase()) n=n.replace(/-+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
  return n}
// an existing project that looks like this tender (same name or same site address)
const norm=s=>String(s||'').toLowerCase().replace(/\b(the|project|proposed|new|development|fire services?|tender|stage \d+)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
function sameProject(info,projects){const n=norm(info&&info.name), st=norm(info&&info.site);
  for(const p of projects||[]){const pn=norm(p.name), ps=norm(p.site);
    if(n&&pn&&(n===pn||(n.length>=8&&pn.length>=8&&(n.includes(pn)||pn.includes(n))))) return {p,why:'name'};
    if(st&&ps&&st.length>=8&&(st===ps||st.includes(ps)&&ps.length>=8||ps.includes(st))) return {p,why:'site'}}
  return null}
const NS={classify,pageLooksFire,parseEml,extract,cleanFolder,cleanSubject,discipline,summarise,LABEL,isCategoryFolder,jobCode,groupLoose,splitTenders,tenderName,sameProject,parseContact,isContactFile,...NS_EXTRA};
root.FT_INBOX=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
