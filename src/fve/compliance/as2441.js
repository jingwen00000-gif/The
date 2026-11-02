/* AS 2441—2005 Installation of fire hose reels (limits as published; checked against the standard supplied by the user).
   Runs when the project has hose reels.

     10.2   every point on a floor within reach of a 4 m stream from the end of a hose of at most 36 m laid on the floor by the most
            direct route (car parks: the arc of hose length + 4 m). In a straight line beyond 36 + 4 m: certainly not covered (fail);
            between 30 and 40 m: covered only if the hose route around walls, partitions and doors is ≤ 36 m (advisory: check route).
     10.1   not in fire-isolated exits (room type STAIR): warn — confirm whether the stair is fire-isolated. */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE, U=NS.util;
const RULES={hoseM:36,streamM:4,checkRouteFromM:30,stepM:1,maxPoints:6000};
function check(models,dets,rooms,loops,opts){const R=U.merge(RULES,opts&&opts.rules&&opts.rules.as2441); const F=[]; const S='AS 2441', V=true;
  const reels=(dets||[]).filter(d=>d.type==='hosereel'); if(!reels.length) return F;
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const mpu=m.scale&&m.scale.mPerUnit; const rs=(rooms||[]).filter(r=>r.page===m.page.id); if(!mpu||!rs.length) continue;
    const hr=reels.filter(d=>d.page===m.page.id), full=(R.hoseM+R.streamM)/mpu, sure=R.checkRouteFromM/mpu;
    for(const r of rs){const pts=U.samples(r,mpu,R.stepM,R.maxPoints);
      const c=U.coverage(pts,hr.map(d=>({x:d.x,y:d.y,reach:full})));
      if(c.bad){F.push({standard:S,clause:'10.2',verified:V,rule:'hose-reel-coverage',level:'fail',page:m.page.id,room:r.name,x:c.worst.x,y:c.worst.y,value:U.r1(c.pct),overM:U.r2(c.worst.over*mpu),limit:R.hoseM+R.streamM,
        msg:`${r.name}: ${U.r1(c.pct)} % of the floor beyond ${R.hoseM} m hose + ${R.streamM} m stream from any hose reel even in a straight line (worst ${U.r2(c.worst.over*mpu)} m over)`}); continue}
      const c2=U.coverage(pts,hr.map(d=>({x:d.x,y:d.y,reach:sure})));
      if(c2.bad) F.push({standard:S,clause:'10.2',verified:V,rule:'hose-reel-route',level:'advisory',page:m.page.id,room:r.name,x:c2.worst.x,y:c2.worst.y,value:U.r1(c2.pct),
        msg:`${r.name}: ${U.r1(c2.pct)} % of the floor is ${R.checkRouteFromM}–${R.hoseM+R.streamM} m from a hose reel — covered only if the hose route around walls and doors is ≤ ${R.hoseM} m`})}
    for(const d of hr){const r=rs.find(x=>x.type==='STAIR'&&U.inPoly([d.x,d.y],U.polyOf(x))); if(r) F.push({standard:S,clause:'10.1',verified:V,rule:'hose-reel-in-exit',level:'warn',page:m.page.id,room:r.name,x:d.x,y:d.y,msg:`${r.name}: hose reel in a stair — not permitted in a fire-isolated exit`})}}
  return F}
NS.standards['AS 2441']={check,RULES,title:'Installation of fire hose reels (2005)'};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.standards['AS 2441'];
})(typeof window!=='undefined'?window:globalThis);
