/* FireTake Vector Engine (FVE)
   Reads a fire services PDF as the drawing it is — vector objects, text, legend — instead of as a picture.

     PDF objects → text layer → legend analysis → rule engine → verification

   Layer 1  objects:  every painted path becomes a typed object (line, polyline, polygon, rect, circle, arc) with stroke / fill colour,
                      line weight and dash, in page units (PDF points, top-left origin, the same frame as the rest of FireTake);
                      a packed R-tree answers "what is within 3 mm of this?" in microseconds.
   Layer 2  text:     the PDF text layer (no OCR): items, joined lines, drawing scale, sheet type (cover / legend / plan / …).
   Layer 3  legend:   LEGEND / SYMBOLS / ABBREVIATIONS sections → a project dictionary of symbols, line types and abbreviations.
                      The project's own legend outranks any built-in library.
   Layer 4  rules:    data-driven rules (shape + tag + colour + context) and legend template matches, merged into detections with a
                      confidence and the evidence behind it.
   Layer 5  verify:   checks that need no AI (level-to-level count outliers, legend entries never found, tags nobody explained);
                      AI, where available, only names what the rules could not.

   This file has no DOM and no FireTake state: it takes pdf.js pages and returns plain data. Matching of legend templates is passed in
   (hooks.match), so the app's vector matcher stays the single implementation. Works in the browser (window.FVE) and in Node (require). */
(function(root){
'use strict';
const FVE={version:'1.0.0'};

/* ------------------------------------------------------------------ geometry */
const hyp=Math.hypot;
const bbOf=pts=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for(const p of pts){if(p[0]<x0)x0=p[0]; if(p[1]<y0)y0=p[1]; if(p[0]>x1)x1=p[0]; if(p[1]>y1)y1=p[1]} return [x0,y0,x1,y1]};
const plen=pts=>{let L=0; for(let i=1;i<pts.length;i++) L+=hyp(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); return L};
const bbUnion=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
const bbHit=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const segDist=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1; const t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2)); return hyp(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy)};
FVE.geom={bbOf,plen,bbUnion,bbHit,segDist};

/* ------------------------------------------------------------------ spatial index: static packed R-tree (sort-tile-recursive) */
class RTree{
  constructor(items,bbox,nodeSize=16){this.items=items; this.n=items.length; const B=items.map(bbox); this.root=this._build(B.map((b,i)=>({b,i})),nodeSize)}
  _build(E,M){if(!E.length) return {b:[0,0,0,0],c:[],leaf:true};
    let level=E.map(e=>({b:e.b,i:e.i,leaf:true}));
    while(level.length>M){const S=Math.ceil(Math.sqrt(Math.ceil(level.length/M))); level.sort((a,b)=>(a.b[0]+a.b[2])-(b.b[0]+b.b[2])); const next=[], per=Math.ceil(level.length/S);
      for(let s=0;s<level.length;s+=per){const sl=level.slice(s,s+per).sort((a,b)=>(a.b[1]+a.b[3])-(b.b[1]+b.b[3])); for(let j=0;j<sl.length;j+=M){const c=sl.slice(j,j+M); next.push({b:c.reduce((u,x)=>bbUnion(u,x.b),c[0].b.slice()),c})}}
      level=next}
    return {b:level.reduce((u,x)=>bbUnion(u,x.b),level[0].b.slice()),c:level}}
  // all items whose box meets [x0,y0,x1,y1]
  search(x0,y0,x1,y1,out=[]){const q=[x0,y0,x1,y1], st=[this.root]; while(st.length){const n=st.pop(); if(!bbHit(n.b,q)) continue; if(n.leaf&&n.i!=null){out.push(this.items[n.i]); continue} if(n.c) for(const c of n.c) st.push(c)} return out}
  around(x,y,r,out){return this.search(x-r,y-r,x+r,y+r,out)}
}
FVE.RTree=RTree;

/* ------------------------------------------------------------------ layer 1: PDF objects */
const hex=a=>[...a].slice(0,3).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const mul=(A,B)=>[A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];
// a closed (or nearly closed) run of points lying on one circle → circle; an open one → arc
// (needs ≥ 8 points: a rectangle's 4 corners are equidistant from its centre too)
function fitCircle(pts){if(pts.length<8) return null; let cx=0,cy=0; const P=hyp(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<1e-6?pts.slice(0,-1):pts;
  for(const p of P){cx+=p[0]; cy+=p[1]} cx/=P.length; cy/=P.length; let r=0; for(const p of P) r+=hyp(p[0]-cx,p[1]-cy); r/=P.length; if(r<.2) return null;
  for(const p of P) if(Math.abs(hyp(p[0]-cx,p[1]-cy)-r)>Math.max(.06*r,.08)) return null;
  // the chords must hug the circle too: a square drawn corner to corner (twice over, so 8 points) has every corner on a circle, its sides do not
  for(let i=0;i<P.length;i++){const a=P[i], b=P[(i+1)%P.length]; if(hyp(((a[0]+b[0])/2)-cx,((a[1]+b[1])/2)-cy)<r*.85) return null}
  return {c:[cx,cy],r}}
function classify(sp){const pts=sp.pts, n=pts.length; if(n<2) return null; const bb=bbOf(pts), len=plen(pts), first=pts[0], last=pts[n-1];
  const closed=sp.closed||(n>2&&hyp(first[0]-last[0],first[1]-last[1])<Math.max(.05,len*.002)); const o={pts,closed,bb,len};
  if(sp.rect){o.k='rect'; return o}
  if(n===2){o.k='line'; return o}
  if(closed&&n>5){const U=[]; for(const p of pts) if(!U.some(q=>hyp(q[0]-p[0],q[1]-p[1])<.05)) U.push(p);
    // the same outline traced twice or three times over (heavy CAD pens): one copy of it
    if(U.length>=3&&U.length<n-1&&(n-1)%U.length===0&&pts.every((p,i)=>hyp(p[0]-pts[i%U.length][0],p[1]-pts[i%U.length][1])<.05)){const P=U.concat([U[0]]); return classify({...sp,pts:P,closed:true})}}
  if(closed){const c=fitCircle(pts); if(c){o.k='circle'; o.c=c.c; o.r=c.r; return o}
    if(n===5||n===4){const P=n===5?pts.slice(0,4):pts; const ax=P.every((p,i)=>{const q=P[(i+1)%4]; return Math.abs(p[0]-q[0])<.05||Math.abs(p[1]-q[1])<.05}); if(ax){o.k='rect'; return o}}
    o.k='polygon'; return o}
  if(sp.curve&&n>=5){const c=fitCircle(pts); if(c){o.k='arc'; o.c=c.c; o.r=c.r; return o}}
  o.k=n===2?'line':'polyline'; return o}
// opList: pdf.js getOperatorList() result, vp: viewport at scale 1, OPS: pdfjsLib.OPS
FVE.extractObjects=function(ol,vp,OPS){
  let st={m:[1,0,0,1,0,0],sc:'000000',fc:'000000',lw:1,dash:false}; const stack=[], objs=[]; let subs=[], cur=null, curRaw=null, startRaw=null;
  const T=(x,y)=>{const m=st.m; return vp.convertToViewportPoint(m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5])};
  const flush=(stroke,fill)=>{const sc=Math.sqrt(Math.abs(st.m[0]*st.m[3]-st.m[1]*st.m[2]))||1, w=Math.max(.05,(st.lw||0)*sc);
    for(const sp of subs){const o=classify(sp); if(!o||(o.len<.15&&o.k!=='circle')) continue; o.stroke=stroke?st.sc:null; o.fill=fill?st.fc:null; o.w=stroke?w:0; o.dash=stroke&&st.dash; o.id=objs.length; objs.push(o)}
    subs=[]; cur=null};
  for(let i=0;i<ol.fnArray.length;i++){const fn=ol.fnArray[i], a=ol.argsArray[i];
    if(fn===OPS.save) stack.push({...st,m:[...st.m]}); else if(fn===OPS.restore){if(stack.length) st=stack.pop()}
    else if(fn===OPS.transform) st.m=mul(st.m,a);
    else if(fn===OPS.paintFormXObjectBegin){stack.push({...st,m:[...st.m]}); if(a&&a[0]) st.m=mul(st.m,a[0])} else if(fn===OPS.paintFormXObjectEnd){if(stack.length) st=stack.pop()}
    else if(fn===OPS.setStrokeRGBColor) st.sc=hex(a); else if(fn===OPS.setFillRGBColor) st.fc=hex(a);
    else if(fn===OPS.setLineWidth) st.lw=a[0];
    else if(fn===OPS.setDash) st.dash=!!(a&&a[0]&&a[0].length&&a[0].some(v=>v>0));
    else if(fn===OPS.constructPath){const ops=a[0], c=a[1]; let k=0;
      // the current point lives until the path is painted: pdf.js may split one path over two constructPath ops
      for(const op of ops){
        if(op===OPS.moveTo){cur={pts:[T(c[k],c[k+1])],closed:false,curve:false}; subs.push(cur); curRaw=startRaw=[c[k],c[k+1]]; k+=2}
        else if(op===OPS.lineTo){if(!cur){cur={pts:[T(...(curRaw||[c[k],c[k+1]]))],closed:false}; subs.push(cur)} cur.pts.push(T(c[k],c[k+1])); curRaw=[c[k],c[k+1]]; k+=2}
        else if(op===OPS.curveTo||op===OPS.curveTo2||op===OPS.curveTo3){const n=op===OPS.curveTo?6:4; const p0=curRaw||[c[k],c[k+1]];
          const [p1,p2,p3]=op===OPS.curveTo?[[c[k],c[k+1]],[c[k+2],c[k+3]],[c[k+4],c[k+5]]]:op===OPS.curveTo2?[p0,[c[k],c[k+1]],[c[k+2],c[k+3]]]:[[c[k],c[k+1]],[c[k+2],c[k+3]],[c[k+2],c[k+3]]];
          if(!cur){cur={pts:[T(p0[0],p0[1])],closed:false}; subs.push(cur)} cur.curve=true;
          const cl=[p0,p1,p2,p3].map(q=>T(q[0],q[1])), Lc=hyp(cl[1][0]-cl[0][0],cl[1][1]-cl[0][1])+hyp(cl[2][0]-cl[1][0],cl[2][1]-cl[1][1])+hyp(cl[3][0]-cl[2][0],cl[3][1]-cl[2][1]), np=Math.max(2,Math.min(8,Math.ceil(Lc/.8)));
          for(let j=1;j<=np;j++){const t=j/np, u=1-t; cur.pts.push(T(u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]))}
          curRaw=p3; k+=n}
        else if(op===OPS.closePath){if(cur){cur.closed=true; if(cur.pts.length) cur.pts.push(cur.pts[0])} curRaw=startRaw}
        else if(op===OPS.rectangle){const x=c[k],y=c[k+1],w=c[k+2],h=c[k+3]; const q=[T(x,y),T(x+w,y),T(x+w,y+h),T(x,y+h)]; subs.push({pts:[...q,q[0]],closed:true,rect:true}); cur=null; k+=4}
      }}
    else if(fn===OPS.stroke||fn===OPS.closeStroke) flush(true,false);
    else if(fn===OPS.fill||fn===OPS.eoFill) flush(false,true);
    else if(fn===OPS.fillStroke||fn===OPS.closeFillStroke||fn===OPS.eoFillStroke||fn===OPS.closeEOFillStroke) flush(true,true);
    else if(fn===OPS.endPath){subs=[]; cur=null}
  }
  addLoops(objs); return objs};
// symbols drawn as separate strokes (a square as 4 lines): same-colour short lines joined end to end into a closed loop become a
// synthetic rect / polygon, so 'square with S' is a square to the rules and to size estimation (its strokes are not counted twice)
function addLoops(objs){const by={}; for(const o of objs) if(o.k==='line'&&o.stroke&&o.len<40) (by[o.stroke]=by[o.stroke]||[]).push(o);
  for(const [col,L] of Object.entries(by)){if(L.length>60000) continue; const segs=L.map(o=>({a:o.pts[0],b:o.pts[1],w:o.w}));
    for(const pts of FVE.chain(segs,.12)){if(pts.length<4) continue; const a=pts[0], z=pts[pts.length-1]; if(hyp(a[0]-z[0],a[1]-z[1])>.2) continue; const bb=bbOf(pts); if(bb[2]-bb[0]>40||bb[3]-bb[1]>40||bb[2]-bb[0]<.5||bb[3]-bb[1]<.5) continue;
      const corners=pts.slice(0,-1), ax=corners.length===4&&corners.every((p,i)=>{const q=corners[(i+1)%4]; return Math.abs(p[0]-q[0])<.1||Math.abs(p[1]-q[1])<.1});
      objs.push({k:ax?'rect':'polygon',pts,closed:true,bb,len:plen(pts),stroke:col,fill:null,w:L[0].w,dash:false,synthetic:true,id:objs.length})}}}

/* ------------------------------------------------------------------ layer 2: text, scale, sheet type */
FVE.extractTexts=function(tc,vp){const out=[];
  for(const it of tc.items){const s=(it.str||'').trim(); if(!s) continue; const [x,y]=vp.convertToViewportPoint(it.transform[4],it.transform[5]);
    const h=hyp(it.transform[2],it.transform[3])||8, ang=Math.round(Math.atan2(it.transform[1],it.transform[0])*180/Math.PI)-((vp.rotation||0)%360), w=it.width||h*s.length*.55;
    // a rotated page turns text with it: measure the box in the viewport's frame
    const a=((ang%360)+360)%360, vert=a>45&&a<135||a>225&&a<315;
    const bb=vert?[x-h*.8,y-w,x+h*.2,y]:[x,y-h*.8,x+w,y+h*.2];
    out.push({s,x,y,h,w,ang:a,vert,bb,cx:(bb[0]+bb[2])/2,cy:(bb[1]+bb[3])/2})}
  return out};
// words drawn inside PDF markups (a Bluebeam markup summary / count table is an annotation appearance: pdf.js has no text layer for it).
// ol: operator list WITH annotations (annotationMode ENABLE); only ops between beginAnnotation / endAnnotation are read → [{s, x, x1, cx, cy, h}]
FVE.markupWords=function(ol,vp,OPS){const out=[]; let inA=0, m=[1,0,0,1,0,0], stack=[], Tm=[1,0,0,1,0,0], Tlm=[1,0,0,1,0,0], fs=10, lead=0, cs=0, ws=0, hs=1, rise=0, word=null;
  const P=(x,y)=>{const M=mul(m,Tm); return vp.convertToViewportPoint(M[0]*x+M[2]*y+M[4],M[1]*x+M[3]*y+M[5])};
  const end=()=>{if(word&&word.s.trim()){const h=word.h; out.push({s:word.s.trim(),x:word.x,x1:word.x1,cx:(word.x+word.x1)/2,cy:word.y-h*.4,h,src:'markup'})} word=null}; /* h: glyph height as poppler's bbox words */
  for(let i=0;i<ol.fnArray.length;i++){const fn=ol.fnArray[i], a=ol.argsArray[i];
    if(fn===OPS.beginAnnotation){inA++; stack=[]; m=mul(mul([1,0,0,1,0,0],a[2]||[1,0,0,1,0,0]),a[3]||[1,0,0,1,0,0]); continue}
    if(fn===OPS.endAnnotation){end(); inA=Math.max(0,inA-1); continue}
    if(!inA) continue;
    if(fn===OPS.save) stack.push([m.slice(),fs,lead,cs,ws,hs,rise]); else if(fn===OPS.restore){end(); const q=stack.pop(); if(q) [m,fs,lead,cs,ws,hs,rise]=q}
    else if(fn===OPS.transform) m=mul(m,a);
    else if(fn===OPS.paintFormXObjectBegin){stack.push([m.slice(),fs,lead,cs,ws,hs,rise]); if(a&&a[0]) m=mul(m,a[0])} else if(fn===OPS.paintFormXObjectEnd){end(); const q=stack.pop(); if(q) [m,fs,lead,cs,ws,hs,rise]=q}
    else if(fn===OPS.beginText){Tm=[1,0,0,1,0,0]; Tlm=[1,0,0,1,0,0]} else if(fn===OPS.endText) end()
    else if(fn===OPS.setFont) fs=a[1]; else if(fn===OPS.setLeading) lead=a[0]; else if(fn===OPS.setCharSpacing) cs=a[0]; else if(fn===OPS.setWordSpacing) ws=a[0]; else if(fn===OPS.setHScale) hs=a[0]/100; else if(fn===OPS.setTextRise) rise=a[0];
    else if(fn===OPS.setTextMatrix){end(); Tm=a.slice(0,6); Tlm=Tm.slice()}
    else if(fn===OPS.moveText||fn===OPS.setLeadingMoveText){end(); if(fn===OPS.setLeadingMoveText) lead=-a[1]; Tlm=mul(Tlm,[1,0,0,1,a[0],a[1]]); Tm=Tlm.slice()}
    else if(fn===OPS.nextLine||fn===OPS.nextLineShowText||fn===OPS.nextLineSetSpacingShowText){end(); Tlm=mul(Tlm,[1,0,0,1,0,-lead]); Tm=Tlm.slice()}
    if(fn===OPS.showText||fn===OPS.showSpacedText||fn===OPS.nextLineShowText||fn===OPS.nextLineSetSpacingShowText){const G=a[0]||[];
      const sc=Math.hypot(...(()=>{const M=mul(m,Tm); return [M[2],M[3]]})())*fs||fs;
      for(const g of G){if(typeof g==='number'){const dx=-g/1000*fs*hs; if(dx>fs*.25) end(); Tm=mul(Tm,[1,0,0,1,dx,0]); continue}
        if(!g) continue; const u=g.unicode||'', w=(g.width||0)/1000*fs, dx=(w+cs+(g.isSpace||u===' '?ws:0))*hs;
        if(g.isSpace||/^\s+$/.test(u)) end(); else {const [x0,y0]=P(0,rise), [x1]=P(dx,rise); if(!word) word={s:'',x:Math.min(x0,x1),x1:Math.max(x0,x1),y:y0,h:sc*.72}; word.s+=u; word.x=Math.min(word.x,x0,x1); word.x1=Math.max(word.x1,x0,x1)}
        Tm=mul(Tm,[1,0,0,1,dx,0])}}}
  end(); return out};
// horizontal text pieces on one baseline joined left to right
FVE.textLines=function(texts){const its=texts.filter(t=>!t.vert).sort((a,b)=>a.y-b.y||a.x-b.x), lines=[];
  for(const t of its){const l=lines.find(l=>Math.abs(l.y-t.y)<Math.max(l.h,t.h)*.45&&t.x>=l.x1-l.h*.3&&t.x-l.x1<l.h*1.6&&Math.abs(l.h-t.h)<l.h*.35);
    if(l){l.s+=' '+t.s; l.x1=t.x+t.w; l.items.push(t); l.bb=bbUnion(l.bb,t.bb)} else lines.push({s:t.s,x:t.x,x1:t.x+t.w,y:t.y,h:t.h,items:[t],bb:t.bb.slice()})}
  lines.forEach(l=>{l.cy=(l.bb[1]+l.bb[3])/2}); return lines};
const PAPER={0:1189,1:841,2:594,3:420,4:297};
// '1:100', '1 : 50 @ A1', 'SCALE 1:200@A1' → metres per page unit; a sheet printed at another size than stated is corrected
FVE.findScale=function(texts,page){const votes={}; const pl=Math.max(page.w,page.h)/72*25.4;
  for(const t of texts){const re=/(?<![\d.])1\s?:\s?(\d{1,4})\b(?:\s*@\s*A([0-4]))?/gi; let m; while((m=re.exec(t.s))){let n=+m[1]; if(!(n>=1&&n<=2000)||(n>=1900&&n<=2100)) continue;
      if(m[2]!=null){const AL=PAPER[m[2]]; if(AL&&Math.abs(pl-AL)>15) n=n*AL/pl}
      // the title block (bottom-right quarter) speaks for the sheet; viewports elsewhere may be details at other scales
      const w=(t.cx>page.w*.6&&t.cy>page.h*.6?3:1)*(m[2]!=null?2:1); votes[n]=(votes[n]||0)+w}}
  const best=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0]; if(!best) return null; let ratio=+best;
  // a size-corrected ratio lands a hair off the standard scale it is (420.16 mm vs 420 mm): snap within 1.5 %
  const STD=[1,2,5,10,20,25,50,75,100,125,150,200,250,300,400,500,750,1000,1250,1500,2000,2500]; const sn=STD.find(v=>Math.abs(v-ratio)/v<.015); if(sn) ratio=sn; return {ratio:Math.round(ratio*100)/100,mPerUnit:ratio*25.4/72/1000}};
const SHEET_KW=[['cover',/\bCOVER\b|DRAWING\s+(LIST|SCHEDULE|REGISTER)|SHEET\s+LIST/],['legend',/\bLEGEND\b|\bSYMBOLS?\b|ABBREVIATIONS?/],
  ['notes',/SPECIFICATION|GENERAL\s+NOTES|\bNOTES\b/],['schematic',/SCHEMATIC|RISER\s+DIAGRAM|BLOCK\s+DIAGRAM/],['detail',/\bDETAILS?\b|DETAIL\s+SHEET|TYPICAL\s+INSTALL/],
  ['site',/SITE\s+PLAN|LOCALITY|LOCATION\s+PLAN/],['plan',/LAYOUT|FLOOR\s+PLAN|\bLEVEL\s*\d|\bL\d{1,2}\b|BASEMENT|GROUND|FIRST\s+FLOOR|SECOND\s+FLOOR|ROOF|MEZZANINE|COVERAGE/]];
// what a sheet is: from its title block wording (bottom-right) and how much drawing is on it
const normT=s=>String(s).toUpperCase().replace(/\s+/g,' ').trim();
FVE.classifySheet=function(m,ignore){const keep=t=>!ignore||!ignore.has(normT(t.s)); const tb=m.texts.filter(t=>t.cx>m.page.w*.55&&t.cy>m.page.h*.55&&keep(t)), all=m.texts.filter(keep); const score={};
  const add=(arr,w)=>{for(const t of arr){const u=t.s.toUpperCase(); for(const [k,re] of SHEET_KW) if(re.test(u)) score[k]=(score[k]||0)+w}};
  add(tb,3); add(all.filter(t=>t.h>=Math.max(...all.map(x=>x.h))*.6),1);
  const draw=m.objects.length; let kind=Object.keys(score).sort((a,b)=>score[b]-score[a])[0]||(draw>3000?'plan':'notes');
  // a sheet that is mostly drawing is a plan even if 'legend' or 'notes' appear in its title block margin notes
  if(kind!=='plan'&&score.plan&&draw>8000&&score.plan>=(score[kind]||0)*.5) kind='plan';
  // a page of words with little drawing is a notes / specification sheet whatever its title says (small fit-out plans stay plans)
  if(kind==='plan'&&draw<400&&all.length>Math.max(40,draw*.5)) kind='notes';
  const title=tb.filter(t=>/[A-Z]{3,}/.test(t.s)&&t.s.length>4).sort((a,b)=>b.h-a.h).slice(0,3).map(t=>t.s).join(' · ');
  return {kind,score,title}};

/* ------------------------------------------------------------------ model of one page */
FVE.buildModel=async function(pdfPage,OPS,meta){const vp=pdfPage.getViewport({scale:1});
  // PDF markups (a reviewer's ticks, an estimator's count boxes) are left out of the drawing and read separately as markups
  const [ol,tc,an]=await Promise.all([pdfPage.getOperatorList({annotationMode:0}),pdfPage.getTextContent(),pdfPage.getAnnotations().catch(()=>[])]);
  const objects=FVE.extractObjects(ol,vp,OPS), texts=FVE.extractTexts(tc,vp); const page={w:vp.width,h:vp.height,rot:vp.rotation||0,...(meta||{})};
  const m={page,objects,texts,lines:FVE.textLines(texts)}; m.index=new RTree(objects,o=>o.bb); m.tindex=new RTree(texts,t=>t.bb);
  m.scale=FVE.findScale(texts,page); m.sheet=FVE.classifySheet(m); m.markups=FVE.markups(an,vp); return m};
// markups by kind and colour (Bluebeam count tools leave one per device): a second opinion for verification, never counted as devices
FVE.markups=function(an,vp){const out={}; for(const a of an||[]){if(!a||a.subtype==='Link'||a.subtype==='Widget') continue; const c=a.color?hex(a.color):'';
    const k=a.subtype+(c?'#'+c:''); const r=a.rect?vp.convertToViewportRectangle(a.rect):null; (out[k]=out[k]||{n:0,at:[]}).n++; if(r&&out[k].at.length<2000) out[k].at.push([(r[0]+r[2])/2,(r[1]+r[3])/2])}
  return out};
// the model's objects as plain segments (for the app's segment-based matcher)
FVE.segments=function(objs){const out=[]; for(const o of objs){if(o.synthetic) continue; const col=o.stroke||o.fill||'000000'; for(let i=1;i<o.pts.length;i++){const a=o.pts[i-1], b=o.pts[i], L=hyp(b[0]-a[0],b[1]-a[1]); if(L>.05) out.push({a,b,L,col,w:o.w,f:o.stroke?0:1,o:o.id})}} return out};


/* ------------------------------------------------------------------ vocabulary: legend wording → device type and status
   Ordered most specific first. Keys are FireTake item keys; the app ignores any key it does not price. */
FVE.DESC_RULES=[
  ['cs_smoke',/(CONCEALED|CEILING|ROOF)\s*(SPACE|VOID).*(SMOKE|DETECT)|REMOTE\s*INDICATOR/],['duct_probe',/DUCT.*(PROBE|DETECT|SAMPL)|IN-?DUCT/],
  ['heat',/HEAT|THERMAL|RATE.OF.RISE|FIXED\s*TEMP/],['smoke',/SMOKE|PHOTO.?ELECTRIC|OPTICAL|MULTI.?SENSOR|MULTI.?CRITERIA|\bDETECTOR\b/],
  ['mcp',/MANUAL\s*CALL|BREAK\s*GLASS/],['wip',/WARDEN|\bWIP\b|INTERCOM/],['horn',/HORN/],['proj_spk',/PROJECTION/],['spk_surf',/(SURFACE|WALL).*SPEAKER/],['speaker',/SPEAKER|LOUDSPEAKER/],
  ['sounder',/SOUNDER|STROBE|VISUAL\s*(ALARM|WARN)|\bVAD\b|\bBELL\b|BEACON|FLASHING/],['door_mag',/DOOR\s*(HOLD|MAG|RELEASE)|MAGNETIC/],
  ['fip',/INDICATOR\s*PANEL|\bFIP\b|\bFDCIE\b|ALARM\s*PANEL|\bMIMIC\b/],['relay',/INTERFACE|RELAY|INPUT\s*\/?\s*OUTPUT|\bMODULE\b|\bI\/O\b/],
  ['spk_space',/(CONCEALED|CEILING|ROOF)\s*(SPACE|VOID).*(SPRINKLER|HEAD)/],['spk_side',/SIDE\s*WALL/],['spk_semi',/SEMI.?RECESS/],['spk_conc',/CONCEALED.*(SPRINKLER|PENDANT|PENDENT)|FLUSH/],
  ['spk_up',/UPRIGHT/],['spk_duct',/(UNDER|BELOW).*(DUCT|AHU)|DUCT.*SPRINKLER/],['spk_pend',/PENDENT|PENDANT|SPRINKLER\s*HEAD|ESFR|\bSPRINKLER\b(?!.*(PIPE|MAIN|RANGE|VALVE|PUMP))/],
  ['flowsw',/FLOW\s*SWITCH/],['testdrain',/TEST.*DRAIN|DRAIN\s*VALVE/],['valveset',/CONTROL\s*VALVE|ALARM\s*VALVE|VALVE\s*SET/],
  ['isov',/ISOLAT\w*\s*VALVE|MONITORED\s*VALVE|GATE\s*VALVE|BUTTERFLY/],['booster',/BOOSTER/],['pump',/\bPUMP\b/],['hydrant',/HYDRANT|LANDING\s*VALVE/],
  ['hosereel',/HOSE\s*REEL/],['ext_co2',/\bCO2\b|CO₂|CARBON\s*DIOXIDE/],['ext_wc',/WET\s*CHEM/],['ext_afff',/AFFF|FOAM/],['ext_abe',/EXTINGUISHER|\bABE\b|DRY\s*(CHEM|POWDER)/],
  ['blanket',/BLANKET/],['exit',/\bEXIT\b/],['emlight',/EMERGENCY\s*(LIGHT|LUMIN)|\bEM\s*LIGHT/]];
FVE.STATUS_RULES=[['remove',/TO\s*BE\s*(REMOVED|DELETED|DEMOLISHED)|\bDELETED?\b|\bDEMOLISH|\bREMOVE/],['relocate',/RELOCAT|RE-?SET\b/],['retain',/EXISTING|TO\s*REMAIN|\bRETAIN/],['new',/\bNEW\b/]];
// what a legend line type is: pipe, cable or something to ignore (setting out, notation)
FVE.LINE_RULES=[['pipe',/PIPE|PIPEWORK|\bMAIN\b|\bRANGE\b|DROPPER|RISER|HOSEREEL|SPRINKLER|HYDRANT|DRAIN/],['cable',/CABLE|CABLING|WIRING|\bLOOP\b|CONDUIT|EWIS|CIRCUIT/]];
FVE.classifyDesc=function(desc){const u=String(desc||'').toUpperCase(); let type=null, status=null; for(const [k,re] of FVE.DESC_RULES) if(re.test(u)){type=k; break}
  for(const [k,re] of FVE.STATUS_RULES) if(re.test(u)){status=k; break} return {type,status}};
const NOTATION_RE=/JUNCTION|BRANCH|TERMINAT|CAPPED|CONTINUATION|\bRISER\b|DROPPER|RISE\s+ON|DROP\s+ON|PENETRATION|FLEXIBLE|CONNECTION|ASSEMBLY|SECTION|INDICATES|REFER/;
FVE.lineClass=function(desc){const u=String(desc||'').toUpperCase(); if(NOTATION_RE.test(u)) return null; for(const [k,re] of FVE.LINE_RULES) if(re.test(u)) return k; return null};

/* ------------------------------------------------------------------ layer 3: legend analysis */
const HEAD_RE=/\b(LEGEND|SYMBOLS?|ABBREVIATIONS?|ABBRIVIATIONS?|NOTATIONS?|EXTINGUISHERS?\s+TYPE|SPRINKLER\s+HEAD\s+TYPE|DEVICE\s+TYPES?|KEY)\b/;
const ABBR_RE=/^([A-Z][A-Z0-9\/&.]{0,7}|[a-z][A-Z]{1,5})(?:\s+[-–=:]\s*|\s*[-–=:]\s+)([A-Z].{2,})$/; // 'SD - SMOKE DETECTOR', not 'MULTI-CRITERIA'
const shapeSize=o=>o.k==='circle'?o.r:Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1]);
const median=a=>{const b=a.slice().sort((x,y)=>x-y); return b.length?b[b.length>>1]:0};
// the title block: the sheet border's inner frame on the right or along the bottom (long straight lines near the edge)
FVE.titleBlock=function(m){const W=m.page.w, H=m.page.h; let tbx=W, tby=H;
  // a border is black / grey and runs (nearly) the full sheet: a long coloured riser or main near the edge is drawing, not frame
  const grey=c=>{if(!c) return false; const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), bl=parseInt(c.slice(4,6),16); return Math.max(r,g,bl)-Math.min(r,g,bl)<40};
  for(const o of m.objects){if((o.k!=='line'&&o.k!=='polyline'&&o.k!=='rect')||!grey(o.stroke)) continue; const b=o.bb, bw=b[2]-b[0], bh=b[3]-b[1];
    if(bw<1.5&&bh>H*.8&&b[0]>W*.72&&b[0]<tbx) tbx=b[0]; if(bh<1.5&&bw>W*.8&&b[1]>H*.78&&b[1]<tby) tby=b[1]}
  const z=[]; if(tbx<W*.995) z.push([tbx,0,W,H]); if(tby<H*.995) z.push([0,tby,W,H]); return z};
FVE.analyzeLegend=function(m){const L=m.lines, bodyH=median(L.map(l=>l.h))||6, out={sections:[],symbols:[],lineTypes:[],abbrev:{},zones:[]};
  const heads=L.filter(l=>HEAD_RE.test(l.s.toUpperCase())&&l.s.length<70&&!/^\d/.test(l.s)&&!ABBR_RE.test(l.s));
  // legend sheets with category boxes (FIRE SPRINKLERS & HYDRANTS, FIRE DETECTION, PIPING SYSTEM …): a short all-caps line clearly taller
  // than the body text (1.25–2.5×) with rows beneath it in its column is a section heading too
  if(m.sheet&&m.sheet.kind==='legend') for(const l of L){if(heads.includes(l)||l.s.length>45||/[a-z]/.test(l.s)||!/[A-Z]{3}/.test(l.s)||/^\d/.test(l.s)||ABBR_RE.test(l.s)) continue;
    if(l.h<bodyH*1.25||l.h>bodyH*2.5) continue;
    const lw=l.x1-l.x, below=L.filter(o=>o!==l&&o.cy>l.cy&&o.cy-l.cy<bodyH*8&&Math.abs(o.h-bodyH)<bodyH*.2&&o.x>=l.x-Math.max(bodyH*6,lw)&&o.x<=l.x+bodyH*30).length; if(below>=2){l.boxed=true; heads.push(l)}}
  const tb=FVE.titleBlock(m), inTB=b=>tb.some(z=>b[0]>=z[0]&&b[1]>=z[1]);
  const usedLine=new Set();
  for(const h of heads){if(inTB(h.bb)) continue; const hw=h.x1-h.x;
    // a heading centred in its box: its rows (and their symbols) start left of it, by up to the heading's width
    const left=h.boxed?h.x-Math.max(bodyH*3,hw*.9):h.x-bodyH*3, symLeft=h.boxed?h.x-Math.max(bodyH*6,hw*1.3):h.x-bodyH*3;
    // entries: lines below the heading, in its column, before the next heading of that column
    const cand=L.filter(l=>l!==h&&!heads.includes(l)&&l.cy>h.cy&&l.x>=left&&l.x<=h.x+Math.max(hw*1.3,bodyH*25)&&!inTB(l.bb));
    const below=heads.filter(o=>o!==h&&o.cy>h.cy&&Math.abs(o.x-h.x)<Math.max(hw,bodyH*20)); const stopY=below.length?Math.min(...below.map(o=>o.cy)):Infinity;
    let rows=cand.filter(l=>l.cy<stopY).sort((a,b)=>a.cy-b.cy); const keep=[]; let lastY=h.cy;
    for(const r of rows){if(r.cy-lastY>bodyH*9) break; keep.push(r); lastY=r.cy} rows=keep; if(!rows.length) continue;
    const sec={title:h.s,head:h,rows:[],bb:h.bb.slice()}; out.sections.push(sec);
    // the description column: where most rows start (rows further left are symbol tags / abbreviations)
    const xs=rows.map(r=>Math.round(r.x/(bodyH*2))); const mode=+Object.entries(xs.reduce((o,v)=>(o[v]=(o[v]||0)+1,o),{})).sort((a,b)=>b[1]-a[1])[0][0]*bodyH*2;
    rows.forEach((r,i)=>{if(usedLine.has(r)) return; usedLine.add(r); sec.bb=bbUnion(sec.bb,r.bb);
      // abbreviations: 'SD - SMOKE DETECTOR' (one line) or 'SD' … '- SMOKE DETECTOR' (two pieces on a baseline)
      const am=r.s.match(ABBR_RE); if(am){out.abbrev[am[1].toUpperCase()]=am[2].trim(); sec.kind='abbrev'; return}
      // an ABBREVIATIONS section laid out as two columns with no dash ('R      RELOCATED'): a short key on the row's left, its meaning after it
      if(/ABBREV/i.test(h.s)){const it=(r.items||[]).slice().sort((a,b)=>a.x-b.x); if(it.length>=2&&/^[A-Za-z][A-Za-z0-9\/&.]{0,5}$/.test(String(it[0].s).trim())&&it[1].x-it[0].x1>r.h*2){const val=it.slice(1).map(t=>t.s).join(' ').trim(); if(/^[A-Z][A-Z0-9 ,&\/()'.-]{2,}$/.test(val)){out.abbrev[String(it[0].s).trim().toUpperCase()]=val; sec.kind='abbrev'; return}}
        if(/^[A-Z][A-Z0-9 ,&\/()'.-]{2,}$/.test(r.s)){const t=L.find(o=>o!==r&&Math.abs(o.cy-r.cy)<r.h*.5&&o.x1<=r.x&&r.x-o.x1<r.h*20&&/^[A-Za-z][A-Za-z0-9\/&.]{0,5}$/.test(o.s)); if(t){out.abbrev[t.s.toUpperCase()]=r.s.trim(); usedLine.add(t); sec.kind='abbrev'; return}}}
      if(/^[-–]\s*[A-Z]/.test(r.s)){const t=L.find(o=>o!==r&&Math.abs(o.cy-r.cy)<r.h*.5&&o.x1<=r.x+r.h&&r.x-o.x1<r.h*12&&/^[A-Z][A-Z0-9\/&.]{0,7}$/.test(o.s)); if(t){out.abbrev[t.s.toUpperCase()]=r.s.replace(/^[-–]\s*/,'').trim(); usedLine.add(t); sec.kind='abbrev'; return}}
      if(r.x<mode-bodyH*3) return; // a tag or label sitting in the symbol column, handled with its row
      const prev=rows[i-1], next=rows[i+1]; const half=Math.min(Math.max(((next?next.cy:r.cy+r.h*3)-(prev?prev.cy:r.cy-r.h*3))/4,r.h*.8),r.h*3);
      const zone=[Math.max(symLeft,r.x-bodyH*40),r.cy-half,r.x-bodyH*.3,r.cy+half];
      // white fills are masks laid under a symbol (they hide the background), not part of it
      // a symbol nearly as tall as the row spacing pokes a little past the row: centre inside the row, box within half a row more
      const tol=half*.5, objs=m.index.search(...zone).filter(o=>{const cx=(o.bb[0]+o.bb[2])/2, cy=(o.bb[1]+o.bb[3])/2; return cx>=zone[0]&&cx<=zone[2]&&cy>=zone[1]&&cy<=zone[3]&&o.bb[0]>=zone[0]-1&&o.bb[2]<=zone[2]+1&&o.bb[1]>=zone[1]-tol&&o.bb[3]<=zone[3]+tol&&!(!o.stroke&&o.fill==='ffffff')&&o.stroke!=='ffffff'});
      const tags=m.texts.filter(t=>t.cx>zone[0]&&t.cx<zone[2]&&t.cy>zone[1]&&t.cy<zone[3]&&!r.items.includes(t)&&t.s.length<=12).map(t=>t.s);
      sec.rows.push(r); sec.bb=bbUnion(sec.bb,zone);
      // a boxed section's wide zone can reach the neighbouring column: keep the cluster of pieces next to the row's text (gaps under
      // 2.5 text heights), not a glyph or tick from the column beside it
      if(h.boxed&&objs.length>1){const g=bodyH*2.5, gap=(a,b)=>Math.max(a.bb[0]-b.bb[2],b.bb[0]-a.bb[2],a.bb[1]-b.bb[3],b.bb[1]-a.bb[3],0);
        const seed=objs.reduce((m,o)=>o.bb[2]>m.bb[2]?o:m,objs[0]), keep=new Set([seed]); let grew=true;
        while(grew){grew=false; for(const o of objs) if(!keep.has(o)&&[...keep].some(k=>gap(o,k)<=g)){keep.add(o); grew=true}}
        for(let i=objs.length-1;i>=0;i--) if(!keep.has(objs[i])) objs.splice(i,1)}
      const desc=r.s.trim(); if(!objs.length&&!tags.length) return;
      const ob=objs.length?objs.reduce((u,o)=>bbUnion(u,o.bb),objs[0].bb.slice()):null;
      // a line type: a long, low sample (pipework / cabling legend)
      const lineObj=objs.filter(o=>(o.k==='line'||o.k==='polyline')&&(o.bb[2]-o.bb[0])>Math.max(bodyH*4,(zone[2]-zone[0])*.35)&&(o.bb[3]-o.bb[1])<bodyH*1.2).sort((a,b)=>b.len-a.len)[0];
      const pieces=objs.filter(o=>o.k==='line'&&(o.bb[3]-o.bb[1])<bodyH*.6), longest=pieces.reduce((m2,o)=>Math.max(m2,o.len),0);
      const span=ob?ob[2]-ob[0]:0, dashed=objs.some(o=>o.dash)||(pieces.length>=3&&longest<span*.45);
      const cls=FVE.lineClass(desc), ct=FVE.classifyDesc(desc);
      // a row naming a device with no run word ('CONCEALED SPACE SPRINKLER - PENDENT') is a symbol, however its sample is drawn
      const runWord=/PIPE|PIPEWORK|\bMAIN|\bRANGE|RING|CABLE|CABLING|WIRING|\bLOOP|CONDUIT|\bLINE\b|DUCT\s*WORK/.test(desc.toUpperCase());
      if((lineObj||(dashed&&span>bodyH*4))&&!(ct.type&&!cls)&&!(ct.type&&!runWord)){const ref=lineObj||pieces[0]; const ink=pieces.reduce((a,o)=>a+o.len,0)+(lineObj?lineObj.len:0);
        out.lineTypes.push({id:'lt'+out.lineTypes.length,page:m.page.id,desc,cls,status:ct.status,stroke:ref.stroke||ref.fill,w:ref.w,dashed,duty:dashed&&span?Math.min(1,ink/span):1,bb:ob,tags});
        return}
      if(!objs.length) return; const c=[(ob[0]+ob[2])/2,(ob[1]+ob[3])/2];
      const segs=FVE.segments(objs).map(s=>({a:[s.a[0]-c[0],s.a[1]-c[1]],b:[s.b[0]-c[0],s.b[1]-c[1]],L:s.L,c:s.col,col:s.col,f:s.f}));
      const cols={}; objs.forEach(o=>{const k=o.stroke||o.fill; if(k) cols[k]=(cols[k]||0)+o.len}); const color=Object.keys(cols).sort((a,b)=>cols[b]-cols[a])[0]||null;
      const circles=objs.filter(o=>o.k==='circle'&&o.stroke).map(o=>({col:o.stroke,r:o.r}));
      const key=objs.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')).map(o=>({k:o.k,col:o.stroke,size:shapeSize(o)})).sort((a,b)=>b.size-a.size)[0]||null;
      const lite=objs.map(o=>({k:o.k,bb:o.bb,c:o.c,r:o.r,pts:o.pts,stroke:o.stroke,fill:o.fill,closed:o.closed,synthetic:o.synthetic,len:o.len,w:o.w}));
      out.symbols.push({id:'sy'+out.symbols.length,page:m.page.id,desc,type:ct.type,status:ct.status,tags,bb:ob,c,segs,objs:lite,color,key,cols:[...new Set(objs.map(o=>o.stroke||o.fill).filter(Boolean))],circles,shapes:[...new Set(objs.map(o=>o.k))]})})}
  if(heads.length) for(const r of L){if(inTB(r.bb)) continue; const am=r.s.match(ABBR_RE); if(am&&am[2].length<60){const k=am[1].toUpperCase(); if(!out.abbrev[k]) out.abbrev[k]=am[2].trim()}
    else if(/^[-–]\s*[A-Z]/.test(r.s)){const t=L.find(o=>o!==r&&Math.abs(o.cy-r.cy)<r.h*.5&&o.x1<=r.x+r.h&&r.x-o.x1<r.h*12&&/^[A-Z][A-Z0-9\/&.]{0,7}$/.test(o.s)); if(t&&!out.abbrev[t.s.toUpperCase()]) out.abbrev[t.s.toUpperCase()]=r.s.replace(/^[-–]\s*/,'').trim()}}
  out.zones=out.sections.filter(s=>s.rows.length||s.kind==='abbrev').map(s=>s.bb);
  return out};
/* ------------------------------------------------------------------ layer 3b: geometric legend (CAD line lettering)
   Some consultants plot the legend as strokes, not text: there is nothing to read, so the legend is cut by geometry instead —
   the column of symbols, one row each, the status letter beside it (N / E / R / D in stroke lettering) and the symbol's colour.
   Rows come back untyped unless a consultant library knows the symbol (geoHash) or the estimator names it once. */
// phasing colour class of a CAD colour: saturated → its hue, otherwise black / grey by lightness (a 575757 'existing' grey is grey, not black)
FVE.colClass=function(h){if(!h||h.length<6) return 'black'; const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16), mx=Math.max(r,g,b), mn=Math.min(r,g,b);
  if(mx-mn>70){const R=r/255,G=g/255,B=b/255, M=mx/255, m=mn/255; let H=M===m?0:M===R?60*(((G-B)/(M-m))%6):M===G?60*((B-R)/(M-m)+2):60*((R-G)/(M-m)+4); if(H<0) H+=360;
    return H<18||H>=330?'red':H<45?'orange':H<70?'yellow':H<165?'green':H<200?'cyan':H<260?'blue':'magenta'}
  return (r+g+b)/3<45?'black':(r+g+b)/3>235?'white':'grey'};
// N / E / R / D from CAD stroke lettering: E = three bars and an upright, N = two uprights and a diagonal,
// R = a bowl (many short strokes) with a long diagonal leg, D = a bowl and an upright, no leg
FVE.strokeLetter=function(sg){if(!sg.length) return null; const ys=sg.flatMap(s=>[s.a[1],s.b[1]]), h=Math.max(...ys)-Math.min(...ys)||1; let hz=0,vt=0,dg=0,longDg=0,sh=0;
  for(const s of sg){const a=Math.abs(Math.atan2(s.b[1]-s.a[1],s.b[0]-s.a[0])*180/Math.PI)%180; if(s.L<h*.2){sh++; continue} if(a<15||a>165) hz++; else if(a>75&&a<105) vt++; else {dg++; if(s.L>h*.35) longDg++}}
  if(sh<=1&&hz>=3&&vt>=1&&dg===0) return 'E'; if(sh<=1&&vt>=2&&longDg>=1&&hz===0) return 'N'; if(sh>=3&&longDg>=1) return 'R'; if(sh>=3&&vt>=1&&longDg===0) return 'D'; return null};
FVE.LETTER_STATUS={N:'new',E:'retain',R:'relocate',D:'remove'};
// where the symbol column is when nobody drew a box: a narrow vertical band of small coloured pieces, stacked on many rows, in at least two
// colours (new / existing / remove …), outside the title block; returns [x0,y0,x1,y1] or null
FVE.findLegendColumn=function(m){const tb=FVE.titleBlock(m), inTB=b=>tb.some(z=>b[0]>=z[0]&&b[1]>=z[1]); const lim=Math.min(m.page.w,m.page.h)*.03;
  const P=m.objects.filter(o=>{if(o.synthetic) return false; const c=FVE.colClass(o.stroke||o.fill); if(c==='black'||c==='white') return false; const s=Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1]); return s<lim&&s>.5&&!inTB(o.bb)});
  if(P.length<6) return null; const ms=median(P.map(o=>Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])))||4, bw=Math.max(ms*4,30);
  const bins={}; P.forEach(o=>{const k=Math.floor((o.bb[0]+o.bb[2])/2/bw); (bins[k]=bins[k]||[]).push(o)}); let best=null;
  for(const k of Object.keys(bins).map(Number)){const g=[].concat(bins[k-1]||[],bins[k]||[],bins[k+1]||[]); const rows=new Set(g.map(o=>Math.round((o.bb[1]+o.bb[3])/2/(ms*1.5))));
    const cls=new Set(g.map(o=>FVE.colClass(o.stroke||o.fill))); if(rows.size<5||cls.size<2) continue; const sc=rows.size*Math.min(cls.size,3);
    if(!best||sc>best.sc) best={sc,g}}
  if(!best) return null; const g=best.g;
  // the densest vertical run of rows (a coloured note elsewhere in the band is not part of the legend)
  const ys=g.map(o=>(o.bb[1]+o.bb[3])/2).sort((a,b)=>a-b); const gaps=ys.slice(1).map((y,i)=>y-ys[i]).filter(d=>d>ms), gapMax=Math.max(ms*8,(median(gaps)||ms)*5);
  let runs=[[ys[0]]]; for(let i=1;i<ys.length;i++){if(ys[i]-ys[i-1]>gapMax) runs.push([]); runs[runs.length-1].push(ys[i])}
  const run=runs.sort((a,b)=>b.length-a.length)[0], y0=run[0], y1=run[run.length-1]; const G=g.filter(o=>{const cy=(o.bb[1]+o.bb[3])/2; return cy>=y0&&cy<=y1});
  const x0=Math.min(...G.map(o=>o.bb[0])), x1=Math.max(...G.map(o=>o.bb[2])); const sz=median(G.map(o=>Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])));
  return [x0-sz*2.5,y0-sz*3,x1+sz*1.2,y1+sz*3]};
// rows of a geometric legend inside box (or the column found above): [{b, cx, cy, col, cls, letter, status, objs, segs, ms}]
FVE.legendColumn=function(m,box){box=box||FVE.findLegendColumn(m); if(!box) return [];
  const inR=q=>q[0]>=box[0]&&q[0]<=box[2]&&q[1]>=box[1]&&q[1]<=box[3];
  const objs=m.index.search(...box).filter(o=>!o.synthetic&&o.stroke!=='ffffff'&&!(!o.stroke&&o.fill==='ffffff'));
  const sg=FVE.segments(objs).filter(s=>inR(s.a)&&inR(s.b)&&s.L<(box[3]-box[1])*.5); if(sg.length<3) return [];
  const seen=new Set(), sgu=[]; for(const s of sg){const k=s.col+'|'+[s.a,s.b].map(q=>Math.round(q[0]*20)+','+Math.round(q[1]*20)).sort().join('|'); if(!seen.has(k)){seen.add(k); sgu.push(s)}}
  if(sgu.length>40000) return [];
  // joined line work (pieces touching within 0.3 pt), found through a grid so a whole legend sheet stays quick
  const tol=.3, cell=4, Gd=new Map();
  sgu.forEach((s,i)=>{for(let gx=Math.floor((Math.min(s.a[0],s.b[0])-tol)/cell);gx<=Math.floor((Math.max(s.a[0],s.b[0])+tol)/cell);gx++) for(let gy=Math.floor((Math.min(s.a[1],s.b[1])-tol)/cell);gy<=Math.floor((Math.max(s.a[1],s.b[1])+tol)/cell);gy++){const k=gx+','+gy; let a=Gd.get(k); if(!a) Gd.set(k,a=[]); a.push(i)}});
  const near=(q,s)=>segDist(q,s.a,s.b);
  const gid=new Int32Array(sgu.length).fill(-1), comps=[];
  for(let i=0;i<sgu.length;i++){if(gid[i]>=0) continue; const q=[i], mm=[]; gid[i]=comps.length;
    while(q.length){const k=q.pop(), s=sgu[k]; mm.push(k); const cand=new Set(); for(const p2 of [s.a,s.b,[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2]]) for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){const a=Gd.get((Math.floor(p2[0]/cell)+dx)+','+(Math.floor(p2[1]/cell)+dy)); if(a) a.forEach(j=>cand.add(j))}
      for(const j of cand){if(gid[j]>=0) continue; const u=sgu[j]; if(near(u.a,s)<tol||near(u.b,s)<tol||near(s.a,u)<tol||near(s.b,u)<tol){gid[j]=comps.length; q.push(j)}}}
    const b=bbOf(mm.flatMap(k=>[sgu[k].a,sgu[k].b])); comps.push({m:mm,b,sz:Math.max(b[2]-b[0],b[3]-b[1])})}
  // symbols are the bigger pieces, roughly as wide as tall (status letters and lettering are narrow), in the left-most column;
  // a dashed symbol arrives in pieces: same-colour (not black) pieces close together are joined first
  const szs=comps.map(c=>c.sz).sort((a,b)=>a-b), upper=szs.slice(szs.length>>1), ms=upper[upper.length>>1]||1, mn=c=>Math.min(c.b[2]-c.b[0],c.b[3]-c.b[1]);
  const colOf=c=>{if(c.col) return c.col; const n={}; c.m.forEach(k=>n[sgu[k].col]=(n[sgu[k].col]||0)+sgu[k].L); return c.col=Object.keys(n).sort((a,b)=>n[b]-n[a])[0]};
  const ub=g=>g.reduce((u,x)=>bbUnion(u,x.b),g[0].b.slice());
  const small=comps.filter(c=>mn(c)<ms*.4&&c.sz<ms*1.2&&FVE.colClass(colOf(c))!=='black'), used=new Set();
  for(const c of small){if(used.has(c)) continue; const g=[c]; used.add(c); const col=colOf(c); let grew=true;
    while(grew){grew=false; const b=ub(g);
      for(const o of small){if(used.has(o)||colOf(o)!==col) continue; const gap=Math.max(o.b[0]-b[2],b[0]-o.b[2],o.b[1]-b[3],b[1]-o.b[3]); if(gap<ms*.3&&Math.max(b[2],o.b[2])-Math.min(b[0],o.b[0])<ms*1.6&&Math.max(b[3],o.b[3])-Math.min(b[1],o.b[1])<ms*1.6){g.push(o); used.add(o); grew=true}}}
    if(g.length>1){const b=ub(g); comps.push({m:g.flatMap(x=>x.m),b,sz:Math.max(b[2]-b[0],b[3]-b[1])})}}
  let big=comps.filter(c=>c.sz>=ms*.5&&mn(c)>=ms*.4&&c.m.length>=3);
  if(!big.length) return []; const x0=Math.min(...big.map(c=>c.b[0])); big=big.filter(c=>c.b[0]<x0+ms*2.2);
  big.sort((a,b)=>(a.b[1]+a.b[3])-(b.b[1]+b.b[3])); const rows=[];
  for(const c of big){const r=rows.find(r=>c.b[1]<r.b[3]-ms*.15&&c.b[3]>r.b[1]+ms*.15); if(r){r.c.push(c); r.b=bbUnion(r.b,c.b)} else rows.push({c:[c],b:c.b.slice()})}
  // pieces level with a row and touching its right side belong to it (a 're-set' arrow drawn as two open strokes)
  for(const r of rows){let grew=true; while(grew){grew=false; for(const c of comps){if(r.c.includes(c)||c.sz>ms*1.5) continue; const ov=Math.min(c.b[3],r.b[3])-Math.max(c.b[1],r.b[1]);
      if(ov<(c.b[3]-c.b[1])*.5||c.b[0]<r.b[0]+ms*.2||c.b[0]-r.b[2]>ms*.3||c.b[2]>r.b[0]+ms*2.5) continue; r.c.push(c); r.b=bbUnion(r.b,c.b); grew=true}}}
  const byId=new Map(m.objects.map(o=>[o.id,o]));
  const out=rows.map(r=>{const b=r.b, cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2, e=ms*.04; const ids=new Set(r.c.flatMap(c=>c.m));
    sgu.forEach((s,i)=>{if(!ids.has(i)&&[s.a,s.b].every(q=>q[0]>=b[0]-e&&q[0]<=b[2]+e&&q[1]>=b[1]-e&&q[1]<=b[3]+e)) ids.add(i)});
    const segs=[...ids].map(i=>sgu[i]);
    // status colour = the outline's: the strokes that reach the symbol's outer edges, not its fill or inner dot
    const ps=segs.flatMap(s=>[[s.a,s],[s.b,s]]), ex=[q=>q[0],q=>-q[0],q=>q[1],q=>-q[1]].map(f=>ps.reduce((mm,x)=>f(x[0])<f(mm[0])?x:mm)[1].col);
    const sat=ex.filter(c=>{const k=FVE.colClass(c); return k!=='black'&&k!=='grey'}), cnt=c=>sat.filter(x=>x===c).length;
    const lum=c=>parseInt(c.slice(0,2),16)+parseInt(c.slice(2,4),16)+parseInt(c.slice(4,6),16);
    const col=sat.length?sat.slice().sort((a,b)=>cnt(b)-cnt(a))[0]:ex.slice().sort((a,b)=>lum(a)-lum(b))[0];
    // the status letter drawn just above-left of the symbol
    const lc=comps.filter(c=>!r.c.includes(c)&&c.sz<ms*1.1&&c.sz>ms*.25&&(c.b[0]+c.b[2])/2<b[0]+ms*.3&&(c.b[0]+c.b[2])/2>b[0]-ms*1.6&&(c.b[1]+c.b[3])/2<cy&&(c.b[1]+c.b[3])/2>b[1]-ms*1.2)
      .sort((p,q)=>hyp(p.b[2]-b[0],p.b[3]-b[1])-hyp(q.b[2]-b[0],q.b[3]-b[1]))[0];
    const letter=lc?FVE.strokeLetter(lc.m.map(k=>sgu[k])):null;
    const ro=[...new Set(segs.map(s=>s.o))].map(id=>byId.get(id)).filter(Boolean);
    return {b,cx,cy,col,cls:FVE.colClass(col),letter,status:FVE.LETTER_STATUS[letter]||null,objs:ro,segs,ms}});
  // status by colour from the legend's own letters: each colour takes its rows' majority letter (an odd one is a model tag such as 'D(E)')
  const vote={}; out.forEach(r=>{if(r.letter) (vote[r.cls]=vote[r.cls]||{})[r.letter]=(vote[r.cls][r.letter]||0)+1});
  for(const c in vote){const [L,n]=Object.entries(vote[c]).sort((a,b)=>b[1]-a[1])[0], tot=Object.values(vote[c]).reduce((a,b)=>a+b,0); if(n/tot<.6) continue;
    out.forEach(r=>{if(r.cls===c){r.status=FVE.LETTER_STATUS[L]; r.colourVote=L}})}
  out.box=box; return out};
// geometric legend rows as dictionary symbols (the same shape analyzeLegend gives), typed from a consultant library by geoHash when it knows them
FVE.geoLegendSymbols=function(m,rows,library){const FP=root.FVE_MSME&&root.FVE_MSME.fingerprint; return rows.filter(r=>r.objs.length).map((r,i)=>{
    const ob=r.objs.reduce((u,o)=>bbUnion(u,o.bb),r.objs[0].bb.slice()), c=[(ob[0]+ob[2])/2,(ob[1]+ob[3])/2];
    const segs=FVE.segments(r.objs).map(s=>({a:[s.a[0]-c[0],s.a[1]-c[1]],b:[s.b[0]-c[0],s.b[1]-c[1]],L:s.L,c:s.col,col:s.col,f:s.f}));
    const cols={}; r.objs.forEach(o=>{const k=o.stroke||o.fill; if(k) cols[k]=(cols[k]||0)+o.len}); const color=r.col||Object.keys(cols).sort((a,b)=>cols[b]-cols[a])[0]||null;
    const lite=r.objs.map(o=>({k:o.k,bb:o.bb,c:o.c,r:o.r,pts:o.pts,stroke:o.stroke,fill:o.fill,closed:o.closed,synthetic:o.synthetic,len:o.len,w:o.w}));
    const key=r.objs.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')).map(o=>({k:o.k,col:o.stroke,size:shapeSize(o)})).sort((a,b)=>b.size-a.size)[0]||null;
    let geoHash=null, desc2=null; if(FP){desc2=FP.describe(lite); geoHash=FP.geoHash(desc2)}
    const hit=library&&geoHash?library.find(x=>x.geoHash===geoHash):null;
    return {id:'geo'+i,page:m.page.id,desc:`legend row ${i+1}`,geo:true,row:i+1,type:hit?hit.device:null,typeSrc:hit?'library':null,status:r.status,letter:r.letter,tags:[],bb:ob,c,segs,objs:lite,color,key,
      cols:[...new Set(r.objs.map(o=>o.stroke||o.fill).filter(Boolean))],circles:r.objs.filter(o=>o.k==='circle'&&o.stroke).map(o=>({col:o.stroke,r:o.r})),shapes:[...new Set(r.objs.map(o=>o.k))],geoHash,desc2,rowBox:r.b}})};
// title-block wording every sheet shares (the project name 'Level 9 - 10 Fitouts', the client, the address) says nothing about what one sheet
// is: with the whole set in hand, wording on ≥ 60 % of the sheets is ignored and each sheet is classified again
FVE.reclassify=function(models){if(models.length<2) return models; const n={};
  for(const m of models){const seen=new Set(m.texts.filter(t=>t.cx>m.page.w*.55&&t.cy>m.page.h*.55).map(t=>normT(t.s)).filter(s=>s.length>3)); seen.forEach(s=>n[s]=(n[s]||0)+1)}
  const lim=Math.max(2,Math.ceil(models.length*.6)), ignore=new Set(Object.keys(n).filter(s=>n[s]>=lim));
  for(const m of models){if(m.sheet&&m.sheet.manual) continue; const k=FVE.classifySheet(m,ignore); if(m.sheet&&k.kind!==m.sheet.kind) k.was=m.sheet.kind; m.sheet=k} return models};
// one dictionary for the project: every legend page merged; the same description on two sheets is one entry
// opts.library [{consultant, geoHash, device}] types geometric legend rows; opts.legendBoxes {pageId: box} where the estimator boxed a legend
FVE.projectDictionary=function(models,opts){opts=opts||{}; const D={symbols:[],lineTypes:[],abbrev:{},zones:{},sources:[],geo:[]}; FVE.reclassify(models);
  for(const m of models){const lg=FVE.analyzeLegend(m);
    // no text legend: a legend sheet (or a boxed area) is cut by geometry
    const ubox=opts.legendBoxes&&opts.legendBoxes[m.page.id];
    if(ubox||(!lg.symbols.length&&/legend|notes|cover/.test(m.sheet.kind))){const rows=FVE.legendColumn(m,ubox||null);
      if(rows.length>=3){const sy=FVE.geoLegendSymbols(m,rows,opts.library); lg.symbols.push(...sy); D.geo.push({page:m.page.id,box:rows.box,rows:sy.length,typed:sy.filter(e=>e.type).length});
        lg.zones.push(rows.box); lg.sections.push({title:'(geometric legend)',rows:[],bb:rows.box})}}
    if(!lg.symbols.length&&!lg.lineTypes.length&&!Object.keys(lg.abbrev).length) continue;
    D.zones[m.page.id]=lg.zones; D.sources.push({page:m.page.id,sections:lg.sections.map(s=>s.title)});
    for(const s of lg.symbols) if(s.geo||!D.symbols.some(o=>o.desc===s.desc&&o.color===s.color)) D.symbols.push(s);
    for(const l of lg.lineTypes) if(!D.lineTypes.some(o=>o.desc===l.desc)) D.lineTypes.push(l);
    Object.assign(D.abbrev,lg.abbrev)}
  // two line types drawn the same way (colour, dash) cannot be told apart on a plan: the first keeps the strokes
  const seenLT=new Set(); D.lineTypes.forEach(l=>{if(!l.cls) return; const k=l.stroke+'|'+l.dashed; if(seenLT.has(k)) l.dupOf=true; else seenLT.add(k)});
  // historical symbols (Learning Engine knowledge base): this consultant's symbols, and well-established ones, are searched like legend
  // rows for devices this project's legend does not already cover (a set without a legend, a CAD-lettered row nobody named, a missing row)
  const K=opts.knowledge; D.hist=0;
  if(K&&K.templates){const legendTypes=new Set(D.symbols.filter(s=>s.type).map(s=>s.type)), have=new Set(D.symbols.map(s=>s.geoHash).filter(Boolean));
    // another consultant's symbols only on a set with no legend of its own: where the project has a legend, only this consultant's history
    for(const t of K.templates){const T=t.template; if(!T||!T.objs||!T.objs.length||legendTypes.has(t.deviceType)||have.has(t.geoHash)||(legendTypes.size&&!t.consultantMatch)) continue; have.add(t.geoHash);
      D.symbols.push({id:'h',page:null,desc:`historical ${t.code||t.deviceType}`,hist:true,histN:t.n,consultantMatch:!!t.consultantMatch,type:t.deviceType,status:null,tags:t.text||[],bb:T.bb,c:[0,0],segs:T.segs,vsegs:T.vsegs,objs:T.objs,
        color:(T.cols||[])[0]||null,key:T.key,cols:T.cols||[],circles:T.objs.filter(o=>o.k==='circle'&&o.stroke).map(o=>({col:o.stroke,r:o.r})),shapes:T.shapes||[],geoHash:t.geoHash,desc2:t.desc}); D.hist++}}
  D.symbols.forEach((s,i)=>s.id='sy'+i); D.lineTypes.forEach((l,i)=>l.id='lt'+i);
  // colour → status where the legend is colour-coded (refurbishment sets: blue new, grey existing, red remove …): ≥ 2 rows, ≥ 80 % agreeing
  const cv={}; D.symbols.forEach(e=>{if(e.color&&e.status) (cv[e.color]=cv[e.color]||{})[e.status]=(cv[e.color][e.status]||0)+1}); D.colStatus={};
  for(const c in cv){const [st,n]=Object.entries(cv[c]).sort((a,b)=>b[1]-a[1])[0], tot=Object.values(cv[c]).reduce((a,b)=>a+b,0); if(tot>=2&&n/tot>=.8) D.colStatus[c]=st}
  if(new Set(Object.values(D.colStatus)).size<2) D.colStatus={};
  // no colour code of its own: the consultant's usual one (learnt from their earlier jobs)
  if(!Object.keys(D.colStatus).length&&K&&K.statusColours&&new Set(Object.values(K.statusColours)).size>=2) D.colStatus={...K.statusColours};
  // tags: an abbreviation the project defines → the device it names
  D.tagType={}; for(const [k,v] of Object.entries(D.abbrev)){const t=FVE.classifyDesc(v).type; if(t) D.tagType[k]=t}
  return D};

/* ------------------------------------------------------------------ layer 4: rule engine
   A rule reads: tag (text on the plan) + shape (the object it sits in) → device, with a base confidence.
   Context rules then adjust every candidate. Rules are data: add a line, gain a behaviour. */
FVE.TAG_RULES=[
  {tag:/^(SD|SMK|PSD|PE|PHD|OSD|MSD)$/, type:'smoke', shapes:['circle','rect','polygon'], conf:.82},
  {tag:/^(HD|TD|HT|RHD|FHD)$/, type:'heat', shapes:['circle','rect','polygon'], conf:.82},
  {tag:/^(MCP|BG|BGA)$/, type:'mcp', shapes:['rect','polygon','circle'], conf:.85},
  {tag:/^(FIP|FDCIE|FACP)$/, type:'fip', shapes:['rect','polygon'], conf:.9},
  {tag:/^(WIP)$/, type:'wip', shapes:['rect','circle','polygon'], conf:.85},
  {tag:/^(SPK|SPKR|LS|CS)$/, type:'speaker', shapes:['circle','polygon','rect'], conf:.75},
  {tag:/^(VAD|STROBE|VWD)$/, type:'sounder', shapes:['circle','rect','polygon'], conf:.8},
  {tag:/^(I\/O|IO|FR|IM|OM|RM)$/, type:'relay', shapes:['rect','circle','polygon'], conf:.7},
  {tag:/^(DH|MDH|EMH|DR)$/, type:'door_mag', shapes:['rect','circle','polygon'], conf:.7},
  {tag:/^(FS)$/, type:'flowsw', shapes:['rect','circle','polygon'], conf:.7},
  {tag:/^(FHR|HR)$/, type:'hosereel', shapes:['rect','circle','polygon'], conf:.8},
  {tag:/^(FH|FHV|HYD)$/, type:'hydrant', shapes:['rect','circle','polygon'], conf:.75},
  {tag:/^(EXT|ABE|DCP)$/, type:'ext_abe', shapes:['polygon','circle','rect'], conf:.7},
  {tag:/^(CO2)$/, type:'ext_co2', shapes:['polygon','circle','rect'], conf:.7},
  {tag:/^(FB)$/, type:'blanket', shapes:['polygon','rect','circle'], conf:.7}];
// device tags carry numbering: 'SD-01', 'SD1', 'L2-SD-04', 'MCP.3' → 'SD', 'MCP'
FVE.tagToken=function(s){const u=String(s).toUpperCase().replace(/\s+/g,''); if(u.length>12) return null; const parts=u.split(/[-.:]/).filter(p=>/[A-Z]/.test(p)); const p=parts.length>1&&/^L?\d+$|^(L|B|G)\d*$/.test(parts[0])?parts[1]:parts[0]; if(!p) return null; const m=p.match(/^(CO2|[A-Z\/]{2,6})\d*[A-Z]?$/); return m?m[1]:null};
FVE.CONTEXT_RULES=[
  {id:'not-plan', note:'only plan sheets carry devices', test:(c,ctx)=>ctx.sheet.kind!=='plan', drop:true},
  {id:'legend-zone', note:'inside a legend / symbol key', test:(c,ctx)=>ctx.zones.some(z=>c.x>=z[0]&&c.x<=z[2]&&c.y>=z[1]&&c.y<=z[3]), drop:true},
  {id:'title-block', note:'inside the title block', test:(c,ctx)=>ctx.tb.some(z=>c.x>=z[0]&&c.y>=z[1]), drop:true},
  {id:'tag-and-symbol', note:'legend symbol and its tag agree', test:c=>c.ev.some(e=>e.src==='legend')&&c.ev.some(e=>e.src==='tag'), add:.08},
  {id:'tag-no-shape', note:'tag with no symbol around it (likely a note)', test:c=>c.ev.length===1&&c.ev[0].src==='tag'&&!c.ev[0].shape, add:-.25}];
// symbols on a plan are often drawn at another size than in the legend (annotative blocks scale with the viewport): each legend circle
// votes for plan circle radius ÷ legend radius, using the most common same-colour radius on the sheet; returns ratios to try, best first
FVE.pageRatios=function(D,m){const byCol={}; for(const o of m.objects) if(o.k==='circle'&&o.stroke){const k=o.stroke, r=Math.round(o.r*20)/20; (byCol[k]=byCol[k]||{})[r]=(byCol[k][r]||0)+1}
  const votes={}; for(const e of D.symbols) for(const c of e.circles||[]){const H=byCol[c.col]; if(!H) continue;
    for(const [r1,n] of Object.entries(H)){const q=+r1/c.r; if(n<3||q<.25||q>4) continue; const k=(Math.round(q*50)/50).toFixed(2); votes[k]=(votes[k]||0)+n}}
  const top=Object.entries(votes).sort((a,b)=>b[1]-a[1]); const out=[]; for(const [k,n] of top){const q=+k; if(out.length<2&&!out.some(o=>Math.abs(o.q-q)<.08)&&n>=6) out.push({q,n})}
  if(!out.some(o=>Math.abs(o.q-1)<.08)) out.push({q:1,n:0}); return out};
// the same, per legend symbol, from its largest closed shape (a circle's radius, a square's side) against same-kind same-colour shapes
FVE.templateRatios=function(e,m){if(!e.key) return [];
  // the key must be the symbol's outline: a dash or an inner dot (a dashed square with a dot) cannot say what scale the plan uses
  if(e.bb){const S=Math.max(e.bb[2]-e.bb[0],e.bb[3]-e.bb[1]), ks=e.key.k==='circle'?2*e.key.size:e.key.size; if(S>0&&ks<S*.5) return []} if(!m.shapeHist){const H={}, inner={};
    // a shape centred inside a larger same-kind, same-colour shape is an inner detail (the dot in a sprinkler), not a symbol of its own
    const cl=m.objects.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon'));
    for(const o of cl){const k=o.k+'|'+o.stroke, z=Math.round(shapeSize(o)*20)/20, c=[(o.bb[0]+o.bb[2])/2,(o.bb[1]+o.bb[3])/2], S=shapeSize(o);
      (H[k]=H[k]||{})[z]=(H[k][z]||0)+1;
      const host=m.index.search(c[0]-.5,c[1]-.5,c[0]+.5,c[1]+.5).some(x=>x!==o&&x.k===o.k&&x.stroke===o.stroke&&x.closed&&shapeSize(x)>S*1.5&&hyp((x.bb[0]+x.bb[2])/2-c[0],(x.bb[1]+x.bb[3])/2-c[1])<Math.max(.5,S*.2));
      if(host){(inner[k]=inner[k]||{})[z]=(inner[k][z]||0)+1}}
    m.shapeHist=H; m.shapeInner=inner}
  const kk=e.key.k+'|'+e.key.col, H=m.shapeHist[kk]; if(!H) return []; const I=(m.shapeInner&&m.shapeInner[kk])||{}; const c=Object.entries(H).map(([z,n])=>({q:+z/e.key.size,n:n-(I[z]||0)})).filter(x=>x.n>=2&&x.q>=.25&&x.q<=4).sort((a,b)=>b.n-a.n);
  const out=[]; for(const x of c){if(out.length<2&&!out.some(o=>Math.abs(o.q-x.q)<.08*o.q)&&(!out.length||x.n>=out[0].n*.25)) out.push(x)} return out};
// hooks.match(entry, model, ratio) → [{x,y,w,h,score}] for a legend symbol on a sheet (the app's vector matcher)
FVE.detect=async function(models,D,hooks){hooks=hooks||{};
  // the multi-layer symbol matching engine (src/fve/symbol-engine) supersedes the single-pass rules below when present
  if(root.FVE_MSME&&root.FVE_MSME.run&&!hooks.legacy) return root.FVE_MSME.run(models,D,hooks,{FVE});
  const out=[];
  for(const m of models){const ctx={sheet:m.sheet,zones:D.zones[m.page.id]||[],tb:FVE.titleBlock(m)}; if(m.sheet.kind!=='plan') continue; let C=[];
    // 1) the project's own legend symbols
    const ratios=FVE.pageRatios(D,m); m.ratios=ratios; const pcols=new Set(m.objects.map(o=>o.stroke||o.fill));
    if(hooks.match) for(const e of D.symbols){if(!e.type||!e.segs||e.segs.length<3) continue; /* notation / valve symbols with no device type are not searched */ if(e.cols&&e.cols.length&&!e.cols.some(c=>pcols.has(c))) continue; // its colours are not on this sheet
      const tr=FVE.templateRatios(e,m), qs=(tr.length?tr:ratios.slice(0,1)).map(x=>x.q); if(!qs.some(q=>Math.abs(q-1)<.08)&&!tr.length) qs.push(1);
      const best=[]; for(const q of qs){const hits=await hooks.match(e,m,q)||[]; for(const h of hits){const o=best.find(b=>hyp(b.x-h.x,b.y-h.y)<Math.min(b.w,b.h)*.5); if(!o) best.push({...h,q}); else if(h.score>o.score) Object.assign(o,h,{q})}}
      for(const h of best) C.push({x:h.x,y:h.y,w:h.w,h:h.h,ev:[{src:'legend',entry:e.id,type:e.type,status:e.status,conf:Math.min(.98,h.score),score:h.score,ratio:h.q}]})}
    // 2) tags on the plan, read against the project's abbreviations first, then the built-in rules
    for(const t of m.texts){const tok=FVE.tagToken(t.s); if(!tok) continue; let type=D.tagType&&D.tagType[tok], rule=null, conf=.85;
      if(!type){rule=FVE.TAG_RULES.find(r=>r.tag.test(tok)); if(!rule) continue; type=rule.type; conf=rule.conf} else rule=FVE.TAG_RULES.find(r=>r.type===type);
      const shapes=m.index.around(t.cx,t.cy,t.h*1.6).filter(o=>o.closed&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')&&(o.bb[2]-o.bb[0])<t.h*8&&(o.bb[3]-o.bb[1])<t.h*8&&(o.bb[2]-o.bb[0])>t.h*.6);
      const inside=shapes.filter(o=>t.cx>=o.bb[0]&&t.cx<=o.bb[2]&&t.cy>=o.bb[1]&&t.cy<=o.bb[3]).sort((a,b)=>(a.bb[2]-a.bb[0])-(b.bb[2]-b.bb[0]));
      const sh=inside[0]||shapes.sort((a,b)=>hyp((a.bb[0]+a.bb[2])/2-t.cx,(a.bb[1]+a.bb[3])/2-t.cy)-hyp((b.bb[0]+b.bb[2])/2-t.cx,(b.bb[1]+b.bb[3])/2-t.cy))[0];
      if(sh&&rule&&rule.shapes) conf+=rule.shapes.includes(sh.k)?.1:-.05; const b=sh?sh.bb:t.bb;
      C.push({x:(b[0]+b[2])/2,y:(b[1]+b[3])/2,w:b[2]-b[0],h:b[3]-b[1],ev:[{src:'tag',tag:t.s,token:tok,type,conf:Math.min(.97,conf),shape:sh?sh.k:null,project:!!(D.tagType&&D.tagType[tok])}]})}
    // 3) one spot, one device: merge evidence that lands on the same place
    C.sort((a,b)=>Math.max(...b.ev.map(e=>e.conf))-Math.max(...a.ev.map(e=>e.conf))); const M=[];
    for(const c of C){const o=M.find(q=>hyp(q.x-c.x,q.y-c.y)<Math.max(Math.min(q.w,q.h),Math.min(c.w,c.h),2)*.6); if(o) o.ev.push(...c.ev); else M.push(c)}
    for(const c of M){let drop=null; for(const r of FVE.CONTEXT_RULES) if(r.drop&&r.test(c,ctx)){drop=r.id; break} if(drop) continue;
      // per device type, independent pieces of evidence combine (noisy-OR); the strongest type wins
      const by={}; for(const e of c.ev){if(!e.type) continue; by[e.type]=1-(1-(by[e.type]||0))*(1-e.conf)} const types=Object.keys(by).sort((a,b)=>by[b]-by[a]); if(!types.length) continue;
      let conf=by[types[0]]; const fired=[]; for(const r of FVE.CONTEXT_RULES) if(!r.drop&&r.test(c,ctx)){conf+=r.add; fired.push(r.id)}
      const st=c.ev.find(e=>e.type===types[0]&&e.status); const leg=c.ev.find(e=>e.src==='legend'&&e.type===types[0]);
      out.push({page:m.page.id,x:c.x,y:c.y,w:c.w,h:c.h,type:types[0],status:st?st.status:null,entry:leg?leg.entry:null,score:leg?leg.score:null,conf:Math.max(0,Math.min(1,conf)),alt:types.slice(1).map(k=>({type:k,conf:by[k]})),ev:c.ev,rules:fired})}}
  return out};

/* ------------------------------------------------------------------ cable / pipe lengths from the legend's line types */
// segments → polylines: endpoints closer than tol are joined
FVE.chain=function(segs,tol){const key=p=>Math.round(p[0]/tol)+','+Math.round(p[1]/tol); const ends=new Map(); const used=new Uint8Array(segs.length); const out=[];
  segs.forEach((s,i)=>{for(const p of [s.a,s.b]){const k=key(p); if(!ends.has(k)) ends.set(k,[]); ends.get(k).push(i)}});
  const nextOf=(p,skip)=>{const k=key(p); const [x,y]=k.split(',').map(Number); for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){const L=ends.get((x+dx)+','+(y+dy)); if(L) for(const j of L) if(!used[j]&&j!==skip&&(hyp(segs[j].a[0]-p[0],segs[j].a[1]-p[1])<tol||hyp(segs[j].b[0]-p[0],segs[j].b[1]-p[1])<tol)) return j} return -1};
  for(let i=0;i<segs.length;i++){if(used[i]) continue; used[i]=1; const pts=[segs[i].a,segs[i].b];
    for(const dir of [1,0]){let p=dir?pts[pts.length-1]:pts[0]; for(;;){const j=nextOf(p,-1); if(j<0) break; used[j]=1; const s=segs[j]; const q=hyp(s.a[0]-p[0],s.a[1]-p[1])<tol?s.b:s.a; if(dir) pts.push(q); else pts.unshift(q); p=q}}
    out.push(pts)} return out};
// for every pipe / cable line type of the legend: the matching strokes on each plan (same colour and weight, dashed or not), in metres
FVE.measureLines=function(models,D){const res=[];
  for(const lt of D.lineTypes){if(!lt.cls||!lt.stroke||lt.dupOf) continue; const r={id:lt.id,desc:lt.desc,cls:lt.cls,status:lt.status,stroke:lt.stroke,dashed:lt.dashed,pages:{},total:0,unscaled:0};
    for(const m of models){if(m.sheet.kind!=='plan') continue; const zones=(D.zones[m.page.id]||[]).concat(FVE.titleBlock(m)); const inZ=p=>zones.some(z=>p[0]>=z[0]&&p[0]<=z[2]&&p[1]>=z[1]&&p[1]<=z[3]);
      // same colour and line weight; a dashed type only takes short pieces, a solid one only unbroken runs
      // a loop cable returns to where it started: a long stroked-only polygon is still a run
      const objs=m.objects.filter(o=>o.stroke===lt.stroke&&!o.synthetic&&(o.k==='line'||o.k==='polyline'||o.k==='arc'||((o.k==='polygon'||o.k==='rect')&&!o.fill&&o.len>40))&&Math.abs(o.w-lt.w)<=Math.max(.12,lt.w*.3)&&!inZ(o.pts[0]));
      const segs=FVE.segments(objs.filter(o=>lt.dashed?(o.dash||o.len<20):(!o.dash&&o.len>=2)));
      if(!segs.length) continue; let L=segs.reduce((a,s)=>a+s.L,0); if(lt.dashed&&lt.duty>0&&lt.duty<1) L/=lt.duty;
      const chains=FVE.chain(segs,Math.max(.6,lt.w*2)); const mpu=m.scale?m.scale.mPerUnit:null;
      r.pages[m.page.id]={paper:L,m:mpu?L*mpu:null,chains,ratio:m.scale?m.scale.ratio:null}; if(mpu) r.total+=L*mpu; else r.unscaled+=L}
    if(Object.keys(r.pages).length) res.push(r)}
  return res};

/* ------------------------------------------------------------------ layer 5: verification (no AI needed) */
FVE.verify=function(models,D,dets){const W=[]; const plans=models.filter(m=>m.sheet.kind==='plan'); const per={};
  for(const d of dets){(per[d.type]=per[d.type]||{})[d.page]=(per[d.type][d.page]||0)+1}
  for(const [type,pp] of Object.entries(per)){const counts=plans.map(m=>pp[m.page.id]||0); const nz=counts.filter(v=>v>0); if(nz.length<3) continue; const md=median(nz);
    plans.forEach((m,i)=>{const v=counts[i]; if(v>0&&v<md*.3) W.push({level:'warn',code:'low-count',type,page:m.page.id,msg:`${type}: ${v} on this sheet, ${md} typical on the others — possible missed detections`});
      if(v>md*3&&v>10) W.push({level:'warn',code:'high-count',type,page:m.page.id,msg:`${type}: ${v} on this sheet, ${md} typical — possible double counting`})})}
  const found=new Set(dets.map(d=>d.entry).filter(Boolean)); for(const e of D.symbols) if(e.type&&!e.hist&&!found.has(e.id)) W.push({level:'info',code:'legend-unused',entry:e.id,msg:`legend "${e.desc}" not found on any plan`});
  for(const e of D.symbols) if(!e.type) W.push({level:'ask',code:'legend-unknown',entry:e.id,msg:`legend "${e.desc}" — device type not recognised`});
  // tags that repeat on the plans but nothing explains
  const tagN={}; for(const m of plans) for(const t of m.texts){const tok=FVE.tagToken(t.s); if(tok&&tok.length>=2&&!(D.tagType&&D.tagType[tok])&&!FVE.TAG_RULES.some(r=>r.tag.test(tok))) tagN[tok]=(tagN[tok]||0)+1}
  for(const [k,n] of Object.entries(tagN)) if(n>=4&&!/^(DN|RL|FFL|SSL|CL|NTS|REV|MM|M)$/.test(k)) W.push({level:'ask',code:'tag-unknown',tag:k,n,msg:`tag "${k}" appears ${n}× on the plans${D.abbrev[k]?` (${D.abbrev[k]})`:''} — not linked to a device`});
  // an estimator's count markups on the sheet: every markup should sit on a detection
  for(const m of plans){for(const [k,g] of Object.entries(m.markups||{})){if(g.n<3||!/Polygon|Circle|Ink|PolyLine|Stamp/.test(k)) continue; /* squares are text boxes / clouds, not counts */ const ds=dets.filter(d=>d.page===m.page.id); const ty={}; let hit=0;
      for(const [x,y] of g.at){const d=ds.find(d=>Math.hypot(d.x-x,d.y-y)<Math.max(12,Math.max(d.w,d.h)*1.5)); if(d){hit++; ty[d.type]=(ty[d.type]||0)+1}}
      const main=Object.entries(ty).sort((a,b)=>b[1]-a[1])[0]; const rate=hit/g.at.length;
      W.push({level:rate>=.9?'ok':'warn',code:'markup',page:m.page.id,markup:k,n:g.n,hit,type:main&&main[0],msg:`markups ${k} ×${g.n}: ${hit} sit on a detection${main?` (mostly ${main[0]})`:''}${rate<.9?` — ${g.at.length-hit} without one, check for misses`:''}`})}}
  const low=dets.filter(d=>d.conf<.6).length; if(low) W.push({level:'info',code:'low-conf',n:low,msg:`${low} detections below 60 % confidence — review them first`});
  return W};
// AI only names what the rules could not: unknown legend descriptions and tags → suggested device keys (never counts by itself)
FVE.suggest=async function(unknowns,keys,ai){if(!ai||!unknowns.length) return {};
  const prompt=`These are entries from an Australian fire services drawing legend / abbreviation list that a rule engine could not map.\nFor each, give the closest device key, or null.\nReturn ONLY JSON {"items":[{"i":0,"key":"…|null","why":"few words"}]}\nKeys:\n${keys.join('\n')}\nEntries:\n${unknowns.map((u,i)=>`${i}: ${u}`).join('\n')}`;
  const t=await ai(prompt); let j=null; try{j=JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1))}catch(e){} const out={}; if(j&&Array.isArray(j.items)) for(const it of j.items) if(it.key) out[it.i]={key:it.key,why:it.why||''}; return out};

root.FVE=FVE; if(typeof module!=='undefined'&&module.exports) module.exports=FVE;
})(typeof window!=='undefined'?window:globalThis);
