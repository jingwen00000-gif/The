/* AS 2118.1:2017 (incl. Amendment 1) Automatic fire sprinkler systems — General systems (limits checked against the standard supplied
   by the user). Standard-coverage heads under horizontal ceilings; extended-coverage / residential heads follow their listing and are
   not checked here. Runs when the project has sprinklers.

   Hazard class: a project setting (opts.rules.as2118.hazard: 'LH' | 'OH' | 'HH'), default Light Hazard — offices are LH (Appendix A2).
   Car parks are OH 2 (A3.2). In LH, kitchens, storage, plant / services rooms, data rooms … take the reduced coverage of 9.4.3.

                         LH (9.4)        LH reduced (9.4.3)   OH (10.4)               HH process (11.4)
     area per head       21 m² (9.4.2)   12 m²                12 m² (10.4.2)          12 m² (11.4.2, ≤ 10 mm/min)
     sidewall area       17 m²           —                    9 m²                    —
     max spacing         4.8 m (9.4.4)   4.2 m                4.2 m; staggered 4.6 m  3.7 m (11.4.1)
                                                              along rows (10.4.4)
     sidewall spacing    4.6 m           —                    3.6 m                   —
     max from walls      half spacing    2.1 m                2.1 m / sidewall end    half spacing
                                                              walls 1.8 m (10.4.6)
     general: at least 2 m between heads (5.3, baffles otherwise); at least 100 mm from walls (5.4); every part of a sprinkler-protected
     building (3.1.1) except the omissions of 3.1.3 (high-voltage switch rooms, fire-isolated stairs …).

   Checks (fail = certainly outside the limit, a straight measurement on the plan):
     area-per-head   room area ÷ ceiling heads above the limit (the average; the worst head can only be worse)          fail
     coverage        a point of the room further than half the max spacing (or the wall limit near a wall) from every
                     head in x or y — the spacing / wall-distance envelope; staggered OH allowed (4.6 m)                fail
     spacing         a head with no other head within the max spacing                                                  fail
     min-spacing     two heads closer than 2 m (unless baffled)                                                         warn
     wall-min        a head closer than 100 mm to a wall                                                                warn
     no-sprinklers   a room without heads on a sprinklered floor (3.1.3 rooms: advisory to confirm the omission)  warn / advisory */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE, U=NS.util;
const CEILING=new Set(['spk_pend','spk_up','spk_semi','spk_conc','sprinkler']), SIDEWALL=new Set(['spk_side']);
const RULES={hazard:'LH',roomHazard:{CARPARK:'OH'},reducedRooms:['KITCHEN','STORE','PLANT ROOM','COMMUNICATIONS ROOM','SWITCH ROOM','LOADING DOCK'],
  omitted:{STAIR:'fire-isolated stairways (3.1.3)',['SWITCH ROOM']:'high-voltage switch rooms bounded to resist fire, normally unoccupied (3.1.3)'},
  minSpacingM:2,minWallM:.1,stepM:.5,maxPoints:8000,
  limits:{
    LH:{area:21,sideArea:17,spacing:4.8,sideSpacing:4.6,wall:2.4,clauses:{area:'9.4.2',spacing:'9.4.4',wall:'9.4.4'}},
    LHR:{area:12,sideArea:12,spacing:4.2,sideSpacing:4.2,wall:2.1,clauses:{area:'9.4.3',spacing:'9.4.3',wall:'9.4.3'}},
    OH:{area:12,sideArea:9,spacing:4.2,staggered:4.6,sideSpacing:3.6,wall:2.1,clauses:{area:'10.4.2',spacing:'10.4.4',wall:'10.4.6'}},
    HH:{area:12,sideArea:12,spacing:3.7,sideSpacing:3.7,wall:1.85,clauses:{area:'11.4.2',spacing:'11.4.1',wall:'11.4.1'}}}};
const HZ={LH:'Light Hazard',LHR:'Light Hazard (reduced coverage)',OH:'Ordinary Hazard',HH:'High Hazard'};

function check(models,dets,rooms,loops,opts){const R=U.merge(RULES,opts&&opts.rules&&opts.rules.as2118); const F=[]; const S='AS 2118.1', V=true;
  const heads=(dets||[]).filter(d=>CEILING.has(d.type)||SIDEWALL.has(d.type)); if(!heads.length) return F;
  const add=f=>F.push({standard:S,verified:V,...f});
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const pid=m.page.id, mpu=m.scale&&m.scale.mPerUnit; const hs=heads.filter(d=>d.page===pid); if(!hs.length||!mpu) continue;
    for(const r of (rooms||[]).filter(x=>x.page===pid)){const P=U.polyOf(r), inR=hs.filter(d=>U.inPoly([d.x,d.y],P)), ceil=inR.filter(d=>CEILING.has(d.type)), side=inR.filter(d=>SIDEWALL.has(d.type));
      const hz=R.roomHazard[r.type]||(R.hazard==='LH'&&R.reducedRooms.includes(r.type)?'LHR':R.hazard), L=R.limits[hz]; if(!L) continue; const C=L.clauses;
      if(!inR.length){const om=R.omitted[r.type];
        add({clause:om?'3.1.3':'3.1.1',rule:'no-sprinklers',level:om?'advisory':'warn',page:pid,room:r.name,x:(r.bb[0]+r.bb[2])/2,y:(r.bb[1]+r.bb[3])/2,
          msg:om?`${r.name}: no sprinklers — only permitted for ${om}; confirm`:`${r.name}${r.area_m2?` (${r.area_m2} m²)`:''}: no sprinklers on a sprinklered floor — every part of a sprinkler-protected building is protected unless omitted under 3.1.3`}); continue}
      // area per head (the average: if it is over, some head certainly covers more)
      if(r.area_m2){const lim=ceil.length?L.area:L.sideArea, per=r.area_m2/inR.length; if(per>lim+.05) add({clause:C.area,rule:'area-per-head',level:'fail',page:pid,room:r.name,value:U.r1(per),limit:lim,
        msg:`${r.name}: ${U.r1(per)} m² per sprinkler (${inR.length} for ${r.area_m2} m²) — ${HZ[hz]} allows ${lim} m²${side.length&&!ceil.length?' (sidewall)':''}`})}
      // spacing: each head's nearest head
      const maxS=ceil.length?(L.staggered||L.spacing):L.sideSpacing;
      for(const d of inR){const o=inR.filter(x=>x!==d); if(!o.length) break; const nn=Math.min(...o.map(x=>U.hyp(x.x-d.x,x.y-d.y)))*mpu;
        if(nn>maxS+.01){add({clause:C.spacing,rule:'spacing',level:'fail',page:pid,room:r.name,x:d.x,y:d.y,value:U.r2(nn),limit:maxS,msg:`${r.name}: sprinkler ${U.r2(nn)} m from its nearest sprinkler — ${HZ[hz]} allows ${maxS} m`}); break}}
      for(let i=0;i<inR.length;i++) for(let j=i+1;j<inR.length;j++){const dd=U.hyp(inR[i].x-inR[j].x,inR[i].y-inR[j].y)*mpu;
        if(dd<R.minSpacingM-.01){add({clause:'5.3',rule:'min-spacing',level:'warn',page:pid,room:r.name,x:inR[i].x,y:inR[i].y,value:U.r2(dd),limit:R.minSpacingM,msg:`${r.name}: two sprinklers ${U.r2(dd)} m apart (at least ${R.minSpacingM} m, or baffles between them)`}); i=inR.length; break}}
      for(const d of ceil){const g=U.edgeDist([d.x,d.y],P)*mpu; if(g<R.minWallM-.005) add({clause:'5.4',rule:'wall-min',level:'warn',page:pid,room:r.name,x:d.x,y:d.y,value:U.r2(g),limit:R.minWallM,msg:`${r.name}: sprinkler ${U.r2(g)} m from the wall (at least ${R.minWallM} m)`})}
      // coverage envelope for ceiling heads: within half the max spacing in x and y (the wall limit within 0.25 m of a wall)
      if(ceil.length&&!side.length){const half=maxS/2/mpu, wall=Math.min(L.wall,maxS/2)/mpu; let n=0, bad=0, worst=null;
        // interior points against half the spacing; points ON the walls against the wall limit
        const pts=U.samples(r,mpu,R.stepM,R.maxPoints).map(q=>[q[0],q[1],half]), st=R.stepM/mpu;
        for(let i=0;i<P.length;i++){const a=P[i], b=P[(i+1)%P.length], Lp=U.hyp(b[0]-a[0],b[1]-a[1]); for(let t=st/2;t<Lp;t+=st) pts.push([a[0]+(b[0]-a[0])*t/Lp,a[1]+(b[1]-a[1])*t/Lp,wall])}
        for(const [x,y,lim] of pts){n++; let ok=false, over=Infinity;
          for(const d of ceil){const c=Math.max(Math.abs(d.x-x),Math.abs(d.y-y)); if(c<=lim+.01/mpu){ok=true; break} over=Math.min(over,c-lim)}
          if(!ok){bad++; if(!worst||over>worst.over) worst={x,y,over}}}
        if(n&&bad/n>.01) add({clause:`${C.spacing} / ${C.wall}`,rule:'coverage',level:'fail',page:pid,room:r.name,x:worst.x,y:worst.y,value:U.r1(100*bad/n),overM:U.r2(worst.over*mpu),
          msg:`${r.name}: ${U.r1(100*bad/n)} % of the room outside the ${HZ[hz]} spacing envelope (${maxS} m between heads, ≤ ${Math.min(L.wall,maxS/2)} m from walls; worst ${U.r2(worst.over*mpu)} m over)`})}}}
  return F}
NS.standards['AS 2118.1']={check,RULES,title:'Automatic fire sprinkler systems — General systems (2017, Amdt 1)'};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.standards['AS 2118.1'];
})(typeof window!=='undefined'?window:globalThis);
