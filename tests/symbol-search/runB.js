// usage: node run.js <web.html> <plan.pdf> <truth.json>
const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{
  const [html,pdf,truthF]=process.argv.slice(2); const T=JSON.parse(fs.readFileSync(truthF));
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1600,height:1000}});
  pg.on('pageerror',e=>console.log('PAGEERR',e.message)); pg.on('console',m=>{if(m.type()==='error'||m.type()==='warning') console.log('CONSOLE',m.text().slice(0,300))});
  await pg.goto('file://'+html); await pg.waitForTimeout(1500);
  const b64=fs.readFileSync(pdf).toString('base64');
  const out=await pg.evaluate(async({b64,T})=>{
    const bin=atob(b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    await openFiles([new File([u],'plan.pdf',{type:'application/pdf'})]);
    const res={};
    const evalRun=async(p,k)=>{ // k: page units per pt
      const A=T.truth.filter(t=>t.t==='B').map(t=>({...t,x:t.x*k,y:t.y*k}));
      SM.samples=[]; SM.results={}; SM.thrManual=false; SM.scope='page'; curPage=p.id;
      const t0=A.find(t=>t.t==='B'); const s=9*k; const t1=performance.now();
      await smAddSample(p,[t0.x-s,t0.y-s,t0.x+s,t0.y+s]);
      await smRun(); const ms=performance.now()-t1;
      const acc=(SM.results[p.id]||[]).filter(smAccepted); const hit=new Set(); let fp=0; const fps=[];
      for(const m of acc){const a=A.find(t=>!hit.has(t)&&Math.hypot(t.x-m.x,t.y-m.y)<6*k); if(a) hit.add(a); else {fp++; fps.push([Math.round(m.x/k),Math.round(m.y/k),Math.round(m.score*100),m.zone||m.vec||''])}}
      const miss=A.filter(t=>!hit.has(t)); const by={}; miss.forEach(t=>by[t.t]=(by[t.t]||0)+1);
      const TT=T.truth.map(t=>({...t,x:t.x*k,y:t.y*k})); const by2={}; for(const m of (SM.results[p.id]||[])){const t=TT.find(t=>Math.hypot(t.x-m.x,t.y-m.y)<6*k); const key=t?t.t:'none'; (by2[key]=by2[key]||[]).push(Math.round(m.score*100)+(m.rec!=null?"/"+Math.round(m.ncc*100)+"r"+Math.round(m.rec*100)+"p"+Math.round(m.prec*100):""))} const all=JSON.stringify(by2);const smp=SM.samples[0];return {all,smp:smp&&[smp.mode,smp.box.map(v=>Math.round(v/k)),smp.canvas.width],truth:A.length,found:acc.length,tp:hit.size,fp,missedBy:by,fps:fps.slice(0,12),thr:SM.thr,ms:Math.round(ms)}};
    const p=S.pages[S.pages.length-1]; res.pdf=await evalRun(p,1);
    // raster-only: same sheet as a PNG image
    const bm=await ensureBitmap(p); const k=bm.width/p.w; const blob=await new Promise(r=>bm.toBlob(r,'image/png'));
    await openFiles([new File([blob],'plan.png',{type:'image/png'})]);
    res.img=await evalRun(S.pages[S.pages.length-1],k);
    // text detection
    curPage=p.id; S.marks=[]; await textDetect(); res.text=S.marks.map(m=>m.type+':'+m.text);
    return res},{b64,T});
  console.log(JSON.stringify(out,null,1)); await b.close();
})();
