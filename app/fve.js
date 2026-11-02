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
  for(const p of P) if(Math.abs(hyp(p[0]-cx,p[1]-cy)-r)>Math.max(.06*r,.08)) return null; return {c:[cx,cy],r}}
function classify(sp){const pts=sp.pts, n=pts.length; if(n<2) return null; const bb=bbOf(pts), len=plen(pts), first=pts[0], last=pts[n-1];
  const closed=sp.closed||(n>2&&hyp(first[0]-last[0],first[1]-last[1])<Math.max(.05,len*.002)); const o={pts,closed,bb,len};
  if(sp.rect){o.k='rect'; return o}
  if(n===2){o.k='line'; return o}
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
FVE.classifySheet=function(m){const tb=m.texts.filter(t=>t.cx>m.page.w*.55&&t.cy>m.page.h*.55), all=m.texts; const score={};
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
  for(const o of m.objects){if(o.k!=='line'&&o.k!=='polyline'&&o.k!=='rect') continue; const b=o.bb, bw=b[2]-b[0], bh=b[3]-b[1];
    if(bw<1.5&&bh>H*.55&&b[0]>W*.72&&b[0]<tbx) tbx=b[0]; if(bh<1.5&&bw>W*.55&&b[1]>H*.78&&b[1]<tby) tby=b[1]}
  const z=[]; if(tbx<W*.995) z.push([tbx,0,W,H]); if(tby<H*.995) z.push([0,tby,W,H]); return z};
FVE.analyzeLegend=function(m){const L=m.lines, bodyH=median(L.map(l=>l.h))||6, out={sections:[],symbols:[],lineTypes:[],abbrev:{},zones:[]};
  const heads=L.filter(l=>HEAD_RE.test(l.s.toUpperCase())&&l.s.length<70&&!/^\d/.test(l.s)&&!ABBR_RE.test(l.s));
  const tb=FVE.titleBlock(m), inTB=b=>tb.some(z=>b[0]>=z[0]&&b[1]>=z[1]);
  const usedLine=new Set();
  for(const h of heads){if(inTB(h.bb)) continue; const hw=h.x1-h.x;
    // entries: lines below the heading, in its column, before the next heading of that column
    const cand=L.filter(l=>l!==h&&!heads.includes(l)&&l.cy>h.cy&&l.x>=h.x-bodyH*3&&l.x<=h.x+Math.max(hw*1.3,bodyH*25)&&!inTB(l.bb));
    const below=heads.filter(o=>o!==h&&o.cy>h.cy&&Math.abs(o.x-h.x)<Math.max(hw,bodyH*20)); const stopY=below.length?Math.min(...below.map(o=>o.cy)):Infinity;
    let rows=cand.filter(l=>l.cy<stopY).sort((a,b)=>a.cy-b.cy); const keep=[]; let lastY=h.cy;
    for(const r of rows){if(r.cy-lastY>bodyH*9) break; keep.push(r); lastY=r.cy} rows=keep; if(!rows.length) continue;
    const sec={title:h.s,head:h,rows:[],bb:h.bb.slice()}; out.sections.push(sec);
    // the description column: where most rows start (rows further left are symbol tags / abbreviations)
    const xs=rows.map(r=>Math.round(r.x/(bodyH*2))); const mode=+Object.entries(xs.reduce((o,v)=>(o[v]=(o[v]||0)+1,o),{})).sort((a,b)=>b[1]-a[1])[0][0]*bodyH*2;
    rows.forEach((r,i)=>{if(usedLine.has(r)) return; usedLine.add(r); sec.bb=bbUnion(sec.bb,r.bb);
      // abbreviations: 'SD - SMOKE DETECTOR' (one line) or 'SD' … '- SMOKE DETECTOR' (two pieces on a baseline)
      const am=r.s.match(ABBR_RE); if(am){out.abbrev[am[1].toUpperCase()]=am[2].trim(); sec.kind='abbrev'; return}
      if(/^[-–]\s*[A-Z]/.test(r.s)){const t=L.find(o=>o!==r&&Math.abs(o.cy-r.cy)<r.h*.5&&o.x1<=r.x+r.h&&r.x-o.x1<r.h*12&&/^[A-Z][A-Z0-9\/&.]{0,7}$/.test(o.s)); if(t){out.abbrev[t.s.toUpperCase()]=r.s.replace(/^[-–]\s*/,'').trim(); usedLine.add(t); sec.kind='abbrev'; return}}
      if(r.x<mode-bodyH*3) return; // a tag or label sitting in the symbol column, handled with its row
      const prev=rows[i-1], next=rows[i+1]; const half=Math.min(Math.max(((next?next.cy:r.cy+r.h*3)-(prev?prev.cy:r.cy-r.h*3))/4,r.h*.8),r.h*3);
      const zone=[Math.max(h.x-bodyH*3,r.x-bodyH*40),r.cy-half,r.x-bodyH*.3,r.cy+half];
      // white fills are masks laid under a symbol (they hide the background), not part of it
      const objs=m.index.search(...zone).filter(o=>o.bb[0]>=zone[0]-1&&o.bb[2]<=zone[2]+1&&o.bb[1]>=zone[1]-1&&o.bb[3]<=zone[3]+1&&!(!o.stroke&&o.fill==='ffffff')&&o.stroke!=='ffffff');
      const tags=m.texts.filter(t=>t.cx>zone[0]&&t.cx<zone[2]&&t.cy>zone[1]&&t.cy<zone[3]&&!r.items.includes(t)&&t.s.length<=12).map(t=>t.s);
      sec.rows.push(r); sec.bb=bbUnion(sec.bb,zone);
      const desc=r.s.trim(); if(!objs.length&&!tags.length) return;
      const ob=objs.length?objs.reduce((u,o)=>bbUnion(u,o.bb),objs[0].bb.slice()):null;
      // a line type: a long, low sample (pipework / cabling legend)
      const lineObj=objs.filter(o=>(o.k==='line'||o.k==='polyline')&&(o.bb[2]-o.bb[0])>Math.max(bodyH*4,(zone[2]-zone[0])*.35)&&(o.bb[3]-o.bb[1])<bodyH*1.2).sort((a,b)=>b.len-a.len)[0];
      const pieces=objs.filter(o=>o.k==='line'&&(o.bb[3]-o.bb[1])<bodyH*.6), longest=pieces.reduce((m2,o)=>Math.max(m2,o.len),0);
      const span=ob?ob[2]-ob[0]:0, dashed=objs.some(o=>o.dash)||(pieces.length>=3&&longest<span*.45);
      const cls=FVE.lineClass(desc), ct=FVE.classifyDesc(desc);
      if((lineObj||(dashed&&span>bodyH*4))&&!(ct.type&&!cls)){const ref=lineObj||pieces[0]; const ink=pieces.reduce((a,o)=>a+o.len,0)+(lineObj?lineObj.len:0);
        out.lineTypes.push({id:'lt'+out.lineTypes.length,page:m.page.id,desc,cls,status:ct.status,stroke:ref.stroke||ref.fill,w:ref.w,dashed,duty:dashed&&span?Math.min(1,ink/span):1,bb:ob,tags});
        return}
      if(!objs.length) return; const c=[(ob[0]+ob[2])/2,(ob[1]+ob[3])/2];
      const segs=FVE.segments(objs).map(s=>({a:[s.a[0]-c[0],s.a[1]-c[1]],b:[s.b[0]-c[0],s.b[1]-c[1]],L:s.L,c:s.col,col:s.col,f:s.f}));
      const cols={}; objs.forEach(o=>{const k=o.stroke||o.fill; if(k) cols[k]=(cols[k]||0)+o.len}); const color=Object.keys(cols).sort((a,b)=>cols[b]-cols[a])[0]||null;
      const circles=objs.filter(o=>o.k==='circle'&&o.stroke).map(o=>({col:o.stroke,r:o.r}));
      const key=objs.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')).map(o=>({k:o.k,col:o.stroke,size:shapeSize(o)})).sort((a,b)=>b.size-a.size)[0]||null;
      out.symbols.push({id:'sy'+out.symbols.length,page:m.page.id,desc,type:ct.type,status:ct.status,tags,bb:ob,c,segs,color,key,cols:[...new Set(objs.map(o=>o.stroke||o.fill).filter(Boolean))],circles,shapes:[...new Set(objs.map(o=>o.k))]})})}
  if(heads.length) for(const r of L){if(inTB(r.bb)) continue; const am=r.s.match(ABBR_RE); if(am&&am[2].length<60){const k=am[1].toUpperCase(); if(!out.abbrev[k]) out.abbrev[k]=am[2].trim()}
    else if(/^[-–]\s*[A-Z]/.test(r.s)){const t=L.find(o=>o!==r&&Math.abs(o.cy-r.cy)<r.h*.5&&o.x1<=r.x+r.h&&r.x-o.x1<r.h*12&&/^[A-Z][A-Z0-9\/&.]{0,7}$/.test(o.s)); if(t&&!out.abbrev[t.s.toUpperCase()]) out.abbrev[t.s.toUpperCase()]=r.s.replace(/^[-–]\s*/,'').trim()}}
  out.zones=out.sections.filter(s=>s.rows.length||s.kind==='abbrev').map(s=>s.bb);
  return out};
// one dictionary for the project: every legend page merged; the same description on two sheets is one entry
FVE.projectDictionary=function(models){const D={symbols:[],lineTypes:[],abbrev:{},zones:{},sources:[]};
  for(const m of models){const lg=FVE.analyzeLegend(m); if(!lg.symbols.length&&!lg.lineTypes.length&&!Object.keys(lg.abbrev).length) continue;
    D.zones[m.page.id]=lg.zones; D.sources.push({page:m.page.id,sections:lg.sections.map(s=>s.title)});
    for(const s of lg.symbols) if(!D.symbols.some(o=>o.desc===s.desc&&o.color===s.color)) D.symbols.push(s);
    for(const l of lg.lineTypes) if(!D.lineTypes.some(o=>o.desc===l.desc)) D.lineTypes.push(l);
    Object.assign(D.abbrev,lg.abbrev)}
  // two line types drawn the same way (colour, dash) cannot be told apart on a plan: the first keeps the strokes
  const seenLT=new Set(); D.lineTypes.forEach(l=>{if(!l.cls) return; const k=l.stroke+'|'+l.dashed; if(seenLT.has(k)) l.dupOf=true; else seenLT.add(k)});
  D.symbols.forEach((s,i)=>s.id='sy'+i); D.lineTypes.forEach((l,i)=>l.id='lt'+i);
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
FVE.templateRatios=function(e,m){if(!e.key) return []; if(!m.shapeHist){const H={}; for(const o of m.objects) if(o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')){const k=o.k+'|'+o.stroke, z=Math.round(shapeSize(o)*20)/20; (H[k]=H[k]||{})[z]=(H[k][z]||0)+1} m.shapeHist=H}
  const H=m.shapeHist[e.key.k+'|'+e.key.col]; if(!H) return []; const c=Object.entries(H).map(([z,n])=>({q:+z/e.key.size,n})).filter(x=>x.n>=2&&x.q>=.25&&x.q<=4).sort((a,b)=>b.n-a.n);
  const out=[]; for(const x of c){if(out.length<2&&!out.some(o=>Math.abs(o.q-x.q)<.08*o.q)&&(!out.length||x.n>=out[0].n*.25)) out.push(x)} return out};
// hooks.match(entry, model, ratio) → [{x,y,w,h,score}] for a legend symbol on a sheet (the app's vector matcher)
FVE.detect=async function(models,D,hooks){hooks=hooks||{}; const out=[];
  for(const m of models){const ctx={sheet:m.sheet,zones:D.zones[m.page.id]||[],tb:FVE.titleBlock(m)}; if(m.sheet.kind!=='plan') continue; let C=[];
    // 1) the project's own legend symbols
    const ratios=FVE.pageRatios(D,m); m.ratios=ratios; const pcols=new Set(m.objects.map(o=>o.stroke||o.fill));
    if(hooks.match) for(const e of D.symbols){if(!e.type||!e.segs||e.segs.length<3) continue; // notation / valve symbols with no device type are not searched if(e.cols&&e.cols.length&&!e.cols.some(c=>pcols.has(c))) continue; // its colours are not on this sheet
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
  const found=new Set(dets.map(d=>d.entry).filter(Boolean)); for(const e of D.symbols) if(e.type&&!found.has(e.id)) W.push({level:'info',code:'legend-unused',entry:e.id,msg:`legend "${e.desc}" not found on any plan`});
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
