/* FireTake · learn from a finished job, inside the app (Settings → "AI 学习：历史项目")

   The estimator picks a finished job's original drawings, the marked-up takeoff (Bluebeam count markups, with or without the count
   tables), and optionally the BOQ / quote. The job is read in a sandbox (the open project is put aside and restored), exactly as
   `npm run learn` reads it: diff → count tables → symbols / consultant / circuits / rooms / rates → one contributions record.

   Before the job is added, recognition is scored on it with what the software knew until then (the job's own knowledge left out),
   against the estimator's markups: that is the accuracy a new job of this kind would get today. Each learnt job keeps that score, so
   the list shows whether the software is getting better as jobs are added.

   Storage: IndexedDB meta 'learn-local' = {contribs:[contributions], scores:[{projectId, name, at, score, …}]}. The knowledge base the
   app recognises with = the bundled jobs (window.FT_KNOWLEDGE_CONTRIBS, from data/knowledge) + the local ones, rebuilt with the same
   FT_LEARN.db.rebuild; a local job with the same id replaces the bundled one. Export / import moves local jobs between computers. */
(function(root){
'use strict';
const KEY='learn-local';
const LA=root.FT_LEARN_APP={kb:null,ready:false};
const tt=s=>typeof T==='function'?T(s):s;
const html=s=>typeof esc==='function'?esc(s):String(s);

async function store(){if(typeof DB==='undefined'||!DB.ok) return {id:KEY,contribs:[],scores:[]}; const r=await DB.get('meta',KEY).catch(()=>null); return r&&r.contribs?r:{id:KEY,contribs:[],scores:[]}}
async function put(v){if(typeof DB==='undefined'||!DB.ok) throw new Error(tt('当前环境不支持项目库')); await DB.put('meta',{...v,id:KEY})}
const bundled=()=>Array.isArray(root.FT_KNOWLEDGE_CONTRIBS)?root.FT_KNOWLEDGE_CONTRIBS:[];
// the knowledge base recognition uses: bundled + local jobs (null when there is nothing local: the bundled base is used as it is)
async function rebuild(){const st=await store(); LA.local=st; if(!st.contribs.length){LA.kb=null; return null}
  const ids=new Set(st.contribs.map(c=>c.projectId)); LA.kb=FT_LEARN.db.rebuild(bundled().filter(c=>!ids.has(c.projectId)).concat(st.contribs)); return LA.kb}
LA.rebuild=rebuild; LA.store=store;
// at start: once the project database is open
(async()=>{for(let i=0;i<100&&!(typeof DB!=='undefined'&&DB.ok);i++) await new Promise(r=>setTimeout(r,200)); try{await rebuild()}catch(e){console.error(e)} LA.ready=true})();

/* ---- sandbox: the open project is put aside while a finished job is read, then restored ---- */
async function sandbox(fn){if(typeof saveNow==='function') await saveNow();
  const keep={S,curId,curPage}, docs0=new Set(pdfDocs.keys()); root.FT_LEARNING=true; S=normalizeState(freshState()); curId=null;
  try{return await fn()}
  finally{const tmp=S; for(const p of tmp.pages||[]){pdfPageRef.delete(p.id); bitmaps.delete(p.id); if(root.FX&&FX.models) FX.models.delete(p.id)}
    for(const k of [...pdfDocs.keys()]) if(!docs0.has(k)){try{pdfDocs.get(k).destroy()}catch(e){} pdfDocs.delete(k)}
    S=keep.S; curId=keep.curId; curPage=keep.curPage; root.FT_LEARNING=false;
    try{pagesInit(); await showPage(); changed()}catch(e){console.error(e)}}}

const inflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
const slug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9一-龥]+/g,'-').replace(/^-|-$/g,'').slice(0,60);

// files: {name, original:[File], takeoff:[File] (empty: the original carries the markups), boq:File|null, quote:File|null}
async function learnJob(files,say){const name=(files.name||'').trim()||files.original[0].name.replace(/\.pdf$/i,''); const projectId=slug(name)||('job-'+Date.now());
  const KB=root.FX&&FX.knowledgeBase?FX.knowledgeBase():null; const t0=Date.now();
  say&&say(tt('正在读取图纸并比对标记…'));
  const ex=await sandbox(()=>FT_LEARN.ingest.ingestInApp({projectId,original:files.original.map(f=>[f.name,f]),takeoff:files.takeoff&&files.takeoff.length?files.takeoff.map(f=>[f.name,f]):null,
    metadata:{name},markupMap:null,knowledge:KB}));
  const pricing={};
  for(const k of ['boq','quote']) if(files[k]){say&&say(tt('正在读取报价表…')); try{pricing[k]=FT_LEARN.pricing.extract(await FT_LEARN.pricing.readXlsx(await files[k].arrayBuffer(),inflate),{FVE,source:k})}catch(e){console.error(e)}}
  const fl={original:files.original.map(f=>f.name),takeoff:(files.takeoff||[]).map(f=>f.name),boq:files.boq&&files.boq.name,quote:files.quote&&files.quote.name};
  const {graph,contributions}=FT_LEARN.builder.build({projectId,metadata:{name},files:fl},ex,pricing);
  const st=await store(); const known=st.scores.find(s=>s.projectId===projectId);
  const rec={projectId,name,at:new Date().toISOString(),score:ex.score,knowledgeProjects:ex.knowledgeProjects,consultant:ex.consultant&&ex.consultant.consultant||null,
    devices:graph.summary.devices,byType:graph.summary.byType,unknown:ex.unknownClasses,pricingItems:graph.summary.pricingItems,seconds:Math.round((Date.now()-t0)/1000),
    countRows:graph.countTables.flatMap(t=>t.rows.filter(r=>r.found!=null).map(r=>({page:t.page,description:r.description,qty:r.qty,found:r.found}))),
    first:known?known.first||{at:known.at,score:known.score,knowledgeProjects:known.knowledgeProjects}:null};
  st.contribs=st.contribs.filter(c=>c.projectId!==projectId).concat(contributions); st.scores=st.scores.filter(s=>s.projectId!==projectId).concat(rec);
  await put(st); await rebuild();
  return {rec,ex,graph}}
LA.learnJob=learnJob;
async function removeJob(id){const st=await store(); st.contribs=st.contribs.filter(c=>c.projectId!==id); st.scores=st.scores.filter(s=>s.projectId!==id); await put(st); await rebuild()}
async function exportLocal(){const st=await store(); const blob=new Blob([JSON.stringify({app:'FireTake',type:'learnt-jobs',at:new Date().toISOString(),contribs:st.contribs,scores:st.scores})],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='FireTake-learnt-jobs-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove()},1000)}
async function importLocal(file){const o=JSON.parse(await file.text()); if(!o||o.app!=='FireTake'||o.type!=='learnt-jobs') throw new Error(tt('不是 FireTake 学习记录文件'));
  const st=await store(); const ids=new Set((o.contribs||[]).map(c=>c.projectId));
  st.contribs=st.contribs.filter(c=>!ids.has(c.projectId)).concat(o.contribs||[]); st.scores=st.scores.filter(s=>!ids.has(s.projectId)).concat((o.scores||[]).filter(s=>ids.has(s.projectId)));
  await put(st); await rebuild(); return ids.size}
LA.removeJob=removeJob; LA.exportLocal=exportLocal; LA.importLocal=importLocal;

/* ---- UI ---- */
const pct=v=>v==null?'—':(Math.round(v*10)/10)+'%';
const NAME=k=>typeof ITEM!=='undefined'&&ITEM[k]?ITEM[k].zh:k;
async function panelHtml(){const st=await store(); const b=bundled();
  const rows=st.scores.slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(s=>`<tr><td>${html(s.name)}<div class="note">${html(String(s.at).slice(0,10))}${s.consultant?' · '+html(s.consultant):''}</div></td>
    <td class="r num">${s.devices}</td><td class="r num">${s.knowledgeProjects}</td>
    <td class="r num"><b>${s.score?pct(s.score.f1):'—'}</b>${s.score?`<div class="note">${tt('查准')} ${pct(s.score.precision)} · ${tt('查全')} ${pct(s.score.recall)}</div>`:''}${s.first&&s.first.score?`<div class="note">${tt('第一次')} ${pct(s.first.score.f1)}</div>`:''}</td>
    <td><button type="button" class="btn sm" data-lrm="${html(s.projectId)}">${tt('删除')}</button></td></tr>`).join('');
  return `<p class="note" style="margin:0">${tt('把做完的项目交给软件学习：原图 + 你的算量标记图（Bluebeam 计数标记，带每层的数量表更好）+ 报价表（可选）。软件先用已经学过的知识盲测这个项目，记下准确率，再把它学进知识库。下面的准确率一项比一项高，就说明软件在变准。')}</p>
    <p class="note">${tt('内置知识库')}：${b.length} ${tt('个项目')}${b.length?'（'+b.map(c=>html(c.projectId)).join('、')+'）':''} · ${tt('本机学习')}：${st.contribs.length} ${tt('个项目')}</p>
    <div class="toolbar"><button type="button" class="btn sm primary" id="lrnNew">${tt('从完成项目学习…')}</button><button type="button" class="btn sm" id="lrnExp" ${st.contribs.length?'':'disabled'}>${tt('导出学习记录')}</button><button type="button" class="btn sm" id="lrnImp">${tt('导入学习记录…')}</button><input type="file" id="lrnImpF" accept=".json" hidden></div>
    ${rows?`<div style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>${tt('项目')}</th><th class="r">${tt('标记设备')}</th><th class="r">${tt('当时已学项目')}</th><th class="r">${tt('学习前识别准确率')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:''}`}
async function renderPanel(el){if(!el) return; el.innerHTML=await panelHtml();
  el.querySelector('#lrnNew').onclick=()=>openLearn(()=>renderPanel(el));
  el.querySelector('#lrnExp').onclick=()=>exportLocal();
  const f=el.querySelector('#lrnImpF'); el.querySelector('#lrnImp').onclick=()=>f.click();
  f.onchange=async()=>{if(!f.files[0]) return; try{const n=await importLocal(f.files[0]); toast(`${tt('已导入')} ${n} ${tt('个项目')}`); renderPanel(el)}catch(e){toast(e.message||String(e))}};
  el.querySelectorAll('[data-lrm]').forEach(b=>b.onclick=async()=>{if(typeof ftConfirm==='function'&&!(await ftConfirm(tt('从知识库删除这个项目？')))) return; await removeJob(b.dataset.lrm); renderPanel(el)})}
LA.renderPanel=renderPanel;

function openLearn(done){
  ftModal(tt('从完成项目学习'),`<label class="field">${tt('项目名称')}<input id="lrName" placeholder="17 Khartoum Rd L4-5"></label>
    <label class="field">${tt('原图（设计图纸 PDF，可多选）')}<input type="file" id="lrOrig" accept=".pdf" multiple></label>
    <label class="field">${tt('算量标记图（你标记后的 PDF，可多选；原图上直接标记的可不选）')}<input type="file" id="lrTake" accept=".pdf" multiple></label>
    <label class="field">${tt('BOQ / 报价表（xlsx，可选）')}<input type="file" id="lrXls" accept=".xlsx" multiple></label>
    <p class="note" style="margin:4px 0 0">${tt('大项目需要 1–3 分钟。学习时当前项目会暂时收起，完成后自动恢复。')}</p>`,
    [{t:tt('取消')},{t:tt('开始学习'),cls:'primary',fn:()=>{const d=$('#ftModal'); const g=id=>[...(d.querySelector(id).files||[])];
      const xs=g('#lrXls'), files={name:d.querySelector('#lrName').value,original:g('#lrOrig'),takeoff:g('#lrTake'),boq:xs.find(f=>/boq|bill|quantit/i.test(f.name))||null,quote:xs.find(f=>!/boq|bill|quantit/i.test(f.name))||null};
      if(xs.length===1&&files.quote&&/boq/i.test(files.quote.name)){files.boq=files.quote; files.quote=null}
      if(!files.original.length) return toast(tt('请选择原图 PDF'));
      run(files,done)}}])}

async function run(files,done){const d=ftModal(tt('正在学习'),`<p id="lrSay" style="margin:0">${tt('准备中…')}</p>`,[]);
  const say=t=>{const e=d.querySelector('#lrSay'); if(e) e.textContent=t};
  try{const {rec,graph}=await learnJob(files,say); showResult(rec,graph)}
  catch(e){console.error(e); ftModal(tt('学习失败'),`<p style="margin:0">${html(e.message||String(e))}</p>`,[{t:tt('关闭')}])}
  finally{done&&done()}}

function showResult(rec,graph){const by=Object.entries(rec.byType||{}).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${html(NAME(k))} ${n}`).join(' · ');
  const bad=rec.countRows.filter(r=>r.found!==r.qty);
  const s=rec.score;
  ftModal(tt('学习完成'),`<p style="margin:0"><b>${html(rec.name)}</b>：${tt('从你的标记里学到')} <b>${rec.devices}</b> ${tt('个设备')}${rec.consultant?`（${tt('设计单位')} ${html(rec.consultant)}）`:''}${rec.pricingItems?`，${rec.pricingItems} ${tt('条单价')}`:''}，${rec.seconds}s</p>
    <p class="note">${by}</p>
    ${s?`<p style="margin:8px 0 0">${tt('学习前，软件在这个项目上的识别准确率')}：<b>${pct(s.f1)}</b>（${tt('查准')} ${pct(s.precision)}，${tt('查全')} ${pct(s.recall)}；${tt('漏识别')} ${s.falseNegative}，${tt('多识别')} ${s.falsePositive}）${rec.knowledgeProjects?'':' — '+tt('知识库里还没有其他项目')}</p>
      ${s.pages&&s.pages.length>1?`<table class="t" style="margin-top:4px"><thead><tr><th>${tt('图纸')}</th><th class="r">${tt('你标记')}</th><th class="r">${tt('软件找到')}</th><th class="r">${tt('多识别')}</th><th class="r">F1</th></tr></thead><tbody>${s.pages.map(p=>`<tr><td>${html(p.title||('p'+(p.page+1)))}</td><td class="r num">${p.truth}</td><td class="r num">${p.found}</td><td class="r num">${p.extra}</td><td class="r num">${pct(p.f1)}</td></tr>`).join('')}</tbody></table>`:''}
      ${rec.first&&rec.first.score?`<p class="note">${tt('第一次学习这个项目时')}：${pct(rec.first.score.f1)}</p>`:''}`:`<p class="note">${tt('标记里没有可对比位置的设备，没有计算准确率。')}</p>`}
    ${rec.countRows.length?`<p class="note">${tt('数量表核对')}：${rec.countRows.length-bad.length} / ${rec.countRows.length} ${tt('行与标记数量一致')}${bad.length?'；'+bad.slice(0,6).map(r=>`${html(r.description)} ${tt('表')} ${r.qty} / ${tt('标记')} ${r.found}`).join('；'):''}</p>`:''}
    ${rec.unknown&&rec.unknown.length?`<p class="note" style="color:#b45309">${tt('有些标记分不出是什么设备，没有学习')}：${rec.unknown.slice(0,8).map(html).join('、')}</p>`:''}
    <p class="note">${tt('已加入本机知识库，之后的识别会用到。')}</p>`,[{t:tt('关闭'),cls:'primary'}])}

if(typeof I18N!=='undefined') Object.assign(I18N,{'正在读取图纸并比对标记…':'Reading the drawings and comparing the markups…','正在读取报价表…':'Reading the price sheets…','不是 FireTake 学习记录文件':'Not a FireTake learnt-jobs file',
  '把做完的项目交给软件学习：原图 + 你的算量标记图（Bluebeam 计数标记，带每层的数量表更好）+ 报价表（可选）。软件先用已经学过的知识盲测这个项目，记下准确率，再把它学进知识库。下面的准确率一项比一项高，就说明软件在变准。':'Teach FireTake a finished job: the original drawings + your marked-up takeoff (Bluebeam count markups, ideally with the per-sheet count tables) + the price sheets (optional). FireTake first tests itself on the job blind, with what it learnt so far, records the accuracy, then adds the job to its knowledge. Rising accuracy down the list means it is getting better.',
  '内置知识库':'Built-in knowledge','个项目':'jobs','本机学习':'Learnt on this computer','从完成项目学习…':'Learn from a finished job…','导出学习记录':'Export learnt jobs','导入学习记录…':'Import learnt jobs…','项目':'Job','标记设备':'Marked devices','当时已学项目':'Jobs known then','学习前识别准确率':'Accuracy before learning',
  '查准':'precision','查全':'recall','第一次':'first time','删除':'Delete','从知识库删除这个项目？':'Remove this job from the knowledge base?','从完成项目学习':'Learn from a finished job','项目名称':'Job name','原图（设计图纸 PDF，可多选）':'Original drawings (PDF, several allowed)',
  '算量标记图（你标记后的 PDF，可多选；原图上直接标记的可不选）':'Marked-up takeoff (PDF; leave empty if the markups are on the originals)','BOQ / 报价表（xlsx，可选）':'BOQ / quote (xlsx, optional)','大项目需要 1–3 分钟。学习时当前项目会暂时收起，完成后自动恢复。':'Large jobs take 1–3 minutes. The open project is put aside while learning and restored afterwards.',
  '开始学习':'Learn','请选择原图 PDF':'Choose the original drawings','正在学习':'Learning','准备中…':'Starting…','学习失败':'Learning failed','学习完成':'Learnt','从你的标记里学到':'learnt from your markups:','学习前，软件在这个项目上的识别准确率':'Recognition accuracy on this job before learning it',
  '漏识别':'missed','多识别':'extra','知识库里还没有其他项目':'no other jobs in the knowledge base yet','第一次学习这个项目时':'When this job was first learnt','标记里没有可对比位置的设备，没有计算准确率。':'No positioned devices in the markups; accuracy not scored.','数量表核对':'Count tables',
  '行与标记数量一致':'rows match the markups','表':'table','标记':'markups','有些标记分不出是什么设备，没有学习':'Some markups could not be named and were not learnt','已加入本机知识库，之后的识别会用到。':'Added to this computer\'s knowledge base; recognition uses it from now on.','AI 学习：历史项目':'AI learning: finished jobs','图纸':'Sheet','你标记':'You marked','软件找到':'Found'});
})(typeof window!=='undefined'?window:globalThis);
