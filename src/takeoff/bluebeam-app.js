/* Strix FireTake · 导入 Bluebeam 算量: the marked-up PDF from Bluebeam Revu opened as the drawing, its count and length markups
   turned into FireTake counts and pipe runs (src/takeoff/bluebeam.js). Each Bluebeam subject is matched to a FireTake item (or a pipe
   system / material / size) — guessed from its wording, changeable, remembered by subject (CFG.bbMap). A page with no scale takes it
   from Bluebeam's own measurements. */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const B=()=>root.FT_BLUEBEAM;
const zinflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
const plen=pts=>{let s=0; for(let i=1;i<pts.length;i++) s+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); return s};
const med=a=>{const s=a.slice().sort((x,y)=>x-y); return s.length?s[s.length>>1]:null};
function pick(){const i=document.createElement('input'); i.type='file'; i.accept='.pdf,application/pdf'; i.onchange=()=>{if(i.files[0]) open(i.files[0])}; i.click()}
async function open(file){const key=file.name+'|'+file.size;
  if(!S.pages.some(p=>p.file===key)) await openFiles([file]);
  const doc=pdfDocs.get(key); if(!doc) return toast(tt('这个 PDF 打不开'));
  const bytes=new Uint8Array(await file.arrayBuffer()); let R; try{R=await B().raw(bytes,zinflate)}catch(e){R={}}
  const pages=[]; for(const p of S.pages.filter(q=>q.file===key)){const pg=await doc.getPage(p.num), vp=pg.getViewport({scale:1}); pages.push({id:p.id,annots:await pg.getAnnotations(),toView:v=>vp.convertToViewportPoint(v[0],v[1])})}
  const G=B().groups(pages,R); if(!G.length) return toast(tt('这个 PDF 里没有 Bluebeam 的计数或测长标注'));
  const map=CFG.bbMap||{}, rules=(root.FVE&&FVE.DESC_RULES)||[];
  const st=G.map(g=>{const m=map[g.kind+'|'+g.subj.toUpperCase()]; if(g.kind==='count'){const gu=B().guess(g.subj,rules); return {on:!!(m?m.type:gu.type),type:m?m.type:gu.type,act:m?m.act:gu.act}}
    if(g.kind==='length'){const pp=B().pipeOf(g.subj); return {on:g.metres>0,sys:m?m.sys:pp.sys,mat:m?m.mat:pp.mat,dn:m?m.dn:pp.dn}} return {on:false}});
  const draw=()=>{const sizes=mat=>(MATS[mat]||{sizes:[]}).sizes;
    const counts=G.map((g,i)=>[g,i]).filter(([g])=>g.kind==='count'), lens=G.map((g,i)=>[g,i]).filter(([g])=>g.kind==='length'), areas=G.filter(g=>g.kind==='area');
    const d=ftModal(tt('导入 Bluebeam 算量'),`<p class="note" style="margin:0 0 8px">${tt('读取 Bluebeam 的计数（Count）和测长（Length）标注。每个 Bluebeam 名称对应一个 FireTake 构件或管道规格，选择会记住。X 开头 = 拆除，R 结尾 = 移位（改造工程）。')}</p>
      ${counts.length?`<h4 style="margin:4px 0">${tt('计数')}</h4><div class="tablewrap" style="max-height:34vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${tt('Bluebeam 名称')}</th><th class="r">${tt('数量')}</th><th>${tt('对应 FireTake 构件')}</th><th>${tt('状态')}</th></tr></thead><tbody>
      ${counts.map(([g,i])=>`<tr><td><input type="checkbox" data-bbon="${i}" ${st[i].on?'checked':''}></td><td><span class="cosw" style="background:#${g.color||'999'};display:inline-block;width:10px;height:10px;border-radius:2px"></span> ${html(g.subj||'—')}</td><td class="r num">${g.n}</td>
        <td><select data-bbt="${i}"><option value="">${tt('— 选择 —')}</option>${ITEMS.filter(x=>x.sys!=='DEMO').map(x=>`<option value="${x.k}" ${x.k===st[i].type?'selected':''}>${html(x.code)} · ${html(tt(x.zh))}</option>`).join('')}</select></td>
        <td><select data-bba="${i}">${['new','remove','relocate','retain'].map(a=>`<option value="${a}" ${a===st[i].act?'selected':''}>${html(tt(ACT[a].zh))}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`:''}
      ${lens.length?`<h4 style="margin:10px 0 4px">${tt('测长（管道）')}</h4><div class="tablewrap" style="max-height:24vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${tt('Bluebeam 名称')}</th><th class="r">${tt('段数')}</th><th class="r">${tt('长度 m')}</th><th>${tt('系统')}</th><th>${tt('材料')}</th><th>DN</th></tr></thead><tbody>
      ${lens.map(([g,i])=>`<tr><td><input type="checkbox" data-bbon="${i}" ${st[i].on?'checked':''}></td><td>${html(g.subj||'—')}</td><td class="r num">${g.n}</td><td class="r num">${g.metres?Math.round(g.metres*10)/10:'—'}</td>
        <td><select data-bbs="${i}">${Object.keys(SYS).filter(k=>SYS[k].pipe||k==='DET').map(k=>`<option value="${k}" ${k===st[i].sys?'selected':''}>${html(tt(SYS[k].zh))}</option>`).join('')}</select></td>
        <td><select data-bbm="${i}">${Object.keys(MATS).map(k=>`<option value="${k}" ${k===st[i].mat?'selected':''}>${html(k)}</option>`).join('')}</select></td>
        <td><select data-bbd="${i}">${sizes(st[i].mat).map(z=>`<option value="${z}" ${+z===+st[i].dn?'selected':''}>${z}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`:''}
      ${areas.length?`<p class="note">${tt('面积标注')}：${areas.map(a=>`${html(a.subj||'Area')} ${Math.round(a.sq)} m²`).join('；')}（${tt('只显示，不导入')}）</p>`:''}
      <label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="bbPend"> ${tt('作为待确认导入（逐个核对后再计入）')}</label>`,
      [{t:tt('取消')},{t:tt('导入'),cls:'primary',fn:()=>run()}]);
    d.style.width='min(1000px,96vw)'; d.style.maxWidth='96vw';
    const on=(sel,f)=>d.querySelectorAll(sel).forEach(x=>x.onchange=()=>{f(x); if(/data-bbm/.test(sel)) draw()});
    on('[data-bbon]',x=>st[+x.dataset.bbon].on=x.checked); on('[data-bbt]',x=>{const s=st[+x.dataset.bbt]; s.type=x.value; s.on=!!x.value; draw()}); on('[data-bba]',x=>st[+x.dataset.bba].act=x.value);
    on('[data-bbs]',x=>st[+x.dataset.bbs].sys=x.value); on('[data-bbm]',x=>{const s=st[+x.dataset.bbm]; s.mat=x.value; const z=sizes(s.mat); if(!z.includes(+s.dn)) s.dn=z.reduce((a,b)=>Math.abs(b-s.dn)<Math.abs(a-s.dn)?b:a,z[0])}); on('[data-bbd]',x=>st[+x.dataset.bbd].dn=+x.value)};
  function run(){const pend=$('#bbPend')&&$('#bbPend').checked; snap(); let nc=0, nr=0, dup=0, cal=0;
    // a page with no scale: the scale Bluebeam measured with (metres ÷ drawn length)
    for(const p of S.pages.filter(q=>q.file===key)){const k=[]; G.forEach(g=>{if(g.kind==='length') for(const it of g.items) if(it.page===p.id&&it.metres&&plen(it.pts)>5) k.push(it.metres/plen(it.pts))});
      const mpu=med(k); if(mpu&&!p.mPerUnit){p.mPerUnit=mpu; p.ratio=Math.round(mpu/0.000352778); cal++}}
    G.forEach((g,i)=>{const s=st[i]; if(!s.on) return; map[g.kind+'|'+g.subj.toUpperCase()]=g.kind==='count'?{type:s.type,act:s.act}:{sys:s.sys,mat:s.mat,dn:s.dn};
      if(g.kind==='count'&&s.type) for(const it of g.items){if(S.marks.some(m=>m.page===it.page&&m.type===s.type&&Math.hypot(m.x-it.x,m.y-it.y)<2)){dup++; continue}
        const m={id:uid(),page:it.page,type:s.type,x:it.x,y:it.y,src:'bluebeam',bb:g.subj}; if(s.act&&s.act!=='new') m.act=s.act; if(pend) m.pending=true; S.marks.push(m); nc++}
      if(g.kind==='length') for(const it of g.items){if(it.pts.length<2) continue; const r={id:uid(),page:it.page,sys:s.sys,mat:s.mat,dn:+s.dn,pts:it.pts.map(q=>[q[0],q[1]]),extra:0,src:'bluebeam',bb:g.subj}; if(pend) r.pending=true; S.runs.push(r); nr++}});
    CFG.bbMap=map; saveCfg(); pagesInit(); showPage(); changed();
    toast(`${tt('已导入 Bluebeam')}：${nc} ${tt('个构件')}、${nr} ${tt('段管道')}${dup?` · ${dup} ${tt('个已存在跳过')}`:''}${cal?` · ${cal} ${tt('页按 Bluebeam 的比例设好')}`:''}`)}
  draw()}
root.FT_BLUEBEAM_APP={pick,open};
})(typeof window!=='undefined'?window:globalThis);
