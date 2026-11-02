/* FireTake Learning Engine · network knowledge extractor

   Circuits are the legend's cable line types traced on each plan. A dashed cable arrives in dashes: pieces are joined across the
   dash gap (measured on the sheet: 1.6 × the typical end-to-end gap). Devices the takeoff confirmed are put on a circuit when the
   cable passes within reach, then ordered along it, giving the circuit's sequence and pattern:
       FIP->SD*5->HD->SD*3->MCP      (runs of one device collapsed; panel first when it is on the circuit)
   Per circuit: closed (returns to its start: a class A loop) or radial, length (m), device count and mix. Estimator measurements
   (Line / PolyLine markups) are kept as cable allowances. The network library then holds: which devices sit on which circuit type,
   device-to-device transitions, devices and metres per loop. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const hyp=Math.hypot;
const segDist=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); return {d:hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy),t}};
const CIRCUIT=[['ewis',/EWIS|SPEAKER|WARNING|EVAC|PA\b/],['detection',/DETECT|FIP|LOOP|ALARM|ADDRESSABLE|FIRE\s+INDICATOR/],['cable',/./]];
const circuitOf=desc=>(CIRCUIT.find(([,re])=>re.test(String(desc||'').toUpperCase()))||['cable'])[0];

function gapTol(segs){const ends=segs.flatMap(s=>[s.a,s.b]); const cell=4, G=new Map(), k=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
  ends.forEach((p,i)=>{const kk=k(p[0],p[1]); let a=G.get(kk); if(!a) G.set(kk,a=[]); a.push(i)});
  const ds=[]; ends.forEach((p,i)=>{let best=Infinity; const gx=Math.floor(p[0]/cell), gy=Math.floor(p[1]/cell); for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){const a=G.get((gx+dx)+','+(gy+dy)); if(a) for(const j of a){if(j>>1===i>>1) continue; const d=hyp(ends[j][0]-p[0],ends[j][1]-p[1]); if(d>.05&&d<best) best=d}} if(best<cell*1.5) ds.push(best)});
  if(!ds.length) return .8; ds.sort((a,b)=>a-b); return Math.max(.8,Math.min(6,ds[ds.length>>1]*1.6))}

function compress(seq){const out=[]; for(const c of seq){const l=out[out.length-1]; if(l&&l.c===c) l.n++; else out.push({c,n:1})} return out.map(x=>x.n>1?`${x.c}*${x.n}`:x.c).join('->')}

// devices: [{page (model index), type, x, y}]; codes: type → short code
function extract(models,D,devices,ctx){ctx=ctx||{}; const FVE=ctx.FVE||root.FVE, CODE=ctx.codes||(root.FT_LEARN.symbols&&root.FT_LEARN.symbols.CODE)||{}; const out=[];
  const lts=(D.lineTypes||[]).filter(l=>l.cls==='cable'&&l.stroke&&!l.dupOf);
  models.forEach((m,pi)=>{if(m.sheet&&m.sheet.kind!=='plan') return; const mpu=m.scale?m.scale.mPerUnit:null; const zones=(D.zones&&D.zones[m.page.id]||[]).concat(FVE.titleBlock(m));
    const inZ=p=>zones.some(z=>p[0]>=z[0]&&p[0]<=z[2]&&p[1]>=z[1]&&p[1]<=z[3]); const devs=devices.filter(d=>d.page===pi);
    for(const lt of lts){const objs=m.objects.filter(o=>o.stroke===lt.stroke&&!o.synthetic&&(o.k==='line'||o.k==='polyline'||o.k==='arc'||((o.k==='polygon'||o.k==='rect')&&!o.fill&&o.len>40))&&Math.abs(o.w-lt.w)<=Math.max(.12,lt.w*.3)&&!inZ(o.pts[0]));
      const segs=FVE.segments(objs); if(!segs.length) continue; const tol=lt.dashed?gapTol(segs):Math.max(.6,lt.w*2);
      for(const pts of FVE.chain(segs,tol)){let L=0; const cum=[0]; for(let i=1;i<pts.length;i++){L+=hyp(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); cum.push(L)} if(L<20) continue;
        const reach=ctx.reach||10; const on=[];
        for(const d of devs){let best=null; for(let i=1;i<pts.length;i++){const r=segDist([d.x,d.y],pts[i-1],pts[i]); if(r.d<=reach&&(!best||r.d<best.d)) best={d:r.d,s:cum[i-1]+r.t*(cum[i]-cum[i-1])}} if(best) on.push({d,s:best.s})}
        if(!on.length) continue; on.sort((a,b)=>a.s-b.s);
        let seq=on.map(o=>CODE[o.d.type]||o.d.type.toUpperCase()); const pIdx=seq.indexOf('FIP'); const closed=hyp(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<tol*2;
        if(pIdx>0&&closed) seq=seq.slice(pIdx).concat(seq.slice(0,pIdx));
        const mix={}; on.forEach(o=>mix[o.d.type]=(mix[o.d.type]||0)+1);
        out.push({page:pi,desc:lt.desc,circuit:circuitOf(lt.desc),closed,panel:seq.includes('FIP'),devices:on.length,mix,sequence:seq,pattern:compress(seq),paper:Math.round(L*100)/100,length_m:mpu?Math.round(L*mpu*100)/100:null})}}});
  return out}
// estimator measurements on the takeoff (Line / PolyLine markups) in metres, as cable / pipe allowances
function measurements(models,diff){return (diff.annotations||[]).filter(a=>a.kind==='measure'&&a.len).map(a=>{const m=models[a.page]; const mpu=m&&m.scale?m.scale.mPerUnit:null; return {page:a.page,text:a.text,paper:a.len,length_m:mpu?Math.round(a.len*mpu*100)/100:null,colour:a.colour}})}

NS.network={extract,measurements,compress,circuitOf,gapTol};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.network;
})(typeof window!=='undefined'?window:globalThis);
