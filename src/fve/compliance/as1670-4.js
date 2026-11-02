/* AS 1670.4:2015 Emergency warning and intercom systems (checked against the standard supplied by the user). Runs when the project has
   EWS devices (speakers / VAD) or WIPs. Sound levels and intelligibility are measured at commissioning; from a drawing only the layout
   can be questioned:

     5.4.3(a) WIP handsets on each floor — a plan with EWS devices and no WIP, when the project has an EIS (any WIP)      warn
     4.3.6    sleeping occupants: 75 dB(A) at the bedhead with doors closed — a BEDROOM with no speaker                 warn
     4.3.6    SPL throughout the emergency zone (≥ 65 dB(A), ≥ ambient + 10 dB) — a room with no speaker on an EWS floor
              (sound from next door may suffice: confirm)                                                             advisory
     4.3.9    ambient above 85 dB(A) needs VWD / VAD — a PLANT ROOM with no VAD (if it is that loud)                    advisory
     4.3.8 N2 recommendation, not requirement: 120° loudspeakers on a grid of twice the ceiling height (reach h·√2 from each), those
              near walls one ceiling height from them — a room where much of the ceiling is beyond that reach         advisory */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE, U=NS.util;
const RULES={ceilingM:2.7,gridPctTolerance:10,stepM:.5,maxPoints:8000,noSpeakerExempt:['LIFT','STAIR','BATHROOM'],minAreaM2:4};
function check(models,dets,rooms,loops,opts){const R=U.merge(RULES,opts&&opts.rules&&opts.rules['as1670-4']); const F=[]; const S='AS 1670.4', V=true;
  const spk=(dets||[]).filter(d=>U.fam(d.type)==='speaker'), vad=(dets||[]).filter(d=>d.type==='sounder'), wips=(dets||[]).filter(d=>d.type==='wip');
  if(!spk.length&&!vad.length&&!wips.length) return F;
  for(const m of models){if(m.sheet&&m.sheet.kind!=='plan') continue; const pid=m.page.id, mpu=m.scale&&m.scale.mPerUnit;
    const sp=spk.filter(d=>d.page===pid), va=vad.filter(d=>d.page===pid), ews=sp.length||va.length; if(!ews) continue;
    if(wips.length&&!wips.some(d=>d.page===pid)) F.push({standard:S,clause:'5.4.3(a)',verified:V,rule:'wip-per-floor',level:'warn',page:pid,msg:`${m.page.name||'sheet'}: EWS devices but no warden intercom point (WIPs are required on each floor)`});
    const quiet=[];
    for(const r of (rooms||[]).filter(x=>x.page===pid)){const P=U.polyOf(r), inside=sp.filter(d=>U.inPoly([d.x,d.y],P));
      if(!inside.length){
        if(r.type==='BEDROOM') F.push({standard:S,clause:'4.3.6',verified:V,rule:'bedroom-speaker',level:'warn',page:pid,room:r.name,msg:`${r.name}: no speaker — sleeping occupants need 75 dB(A) at the bedhead with doors closed`});
        else if(!R.noSpeakerExempt.includes(r.type)&&!(r.area_m2!=null&&r.area_m2<R.minAreaM2)) quiet.push(r.name);
        if(r.type==='PLANT ROOM'&&!va.some(d=>U.inPoly([d.x,d.y],P))) F.push({standard:S,clause:'4.3.9',verified:V,rule:'plant-vad',level:'advisory',page:pid,room:r.name,msg:`${r.name}: no visual alarm device — required if ambient noise exceeds 85 dB(A)`});
        continue}
      if(r.type==='PLANT ROOM'&&!va.some(d=>U.inPoly([d.x,d.y],P))) F.push({standard:S,clause:'4.3.9',verified:V,rule:'plant-vad',level:'advisory',page:pid,room:r.name,msg:`${r.name}: no visual alarm device — required if ambient noise exceeds 85 dB(A)`});
      if(mpu){const reach=R.ceilingM*Math.SQRT2/mpu, c=U.coverage(U.samples(r,mpu,R.stepM,R.maxPoints),inside.map(d=>({x:d.x,y:d.y,reach})));
        if(c.pct>R.gridPctTolerance) F.push({standard:S,clause:'4.3.8 Note 2',verified:V,rule:'speaker-grid',level:'advisory',page:pid,room:r.name,x:c.worst.x,y:c.worst.y,value:U.r1(c.pct),
          msg:`${r.name}: ${U.r1(c.pct)} % of the ceiling outside the recommended speaker grid (2 × ${R.ceilingM} m ceiling height) — an acoustic check is advisable`})}}
    // rooms with no speaker of their own: one question per sheet, the rooms listed
    if(quiet.length) F.push({standard:S,clause:'4.3.6',verified:V,rule:'room-speaker',level:'advisory',page:pid,value:quiet.length,rooms:quiet,msg:`${m.page.name||'sheet'}: ${quiet.length} room${quiet.length>1?'s':''} without a speaker (${quiet.slice(0,6).join(', ')}${quiet.length>6?' …':''}) — confirm ≥ 65 dB(A) and ambient + 10 dB reach them`})}
  return finish(F,wips,spk,S,V)}
function finish(F,wips,spk,S,V){
  if(!wips.length&&spk.length) F.push({standard:S,clause:'5.4.3',verified:V,rule:'wip-none',level:'info',msg:'EWS speakers but no warden intercom points found — if an emergency intercom system is installed, WIPs are required on each floor'});
  return F}
NS.standards['AS 1670.4']={check,RULES,title:'Emergency warning and intercom systems (2015)'};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.standards['AS 1670.4'];
})(typeof window!=='undefined'?window:globalThis);
