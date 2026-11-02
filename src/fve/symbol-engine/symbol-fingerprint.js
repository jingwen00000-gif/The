/* MSME · symbol fingerprint
   A symbol is described by its geometry, not its pixels, and relative to its own size so a legend symbol and the same block plotted
   0.64× on a plan describe identically:
     key      the largest closed outline (circle / rect / triangle / polygon) — kind, aspect, colour, size (the normaliser)
     inner    what sits inside the outline: counts of strokes, circles, rects, polygons, fills
     ori      direction of the inner strokes (0° / 45° / 90° / 135°), length-weighted, normalised
     ring     where the inner ink lies: centre / middle / edge of the outline
     len      inner ink length ÷ outline size;  ext  strokes leaving the outline (tails, arrows) ÷ size
   geoHash quantises that into a short stable code (GEO_xxxxx) for libraries and fast lookup; similarity() compares two descriptors 0–1. */
(function(root){
'use strict';
const NS=root.FVE_MSME=root.FVE_MSME||{};
const hyp=Math.hypot;
const sizeOf=o=>o.k==='circle'?2*o.r:Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1]);
const corners=o=>{const P=o.pts.slice(); if(P.length>1&&hyp(P[0][0]-P[P.length-1][0],P[0][1]-P[P.length-1][1])<1e-6) P.pop(); return P.length};
const kindOf=o=>o.k==='circle'?'circle':o.k==='rect'?'rect':o.k==='polygon'?(corners(o)===3?'tri':'poly'):'open';

// objs: the FVE objects of one symbol (outline first found automatically); returns the descriptor
function describe(objs){
  const closed=objs.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')).sort((a,b)=>sizeOf(b)-sizeOf(a));
  const bbAll=objs.reduce((u,o)=>[Math.min(u[0],o.bb[0]),Math.min(u[1],o.bb[1]),Math.max(u[2],o.bb[2]),Math.max(u[3],o.bb[3])],[Infinity,Infinity,-Infinity,-Infinity]);
  const key=closed[0]||null; const kb=key?key.bb:bbAll; const S=key?sizeOf(key):Math.max(bbAll[2]-bbAll[0],bbAll[3]-bbAll[1])||1;
  const c=key&&key.k==='circle'?key.c:[(kb[0]+kb[2])/2,(kb[1]+kb[3])/2], R=S/2;
  const d={kind:key?kindOf(key):'open',aspect:Math.round(100*((kb[2]-kb[0])||1)/((kb[3]-kb[1])||1))/100,col:key?key.stroke:(objs.find(o=>o.stroke)||{}).stroke||null,size:S,
    inner:{line:0,circle:0,rect:0,poly:0,fill:0},ori:[0,0,0,0],ring:[0,0,0],len:0,ext:0};
  const e=S*.12, inK=b=>b[0]>=kb[0]-e&&b[2]<=kb[2]+e&&b[1]>=kb[1]-e&&b[3]<=kb[3]+e;
  for(const o of objs){if(o===key||o.synthetic&&key&&o.bb.every((v,i)=>Math.abs(v-key.bb[i])<.05)) continue;
    const inside=inK(o.bb);
    if(!o.stroke&&o.fill){if(inside) d.inner.fill++; continue}
    if(inside){if(o.k==='circle') d.inner.circle++; else if(o.k==='rect') d.inner.rect++; else if(o.k==='polygon') d.inner.poly++; else d.inner.line++}
    for(let i=1;i<o.pts.length;i++){const a=o.pts[i-1], b=o.pts[i], L=hyp(b[0]-a[0],b[1]-a[1]); if(L<1e-6) continue; const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if(!inside&&!inK([mid[0],mid[1],mid[0],mid[1]])){d.ext+=L; continue}
      const ang=((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI)%180+180)%180; d.ori[Math.round(ang/45)%4]+=L;
      const r=hyp(mid[0]-c[0],mid[1]-c[1])/(R||1); d.ring[r<.34?0:r<.67?1:2]+=L; d.len+=L}}
  const tot=d.len||1; d.ori=d.ori.map(v=>Math.round(100*v/tot)/100); d.ring=d.ring.map(v=>Math.round(100*v/tot)/100);
  d.len=Math.round(100*d.len/S)/100; d.ext=Math.round(100*d.ext/S)/100; return d}

// FNV-1a 32 → base-36, 5 characters
function fnv(s){let h=0x811c9dc5; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0} return h.toString(36).toUpperCase().padStart(5,'0').slice(-5)}
// quantised descriptor → stable key; same block, any scale → same hash
function geoKey(d){const q=(v,n)=>Math.min(n,Math.round(v*n)); const a=d.aspect>1.3?'w':d.aspect<.77?'t':'s'; const I=d.inner;
  return [d.kind,a,'l'+Math.min(I.line,9)+'c'+Math.min(I.circle,9)+'r'+Math.min(I.rect,9)+'p'+Math.min(I.poly,9)+'f'+(I.fill?1:0),'o'+d.ori.map(v=>q(v,3)).join(''),'g'+d.ring.map(v=>q(v,3)).join(''),'n'+Math.min(9,Math.round(d.len)),'x'+(d.ext>.25?1:0)].join('|')}
const geoHash=d=>'GEO_'+fnv(geoKey(d));

// 0–1: kinds must agree; then proportions, inner content, stroke directions, ink layout, amount of ink, tails. Colour is weak (it marks status).
function similarity(a,b){if(!a||!b) return 0; if(a.kind!==b.kind) return (a.kind==='rect'&&b.kind==='poly')||(a.kind==='poly'&&b.kind==='rect')?.25:.08;
  const asp=Math.exp(-3*Math.abs(Math.log((a.aspect||1)/(b.aspect||1))));
  const ks=['line','circle','rect','poly','fill']; let dif=0,tot=0; for(const k of ks){const x=Math.min(a.inner[k],6), y=Math.min(b.inner[k],6); dif+=Math.abs(x-y); tot+=Math.max(x,y)} const cnt=tot?1-dif/(tot+1):1;
  const hasA=a.len>.05, hasB=b.len>.05; let ori, ring;
  if(!hasA&&!hasB){ori=1; ring=1} else if(hasA!==hasB){ori=.2; ring=.2}
  else {const dot=a.ori.reduce((s,v,i)=>s+v*b.ori[i],0), na=Math.hypot(...a.ori), nb=Math.hypot(...b.ori); ori=na&&nb?dot/(na*nb):0; ring=1-a.ring.reduce((s,v,i)=>s+Math.abs(v-b.ring[i]),0)/2}
  const len=Math.exp(-1.5*Math.abs(Math.log((a.len+.1)/(b.len+.1)))), ext=Math.exp(-2*Math.abs(a.ext-b.ext));
  let s=.12*asp+.22*cnt+.26*ori+.14*ring+.16*len+.10*ext;
  // two empty outlines (nothing inside, no tail) agree on everything but proportion: that says almost nothing about the device
  const empty=d=>d.len<=.05&&d.ext<.1&&!Object.values(d.inner).some(v=>v>0); if(empty(a)&&empty(b)) s=Math.min(s,.45);
  return Math.max(0,Math.min(1,s*(a.col&&b.col&&a.col!==b.col?.92:1)))}

// the full fingerprint: geometry + what the drawing calls it + which network it sits on
function fingerprint(p){const dev=String(p.device||'UNK').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); return `${dev}_FP_${fnv([p.geoHash||'',p.text||'',p.legend||'',p.network||''].join('|'))}`}

NS.fingerprint={describe,geoKey,geoHash,similarity,fingerprint,sizeOf,kindOf,fnv};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.fingerprint;
})(typeof window!=='undefined'?window:globalThis);
