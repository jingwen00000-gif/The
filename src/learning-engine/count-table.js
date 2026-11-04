/* FireTake Learning Engine · count tables (the estimator's Bluebeam markup summary)

   Many takeoffs carry, on each sheet, the estimator's own summary of the markups: a table per section (NEW, Relocate, Remove …) with
   Description / Quantity / Unit, each row starting with a small copy of its markup. That table is the colour key: it names every markup
   group and gives its total. Bluebeam also writes each count group's total into every markup of the group (contents "21"), so a row is
   tied to its group by the quantity on the same sheet — black "21" is 'Concealed head', black "18" is 'Concealed head R' — with the
   row icon's colour deciding ties.

     read(model, addedObjects)          tables on one takeoff sheet: [{status, rows:[{description, qty, unit, status, colour, y}]}]
     match(tables, annots, FVE)         → {map: {'Polygon#000000|21': {type, status, description}}, rows: [... with group / type]}
   The map plugs into the symbol extractor (markup-map form, per sheet), so a job with count tables needs no hand-written key. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const STATUS=[['relocate',/RELOCAT|^R$|RE-?SET/i],['remove',/REMOV|DEMOL|DELET|DECOMM/i],['retain',/EXIST|RETAIN|REMAIN/i],['new',/^NEW\b|NEW\s+WORK|PROPOSED/i]];
const statusOf=s=>(STATUS.find(([,re])=>re.test(String(s||'').trim()))||[null])[0];
const num=s=>{const m=String(s||'').replace(/,/g,'').match(/^\s*(\d+(?:\.\d+)?)\s*(m|lm|ea|no\.?|count)?\s*$/i); return m?+m[1]:null};
// the device a row names; FVE's vocabulary first, then takeoff words FVE does not use ('Concealed head', 'FH')
const EXTRA=[['spk_conc',/CONCEALED\s+(HEAD|PENDENT|PENDANT)/],['spk_semi',/SEMI.?RECESS/],['spk_pend',/PENDENT|PENDANT|SPRINKLER\s+HEAD|^HEAD\b|EXPOSED\s+HEAD|^(STANDARD|UPRIGHT)\s+HEAD/],['hydrant',/^FH$|FIRE\s+HYDRANT/],['hosereel',/^FHR$|HOSE\s*REEL/],
  ['spk_surf',/(SURFACE|WALL)[\s-]*(MOUNT\w*|MTD)?[^\n]{0,20}SPEAKER|SPEAKER[^\n]{0,24}\b(SURFACE|WALL)[\s-]*(MOUNT\w*|MTD)/],['speaker',/SPEAKER/],['smoke',/SMOKE/],['heat',/THERMAL|HEAT/],['mcp',/MCP|MANUAL\s+CALL/],['relay',/RELAY|MODULE|\bI\/?O\b/],['sounder',/STROBE|SOUNDER|VAD/],['wip',/\bWIP\b|WARDEN/],['blanket',/BLANKET/],['ext_abe',/EXTINGUISH/]];
function typeOf(desc,FVE){const d=String(desc||'').toUpperCase().replace(/\s+R$/,'').trim(); const t=FVE&&FVE.classifyDesc?FVE.classifyDesc(d).type:null; if(t) return t;
  const e=EXTRA.find(([,re])=>re.test(d)); return e?e[0]:null}

// tables on one sheet: header items 'Description' / 'Quantity' / 'Unit' on one baseline, rows beneath until a gap
// extra: words from the markups' own appearance (a Bluebeam summary is a markup: pdf.js has no text for it; poppler's pdftotext does)
function read(m,added,extra){const T=extra&&extra.length?m.texts.concat(extra):m.texts, out=[]; const H=T.filter(t=>/^Description$/i.test(String(t.s).trim()));
  for(const hd of H){const hy=hd.cy, h=hd.h||6;
    const q=T.filter(t=>/^Quantity$/i.test(String(t.s).trim())&&Math.abs(t.cy-hy)<h*.6&&t.x>hd.x).sort((a,b)=>a.x-b.x)[0]; if(!q) continue;
    const u=T.filter(t=>/^Unit$/i.test(String(t.s).trim())&&Math.abs(t.cy-hy)<h*.6&&t.x>q.x).sort((a,b)=>a.x-b.x)[0]; if(!u) continue;
    const colW=q.x-hd.x; let left=hd.x-colW*1.2; const right=u.x+(u.x1-u.x)*2+h*2;
    // a table beside it on the same header line: this table starts after that one's Unit column
    for(const o of T) if(o!==u&&/^Unit$/i.test(String(o.s).trim())&&Math.abs(o.cy-hy)<h*.6&&o.x1<hd.x) left=Math.max(left,o.x1+h);
    // section title just above the header (NEW / Relocate …)
    const title=T.filter(t=>t.cy<hy&&hy-t.cy<h*3.5&&t.cx>left&&t.cx<right&&statusOf(t.s)).sort((a,b)=>b.cy-a.cy)[0];
    const items=T.filter(t=>t.cy>hy+h*.5&&t.cx>left&&t.cx<right).sort((a,b)=>a.cy-b.cy);
    const rows=[]; let last=hy;
    for(const t of items){if(t.cy-last>h*3.2) break; let r=rows.find(r=>Math.abs(r.y-t.cy)<h*.6); if(!r){r={y:t.cy,parts:[]}; rows.push(r)} r.parts.push(t); last=Math.max(last,t.cy)}
    const tab={status:title?statusOf(title.s):null,title:title?String(title.s).trim():null,header:[hd.x,hy],rows:[]};
    for(const r of rows){const desc=r.parts.filter(t=>t.x1<q.x-h*.3).sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ').trim().replace(/^(Count|m|ea|No\.?)\s+/i,''); /* the neighbouring table's unit column */
      const qt=r.parts.find(t=>t.cx>q.x-colW*.4&&t.cx<u.x-h*.2&&num(t.s)!=null), un=r.parts.find(t=>t.cx>u.x-h*1.5&&t.cx<right);
      if(!desc||!qt) continue; const qty=num(qt.s), unit=un?String(un.s).trim():null;
      // the row's icon: line work added in front of the description (a small copy of the markup)
      const icon=(added||[]).filter(o=>(o.bb[1]+o.bb[3])/2>r.y-h&&(o.bb[1]+o.bb[3])/2<r.y+h&&o.bb[2]<Math.min(...r.parts.map(t=>t.x))+h&&o.bb[0]>left-colW).map(o=>o.stroke||o.fill).filter(Boolean);
      const st=/\sR$/.test(desc)?'relocate':tab.status;
      tab.rows.push({description:desc,qty,unit,status:st,colour:icon[0]||null,y:r.y})}
    if(tab.rows.length) out.push(tab)}
  return out}

const rgb=h=>[0,2,4].map(i=>parseInt(String(h).slice(i,i+2),16));
const cdist=(a,b)=>{if(!a||!b) return 999; const x=rgb(a), y=rgb(b); return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])};
// annots: one sheet's normalised annotations; prefer: {description → colour} learnt on sheets where it was unambiguous
// → {map: {'Polygon#000000|21': {type, status, description}}, rows: [... with group(s), type, ambiguous]}
function match(tables,annots,FVE,prefer){const groups={};
  for(const a of annots||[]){if(!a.bb||!a.colour) continue;   /* uncoloured boxes are text callouts (room tags), not counts */
    const count=/^(Polygon|Circle|Square|Ink)$/.test(a.subtype), line=/^(PolyLine|Line)$/.test(a.subtype); if(!count&&!line) continue;
    const tot=num(a.contents), k=a.subtype+'#'+a.colour+'|'+(a.contents||'').trim(); const g=groups[k]=groups[k]||{key:k,kind:a.subtype,colour:a.colour,contents:(a.contents||'').trim(),n:0,total:tot,line};
    g.n++}
  const used=new Set(), map={}, rows=[], G=Object.values(groups);
  const fits=(g,q,isLen)=>isLen?Math.abs((g.total||0)-q)<.02:(g.total!=null?g.total===q&&g.n===q:g.n===q);
  const key=d=>String(d||'').toUpperCase().replace(/\s+R$/,'').replace(/^X\s+/,'').trim();   /* 'X SMOKE DETECTOR' on a demolition sheet is the same device */
  for(const t of tables) for(const r of t.rows){const isLen=/^m$|metre|meter|lm/i.test(r.unit||''); const want=r.colour||(prefer&&prefer[key(r.description)])||null;
    let pick=null, amb=false; const one=G.filter(g=>!used.has(g.key)&&g.line===isLen&&fits(g,r.qty,isLen));
    if(one.length){one.sort((a,b)=>cdist(a.colour,want)-cdist(b.colour,want)); pick=[one[0]]; amb=one.length>1&&(!want||cdist(one[0].colour,want)===cdist(one[1].colour,want))}
    else if(!isLen){// one count split over several groups of a colour (Bluebeam layers): a combination of unused groups adding up to the total
      for(const col of [...new Set(G.filter(g=>!g.line&&!used.has(g.key)).map(g=>g.colour))].sort((a,b)=>cdist(a,want)-cdist(b,want))){
        const cs=G.filter(g=>!g.line&&!used.has(g.key)&&g.colour===col&&g.n<r.qty).slice(0,10); let best=null;
        for(let mask=1;mask<(1<<cs.length)&&!best;mask++){let n=0; const set=[]; cs.forEach((g,i)=>{if(mask&(1<<i)){n+=g.n; set.push(g)}}); if(n===r.qty&&set.length>1) best=set}
        if(best){pick=best; break}}}
    const type=isLen?null:typeOf(r.description,FVE);
    rows.push({...r,group:pick?pick.map(g=>g.key).join(' + '):null,groups:pick?pick.map(g=>g.key):[],type,ambiguous:amb});
    if(pick&&!amb){pick.forEach(g=>used.add(g.key)); if(!isLen) for(const g of pick) map[g.kind+'#'+g.colour+'|'+g.contents]={type,status:r.status||'new',description:r.description,qty:r.qty}}}
  return {map,rows,groups:G}}

NS.countTable={read,match,typeOf,statusOf};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.countTable;
})(typeof window!=='undefined'?window:globalThis);
