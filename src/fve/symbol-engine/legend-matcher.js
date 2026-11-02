/* MSME · layer 3 · legend match — the project's own dictionary, highest weight
   What the drawing set itself says a candidate is: an exact vector match to a legend symbol, a near-identical fingerprint
   (same geoHash = same block at any scale), a project abbreviation written on it, or a symbol this consultant has used before
   (consultant learning library). Carries the legend row's status (new / existing / remove / relocate). */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};

function score(cand,ctx){const {D,library,consultant}=ctx; const s={}, ev=[], statusBy={}; let status=null, entry=null;
  // historical templates (Learning Engine) are not this project's legend: their evidence goes to the historical / consultant layers
  const typed=NS.geometry.legendIndex(D).typed.filter(e=>!e.hist), hist=new Set((D.symbols||[]).filter(e=>e.hist).map(e=>e.id));
  for(const h of cand.hits||[]) if(!hist.has(h.entry)&&h.score>=.88&&h.score>(s[h.type]||0)){s[h.type]=h.score; status=h.status||status; statusBy[h.type]=h.status||null; entry=h.entry; ev.push({src:'exact',entry:h.entry,type:h.type,score:h.score})}
  // a symbol that is part of another (a surface speaker = the recessed speaker without its circle) scores as high on the bigger one's
  // copies: of two rows within 0.03, the one explaining clearly more of the drawn ink (1.3x) is the symbol drawn there
  {const got={}, sc={}; for(const h of cand.hits||[]) if(!hist.has(h.entry)&&h.score>=.88){if(!(h.type in sc)||h.score>sc[h.type]){sc[h.type]=h.score; got[h.type]=h.got||0}}
    const ty=Object.keys(sc); for(const a of ty) for(const b of ty) if(a!==b&&got[a]&&got[b]&&got[a]>=got[b]*1.3&&sc[a]>=sc[b]-.03&&s[a]<=s[b]){if(s[b]+.005<=1) s[a]=s[b]+.005; else {s[a]=1; s[b]=.99} ev.push({src:'exact',type:a,score:s[a],note:'more complete symbol'})}}
  if(cand.desc) for(const e of typed){if(!e.desc2) continue; const raw=NS.fingerprint.similarity(cand.desc,e.desc2), same=cand.geoHash&&cand.geoHash===e.geoHash&&raw>=.85; const sim=same?Math.max(raw,.95):raw; // a hash collision alone is not identity
    if(sim>=.9&&sim>(s[e.type]||0)){s[e.type]=sim; if(!status) status=e.status; if(!(e.type in statusBy)) statusBy[e.type]=e.status||null; entry=entry||e.id; ev.push({src:same?'geohash':'fingerprint',entry:e.id,type:e.type,score:Math.round(sim*100)/100})}}
  // the legend row's own label ('I/O' in the input / output module box, 'FS' in the flow switch): the same label on a candidate is that row
  const norm=t=>String(t).toUpperCase().replace(/[^A-Z0-9\/]/g,'');
  for(const t of (cand.textEv||[])){if(t.kind==='phrase') continue; const tok=norm(t.text); for(const e of typed){if(!(e.tags||[]).some(g=>norm(g)===tok)) continue; const v=.95*Math.min(1,t.score/.8);
      if(v>(s[e.type]||0)){s[e.type]=v; if(!status) status=e.status; entry=entry||e.id; ev.push({src:'label',entry:e.id,type:e.type,text:t.text})}}}
  // abbreviations the project defines, written on the symbol
  for(const t of (cand.textEv||[])) if(t.project&&t.score>=.6){const v=Math.min(.95,t.score+.05); if(v>(s[t.type]||0)){s[t.type]=v; ev.push({src:'abbreviation',type:t.type,text:t.text})}}
  // consultant library: geoHash → device, learnt from earlier projects by the same consultant
  if(library&&cand.geoHash){const hit=library.find(x=>x.geoHash===cand.geoHash&&(!consultant||!x.consultant||x.consultant===consultant)); if(hit&&!(s[hit.device]>=.9)){s[hit.device]=Math.max(s[hit.device]||0,.9); ev.push({src:'library',type:hit.device,consultant:hit.consultant||null})}}
  return {scores:s,ev,status,statusBy,entry}}

NS.legend={score};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.legend;
})(typeof window!=='undefined'?window:globalThis);
