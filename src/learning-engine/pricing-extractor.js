/* FireTake Learning Engine · pricing extractor

   Reads a job's BOQ / quote spreadsheets (.xlsx, no library: zip + XML) and turns them into priced items:
     header row found by its words (description / qty / unit / supply / install / labour / rate / total), every row under it with a
     description and a number becomes {description, key, qty, unit, supply, install, rate, total}; rows saying TOTAL become totals.
   key = the FireTake item the description names (smoke, heat, mcp, speaker, … cable) so rates from different jobs line up.
   inflateRaw is injected: Node's zlib.inflateRawSync, or the browser's DecompressionStream('deflate-raw'). */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};

/* ---- zip ---- */
async function unzip(buf,inflateRaw){const u=buf instanceof Uint8Array?buf:new Uint8Array(buf); const dv=new DataView(u.buffer,u.byteOffset,u.byteLength); const out={};
  let e=-1; for(let i=u.length-22;i>=Math.max(0,u.length-65558);i--) if(dv.getUint32(i,true)===0x06054b50){e=i; break}
  if(e<0) throw new Error('not a zip / xlsx file');
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const td=new TextDecoder();
  for(let k=0;k<n;k++){if(dv.getUint32(p,true)!==0x02014b50) break; const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lo=dv.getUint32(p+42,true);
    const name=td.decode(u.subarray(p+46,p+46+nl)); p+=46+nl+xl+cl;
    const lnl=dv.getUint16(lo+26,true), lxl=dv.getUint16(lo+28,true), start=lo+30+lnl+lxl, data=u.subarray(start,start+csize);
    out[name]=method===0?data:method===8?await inflateRaw(data):null}
  return out}
const xmlText=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&');
const colIdx=ref=>{const m=/^([A-Z]+)/.exec(ref); let n=0; for(const ch of m[1]) n=n*26+ch.charCodeAt(0)-64; return n-1};
// → [{name, rows:[[value…]]}]
async function readXlsx(buf,inflateRaw){const z=await unzip(buf,inflateRaw), td=new TextDecoder(), txt=f=>z[f]?td.decode(z[f]):'';
  const ss=[...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
  const wb=txt('xl/workbook.xml'), rels=txt('xl/_rels/workbook.xml.rels');
  const target=id=>{const m=new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels); const t=m&&(m[1]||m[2]); return t?('xl/'+t.replace(/^\/?xl\//,'').replace(/^\//,'')):null};
  const sheets=[...wb.matchAll(/<sheet\b[^>]*>/g)].map((m,i)=>{const nm=/name="([^"]*)"/.exec(m[0]), rid=/r:id="([^"]*)"/.exec(m[0]); return {name:nm?xmlText(nm[1]):'Sheet'+(i+1),file:(rid&&target(rid[1]))||`xl/worksheets/sheet${i+1}.xml`}});
  return sheets.map(s=>{const rows=[]; const x=txt(s.file);
    for(const r of x.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)){const rn=/r="(\d+)"/.exec(r[0]); const ri=rn?+rn[1]-1:rows.length; const row=[];
      for(const c of (r[1]||'').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const a=c[1], ref=/r="([A-Z]+\d+)"/.exec(a), t=/t="(\w+)"/.exec(a), body=c[2]||''; const ci=ref?colIdx(ref[1]):row.length;
        let v=null; const vv=/<v>([\s\S]*?)<\/v>/.exec(body);
        if(t&&t[1]==='s') v=vv?ss[+vv[1]]:null; else if(t&&t[1]==='inlineStr') v=[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(q=>xmlText(q[1])).join(''); else if(t&&(t[1]==='str'||t[1]==='e')) v=vv?xmlText(vv[1]):null; else if(t&&t[1]==='b') v=vv?vv[1]==='1':null; else v=vv?+vv[1]:null;
        row[ci]=v}
      rows[ri]=row}
    for(let i=0;i<rows.length;i++) if(!rows[i]) rows[i]=[];
    return {name:s.name,rows}})}

/* ---- items ---- */
const HEAD={desc:/^(DESCRIPTION|ITEM DESCRIPTION|DESC|SCOPE|PARTICULARS|ITEM|WORK ITEM)$/,qty:/^(QTY|QUANTITY|QTY\.|NO\.?|COUNT)$/,unit:/^(UNIT|UOM|UNITS)$/,
  supply:/SUPPLY|MATERIAL/,install:/INSTALL|LABOU?R/,rate:/^(RATE|UNIT RATE|PRICE|UNIT PRICE|\$\/UNIT|RATE \(\$\))$/,total:/^(TOTAL|AMOUNT|EXTENDED|EXT|SUM|SUBTOTAL|SUB-TOTAL|PRICE \(\$\)|TOTAL \(\$\))$/};
// FireTake item keys from a BOQ description (the app's own vocabulary where FVE has it, plus quantities FVE does not classify)
const KEYS=[['cable_fip',/FIP|LOOP|DETECTION/,/CABLE|CABLING|WIRING/],['cable_ewis',/EWIS|SPEAKER|WARNING/,/CABLE|CABLING|WIRING/],['cable',/CABLE|CABLING|WIRING/],
  ['pipe',/PIPE|PIPEWORK/],['fip',/FIRE INDICATOR PANEL|\bFIP\b|FDCIE/],['wip',/WARDEN INTERCOM|\bWIP\b/]];
const ACTION=[['remove',/\bDELETE|\bDEFIT|DECOMMISSION|\bREMOVE|DEMOLISH|DISCONNECT/],['relocate',/RELOCAT|RE-?SET|REINSTALL/],['retain',/EXISTING\s+TO\s+REMAIN|\bRETAIN/]];
// item key = device (or cable / pipe / panel) + the work done to it when it is not new: 'smoke', 'smoke@remove', 'spk_pend@relocate'
function keyOf(desc,FVE){const u=String(desc||'').toUpperCase(); const act=(ACTION.find(([,re])=>re.test(u))||[null])[0]; const tag=k=>k?k+(act?'@'+act:''):null;
  for(const [k,a,b] of KEYS.slice(0,3)) if(a.test(u)&&(!b||b.test(u))) return tag(k);
  const t=FVE&&FVE.classifyDesc?FVE.classifyDesc(u).type:null; if(t) return tag(t);
  for(const [k,a,b] of KEYS.slice(3)) if(a.test(u)&&(!b||b.test(u))) return tag(k); return null}
const num=v=>typeof v==='number'?v:(typeof v==='string'&&/^\s*\$?\s*-?[\d,]+(\.\d+)?\s*$/.test(v)?+v.replace(/[$,\s]/g,''):null);
function extract(sheets,opts){opts=opts||{}; const FVE=opts.FVE||root.FVE; const items=[], totals=[], sections=[];
  for(const sh of sheets){let hdr=null, map=null, sec=null;
    for(let i=0;i<sh.rows.length;i++){const row=sh.rows[i]||[]; const up=row.map(v=>typeof v==='string'?v.trim().toUpperCase():'');
      if(!hdr){const m={}; up.forEach((v,ci)=>{for(const [k,re] of Object.entries(HEAD)) if(v&&re.test(v)&&m[k]==null&&!(k==='desc'&&m.desc!=null)) m[k]=ci});
        // 'Item' + 'Description' both present: the description column is the wordier one
        if(m.desc!=null&&up.some((v,ci)=>ci!==m.desc&&/^DESCRIPTION$/.test(v))) m.desc=up.findIndex(v=>/^DESCRIPTION$/.test(v));
        // a header with QTY and RATE but a level / zone name where 'Description' would be (FPS quote sheets): descriptions are column A
        if(m.desc==null&&m.qty!=null&&(m.rate!=null||m.total!=null)&&m.qty>0) m.desc=0;
        if(m.desc!=null&&Object.keys(m).length>=3){hdr=i; map=m; sec=null} continue}
      // a section heading (WET FIRE, DRY FIRE …): one text cell, nothing else
      if(row.filter(v=>v!=null&&v!=='').length===1&&typeof row[map.desc]==='string'&&!/TOTAL/i.test(row[map.desc])){sec=row[map.desc].trim(); continue}
      const d=row[map.desc]; const label=row.find(v=>typeof v==='string'&&/TOTAL/i.test(v));
      const nums=row.map(num).filter(v=>v!=null);
      if(label&&(!d||/TOTAL/i.test(String(d)))){const amt=map.total!=null?num(row[map.total]):nums[nums.length-1]; if(amt!=null) totals.push({sheet:sh.name,label:String(label).trim(),amount:amt}); continue}
      if(typeof d!=='string'||!d.trim()) continue;
      const it={sheet:sh.name,section:sec,description:d.trim(),key:keyOf(d,FVE),qty:map.qty!=null?num(row[map.qty]):null,unit:map.unit!=null&&row[map.unit]!=null?String(row[map.unit]).trim():null,
        supply:map.supply!=null?num(row[map.supply]):null,install:map.install!=null?num(row[map.install]):null,rate:map.rate!=null?num(row[map.rate]):null,total:map.total!=null?num(row[map.total]):null};
      if(it.rate==null&&it.supply!=null&&it.install!=null) it.rate=Math.round((it.supply+it.install)*100)/100;
      if(it.total==null&&it.rate!=null&&it.qty!=null) it.total=Math.round(it.rate*it.qty*100)/100;
      if([it.qty,it.supply,it.install,it.rate,it.total].some(v=>v!=null)) items.push(it)}
    // a quote summary: two columns, label + amount, no item header
    if(hdr==null) for(const row of sh.rows){const lab=(row||[]).find(v=>typeof v==='string'&&v.trim()), amt=(row||[]).map(num).filter(v=>v!=null).pop(); if(lab&&amt!=null){(/TOTAL/i.test(lab)?totals:sections).push({sheet:sh.name,label:lab.trim(),amount:amt})}}}
  return {source:opts.source||null,items,totals,sections}}

NS.pricing={readXlsx,unzip,extract,keyOf};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.pricing;
})(typeof window!=='undefined'?window:globalThis);
