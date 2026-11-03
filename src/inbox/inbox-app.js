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
function fromDesktop(f){return f.files.filter(x=>x.size<300*1024*1024).map(x=>({path:x.rel.slice(f.folder.length+1),name:x.name,size:x.size,read:async()=>new File([await root.firetake.inboxRead(x.rel)],x.name)}))}
function fromInput(list){const G=new Map(); for(const f of list){const rp=f.webkitRelativePath||f.name, parts=rp.split('/'); const folder=parts.length>1?parts[0]:'';
    if(!G.has(folder)) G.set(folder,[]); G.get(folder).push({path:parts.slice(parts.length>1?1:0).join('/'),name:f.name,size:f.size,read:async()=>f})}
  // a parent folder holding several tender folders: one tender per second-level folder
  const out=[]; for(const [folder,items] of G){const sub=new Set(items.map(i=>i.path.includes('/')?i.path.split('/')[0]:'')); const loose=items.filter(i=>!i.path.includes('/'));
    if(sub.size>1&&!loose.length&&items.length>4) for(const s of sub) out.push({folder:s,items:items.filter(i=>i.path.startsWith(s+'/')).map(i=>({...i,path:i.path.slice(s.length+1)}))});
    else out.push({folder,items})}
  return out}
async function expandZips(items){const out=[];
  for(const it of items){if(FT_INBOX.classify(it.path).kind!=='zip'){out.push(it); continue}
    try{const z=await FT_LEARN.pricing.unzip(new Uint8Array(await (await it.read()).arrayBuffer()),inflate);
      for(const [name,data] of Object.entries(z)){if(!data||name.endsWith('/')||/__MACOSX\//.test(name)) continue; const base=name.split('/').pop(); out.push({path:it.path.replace(/\.zip$/i,'')+'/'+name,name:base,size:data.length,read:async()=>new File([data],base)})}}
    catch(e){out.push({...it,zipErr:String(e.message||e)})}}
  return out}
async function firstPageText(file){try{const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise; const pg=await doc.getPage(1); const vp=pg.getViewport({scale:1});
  const tc=await pg.getTextContent(); const t=tc.items.map(i=>i.str).join(' '); const r={text:t,w:vp.width,h:vp.height,pages:doc.numPages}; doc.destroy(); return r}catch(e){return {text:'',w:0,h:0}}}

// read and sort one folder
async function analyse(folder,items0,say){const items=await expandZips(items0); const G={fire:[],dwg:[],docs:[],emails:[],skipped:[]}; const texts=[], emails=[];
  let n=0; for(const it of items){const c=FT_INBOX.classify(it.path); n++; if(say&&n%5===0) say(`${folder}：${n} / ${items.length}`);
    if(c.kind==='skip'||c.kind==='zip'){G.skipped.push(it); continue}
    if(c.kind==='email'){G.emails.push(it); if(/\.eml$/i.test(it.name)){try{const m=FT_INBOX.parseEml(await (await it.read()).text()); if(m) emails.push(m)}catch(e){}} continue}
    if(c.kind==='fire'){G.fire.push(it); if(texts.length<3){const p=await firstPageText(await it.read()); texts.push(p.text)} continue}
    if(c.kind==='dwg'){G.dwg.push(it); continue}
    if(c.kind==='doc'){G.docs.push({...it,cat:c.cat}); continue}
    // a PDF the name does not explain: its first page decides
    const p=await firstPageText(await it.read());
    if(FT_INBOX.pageLooksFire(p.text)){G.fire.push(it); if(texts.length<3) texts.push(p.text)}
    else if(p.w>p.h&&p.w>1100) G.dwg.push(it); else G.docs.push({...it,cat:'TENDER'})}
  const own=String((typeof co==='function'&&co().email)||'').split('@')[1]||'';
  const info=FT_INBOX.extract({folder,emails,texts,ownDomain:own});
  return {folder,info,G,count:items.length}}

function reviewHTML(A){const row=(k,label,v)=>`<label class="field">${tt(label)}<input data-ib="${k}" value="${html(v||'')}"></label>`;
  return A.map((a,i)=>`<div class="card" style="margin:0 0 10px;padding:12px" data-ibi="${i}"><label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" data-ibon checked> ${html(a.folder||tt('（所选文件）'))} <span class="note" style="font-weight:400">${a.count} ${tt('个文件')}</span></label>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px">${row('name','项目名称',a.info.name)}${row('client','客户',a.info.client)}${row('contact','联系人',a.info.contact)}${row('email','邮箱',a.info.email)}${row('phone','电话',a.info.phone)}${row('site','项目地址',a.info.site)}</div>
    ${a.info.closes?`<p class="note" style="margin:4px 0 0">${tt('截止')}：<b>${html(a.info.closes)}</b></p>`:''}
    <p class="note" style="margin:6px 0 0">${tt('消防图纸')} <b>${a.G.fire.length}</b>${a.G.fire.length?'：'+a.G.fire.slice(0,6).map(x=>html(x.name)).join('、')+(a.G.fire.length>6?' …':''):` <span style="color:var(--warn)">${tt('（没找到消防图纸，可导入后手动打开）')}</span>`}
      · ${tt('其他图纸')} ${a.G.dwg.length} · ${tt('资料')} ${a.G.docs.length} · ${tt('邮件')} ${a.G.emails.length}</p></div>`).join('')}

async function importOne(a,v){await newProject(); S.name=v.name||a.folder||S.name; S.client=v.client||''; S.contact=v.contact||''; S.email=v.email||''; S.phone=v.phone||''; S.site=v.site||'';
  if(a.info.closes) S.notes=[S.notes,`Tender closes: ${a.info.closes}`].filter(Boolean).join('\n'); S.inboxFolder=a.folder||'';
  if(a.G.fire.length) await openFiles(await Promise.all(a.G.fire.map(x=>x.read())));
  const by={}; for(const d of a.G.docs) (by[d.cat]=by[d.cat]||[]).push(d); if(a.G.dwg.length) by.DWG=(by.DWG||[]).concat(a.G.dwg); if(a.G.emails.length) by.EMAIL=(by.EMAIL||[]).concat(a.G.emails);
  for(const [cat,L] of Object.entries(by)) await addDocs(await Promise.all(L.map(x=>x.read())),cat);
  changed(); await saveNow(); renderProjSel(); return curId}

async function review(list,src){if(IA.busy) return; IA.busy=true; const d=ftModal(tt('导入招标文件夹'),`<p id="ibSay" style="margin:0">${tt('正在读取文件…')}</p>`,[]); const say=t=>{const e=d.querySelector('#ibSay'); if(e) e.textContent=t};
  let A=[]; try{for(const f of list) A.push(await analyse(f.folder,f.items,say))}catch(e){IA.busy=false; ftModal(tt('读取失败'),`<p>${html(e.message||e)}</p>`,[{t:tt('关闭')}]); return}
  IA.busy=false;
  const dd=ftModal(tt('导入招标文件夹'),`<p class="note" style="margin:0 0 8px">${tt('每个文件夹会建成一个新项目：消防图纸直接打开算量，其他文件放进“招标资料”。请核对下面的信息（可修改），文件夹里的文件不会被改动。')}</p>${reviewHTML(A)}`,
    [{t:tt('取消')},...(src==='inbox'?[{t:tt('忽略这些文件夹'),fn:()=>{CFG.inboxSeen=CFG.inboxSeen||{}; A.forEach(a=>CFG.inboxSeen[a.folder]='ignored'); saveCfg(); fresh=fresh.filter(f=>!A.some(a=>a.folder===f.folder)); chip()}}]:[]),
     {t:tt('导入'),cls:'primary',fn:async()=>{const box=$('#ftModal'); const picks=[...box.querySelectorAll('[data-ibi]')].map(el=>({a:A[+el.dataset.ibi],on:el.querySelector('[data-ibon]').checked,v:Object.fromEntries([...el.querySelectorAll('[data-ib]')].map(i=>[i.dataset.ib,i.value.trim()]))})).filter(x=>x.on);
       const prog=ftModal(tt('正在导入'),`<p id="ibProg" style="margin:0"></p>`,[]); let done=0, last=null;
       for(const x of picks){const e=prog.querySelector('#ibProg'); if(e) e.textContent=`${tt('正在导入')} ${x.v.name||x.a.folder}（${++done} / ${picks.length}）…`;
         try{last=await importOne(x.a,x.v); if(src==='inbox'){CFG.inboxSeen=CFG.inboxSeen||{}; CFG.inboxSeen[x.a.folder]=last; saveCfg(); fresh=fresh.filter(f=>f.folder!==x.a.folder)}}catch(err){console.error(err); toast((x.v.name||x.a.folder)+'：'+(err.message||err))}}
       prog.close(); chip(); if(last){showTab(S.pages.some(p=>p.kind==='pdf')?'takeoff':'docs'); toast(`${tt('已导入')} ${done} ${tt('个项目')}`)}}}]);
  dd.style.width='min(980px,96vw)'; dd.addEventListener('close',()=>{dd.style.width=''},{once:true})}

/* ---- desktop inbox: scan, header chip, settings ---- */
let fresh=[], lastScan=0;
async function scan(manual){if(!desk()) return; const r=await root.firetake.inboxList().catch(()=>null); if(!r){fresh=[]; chip(); if(manual) toast(tt('还没有设置招标收件箱文件夹')); return}
  const seen=CFG.inboxSeen||{}; fresh=r.folders.filter(f=>!seen[f.folder]&&f.files.length); chip(); lastScan=Date.now();
  if(manual){if(fresh.length) review(fresh.map(f=>({folder:f.folder,items:fromDesktop(f)})),'inbox'); else toast(tt('没有新的招标文件夹'))}}
function chip(){let c=document.getElementById('inboxChip'); const st=document.getElementById('saveSt');
  if(!fresh.length){if(c) c.remove(); return}
  if(!c&&st){c=document.createElement('button'); c.id='inboxChip'; c.className='pill warn'; c.style.cursor='pointer'; c.style.border='0'; st.parentNode.insertBefore(c,st); c.onclick=()=>review(fresh.map(f=>({folder:f.folder,items:fromDesktop(f)})),'inbox')}
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
IA.scan=scan; IA.review=review; IA.analyse=analyse; IA.importOne=importOne; IA.fromInput=fromInput; IA.renderSettings=renderSettings; IA.pickFolder=pickFolder;
(async()=>{for(let i=0;i<100&&!(typeof DB!=='undefined'&&DB.ok&&typeof S!=='undefined'&&S);i++) await new Promise(r=>setTimeout(r,200)); scan(false)})();
root.addEventListener('focus',()=>{if(Date.now()-lastScan>60000) scan(false)});
})(typeof window!=='undefined'?window:globalThis);
