/* Strix FireTake · a Bluebeam (Revu) takeoff brought in: count, length and area markups saved in the PDF
   Bluebeam keeps each markup as a PDF annotation: Count = Polygon /IT /PolygonCount (one per counted item, the Subject names it),
   Length = PolyLine (or Line) /IT /PolyLineDimension ('29.07 m', scale '1 cm = 1 m'), Area = Polygon /IT /PolygonDimension.
   pdf.js gives the position and vertices of each annotation but not its Subject / measurement type, so those are read from the
   PDF's own annotation objects (plain or inside compressed object streams) and joined by object number.
   raw(bytes, inflate) → {objnum: {subj, it, contents, scale, label}}
   groups(pages, raw) → [{key, kind:'count'|'length'|'area', subj, color, n, metres, sq, items:[{page, x, y} | {page, pts, metres}]}]
     pages: [{id, annots:[pdf.js annotation data], toView([x, y]) → [x, y]}]
   guess(subj, rules) → {type, act} · pipeOf(subj) → {dn, sys, mat} */
(function(root){
'use strict';
const latin1=b=>{let s=''; for(let i=0;i<b.length;i+=8192) s+=String.fromCharCode.apply(null,b.subarray(i,i+8192)); return s};
// a PDF string: literal (…) with escapes, or <hex>; UTF-16BE when it starts with FE FF
function pdfStr(s){if(s==null) return ''; let raw='';
  if(s[0]==='<'){const h=s.slice(1,-1).replace(/\s+/g,''); for(let i=0;i<h.length;i+=2) raw+=String.fromCharCode(parseInt(h.substr(i,2).padEnd(2,'0'),16))}
  else{const t=s.slice(1,-1); for(let i=0;i<t.length;i++){const c=t[i]; if(c!=='\\'){raw+=c; continue} const d=t[++i];
    if(d==='n') raw+='\n'; else if(d==='r') raw+='\r'; else if(d==='t') raw+='\t'; else if(d==='b') raw+='\b'; else if(d==='f') raw+='\f';
    else if(/[0-7]/.test(d)){let o=d; while(o.length<3&&/[0-7]/.test(t[i+1])) o+=t[++i]; raw+=String.fromCharCode(parseInt(o,8)&255)} else if(d==='\r'||d==='\n'){} else raw+=d}}
  if(raw.charCodeAt(0)===0xFE&&raw.charCodeAt(1)===0xFF){let o=''; for(let i=2;i+1<raw.length;i+=2) o+=String.fromCharCode(raw.charCodeAt(i)<<8|raw.charCodeAt(i+1)); return o}
  return raw}
// the value of /Key in a dictionary text: a string (balanced parentheses) or a name
function strAfter(d,key){const i=d.search(new RegExp('/'+key+'\\s*[(<]')); if(i<0) return null; let j=d.indexOf(d.slice(i).match(/[(<]/)[0],i);
  if(d[j]==='<'){const e=d.indexOf('>',j); return d.slice(j,e+1)} let depth=0; for(let k=j;k<d.length;k++){const c=d[k]; if(c==='\\'){k++; continue} if(c==='(') depth++; else if(c===')'&&--depth===0) return d.slice(j,k+1)} return null}
const nameAfter=(d,key)=>{const m=d.match(new RegExp('/'+key+'\\s*/([A-Za-z0-9#_.-]+)')); return m?m[1]:''};
function entry(d){if(!/\/Subtype\s*\/(Polygon|PolyLine|Line|Circle|Square)\b/.test(d)) return null;
  return {subj:pdfStr(strAfter(d,'Subj')).trim(),it:nameAfter(d,'IT'),contents:pdfStr(strAfter(d,'Contents')).trim(),label:pdfStr(strAfter(d,'Label')).trim(),scale:pdfStr(strAfter(d,'R')).trim()}}
async function raw(bytes,inflate){const s=latin1(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)), out={};
  for(const m of s.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g)){const d=m[2]; if(/\/Type\s*\/ObjStm/.test(d)) continue; if(!/\/Subj\b|\/IT\b/.test(d)) continue; const e=entry(d); if(e) out[+m[1]]=e}
  // annotations inside compressed object streams (PDF 1.5+): inflate each stream, then its objects by the offsets in its header
  if(inflate) for(const m of s.matchAll(/(\d+)\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g)){if(!/\/Type\s*\/ObjStm/.test(m[2])||!/FlateDecode/.test(m[2])) continue;
    const L=+(m[2].match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)||[])[1], N=+(m[2].match(/\/N\s+(\d+)/)||[])[1], F=+(m[2].match(/\/First\s+(\d+)/)||[])[1]; if(!L||!N) continue;
    const start=m.index+m[0].length; let txt; try{txt=latin1(await inflate(bytes.subarray(start,start+L)))}catch(e){continue}
    const head=txt.slice(0,F).trim().split(/\s+/).map(Number); for(let k=0;k<N;k++){const num=head[2*k], off=head[2*k+1], end=k+1<N?head[2*k+3]:txt.length-F; const d=txt.slice(F+off,F+end); if(/\/Subj\b|\/IT\b/.test(d)){const e=entry(d); if(e) out[num]=e}}}
  return out}
const metresOf=t=>{const m=String(t||'').replace(/,/g,'').match(/(-?\d+(?:\.\d+)?)\s*(mm|cm|m|ft|')\b/i); if(!m) return null; const v=+m[1], u=m[2].toLowerCase(); return u==='mm'?v/1000:u==='cm'?v/100:u==='ft'||u==="'"?v*.3048:v};
const sqOf=t=>{const m=String(t||'').replace(/,/g,'').match(/(\d+(?:\.\d+)?)\s*(sq\s*m|m²|m2)/i); return m?+m[1]:null};
const hex=c=>c&&c.length>=3?Array.from(c).slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''):'';
function groups(pages,R){const G={};
  for(const p of pages) for(const a of p.annots||[]){const num=parseInt(a.id,10), e=R[num]; if(!e) continue;
    const st=a.subtype, it=e.it||'', subj=e.subj||e.label||'';
    const kind=/PolygonCount|Count/i.test(it)?'count':/PolyLineDimension|LineDimension|Dimension$/i.test(it)&&!/Polygon/i.test(it)?'length':/PolygonDimension|Area/i.test(it)?'area':(st==='Line'||st==='PolyLine')&&subj?'length':subj?'count':null;
    if(!kind) continue; const key=kind+'|'+subj.toUpperCase().replace(/\s+/g,' ').trim(); const g=G[key]||(G[key]={key,kind,subj:subj.replace(/\s+/g,' ').trim(),color:hex(a.color),n:0,metres:0,sq:0,items:[],scale:e.scale});
    if(kind==='count'){const r=a.rect; const c=p.toView([(r[0]+r[2])/2,(r[1]+r[3])/2]); g.items.push({page:p.id,x:c[0],y:c[1]}); g.n++}
    else if(kind==='length'){const V=a.vertices&&a.vertices.length?a.vertices.map(v=>[v.x,v.y]):a.lineCoordinates?[[a.lineCoordinates[0],a.lineCoordinates[1]],[a.lineCoordinates[2],a.lineCoordinates[3]]]:null; if(!V) continue;
      const m=metresOf(e.contents); const pts=V.map(v=>p.toView(v)); g.items.push({page:p.id,pts,metres:m}); g.n++; if(m!=null) g.metres+=m}
    else{const s=sqOf(e.contents); if(s!=null) g.sq+=s; g.n++}}
  return Object.values(G).sort((a,b)=>(a.kind>b.kind?1:a.kind<b.kind?-1:0)||b.n-a.n)}
// the device a count's subject names: the app's legend vocabulary; 'X …' = to be removed, '… R' / RELOCATE = relocated, EXISTING = stays
function guess(subj,rules){const u=String(subj||'').toUpperCase().replace(/\s+/g,' ').trim(); let act='new', s=u;
  if(/^X\s+/.test(s)){act='remove'; s=s.replace(/^X\s+/,'')} else if(/\bREMOVE|DEMOLISH|DELETE/.test(s)) act='remove';
  if(/\s+R$/.test(s)){act='relocate'; s=s.replace(/\s+R$/,'')} else if(/RELOCAT/.test(s)) act='relocate'; else if(/EXISTING|RETAIN/.test(s)) act='retain';
  let type=''; if(!(/CONCEALED/.test(s)&&/SMOKE|DETECT/.test(s))) for(const [k,re] of rules||[]) if(re.test(s)){type=k; break}
  if(/CONCEALED/.test(s)&&/SMOKE|DETECT/.test(s)) type='cs_smoke'; if(/GUARD/.test(s)&&/HEAD|SPRINKLER/.test(s)) type='spk_dock';
  if(!type&&/EXPOSED|UPRIGHT/.test(s)) type='spk_up'; if(!type&&/CONCEALED\s*HEAD/.test(s)) type='spk_conc'; if(!type&&/^FH$|\bHYDRANT/.test(s)) type='hydrant'; if(!type&&/^FHR$|HOSE\s*REEL/.test(s)) type='hosereel';
  return {type,act}}
function pipeOf(subj){const u=String(subj||'').toUpperCase(); const d=u.match(/(?:DN\s*)?(\d{2,3})\s*(?:MM|NB|DN|FS|FH|FHR|HR)?\b/); const dn=d?+d[1]:0;
  const sys=/HOSE|FHR|\bHR\b/.test(u)?'HR':/HYD|\bFH\b/.test(u)?'HYD':/DETECT|CABLE|EWIS|LOOP/.test(u)?'DET':'SPR';
  return {dn,sys,mat:sys==='HR'?'CU':sys==='DET'?'CBH':'GMS'}}
const NS={raw,groups,guess,pipeOf,pdfStr,metresOf};
root.FT_BLUEBEAM=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
