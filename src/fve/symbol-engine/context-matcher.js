/* MSME · layer 4 · context match
   Devices cluster: an uncertain symbol among confirmed smoke detectors is most likely another. Two votes, the stronger wins:
     neighbours   confirmed devices within 30 symbol sizes, nearer counting more (1 / (1 + d / size))
     same block   every candidate with the same geoHash across the project — identical geometry, identical device
   Labels come from the first pass (geometry + text + legend); a candidate never votes for itself. */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
const hyp=Math.hypot;

// labelled: [{page,c,size,device,geoHash}] from pass 1 (confident only)
function prepare(labelled){const byPage={}, byHash={}; for(const l of labelled){(byPage[l.page]=byPage[l.page]||[]).push(l); if(l.geoHash) (byHash[l.geoHash]=byHash[l.geoHash]||[]).push(l)} return {byPage,byHash}}

function score(cand,ctx){const P=ctx.contextIndex; if(!P) return {scores:{},ev:[]}; const s={}, ev=[];
  const R=cand.size*30, nb=(P.byPage[cand.page]||[]).filter(l=>l.ref!==cand.ref&&Math.abs(l.c[0]-cand.c[0])<R&&Math.abs(l.c[1]-cand.c[1])<R);
  let W=0; const w={}; for(const l of nb){const d=hyp(l.c[0]-cand.c[0],l.c[1]-cand.c[1]); if(d>R) continue; const x=1/(1+d/(cand.size||1)); W+=x; w[l.device]=(w[l.device]||0)+x}
  if(W>0){const strength=Math.min(1,W/1.5); for(const [t,x] of Object.entries(w)) s[t]=(x/W)*strength; ev.push({src:'neighbours',n:nb.length,share:Object.fromEntries(Object.entries(w).map(([t,x])=>[t,Math.round(100*x/W)/100]))})}
  const same=cand.geoHash?(P.byHash[cand.geoHash]||[]).filter(l=>l.ref!==cand.ref):[];
  if(same.length){const n={}; same.forEach(l=>n[l.device]=(n[l.device]||0)+1); const k=Math.min(1,same.length/3);
    for(const [t,c] of Object.entries(n)){const v=(c/same.length)*k; if(v>(s[t]||0)) s[t]=v} ev.push({src:'same-geometry',geoHash:cand.geoHash,n:same.length,devices:n})}
  return {scores:s,ev}}

NS.context={prepare,score};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.context;
})(typeof window!=='undefined'?window:globalThis);
