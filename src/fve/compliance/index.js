/* FireTake compliance — every standard module on the recognised design
   FVE_COMPLIANCE.check(models, dets, rooms, loops, opts) → {findings, summary, byStandard, standards, isolators}
   Each finding: {standard, clause, verified, rule, level (fail / warn / advisory / info), page, room?, x?, y?, value?, limit?, msg}.
   verified: the limit was checked against the text of the standard (supplied by the user); false = not a clause (panel rating, note).
   opts.rules['AS 2444'-style key]: per-standard parameter overrides; opts.only: list of standards to run. */
(function(root){
'use strict';
const NS=root.FVE_COMPLIANCE=root.FVE_COMPLIANCE||{standards:{}};
const ORDER=['AS 1670.1','AS 1670.4','AS 2444','AS 2441'], LEVEL={fail:0,warn:1,advisory:2,info:3};
function check(models,dets,rooms,loops,opts){opts=opts||{}; let F=[];
  for(const k of ORDER){const s=NS.standards[k]; if(!s||(opts.only&&!opts.only.includes(k))) continue; F=F.concat(s.check(models,dets,rooms,loops,opts).map(f=>({standard:k,...f})))}
  F.sort((a,b)=>LEVEL[a.level]-LEVEL[b.level]||ORDER.indexOf(a.standard)-ORDER.indexOf(b.standard));
  const summary={}, byStandard={}; for(const f of F){summary[f.level]=(summary[f.level]||0)+1; const b=byStandard[f.standard]=byStandard[f.standard]||{}; b[f.level]=(b[f.level]||0)+1}
  return {findings:F,summary,byStandard,standards:ORDER.filter(k=>NS.standards[k]).map(k=>({id:k,title:NS.standards[k].title,verified:true})),
    isolators:F.filter(f=>f.rule==='isolators').reduce((a,f)=>a+(f.value||0),0)}}
NS.check=check; NS.ORDER=ORDER;
if(typeof module!=='undefined'&&module.exports){require('./common'); require('./as1670-1'); require('./as1670-4'); require('./as2444'); require('./as2441'); module.exports=NS}
})(typeof window!=='undefined'?window:globalThis);
