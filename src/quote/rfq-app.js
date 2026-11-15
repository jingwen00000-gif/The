/* Strix FireTake · 供应商询价: send packages of the bill out, read the prices back, level the quotes, use the chosen rates
   S.rfq = {packages:[{id, name, codes, choice, suppliers:[{id, name, email, sent, got, prices:{code: rate}}]}], applied:{code:{prev, rate, supplier, pkg}}}
   The chosen supply rates replace this project's material rates (labour stays); 撤销 puts the previous rates back. */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const Q=()=>root.FT_RFQ;
const inflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
const money=v=>v==null||!isFinite(v)?'—':'$'+(Math.round(v*100)/100).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const sid=()=>'s'+Math.random().toString(36).slice(2,8);
function rows(){return Q().fromLines(compute().lines)}
// packages kept in step with the bill: lines gone are dropped, new lines join their system's package
function sync(){S.rfq=S.rfq||{packages:[],applied:{}}; S.rfq.applied=S.rfq.applied||{}; const R=rows(), have=new Set(R.map(r=>r.code));
  const sysName=Object.fromEntries(Object.keys(SYS).map(k=>[k,SYS[k].en]));
  if(!S.rfq.packages.length) S.rfq.packages=Q().packages(R,sysName);
  for(const p of S.rfq.packages) p.codes=p.codes.filter(c=>have.has(c));
  const inPkg=new Set(S.rfq.packages.flatMap(p=>p.codes));
  for(const r of R) if(!inPkg.has(r.code)){const id='pk_'+String(r.sys).toLowerCase(); let p=S.rfq.packages.find(x=>x.id===id); if(!p){p={id,name:r.sys==='PIPE'?'Pipe and fittings':(sysName[r.sys]||r.sys)+' – equipment',codes:[],suppliers:[],choice:''}; S.rfq.packages.push(p)} p.codes.push(r.code)}
  S.rfq.packages=S.rfq.packages.filter(p=>p.codes.length||p.suppliers.length); return R}
function info(){const c=(typeof co==='function'&&co())||{}; return {project:S.name,company:c.name,contact:c.contact,email:c.email}}
function sheetBytes(p,R){return xlsxBuild([{name:'RFQ',rows:Q().sheetRows(p,R,info()),cols:[16,60,8,6,14,14]}])}
async function sendSupplier(p,s,R){const name=`RFQ ${S.name||'project'} - ${p.name} - ${s.name}.xlsx`.replace(/[\\/:*?"<>|]+/g,' '), bytes=sheetBytes(p,R); s.sent=todayISO(); changed();
  const c=info(), body=`Hi ${s.name},\n\nCould you please quote supply (ex GST) for the attached list for ${S.name||'our project'}${S.site?' at '+S.site:''}?\nPlease enter your unit rates in the Rate column and send the sheet back, keeping the Code column as it is.\n\nRegards,\n${c.contact||''}\n${c.company||''}`;
  const eml=root.FT_MAIL?FT_MAIL.eml({to:s.email||'',subject:`RFQ – ${S.name||''} – ${p.name}`,body},[{name,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes}]):null;
  if(eml&&root.firetake&&root.firetake.openFile){await root.firetake.openFile(name.replace(/\.xlsx$/,'.eml'),new TextEncoder().encode(eml)); toast(tt('询价邮件已在邮件程序中打开（附询价单）'))}
  else if(eml) await saveFile(name.replace(/\.xlsx$/,'.eml'),new Blob([eml],{type:'message/rfc822'})); else await saveFile(name,new Blob([bytes]))}
function csvRows(t){return String(t).split(/\r?\n/).filter(Boolean).map(l=>{const out=[]; let cur='', q=false; for(const ch of l){if(ch==='"') q=!q; else if(ch===','&&!q){out.push(cur); cur=''} else cur+=ch} out.push(cur); return out})}
async function importReply(p,s,R,file){try{let table=[];
    if(/\.csv$/i.test(file.name)) table=csvRows(await file.text());
    else{const W=await FT_LEARN.pricing.readXlsx(new Uint8Array(await file.arrayBuffer()),inflate); table=(W.find(w=>{try{Q().readReply(w.rows,R); return true}catch(e){return false}})||W[0]||{rows:[]}).rows}
    const got=Q().readReply(table,R.filter(r=>p.codes.includes(r.code))); const n=Object.keys(got).filter(c=>p.codes.includes(c)).length;
    s.prices={...(s.prices||{}),...got}; s.got=todayISO(); changed(); toast(`${s.name}：${tt('读入')} ${n} / ${p.codes.length} ${tt('项单价')}`)}
  catch(e){toast(tt('读不出单价：请用这里导出的询价单，或者表里要有 Rate（单价）列'))}}
function apply(p,R){const ch=Q().chosenRates(p,R), Rt=S.rates, names=Object.fromEntries(p.suppliers.map(s=>[s.id,s.name])); let n=0;
  for(const [code,{rate,supplier}] of Object.entries(ch)){const r=R.find(x=>x.code===code); if(!r) continue; let prev;
    if(r.kind==='item'){const it=ITEM[r.k]||{m:0,h:0}; Rt.items[r.k]=Rt.items[r.k]||{m:it.m,h:it.h}; prev=Rt.items[r.k].m; Rt.items[r.k].m=rate}
    else{const key=`${r.mk}-${r.dn}`; Rt.pipe[key]=Rt.pipe[key]||{m:0,h:0}; prev=Rt.pipe[key].m; Rt.pipe[key].m=rate}
    const old=S.rfq.applied[code]; S.rfq.applied[code]={prev:old?old.prev:prev,rate,supplier:names[supplier]||supplier,pkg:p.id}; n++}
  changed(); return n}
function undo(p,R){let n=0; for(const [code,a] of Object.entries(S.rfq.applied)){if(a.pkg!==p.id) continue; const r=R.find(x=>x.code===code);
    if(r&&r.kind==='item'&&S.rates.items[r.k]) S.rates.items[r.k].m=a.prev; else if(r&&S.rates.pipe[`${r.mk}-${r.dn}`]) S.rates.pipe[`${r.mk}-${r.dn}`].m=a.prev; delete S.rfq.applied[code]; n++}
  changed(); return n}
function open(){const R=sync(); const known=CFG.suppliers||[];
  const pkgHTML=(p,pi)=>{const L=Q().level(p,R), S2=p.suppliers, applied=Object.values(S.rfq.applied).filter(a=>a.pkg===p.id).length;
    return `<div class="card" style="margin:0 0 10px;padding:12px" data-rp="${pi}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input data-rpn value="${html(p.name)}" style="font-weight:700;flex:1;min-width:200px"><span class="note">${p.codes.length} ${tt('个清单项')}</span>${applied?`<span class="pill ok">${tt('已用回价')} ${applied}</span>`:''}</div>
      <div class="tablewrap" style="margin-top:8px"><table class="t"><thead><tr><th>${tt('供应商')}</th><th>${tt('状态')}</th><th class="r">${tt('合计')}</th><th></th></tr></thead><tbody>
      ${S2.map((s,si)=>`<tr data-rs="${si}"><td><b>${html(s.name)}</b><div class="note">${html(s.email||'')}</div></td><td class="note">${s.got?`✓ ${tt('已回价')} ${s.got}`:s.sent?`${tt('已发')} ${s.sent}`:tt('未发')}${L.missing[s.id]&&s.got?`<div style="color:var(--warn)">${tt('缺项')} ${L.missing[s.id]} ${tt('个清单项')}</div>`:''}</td>
        <td class="r num">${s.got?money(L.totals[s.id]):''}</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-rsend>${tt('询价邮件')}</button><button type="button" class="btn sm ghost" data-rsheet>${tt('询价单')}</button><label class="btn sm ghost">${tt('导入回价')}<input type="file" accept=".xlsx,.xlsm,.csv" data-rimp hidden></label><button type="button" class="btn sm ghost" data-rdel aria-label="${tt('删除')}">×</button></td></tr>`).join('')}
      <tr><td colspan="4"><div style="display:flex;gap:6px;flex-wrap:wrap"><input data-rnn placeholder="${tt('供应商名称')}" list="rfqSup" style="flex:1;min-width:140px"><input data-rne placeholder="${tt('邮箱')}" style="flex:1;min-width:160px"><button type="button" class="btn sm" data-radd>${tt('+ 添加供应商')}</button></div></td></tr></tbody></table></div>
      ${S2.some(s=>s.got)?`<details style="margin-top:8px" open><summary class="note" style="cursor:pointer">${tt('比价')}</summary><div class="tablewrap" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>${tt('项目')}</th><th class="r">${tt('数量')}</th>${S2.map(s=>`<th class="r">${html(s.name)}</th>`).join('')}</tr></thead><tbody>
        ${L.lines.map(l=>`<tr><td>${html(l.desc)}<div class="note">${html(l.code)}</div></td><td class="r num">${l.qty} ${l.unit}</td>${S2.map(s=>`<td class="r"><input class="num" data-rrate="${s.id}|${html(l.code)}" value="${l.rates[s.id]!=null?l.rates[s.id]:''}" style="width:80px;${l.best===s.id?'background:color-mix(in srgb,var(--ok) 18%,transparent);font-weight:600':''}"></td>`).join('')}</tr>`).join('')}
        <tr class="sub"><td>${tt('合计')}</td><td></td>${S2.map(s=>`<td class="r num">${money(L.totals[s.id])}${L.missing[s.id]?`<div class="note" style="color:var(--warn)">${tt('缺项')} ${L.missing[s.id]}</div>`:''}</td>`).join('')}</tr></tbody></table></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><label class="field" style="margin:0">${tt('采用')}<select data-rch><option value="">—</option>${S2.filter(s=>s.got).map(s=>`<option value="${s.id}" ${p.choice===s.id?'selected':''}>${html(s.name)} · ${money(L.totals[s.id])}</option>`).join('')}<option value="cheapest" ${p.choice==='cheapest'?'selected':''}>${tt('每行最低价')} · ${money(L.cheapest)}</option></select></label>
          <button type="button" class="btn sm primary" data-rapply ${p.choice?'':'disabled'}>${tt('用这些单价报价')}</button>${applied?`<button type="button" class="btn sm ghost" data-rundo>${tt('撤销，恢复原单价')}</button>`:''}
          ${p.choice==='cheapest'?`<span class="note" style="color:var(--warn)">${tt('分开下单时，请确认各供应商只拿到部分项目也保持单价')}</span>`:''}</div></details>`:''}</div>`};
  const d=ftModal(tt('供应商询价'),`<p class="note" style="margin:0 0 8px">${tt('把工程量清单分包发给供应商：每个供应商一封询价邮件（附询价单 Excel），收到回价后导入，软件逐行比价，选中的供货单价进入这个项目的报价（人工不变）。')}</p>
    <datalist id="rfqSup">${known.map(s=>`<option value="${html(s.name)}">`).join('')}</datalist>${S.rfq.packages.map(pkgHTML).join('')||`<p class="note">${tt('还没有工程量：先在图纸算量页计数和量管道。')}</p>`}`,[{t:tt('关闭'),cls:'primary'}]);
  d.style.width='min(1080px,96vw)'; d.style.maxWidth='96vw';
  const re=()=>{d.close(); open()};
  d.querySelectorAll('[data-rp]').forEach(card=>{const p=S.rfq.packages[+card.dataset.rp];
    card.querySelector('[data-rpn]').onchange=e=>{p.name=e.target.value.trim()||p.name; changed()};
    card.querySelector('[data-radd]').onclick=()=>{const n=card.querySelector('[data-rnn]').value.trim(); if(!n) return toast(tt('先填供应商名称')); let e=card.querySelector('[data-rne]').value.trim(); const k=known.find(s=>s.name===n); if(!e&&k) e=k.email||'';
      p.suppliers.push({id:sid(),name:n,email:e,prices:{}}); if(!k){CFG.suppliers=known.concat([{name:n,email:e}]); saveCfg()} changed(); re()};
    card.querySelectorAll('[data-rs]').forEach(tr=>{const s=p.suppliers[+tr.dataset.rs];
      tr.querySelector('[data-rsend]').onclick=async()=>{await sendSupplier(p,s,R); re()};
      tr.querySelector('[data-rsheet]').onclick=async()=>{s.sent=s.sent||todayISO(); changed(); await saveFile(`RFQ ${S.name||''} - ${p.name} - ${s.name}.xlsx`.replace(/[\\/:*?"<>|]+/g,' '),new Blob([sheetBytes(p,R)]))};
      tr.querySelector('[data-rimp]').onchange=async e=>{const f=e.target.files[0]; if(f){await importReply(p,s,R,f); re()}};
      tr.querySelector('[data-rdel]').onclick=()=>{p.suppliers=p.suppliers.filter(x=>x!==s); if(p.choice===s.id) p.choice=''; changed(); re()}});
    card.querySelectorAll('[data-rrate]').forEach(i=>i.onchange=()=>{const [id,code]=i.dataset.rrate.split('|'), s=p.suppliers.find(x=>x.id===id); const v=parseFloat(i.value); s.prices=s.prices||{}; if(isFinite(v)) s.prices[code]=v; else delete s.prices[code]; s.got=s.got||todayISO(); changed(); re()});
    const ch=card.querySelector('[data-rch]'); if(ch) ch.onchange=()=>{p.choice=ch.value; changed(); re()};
    const ap=card.querySelector('[data-rapply]'); if(ap) ap.onclick=()=>{const n=apply(p,R); toast(`${tt('已把')} ${n} ${tt('项供货单价用到报价里')}`); re()};
    const un=card.querySelector('[data-rundo]'); if(un) un.onclick=()=>{const n=undo(p,R); toast(`${tt('已恢复')} ${n} ${tt('项原单价')}`); re()}})}
root.FT_RFQ_APP={open,sync,apply,undo,importReply};
})(typeof window!=='undefined'?window:globalThis);
