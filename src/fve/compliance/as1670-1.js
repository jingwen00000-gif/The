/* AS 1670.1:2018 Fire detection, warning, control and intercom systems — Part 1: Fire (limits checked against the standard supplied by
   the user). Detection layout only; level ceilings (sloping, beamed > 300 mm, high-airflow areas change the limits — Clauses 4.1.3,
   4.1.5, 5.1.3, 5.1.5, 5.1.6 — so a finding is a question, not a certificate).

     4.1.2 / 5.1.2  any point on the ceiling within 5 m (heat) / 7 m (smoke) of the nearest detector                       coverage, fail
     4.1.2 / 5.1.2  each detector within 7 m (heat) / 10 m (smoke) of its nearest detector of the kind (rooms with ≥ 2)        spacing, fail
     4.1.4 / 5.1.4  not less than 300 mm from a wall or partition                                                            wall-gap, warn
     3.28           a room with no detector, unless a sanitary space under 3.5 m² (or another 3.28 location — confirm)   no-detection, warn
     C3.2           smoke detectors where cooking / steam cause nuisance alarms: locate away, extract air or use alarm
                    mitigation (commentary, not a requirement)                                                      detector-type, advisory
     2.6            one transmission path fault may affect at most one detection zone, and at most 40 devices where detection and
                    occupant warning share the path: short-circuit isolators at least every 40 devices                     isolators, info
     3.14.2         at least one fire alarm MCP in the circulation space of the main entrance                                   mcp, warn
     panel limit    devices per loop beyond the panel's rating (manufacturer, not a clause)                         loop-capacity, warn
     FIP            no fire indicator panel found on the drawings                                                                fip, info */
(function(root){
'use strict';
const NS=root.FVE_AS1670=root.FVE_AS1670||{};  // also registered as FVE_COMPLIANCE.standards['AS 1670.1']
const RULES={
  coverage:{smokeReachM:7,heatReachM:5,stepM:.5,maxPoints:20000,tolerancePct:1},
  spacing:{smokeM:10,heatM:7},
  wallGap:{minM:.3},
  noDetection:{sanitaryMaxM2:3.5,sanitaryTypes:['BATHROOM']},
  detectorType:{nuisanceRooms:['KITCHEN','CARPARK','LOADING DOCK']},
  isolators:{devicesPerIsolator:40},
  loopCapacity:{maxDevices:250},
};
const fam=t=>/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':t==='heat'?'heat':t;
const hyp=Math.hypot;
function inPoly(q,p){let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>q[1])!==(p[j][1]>q[1]))&&(q[0]<(p[j][0]-p[i][0])*(q[1]-p[i][1])/((p[j][1]-p[i][1])||1e-9)+p[i][0])) c=!c} return c}
function edgeDist(q,p){let best=Infinity; for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[j], b=p[i], dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); best=Math.min(best,hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy))} return best}
const r1=v=>Math.round(v*10)/10, r2=v=>Math.round(v*100)/100;
const deepMerge=(a,b)=>{const o={...a}; for(const k in b||{}) o[k]=typeof b[k]==='object'&&!Array.isArray(b[k])?{...a[k],...b[k]}:b[k]; return o};
const cl=(k,heat,smoke)=>k==='heat'?heat:smoke;

function check(models,dets,rooms,loops,opts){opts=opts||{}; const R=deepMerge(RULES,opts.rules); const F=[]; const add=f=>F.push({standard:'AS 1670.1',verified:true,...f});
  const mpuOf=id=>{const m=models.find(x=>x.page.id===id); return m&&m.scale?m.scale.mPerUnit:null};
  const detectors=(dets||[]).filter(d=>fam(d.type)==='smoke'||fam(d.type)==='heat');
  for(const rm of rooms||[]){const mpu=mpuOf(rm.page); const P=rm.pts&&rm.pts.length>=3?rm.pts:[[rm.bb[0],rm.bb[1]],[rm.bb[2],rm.bb[1]],[rm.bb[2],rm.bb[3]],[rm.bb[0],rm.bb[3]]];
    const inside=detectors.filter(d=>d.page===rm.page&&inPoly([d.x,d.y],P));
    if(!inside.length){const sanitary=R.noDetection.sanitaryTypes.includes(rm.type);
      if(!(sanitary&&rm.area_m2!=null&&rm.area_m2<R.noDetection.sanitaryMaxM2))
        add({clause:'3.28',rule:'no-detection',level:'warn',page:rm.page,room:rm.name,x:(rm.bb[0]+rm.bb[2])/2,y:(rm.bb[1]+rm.bb[3])/2,
          msg:`${rm.name}${rm.area_m2?` (${rm.area_m2} m²)`:''}: no detector — only the locations listed in Clause 3.28 may go without${sanitary?` (sanitary spaces only below ${R.noDetection.sanitaryMaxM2} m²)`:''}`});
      continue}
    if(R.detectorType.nuisanceRooms.includes(rm.type)){const s=inside.filter(d=>fam(d.type)==='smoke'); if(s.length) add({clause:'C3.2',rule:'detector-type',level:'advisory',page:rm.page,room:rm.name,x:s[0].x,y:s[0].y,value:s.length,
      msg:`${rm.name}: ${s.length} smoke detector${s.length>1?'s':''} — cooking / exhaust fumes cause nuisance alarms; locate away from the source, extract air or use alarm mitigation (a heat detector is the usual alternative)`})}
    if(!mpu) continue;
    for(const d of inside){const k=fam(d.type), g=edgeDist([d.x,d.y],P)*mpu; if(g<R.wallGap.minM) add({clause:cl(k,'4.1.4','5.1.4'),rule:'wall-gap',level:'warn',page:rm.page,room:rm.name,x:d.x,y:d.y,value:r2(g),limit:R.wallGap.minM,msg:`${rm.name}: ${d.type} detector ${r2(g)} m from the wall (not less than ${R.wallGap.minM} m)`})}
    // each detector's nearest detector of the same kind in the room
    for(const k of ['smoke','heat']){const ds=inside.filter(d=>fam(d.type)===k); if(ds.length<2) continue; const lim=k==='heat'?R.spacing.heatM:R.spacing.smokeM;
      for(const d of ds){const nn=Math.min(...ds.filter(o=>o!==d).map(o=>hyp(o.x-d.x,o.y-d.y)))*mpu; if(nn>lim+.01){ /* 1 cm drawing tolerance */add({clause:cl(k,'4.1.2','5.1.2'),rule:'detector-spacing',level:'fail',page:rm.page,room:rm.name,x:d.x,y:d.y,value:r2(nn),limit:lim,msg:`${rm.name}: ${k} detector ${r2(nn)} m from its nearest ${k} detector (not more than ${lim} m)`}); break}}}
    // every point on the ceiling within reach of a detector
    const reach={smoke:R.coverage.smokeReachM/mpu,heat:R.coverage.heatReachM/mpu};
    const bb=rm.bb, areaPt=(bb[2]-bb[0])*(bb[3]-bb[1]); let step=R.coverage.stepM/mpu; if(areaPt/(step*step)>R.coverage.maxPoints) step=Math.sqrt(areaPt/R.coverage.maxPoints);
    let n=0, bad=0, worst=null;
    for(let x=bb[0]+step/2;x<bb[2];x+=step) for(let y=bb[1]+step/2;y<bb[3];y+=step){if(!inPoly([x,y],P)) continue; n++;
      let ok=false, near=Infinity; for(const d of inside){const dd=hyp(d.x-x,d.y-y), r=reach[fam(d.type)]; if(dd<=r){ok=true; break} near=Math.min(near,dd-r)}
      if(!ok){bad++; if(!worst||near>worst.over) worst={x,y,over:near}}}
    if(n&&100*bad/n>R.coverage.tolerancePct){const kinds=[...new Set(inside.map(d=>fam(d.type)))];
      add({clause:kinds.map(k=>cl(k,'4.1.2','5.1.2')).join(' / '),rule:'coverage',level:'fail',page:rm.page,room:rm.name,x:worst.x,y:worst.y,value:r1(100*bad/n),limit:R.coverage.tolerancePct,overM:r2(worst.over*mpu),detectors:inside.length,
        msg:`${rm.name}: ${r1(100*bad/n)} % of the ceiling more than ${kinds.map(k=>k==='heat'?R.coverage.heatReachM+' m (heat)':R.coverage.smokeReachM+' m (smoke)').join(' / ')} from its ${inside.length} detector${inside.length>1?'s':''} (worst point ${r2(worst.over*mpu)} m too far)`})}}
  for(const l of loops||[]){if(l.circuit!=='detection') continue; const nIso=Math.ceil(l.devices/R.isolators.devicesPerIsolator);
    if(l.devices>R.isolators.devicesPerIsolator) add({clause:'2.6',rule:'isolators',level:'info',page:l.page,loop:l.id,value:nIso,msg:`${l.id}: ${l.devices} devices — a single path fault may affect at most ${R.isolators.devicesPerIsolator} devices (shared detection / warning path) and one zone: at least ${nIso} short-circuit isolators${l.source==='estimated'?' (estimated loop)':''}`});
    if(l.devices>R.loopCapacity.maxDevices) add({clause:null,verified:false,rule:'loop-capacity',level:'warn',page:l.page,loop:l.id,value:l.devices,limit:R.loopCapacity.maxDevices,msg:`${l.id}: ${l.devices} devices on one loop (panel limit ${R.loopCapacity.maxDevices} — manufacturer's rating, not a clause)`})}
  if(detectors.length&&!(dets||[]).some(d=>d.type==='mcp')) add({clause:'3.14.2',rule:'mcp',level:'warn',msg:'no manual call point on these drawings — at least one is required in the circulation space of the main entrance'});
  if(detectors.length&&!(dets||[]).some(d=>d.type==='fip')) add({clause:null,verified:false,rule:'fip',level:'info',msg:'detection devices but no fire indicator panel on these drawings (existing panel, or on another sheet?)'});
  const order={fail:0,warn:1,advisory:2,info:3}; F.sort((a,b)=>order[a.level]-order[b.level]);
  const summary={}; F.forEach(f=>summary[f.level]=(summary[f.level]||0)+1);
  return {findings:F,summary,rules:R,checkedRooms:(rooms||[]).length,isolators:F.filter(f=>f.rule==='isolators').reduce((a,f)=>a+f.value,0)}}

NS.check=check; NS.RULES=RULES;
const C=root.FVE_COMPLIANCE; if(C&&C.standards) C.standards['AS 1670.1']={title:'Fire detection, warning, control and intercom — Part 1: Fire (2018)',RULES,
  check:(models,dets,rooms,loops,opts)=>check(models,dets,rooms,loops,{rules:opts&&opts.rules&&opts.rules['as1670-1']}).findings};
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
