/* AS 2444—2001 Portable fire extinguishers and fire blankets — selection and location (limits as published; checked against the
   standard supplied by the user). Runs when the project has extinguishers.

     4.2.1   Class A: travel distance from any point to the nearest extinguisher ≤ 15 m. A straight line beyond 15 m is certainly
             non-compliant (fail); travel around walls is longer, so 'within 15 m in a straight line' is not proof of compliance.
     Tbl 4.1 floor area per extinguisher by hazard and rating — only when the project states its hazard class (opts.hazard) and the
             extinguishers' Class A ratings are known (opts.ratings; defaults are typical product ratings, confirm against the units).
     4.4.2   significant switchboard (room type SWITCH ROOM): an extinguisher 2–20 m from it, the closest a 5 kg CO2 or ≥ 1A:E with hose.
     4.4.4   cooking oils and fats (room type KITCHEN, when such cooking is present): an extinguisher 2–20 m from the risk, the closest
             F-class (wet chemical).  The room centre stands for the switchboard / cooking risk: positions inside the room are unknown. */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE, U=NS.util;
const RULES={travelM:15,stepM:1,maxPoints:6000,hazard:null,sprinklered:false,
  ratings:{ext_abe:'2A',ext_afff:'3A',ext_wc:null,ext_co2:null},  // typical: 4.5 kg ABE 2A:30B:E, 9 L AFFF 3A:40B; CO2 has no A rating
  switchboard:{minM:2,maxM:20,closest:['ext_co2','ext_abe']},cooking:{minM:2,maxM:20,closest:['ext_wc']},
  // Table 4.1: max floor area per extinguisher (m²) [stand-alone, complementing fixed suppression]
  table41:{light:{'1A':[100,150],'2A':[300,450],'3A':[450,675],'4A':[675,1000]},ordinary:{'2A':[100,150],'3A':[300,450],'4A':[450,675],'6A':[675,1000]},
    high:{'2A':[150,225],'3A':[200,300],'4A':[300,450],'6A':[450,675],'10A':[675,1000]}}};
function check(models,dets,rooms,loops,opts){const R=U.merge(RULES,opts&&opts.rules&&opts.rules.as2444); const F=[]; const S='AS 2444', V=true;
  const ext=(dets||[]).filter(d=>/^ext_/.test(d.type)); if(!ext.length) return F;
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const mpu=m.scale&&m.scale.mPerUnit; const rs=(rooms||[]).filter(r=>r.page===m.page.id); if(!mpu||!rs.length) continue;
    const ex=ext.filter(d=>d.page===m.page.id), reach=R.travelM/mpu;
    // 4.2.1 travel distance (straight-line lower bound)
    for(const r of rs){const c=U.coverage(U.samples(r,mpu,R.stepM,R.maxPoints),ex.map(d=>({x:d.x,y:d.y,reach})));
      if(c.bad) F.push({standard:S,clause:'4.2.1',verified:V,rule:'extinguisher-travel',level:'fail',page:m.page.id,room:r.name,x:c.worst.x,y:c.worst.y,value:U.r1(c.pct),overM:U.r2(c.worst.over*mpu),limit:R.travelM,
        msg:`${r.name}: ${U.r1(c.pct)} % of the floor more than ${R.travelM} m in a straight line from an extinguisher (worst ${U.r2(c.worst.over*mpu)} m over)`})}
    // Table 4.1 floor area per extinguisher, when the hazard is stated
    if(R.hazard&&R.table41[R.hazard]){const T=R.table41[R.hazard], area=rs.reduce((a,r)=>a+(r.area_m2||0),0); let cap=0, unknown=0;
      for(const d of ex){const rt=R.ratings[d.type]; if(rt===undefined){unknown++; continue} if(!rt) continue; const k=Object.keys(T).filter(x=>parseFloat(x)<=parseFloat(rt)).pop(); if(k) cap+=T[k][R.sprinklered?1:0]}
      if(area>cap) F.push({standard:S,clause:'Table 4.1',verified:V,rule:'extinguisher-area',level:'fail',page:m.page.id,value:Math.round(area),limit:Math.round(cap),
        msg:`${m.page.name||'sheet'}: ${Math.round(area)} m² of ${R.hazard} hazard floor, the Class A extinguishers cover ${Math.round(cap)} m²${unknown?` (${unknown} of unknown rating not counted)`:''}`})}
    // 4.4.2 / 4.4.4 the special risks
    for(const [type,rule,clause,lim] of [['SWITCH ROOM','switchboard-extinguisher','4.4.2',R.switchboard],['KITCHEN','cooking-extinguisher','4.4.4',R.cooking]])
      for(const r of rs.filter(x=>x.type===type)){const n=U.nearest(U.centre(r),ex); const what=type==='KITCHEN'?'cooking oils / fats risk (if present)':'switchboard';
        if(!n||n.dist*mpu>lim.maxM) F.push({standard:S,clause,verified:V,rule,level:type==='KITCHEN'?'warn':'fail',page:m.page.id,room:r.name,value:n?U.r1(n.dist*mpu):null,limit:lim.maxM,msg:`${r.name}: no extinguisher within ${lim.maxM} m of the ${what}${n?` (nearest ${U.r1(n.dist*mpu)} m)`:''}`});
        else {if(n.dist*mpu<lim.minM) F.push({standard:S,clause,verified:V,rule,level:'advisory',page:m.page.id,room:r.name,value:U.r1(n.dist*mpu),limit:lim.minM,msg:`${r.name}: nearest extinguisher ${U.r1(n.dist*mpu)} m from the ${what} (at least ${lim.minM} m, so it can be reached in a fire)`});
          if(!lim.closest.includes(n.d.type)) F.push({standard:S,clause,verified:V,rule,level:'warn',page:m.page.id,room:r.name,x:n.d.x,y:n.d.y,msg:`${r.name}: the closest extinguisher is ${n.d.type}; ${type==='KITCHEN'?'an F-class (wet chemical) one':'a 5 kg CO2 (or ≥ 1A:E with hose)'} must be the closest to the ${what}`})}}}
  return F}
NS.standards['AS 2444']={check,RULES,title:'Portable fire extinguishers and fire blankets — selection and location (2001)'};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.standards['AS 2444'];
})(typeof window!=='undefined'?window:globalThis);
