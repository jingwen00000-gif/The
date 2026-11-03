/* Strix FireTake · tender inbox in the app
   Desktop: Settings → 招标收件箱 picks a folder; each subfolder is one tender. New subfolders are found when the app starts or comes back
   into focus (a chip in the header), or with 立即扫描. Any edition: 项目总览 → 从文件夹导入招标 (pick a folder).
   A folder is read (zips expanded in memory), sorted (src/inbox/tender-inbox.js), shown for review, and imported as a new project:
   fire drawings opened for take-off, the rest filed under 招标资料, project / client / contact / address / closing date filled in.
   The folder itself is never changed. Imported folders are remembered (CFG.inboxSeen) so they are not offered again. */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const IA=root.FT_INBOX_APP={busy:false};
const desk=()=>!!(root.firetake&&root.firetake.inboxList);
const inflate=async d=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());

// a folder's files as {path, name, size, read() → File}
function fromDesktop(f){return f.files.filter(x=>x.size<300*1024*1024).map(x=>({rel:x.rel,path:f.folder?x.rel.slice(f.folder.length+1):x.rel,name:x.name,size:x.size,read:async()=>new File([await root.firetake.inboxRead(x.rel)],x.name)}))}
function fromInput(list){const G=new Map(); for(const f of list){const rp=f.webkitRelativePath||f.name, parts=rp.split('/'); const folder=parts.length>1?parts[0]:'';
    if(!G.has(folder)) G.set(folder,[]); G.get(folder).push({path:parts.slice(parts.length>1?1:0).join('/'),name:f.name,size:f.size,read:async()=>f})}
  // a parent folder holding several tenders: one per project folder, loose files grouped by job code (src/inbox/tender-inbox.js)
  return [...G].flatMap(([folder,items])=>folder?FT_INBOX.splitTenders(folder,items):FT_INBOX.groupLoose(items,''))}
async function expandZips(items){const out=[];
  for(const it of items){if(FT_INBOX.classify(it.path).kind!=='zip'){out.push(it); continue}
    try{const z=await FT_LEARN.pricing.unzip(new Uint8Array(await (await it.read()).arrayBuffer()),inflate);
      for(const [name,data] of Object.entries(z)){if(!data||name.endsWith('/')||/__MACOSX\//.test(name)) continue; const base=name.split('/').pop(); out.push({path:it.path.replace(/\.zip$/i,'')+'/'+name,name:base,size:data.length,read:async()=>new File([data],base)})}}
    catch(e){out.push({...it,zipErr:String(e.message||e)})}}
  return out}
// every page's text of a PDF (up to max pages), and the page size
async function pdfPagesText(file,max){try{const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise; const n=Math.min(doc.numPages,max||60), pages=[]; let w=0,h=0;
  for(let i=1;i<=n;i++){const pg=await doc.getPage(i); if(i===1){const vp=pg.getViewport({scale:1}); w=vp.width; h=vp.height} const tc=await pg.getTextContent(); pages.push(tc.items.map(x=>x.str).join(' '))}
  const r={pages,w,h,n:doc.numPages}; doc.destroy(); return r}catch(e){return {pages:[],w:0,h:0,n:0}}}
// a page of a PDF as a small picture (the review's preview)
async function pagePicture(file,num,px){const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise; const pg=await doc.getPage(num||1); const v1=pg.getViewport({scale:1});
  const k=(px||520)/Math.max(v1.width,v1.height), vp=pg.getViewport({scale:k}); const cv=document.createElement('canvas'); cv.width=Math.ceil(vp.width); cv.height=Math.ceil(vp.height);
  const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height); await pg.render({canvasContext:ctx,viewport:vp}).promise; doc.destroy(); return cv.toDataURL('image/png')}

// read and sort one folder. Drawings (every PDF that is not a report / specification / tender document) are read page by page and each
// page given a discipline; a PDF is offered for take-off when it has fire services pages (only those pages when it is a combined set),
// flagged when another service's sheet carries fire devices (hydrants on the hydraulic sheet), otherwise filed as a drawing
async function analyse(folder,items0,say){const items=await expandZips(items0); const G={draw:[],docs:[],emails:[],skipped:[]}; const texts=[], emails=[];
  let n=0; for(const it of items){const c=FT_INBOX.classify(it.path); n++; if(say) say(`${folder||tt('（所选文件）')}：${n} / ${items.length} · ${it.name}`);
    if(c.kind==='skip'||c.kind==='zip'){G.skipped.push(it); continue}
    if(c.kind==='email'){G.emails.push(it); if(/\.eml$/i.test(it.name)){try{const m=FT_INBOX.parseEml(await (await it.read()).text()); if(m) emails.push(m)}catch(e){}} continue}
    if(c.kind==='doc'){G.docs.push({...it,cat:c.cat}); continue}
    // a PDF drawing (or a PDF the name does not explain)
    const f=await it.read(), P=await pdfPagesText(f,60), S1=FT_INBOX.summarise(P.pages.length?P.pages:[''],it.name);
    const looksDoc=c.kind==='pdf?'&&S1.disc==='other'&&P.w&&P.w<P.h&&P.w<700;   /* a portrait A4 with nothing drawing-like: a document */
    if(looksDoc){G.docs.push({...it,cat:'TENDER'}); continue}
    // named as a fire drawing (FS-101, F102, a Fire folder): the whole file is fire, every page; otherwise its pages decide (combined sets)
    if(c.kind==='fire'){S1.disc='fire'; S1.label=FT_INBOX.LABEL.fire; S1.firePages=[...Array(S1.pages).keys()]}
    const fire=S1.disc==='fire', maybe=!fire&&S1.withFire.length>0;
    G.draw.push({...it,s:S1,pages:P.n,fire,maybe,take:fire,onlyFire:fire&&S1.firePages.length<S1.pages});
    if(fire&&texts.length<3) texts.push(P.pages[S1.firePages[0]||0]||'')}
  const own=String((typeof co==='function'&&co().email)||'').split('@')[1]||'';
  const info=FT_INBOX.extract({folder,emails,texts,ownDomain:own});
  G.draw.sort((x,y)=>(y.fire-x.fire)||(y.maybe-x.maybe)||x.name.localeCompare(y.name));
  return {folder,info,G,count:items.length}}

const DEV={sprinkler:'喷头',hydrant:'消火栓',hosereel:'消防卷盘',detector:'探测器',ewis:'EWIS / 扬声器',fip:'FIP',booster:'水泵接合器 / 泵',extinguisher:'灭火器'};
const devTxt=f=>Object.entries(f||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,n])=>`${tt(DEV[k]||k)} ${n}`).join(' · ');
function drawRows(a,i){return a.G.draw.map((d,j)=>{const s=d.s, multi=s.pages>1;
  const tag=d.fire?`<span class="pill ok">${tt('消防')}</span>`:d.maybe?`<span class="pill warn">${tt(FT_INBOX.LABEL[s.disc])} · ${tt('含消防设备')}</span>`:`<span class="pill">${tt(FT_INBOX.LABEL[s.disc])}</span>`;
  const pg=multi?(d.fire?`${tt('消防页')} ${s.firePages.length} / ${s.pages}`:`${s.pages} ${tt('页')}`):'';
  return `<tr data-ibd="${i}:${j}"><td><input type="checkbox" data-ibtake ${d.take?'checked':''} aria-label="${tt('导入算量')}"></td><td style="min-width:220px">${html(d.name)}<div class="note">${html(d.path.includes('/')?d.path.slice(0,d.path.lastIndexOf('/')):'')}</div></td>
    <td style="white-space:nowrap">${tag}${pg?`<div class="note">${pg}</div>`:''}</td><td class="note" style="min-width:200px">${html(devTxt(d.fire?s.fire:s.all.fire))||'—'}</td>
    <td style="white-space:nowrap">${multi&&d.fire&&s.firePages.length<s.pages?`<label class="note" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-ibonly ${d.onlyFire?'checked':''}> ${tt('只导入消防页')}</label>`:''}<button type="button" class="btn sm ghost" data-ibprev>${tt('预览')}</button></td></tr>
    <tr data-ibpv="${i}:${j}" hidden><td></td><td colspan="4"></td></tr>`}).join('')}
function reviewHTML(A){const row=(k,label,v)=>`<label class="field">${tt(label)}<input data-ib="${k}" value="${html(v||'')}"></label>`;
  const P=typeof liveProjects==='function'?liveProjects().filter(p=>p.name||p.site):[];
  return A.map((a,i)=>{const nf=a.G.draw.filter(d=>d.fire).length, nm=a.G.draw.filter(d=>d.maybe).length;
   const dup=FT_INBOX.sameProject(a.info,P), twin=A.slice(0,i).find(b=>FT_INBOX.sameProject(a.info,[{name:b.info.name,site:b.info.site}]));
   const codes=[...new Set(a.G.draw.filter(d=>d.fire).map(d=>FT_INBOX.jobCode(d.name)).filter(Boolean))];
   const warn=[dup?`${tt('已有相似的项目')}：<b>${html(dup.p.name||dup.p.site)}</b>（${tt(dup.why==='name'?'名称相同':'地址相同')}）`:'',twin?`${tt('和上面的')} “${html(twin.folder||twin.info.name)}” ${tt('像是同一个项目')}`:'',!a.G.draw.length?`${tt('里面没有图纸 PDF，可能不是招标文件夹，默认不导入')}`:'',codes.length>1?`${tt('消防图纸有几个不同的项目编号')}（${codes.map(html).join(', ')}）${tt('，这个文件夹可能混了几个项目')}`:''].filter(Boolean);
   const into=dup?`<label class="field" style="margin-top:6px">${tt('导入到')}<select data-ibinto><option value="${html(dup.p.id)}" selected>${tt('已有项目')}：${html(dup.p.name||dup.p.site)}</option><option value="">${tt('新建项目')}</option></select></label>`:'';
   return `<div class="card" style="margin:0 0 10px;padding:12px" data-ibi="${i}"><label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" data-ibon ${a.G.draw.length?'checked':''}> ${html(a.folder||(a.root?tt('收件箱里散放的文件'):tt('（所选文件）')))} <span class="note" style="font-weight:400">${a.count} ${tt('个文件')}</span></label>
    ${warn.map(w=>`<p class="note" style="margin:4px 0 0;color:var(--warn)">⚠ ${w}</p>`).join('')}${into}
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px">${row('name','项目名称',a.info.name)}${row('client','客户',a.info.client)}${row('contact','联系人',a.info.contact)}${row('email','邮箱',a.info.email)}${row('phone','电话',a.info.phone)}${row('site','项目地址',a.info.site)}</div>
    ${a.info.closes?`<p class="note" style="margin:4px 0 0">${tt('截止')}：<b>${html(a.info.closes)}</b></p>`:''}
    <h4 style="margin:10px 0 4px">${tt('图纸')} <span class="note">${tt('勾选的打开算量，其余放进“招标资料”')} · ${tt('消防')} ${nf}${nm?` · <span style="color:var(--warn)">${nm} ${tt('张其他专业图纸含消防设备，请确认')}</span>`:''}</span></h4>
    ${a.G.draw.length?`<div class="tablewrap" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${tt('文件')}</th><th>${tt('专业')}</th><th>${tt('图上的消防设备')}</th><th></th></tr></thead><tbody>${drawRows(a,i)}</tbody></table></div>`:`<p class="note" style="color:var(--warn)">${tt('没有找到图纸 PDF')}</p>`}
    <details style="margin:6px 0 0"><summary class="note" style="cursor:pointer">${tt('资料')} ${a.G.docs.length} · ${tt('邮件')} ${a.G.emails.length}${a.G.skipped.length?` · ${tt('跳过')} ${a.G.skipped.length}`:''} · ${tt('查看文件')}</summary>
      <div class="note" style="max-height:24vh;overflow:auto;margin-top:4px">${[...a.G.docs.map(d=>[d.path,d.cat]),...a.G.emails.map(d=>[d.path,'EMAIL']),...a.G.skipped.map(d=>[d.path,tt('跳过')])].map(([p,c])=>`<div>${html(c)} · ${html(p)}</div>`).join('')}</div></details></div>`}).join('')}
function wireReview(box,A){box.querySelectorAll('[data-ibprev]').forEach(b=>b.onclick=async()=>{const tr=b.closest('[data-ibd]'), [i,j]=tr.dataset.ibd.split(':').map(Number), d=A[i].G.draw[j], pv=box.querySelector(`[data-ibpv="${i}:${j}"]`);
    if(!pv.hidden){pv.hidden=true; return} pv.hidden=false; const cell=pv.children[1]; cell.innerHTML=`<span class="note">${tt('正在生成预览…')}</span>`;
    try{const num=(d.fire?d.s.firePages[0]:(d.s.withFire[0]??0))+1; cell.innerHTML=`<img src="${await pagePicture(await d.read(),num,620)}" alt="" style="max-width:100%;border:1px solid var(--line);border-radius:6px"><div class="note">${tt('第')} ${num} / ${d.pages} ${tt('页')}</div>`}catch(e){cell.textContent=String(e.message||e)}});
  box.querySelectorAll('[data-ibtake]').forEach(c=>c.onchange=()=>{const [i,j]=c.closest('[data-ibd]').dataset.ibd.split(':').map(Number); A[i].G.draw[j].take=c.checked});
  box.querySelectorAll('[data-ibonly]').forEach(c=>c.onchange=()=>{const [i,j]=c.closest('[data-ibd]').dataset.ibd.split(':').map(Number); A[i].G.draw[j].onlyFire=c.checked})}

async function importOne(a,v,into){
  if(into&&into!==curId) await switchProject(into); else if(!into) await newProject();
  // into an existing project (a re-issue / addendum): only the empty fields are filled
  const set=(k,x)=>{if(x&&(!into||!S[k])) S[k]=x}; set('name',v.name||FT_INBOX.tenderName(a.folder)); ['client','contact','email','phone','site'].forEach(k=>set(k,v[k]));
  if(a.info.closes&&!String(S.notes||'').includes(a.info.closes)) S.notes=[S.notes,`Tender closes: ${a.info.closes}`].filter(Boolean).join('\n'); S.inboxFolder=a.folder||S.inboxFolder||'';
  const take=a.G.draw.filter(d=>d.take), rest=a.G.draw.filter(d=>!d.take);
  for(const d of take){const f=await d.read(); await openFiles([f]);
    // a combined set: keep only its fire services pages for take-off (the whole set is still filed under 招标资料)
    if(d.onlyFire&&d.s.firePages.length){const key=f.name+'|'+f.size, keep=new Set(d.s.firePages.map(x=>x+1)); const drop=S.pages.filter(p=>p.file===key&&!keep.has(p.num));
      drop.forEach(p=>{pdfPageRef.delete(p.id)}); S.pages=S.pages.filter(p=>!drop.includes(p)); if(drop.length) rest.push(d)}}
  if(S.pages.length&&!S.pages.some(p=>p.id===curPage)) curPage=S.pages[0].id;
  const by={}; for(const d of a.G.docs) (by[d.cat]=by[d.cat]||[]).push(d); if(rest.length) by.DWG=(by.DWG||[]).concat(rest); if(a.G.emails.length) by.EMAIL=(by.EMAIL||[]).concat(a.G.emails);
  for(const [cat,L] of Object.entries(by)) await addDocs(await Promise.all(L.map(x=>x.read())),cat);
  pagesInit(); await showPage(); changed(); await saveNow(); renderProjSel(); return curId}

async function review(list,src){if(IA.busy) return; IA.busy=true; const d=ftModal(tt('导入招标文件夹'),`<p id="ibSay" style="margin:0">${tt('正在读取文件…')}</p>`,[]); const say=t=>{const e=d.querySelector('#ibSay'); if(e) e.textContent=t};
  let A=[]; try{for(const f of list) A.push({...await analyse(f.folder,f.items,say),keys:f.keys,root:f.root})}catch(e){IA.busy=false; ftModal(tt('读取失败'),`<p>${html(e.message||e)}</p>`,[{t:tt('关闭')}]); return}
  IA.busy=false;
  const dd=ftModal(tt('导入招标文件夹'),`<p class="note" style="margin:0 0 8px">${tt('每个文件夹会建成一个新项目：消防图纸直接打开算量，其他文件放进“招标资料”。请核对下面的信息（可修改），文件夹里的文件不会被改动。')}</p>${reviewHTML(A)}`,
    [{t:tt('取消')},...(src==='inbox'?[{t:tt('忽略这些文件夹'),fn:()=>{A.forEach(a=>markSeen(a,'ignored')); chip()}}]:[]),
     {t:tt('导入'),cls:'primary',fn:async()=>{const box=$('#ftModal'); const picks=[...box.querySelectorAll('[data-ibi]')].map(el=>({a:A[+el.dataset.ibi],on:el.querySelector('[data-ibon]').checked,v:Object.fromEntries([...el.querySelectorAll('[data-ib]')].map(i=>[i.dataset.ib,i.value.trim()])),into:(el.querySelector('[data-ibinto]')||{}).value||''})).filter(x=>x.on);
       const prog=ftModal(tt('正在导入'),`<p id="ibProg" style="margin:0"></p>`,[]); let done=0, last=null;
       for(const x of picks){const e=prog.querySelector('#ibProg'); if(e) e.textContent=`${tt('正在导入')} ${x.v.name||x.a.folder}（${++done} / ${picks.length}）…`;
         try{last=await importOne(x.a,x.v,x.into); if(src==='inbox') markSeen(x.a,last)}catch(err){console.error(err); toast((x.v.name||x.a.folder)+'：'+(err.message||err))}}
       prog.close(); chip(); if(last){showTab(S.pages.some(p=>p.kind==='pdf')?'takeoff':'docs'); toast(`${tt('已导入')} ${done} ${tt('个项目')}`)}}}]);
  dd.style.width='min(1080px,96vw)'; dd.style.maxWidth='96vw'; dd.addEventListener('close',()=>{dd.style.width=''; dd.style.maxWidth=''},{once:true}); wireReview(dd,A)}

/* ---- desktop inbox: scan, header chip, settings ---- */
let fresh=[], lastScan=0;
// the inbox's tenders: each folder (split when it holds several projects), loose files in the inbox itself grouped by job code.
// key: what CFG.inboxSeen remembers (a folder, or each loose file so files added later are still offered)
function desktopTenders(r){const seen=CFG.inboxSeen||{}, out=[];
  for(const f of r.folders){const items=fromDesktop(f); if(!items.length) continue;
    if(!f.folder){const L=items.filter(i=>!seen['file:'+i.rel]); for(const g of FT_INBOX.groupLoose(L,'')) out.push({...g,root:true,keys:g.items.map(i=>'file:'+i.rel)}); continue}
    if(seen[f.folder]) continue;
    for(const g of FT_INBOX.splitTenders(f.folder,items)) if(!seen[g.folder]) out.push({...g,keys:[g.folder]})}
  return out}
const markSeen=(t,v)=>{CFG.inboxSeen=CFG.inboxSeen||{}; for(const k of t.keys||[t.folder]) CFG.inboxSeen[k]=v; saveCfg(); fresh=fresh.filter(f=>!(f.keys||[f.folder]).some(k=>(t.keys||[t.folder]).includes(k)))};
async function scan(manual){if(!desk()) return; const r=await root.firetake.inboxList().catch(()=>null); if(!r){fresh=[]; chip(); if(manual) toast(tt('还没有设置招标收件箱文件夹')); return}
  fresh=desktopTenders(r); chip(); lastScan=Date.now();
  if(manual){if(fresh.length) review(fresh,'inbox'); else toast(tt('没有新的招标文件夹'))}}
function chip(){let c=document.getElementById('inboxChip'); const st=document.getElementById('saveSt');
  if(!fresh.length){if(c) c.remove(); return}
  if(!c&&st){c=document.createElement('button'); c.id='inboxChip'; c.className='pill warn'; c.style.cursor='pointer'; c.style.border='0'; st.parentNode.insertBefore(c,st); c.onclick=()=>review(fresh,'inbox')}
  if(c){c.textContent=`📥 ${fresh.length} ${tt('个新招标')}`; c.title=fresh.map(f=>f.folder).join('\n')}}
async function renderSettings(el){if(!el) return; if(!desk()){el.innerHTML=`<p class="note" style="margin:0">${tt('浏览器版：在“项目总览”点“从文件夹导入招标”选择文件夹导入。')}</p>`; return}
  const d=await root.firetake.dirGet().catch(()=>({})); const dir=d&&d.inboxDir;
  el.innerHTML=`<p class="note" style="margin:0">${dir?`${tt('把下载的招标文件存到这个文件夹，每个招标一个子文件夹（可以直接放 .zip）：')}<br><b>${html(dir)}</b><br>${tt('软件启动或切回时自动发现新文件夹，核对后一键建成项目：项目信息、联系人、消防图纸和资料自动填好。文件夹里的文件不会被改动。')}`:tt('选一个文件夹，以后把下载的招标文件存进去（每个招标一个子文件夹），软件会自动建项目、填联系人、加载消防图纸和资料。')}</p>
    <div class="toolbar"><button type="button" class="btn sm primary" id="ibChoose">${dir?tt('更换文件夹…'):tt('选择文件夹…')}</button>${dir?`<button type="button" class="btn sm" id="ibOpen">${tt('打开文件夹')}</button><button type="button" class="btn sm" id="ibScan">${tt('立即扫描')}</button><button type="button" class="btn sm ghost" id="ibClear">${tt('停用')}</button>`:''}</div>`;
  el.querySelector('#ibChoose').onclick=async()=>{if(await root.firetake.dirChoose('inbox')){renderSettings(el); scan(false)}};
  const o=el.querySelector('#ibOpen'); if(o) o.onclick=()=>root.firetake.dirOpen('inbox');
  const s=el.querySelector('#ibScan'); if(s) s.onclick=()=>scan(true);
  const c=el.querySelector('#ibClear'); if(c) c.onclick=async()=>{await root.firetake.dirClear('inbox'); fresh=[]; chip(); renderSettings(el)}}
// any edition: pick a folder
function pickFolder(){const inp=document.createElement('input'); inp.type='file'; inp.multiple=true; inp.webkitdirectory=true; inp.style.display='none'; document.body.appendChild(inp);
  inp.onchange=()=>{const L=[...inp.files]; inp.remove(); if(L.length) review(fromInput(L),'pick')}; inp.click()}
IA.scan=scan; IA.review=review; IA.reviewHTML=reviewHTML; IA.desktopTenders=desktopTenders; IA.analyse=analyse; IA.importOne=importOne; IA.fromInput=fromInput; IA.renderSettings=renderSettings; IA.pickFolder=pickFolder;
(async()=>{for(let i=0;i<100&&!(typeof DB!=='undefined'&&DB.ok&&typeof S!=='undefined'&&S);i++) await new Promise(r=>setTimeout(r,200)); scan(false)})();
root.addEventListener('focus',()=>{if(Date.now()-lastScan>60000) scan(false)});
})(typeof window!=='undefined'?window:globalThis);
