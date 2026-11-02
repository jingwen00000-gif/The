/* FireTake compliance · shared geometry
   The floor we know on a sheet is its named rooms (closed outlines); distances on it are straight lines, which are a LOWER bound of
   travel / hose-route distance — so a point beyond a limit in a straight line is certainly beyond it, a point inside may still not be
   reachable around walls. Each standard module decides which side of that it reports. */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE=root.FVE_COMPLIANCE||{};
NS.standards=NS.standards||{};
const hyp=Math.hypot;
const fam=t=>/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':/^ext_/.test(t)?'extinguisher':/^(speaker|spk_surf|horn|proj_spk)$/.test(t)?'speaker':t;
function inPoly(q,p){let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>q[1])!==(p[j][1]>q[1]))&&(q[0]<(p[j][0]-p[i][0])*(q[1]-p[i][1])/((p[j][1]-p[i][1])||1e-9)+p[i][0])) c=!c} return c}
function edgeDist(q,p){let best=Infinity; for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[j], b=p[i], dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); best=Math.min(best,hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy))} return best}
const polyOf=r=>r.pts&&r.pts.length>=3?r.pts:[[r.bb[0],r.bb[1]],[r.bb[2],r.bb[1]],[r.bb[2],r.bb[3]],[r.bb[0],r.bb[3]]];
const centre=r=>[(r.bb[0]+r.bb[2])/2,(r.bb[1]+r.bb[3])/2];
// sample points inside one room every stepM metres (at most maxPoints)
function samples(r,mpu,stepM,maxPoints){const P=polyOf(r), bb=r.bb; let step=stepM/mpu; const A=(bb[2]-bb[0])*(bb[3]-bb[1]); if(A/(step*step)>maxPoints) step=Math.sqrt(A/maxPoints);
  const out=[]; for(let x=bb[0]+step/2;x<bb[2];x+=step) for(let y=bb[1]+step/2;y<bb[3];y+=step) if(inPoly([x,y],P)) out.push([x,y]); return out}
// how much of a room lies beyond reach (points: [[x,y]], sources: [{x,y,reach}] in page units) → {n, bad, pct, worst:{x,y,over}}
function coverage(pts,sources){let bad=0, worst=null;
  for(const [x,y] of pts){let ok=false, near=Infinity; for(const s of sources){const d=hyp(s.x-x,s.y-y); if(d<=s.reach){ok=true; break} near=Math.min(near,d-s.reach)} if(!ok){bad++; if(!worst||near>worst.over) worst={x,y,over:near}}}
  return {n:pts.length,bad,pct:pts.length?100*bad/pts.length:0,worst}}
const nearest=(q,devs)=>{let best=null, bd=Infinity; for(const d of devs){const dd=hyp(d.x-q[0],d.y-q[1]); if(dd<bd){bd=dd; best=d}} return best?{d:best,dist:bd}:null};
const r1=v=>Math.round(v*10)/10, r2=v=>Math.round(v*100)/100;
const merge=(a,b)=>{const o={...a}; for(const k in b||{}) o[k]=b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])?{...(a[k]||{}),...b[k]}:b[k]; return o};
NS.util={fam,inPoly,edgeDist,polyOf,centre,samples,coverage,nearest,r1,r2,merge,hyp};
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
