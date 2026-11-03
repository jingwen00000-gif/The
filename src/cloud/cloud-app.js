/* Strix FireTake · cloud accounts in the app (desktop edition)
   设置 → 云账号: Client IDs, sign in / out per provider, daily backup to the cloud, restore a cloud backup.
   项目总览 → 从云盘导入招标 (browse Google Drive / OneDrive / Dropbox, import a folder like a local tender folder)
            → 从邮箱导入招标 (recent tender e-mails in Gmail / Outlook: the e-mail and its attachments become a tender).
   The work happens in the desktop shell (src/cloud/cloud-main.js); the browser edition shows how to get the desktop edition. */
(function(root){
'use strict';
const tt=s=>typeof T==='function'?T(s):s, html=s=>typeof esc==='function'?esc(s):String(s);
const C=()=>root.firetake&&root.firetake.cloud;
const CA=root.FT_CLOUD_APP={};
const P=[{id:'google',name:'Google',what:'Google Drive · Gmail',color:'#4285F4'},{id:'microsoft',name:'Microsoft',what:'OneDrive · Outlook',color:'#0078D4'},{id:'dropbox',name:'Dropbox',what:'Dropbox',color:'#0061FE'}];
const pname=id=>(P.find(p=>p.id===id)||{}).name||id;
const fmtSize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.round(n/1024)+' KB':(n||0)+' B';
async function ask(fn){const r=await fn(); if(!r||!r.ok) throw new Error((r&&r.error)||tt('云账号操作失败')); return r.value}
CA.status=()=>ask(()=>C().status());

/* ---- settings ---- */
async function renderSettings(el){if(!el) return;
  if(!C()){el.innerHTML=`<p class="note" style="margin:0">${tt('登录 Google / Microsoft / Dropbox 需要桌面版。')}</p>`; return}
  let st; try{st=await CA.status()}catch(e){el.innerHTML=`<p class="note" style="color:var(--warn)">${html(e.message)}</p>`; return}
  const cfg=st.config||{}, acc=Object.fromEntries(st.accounts.map(a=>[a.provider,a]));
  el.innerHTML=`<p class="note" style="margin:0 0 8px">${tt('登录后可以：每日备份同时存到云盘、从云盘导入招标文件夹、从邮箱导入招标邮件和附件。登录在浏览器里完成，软件不会看到你的密码。')}
      <a href="#" id="clGuide">${tt('第一次使用：如何获取 Client ID')}</a></p>
    ${P.map(p=>{const a=acc[p.id]||{}, c=cfg[p.id]||{};
      return `<div class="card" style="margin:0 0 8px;padding:10px 12px" data-clp="${p.id}"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b style="color:${p.color}">${p.name}</b><span class="note">${p.what}</span><span style="flex:1"></span>
        ${a.signedIn?`<span class="pill ok">✓ ${html(a.email||tt('已登录'))}</span><button type="button" class="btn sm" data-clout>${tt('退出登录')}</button>`
          :`<button type="button" class="btn sm primary" data-clin ${c.clientId?'':'disabled'}>${tt('登录')}</button>`}</div>
        <details style="margin-top:6px" ${c.clientId?'':'open'}><summary class="note" style="cursor:pointer">${tt('应用设置')}${c.clientId?' · Client ID ✓':''}</summary>
        <div style="display:grid;grid-template-columns:repeat(${p.id==='dropbox'?1:2},minmax(0,1fr));gap:6px;margin-top:6px">
          <label class="field">Client ID<input data-clk="clientId" value="${html(c.clientId||'')}" spellcheck="false"></label>
          ${p.id==='google'?`<label class="field">Client secret<input data-clk="clientSecret" type="password" value="${html(c.clientSecret||'')}" spellcheck="false"></label>`:''}
          ${p.id==='microsoft'?`<label class="field">${tt('租户（公司账号填 Tenant ID，个人和公司都用填 common）')}<input data-clk="tenant" value="${html(c.tenant||'common')}" spellcheck="false"></label>`:''}
        </div><p class="note" style="margin:4px 0 0">${tt('回调地址（在开发者后台登记）')}：<code>${html(st.redirect[p.id])}</code></p></details></div>`}).join('')}
    <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="clBk" ${st.backup?'checked':''}> ${tt('每日自动备份同时上传到已登录的云盘（Strix FireTake/Backups）')}</label>
    ${st.last?`<p class="note" style="margin:0">${tt('最近一次云端备份')}：${new Date(st.last.at).toLocaleString()} · ${st.last.running?tt('正在上传…'):st.last.results.map(r=>`${pname(r.provider)} ${r.ok?'✓':'✗ '+html(r.error||'')}`).join(' · ')}</p>`:''}
    <div class="toolbar"><button type="button" class="btn sm" id="clBkNow" ${st.accounts.some(a=>a.signedIn)?'':'disabled'}>${tt('立即备份到云盘')}</button><button type="button" class="btn sm" id="clBkList" ${st.accounts.some(a=>a.signedIn)?'':'disabled'}>${tt('从云端备份恢复…')}</button></div>
    <div class="note" id="clMsg"></div>`;
  const msg=t=>{const m=el.querySelector('#clMsg'); if(m) m.textContent=t};
  const save=async()=>{const c={}; el.querySelectorAll('[data-clp]').forEach(card=>{const o={}; card.querySelectorAll('[data-clk]').forEach(i=>{if(i.value.trim()) o[i.dataset.clk]=i.value.trim()}); c[card.dataset.clp]=o}); await ask(()=>C().config(c))};
  el.querySelectorAll('[data-clk]').forEach(i=>i.onchange=async()=>{await save(); renderSettings(el)});
  el.querySelectorAll('[data-clin]').forEach(b=>b.onclick=async()=>{const p=b.closest('[data-clp]').dataset.clp; await save(); b.disabled=true; msg(tt('已在浏览器打开登录页面，请在浏览器里完成登录…'));
    try{const r=await ask(()=>C().signIn(p)); toast(`${pname(p)}：${tt('已登录')} ${r.email||''}`)}catch(e){msg(`${pname(p)}：${e.message}`)} renderSettings(el)});
  el.querySelectorAll('[data-clout]').forEach(b=>b.onclick=async()=>{const p=b.closest('[data-clp]').dataset.clp; await ask(()=>C().signOut(p)); renderSettings(el)});
  el.querySelector('#clBk').onchange=e=>ask(()=>C().config(null,e.target.checked));
  el.querySelector('#clGuide').onclick=e=>{e.preventDefault(); guide()};
  el.querySelector('#clBkNow').onclick=async()=>{msg(tt('正在备份到云盘…')); try{await backupZip(`FireTake-backup-${todayISO()}.ftbak`);
      // with the daily upload on, the shell uploads the new backup itself: wait for it instead of uploading twice
      if(st.backup){for(let i=0;i<3600;i++){await new Promise(r=>setTimeout(r,1000)); const s2=await CA.status(); if(s2.last&&!s2.last.running){msg(s2.last.results.map(x=>`${pname(x.provider)} ${x.ok?'✓':'✗ '+x.error}`).join(' · ')); return}} return}
      const r=await ask(()=>C().backupNow(`FireTake-backup-${todayISO()}.ftbak`,+CFG.backupKeep||14));
      msg(r.map(x=>`${pname(x.provider)} ${x.ok?'✓':'✗ '+x.error}`).join(' · ')||tt('没有已登录的云盘'))}catch(e){msg(e.message)}};
  el.querySelector('#clBkList').onclick=()=>backups()}
CA.renderSettings=renderSettings;

function guide(){ftModal(tt('如何获取 Client ID'),`<div style="max-height:60vh;overflow:auto">
  <p class="note">${tt('每家只需要设置一次，由公司管理员在开发者后台注册一个应用（免费），把 Client ID 填进上面的“应用设置”。三家的回调地址都是本机地址，登录时软件临时在本机接收结果。')}</p>
  <h4>Google（Google Drive · Gmail）</h4><ol class="note">
   <li>${tt('打开 console.cloud.google.com → 新建项目。')}</li><li>${tt('“API 和服务 → 库”里启用 Google Drive API 和 Gmail API。')}</li>
   <li>${tt('“OAuth 同意屏幕”：Google Workspace 公司选“内部”；个人 Gmail 选“外部”，并把使用的人加为测试用户。')}</li>
   <li>${tt('“凭据 → 创建凭据 → OAuth 客户端 ID”，应用类型选“桌面应用”。')}</li><li>${tt('把 Client ID 和 Client secret 填进软件。')}</li></ol>
  <h4>Microsoft（OneDrive · Outlook）</h4><ol class="note">
   <li>${tt('打开 entra.microsoft.com → 应用注册 → 新注册。')}</li><li>${tt('“支持的账户类型”：只给本公司用选“仅此组织目录”；也要登录个人 Outlook / OneDrive 选“任何组织目录 + 个人 Microsoft 帐户”。')}</li>
   <li>${tt('“重定向 URI”平台选“公共客户端/本机（移动和桌面）”，填 http://localhost:53682/callback')}</li>
   <li>${tt('“API 权限”加 Microsoft Graph 委托权限：User.Read、Files.ReadWrite、Mail.Read、offline_access。')}</li><li>${tt('把“应用程序(客户端) ID”填进 Client ID；只给本公司用时把“目录(租户) ID”填进租户。')}</li></ol>
  <h4>Dropbox</h4><ol class="note">
   <li>${tt('打开 dropbox.com/developers/apps → Create app → Scoped access → Full Dropbox。')}</li>
   <li>${tt('Permissions 里勾选 account_info.read、files.metadata.read、files.content.read、files.content.write，点 Submit。')}</li>
   <li>${tt('Settings 里的 Redirect URIs 加 http://localhost:53682/callback')}</li><li>${tt('把 App key 填进 Client ID（不需要 App secret）。')}</li></ol>
  <p class="note">${tt('登录得到的授权只保存在这台电脑上，并用 Windows 的加密保护；“退出登录”会删除它。')}</p></div>`,[{t:tt('关闭')}])}
CA.guide=guide;

/* ---- cloud backups ---- */
async function backups(){let L; try{L=await ask(()=>C().backups())}catch(e){return toast(e.message)}
  const ok=L.filter(f=>!f.error).sort((a,b)=>String(b.name).localeCompare(a.name)), bad=L.filter(f=>f.error);
  const d=ftModal(tt('从云端备份恢复'),`${ok.length?`<div class="tablewrap" style="max-height:50vh;overflow:auto"><table class="t"><thead><tr><th>${tt('备份')}</th><th>${tt('云盘')}</th><th class="r">${tt('大小')}</th><th></th></tr></thead><tbody>
    ${ok.map((f,i)=>`<tr><td>${html(f.name)}</td><td>${pname(f.provider)}</td><td class="r">${fmtSize(f.size)}</td><td><button type="button" class="btn sm" data-clr="${i}">${tt('恢复')}</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="note">${tt('云盘里还没有备份。')}</p>`}
    ${bad.map(b=>`<p class="note" style="color:var(--warn)">${pname(b.provider)}：${html(b.error)}</p>`).join('')}<p class="note">${tt('恢复会把备份里的项目写回本机，同 ID 的项目会被覆盖。')}</p>`,[{t:tt('关闭')}]);
  d.querySelectorAll('[data-clr]').forEach(b=>b.onclick=async()=>{const f=ok[+b.dataset.clr]; if(b.dataset.c!=='1'){b.dataset.c='1'; b.textContent=tt('确认恢复？再点一次'); return}
    b.disabled=true; b.textContent=tt('正在下载…'); try{const u=await ask(()=>C().download(f.provider,f.id)); d.close(); await restoreBackup(new File([u],f.name))}catch(e){b.textContent=e.message}})}
CA.backups=backups;

/* ---- import a tender folder from cloud storage ---- */
async function signedIn(kind){const st=await CA.status(); return st.accounts.filter(a=>a.signedIn&&(kind!=='mail'||a.mail))}
function needSignIn(kind){ftModal(tt(kind==='mail'?'从邮箱导入招标':'从云盘导入招标'),`<p>${tt(kind==='mail'?'先在“设置 → 云账号”登录 Google 或 Microsoft 账号。':'先在“设置 → 云账号”登录 Google、Microsoft 或 Dropbox 账号。')}</p>`,
  [{t:tt('关闭')},{t:tt('打开设置'),cls:'primary',fn:()=>{openSettings(); setTimeout(()=>{const f=document.getElementById('cloudSet'); if(f) f.scrollIntoView({block:'center'})},300)}}])}
async function pickCloudFolder(){if(!C()) return toast(tt('登录 Google / Microsoft / Dropbox 需要桌面版。'));
  let acc; try{acc=await signedIn('storage')}catch(e){return toast(e.message)} if(!acc.length) return needSignIn('storage');
  let prov=acc[0].provider, trail=[{id:'',name:tt('根目录')}], items=[], err='';
  const load=async()=>{err=''; items=[]; draw(true); try{items=await ask(()=>C().list(prov,trail[trail.length-1].id))}catch(e){err=e.message} draw(false)};
  const draw=busy=>{const here=trail[trail.length-1];
    const d=ftModal(tt('从云盘导入招标'),`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${acc.map(a=>`<button type="button" class="btn sm ${a.provider===prov?'primary':''}" data-clprov="${a.provider}">${pname(a.provider)}${a.email?' · '+html(a.email):''}</button>`).join('')}</div>
      <div class="note" style="margin-bottom:6px">${trail.map((t,i)=>`<a href="#" data-cltr="${i}">${html(t.name)}</a>`).join(' / ')}</div>
      ${busy?`<p class="note">${tt('正在读取…')}</p>`:err?`<p class="note" style="color:var(--warn)">${html(err)}</p>`:`<div class="tablewrap" style="max-height:52vh;overflow:auto"><table class="t"><tbody>
        ${items.length?items.map((f,i)=>`<tr>${f.folder?`<td><a href="#" data-clf="${i}">📁 ${html(f.name)}</a></td><td class="note">${tt('文件夹')}</td>`:`<td class="note">${html(f.name)}</td><td class="note r">${fmtSize(f.size)}</td>`}</tr>`).join(''):`<tr><td class="note">${tt('这个文件夹是空的')}</td></tr>`}</tbody></table></div>`}
      <p class="note" style="margin:6px 0 0">${tt('打开招标项目所在的文件夹，再点“导入这个文件夹”：整个文件夹算一个项目，和本机“从文件夹导入招标”一样。')}</p>`,
      [{t:tt('取消')},{t:`${tt('导入这个文件夹')}${here.id?'：'+here.name:''}`,cls:'primary',fn:()=>{if(!here.id) return toast(tt('请先打开一个招标项目文件夹')); importCloud(prov,here)}}]);
    d.style.width='min(860px,96vw)'; d.style.maxWidth='96vw';
    d.querySelectorAll('[data-clprov]').forEach(b=>b.onclick=()=>{prov=b.dataset.clprov; trail=[{id:'',name:tt('根目录')}]; load()});
    d.querySelectorAll('[data-cltr]').forEach(a=>a.onclick=e=>{e.preventDefault(); trail=trail.slice(0,+a.dataset.cltr+1); load()});
    d.querySelectorAll('[data-clf]').forEach(a=>a.onclick=e=>{e.preventDefault(); const f=items[+a.dataset.clf]; trail.push({id:f.id,name:f.name}); load()})};
  load()}
async function importCloud(prov,folder){const d=ftModal(tt('从云盘导入招标'),`<p>${tt('正在列出文件…')}</p>`,[]);
  let L; try{L=await ask(()=>C().walk(prov,folder.id))}catch(e){d.close(); return toast(e.message)} d.close();
  const items=L.filter(f=>f.size<300*1024*1024).map(f=>({path:f.rel,name:f.name,size:f.size,read:async()=>new File([await ask(()=>C().download(prov,f.id))],f.name)}));
  if(!items.length) return toast(tt('这个文件夹里没有文件'));
  FT_INBOX_APP.review([{folder:folder.name,items}],'cloud')}
CA.pickCloudFolder=pickCloudFolder;

/* ---- import tender e-mails ---- */
async function pickMail(){if(!C()) return toast(tt('登录 Google / Microsoft / Dropbox 需要桌面版。'));
  let acc; try{acc=await signedIn('mail')}catch(e){return toast(e.message)} if(!acc.length) return needSignIn('mail');
  let prov=acc[0].provider, q='', list=[], err='', busy=true, pick=new Set();
  const load=async()=>{busy=true; err=''; draw(); try{list=await ask(()=>C().mailSearch(prov,q))}catch(e){err=e.message; list=[]} busy=false; pick=new Set(); draw()};
  const draw=()=>{const d=ftModal(tt('从邮箱导入招标'),`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">${acc.map(a=>`<button type="button" class="btn sm ${a.provider===prov?'primary':''}" data-clprov="${a.provider}">${a.provider==='google'?'Gmail':'Outlook'}${a.email?' · '+html(a.email):''}</button>`).join('')}
      <input id="clQ" placeholder="${tt('搜索（留空 = 最近 60 天带附件的招标邮件）')}" value="${html(q)}" style="flex:1;min-width:200px"><button type="button" class="btn sm" id="clGo">${tt('搜索')}</button></div>
      ${busy?`<p class="note">${tt('正在读取邮件…')}</p>`:err?`<p class="note" style="color:var(--warn)">${html(err)}</p>`:list.length?`<div class="tablewrap" style="max-height:52vh;overflow:auto"><table class="t"><thead><tr><th></th><th>${tt('主题')}</th><th>${tt('发件人')}</th><th>${tt('日期')}</th></tr></thead><tbody>
        ${list.map((m,i)=>`<tr><td><input type="checkbox" data-clm="${i}" ${pick.has(i)?'checked':''}></td><td><b>${html(m.subject||'—')}</b><div class="note">${html(String(m.snippet||'').slice(0,120))}</div></td><td class="note">${html(m.from.name||m.from.email)}</td><td class="note" style="white-space:nowrap">${html(String(m.date).replace(/\s*[+-]\d{4}.*$/,'').replace(/T.*$/,''))}</td></tr>`).join('')}</tbody></table></div>`:`<p class="note">${tt('没有找到带附件的招标邮件。')}</p>`}
      <p class="note" style="margin:6px 0 0">${tt('每封选中的邮件建成一个项目：邮件正文用来填客户和联系人，附件（图纸、规范、zip）按“从文件夹导入招标”的方式分类。')}</p>`,
      [{t:tt('取消')},{t:tt('导入选中的邮件'),cls:'primary',fn:()=>importMail(prov,[...pick].map(i=>list[i]))}]);
    d.style.width='min(980px,96vw)'; d.style.maxWidth='96vw';
    d.querySelectorAll('[data-clprov]').forEach(b=>b.onclick=()=>{prov=b.dataset.clprov; load()});
    const go=()=>{q=d.querySelector('#clQ').value.trim(); load()}; d.querySelector('#clGo').onclick=go; d.querySelector('#clQ').onkeydown=e=>{if(e.key==='Enter') go()};
    d.querySelectorAll('[data-clm]').forEach(c=>c.onchange=()=>{c.checked?pick.add(+c.dataset.clm):pick.delete(+c.dataset.clm)})};
  load()}
async function importMail(prov,msgs){if(!msgs.length) return toast(tt('先勾选要导入的邮件'));
  const d=ftModal(tt('从邮箱导入招标'),`<p id="clSay">${tt('正在读取邮件…')}</p>`,[]); const out=[];
  try{for(const m of msgs){const say=d.querySelector('#clSay'); if(say) say.textContent=`${tt('正在读取邮件…')} ${m.subject}`;
      const full=await ask(()=>C().mailMessage(prov,m.id)); const safe=s=>String(s||'').replace(/[\\/:*?"<>|]+/g,' ').trim()||'email';
      const items=[{path:safe(full.subject).slice(0,80)+'.eml',name:safe(full.subject).slice(0,80)+'.eml',size:full.eml.length,read:async()=>new File([full.eml],safe(full.subject).slice(0,80)+'.eml',{type:'message/rfc822'})}]
        .concat(full.attachments.filter(a=>a.size<300*1024*1024).map(a=>({path:a.name,name:a.name,size:a.size,read:async()=>new File([await ask(()=>C().mailAttachment(prov,m.id,a.id))],a.name)})));
      out.push({folder:FT_INBOX.cleanSubject(full.subject)||full.subject||tt('招标邮件'),items})}}
  catch(e){d.close(); return toast(e.message)}
  d.close(); FT_INBOX_APP.review(out,'mail')}
CA.pickMail=pickMail;
})(typeof window!=='undefined'?window:globalThis);
