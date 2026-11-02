/* MSME · layer 2 · text match (the PDF text layer — never OCR)
   Device tags near a candidate: the exact tag ('SD') 95, a short device phrase ('SMOKE DET') 90, a numbered tag ('SD01') 80,
   discounted with distance from the symbol. The project's own abbreviations are read first, then the built-in tag rules.
   candidates(): a device tag on a plan also proposes a candidate where nothing was drawn in a legend colour. */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
const hyp=Math.hypot;

function resolve(s,D,FVE){const tok=FVE.tagToken(s); if(tok){const t=D.tagType&&D.tagType[tok]; if(t) return {type:t,token:tok,project:true,kind:s.toUpperCase().replace(/\s/g,'')===tok?'exact':'numbered'};
    const r=FVE.TAG_RULES.find(r=>r.tag.test(tok)); if(r) return {type:r.type,token:tok,project:false,kind:s.toUpperCase().replace(/\s/g,'')===tok?'exact':'numbered'}}
  if(s.length>=6&&s.length<=26&&/[A-Z]{4,}/.test(s.toUpperCase())){const c=FVE.classifyDesc(s); if(c.type&&/DET|SPEAK|CALL|STROBE|SOUNDER|HYDRANT|REEL|EXTING|SPRINK|VALVE|PANEL/i.test(s)) return {type:c.type,token:null,project:false,kind:'phrase'}}
  return null}
const BASE={exact:.95,phrase:.9,numbered:.8};

function score(cand,ctx){const {m,D,FVE}=ctx; const r=Math.max(cand.size*1.6,6); const s={}, ev=[];
  for(const t of m.tindex.around(cand.c[0],cand.c[1],r*2)){const R=resolve(t.s,D,FVE); if(!R) continue; const d=hyp(t.cx-cand.c[0],t.cy-cand.c[1])/(cand.size||1);
    if(d>3) continue; const f=d<=.7?1:Math.max(.5,1-(d-.7)*.25); const v=BASE[R.kind]*f; if(v>(s[R.type]||0)){s[R.type]=v} ev.push({text:t.s,type:R.type,kind:R.kind,distanceToGeometry:Math.round(d*100)/100,project:R.project,score:Math.round(v*100)/100})}
  return {scores:s,ev}}

// tags that resolve to a device → candidate at the closed outline around / beside the tag (or the tag itself)
function candidates(m,D,FVE){const out=[];
  for(const t of m.texts){const R=resolve(t.s,D,FVE); if(!R||R.kind==='phrase') continue;
    const sh=m.index.around(t.cx,t.cy,t.h*1.6).filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')&&(o.bb[2]-o.bb[0])<t.h*8&&(o.bb[3]-o.bb[1])<t.h*8&&(o.bb[2]-o.bb[0])>t.h*.6)
      .sort((a,b)=>hyp((a.bb[0]+a.bb[2])/2-t.cx,(a.bb[1]+a.bb[3])/2-t.cy)-hyp((b.bb[0]+b.bb[2])/2-t.cx,(b.bb[1]+b.bb[3])/2-t.cy))[0];
    const b=sh?sh.bb:t.bb; out.push({page:m.page.id,bb:b.slice(),c:[(b[0]+b[2])/2,(b[1]+b[3])/2],size:Math.max(b[2]-b[0],b[3]-b[1],2),src:{tag:t.s},hasShape:!!sh})}
  return out}

NS.text={score,candidates,resolve};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.text;
})(typeof window!=='undefined'?window:globalThis);
