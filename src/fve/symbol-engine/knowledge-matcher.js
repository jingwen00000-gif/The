/* MSME · layers 6 and 7 · historical and consultant knowledge (from the Learning Engine's knowledge base)

   historical   what finished jobs say this geometry is: an exact match of a historical symbol template, or the candidate's geoHash in
                the symbol library (any consultant), weighed by how often and how consistently it was seen
   consultant   what THIS consultant's jobs say: their symbol under this geoHash, a template learnt from their drawings, a tag they use
                (their abbreviation written on the symbol)
   Both are silent when no knowledge is loaded, so recognition without a knowledge base is unchanged (fusion only weighs layers with
   an opinion). */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};

function histIndex(D){if(D._histIdx) return D._histIdx; const ids=new Map(); for(const e of D.symbols||[]) if(e.hist) ids.set(e.id,e); return D._histIdx={ids,hasLegend:(D.symbols||[]).some(e=>e.type&&!e.hist)}}
function score(cand,ctx){const K=ctx.knowledge; const H={}, C={}, ev=[]; if(!K) return {historical:{scores:H,ev},consultant:{scores:C,ev}};
  const {ids,hasLegend}=histIndex(ctx.D);
  for(const h of cand.hits||[]){const e=ids.get(h.entry); if(!e||h.score<.85) continue; const v=h.score*Math.min(1,.8+.05*(e.histN||1));
    if(v>(H[h.type]||0)){H[h.type]=v; ev.push({src:'historical-template',type:h.type,score:Math.round(h.score*100)/100,n:e.histN})}
    if(e.consultantMatch&&h.score>(C[h.type]||0)){C[h.type]=h.score; ev.push({src:'consultant-template',type:h.type})}}
  // another consultant's reading of a geoHash: only on a set with no legend of its own, and only once it is well established
  if(cand.geoHash) for(const s of K.library||[]){if(s.geoHash!==cand.geoHash||(!s.consultant&&(hasLegend||(s.n||1)<3))) continue; const v=.85+Math.min(.1,.02*(s.n||1));
    if(v>(H[s.device]||0)){H[s.device]=v; ev.push({src:'historical-geohash',type:s.device,n:s.n})}
    if(s.consultant&&.95>(C[s.device]||0)){C[s.device]=.95; ev.push({src:'consultant-geohash',type:s.device,consultant:s.consultant})}}
  for(const t of cand.textEv||[]){const tok=String(t.text||'').toUpperCase().replace(/[^A-Z0-9\/]/g,''); const dev=K.abbrev&&K.abbrev[tok];
    if(dev&&cand.hasShape!==false&&.9>(C[dev]||0)){C[dev]=.9; ev.push({src:'consultant-abbreviation',type:dev,text:t.text})}}
  return {historical:{scores:H,ev},consultant:{scores:C,ev}}}

NS.knowledge={score};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.knowledge;
})(typeof window!=='undefined'?window:globalThis);
