/* FireTake app ↔ FireTake Vector Engine (FVE) + Multi-Layer Symbol Matching Engine (MSME)

   One button (G / "按图例一键计数"): every PDF sheet → FVE models (cached) → project dictionary (text legends, CAD-lettered legends,
   consultant library) → the estimator names legend rows nobody knows yet (once; remembered per consultant) → MSME detections on every
   plan → verification + legend pipe / cable lengths → one results table → pending marks and runs in the takeoff.

   Uses the app's own pieces: pdfPageObj, vsmSearch / fveTemplate (vector matcher), lgCrop (legend row picture), ftModal, S.marks / S.runs.
   Consultant library: localStorage 'ft_fve_library' = [{consultant, geoHash, device, at}] — consultant from the title block's e-mail
   domain or company line, editable in the naming dialog. */
(function(root){
'use strict';
const LIBKEY='ft_fve_library';
const FX=root.FX={models:new Map(),boxes:{},last:null,busy:false};
const ckey=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');

/* ---------------------------------------------------------------- consultant library */
function libAll(){try{return JSON.parse(localStorage.getItem(LIBKEY)||'[]')}catch(e){return []}}
function libSave(L){try{localStorage.setItem(LIBKEY,JSON.stringify(L.slice(-3000)))}catch(e){}}
// entries for this consultant (and entries saved without one); engine sees them without the consultant field, already filtered
function libFor(consultant){const k=ckey(consultant); return libAll().filter(e=>!e.consultant||!k||ckey(e.consultant)===k).map(e=>({geoHash:e.geoHash,device:e.device}))}
function libLearn(consultant,items){let L=libAll(); const k=ckey(consultant);
  for(const it of items){if(!it.geoHash||!it.device) continue; L=L.filter(e=>!(e.geoHash===it.geoHash&&ckey(e.consultant)===k)); L.push({consultant:consultant||'',geoHash:it.geoHash,device:it.device,at:Date.now()})}
  libSave(L); return L.length}
// who drew the set: an e-mail domain in the title block (yanhao@evolvedengineering.com.au → Evolvedengineering), else a company line
function consultantOf(models){const votes={};
  for(const m of models){const tb=m.texts.filter(t=>t.cx>m.page.w*.55);
    for(const t of tb){const e=String(t.s).match(/@([a-z0-9-]+)\./i); if(e&&!/gmail|outlook|hotmail|bigpond|yahoo/i.test(e[1])){const k=e[1].charAt(0).toUpperCase()+e[1].slice(1); votes[k]=(votes[k]||0)+3}
      const c=String(t.s).match(/^([A-Z][A-Za-z&.' ]{2,40}\b(ENGINEERING|ENGINEERS|CONSULTING|CONSULTANTS|PTY\.? ?LTD|GROUP|ASSOCIATES))/i); if(c&&!/FIRE SERVICES/i.test(c[1])) votes[c[1].trim()]=(votes[c[1].trim()]||0)+1}}
  return Object.entries(votes).sort((a,b)=>b[1]-a[1]).map(x=>x[0])[0]||''}

/* ---------------------------------------------------------------- knowledge base */
const KBKEY='ft_knowledge';
// the bundled base (window.FT_KNOWLEDGE, written by npm run learn) or one the estimator imported (localStorage), the imported one first
function knowledgeBase(){try{const s=localStorage.getItem(KBKEY); if(s) return JSON.parse(s)}catch(e){} return root.FT_KNOWLEDGE&&root.FT_KNOWLEDGE.index&&root.FT_KNOWLEDGE.index.projects&&root.FT_KNOWLEDGE.index.projects.length?root.FT_KNOWLEDGE:null}
function importKnowledge(json){const L=typeof json==='string'?JSON.parse(json):json; if(!L||!L.index) throw new Error('not a FireTake knowledge base'); try{localStorage.setItem(KBKEY,JSON.stringify(L))}catch(e){throw new Error('knowledge base too large for local storage')} return L.index.projects.length}

/* ---------------------------------------------------------------- models */
async function modelsFor(pages,say){const out=[];
  for(const p of pages){let m=FX.models.get(p.id); if(!m){say&&say(`${T('正在读取图纸')} ${out.length+1} / ${pages.length}…`); await new Promise(r=>setTimeout(r,0));
      m=await FVE.buildModel(await pdfPageObj(p),pdfjsLib.OPS,{id:p.id,name:p.name,index:out.length}); FX.models.set(p.id,m)}
    out.push(m)}
  for(const id of [...FX.models.keys()]) if(!pages.some(p=>p.id===id)) FX.models.delete(id);
  return out}

/* ---------------------------------------------------------------- run */
async function fveCount(){
  if(FX.busy) return; const pages=S.pages.filter(p=>p.kind==='pdf'&&pdfPageRef.get(p.id)); const out=$('#detectOut');
  if(!pages.length){toast(T('先打开 CAD 导出的 PDF 图纸')); return}
  if(typeof currentTab!=='undefined'&&currentTab!=='takeoff') showTab('takeoff');
  const say=t=>{if(out) out.innerHTML=`<div class="aiout">${t}</div>`}; FX.busy=true; const btn=$('#lgAuto'); if(btn) btn.disabled=true;
  try{const t0=performance.now(); const models=await modelsFor(pages,say);
    // Learning Engine: the knowledge base built from finished jobs (data/knowledge → knowledge.bundle.js, plus any imported one)
    const KB=knowledgeBase(); const ce=root.FT_LEARN&&FT_LEARN.consultant?FT_LEARN.consultant.extract(models,{known:KB?FT_LEARN.db.entries(KB.consultants):[]}):null;
    const consultant=S.consultant||(ce&&ce.consultant)||consultantOf(models); FX.consultant=consultant;
    const K=KB?FT_LEARN.db.forRecognition(KB,{consultant}):null; FX.knowledge=K;
    say(T('正在分析图例…')); await new Promise(r=>setTimeout(r,0));
    let D=FVE.projectDictionary(models,{library:libFor(consultant).concat(K?K.library.filter(e=>e.consultant):[]),legendBoxes:FX.boxes,knowledge:K});
    if(!D.symbols.length&&!D.lineTypes.length){askBox(out); return}
    // legend rows nobody knows yet (CAD-lettered legends with no library entry): the estimator names each geometry once
    const unknown=D.symbols.filter(e=>!e.type&&e.geo&&e.geoHash);
    if(unknown.length){const named=await nameRows(D,unknown,consultant); if(named===null) return;
      if(named.consultant!==consultant){FX.consultant=named.consultant}
      if(named.items.length){libLearn(FX.consultant,named.items); D=FVE.projectDictionary(models,{library:libFor(FX.consultant).concat(K?K.library.filter(e=>e.consultant):[]),legendBoxes:FX.boxes,knowledge:K})}}
    let calls=0; const lib=libFor(FX.consultant);
    const dets=await FVE.detect(models,D,{library:lib,consultant:null,knowledge:K,match:async(e,m,q)=>{
      if(++calls%4===0){say(`${T('正在全图搜索图例符号')} · ${calls}`); await new Promise(r=>setTimeout(r,0))}
      const p=S.pages.find(x=>x.id===m.page.id); if(!p) return []; return fveMatch(e,p,q,.85)}});
    const warn=FVE.verify(models,D,dets), lines=FVE.measureLines(models,D);
    // loops (drawn cable traced; estimated where no cable reaches) and rooms; room expectations from finished jobs become questions
    const loops=root.FVE_LOOPS?FVE_LOOPS.run(models,D,dets,{knowledge:K}):[], rooms=root.FVE_ROOMS?FVE_ROOMS.detect(models,dets):[];
    if(root.FVE_ROOMS) warn.push(...FVE_ROOMS.expectations(rooms,K));
    const compliance=root.FVE_COMPLIANCE&&FVE_COMPLIANCE.check?FVE_COMPLIANCE.check(models,dets,rooms,loops):null;
    FX.last={models,D,dets,warn,lines,loops,rooms,compliance,consultant:FX.consultant,ms:performance.now()-t0};
    if(!dets.length&&!lines.length){say(T('读到了图例，但在平面图上没有找到相同的符号。可以用“框选图标 · 全图搜索”。')); return}
    say(`${T('FVE 识别完成')}：<b>${dets.length}</b> ${T('个设备')}${lines.length?`，${lines.length} ${T('种管线 / 电缆')}`:''}（${Math.round(FX.last.ms/100)/10}s）`);
    showResults(FX.last)}
  catch(e){console.error(e); say(T('识别出错：')+esc(e.message||String(e)))}
  finally{FX.busy=false; if(btn) btn.disabled=false}}

// no legend found at all: the estimator boxes the legend's symbol column once, then the run starts again with that box
function askBox(out){if(out) out.innerHTML=T('没有找到图例。请到图例那一页，拖一个框框住图例符号那一列。');
  ftModal(T('框选图例'),`<p style="margin:0">${T('没有在图纸上找到图例（文字图例或线条字图例）。')}</p><p>${T('请翻到图例那一页，拖一个框，框住图例里符号的那一列。')}</p>`,
    [{t:T('取消')},{t:T('去框选图例'),cls:'primary',fn:()=>{FX.boxing=true; setTool('legend'); toast(T('在图例页上拖一个框，框住图例符号那一列'))}}])}
if(typeof legendUp==='function'){const prev=legendUp; legendUp=async function(){if(!FX.boxing) return prev.apply(this,arguments);
  FX.boxing=false; if(!legendDrag) return; legendDrag=null; const p=page(); const r=legendRect; legendRect=null; draw(); setTool('select'); if(!r||!p) return;
  const box=[Math.min(r[0],r[2]),Math.min(r[1],r[3]),Math.max(r[0],r[2]),Math.max(r[1],r[3])]; if((box[2]-box[0])*V.s<10||(box[3]-box[1])*V.s<10) return toast(T('框太小了'));
  FX.boxes[p.id]=box; return fveCount()}}

/* ---------------------------------------------------------------- naming legend rows */
function typeOptions(k,blank){const types=ITEMS.filter(i=>typeof symTypeOk!=='function'||symTypeOk(i.k));
  return (blank?`<option value="" ${k?'':'selected'}>${T(blank)}</option>`:'')+Object.keys(SYS).filter(s=>types.some(i=>i.sys===s)).map(s=>`<optgroup label="${SYS[s].zh}">${types.filter(i=>i.sys===s).map(i=>`<option value="${i.k}" ${i.k===k?'selected':''}>${i.zh}</option>`).join('')}</optgroup>`).join('')}
async function rowPicture(e){try{const p=S.pages.find(q=>q.id===e.page), crop=root.FT29&&FT29.lgCrop; if(!p||!crop) return ''; const c=await crop(p,e.rowBox||e.bb,true); return c?c.toDataURL():''}catch(err){return ''}}
// resolves {consultant, items:[{geoHash, device}]} or null when cancelled
function nameRows(D,unknown,consultant){return new Promise(async resolve=>{
  const groups=[]; for(const e of unknown){let g=groups.find(x=>x.geoHash===e.geoHash); if(!g) groups.push(g={geoHash:e.geoHash,rows:[]}); g.rows.push(e)}
  const pics=await Promise.all(groups.map(g=>rowPicture(g.rows[0])));
  const st=s=>s&&ACT[s]?ACT[s].zh:'';
  const rows=groups.map((g,i)=>`<tr><td style="max-width:340px;overflow:hidden">${pics[i]?`<img src="${pics[i]}" alt="" style="height:24px;width:auto;max-width:330px;object-fit:contain;object-position:left;display:block">`:esc(g.rows[0].desc)}</td>
    <td class="note" style="white-space:nowrap">${[...new Set(g.rows.map(r=>st(r.status)||'—'))].join(' · ')}</td><td><select data-fxn="${i}" style="max-width:200px">${typeOptions('', '— 不计 —')}</select></td></tr>`).join('');
  let done=false; const finish=v=>{if(done) return; done=true; resolve(v)};
  const d=ftModal(T('给图例命名（只需一次）'),`<p class="note" style="margin:0 0 8px">${T('这套图纸的图例是 CAD 线条字，软件已切出每一行符号和状态（新装 / 既有 / 移位 / 拆除）。同一种符号只需选一次“统计为”，会按设计单位记住，下次自动识别。')}</p>
    <div class="toolbar" style="margin-bottom:8px">${T('设计单位')}：<input id="fxCons" value="${esc(consultant||'')}" style="width:240px"></div>
    <div style="max-height:56vh;overflow:auto"><table class="t"><thead><tr><th>${T('图例行')}</th><th>${T('状态')}</th><th>${T('统计为')}</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    [{t:T('取消'),fn:()=>finish(null)},{t:T('跳过'),fn:()=>finish({consultant,items:[]})},{t:T('保存并计数'),cls:'primary',fn:()=>{
      const cons=(d.querySelector('#fxCons').value||'').trim(), items=[]; groups.forEach((g,i)=>{const v=d.querySelector(`[data-fxn="${i}"]`).value; if(v&&ITEM[v]) items.push({geoHash:g.geoHash,device:v})}); finish({consultant:cons,items})}}]);
  d.style.width='min(900px,96vw)'; d.addEventListener('close',()=>{d.style.width=''; finish(null)},{once:true})})}

/* ---------------------------------------------------------------- results */
const LOWC=.75;
function groupsOf(R){const G=new Map(); const idx=id=>S.pages.findIndex(p=>p.id===id);
  for(const d of R.dets){if(!ITEM[d.type]) continue; const k=d.type+'|'+(d.status||'new'); let g=G.get(k); if(!g) G.set(k,g={type:d.type,status:d.status||'new',dets:[],per:{},conf:0,low:0,src:{}}); g.dets.push(d); g.per[d.page]=(g.per[d.page]||0)+1; g.conf+=d.conf; if(d.conf<LOWC) g.low++; for(const s of d.sources||[]) g.src[s]=(g.src[s]||0)+1}
  return [...G.values()].map(g=>({...g,conf:g.conf/g.dets.length})).sort((a,b)=>(ITEMS.findIndex(i=>i.k===a.type)-ITEMS.findIndex(i=>i.k===b.type))||a.status.localeCompare(b.status))}
const lineSys=l=>l.cls==='cable'?'DET':(/HOSE\s*REEL/i.test(l.desc)?'HR':/HYDRANT/i.test(l.desc)?'HYD':'SPR');
function lineDn(l,mat){const sizes=(MATS[mat]||{}).sizes||[]; if(MATS[mat]&&MATS[mat].cable){const ew=/EWIS|WARNING|SPEAKER|EVAC/i.test(l.desc), fr=/FIRE\s*RATED|\bFR\b|WS\d/i.test(l.desc); return (ew?3:1)+(fr?1:0)}
  const m=String(l.desc).match(/(?:DN\s*|Ø\s*)(\d{2,3})|(\d{2,3})\s*(?:MM|NB)\b/i); const v=m?+(m[1]||m[2]):null; return v&&sizes.includes(v)?v:(sizes.includes(25)?25:sizes[0])}
function showResults(R){const G=groupsOf(R); FX.groups=G; const multi=new Set(R.dets.map(d=>d.page)).size>1, ref=isRef();
  const pname=id=>{const p=S.pages.find(q=>q.id===id); return p?esc(p.name.replace(/\.pdf$/i,'')):'?'};
  const srcTxt=g=>Object.entries(g.src).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>`${k} ${Math.round(100*n/g.dets.length)}%`).join(' · ');
  const rows=G.map((g,i)=>`<tr><td><input type="checkbox" data-fxon="${i}" checked></td><td>${esc(ITEM[g.type].zh)}${ref||g.status!=='new'?`<div class="note">${ACT[g.status]?ACT[g.status].zh:esc(g.status)}</div>`:''}</td>
    <td class="r num"><b>${g.dets.length}</b>${multi?`<div class="note">${Object.entries(g.per).map(([pid,n])=>`${pname(pid)} ${n}`).join('<br>')}</div>`:''}</td>
    <td class="r num">${Math.round(g.conf*100)}%${g.low?`<div class="note" style="color:#b45309">${g.low} ${T('个低置信')}</div>`:''}</td><td class="note">${esc(srcTxt(g))}</td></tr>`).join('');
  const lrows=R.lines.map((l,i)=>{const sys=lineSys(l); return `<tr><td><input type="checkbox" data-fxl="${i}" ${l.total>0?'checked':''}></td><td>${esc(l.desc)}<div class="note">${l.cls==='cable'?T('电缆'):T('管线')}${l.status&&ACT[l.status]?' · '+ACT[l.status].zh:''}</div></td>
    <td><select data-fxls="${i}">${Object.keys(SYS).filter(s=>SYS[s].mat).map(s=>`<option value="${s}" ${s===sys?'selected':''}>${SYS[s].zh}</option>`).join('')}</select></td>
    <td class="r num"><b>${l.total?Math.round(l.total*10)/10+' m':'—'}</b>${l.unscaled?`<div class="note">${T('部分图纸无比例')}</div>`:''}</td></tr>`}).join('');
  const W=R.warn.filter(w=>w.level!=='info').slice(0,12);
  const L=R.loops||[]; const circ=c=>c==='ewis'?T('EWIS 广播回路'):T('探测回路');
  const looprows=L.map((l,i)=>`<tr><td>${l.source==='estimated'?`<input type="checkbox" data-fxloop="${i}" ${l.length_m?'checked':''}>`:''}</td><td>${pname(l.page)} · ${esc(l.id)}<div class="note">${circ(l.circuit)} · ${l.source==='drawn'?T('按图纸电缆'):T('估算')+(l.note==='no cable drawn'?'（'+T('图纸未画电缆')+'）':'（'+T('电缆未连到的设备')+'）')}</div></td>
    <td class="r num"><b>${l.devices}</b>${l.panel?`<div class="note">${T('含 FIP')}</div>`:''}</td><td class="r num"><b>${l.length_m!=null?l.length_m+' m':'—'}</b>${l.historical_m?`<div class="note">${T('历史')} ≈ ${l.historical_m} m</div>`:''}</td><td class="note" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.pattern)}${l.closed&&l.source==='drawn'?' · '+T('闭合环路'):''}</td></tr>`).join('');
  const RM=R.rooms||[];
  const d=ftModal(T('FVE 识别结果'),`<p class="note" style="margin:0 0 8px">${T('按图例在全部图纸上找到的设备（图例本身和图签不计）。置信度来自几何 / 文字 / 图例 / 上下文 / 回路五层证据。加入后为“待确认”，可以逐个核对。')}${R.consultant?` · ${T('设计单位')} ${esc(R.consultant)}`:''}${FX.knowledge&&FX.knowledge.consultantKnown?` · ${T('已用历史项目知识')}`:''}</p>
    <div style="max-height:44vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${T('设备')}</th><th class="r">${T('数量')}</th><th class="r">${T('置信度')}</th><th>${T('证据')}</th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="note">${T('没有找到设备')}</td></tr>`}</tbody></table></div>
    ${lrows?`<h4 style="margin:12px 0 4px">${T('管线 / 电缆（按图例线型量取）')}</h4><div style="max-height:22vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${T('图例线型')}</th><th>${T('系统')}</th><th class="r">${T('长度')}</th></tr></thead><tbody>${lrows}</tbody></table></div>`:''}
    ${looprows?`<h4 style="margin:12px 0 4px">${T('回路与回路长度')}</h4><div style="max-height:22vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${T('回路')}</th><th class="r">${T('设备')}</th><th class="r">${T('长度')}</th><th>${T('顺序')}</th></tr></thead><tbody>${looprows}</tbody></table></div><p class="note" style="margin:4px 0 0">${T('按图纸画的回路电缆已在上面的管线 / 电缆中计入；勾选的估算回路会加入为待确认电缆（正交走线 + 10% 余量 + 每个设备 1.5 m）。')}</p>`:''}
    ${RM.length?`<p class="note" style="margin:8px 0 0">${T('识别到房间')} ${RM.length} ${T('个')}${RM.some(r=>r.area_m2)?`，${T('总面积')} ${Math.round(RM.reduce((a,r)=>a+(r.area_m2||0),0))} m²`:''}</p>`:''}
    ${R.compliance&&R.compliance.findings.length?`<details style="margin-top:10px" ${R.compliance.summary.fail?'open':''}><summary>${T('规范检查')}：${[['fail','不符合'],['warn','需确认'],['advisory','建议'],['info','提示']].filter(([k])=>R.compliance.summary[k]).map(([k,t])=>`${T(t)} ${R.compliance.summary[k]}`).join(' · ')}${R.compliance.isolators?` · ${T('需短路隔离器')} ${R.compliance.isolators}`:''}</summary>
      <div class="note" style="max-height:24vh;overflow:auto">${R.compliance.standards.filter(s=>R.compliance.byStandard[s.id]).map(s=>`<div style="margin-top:6px"><b>${esc(s.id)}</b> ${esc(s.title)}${s.verified?'':` <span style="color:#b45309">（${T('限值未核对标准原文')}）</span>`}<ul style="margin:2px 0">${R.compliance.findings.filter(f=>f.standard===s.id).slice(0,25).map(f=>`<li><b>${T({fail:'不符合',warn:'需确认',advisory:'建议',info:'提示'}[f.level])}</b>${f.clause?` [${esc(f.clause)}]`:''} ${f.page?pname(f.page)+' · ':''}${esc(f.msg)}</li>`).join('')}</ul></div>`).join('')}</div>
      <p class="note" style="margin:2px 0 0">${T('检查的是识别出的布置。直线距离是行走 / 水带路线的下限：超出即不符合，未超出仍需按实际路线核对。吊顶高度、坡顶 / 梁格、危险等级等请设计确认。')}</p></details>`:''}
    ${W.length?`<details style="margin-top:10px"><summary>${T('需要注意')}（${W.length}）</summary><ul class="note">${W.map(w=>`<li>${esc(w.msg)}</li>`).join('')}</ul></details>`:''}`,
    [{t:T('取消')},{t:T('加入计数'),fn:()=>commit(d,false)},{t:T('加入并逐个核对'),cls:'primary',fn:()=>commit(d,true)}]);
  d.style.width='min(980px,96vw)'; d.addEventListener('close',()=>{d.style.width=''},{once:true}); return d}

/* ---------------------------------------------------------------- commit */
function commit(d,review){const R=FX.last, G=FX.groups||[]; if(!R) return; snap(); const add=[]; let dup=0, paired=0, runs=0;
  G.forEach((g,i)=>{const c=d.querySelector(`[data-fxon="${i}"]`); if(c&&!c.checked) return;
    for(const x of g.dets){if(S.marks.some(q=>q.page===x.page&&q.type===g.type&&Math.hypot(q.x-x.x,q.y-x.y)<Math.max(2,Math.min(x.w,x.h)*.6))){dup++; continue}
      const mk={id:uid(),page:x.page,type:g.type,x:x.x,y:x.y,pending:true,src:'fve',score:Math.round(x.conf*100)/100,conf:Math.round(x.conf*100)/100};
      if(x.fingerprint) mk.fp=x.fingerprint; if(g.status&&g.status!=='new') mk.act=g.status; add.push(mk)}});
  // a relocated device and the removed one at its old position are one relocation, priced once (same page and type, within 15 m)
  const Rl=add.filter(m=>m.act==='relocate'), Dl=add.filter(m=>m.act==='remove'), pairs=[];
  for(const r of Rl) for(const x of Dl){if(r.page!==x.page||r.type!==x.type) continue; const p=S.pages.find(q=>q.id===r.page), lim=p&&p.mPerUnit?15/p.mPerUnit:Math.max(p?p.w:1000,p?p.h:1000)*.15, dd=Math.hypot(r.x-x.x,r.y-x.y); if(dd<lim) pairs.push([dd,r,x])}
  pairs.sort((a,b)=>a[0]-b[0]); const ur=new Set(), ud=new Set(); for(const [,r,x] of pairs){if(ur.has(r)||ud.has(x)) continue; ur.add(r); ud.add(x); r.from=[x.x,x.y]; paired++}
  for(let i=add.length-1;i>=0;i--) if(ud.has(add[i])) add.splice(i,1);
  add.forEach(m=>S.marks.push(m));
  // pipe / cable runs from the legend's line types: one pending run per chain, chains shorter than 0.3 m skipped
  R.lines.forEach((l,i)=>{const c=d.querySelector(`[data-fxl="${i}"]`); if(!c||!c.checked) return; const sys=(d.querySelector(`[data-fxls="${i}"]`)||{}).value||lineSys(l), mat=SYS[sys]&&SYS[sys].mat; if(!mat) return; const dn=lineDn(l,mat);
    for(const [pid,pg] of Object.entries(l.pages)){const p=S.pages.find(q=>q.id===pid); const mpu=(pg.m&&pg.paper)?pg.m/pg.paper:(p&&p.mPerUnit)||null;
      for(const pts of pg.chains||[]){const L=pts.reduce((a,q,k)=>k?a+Math.hypot(q[0]-pts[k-1][0],q[1]-pts[k-1][1]):0,0); if(mpu&&L*mpu<.3) continue; if(pts.length<2) continue;
        S.runs.push({id:uid(),page:pid,sys,mat,dn,pts:pts.map(q=>[q[0],q[1]]),extra:0,pending:true,src:'fve',...(l.status==='remove'&&isRef()?{demo:true}:{})}); runs++}}});
  // estimated loop cable: one pending run along the estimated route (orthogonal), its slack and drops as the run's extra metres
  (R.loops||[]).forEach((l,i)=>{const c=d.querySelector(`[data-fxloop="${i}"]`); if(!c||!c.checked||!l.route||l.route.length<2) return; const p=S.pages.find(q=>q.id===l.page);
    const pts=[]; for(let k=0;k<l.route.length;k++){const q=l.route[k]; if(k){const pr=l.route[k-1]; if(pr[0]!==q[0]&&pr[1]!==q[1]) pts.push([q[0],pr[1]])} pts.push([q[0],q[1]])}
    const mpu=p&&p.mPerUnit; const base=mpu?pts.reduce((a,q,k)=>k?a+Math.hypot(q[0]-pts[k-1][0],q[1]-pts[k-1][1]):0,0)*mpu:null;
    S.runs.push({id:uid(),page:l.page,sys:'DET',mat:'CBH',dn:l.circuit==='ewis'?3:1,pts,extra:base!=null&&l.length_m?Math.max(0,Math.round((l.length_m-base)*10)/10):0,pending:true,src:'fve-loop-estimate',loop:l.id}); runs++});
  changed(); draw();
  toast(`${T('已加入')} ${add.length} ${T('个构件（待确认）')}${runs?`，${runs} ${T('段管线 / 电缆')}`:''}${paired?`，${paired} ${T('个移位已与原位置配对（不重复计价）')}`:''}${dup?`，${dup} ${T('个已存在跳过')}`:''}`);
  if(review&&add.length&&root.FT29&&FT29.rvStart) FT29.rvStart();
  return {marks:add.length,runs,paired,dup}}

/* ---------------------------------------------------------------- wiring: the G key and the legend button run FVE; the old flow stays as fallback */
FX.run=fveCount; FX.commit=commit; FX.knowledgeBase=knowledgeBase; FX.importKnowledge=importKnowledge; FX.showResults=showResults; FX.consultantOf=consultantOf; FX.libAll=libAll; FX.libLearn=libLearn; FX.libFor=libFor; FX.lineDn=lineDn;
FX.ready=()=>!!(root.FVE&&root.FVE_MSME&&typeof vsmSearch==='function'&&typeof fveTemplate==='function');
})(typeof window!=='undefined'?window:globalThis);
