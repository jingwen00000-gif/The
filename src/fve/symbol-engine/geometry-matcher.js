/* MSME · layer 1 · geometry match
   candidates(): where devices may be — closed outlines drawn in a legend symbol's colour at a size the legend allows on this sheet
   (legend size × the sheet's symbol scale), each with the objects that sit in it and their fingerprint.
   score(): how well a candidate's shape matches each device's legend symbol (scale-invariant descriptor, or an exact vector match),
   with a weak built-in prior per outline kind for symbols the legend does not show. */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
const FP=()=>NS.fingerprint;
// outline kind → devices it usually is, before any project knowledge (kept low: a prior alone never makes a detection)
const PRIOR={circle:{smoke:.4,heat:.3,speaker:.2,spk_pend:.25},rect:{mcp:.3,heat:.3,smoke:.25,relay:.25,fip:.15},tri:{ext_abe:.3,sounder:.25},poly:{speaker:.2,sounder:.2}};

function legendIndex(D){if(D._msmeIdx) return D._msmeIdx; const typed=D.symbols.filter(e=>e.type&&e.objs&&e.objs.length);
  for(const e of typed) if(!e.desc2){e.desc2=FP().describe(e.objs); e.geoHash=FP().geoHash(e.desc2)}
  const cols=new Set(); typed.forEach(e=>e.objs.forEach(o=>{if(o.stroke) cols.add(o.stroke)}));
  return D._msmeIdx={typed,cols}}

// m: FVE page model, D: project dictionary, FVE: the engine (for templateRatios)
function candidates(m,D,FVE){const {typed,cols}=legendIndex(D); const wins=[];
  for(const e of typed){if(!e.desc2||e.desc2.kind==='open') continue; const qs=(FVE.templateRatios(e,m)||[]).map(x=>x.q); if(!qs.some(q=>Math.abs(q-1)<.08)) qs.push(1);
    for(const q of qs) wins.push({kind:e.desc2.kind,col:e.desc2.col,lo:e.desc2.size*q*.82,hi:e.desc2.size*q*1.22})}
  const out=[];
  for(const o of m.objects){if(!o.closed||!o.stroke||!cols.has(o.stroke)||!(o.k==='circle'||o.k==='rect'||o.k==='polygon')) continue; const s=FP().sizeOf(o), k=FP().kindOf(o);
    if(!wins.some(w=>w.kind===k&&s>=w.lo&&s<=w.hi&&(!w.col||w.col===o.stroke||true))) continue;
    out.push({page:m.page.id,bb:o.bb.slice(),c:o.k==='circle'?o.c.slice():[(o.bb[0]+o.bb[2])/2,(o.bb[1]+o.bb[3])/2],size:s,src:{anchor:o.k}})}
  return out}

// the objects of a candidate (inside its box, a little margin) and their fingerprint
function describeAt(m,cand){const e=cand.size*.18, b=[cand.bb[0]-e,cand.bb[1]-e,cand.bb[2]+e,cand.bb[3]+e];
  const objs=m.index.search(...b).filter(o=>o.bb[0]>=b[0]&&o.bb[2]<=b[2]&&o.bb[1]>=b[1]&&o.bb[3]<=b[3]&&!(!o.stroke&&o.fill==='ffffff'));
  // a symbol with a tail or arrow: let strokes that start inside and leave count as its extension
  const ext=m.index.search(b[0]-cand.size,b[1]-cand.size,b[2]+cand.size,b[3]+cand.size).filter(o=>!objs.includes(o)&&o.stroke&&(o.k==='line'||o.k==='polyline')&&o.len<cand.size*2&&o.pts.some(p=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]));
  const all=objs.concat(ext); if(!all.length) return null; const d=FP().describe(all); return {desc:d,geoHash:FP().geoHash(d),n:all.length}}

function score(cand,ctx){const {typed}=legendIndex(ctx.D); const s={}, ev=[];
  if(cand.desc) for(const e of typed){if(!e.desc2) continue; const sim=FP().similarity(cand.desc,e.desc2); if(sim>=.5&&sim>(s[e.type]||0)){s[e.type]=sim; ev.push({entry:e.id,type:e.type,sim:Math.round(sim*100)/100})}}
  for(const h of cand.hits||[]) if(h.score>(s[h.type]||0)) s[h.type]=h.score;
  if(cand.desc&&PRIOR[cand.desc.kind]) for(const [t,v] of Object.entries(PRIOR[cand.desc.kind])) if(!(t in s)) s[t]=v;
  return {scores:s,ev}}

NS.geometry={candidates,describeAt,score,legendIndex,PRIOR};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.geometry;
})(typeof window!=='undefined'?window:globalThis);
