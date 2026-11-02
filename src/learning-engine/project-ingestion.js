/* FireTake Learning Engine · project ingestion

   A finished job is a folder:
     original*.pdf (or issued / tender / for-construction …)   the consultant's drawings — the question
     takeoff*.pdf  (or markup / marked / count / estimate …)   the same drawings after estimating — the answer
     boq.xlsx, quote.xlsx                                      optional, rates
     metadata.json                                             optional {projectId, name, client, consultant, date …}
     markup-map.json                                           optional, the estimator's colour key {"classes": {"annotation:Circle#ff00ff": "smoke"}}
   One PDF only, carrying markups (the estimator marked up the received set): it is both — the drawing without its markups is the
   original. Several PDFs per role are one set.

   loadFolder(dir)   Node: → {projectId, originalDrawing:[paths], takeoffDrawing:[paths], boq, quote, metadata, markupMap}
   ingestInApp(...)  in the FireTake page: reads both sets with FVE, diffs them, runs every extractor, returns plain JSON */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const TAKEOFF=/take-?off|mark-?up|marked|count|estimat|quantit|\bqs\b|bluebeam|answer/i, ORIGINAL=/original|issued|tender|client|consultant|ifc|for[-_ ]?constr|question/i;

function loadFolder(dir){const fs=require('fs'), path=require('path'); const files=fs.readdirSync(dir).sort();
  const pdfs=files.filter(f=>/\.pdf$/i.test(f)), x=f=>path.join(dir,f);
  let takeoff=pdfs.filter(f=>TAKEOFF.test(f)), original=pdfs.filter(f=>!TAKEOFF.test(f)&&ORIGINAL.test(f));
  if(!original.length) original=pdfs.filter(f=>!takeoff.includes(f));
  if(!takeoff.length&&original.length) takeoff=original.slice();   // marked-up received set: one file is both
  const json=f=>fs.existsSync(x(f))?JSON.parse(fs.readFileSync(x(f),'utf8')):null;
  const sheet=re=>{const f=files.find(n=>/\.xlsx$/i.test(n)&&re.test(n)); return f?x(f):null};
  const metadata=json('metadata.json')||{};
  return {projectId:metadata.projectId||path.basename(path.resolve(dir)),dir:path.resolve(dir),originalDrawing:original.map(x),takeoffDrawing:takeoff.map(x),
    sameFile:original.length>0&&original.join('|')===takeoff.join('|'),boq:sheet(/boq|bill|quantit/i),quote:sheet(/quote|tender|price|cost/i),metadata,markupMap:json('markup-map.json')}}

// pdftotext -bbox output (one or more files, pages in order) → per takeoff page: [{s, x, x1, cx, cy, h}] in page units, top-left origin
function bboxWords(html){const pages=[]; for(const pg of html.split(/<page /).slice(1)){const w=[]; for(const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)){const x=+m[1], y=+m[2], x1=+m[3], y1=+m[4];
    const s=m[5].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); w.push({s,x,x1,cx:(x+x1)/2,cy:(y+y1)/2,h:(y1-y)*.78,src:'markup'})} pages.push(w)} return pages}
const hex=c=>Array.from(c).slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
// in the FireTake page (app globals: openFiles, pdfPageObj, pdfVectors, fveTemplate, vsmSearch, S)
// input: {original:[[name,b64]], takeoff:[[name,b64]] | null (same file), metadata, markupMap, knowledge (libraries) }
async function ingestInApp(input){const L=NS, FVE=root.FVE; const b64=s=>{const bin=atob(s),u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u};
  const t0=performance.now(); S.pages=[];
  const open=async files=>{const before=S.pages.length; for(const [n,b] of files) await openFiles([new File([b64(b)],n,{type:'application/pdf'})]); return S.pages.slice(before).filter(p=>p.kind==='pdf')};
  const PO=await open(input.original), PT=input.takeoff?await open(input.takeoff):PO;
  const model=async(p,i)=>FVE.buildModel(await pdfPageObj(p),pdfjsLib.OPS,{id:p.id,name:p.name,index:i});
  const annots=async p=>{const pg=await pdfPageObj(p), vp=pg.getViewport({scale:1}); return (await pg.getAnnotations()).map(a=>L.diff.normAnnot(a,vp,hex))};
  const MO=[]; for(const [i,p] of PO.entries()) MO.push(await model(p,i));
  const MT=PT===PO?MO:[]; if(PT!==PO) for(const [i,p] of PT.entries()) MT.push(await model(p,i));
  const AT=[]; for(const p of PT) AT.push(await annots(p)); const AO=[]; if(PT!==PO) for(const p of PO) AO.push(await annots(p));
  const diff=L.diff.diff(MO,MT,AT,PT===PO?null:AO,{FVE});
  // the estimator's count tables (Bluebeam markup summary) name the markup groups sheet by sheet; a hand-written markup-map still wins
  const tables=[], auto={pages:{}};
  if(L.countTable){const read=[]; for(const [oi,ti] of diff.pairs){const words=(input.takeoffWords&&input.takeoffWords[ti])||[]; const tb=L.countTable.read(MT[ti],L.diff.addedObjects(MO[oi],MT[ti]),words); if(tb.length) read.push([oi,ti,tb])}
    // pass 1 learns which colour each description has where that is unambiguous; pass 2 uses it to settle ties (two rows of 25)
    const prefer={}; for(const [oi,ti,tb] of read) for(const r of L.countTable.match(tb,AT[ti],FVE).rows) if(r.groups.length===1&&!r.ambiguous){const g=r.groups[0], col=g.split('#')[1].split('|')[0]; prefer[String(r.description).toUpperCase().replace(/\s+R$/,'').trim()]=col}
    for(const [oi,ti,tb] of read){const mt=L.countTable.match(tb,AT[ti],FVE,prefer); tables.push({page:oi,tables:tb,rows:mt.rows}); if(Object.keys(mt.map).length) auto.pages[String(oi)]=mt.map}}
  const markupMap=Object.keys(auto.pages).length?{...(input.markupMap||{}),pages:{...auto.pages,...((input.markupMap||{}).pages||{})},fromCountTables:true}:input.markupMap;
  // consultant first: what the knowledge base already knows about them helps read this job's legend
  const K=input.knowledge||null, known=K?L.db.entries(K.consultants):[];
  const consultant=L.consultant.extract(MO,{FVE,metadata:input.metadata,known});
  const rec=K?L.db.forRecognition(K,{consultant:consultant.consultant,excludeProject:input.projectId}):null;
  const D=FVE.projectDictionary(MO,{library:rec?rec.library.filter(e=>e.consultant):null,knowledge:rec});
  const dets=await FVE.detect(MO,D,{library:null,knowledge:rec,match:async(e,m,q)=>{const p=S.pages.find(x=>x.id===m.page.id); return fveMatch(e,p,q,.85)}});
  // the app's own segments around a symbol (same curve flattening as every plan it will be searched on), each stroke once
  const V={}; for(const [i,p] of PO.entries()) V[i]=await pdfVectors(p);
  const vectorsAt=(pi,bb,objs)=>{const own=FVE.segments(objs), t=.3, seen=new Set(); const dS=(q,A,B)=>FVE.geom.segDist(q,A,B);
    return V[pi].concat(V[pi].fills||[]).filter(s=>{if(![s.a,s.b].every(q=>q[0]>=bb[0]-t&&q[0]<=bb[2]+t&&q[1]>=bb[1]-t&&q[1]<=bb[3]+t)) return false; const M=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2]; if(!own.some(o=>dS(M,o.a,o.b)<.25)) return false;
      const k=s.col+'|'+(s.f?1:0)+'|'+[s.a,s.b].map(q=>Math.round(q[0]*20)+','+Math.round(q[1]*20)).sort().join('|'); if(seen.has(k)) return false; seen.add(k); return true})};
  const sym=L.symbols.extract(MO,diff,{FVE,D,dets,markupMap,vectorsAt});
  const networks=L.network.extract(MO,D,sym.devices,{FVE}), measurements=L.network.measurements(MO,diff), rooms=L.rooms.extract(MO,sym.devices,{FVE});
  const conventions={statusColours:D.colStatus||{},legendStyle:D.geo&&D.geo.length?'geometric':D.symbols.length?'text':'none',scales:[...new Set(MO.map(m=>m.scale&&m.scale.ratio).filter(Boolean))],
    lineTypes:D.lineTypes.filter(l=>l.cls).map(l=>({cls:l.cls,desc:l.desc,stroke:l.stroke,dashed:!!l.dashed}))};
  return {projectId:input.projectId,consultant,sheets:MO.map((m,i)=>({i,name:m.page.name,kind:m.sheet.kind,title:m.sheet.title,scale:m.scale?m.scale.ratio:null})),
    devices:sym.devices,classes:sym.classes,trace:sym.trace,countTables:tables,unknownClasses:sym.unknownClasses,symbols:sym.symbols,abbreviations:Object.assign({},sym.abbreviations),
    labels:diff.labels,notes:diff.annotations.filter(a=>a.kind==='note').map(a=>({page:a.page,text:a.text,x:Math.round(a.x),y:Math.round(a.y)})),
    networks,measurements,rooms,conventions,diffStats:{...diff.stats,pairs:diff.pairs.length,additions:diff.additions.length,labels:diff.labels.length,annotations:diff.annotations.length},
    legend:{symbols:D.symbols.length,typed:D.symbols.filter(s=>s.type).length,historical:D.symbols.filter(s=>s.hist).length,lineTypes:D.lineTypes.length,detections:dets.length},ms:Math.round(performance.now()-t0)}}

NS.ingest={loadFolder,ingestInApp,bboxWords,TAKEOFF,ORIGINAL};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.ingest;
})(typeof window!=='undefined'?window:globalThis);
