/* Strix FireTake · reading a drawing sheet's title block (Drawing Intelligence)
   readSheet(texts, page, opt) → {dwg, rev, title, type, level, levels, times, listed}
     texts: [{s, x, y, h}] — the page's text with positions (pdf.js text content in viewport units, y down); page: {w, h}
     opt.name: the file name (a fallback for the drawing number)
     type: cover | legend | notes | schematic | detail | plan     (only plans are counted)
     level: 'B2' 'LG' 'G' 'UG' 'M' 'L3' 'Roof' …; levels / times: a typical floor covering several levels ('LEVEL 2–8 TYPICAL' → L2–L8, ×7)
     listed: drawing numbers a cover / drawing list names (to find missing sheets)
   register(sheets) → {rows, missing:[dwg], older:[{page, dwg, rev, newer}], duplicates:[…]}
   Title blocks put each value under (or beside) its label — DRAWING NO. / REV / TITLE — the value larger than the label. */
(function(root){
'use strict';
const U=s=>String(s||'').toUpperCase();
const DWG_RE=/\b(?:[A-Z]{1,6}\d{0,7}[-_ ])?[A-Z]{1,4}[-_ ]?\d{1,2}[-_.]?\d{0,3}[A-Z]?\b|\b[A-Z]{1,4}\d{3,4}\b|\b\d{3,6}[-_][A-Z]{1,4}[-_]?\d{2,4}\b/;
const POSTCODE=/^(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4}$/i;
const looksDwg=s=>{s=String(s||'').trim(); return !POSTCODE.test(s)&&s.length>=3&&s.length<=24&&/\d/.test(s)&&/[A-Z]/i.test(s)&&!/\s{2,}/.test(s)&&!/^(SCALE|1:|A[0-4]$|NTS|REV)/i.test(s)&&!/^\d+(\.\d+)*$/.test(s)&&!/\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(s)&&!/@|www\.|\.com/i.test(s)&&!/^[A-Z]\d?$/i.test(s)};
const looksRev=s=>/^[A-Z]{0,2}\d{0,3}$/i.test(String(s||'').trim())&&String(s).trim().length>=1&&String(s).trim().length<=4;
const LAB={dwg:/^(DRAWING|DWG|DRG)\.?\s*(NO|NUMBER|NUM)\.?:?$|^(SHEET)\s*(NO|NUMBER)\.?:?$|^DRAWING\s*NO\.?\s*:?$/,
  rev:/^(REV|REVISION|REV'?N|ISSUE)\.?:?$/, title:/^(DRAWING\s*TITLE|TITLE|DRAWING|SHEET\s*TITLE)\.?:?$/};
// the value of a label: the nearest text below it in its column (or just right of it on its line), larger than the label
function valueOf(T,l,ok,opt){opt=opt||{};
  const below=T.filter(t=>t!==l&&t.y>l.y+l.h*.3&&t.y-l.y<Math.max(60,l.h*7)&&t.x>=l.x-l.h*3&&t.x<=l.x+(opt.wide||l.h*14)&&ok(t.s)).sort((a,b)=>(a.y-b.y)||(b.h-a.h));
  const right=T.filter(t=>t!==l&&Math.abs(t.y-l.y)<l.h*.8&&t.x>l.x&&t.x-l.x<l.h*25&&ok(t.s)).sort((a,b)=>a.x-b.x);
  const big=below.filter(t=>t.h>=l.h*1.15);
  return big[0]||below[0]||right[0]||null}
const REV_RANK={P:1,D:1,S:1,X:1,T:2,A:3,B:3,C:4,F:5};
function revKey(r){const m=/^([A-Z]*)(\d*)$/i.exec(String(r||'').trim().toUpperCase()); if(!m) return [0,0,'']; const p=m[1], n=+m[2]||0;
  // P1…P4 preliminary < T1 tender < A, B, C … construction; a bare letter sequence A < B < C; bare numbers 01 < 02
  return [p.length===1&&n?REV_RANK[p]||2:p?3:2, p.length===1&&!n?p.charCodeAt(0):n, p]}
const revCmp=(a,b)=>{const A=revKey(a), B=revKey(b); return A[0]-B[0]||A[1]-B[1]||String(A[2]).localeCompare(B[2])};
// the level a title names
function levelOf(title){const t=U(title).replace(/[–—]/g,'-');
  const rng=t.match(/(?:LEVELS?|\bL)\s*(\d{1,2})\s*(?:-|TO|&|\/)\s*(?:LEVELS?\s*|\bL)?(\d{1,2})\b/);
  if(rng){const a=+rng[1], b=+rng[2]; if(b>a&&b-a<60) return {level:`L${a}-L${b}`,levels:[`L${a}`,`L${b}`],times:b-a+1}}
  const ORD={FIRST:1,SECOND:2,THIRD:3,FOURTH:4,FIFTH:5,SIXTH:6,SEVENTH:7,EIGHTH:8,NINTH:9,TENTH:10};
  const one=[[/BASEMENT\s*(\d)|\bB(\d)\b(?!\s*MM)/,m=>'B'+(m[1]||m[2])],[/\bBASEMENT\b/,()=>'B'],[/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)\s+(FLOOR|LEVEL)\b/,m=>'L'+ORD[m[1]]],[/LOWER\s+GROUND/,()=>'LG'],[/UPPER\s+GROUND/,()=>'UG'],[/GROUND(\s+FLOOR|\s+LEVEL)?\b/,()=>'G'],
    [/MEZZ?ANINE/,()=>'M'],[/\bROOF\b/,()=>'Roof'],[/\bLEVEL\s*(\d{1,2})\b/,m=>'L'+(+m[1])],[/\bL(\d{1,2})\b/,m=>'L'+(+m[1])],[/\bPODIUM\b/,()=>'Podium'],[/\bCARPARK|CAR\s+PARK\b/,()=>'Carpark']];
  for(const [re,f] of one){const m=t.match(re); if(m) return {level:f(m),levels:null,times:1}}
  return {level:'',levels:null,times:1}}
const TYPES=[['cover',/\bCOVER\b|DRAWING\s+(LIST|SCHEDULE|REGISTER|INDEX)|TITLE\s+SHEET/],['legend',/LEGEND|SYMBOLS|ABBREVIATIONS/],
  ['schematic',/SCHEMATIC|RISER\s+DIAGRAM|SINGLE\s+LINE|BLOCK\s+DIAGRAM|FLOW\s+DIAGRAM|ZONE\s+DIAGRAM/],['detail',/\bDETAILS?\b|\bSECTIONS?\b|\bELEVATIONS?\b|TYPICAL\s+(INSTALLATION|MOUNTING)/],
  ['notes',/\bNOTES\b|SPECIFICATION|\bSCHEDULES?\b(?!.*PLAN)/],['plan',/PLAN|LAYOUT|ARRANGEMENT|FLOOR|LEVEL|BASEMENT|GROUND|ROOF|CARPARK|PODIUM/]];
function typeOf(title,kind){const t=U(title); for(const [k,re] of TYPES) if(re.test(t)) return k; return kind||'plan'}
function readSheet(texts,page,opt){opt=opt||{}; const T=(texts||[]).map(t=>({...t,s:String(t.s||'').trim()})).filter(t=>t.s);
  const out={dwg:'',rev:'',title:'',type:'',level:'',levels:null,times:1,listed:[]};
  const lab=k=>T.filter(t=>LAB[k].test(U(t.s))&&t.s.length<22);
  // drawing number: under its label; the largest drawing-number-like text low on the sheet otherwise; the file name last
  let dl=null; for(const l of lab('dwg')){const v=valueOf(T,l,looksDwg); if(v){out.dwg=v.s.replace(/\s+/g,''); dl=l; break}}
  // no labels as text (drawn as line work): the largest drawing-number-like text low right, one with a dash preferred
  let dt=null;
  if(!out.dwg){const nameU=U(opt.name||''), sc=t=>t.h+(/-/.test(t.s)?4:0)+(nameU&&nameU.includes(U(t.s).replace(/\s+/g,''))?20:0)+t.y/page.h*2;
    const c=T.filter(t=>t.y>page.h*.7&&t.x>page.w*.45&&!/\s/.test(t.s.trim())&&looksDwg(t.s)&&(DWG_RE.test(U(t.s))||/^[A-Z0-9]+(-[A-Z0-9]+){1,4}$/i.test(t.s.trim()))).sort((a,b)=>sc(b)-sc(a))[0];
    if(c&&c.h>=10){out.dwg=c.s.replace(/\s+/g,''); dt=c}}
  if(!out.dwg&&opt.name){const m=U(String(opt.name).replace(/\.[a-z0-9]+$/i,'')).match(/(?:[A-Z]{1,6}\d{0,7}[-_])?[A-Z]{1,4}[-_]?\d{2,4}[A-Z]?/); if(m) out.dwg=m[0]}
  // revision: the REV label beside the drawing number label (not the revision table's column heading)
  const rl=lab('rev').filter(l=>!dl||Math.abs(l.y-dl.y)<Math.max(30,dl.h*4)).sort((a,b)=>dl?Math.abs(a.y-dl.y)-Math.abs(b.y-dl.y):0);
  for(const l of rl){const v=valueOf(T,l,looksRev,{wide:l.h*6}); if(v&&(!dl||v.h>=l.h*1.15)){out.rev=v.s.trim().toUpperCase(); break}}
  // title: the lines under the TITLE / DRAWING label, else the largest lines low right that are not the project / client / address
  for(const l of lab('title')){const col=T.filter(t=>t!==l&&t.y>l.y+l.h*.3&&t.y-l.y<Math.max(70,l.h*9)&&Math.abs(t.x-l.x)<l.h*3&&t.h>=l.h*1.15&&!LAB.dwg.test(U(t.s))&&!LAB.rev.test(U(t.s))).sort((a,b)=>a.y-b.y);
    if(col.length){const h=col[0].h, run=[]; for(const t of col){if(Math.abs(t.h-h)>h*.25) break; if(run.length&&t.y-run[run.length-1].y>h*2.2) break; run.push(t)} out.title=run.map(t=>t.s).join(' ').replace(/\s+/g,' ').trim(); break}}
  // no TITLE label: the lines of the drawing number's size stacked above it in its column (the project block uses another size)
  if(!out.title&&dt){const col=T.filter(t=>t!==dt&&Math.abs(t.x-dt.x)<dt.h&&Math.abs(t.h-dt.h)<=dt.h*.1&&t.y<dt.y).sort((a,b)=>b.y-a.y), run=[];
    for(const t of col){if(run.length&&run[run.length-1].y-t.y>t.h*2.2) break; if(!run.length&&dt.y-t.y>page.h*.2) break; run.push(t)} out.title=run.reverse().map(t=>t.s).join(' ').replace(/\s+/g,' ').trim()}
  if(!out.rev&&dt){const v=T.filter(t=>t!==dt&&Math.abs(t.y-dt.y)<dt.h*.5&&t.x>dt.x&&looksRev(t.s)).sort((a,b)=>a.x-b.x)[0]; if(v) out.rev=v.s.trim().toUpperCase()}
  if(!out.title&&opt.fallbackTitle) out.title=opt.fallbackTitle;
  out.type=typeOf(out.title,opt.kind); Object.assign(out,out.type==='plan'?levelOf(out.title):{level:'',levels:null,times:1});
  // a cover / drawing list names the set: every drawing number on it
  if(out.type==='cover'){const seen=new Set(); for(const t of T){if(t.y>page.h*.8&&t.x>page.w*.6) continue; const s=U(t.s).replace(/\s+/g,''); if(looksDwg(s)&&DWG_RE.test(s)&&s!==out.dwg) seen.add(s)} out.listed=[...seen]}
  return out}
// the set: newer revisions of the same drawing, gaps in a numbered series, sheets a drawing list names that are not here
function register(sheets){const rows=sheets.slice(), by={};
  for(const r of rows) if(r.dwg) (by[r.dwg]=by[r.dwg]||[]).push(r);
  const older=[], duplicates=[];
  for(const [d,L] of Object.entries(by)) if(L.length>1){const s=L.slice().sort((a,b)=>revCmp(b.rev,a.rev)); for(const r of s.slice(1)){if(revCmp(r.rev,s[0].rev)===0&&r.page!==s[0].page&&r.file===s[0].file) continue; (revCmp(r.rev,s[0].rev)===0?duplicates:older).push({page:r.page,dwg:d,rev:r.rev,newer:s[0].rev,newerPage:s[0].page})}}
  const have=new Set(Object.keys(by)), missing=new Set();
  for(const r of rows) for(const d of r.listed||[]) if(!have.has(d)&&Object.keys(by).some(h=>h.replace(/\d+[A-Z]?$/,'')===d.replace(/\d+[A-Z]?$/,''))) missing.add(d);
  const series={}; for(const d of have){const m=d.match(/^(.*?)(\d+)$/); if(m) (series[m[1]]=series[m[1]]||[]).push(m[2])}
  for(const [p,nums] of Object.entries(series)){if(nums.length<3) continue; const n=nums.map(Number).sort((a,b)=>a-b), w=Math.max(...nums.map(x=>x.length));
    for(let i=1;i<n.length;i++){const gap=n[i]-n[i-1]; if(gap>1&&gap<=4) for(let k=n[i-1]+1;k<n[i];k++) missing.add(p+String(k).padStart(w,'0'))}}
  return {rows,missing:[...missing].sort(),older,duplicates}}
const NS={readSheet,register,levelOf,typeOf,revCmp};
root.FT_SHEETS=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
