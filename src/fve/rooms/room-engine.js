/* FireTake room engine — rooms on the current project and what finished jobs say they should hold

   detect(models, dets)        rooms named on the plan inside a closed black / grey outline (the Learning Engine's room extractor, run on
                               this project): name, type, area (m²), the detections inside
   expectations(rooms, K)      against the knowledge base's room library: a room type where earlier estimators found a device in ≥ 80 % of
                               ≥ 3 rooms, and this room has none of it, is worth a look (a plant room with no heat detector). These are
                               questions for the estimator (level 'ask'), never devices added or removed. */
(function(root){
'use strict';
const NS=root.FVE_ROOMS=root.FVE_ROOMS||{};
const family=t=>/^spk_(pend|up|side|semi|space|conc|duct)/.test(t)?'sprinkler':/^ext_/.test(t)?'extinguisher':/^(speaker|spk_surf|horn|proj_spk)$/.test(t)?'speaker':/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':t;

function detect(models,dets,opts){opts=opts||{}; const R=(root.FT_LEARN&&root.FT_LEARN.rooms)||opts.rooms; if(!R) return [];
  const idx=new Map(models.map((m,i)=>[m.page.id,i])); const devs=(dets||[]).map(d=>({page:idx.get(d.page),type:d.type,x:d.x,y:d.y})).filter(d=>d.page!=null);
  return R.extract(models,devs,{FVE:opts.FVE||root.FVE}).map(r=>({...r,page:models[r.page].page.id}))}

function expectations(rooms,K,opts){opts=opts||{}; const lib=K&&K.rooms||[], minN=opts.minRooms||3, minP=opts.minPresence||.8; const out=[];
  for(const r of rooms){const e=lib.find(x=>x.room===r.type); if(!e||e.n<minN) continue; const have=new Set(Object.keys(r.devices||{}).map(family));
    for(const x of e.expectedDevices||[]) if(x.presence>=minP&&!have.has(family(x.device)))
      out.push({level:'ask',code:'room-expectation',page:r.page,room:r.name,type:r.type,device:x.device,presence:x.presence,rooms:e.n,
        msg:`${r.name}: no ${x.device} found — earlier jobs had one in ${Math.round(x.presence*100)} % of ${e.n} ${r.type.toLowerCase()}s`})}
  return out}

NS.detect=detect; NS.expectations=expectations;
if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
