/* FireTake · rates from finished jobs (Learning Engine pricing library → the project's rate table)

   The pricing library holds, per item and work done (smoke, smoke@remove, spk_pend@relocate, cable_fip …), the supply cost, install cost
   and all-in rate the estimator actually priced on earlier jobs. Here they become suggestions for this project's rates, never silent
   changes: a table of item, current all-in cost, the jobs' median, how many jobs, and what would be set —
     new work   S.rates.items[k]       = {m: median supply, h: median install ÷ labour $/hr}
     other work S.rates.actRates[k@a]  = the same, as an override of the default factors
     cable      S.rates.pipe['CBH-1' | 'CBH-3'] per metre
   Items with only an all-in rate are split by the jobs' labour ratio (else the current split). The estimator ticks what to take. */
(function(root){
'use strict';
const ent=x=>Array.isArray(x)?x:(x&&x.schema?x.entries:x)||[];
const CABLE={cable_fip:'CBH-1',cable_ewis:'CBH-3'};
const med=s=>s&&s.n?s.median:null;

// → [{key, label, current, learnt, n, set:{m,h}|null, where}]
function suggestions(KB,state,ctx){const R=state.rates, L=ctx.labourRate(+R.labour||0)||1; const out=[];
  for(const e of ent(KB&&KB.pricing)){const [k,a]=String(e.item).split('@'); const jobs=Object.keys(e.sources||{}).length;
    let where=null, cur=null;
    if(CABLE[k]){where='pipe'; const p=R.pipe&&R.pipe[CABLE[k]]; cur=p?p.m+p.h*L:null}
    else if(ctx.items[k]){where=a?'act':'item'; cur=ctx.cost(e.item)}
    else continue;
    const sup=med(e.supplyCost), ins=med(e.installCost), rate=med(e.rate)||(sup!=null&&ins!=null?sup+ins:null); if(rate==null) continue;
    const lr=med(e.labourRatio); let m=sup, h=ins!=null?ins/L:null;
    if(m==null||h==null){const ratio=lr!=null?lr:(cur&&where==='item'&&R.items[k]?(R.items[k].h*L)/(R.items[k].m+R.items[k].h*L||1):.5); m=rate*(1-ratio); h=rate*ratio/L}
    out.push({key:e.item,label:ctx.label(e.item),unit:e.unit||null,current:cur!=null?Math.round(cur*100)/100:null,learnt:Math.round(rate*100)/100,n:jobs,samples:(e.rate||{}).n||jobs,
      set:{m:Math.round(m*100)/100,h:Math.round(h*1000)/1000},where,diffPct:cur?Math.round(100*(rate-cur)/cur):null})}
  return out.sort((a,b)=>Math.abs(b.diffPct||0)-Math.abs(a.diffPct||0))}

function apply(state,rows){const R=state.rates; let n=0;
  for(const r of rows){if(!r.set) continue; const [k]=r.key.split('@');
    if(r.where==='pipe'){R.pipe=R.pipe||{}; R.pipe[CABLE[k]]={m:r.set.m,h:r.set.h}; n++}
    else if(r.where==='item'){R.items[k]={m:r.set.m,h:r.set.h}; n++}
    else if(r.where==='act'){R.actRates=R.actRates||{}; R.actRates[r.key]={m:r.set.m,h:r.set.h}; n++}}
  state.rateSrc=Object.assign({},state.rateSrc||{},{history:new Date().toISOString().slice(0,10)}); return n}

const NS=root.FT_RATES=root.FT_RATES||{}; NS.suggestions=suggestions; NS.apply=apply; NS.CABLE=CABLE;
if(typeof module!=='undefined'&&module.exports) module.exports=NS;

/* ---- in the app: a button on the rates page ---- */
if(typeof document==='undefined'||typeof costRateOf!=='function') return;   /* S is filled in later by the app; only its functions are needed here */
const ctx=()=>({labourRate,cost:costRateOf,label:keyLabel,items:ITEM});
function show(){const KB=root.FX&&FX.knowledgeBase?FX.knowledgeBase():root.FT_KNOWLEDGE; const rows=suggestions(KB,S,ctx());
  if(!rows.length){toast(T('知识库里还没有历史报价（npm run learn 读入带 BOQ / 报价单的完工项目）')); return}
  const f=v=>v==null?'—':'$'+(Math.round(v*100)/100).toLocaleString();
  const html=`<p class="note" style="margin:0 0 8px">${T('以下单价来自已完工项目的 BOQ / 报价单（中位数）。勾选要采用的行，会写入本项目的单价表（材料 $ + 工时 hr），不影响其他项目。')}</p>
    <div style="max-height:56vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${T('项目')}</th><th class="r">${T('当前')}</th><th class="r">${T('历史中位数')}</th><th class="r">${T('差异')}</th><th class="r">${T('项目数')}</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td><input type="checkbox" data-rh="${i}" ${r.current==null||Math.abs(r.diffPct||0)>=5?'checked':''}></td><td>${esc(r.label)}${r.unit?` <span class="note">/${esc(r.unit)}</span>`:''}<div class="note">${T('材料')} ${f(r.set.m)} · ${T('工时')} ${r.set.h} hr</div></td>
      <td class="r num">${f(r.current)}</td><td class="r num"><b>${f(r.learnt)}</b></td><td class="r num">${r.diffPct==null?'—':(r.diffPct>0?'+':'')+r.diffPct+'%'}</td><td class="r num">${r.n}</td></tr>`).join('')}</tbody></table></div>`;
  const d=ftModal(T('按历史项目建议单价'),html,[{t:T('取消')},{t:T('采用勾选的单价'),cls:'primary',fn:()=>{const pick=rows.filter((r,i)=>{const c=d.querySelector(`[data-rh="${i}"]`); return c&&c.checked}); snap(); const n=apply(S,pick); changed(); if(typeof renderRates==='function') renderRates(); toast(`${T('已更新')} ${n} ${T('项单价（来自历史项目）')}`)}}]);
  d.style.width='min(860px,96vw)'; d.addEventListener('close',()=>{d.style.width=''},{once:true}); return {d,rows}}
NS.show=show;
const bar=document.getElementById('resetRates'); if(bar&&!document.getElementById('ratesHistory')){const b=document.createElement('button'); b.className='btn'; b.id='ratesHistory'; b.textContent=T('按历史项目建议单价'); b.title=T('用已完工项目 BOQ / 报价单里的单价（知识库）'); b.onclick=show; bar.parentNode.insertBefore(b,bar)}
})(typeof window!=='undefined'?window:globalThis);
