/* Strix FireTake · read the drawing scale from a box the estimator drags around it

   readScale(items, box, page) → {ratio, mPerUnit, how, text, note} or {error}
     items  the page's text items [{s, x, y, w, h}] in page units (the app's pdfTextItems)
     box    [x0, y0, x1, y1] in page units
     page   {w, h} in PDF points
   1. a scale note: 'SCALE 1:100', '1 : 200 @ A1', '1:50@A3'. With a sheet size that is not this PDF's (1:100 @ A1 printed on A3),
      the ratio is corrected for the size: 1:100 @ A1 on an A3 sheet measures as 1:200.
   2. a scale bar: numbers along a line (0  5  10  20 m); metres per point from the spacing of the numbers (mm when the bar says mm). */
(function(root){
'use strict';
const PAPER={A0:1189,A1:841,A2:594,A3:420,A4:297};
const PT=0.0254/72;   // metres per PDF point
const longMM=page=>Math.max(page.w,page.h)/72*25.4;
function paperOf(page){const L=longMM(page); return Object.keys(PAPER).find(k=>Math.abs(PAPER[k]-L)/PAPER[k]<.03)||null}

function readScale(items,box,page){const [x0,y0,x1,y1]=[Math.min(box[0],box[2]),Math.min(box[1],box[3]),Math.max(box[0],box[2]),Math.max(box[1],box[3])];
  const inB=(items||[]).filter(t=>{const cx=t.x+(t.w||0)/2; return cx>=x0&&cx<=x1&&t.y>=y0-(t.h||6)*.3&&t.y<=y1+(t.h||6)*.3});
  if(!inB.length) return {error:'no-text'};
  const rows=inB.slice().sort((a,b)=>Math.abs(a.y-b.y)>(a.h||6)*.5?a.y-b.y:a.x-b.x), text=rows.map(t=>t.s).join(' ').replace(/\s+/g,' ').trim();
  // 1) scale notes
  const here=paperOf(page), cands=[];
  for(const m of text.matchAll(/(?:^|[^\d.])1\s*[:：]\s*(\d{1,5}(?:\.\d+)?)(?:\s*(?:@|AT)\s*(A[0-4]))?/gi)){const r=+m[1]; if(r>=1&&r<=20000) cands.push({r,paper:m[2]?m[2].toUpperCase():null})}
  if(cands.length){const c=cands.find(c=>c.paper&&c.paper===here)||cands.find(c=>!c.paper)||cands[0];
    let eff=c.r, note=null;
    if(c.paper&&PAPER[c.paper]){const k=PAPER[c.paper]/longMM(page); if(Math.abs(k-1)>.03){eff=c.r*k; note={written:`1:${c.r} @ ${c.paper}`,sheet:here||Math.round(longMM(page))+' mm'}}}
    eff=Math.round(eff*100)/100;
    return {ratio:eff,mPerUnit:eff*PT,how:'note',text,note,written:c.r,paper:c.paper}}
  // 2) a scale bar: the longest row of plain numbers, value against position
  const nums=inB.filter(t=>/^\d+(\.\d+)?$/.test(t.s)).map(t=>({v:+t.s,cx:t.x+(t.w||0)/2,y:t.y,h:t.h||6}));
  let best=null; for(const a of nums){const row=nums.filter(b=>Math.abs(b.y-a.y)<a.h*.6); const vals=new Set(row.map(b=>b.v)); if(vals.size>=2&&(!best||row.length>best.length)) best=row}
  if(best){const n=best.length, mx=best.reduce((s,b)=>s+b.cx,0)/n, mv=best.reduce((s,b)=>s+b.v,0)/n; let sxy=0, sxx=0, syy=0;
    for(const b of best){sxy+=(b.cx-mx)*(b.v-mv); sxx+=(b.cx-mx)**2; syy+=(b.v-mv)**2}
    const slope=sxy/(sxx||1), r2=sxx&&syy?(sxy*sxy)/(sxx*syy):0;
    if(slope>0&&r2>.98){const mm=/\bmm\b/i.test(text)&&!/\bm\b/.test(text.replace(/\bmm\b/gi,'')), mPerUnit=slope*(mm?.001:1), ratio=Math.round(mPerUnit/PT);
      return {ratio,mPerUnit,how:'bar',text,bar:best.map(b=>b.v).sort((a,b)=>a-b),unit:mm?'mm':'m'}}}
  return {error:'no-scale',text}}

const NS={readScale,paperOf,PAPER};
root.FT_SCALE=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
