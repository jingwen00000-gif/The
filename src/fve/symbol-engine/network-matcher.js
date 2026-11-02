/* MSME · layer 5 · network match
   Devices on one circuit share a family: a symbol on the detection loop between two smoke detectors is a detector, one on the
   EWIS circuit among speakers is a speaker. Circuits are the legend's cable line types traced on each plan (FVE line types with
   class 'cable'); a device is on a circuit when the cable passes within reach of it. With no members confirmed yet, the circuit's
   own name gives a family prior (EWIS → speaker, detection / FIP loop → detectors). */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
const hyp=Math.hypot;
const segDist=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); return hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy)};
const FAMILY_PRIOR=[[/EWIS|SPEAKER|PA\b|WARNING/,{speaker:.6,spk_surf:.5,horn:.4}],[/DETECT|FIP|LOOP|ALARM|ADDRESSABLE/,{smoke:.5,heat:.5,mcp:.4,relay:.3,sounder:.3}]];

// networks on one plan: [{id,desc,segs,bb}] from the legend's cable line types
function build(m,D,FVE){const out=[]; const lts=(D.lineTypes||[]).filter(l=>l.cls==='cable'&&l.stroke&&!l.dupOf);
  for(const lt of lts){const objs=m.objects.filter(o=>o.stroke===lt.stroke&&!o.synthetic&&(o.k==='line'||o.k==='polyline'||o.k==='arc'||((o.k==='polygon'||o.k==='rect')&&!o.fill&&o.len>40))&&Math.abs(o.w-lt.w)<=Math.max(.12,lt.w*.3));
    const segs=FVE.segments(objs); if(!segs.length) continue;
    for(const pts of FVE.chain(segs,Math.max(1.5,lt.w*3))){const S=[]; for(let i=1;i<pts.length;i++) S.push([pts[i-1],pts[i]]); const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
      out.push({id:lt.id+':'+out.length,desc:lt.desc,segs:S,bb:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]})}}
  return out}
// which network a candidate sits on (cable within 1.4 symbol sizes of its centre)
function attach(cand,nets){const tol=Math.max(3,cand.size*1.4); for(const n of nets){if(cand.c[0]<n.bb[0]-tol||cand.c[0]>n.bb[2]+tol||cand.c[1]<n.bb[1]-tol||cand.c[1]>n.bb[3]+tol) continue;
    if(n.segs.some(([a,b])=>segDist(cand.c,a,b)<=tol)) return n} return null}

function score(cand,ctx){const nets=ctx.networks&&ctx.networks[cand.page]; if(!nets||!nets.length) return {scores:{},ev:[]}; const n=attach(cand,nets); if(!n) return {scores:{},ev:[]};
  const s={}; const mem=(ctx.netMembers&&ctx.netMembers[n.id]||[]).filter(l=>l.ref!==cand.ref);
  if(mem.length){const c={}; mem.forEach(l=>c[l.device]=(c[l.device]||0)+1); const k=Math.min(1,mem.length/3); for(const [t,v] of Object.entries(c)) s[t]=(v/mem.length)*k}
  const pr=FAMILY_PRIOR.find(([re])=>re.test(String(n.desc).toUpperCase())); if(pr) for(const [t,v] of Object.entries(pr[1])) if(!(s[t]>=v)) s[t]=Math.max(s[t]||0,v*(mem.length?.5:1));
  // what finished jobs found on circuits of this kind (Learning Engine network library): the share of each device on such loops
  const K=ctx.knowledge, circ=/EWIS|SPEAKER|WARNING|EVAC|\bPA\b/.test(String(n.desc).toUpperCase())?'ewis':'detection';
  const np=K&&(K.networkPriors||[]).find(p=>p.circuit===circ&&p.loops>=2);
  if(np) for(const [t,sh] of Object.entries(np.share||{})) if(sh>=.1){const v=(.4+.4*sh)*(mem.length?.5:1); if(!(s[t]>=v)) s[t]=v}
  return {scores:s,ev:[{src:'network',network:n.id,desc:n.desc,members:mem.length}],network:n.id}}

NS.network={build,attach,score,FAMILY_PRIOR};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.network;
})(typeof window!=='undefined'?window:globalThis);
