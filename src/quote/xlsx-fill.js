/* Strix FireTake · filling the builder's own Excel price schedule from the estimate
   The builder's workbook keeps its layout, styles and formulas: only the amount cells we fill change (a formula cell is never
   overwritten), and Excel recalculates on opening. Works on the unzipped workbook ({path: Uint8Array}) in the browser and in node.
   read(entries) → {sheets:[{name, path, header, descCol, amountCol, rows:[{r, desc, ref, value, formula}]}]}
   suggest(desc) → source key: 'sys:SPR' 'sys:HYD' 'sys:HR' 'sys:DET' 'pf' 'fs' 'total' … or ''
   fill(entries, sheetPath, writes:[{ref, value}]) → {entries, written, skipped:[ref]}  ·  zip(entries) → Uint8Array (stored zip) */
(function(root){
'use strict';
const td=new TextDecoder(), te=new TextEncoder();
const unxml=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&');
const txt=b=>b?td.decode(b):'';
const colNum=c=>{let n=0; for(const ch of c) n=n*26+ch.charCodeAt(0)-64; return n};
const colOf=ref=>String(ref).replace(/\d+/g,''), rowOf=ref=>+String(ref).replace(/[A-Z]+/g,'');
const strings=sst=>[...String(sst).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>unxml(t[1])).join(''));
function cellsOf(xml,S){const out=[];
  for(const m of xml.matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)){const a=m[1], body=m[3]||'', ref=(a.match(/\br="([A-Z]+\d+)"/)||[])[1]; if(!ref) continue;
    const t=(a.match(/\bt="(\w+)"/)||[])[1]||'', v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1], f=/<f[\s>\/]/.test(body);
    let text='', num=null; if(t==='s') text=S[+v]||''; else if(t==='inlineStr') text=[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>unxml(x[1])).join(''); else if(t==='str') text=unxml(v||''); else if(v!=null&&v!=='') num=+v;
    out.push({ref,col:colOf(ref),row:rowOf(ref),text:text.trim(),num,formula:f})}
  return out}
const AMOUNT=/^(TENDER\s+)?(AMOUNT|PRICE|SUM|TOTAL|COST|LUMP\s*SUM|\$|AMOUNT\s*\(?\$?\)?|PRICE\s*\(?EX\.?\s*GST\)?|TOTAL\s*\(?EX\.?\s*GST\)?|SUBCONTRACT(OR)?\s+PRICE)\b/i;
function read(entries){const wb=txt(entries['xl/workbook.xml']), rels=txt(entries['xl/_rels/workbook.xml.rels']), S=strings(txt(entries['xl/sharedStrings.xml']));
  const target={}; for(const m of rels.matchAll(/<Relationship\b[^>]*>/g)){const id=(m[0].match(/Id="([^"]+)"/)||[])[1], tg=(m[0].match(/Target="([^"]+)"/)||[])[1]; if(id&&tg) target[id]=tg.replace(/^\/?xl\//,'').replace(/^\//,'')}
  const sheets=[];
  for(const m of wb.matchAll(/<sheet\b[^>]*>/g)){const name=unxml((m[0].match(/name="([^"]*)"/)||[])[1]), rid=(m[0].match(/r:id="([^"]+)"/)||[])[1], path='xl/'+(target[rid]||''); if(!entries[path]) continue;
    const C=cellsOf(txt(entries[path]),S); const byRow={}; for(const c of C) (byRow[c.row]=byRow[c.row]||[]).push(c);
    // the header row: a row with an amount heading; the description column: the one with most words beneath it
    let header=null, amountCol=''; for(const r of Object.keys(byRow).map(Number).sort((a,b)=>a-b)){const h=byRow[r].find(c=>c.text&&AMOUNT.test(c.text)&&c.text.length<30); if(h){header=r; amountCol=h.col; const p=byRow[r].find(c=>/^(AMOUNT|PRICE|LUMP)/i.test(c.text)); if(p) amountCol=p.col; break}}
    const start=header||0, cnt={}; for(const c of C) if(c.row>start&&c.text&&/[A-Za-z]{3}/.test(c.text)&&c.text.length>3) cnt[c.col]=(cnt[c.col]||0)+1;
    const descCol=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]||colNum(a)-colNum(b))[0]||'';
    if(!amountCol&&descCol){const cols=[...new Set(C.map(c=>c.col))].sort((a,b)=>colNum(a)-colNum(b)); amountCol=cols.filter(c=>colNum(c)>colNum(descCol)).pop()||String.fromCharCode(descCol.charCodeAt(0)+1)}
    const rows=[]; for(const r of Object.keys(byRow).map(Number).sort((a,b)=>a-b)){if(r<=start) continue; const d=byRow[r].find(c=>c.col===descCol); if(!d||!d.text||!/[A-Za-z]{2}/.test(d.text)) continue;
      const a=byRow[r].find(c=>c.col===amountCol); rows.push({r,desc:d.text,ref:amountCol+r,value:a?a.num:null,formula:!!(a&&a.formula)})}
    sheets.push({name,path,header,descCol,amountCol,rows})}
  return {sheets}}
const SUG=[[/\b(SUB-?\s*TOTAL|TOTAL|GST|CONTINGENC|PROVISIONAL\s+SUM)\b/,''],[/PASSIVE|PENETRATION|FIRE\s*STOP|FIRE\s*SEAL|COLLAR/,'pf'],[/SPRINKLER/,'sys:SPR'],
  [/BOOSTER|TOWN'?S\s+MAIN|WATER\s+METER/,'sys:TMB'],[/HYDRANT/,'sys:HYD'],[/HOSE\s*REEL/,'sys:HR'],[/EXTINGUISHER|FIRE\s+BLANKET|PORTABLE/,'sys:PORT'],
  [/DETECTION|\bFIP\b|ALARM|EWIS|OCCUPANT\s+WARNING|SMOKE|SOUNDER|SPEAKER|\bEWS\b/,'sys:DET'],[/EMERGENCY\s+LIGHT|EXIT\s+SIGN/,'sys:EM'],
  [/DEMOLITION|STRIP\s*OUT|MAKE\s+SAFE|DISCONNECT/,'sys:DEMO'],[/DESIGN|CERTIF|COMMISSION|PRELIM|AS\s*1851|SHOP\s*DRAWING/,'sys:GEN'],[/FIRE\s+(SERVICES|PROTECTION)|WET\s+FIRE|DRY\s+FIRE/,'fs']];
function suggest(desc){const u=String(desc||'').toUpperCase(); for(const [re,k] of SUG) if(re.test(u)) return k; return ''}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function fill(entries,sheetPath,writes){const out={...entries}; let xml=txt(entries[sheetPath]); const skipped=[]; let written=0;
  for(const w of writes){if(w.value==null||!isFinite(w.value)) continue; const v=Math.round(w.value*100)/100, ref=w.ref, r=rowOf(ref);
    const cre=new RegExp(`<c\\b(?=[^>]*\\br="${ref}")([^>]*?)(\\/>|>([\\s\\S]*?)<\\/c>)`); const m=xml.match(cre);
    if(m){if(/<f[\s>\/]/.test(m[3]||'')){skipped.push(ref); continue} const s=(m[1].match(/\bs="(\d+)"/)||[])[1]; xml=xml.replace(cre,`<c r="${ref}"${s?` s="${s}"`:''}><v>${v}</v></c>`); written++; continue}
    const cell=`<c r="${ref}"><v>${v}</v></c>`, rre=new RegExp(`<row\\b(?=[^>]*\\br="${r}")([^>]*?)(\\/>|>([\\s\\S]*?)<\\/row>)`), rm=xml.match(rre);
    if(rm){const inner=rm[3]||''; const cells=[...inner.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)]; let at=inner.length;
      for(const c of cells) if(colNum(c[1])>colNum(colOf(ref))){at=c.index; break}
      xml=xml.replace(rre,`<row${rm[1]}>${inner.slice(0,at)}${cell}${inner.slice(at)}</row>`)}
    else{const rows=[...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)]; const next=rows.find(x=>+x[1]>r); const row=`<row r="${r}">${cell}</row>`;
      xml=next?xml.slice(0,next.index)+row+xml.slice(next.index):xml.replace(/<\/sheetData>|<sheetData\s*\/>/,mm=>mm.startsWith('</')?row+mm:`<sheetData>${row}</sheetData>`)}
    written++}
  out[sheetPath]=te.encode(xml);
  // Excel works the formulas out again on opening; the old calculation chain would point at what we changed
  let wb=txt(entries['xl/workbook.xml']); wb=/<calcPr\b/.test(wb)?wb.replace(/<calcPr\b([^>]*?)\/?>/,(m,a)=>`<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/,'')} fullCalcOnLoad="1"/>`):wb.replace(/<\/workbook>/,'<calcPr fullCalcOnLoad="1"/></workbook>');
  out['xl/workbook.xml']=te.encode(wb);
  if(out['xl/calcChain.xml']){delete out['xl/calcChain.xml']; out['[Content_Types].xml']=te.encode(txt(out['[Content_Types].xml']).replace(/<Override[^>]*calcChain[^>]*\/>/,''));
    out['xl/_rels/workbook.xml.rels']=te.encode(txt(out['xl/_rels/workbook.xml.rels']).replace(/<Relationship[^>]*calcChain[^>]*\/>/,''))}
  return {entries:out,written,skipped}}
// a zip with the files stored as they are (Excel opens stored zips)
let CRC=null; function crc32(b){if(!CRC){CRC=new Uint32Array(256); for(let n=0;n<256;n++){let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; CRC[n]=c>>>0}} let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0}
function zip(entries){const parts=[], dir=[]; let off=0; const names=Object.keys(entries).sort((a,b)=>(a==='[Content_Types].xml'?-1:b==='[Content_Types].xml'?1:0));
  for(const name of names){const data=entries[name] instanceof Uint8Array?entries[name]:te.encode(String(entries[name])), nm=te.encode(name), crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,nm.length,true);
    parts.push(new Uint8Array(h.buffer),nm,data); dir.push({nm,crc,size:data.length,off}); off+=30+nm.length+data.length}
  const cd0=off; for(const e of dir){const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint32(16,e.crc,true); c.setUint32(20,e.size,true); c.setUint32(24,e.size,true); c.setUint16(28,e.nm.length,true); c.setUint32(42,e.off,true); parts.push(new Uint8Array(c.buffer),e.nm); off+=46+e.nm.length}
  const e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,dir.length,true); e.setUint16(10,dir.length,true); e.setUint32(12,off-cd0,true); e.setUint32(16,cd0,true); parts.push(new Uint8Array(e.buffer));
  const all=new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let k=0; for(const p of parts){all.set(p,k); k+=p.length} return all}
const NS={read,suggest,fill,zip,norm,colNum};
root.FT_XLSXFILL=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
