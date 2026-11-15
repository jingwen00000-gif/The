/* Strix FireTake · 填总包报价表: the builder's own Excel price schedule filled from this estimate
   Pick the workbook, check each row's source (a system's price, a level's price, passive fire, the total, or an amount you type),
   download the filled copy. Choices are remembered by the row's wording (CFG.builderMap), so the next schedule worded the same fills
   itself. The builder's layout, styles and formulas stay (src/quote/xlsx-fill.js). */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const X=()=>root.FT_XLSXFILL;
const inflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
// what an amount can come from, with its value now (ex GST, sell)
function sources(){const C=compute(); let P=null; try{P=computePF()}catch(e){} const pf=P&&P.ex||0, out=[];
  out.push({k:'',zh:'— 不填 —',v:null});
  for(const k of Object.keys(SYS)) if(C.sellBySys&&C.sellBySys[k]) out.push({k:'sys:'+k,zh:SYS[k].zh,v:C.sellBySys[k]});
  if(pf) out.push({k:'pf',zh:'被动防火',v:pf});
  out.push({k:'fs',zh:'消防报价合计（不含被动防火）',v:C.ex});
  if(pf) out.push({k:'total',zh:'全部合计（消防 + 被动防火）',v:C.ex+pf});
  try{for(const lv of levelsList()) out.push({k:'lv:'+lv,zh:`${tt('楼层')} ${lv}`,v:compute(lv).ex})}catch(e){}
  out.push({k:'num',zh:'输入金额',v:null});
  return out}
const money=v=>v==null?'':'$'+Math.round(v).toLocaleString('en-AU');
async function pick(){const inp=document.createElement('input'); inp.type='file'; inp.accept='.xlsx,.xlsm'; inp.onchange=()=>{const f=inp.files[0]; if(f) open(f)}; inp.click()}
async function open(file){let E,W; try{E=await FT_LEARN.pricing.unzip(new Uint8Array(await file.arrayBuffer()),inflate); W=X().read(E)}catch(e){return toast(tt('读不出这个 Excel 文件')+'：'+(e.message||e))}
  const sheets=W.sheets.filter(s=>s.rows.length); if(!sheets.length) return toast(tt('这个 Excel 里没有找到带说明的行'));
  let si=Math.max(0,sheets.findIndex(s=>s.header)); const map=CFG.builderMap||{}, SRC=sources(), byK=Object.fromEntries(SRC.map(s=>[s.k,s]));
  const state=sheets.map(s=>s.rows.map(r=>{const m=map[X().norm(r.desc)]; return {k:r.formula?'':(m!=null?m:X().suggest(r.desc)),num:''}}));
  const draw=()=>{const s=sheets[si], st=state[si]; const val=(r,i)=>st[i].k==='num'?(+st[i].num||null):(byK[st[i].k]||{}).v;
    const used=s.rows.reduce((a,r,i)=>a+(r.formula?0:(val(r,i)||0)),0), q=byK.total?byK.total.v:byK.fs.v;
    const d=ftModal(tt('填总包报价表'),`<p class="note" style="margin:0 0 8px">${tt('选每一行的金额来源，下载填好的文件。总包的格式和公式都不变，公式行不会被覆盖；选择会按行的文字记住，下次同样的报价表自动填好。金额不含 GST。')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">${sheets.length>1?`<label class="field" style="margin:0">${tt('工作表')}<select id="bsSheet">${sheets.map((x,i)=>`<option value="${i}" ${i===si?'selected':''}>${html(x.name)}</option>`).join('')}</select></label>`:`<b>${html(s.name)}</b>`}
        <label class="field" style="margin:0">${tt('金额列')}<input id="bsCol" value="${html(s.amountCol)}" style="width:52px"></label>
        <span class="note">${file.name}</span></div>
      <div class="tablewrap" style="max-height:52vh;overflow:auto"><table class="t"><thead><tr><th>${tt('行号')}</th><th>${tt('总包表里的说明')}</th><th>${tt('来源')}</th><th class="r">${tt('填入金额')}</th></tr></thead><tbody>
      ${s.rows.map((r,i)=>`<tr><td class="note">${r.r}</td><td>${html(r.desc)}</td><td>${r.formula?`<span class="note">${tt('公式，不填')}</span>`:`<select data-bsk="${i}">${SRC.map(o=>`<option value="${o.k}" ${o.k===st[i].k?'selected':''}>${html(tt(o.zh))}${o.v!=null?' · '+money(o.v):''}</option>`).join('')}</select>${st[i].k==='num'?` <input data-bsn="${i}" class="num" value="${html(st[i].num)}" style="width:96px">`:''}`}</td><td class="r num">${r.formula?'':money(val(r,i))}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note" style="margin:6px 0 0">${tt('已分配')} <b>${money(used)}</b> / ${tt('报价合计')} <b>${money(q)}</b>${Math.abs(used-q)>1&&used?` · <span style="color:var(--warn)">${tt(used>q?'多分配了':'还有未分配的')} ${money(Math.abs(used-q))}${tt('，请检查是否重复或漏项')}</span>`:used?' ✓':''}</p>`,
      [{t:tt('取消')},{t:tt('下载填好的报价表'),cls:'primary',fn:()=>save()}]);
    d.style.width='min(980px,96vw)'; d.style.maxWidth='96vw';
    const sel=d.querySelector('#bsSheet'); if(sel) sel.onchange=()=>{si=+sel.value; draw()};
    d.querySelector('#bsCol').onchange=e=>{const c=e.target.value.trim().toUpperCase().replace(/[^A-Z]/g,''); if(c){s.amountCol=c; s.rows.forEach(r=>r.ref=c+r.r)} draw()};
    d.querySelectorAll('[data-bsk]').forEach(x=>x.onchange=()=>{st[+x.dataset.bsk].k=x.value; draw()});
    d.querySelectorAll('[data-bsn]').forEach(x=>x.onchange=()=>{st[+x.dataset.bsn].num=x.value; draw()})};
  async function save(){const s=sheets[si], st=state[si], writes=[];
    s.rows.forEach((r,i)=>{if(r.formula) return; const k=st[i].k; map[X().norm(r.desc)]=k==='num'?'num':k; const v=k==='num'?+st[i].num:(byK[k]||{}).v; if(k&&v!=null&&isFinite(v)) writes.push({ref:r.ref,value:v})});
    CFG.builderMap=map; saveCfg();
    const out=X().fill(E,s.path,writes); const name=file.name.replace(/\.(xlsx|xlsm)$/i,'')+` - ${(typeof co==='function'&&co().name)||'Fire'} filled.xlsx`;
    await saveFile(name,new Blob([X().zip(out.entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    toast(`${tt('已填')} ${out.written} ${tt('个金额单元格')}${out.skipped.length?` · ${out.skipped.length} ${tt('个公式单元格没有改')}`:''}`)}
  draw()}
root.FT_BUILDER={pick,open,sources};
})(typeof window!=='undefined'?window:globalThis);
