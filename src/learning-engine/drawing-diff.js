/* FireTake Learning Engine · drawing difference engine

   The original drawing is the question, the takeoff drawing the answer. What the estimator added is found three ways:
     annotations   PDF markups on the takeoff that the original does not have (Bluebeam / Acrobat count tools, clouds, callouts)
     vector        line work drawn into the takeoff (flattened markups): takeoff objects with no twin in the original
     text          words on the takeoff that the original does not have (device IDs, counts, notes)
   Output, in the ORIGINAL sheet's frame (sheets paired by order and size, else by title):
     additions    [{page, src:'annotation'|'vector', kind, colour, bb, c, size, contents, subject}]   count markups, rings, clouds
     labels       [{page, src, text, token, x, y}]          short texts that read as device tags / IDs (SD-01, MCP3, 'Speaker')
     annotations  [{page, src, kind, text, x, y, bb, len}]  estimator notes, measurements, highlights
   Inputs are FVE models (objects + texts) and normalised annotations [{subtype, colour, rect, contents, subject, title}]. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const hyp=Math.hypot;
const COUNT_KINDS=/^(Square|Circle|Polygon|Stamp|Ink|Caret)$/, TEXT_KINDS=/^(FreeText|Text|Callout)$/, LINE_KINDS=/^(Line|PolyLine)$/;

// pdf.js annotation → plain record in viewport coordinates (top-left origin, page units)
function normAnnot(a,vp,hexOf){const c=a.color&&a.color.length>=3?hexOf(a.color):null; const r=a.rect?vp.convertToViewportRectangle(a.rect):null;
  const bb=r?[Math.min(r[0],r[2]),Math.min(r[1],r[3]),Math.max(r[0],r[2]),Math.max(r[1],r[3])]:null;
  const str=o=>o==null?'':typeof o==='string'?o:(o.str||'');
  let len=0; if(a.lineCoordinates){const l=a.lineCoordinates; len=hyp(l[2]-l[0],l[3]-l[1])} else if(a.vertices&&a.vertices.length>1){for(let i=1;i<a.vertices.length;i++) len+=hyp(a.vertices[i].x-a.vertices[i-1].x,a.vertices[i].y-a.vertices[i-1].y)}
  return {subtype:a.subtype,colour:c,bb,c:bb?[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]:null,contents:(str(a.contentsObj)||str(a.contents)).trim(),subject:(str(a.subject)||str(a.subjectObj)).trim(),title:(str(a.titleObj)||str(a.title)).trim(),len}}

// sheets of the two sets, paired: same count and sizes → by order; otherwise by the title-block wording
function pairPages(O,T){const same=O.length===T.length&&O.every((m,i)=>Math.abs(m.page.w-T[i].page.w)<2&&Math.abs(m.page.h-T[i].page.h)<2);
  if(same) return O.map((m,i)=>[i,i]);
  const words=m=>new Set(m.texts.filter(t=>t.cx>m.page.w*.55&&t.cy>m.page.h*.55).map(t=>String(t.s).toUpperCase().trim()).filter(s=>s.length>2));
  const W=T.map(words), used=new Set(), out=[];
  O.forEach((m,i)=>{const a=words(m); let best=-1, bs=0; W.forEach((b,j)=>{if(used.has(j)) return; let s=0; a.forEach(w=>{if(b.has(w)) s++}); const sc=s/Math.max(1,Math.min(a.size,b.size)); if(sc>bs){bs=sc; best=j}}); if(best>=0&&bs>=.5){used.add(best); out.push([i,best])}});
  return out}

const okey=o=>o.k+'|'+(o.stroke||'')+'|'+(o.fill||'')+'|'+o.bb.map(v=>Math.round(v*2)).join(',');
const tkey=t=>String(t.s).trim()+'|'+Math.round(t.x)+','+Math.round(t.y);
const akey=a=>a.subtype+'|'+(a.colour||'')+'|'+(a.bb?a.bb.map(v=>Math.round(v)).join(','):'');

function diff(O,T,annT,annO,opts){opts=opts||{}; const FVE=opts.FVE||root.FVE; const out={pairs:pairPages(O,T),additions:[],labels:[],annotations:[],stats:{annotations:0,vector:0,text:0,revisionSheets:[]}};
  const isTag=s=>{const u=String(s).trim(); if(!u||u.length>16) return null; if(FVE&&FVE.tagToken){const t=FVE.tagToken(u); if(t) return t} return /^[A-Za-z][A-Za-z \/-]{1,14}$/.test(u)?u.toUpperCase():null};
  for(const [oi,ti] of out.pairs){const mo=O[oi], mt=T[ti];
    // 1) markups the takeoff carries and the original does not
    const seen=new Set((annO&&annO[oi]||[]).map(akey));
    for(const a of (annT&&annT[ti])||[]){if(!a.bb||seen.has(akey(a))||a.subtype==='Link'||a.subtype==='Widget'||a.subtype==='Popup') continue; out.stats.annotations++;
      const w=a.bb[2]-a.bb[0], h=a.bb[3]-a.bb[1];
      if(COUNT_KINDS.test(a.subtype)) out.additions.push({page:oi,src:'annotation',kind:a.subtype,colour:a.colour,bb:a.bb,c:a.c,size:Math.max(w,h),contents:a.contents,subject:a.subject});
      else if(TEXT_KINDS.test(a.subtype)){const tok=isTag(a.contents); if(tok&&a.contents.length<=16) out.labels.push({page:oi,src:'annotation',text:a.contents,token:tok,x:a.c[0],y:a.c[1],colour:a.colour}); else if(a.contents) out.annotations.push({page:oi,src:'annotation',kind:'note',text:a.contents,x:a.c[0],y:a.c[1],bb:a.bb})}
      else if(LINE_KINDS.test(a.subtype)) out.annotations.push({page:oi,src:'annotation',kind:'measure',text:a.contents,x:a.c[0],y:a.c[1],bb:a.bb,len:a.len,colour:a.colour});
      else out.annotations.push({page:oi,src:'annotation',kind:a.subtype.toLowerCase(),text:a.contents,x:a.c[0],y:a.c[1],bb:a.bb,colour:a.colour})}
    // 2) line work drawn into the takeoff: objects without a twin (same kind, colours and box to 0.5 pt)
    if(mo!==mt&&mo.objects!==mt.objects){const cnt=new Map(); for(const o of mo.objects){const k=okey(o); cnt.set(k,(cnt.get(k)||0)+1)}
      const added=[]; for(const o of mt.objects){const k=okey(o), n=cnt.get(k)||0; if(n>0) cnt.set(k,n-1); else if(!o.synthetic) added.push(o)}
      // most of the sheet new: another revision of the drawing, not markups — reported, not learnt from
      if(added.length>Math.max(200,mt.objects.length*.3)){out.stats.revisionSheets.push(oi); continue}
      const byCol={}; added.forEach(o=>{const c=o.stroke||o.fill||'000000'; (byCol[c]=byCol[c]||[]).push(o)});
      for(const [col,objs] of Object.entries(byCol)){
        // closed rings / boxes / clouds around something are count markups; open strokes are notes (leaders, highlights)
        for(const o of objs){const w=o.bb[2]-o.bb[0], h=o.bb[3]-o.bb[1], sz=Math.max(w,h); out.stats.vector++;
          if(o.closed&&sz>=3&&sz<=80) out.additions.push({page:oi,src:'vector',kind:o.k==='circle'?'ring':o.k,colour:col,bb:o.bb.slice(),c:[(o.bb[0]+o.bb[2])/2,(o.bb[1]+o.bb[3])/2],size:sz});
          else if(o.len>40) out.annotations.push({page:oi,src:'vector',kind:'stroke',colour:col,x:(o.bb[0]+o.bb[2])/2,y:(o.bb[1]+o.bb[3])/2,bb:o.bb.slice(),len:o.len})}}}
    // 3) words on the takeoff only
    if(mo!==mt&&mo.texts!==mt.texts){const cnt=new Map(); for(const t of mo.texts){const k=tkey(t); cnt.set(k,(cnt.get(k)||0)+1)}
      for(const t of mt.texts){const k=tkey(t), n=cnt.get(k)||0; if(n>0){cnt.set(k,n-1); continue} out.stats.text++; const tok=isTag(t.s);
        if(tok) out.labels.push({page:oi,src:'text',text:t.s,token:tok,x:t.cx,y:t.cy}); else out.annotations.push({page:oi,src:'text',kind:'note',text:t.s,x:t.cx,y:t.cy})}}}
  return out}

NS.diff={diff,normAnnot,pairPages};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.diff;
})(typeof window!=='undefined'?window:globalThis);
