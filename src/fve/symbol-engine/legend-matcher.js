/* MSME · layer 3 · legend match — the project's own dictionary, highest weight
   What the drawing set itself says a candidate is: an exact vector match to a legend symbol, a near-identical fingerprint
   (same geoHash = same block at any scale), a project abbreviation written on it, or a symbol this consultant has used before
   (consultant learning library). Carries the legend row's status (new / existing / remove / relocate). */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};

function score(cand,ctx){const {D,library,consultant}=ctx; const s={}, ev=[]; let status=null, entry=null;
  const typed=NS.geometry.legendIndex(D).typed;
  for(const h of cand.hits||[]) if(h.score>=.88&&h.score>(s[h.type]||0)){s[h.type]=h.score; status=h.status||status; entry=h.entry; ev.push({src:'exact',entry:h.entry,type:h.type,score:h.score})}
  if(cand.desc) for(const e of typed){if(!e.desc2) continue; const raw=NS.fingerprint.similarity(cand.desc,e.desc2), same=cand.geoHash&&cand.geoHash===e.geoHash&&raw>=.85; const sim=same?Math.max(raw,.95):raw; // a hash collision alone is not identity
    if(sim>=.9&&sim>(s[e.type]||0)){s[e.type]=sim; if(!status) status=e.status; entry=entry||e.id; ev.push({src:same?'geohash':'fingerprint',entry:e.id,type:e.type,score:Math.round(sim*100)/100})}}
  // the legend row's own label ('I/O' in the input / output module box, 'FS' in the flow switch): the same label on a candidate is that row
  const norm=t=>String(t).toUpperCase().replace(/[^A-Z0-9\/]/g,'');
  for(const t of (cand.textEv||[])){if(t.kind==='phrase') continue; const tok=norm(t.text); for(const e of typed){if(!(e.tags||[]).some(g=>norm(g)===tok)) continue; const v=.95*Math.min(1,t.score/.8);
      if(v>(s[e.type]||0)){s[e.type]=v; if(!status) status=e.status; entry=entry||e.id; ev.push({src:'label',entry:e.id,type:e.type,text:t.text})}}}
  // abbreviations the project defines, written on the symbol
  for(const t of (cand.textEv||[])) if(t.project&&t.score>=.6){const v=Math.min(.95,t.score+.05); if(v>(s[t.type]||0)){s[t.type]=v; ev.push({src:'abbreviation',type:t.type,text:t.text})}}
  // consultant library: geoHash → device, learnt from earlier projects by the same consultant
  if(library&&cand.geoHash){const hit=library.find(x=>x.geoHash===cand.geoHash&&(!consultant||!x.consultant||x.consultant===consultant)); if(hit&&!(s[hit.device]>=.9)){s[hit.device]=Math.max(s[hit.device]||0,.9); ev.push({src:'library',type:hit.device,consultant:hit.consultant||null})}}
  return {scores:s,ev,status,entry}}

NS.legend={score};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.legend;
})(typeof window!=='undefined'?window:globalThis);
