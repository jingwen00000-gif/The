/* AS 1670.1 — fire detection (detection layout, not installation).
   NOT VERIFIED against the standard: AS 1670.1 was not supplied, so the limits below are the commonly used flat-ceiling values and
   every finding carries verified:false and no clause number. Supply the standard to have them checked clause by clause.

   What can be checked from the drawing: device positions and types, named rooms with their outline and area, loops, the scale.
   Every rule is a parameter set (RULES) — the defaults are the common flat-ceiling values; a ceiling over the height limit, a sloped,
   beamed or coffered ceiling, or a different detector listing changes them, so each finding says what was measured against what
   limit and is a question for the designer / estimator, not a certificate.

     coverage       every point of a room within reach of a detector: smoke spacing 10.4 m (reach 10.4 / √2 = 7.35 m), heat 7.2 m
                    (5.09 m); sampled on a grid, the worst point reported                                              fail
     wall-gap       a point detector closer than 0.3 m to a wall (dead air at the wall / ceiling junction)           warn
     no-detection   a room with no detector at all (room types listed as exempt are skipped; exemptions such as
                    sprinkler-protected or small toilets must be confirmed against the standard)                      warn
     detector-type  a smoke detector in a room type where cooking / exhaust causes nuisance alarms (kitchen, car park)
                    — a heat detector is the usual choice                                                            advisory
     isolators      a detection loop with more than 40 devices needs short-circuit isolators: at least ceil(n / 40)   info
     loop-capacity  a loop beyond the panel's device limit (parameter, default 250)                                  warn
     mcp            a plan with detectors and no manual call point                                                   warn
     fip            detection devices on the project and no fire indicator panel found                               info

   FVE_AS1670.check(models, dets, rooms, loops, opts) → {findings:[…], summary, rules} */
(function(root){
'use strict';
const NS=root.FVE_AS1670=root.FVE_AS1670||{};  // also registered as FVE_COMPLIANCE.standards['AS 1670.1']
const RULES={
  coverage:{smokeSpacing:10.4,heatSpacing:7.2,stepM:.5,maxPoints:20000,tolerancePct:1},
  wallGap:{minM:.3},
  noDetection:{exempt:['BATHROOM','LIFT'],minAreaM2:1},
  detectorType:{heatRooms:['KITCHEN','CARPARK','LOADING DOCK']},
  isolators:{devicesPerIsolator:40},
  loopCapacity:{maxDevices:250},
};
const fam=t=>/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':t==='heat'?'heat':t;
const hyp=Math.hypot;
function inPoly(q,p){let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>q[1])!==(p[j][1]>q[1]))&&(q[0]<(p[j][0]-p[i][0])*(q[1]-p[i][1])/((p[j][1]-p[i][1])||1e-9)+p[i][0])) c=!c} return c}
function edgeDist(q,p){let best=Infinity; for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[j], b=p[i], dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); best=Math.min(best,hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy))} return best}
const r1=v=>Math.round(v*10)/10, r2=v=>Math.round(v*100)/100;
const deepMerge=(a,b)=>{const o={...a}; for(const k in b||{}) o[k]=typeof b[k]==='object'&&!Array.isArray(b[k])?{...a[k],...b[k]}:b[k]; return o};

function check(models,dets,rooms,loops,opts){opts=opts||{}; const R=deepMerge(RULES,opts.rules); const F=[]; const add=f=>F.push(f);
  const mpuOf=id=>{const m=models.find(x=>x.page.id===id); return m&&m.scale?m.scale.mPerUnit:null};
  const detectors=(dets||[]).filter(d=>fam(d.type)==='smoke'||fam(d.type)==='heat');
  for(const rm of rooms||[]){const mpu=mpuOf(rm.page); const P=rm.pts&&rm.pts.length>=3?rm.pts:[[rm.bb[0],rm.bb[1]],[rm.bb[2],rm.bb[1]],[rm.bb[2],rm.bb[3]],[rm.bb[0],rm.bb[3]]];
    const inside=detectors.filter(d=>d.page===rm.page&&inPoly([d.x,d.y],P));
    // no detection at all
    if(!inside.length){if(!R.noDetection.exempt.includes(rm.type)&&!(rm.area_m2!=null&&rm.area_m2<R.noDetection.minAreaM2))
        add({rule:'no-detection',level:'warn',page:rm.page,room:rm.name,x:(rm.bb[0]+rm.bb[2])/2,y:(rm.bb[1]+rm.bb[3])/2,msg:`${rm.name}${rm.area_m2?` (${rm.area_m2} m²)`:''}: no detector — confirm it is an exempt area`});
      continue}
    // a smoke detector where heat is the usual choice
    if(R.detectorType.heatRooms.includes(rm.type)){const s=inside.filter(d=>fam(d.type)==='smoke'); if(s.length) add({rule:'detector-type',level:'advisory',page:rm.page,room:rm.name,x:s[0].x,y:s[0].y,value:s.length,msg:`${rm.name}: ${s.length} smoke detector${s.length>1?'s':''} — a heat detector is usual in a ${rm.type.toLowerCase()} (nuisance alarms)`})}
    if(!mpu) continue;
    // too close to a wall
    for(const d of inside){const g=edgeDist([d.x,d.y],P)*mpu; if(g<R.wallGap.minM) add({rule:'wall-gap',level:'warn',page:rm.page,room:rm.name,x:d.x,y:d.y,value:r2(g),limit:R.wallGap.minM,msg:`${rm.name}: ${d.type} ${r2(g)} m from the wall (minimum ${R.wallGap.minM} m)`})}
    // coverage: every point within reach of a smoke (spacing / √2) or heat detector
    const reach={smoke:R.coverage.smokeSpacing/Math.SQRT2/mpu,heat:R.coverage.heatSpacing/Math.SQRT2/mpu};
    const bb=rm.bb, areaPt=(bb[2]-bb[0])*(bb[3]-bb[1]); let step=R.coverage.stepM/mpu; if(areaPt/(step*step)>R.coverage.maxPoints) step=Math.sqrt(areaPt/R.coverage.maxPoints);
    let n=0, bad=0, worst=null;
    for(let x=bb[0]+step/2;x<bb[2];x+=step) for(let y=bb[1]+step/2;y<bb[3];y+=step){if(!inPoly([x,y],P)) continue; n++;
      let ok=false, near=Infinity; for(const d of inside){const dd=hyp(d.x-x,d.y-y), r=reach[fam(d.type)]; if(dd<=r){ok=true; break} near=Math.min(near,dd-r)}
      if(!ok){bad++; if(!worst||near>worst.over) worst={x,y,over:near}}}
    if(n&&100*bad/n>R.coverage.tolerancePct){const kinds=[...new Set(inside.map(d=>fam(d.type)))];
      add({rule:'coverage',level:'fail',page:rm.page,room:rm.name,x:worst.x,y:worst.y,value:r1(100*bad/n),limit:R.coverage.tolerancePct,overM:r2(worst.over*mpu),detectors:inside.length,
        msg:`${rm.name}: ${r1(100*bad/n)} % of the ceiling beyond reach of its ${inside.length} ${kinds.join(' / ')} detector${inside.length>1?'s':''} (worst point ${r2(worst.over*mpu)} m too far; spacing ${kinds.map(k=>k==='smoke'?R.coverage.smokeSpacing:R.coverage.heatSpacing).join(' / ')} m)`})}}
  // loops: isolators and capacity
  for(const l of loops||[]){if(l.circuit!=='detection') continue; const nIso=Math.ceil(l.devices/R.isolators.devicesPerIsolator);
    if(l.devices>R.isolators.devicesPerIsolator) add({rule:'isolators',level:'info',page:l.page,loop:l.id,value:nIso,msg:`${l.id}: ${l.devices} devices — at least ${nIso} short-circuit isolators (≤ ${R.isolators.devicesPerIsolator} devices between isolators)${l.source==='estimated'?' (estimated loop)':''}`});
    if(l.devices>R.loopCapacity.maxDevices) add({rule:'loop-capacity',level:'warn',page:l.page,loop:l.id,value:l.devices,limit:R.loopCapacity.maxDevices,msg:`${l.id}: ${l.devices} devices on one loop (panel limit ${R.loopCapacity.maxDevices})`})}
  // per plan: manual call points; per project: the panel
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const on=(dets||[]).filter(d=>d.page===m.page.id);
    if(on.some(d=>fam(d.type)==='smoke'||fam(d.type)==='heat')&&!on.some(d=>d.type==='mcp')) add({rule:'mcp',level:'warn',page:m.page.id,msg:`${m.page.name||'sheet'}: detectors but no manual call point`})}
  if(detectors.length&&!(dets||[]).some(d=>d.type==='fip')) add({rule:'fip',level:'info',msg:'detection devices but no fire indicator panel on these drawings (existing panel, or on another sheet?)'});
  const order={fail:0,warn:1,advisory:2,info:3}; F.sort((a,b)=>order[a.level]-order[b.level]);
  const summary={}; F.forEach(f=>summary[f.level]=(summary[f.level]||0)+1);
  return {findings:F,summary,rules:R,checkedRooms:(rooms||[]).length,isolators:F.filter(f=>f.rule==='isolators').reduce((a,f)=>a+f.value,0)}}

NS.check=check; NS.RULES=RULES;
const C=root.FVE_COMPLIANCE; if(C&&C.standards) C.standards['AS 1670.1']={title:'Fire detection — system design (limits not verified: standard not supplied)',RULES,
  check:(models,dets,rooms,loops,opts)=>check(models,dets,rooms,loops,{rules:opts&&opts.rules&&opts.rules['as1670-1']}).findings.map(f=>({standard:'AS 1670.1',clause:null,verified:false,...f}))};
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
