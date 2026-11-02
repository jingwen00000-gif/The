/* FireTake loop engine — device / cable graph, loops and loop lengths

   drawn loops   the legend's cable line types (FVE line types of class 'cable') traced on each plan. A dashed cable arrives in dashes:
                 pieces are joined across the dash gap measured on that sheet. A cable that stops at a device symbol and carries on from
                 its other side is one loop: chains whose ends meet at the same device are merged. Devices are on a loop when the cable
                 passes within reach of them (1.5 symbol sizes, at least 8 pt); they are ordered along it. Per loop: circuit (detection /
                 EWIS), closed (returns to its start: class A) or radial, panel (FIP on the loop or at an end), devices and mix, length (m).
   estimated     devices of a circuit that no drawn cable reaches (cabling not drawn, or drawn on another sheet): an orthogonal route
                 (cable runs along the ceiling grid, so distances are |dx| + |dy|) from the panel — or the device nearest a corner when the
                 sheet has none — visiting every device, nearest-neighbour then 2-opt, cut into loops of at most maxDevices and closed back
                 to the start, plus slack (10 %) and a drop per device (1.5 m). Always labelled estimated, never mixed with measured length.
                 With a knowledge base, the metres per device of the consultant's finished loops is given alongside.

   FVE_LOOPS.detect(models, D, dets, opts) → loops[]   FVE_LOOPS.estimate(models, dets, covered, opts) → loops[]   FVE_LOOPS.run(...) both */
(function(root){
'use strict';
const NS=root.FVE_LOOPS=root.FVE_LOOPS||{};
const hyp=Math.hypot;
const DETECTION=new Set(['smoke','heat','mcp','relay','sounder','cs_smoke','duct_probe','flowsw','door_mag','fip','beam','asp']), EWIS=new Set(['speaker','spk_surf','horn','proj_spk','strobe']);
const circuitOf=desc=>/EWIS|SPEAKER|WARNING|EVAC|\bPA\b/.test(String(desc||'').toUpperCase())?'ewis':'detection';
const circuitOfType=t=>EWIS.has(t)?'ewis':DETECTION.has(t)?'detection':null;
const CODE={smoke:'SD',heat:'HD',mcp:'MCP',fip:'FIP',speaker:'SPK',spk_surf:'SPK',horn:'HN',sounder:'VAD',relay:'IO',wip:'WIP',cs_smoke:'CSD',duct_probe:'DSD',door_mag:'DH',flowsw:'FS'};
const segDist=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); return {d:hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy),t}};
const compress=seq=>{const out=[]; for(const c of seq){const l=out[out.length-1]; if(l&&l.c===c) l.n++; else out.push({c,n:1})} return out.map(x=>x.n>1?`${x.c}*${x.n}`:x.c).join('->')};
const r2=v=>Math.round(v*100)/100;

// the dash gap of a dashed cable on this sheet: 1.6 × the typical end-to-end distance between neighbouring pieces
function gapTol(segs){const ends=segs.flatMap(s=>[s.a,s.b]), cell=4, G=new Map(), key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
  ends.forEach((p,i)=>{const k=key(p[0],p[1]); let a=G.get(k); if(!a) G.set(k,a=[]); a.push(i)});
  const ds=[]; ends.forEach((p,i)=>{let best=Infinity; const gx=Math.floor(p[0]/cell), gy=Math.floor(p[1]/cell);
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){const a=G.get((gx+dx)+','+(gy+dy)); if(a) for(const j of a){if(j>>1===i>>1) continue; const d=hyp(ends[j][0]-p[0],ends[j][1]-p[1]); if(d>.05&&d<best) best=d}}
    if(best<cell*1.5) ds.push(best)});
  if(!ds.length) return .8; ds.sort((a,b)=>a-b); return Math.max(.8,Math.min(6,ds[ds.length>>1]*1.6))}

function detect(models,D,dets,opts){opts=opts||{}; const FVE=opts.FVE||root.FVE; const out=[];
  const lts=(D.lineTypes||[]).filter(l=>l.cls==='cable'&&l.stroke&&!l.dupOf);
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const mpu=m.scale?m.scale.mPerUnit:null;
    const zones=(D.zones&&D.zones[m.page.id]||[]).concat(FVE.titleBlock(m)), inZ=p=>zones.some(z=>p[0]>=z[0]&&p[0]<=z[2]&&p[1]>=z[1]&&p[1]<=z[3]);
    const devs=dets.filter(d=>d.page===m.page.id&&circuitOfType(d.type));
    for(const lt of lts){const circuit=circuitOf(lt.desc);
      const objs=m.objects.filter(o=>o.stroke===lt.stroke&&!o.synthetic&&(o.k==='line'||o.k==='polyline'||o.k==='arc'||((o.k==='polygon'||o.k==='rect')&&!o.fill&&o.len>40))&&Math.abs(o.w-lt.w)<=Math.max(.12,lt.w*.3)&&!inZ(o.pts[0]));
      const segs=FVE.segments(objs); if(!segs.length) continue; const tol=lt.dashed?gapTol(segs):Math.max(.6,lt.w*2);
      const chains=FVE.chain(segs,tol).map(pts=>{let L=0; const cum=[0]; for(let i=1;i<pts.length;i++){L+=hyp(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); cum.push(L)} return {pts,cum,L}}).filter(c=>c.L>=tol*3);
      // devices on each chain, with their position along it
      const reachOf=d=>Math.max(8,1.5*Math.max(d.w||0,d.h||0)/1.6);
      const devCircuitOk=d=>circuitOfType(d.type)===circuit||d.type==='fip';
      chains.forEach(c=>{c.on=[];
        // each vertex belongs to the device nearest it (a tag-only detector beside a looped one does not share its vertex)
        const owner=c.pts.map(p=>{let o=null, od=Infinity; for(const d of devs){if(!devCircuitOk(d)) continue; const dd=hyp(p[0]-d.x,p[1]-d.y); if(dd<od&&dd<=reachOf(d)){od=dd; o=d}} return o});
        for(const d of devs){if(!devCircuitOk(d)) continue; const R=reachOf(d); let best=null;
        // connected = the cable turns or ends at the device (a vertex within reach), or runs right through the symbol; passing by is not
        for(let i=0;i<c.pts.length;i++){if(owner[i]!==d) continue; const dv=hyp(c.pts[i][0]-d.x,c.pts[i][1]-d.y); if(!best||dv<best.d) best={d:dv,s:c.cum[i]}}
        for(let i=1;i<c.pts.length;i++){const r=segDist([d.x,d.y],c.pts[i-1],c.pts[i]); if(r.d<=R*.35&&(!best||r.d<best.d)) best={d:r.d,s:c.cum[i-1]+r.t*(c.cum[i]-c.cum[i-1])}}
        if(best) c.on.push({d,s:best.s})} c.on.sort((a,b)=>a.s-b.s)});
      // a cable broken at a device symbol continues from its other side: chains meeting at one device are one loop
      const par=chains.map((_,i)=>i), find=i=>par[i]===i?i:(par[i]=find(par[i]));
      const ends=new Map(); chains.forEach((c,i)=>{for(const o of c.on){const R=reachOf(o.d)*1.6; const atEnd=hyp(c.pts[0][0]-o.d.x,c.pts[0][1]-o.d.y)<R||hyp(c.pts[c.pts.length-1][0]-o.d.x,c.pts[c.pts.length-1][1]-o.d.y)<R;
        if(atEnd){const k=o.d; if(ends.has(k)) par[find(i)]=find(ends.get(k)); else ends.set(k,i)}}});
      const groups={}; chains.forEach((c,i)=>(groups[find(i)]=groups[find(i)]||[]).push(c));
      for(const g of Object.values(groups)){const seen=new Set(), members=[]; for(const c of g) for(const o of c.on) if(!seen.has(o.d)){seen.add(o.d); members.push(o.d)}
        if(members.filter(d=>d.type!=='fip').length<2) continue;
        let order=g.length===1?g[0].on.map(o=>o.d):route(members,members.find(d=>d.type==='fip')||null,false).order;
        const one=g.length===1?g[0]:null, closed=!!one&&hyp(one.pts[0][0]-one.pts[one.pts.length-1][0],one.pts[0][1]-one.pts[one.pts.length-1][1])<tol*2;
        const fi=order.findIndex(d=>d.type==='fip'); if(fi>0&&closed) order=order.slice(fi).concat(order.slice(0,fi));
        const L=g.reduce((a,c)=>a+c.L,0), mix={}; order.forEach(d=>mix[d.type]=(mix[d.type]||0)+1); const seq=order.map(d=>CODE[d.type]||d.type.toUpperCase());
        out.push({id:'',page:m.page.id,source:'drawn',circuit,desc:lt.desc,lineType:lt.id,closed,panel:fi>=0,devices:order.filter(d=>d.type!=='fip').length,mix,sequence:seq,pattern:compress(seq),
          paper:r2(L),length_m:mpu?r2(L*mpu):null,chains:g.length,members:order,route:one?one.pts:null})}}}
  out.forEach((l,i)=>l.id=`L${i+1}`); return out}

// orthogonal route through the points: nearest neighbour from the start, then 2-opt; closed returns to the start
const man=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function route(pts,start,closed){if(!pts.length) return {order:[],L:0}; const left=pts.slice(); let cur=start&&left.includes(start)?start:left[0];
  const order=[cur]; left.splice(left.indexOf(cur),1);
  while(left.length){let bi=0, bd=Infinity; left.forEach((p,i)=>{const d=man(cur,p); if(d<bd){bd=d; bi=i}}); cur=left.splice(bi,1)[0]; order.push(cur)}
  const n=order.length, len=o=>{let L=0; for(let i=1;i<o.length;i++) L+=man(o[i-1],o[i]); if(closed&&o.length>1) L+=man(o[o.length-1],o[0]); return L};
  if(n>3&&n<=400){let better=true, guard=0; while(better&&guard++<50){better=false;
    for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){const a=order[i-1], b=order[i], c=order[k], d=closed||k<n-1?order[(k+1)%n]:null;
      const before=man(a,b)+(d?man(c,d):0), after=man(a,c)+(d?man(b,d):0); if(after<before-1e-6){const seg=order.slice(i,k+1).reverse(); order.splice(i,seg.length,...seg); better=true}}}}
  return {order,L:len(order)}}

// covered: devices already on a drawn loop
function estimate(models,dets,covered,opts){opts=opts||{}; const maxDev=opts.maxDevices||125, slack=opts.slack!=null?opts.slack:.1, drop=opts.dropM!=null?opts.dropM:1.5; const out=[];
  const cov=covered instanceof Set?covered:new Set(covered||[]);
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const mpu=m.scale?m.scale.mPerUnit:null;
    const onPage=dets.filter(d=>d.page===m.page.id); const fip=onPage.find(d=>d.type==='fip')||null;
    for(const circuit of ['detection','ewis']){const devs=onPage.filter(d=>circuitOfType(d.type)===circuit&&d.type!=='fip'&&!cov.has(d)); if(devs.length<2) continue;
      // start: the panel, else the device nearest the sheet's bottom-left (risers and panels usually sit by a core)
      const start=fip||devs.slice().sort((a,b)=>(a.x+(m.page.h-a.y))-(b.x+(m.page.h-b.y)))[0];
      const all=fip?[fip,...devs]:devs; const R=route(all,start,false).order.filter(d=>d!==fip);
      for(let k=0;k<R.length;k+=maxDev){const part=R.slice(k,k+maxDev), head=fip||part[0]; const path=fip?[fip,...part]:part; let L=0; for(let i=1;i<path.length;i++) L+=man(path[i-1],path[i]); L+=man(path[path.length-1],head);
        const mix={}; part.forEach(d=>mix[d.type]=(mix[d.type]||0)+1); const seq=(fip?['FIP']:[]).concat(part.map(d=>CODE[d.type]||d.type.toUpperCase()));
        const lm=mpu?r2(L*mpu*(1+slack)+part.length*drop):null;
        out.push({id:'',page:m.page.id,source:'estimated',circuit,closed:true,panel:!!fip,devices:part.length,mix,sequence:seq,pattern:compress(seq),paper:r2(L),length_m:lm,
          basis:{orthogonal:true,slack,dropM:drop,maxDevices:maxDev},note:opts.drawnOn&&opts.drawnOn.has(m.page.id+'|'+circuit)?'devices the drawn cable does not reach':'no cable drawn',historical_m:opts.metresPerDevice?r2(opts.metresPerDevice*part.length):null,members:part,route:path.concat([head]).map(d=>[d.x,d.y])})}}}
  out.forEach((l,i)=>l.id=`E${i+1}`); return out}

function run(models,D,dets,opts){opts=opts||{}; const drawn=detect(models,D,dets,opts); const covered=new Set(drawn.flatMap(l=>l.members));
  const K=opts.knowledge, mpd=K&&K.loops&&K.loops.metresPerDevice&&K.loops.metresPerDevice.n>=3?K.loops.metresPerDevice.avg:null;
  const drawnOn=new Set(drawn.map(l=>l.page+'|'+l.circuit)); const est=opts.estimate===false?[]:estimate(models,dets,covered,{...opts,metresPerDevice:mpd,drawnOn}); return drawn.concat(est)}

NS.detect=detect; NS.estimate=estimate; NS.run=run; NS.route=route; NS.gapTol=gapTol; NS.circuitOf=circuitOf; NS.circuitOfType=circuitOfType; NS.compress=compress; NS.CODE=CODE;
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
