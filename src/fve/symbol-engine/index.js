/* FireTake Multi-Layer Symbol Matching Engine (MSME)

     symbol → text → legend → context → network → confidence fusion → final classification

   run(models, D, hooks)  every plan sheet: candidates from exact legend matches, legend-coloured outlines and device tags;
                          pass 1 scores geometry + text + legend; confident results become the labels that context (neighbours,
                          same geometry) and network (same circuit) read in pass 2; each candidate then goes through matchSymbol.
   matchSymbol(candidate, graph) → {device, confidence (0–100), sources:[…], fingerprint, geoHash, layers, status, alternatives}
   hooks: match(entry, model, ratio) exact vector matcher; library [{consultant, geoHash, device}] consultant learning; consultant.
   Output detections keep the FVE shape (page, x, y, w, h, type, status, conf 0–1, ev) so verification and the tests read them as before;
   dets.learn lists what can be added to the consultant library (confidence ≥ 90). */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
if(typeof module!=='undefined'&&module.exports){require('./symbol-fingerprint'); require('./confidence-fusion'); require('./geometry-matcher'); require('./text-matcher'); require('./legend-matcher'); require('./context-matcher'); require('./network-matcher'); require('./knowledge-matcher')}
const hyp=Math.hypot;
const PASS1_LABEL=75;
const family=t=>/^spk_(pend|up|side|semi|space|conc|duct)/.test(t)?'sprinkler':/^ext_/.test(t)?'extinguisher':/^(speaker|spk_surf|horn|proj_spk)$/.test(t)?'speaker':/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':t; // % confidence a pass-1 result needs before context / network may lean on it

function layersFor(cand,graph){const ctx=graph;
  if(!cand._l){const G=NS.geometry.score(cand,ctx), T=NS.text.score(cand,ctx); cand.textEv=T.ev; const L=NS.legend.score(cand,ctx); const K=NS.knowledge?NS.knowledge.score(cand,ctx):{historical:{scores:{}},consultant:{scores:{}}}; cand._l={G,T,L,K}}
  return cand._l}
// the device's status: the best legend hit of that device; otherwise the colour the project's legend uses for one status (blue = new …)
function statusFor(device,cand,L,graph){if(L.statusBy&&L.statusBy[device]) return L.statusBy[device];
  const h=(cand.hits||[]).filter(x=>x.type===device&&x.status).sort((a,b)=>b.score-a.score)[0]; if(h) return h.status;
  const cs=graph.D&&graph.D.colStatus, col=cand.desc&&cand.desc.col; if(cs&&col&&cs[col]) return cs[col];
  const st=L.status||null;
  // a demolition sheet (DEMOLITION PLAN, STRIP OUT …): a device drawn in another colour than its black legend symbol, or dashed, is to be
  // removed; the rest is existing to remain
  if((!st||st==='new')&&graph.demo&&graph.demo.has(cand.page)){const hb=(cand.hits||[]).filter(x=>x.type===device).sort((a,b)=>b.score-a.score)[0]; return hb&&(hb.recol||hb.dashed>=.3)?'remove':'retain'}
  return st}
function matchSymbol(cand,graph){const {G,T,L,K}=layersFor(cand,graph); const C=graph.contextIndex?NS.context.score(cand,graph):{scores:{},ev:[]}, N=graph.networks?NS.network.score(cand,graph):{scores:{},ev:[]};
  const layers={geometry:G.scores,text:T.scores,legend:L.scores,context:C.scores,network:N.scores,historical:K.historical.scores,consultant:K.consultant.scores};
  const f=NS.fusion.fuse(layers,{weights:graph.weights,hasShape:cand.hasShape!==false}); if(!f) return null;
  const text=(T.ev.find(e=>e.type===f.device)||{}).text||null, legend=L.entry||null;
  return {...f,geoHash:cand.geoHash||null,fingerprint:NS.fingerprint.fingerprint({device:f.device,geoHash:cand.geoHash,text,legend,network:N.network||null}),
    status:statusFor(f.device,cand,L,graph),entry:legend,network:N.network||null,layers,evidence:{geometry:G.ev,text:T.ev,legend:L.ev,context:C.ev,network:N.ev}}}

async function run(models,D,hooks={},opts={}){const FVE=opts.FVE||root.FVE; const minConf=opts.minConf!=null?opts.minConf:.6;
  const graph={D,FVE,library:hooks.library||null,consultant:hooks.consultant||null,knowledge:hooks.knowledge||null,weights:opts.weights,networks:null,netMembers:null,contextIndex:null};
  graph.demo=new Set(models.filter(m=>m.sheet&&/DEMOLITION|DEMOLISH|STRIP[\s-]*OUT|REMOVAL\s+PLAN/i.test(m.sheet.title||'')).map(m=>m.page.id));
  const typed=NS.geometry.legendIndex(D).typed; const all=[]; let ref=0;
  for(const m of models){if(m.sheet.kind!=='plan') continue; const zones=(D.zones[m.page.id]||[]).concat(FVE.titleBlock(m)); const inZ=c=>zones.some(z=>c[0]>=z[0]&&c[0]<=z[2]&&c[1]>=z[1]&&c[1]<=z[3]);
    const list=[];
    // exact vector matches of the legend's typed symbols (per-symbol scale)
    if(hooks.match){const pr=FVE.pageRatios(D,m); const pcols=new Set(m.objects.map(o=>o.stroke||o.fill));
      // the scale most legend symbols agree on for this sheet is tried for every symbol: one symbol's own size histogram can be led astray
      // by look-alike shapes of its colour (a blue square of another size), while the sheet's plotting scale is the same for all blocks
      const trs=new Map(typed.map(e=>[e,FVE.templateRatios(e,m)])), qv={}; for(const tr of trs.values()) for(const x of tr){const k=(Math.round(x.q*25)/25).toFixed(2); qv[k]=(qv[k]||0)+1}
      const qTop=Object.entries(qv).sort((a,b)=>b[1]-a[1])[0], qStar=qTop&&qTop[1]>=3?+qTop[0]:null;
      for(const e of typed){if(!e.segs||e.segs.length<3) continue; if(!e.anyColour&&e.cols&&e.cols.length&&!e.cols.some(c=>pcols.has(c))) continue;
        const tr=trs.get(e), qs=(tr.length?tr:pr.slice(0,1)).map(x=>x.q); if(!qs.some(q=>Math.abs(q-1)<.08)&&!tr.length) qs.push(1);
        if(qStar&&(e.geo||e.hist)&&!qs.some(q=>Math.abs(q-qStar)<.06*qStar)) qs.push(qStar); // geometric rows only: on text legends it cost 12 s on 44-mandarin for no gain
        for(const q of qs) for(const h of (await hooks.match(e,m,q))||[]){const s=Math.max(h.w,h.h)/1.6; list.push({page:m.page.id,bb:[h.x-s/2,h.y-s/2,h.x+s/2,h.y+s/2],c:[h.x,h.y],size:s,hits:[{type:e.type,status:e.status,entry:e.id,score:h.score,dashed:h.dashed||0,recol:h.recol||null,got:h.got||0}],src:{exact:e.id}})}}}
    list.push(...NS.geometry.candidates(m,D,FVE), ...NS.text.candidates(m,D,FVE));
    // one place, one candidate: merge what lands on the same spot (keeping every hit and source)
    const M=[]; for(const c of list){const o=M.find(q=>hyp(q.c[0]-c.c[0],q.c[1]-c.c[1])<Math.max(Math.min(q.size,c.size),2)*.5);
      if(o){o.hits=(o.hits||[]).concat(c.hits||[]); Object.assign(o.src,c.src); if(c.hasShape) o.hasShape=true; if(c.src.anchor&&!o.src.exact){o.bb=c.bb; o.c=c.c; o.size=c.size}} else M.push({...c,src:{...c.src}})}
    for(const c of M){if(inZ(c.c)) continue; const d=NS.geometry.describeAt(m,c); if(d){c.desc=d.desc; c.geoHash=d.geoHash} if(c.hasShape==null) c.hasShape=!!(c.src.anchor||c.src.exact); c.ref=ref++; c.m=m; all.push(c)}}
  const ctxOf=c=>({...graph,m:c.m});
  // pass 1: geometry + text + legend
  const labelled=[]; for(const c of all){const r=matchSymbol(c,ctxOf(c)); c.p1=r; if(r&&r.confidence>=PASS1_LABEL) labelled.push({ref:c.ref,page:c.page,c:c.c,size:c.size,device:r.device,geoHash:c.geoHash})}
  // pass 2: context and network read the confident labels
  graph.contextIndex=NS.context.prepare(labelled); graph.networks={}; graph.netMembers={};
  for(const m of models) if(m.sheet.kind==='plan') graph.networks[m.page.id]=NS.network.build(m,D,FVE);
  for(const l of labelled){const n=NS.network.attach(l,graph.networks[l.page]||[]); if(n) (graph.netMembers[n.id]=graph.netMembers[n.id]||[]).push(l)}
  const dets=[], learn=new Map(); let rejected=0;
  for(const c of all){const r=matchSymbol(c,ctxOf(c)); if(!r){rejected++; continue} if(r.confidence/100<minConf){rejected++; continue}
    const o=dets.find(d=>d.page===c.page&&d.type===r.device&&hyp(d.x-c.c[0],d.y-c.c[1])<Math.max(c.size,2)*.6); if(o){if(r.confidence/100>o.conf) Object.assign(o,{x:c.c[0],y:c.c[1],conf:r.confidence/100}); continue}
    const dd={page:c.page,x:c.c[0],y:c.c[1],w:c.bb[2]-c.bb[0],h:c.bb[3]-c.bb[1],type:r.device,status:r.status,entry:r.entry,score:(c.hits||[]).reduce((a,h)=>Math.max(a,h.score),0)||null,conf:r.confidence/100,
      alt:r.alternatives.map(a=>({type:a.device,conf:a.score/100})),sources:r.sources,fingerprint:r.fingerprint,geoHash:r.geoHash,network:r.network,ev:r.sources.map(s=>({src:s.toLowerCase(),type:r.device})),rules:[],layers:r.layers}; Object.defineProperty(dd,'_hits',{value:c.hits||[],enumerable:false}); dets.push(dd);
    if(r.confidence>=90&&c.geoHash&&!learn.has(c.geoHash)) learn.set(c.geoHash,{geoHash:c.geoHash,device:r.device,fingerprint:r.fingerprint,consultant:graph.consultant||null})}
  // one device per spot: within 1.2 symbol sizes, only the most confident detection of a device family stays
  // (a head with a dropper note beside it proposes two candidates a few points apart)
  dets.sort((a,b)=>b.conf-a.conf); const keep=[];
  // a symbol found in pieces (each half of a wavy blanket outline) has a box smaller than the symbol: the size the exact matches of that
  // family give on the sheet, or the legend's, is the spacing that counts as one spot
  const famSz={}; for(const d of dets) if(d.score){const k=d.page+'|'+family(d.type); (famSz[k]=famSz[k]||[]).push(Math.max(d.w,d.h)/1.6)}
  const legSz={}; for(const e of typed) if(e.bb){const f=family(e.type), z=Math.max(e.bb[2]-e.bb[0],e.bb[3]-e.bb[1]); legSz[f]=Math.max(legSz[f]||0,z)}
  const symSz=d=>{const a=famSz[d.page+'|'+family(d.type)]; if(a&&a.length){a.sort((x,y)=>x-y); return a[a.length>>1]} return legSz[family(d.type)]||0};
  for(const d of dets){const own=Math.max(d.w,d.h,2), big=d.score?own:Math.max(own,symSz(d));
    /* an exact match knows its own size; a symbol size from elsewhere only merges pieces of the same device (a CO2 and a dry powder
       extinguisher side by side stay two) */
    if(keep.some(k=>k.page===d.page&&family(k.type)===family(d.type)&&hyp(k.x-d.x,k.y-d.y)<Math.max(k.type===d.type?big:own,Math.max(k.w,k.h))*1.2)) continue; keep.push(d)}
  // two devices of different families on one spot (a dashed heat-detector template accepting a solid sprinkler disc): the one whose
  // legend symbol matches the drawing better stays — the higher exact score, then the higher confidence
  const gone=new Set();
  for(let i=0;i<keep.length;i++) for(let j=i+1;j<keep.length;j++){const a=keep[i], b=keep[j]; if(gone.has(a)||gone.has(b)||a.page!==b.page||family(a.type)===family(b.type)) continue;
    const r=Math.min(Math.max(a.w,a.h),Math.max(b.w,b.h))*.35; if(hyp(a.x-b.x,a.y-b.y)>r) continue;
    const sa=a.score||0, sb=b.score||0; const lose=Math.abs(sa-sb)>.02?(sa>sb?b:a):(a.conf>=b.conf?b:a); gone.add(lose)}
  // a match centred off the sheet (a symbol clipped at the sheet edge, content outside the media box) is not a device
  const dims=new Map(models.map(m=>[m.page.id,m.page]));
  const onSheet=d=>{const pg=dims.get(d.page); return !pg||(d.x>=0&&d.y>=0&&d.x<=pg.w&&d.y<=pg.h)};
  dets.length=0; dets.push(...keep.filter(d=>!gone.has(d)&&onSheet(d)));
  // status written beside the symbol: legends that tell new / existing / relocated apart by a letter next to the same symbol (N, R …)
  // give each such row its letter; letters the drawing's abbreviations define as a status ('R – RELOCATED') count for any device
  const fam2=family, byId=new Map((D.symbols||[]).map(e=>[e.id,e])); const tagRows={}, rowTags=new Map();
  for(const e of D.symbols||[]) if(e.type&&e.status&&!e.hist) for(const t of e.tags||[]){const k=String(t).trim().toUpperCase(); if(/^[A-Z]{1,2}$/.test(k)){(tagRows[fam2(e.type)]=tagRows[fam2(e.type)]||{})[k]=e.status; rowTags.set(e.id,(rowTags.get(e.id)||[]).concat(k))}}
  const absTag={}; for(const [k,v] of Object.entries(D.abbrev||{})){if(!/^[A-Z]{1,2}$/.test(k)) continue; const st=FVE&&FVE.classifyDesc?FVE.classifyDesc(v).status:null; if(st) absTag[k]=st}
  if(Object.keys(tagRows).length||Object.keys(absTag).length) for(const m of models){const T=m.texts.filter(t=>/^[A-Z]{1,2}$/.test(String(t.s).trim().toUpperCase())); const pd=dets.filter(d=>d.page===m.page.id);
    // one letter, one device: each letter goes to the nearest detection within reach
    const got=new Map(); for(const t of T){const k=String(t.s).trim().toUpperCase(); let best=null, bd=Infinity;
      for(const d of pd){const rows={...absTag,...(tagRows[fam2(d.type)]||{})}; if(!rows[k]) continue; const dd=hyp(t.cx-d.x,t.cy-d.y); if(dd<Math.max(d.w,d.h)*1.1&&dd<bd){bd=dd; best=d}}
      if(best&&(!got.has(best)||got.get(best).d>bd)) got.set(best,{k,d:bd})}
    for(const d of pd){const g=got.get(d), rows={...absTag,...(tagRows[fam2(d.type)]||{})};
      if(g){const st=rows[g.k]; if(st&&st!==d.status){d.statusFrom='tag '+g.k; d.status=st}; continue}
      // no letter beside it: a row that needs one (its legend sample carries N) cannot be this copy — an untagged row of the device that
      // matched here as well takes it (the dashed 'existing' ring, not the 'new' one)
      const need=rowTags.get(d.entry); if(!need||!need.length) continue;
      const alt=(d._hits||[]).filter(h=>h.score>=.85&&fam2(h.type)===fam2(d.type)&&!rowTags.get(h.entry)).sort((a,b)=>b.score-a.score)[0];
      if(alt){const e=byId.get(alt.entry); d.entry=alt.entry; d.status=e&&e.status||alt.status||null; d.statusFrom='untagged row'}}}
  for(const c of all){delete c.m; delete c._l}
  dets.learn=[...learn.values()]; dets.rejected=rejected; dets.candidates=all.length; Object.defineProperty(dets,"pool",{value:all,enumerable:false}); return dets}

NS.run=run; NS.matchSymbol=matchSymbol; NS.statusFor=statusFor; NS.version='1.0.0';
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
