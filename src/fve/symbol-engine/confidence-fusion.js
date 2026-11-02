/* MSME · confidence fusion
   Five layers each give a 0–1 score per device type; fusion weighs them (geometry 20 %, text 25 %, legend 30 %, context 10 %,
   network 15 %) over the layers that had an opinion, then asks for corroboration: one layer alone is discounted, and a text tag with
   no symbol around it (a note, a label) is held down. The winner is the device, its fused score the confidence. */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
// historical / consultant: the Learning Engine's knowledge base (silent without one, so the five-layer behaviour is unchanged)
const WEIGHTS={geometry:.20,text:.25,legend:.30,context:.10,network:.15,historical:.15,consultant:.15};
const LAYER_NAME={geometry:'Geometry',text:'Text',legend:'Legend',context:'Context',network:'Network',historical:'Historical',consultant:'Consultant'};
const SUPPORT=[0,.82,.95,1];   // by number of layers agreeing on the winner (≥ 0.5)

// layers: {geometry:{smoke:.8,…}, text:{…}, …}; opts.weights to override; opts.hasShape=false for a bare text tag
function fuse(layers,opts={}){const W={...WEIGHTS,...(opts.weights||{})};
  // a layer takes part only when it has a real opinion (some type ≥ 0.5): weak priors and faint context votes must not dilute strong evidence
  const avail=Object.keys(W).filter(l=>layers[l]&&Object.values(layers[l]).some(v=>v>=.5)); if(!avail.length) return null;
  const types=new Set(); avail.forEach(l=>Object.keys(layers[l]).forEach(t=>types.add(t)));
  const wsum=avail.reduce((a,l)=>a+W[l],0); const score={};
  for(const t of types){let s=0; for(const l of avail) s+=W[l]*(layers[l][t]||0); score[t]=s/wsum}
  const ranked=[...types].sort((a,b)=>score[b]-score[a]); const best=ranked[0];
  const agree=avail.filter(l=>(layers[l][best]||0)>=.5); let conf=score[best]*SUPPORT[Math.min(3,agree.length)];
  if(opts.hasShape===false&&agree.length===1&&agree[0]==='text') conf*=.6;
  // a strong contrary opinion from the legend (the project's own dictionary) lowers confidence
  const lb=layers.legend&&Object.entries(layers.legend).sort((a,b)=>b[1]-a[1])[0]; if(lb&&lb[0]!==best&&lb[1]>=.8) conf*=.85;
  return {device:best,confidence:Math.round(1000*Math.max(0,Math.min(1,conf)))/10,score:conf,sources:agree.map(l=>LAYER_NAME[l]),
    alternatives:ranked.slice(1,4).map(t=>({device:t,score:Math.round(1000*score[t])/10})),weighted:Object.fromEntries(ranked.slice(0,4).map(t=>[t,Math.round(1000*score[t])/10]))}}

NS.fusion={fuse,WEIGHTS,SUPPORT};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.fusion;
})(typeof window!=='undefined'?window:globalThis);
