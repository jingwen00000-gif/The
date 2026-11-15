/* Strix FireTake · 公司档案 → 从估价表生成公司: a company profile and its rates from the company's own Excel estimating sheet
   (an "Estimate Master Sheet": wet price schedule with material $ and labour $, FireSense dry fire price list with cost and hours).
   The mapping of each price-schedule row to a FireTake item can be changed before the company is created (src/company/master-sheet.js). */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const M=()=>root.FT_MASTER;
const inflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
const money=v=>'$'+(Math.round((+v||0)*100)/100).toLocaleString('en-AU');
function pick(){const i=document.createElement('input'); i.type='file'; i.accept='.xlsx,.xlsm'; i.onchange=()=>{if(i.files[0]) open(i.files[0])}; i.click()}
async function open(file){let P; try{P=M().parse(await FT_LEARN.pricing.readXlsx(new Uint8Array(await file.arrayBuffer()),inflate))}catch(e){return toast(tt('读不出这个 Excel 文件')+'：'+(e.message||e))}
  if(!P.rows.length&&!P.dry.length) return toast(tt('这个 Excel 里没有找到价格表（Price Schedule）或 FireSense 价格表'));
  const opts=[['',tt('— 不用（放进物料库）—')],...ITEMS.filter(i=>i.sys!=='DEMO').map(i=>[i.k,`${i.code} · ${tt(i.zh)}`]),...Object.keys(defRates().pipe).filter(k=>/^(GMS|CU|PE)-/.test(k)).map(k=>['P:'+k,`${tt('管道')} ${k}`])];
  const label=k=>k.startsWith('P:')?`${tt('管道')} ${k.slice(2)}`:(ITEM[k]?`${ITEM[k].code} · ${tt(ITEM[k].zh)}`:k);
  const st={name:'',prefix:'',labour:P.settings.labour||90,gm:P.settings.gm??15,cont:P.settings.cont??5,rows:{}};
  const draw=()=>{const L=+st.labour||90, mk=Math.round(st.gm/(1-st.gm/100)*100)/100; const mapped=P.rows.filter((r,i)=>(st.rows[i]||r.keys).length).length;
    const d=ftModal(tt('从估价表生成公司'),`<p class="note" style="margin:0 0 8px">${tt('读取估价表里的湿式价格表（材料 + 人工）和 FireSense 报警价格表（成本 + 工时），生成公司档案和单价库。人工按工时 × 人工费率存，金额和原表一致；FireSense 全部产品和没有对应项的行放进物料库。')}</p>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">
        <label class="field">${tt('公司名称')}<input id="msName" value="${html(st.name)}" placeholder="Triple Fire Protection Pty Ltd"></label>
        <label class="field">${tt('报价编号前缀')}<input id="msPre" value="${html(st.prefix)}" placeholder="TFP"></label>
        <label class="field">${tt('人工费率 $/h')}<input id="msLab" class="num" value="${st.labour}"></label>
        <label class="field">${tt('毛利率 %（按售价）')}<input id="msGm" class="num" value="${st.gm}"></label>
        <label class="field">${tt('不可预见费 %')}<input id="msCont" class="num" value="${st.cont}"></label></div>
      <p class="note" style="margin:4px 0 8px">${tt('毛利率')} ${st.gm}% = ${tt('利润加成')} ${mk}%（${tt('FireTake 按成本加成')}）· ${tt('估价表')}：${html(file.name)}</p>
      <h4 style="margin:6px 0 4px">${tt('湿式价格表')} <span class="note">${mapped} / ${P.rows.length} ${tt('行对应到 FireTake 构件')}</span></h4>
      <div class="tablewrap" style="max-height:34vh;overflow:auto"><table class="t"><thead><tr><th>${tt('估价表里的项目')}</th><th class="r">${tt('材料')}</th><th class="r">${tt('人工')}</th><th>${tt('对应 FireTake')}</th><th class="r">${tt('工时')}</th></tr></thead><tbody>
      ${P.rows.map((r,i)=>{const keys=st.rows[i]||r.keys; return `<tr${keys.length?'':' style="opacity:.6"'}><td>${html(r.name)}<div class="note">${html(r.sec)}${r.note?' · '+html(r.note):''}</div></td><td class="r num">${money(r.m)}</td><td class="r num">${money(r.l)}</td>
        <td><select data-msr="${i}"><option value="__def" ${st.rows[i]?'':'selected'}>${r.keys.length?html(r.keys.map(label).join(' + ')):tt('— 不用（放进物料库）—')}</option>${opts.filter(o=>o[0]!==''||r.keys.length).map(o=>`<option value="${o[0]}" ${st.rows[i]&&st.rows[i].join()===o[0]?'selected':''}>${html(o[1])}</option>`).join('')}</select></td><td class="r num">${keys.length?Math.round(r.l/L*100)/100:''}</td></tr>`}).join('')}</tbody></table></div>
      <h4 style="margin:10px 0 4px">${tt('火灾报警（FireSense）')} <span class="note">${P.dry.length} ${tt('个构件')} · ${P.catalog.length} ${tt('项产品放进物料库')}</span></h4>
      <div class="note" style="max-height:14vh;overflow:auto">${P.dry.map(x=>`${html(label(x.key))}：${money(x.m)} · ${x.h} h <span style="opacity:.7">（${html(x.parts.join(' + '))}）</span>`).join('<br>')}</div>
      ${P.warnings.length?`<p class="note" style="color:var(--warn)">${P.warnings.map(html).join('；')}</p>`:''}`,
      [{t:tt('取消')},{t:tt('生成公司'),cls:'primary',fn:()=>create()}]);
    d.style.width='min(1080px,96vw)'; d.style.maxWidth='96vw';
    const bind=(id,k,num)=>{const e=d.querySelector('#'+id); e.onchange=()=>{st[k]=num?(parseFloat(e.value)||0):e.value.trim(); if(num) draw()}};
    bind('msName','name'); bind('msPre','prefix'); bind('msLab','labour',1); bind('msGm','gm',1); bind('msCont','cont',1);
    d.querySelectorAll('[data-msr]').forEach(s=>s.onchange=()=>{const i=+s.dataset.msr; if(s.value==='__def') delete st.rows[i]; else st.rows[i]=s.value?[s.value]:[]; draw()})};
  async function create(){if(!st.name){toast(tt('先填公司名称')); return setTimeout(draw,0)}
    const pk=M().pack(P,{...st,file:file.name,supplier:'FireSense ('+(st.prefix||st.name)+')'}); await importPackObj(pk);
    const c=COS.list.find(x=>x.id===pk.companies[0].id); if(c){c.prefix=c.prefix||st.prefix; await saveCompanies(false)}
    toast(`${tt('已生成公司')}「${st.name}」：${Object.keys(pk.companies[0].rates.fs.items).length} ${tt('个构件单价')}、${Object.keys(pk.companies[0].rates.fs.pipe).length} ${tt('种管道')}、${pk.catalog.items.length} ${tt('项物料')}`)}
  draw()}
root.FT_MASTER_APP={pick,open};
})(typeof window!=='undefined'?window:globalThis);
