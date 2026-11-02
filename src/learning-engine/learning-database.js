/* FireTake Learning Engine · learning database

   The knowledge base is DERIVED: each ingested project leaves one contributions file (data/knowledge/projects/<id>/contributions.json);
   the libraries are rebuilt from all of them. Re-ingesting a project replaces what it said; removing its folder removes it. Every
   library entry keeps `sources` {projectId: count}, so recognition can leave a project's own knowledge out when that project is scored.

     symbol-library.json      geoHash → device, with a vector template, seen-with texts, statuses, consultants, sources
     consultant-library.json  consultant → aliases, e-mail domains, logo hashes, symbols, abbreviations, conventions
     network-library.json     circuit patterns, device mix per circuit type, transitions, devices / metres per loop
     room-library.json        room type → area, expected devices (presence, per room, per 100 m²)
     pricing-library.json     item → supply / install / rate statistics, labour ratio
     knowledge-index.json     projects, when, what each contributed

   Pure functions (rebuild, forRecognition) run anywhere; load / save / saveProject use Node's fs. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const SCHEMA='firetake.knowledge/1';
const FILES={symbols:'symbol-library.json',consultants:'consultant-library.json',networks:'network-library.json',rooms:'room-library.json',pricing:'pricing-library.json',index:'knowledge-index.json'};
const ckey=s=>String(s||'').toLowerCase().replace(/\b(pty|ltd|limited|inc|llc|co)\b/g,'').replace(/[^a-z0-9]/g,'');
const r2=v=>Math.round(v*100)/100;
const stat=a=>{const v=a.filter(x=>typeof x==='number'&&isFinite(x)); if(!v.length) return null; const s=v.slice().sort((x,y)=>x-y); return {n:v.length,avg:r2(v.reduce((p,q)=>p+q,0)/v.length),min:r2(s[0]),max:r2(s[s.length-1]),median:r2(s[s.length>>1])}};
const add=(o,k,n=1)=>{o[k]=(o[k]||0)+n; return o};
// a library file is {schema, updated, entries}; an empty in-memory base holds the bare arrays (careful: arrays have an .entries() method)
const entries=x=>Array.isArray(x)?x:(x&&x.schema?x.entries:x)||[];
const empty=()=>({symbols:[],consultants:[],networks:{patterns:[],circuits:[],transitions:{},loops:null},rooms:[],pricing:[],index:{projects:[]}});

// contributions: [{projectId, at, consultant, symbols:[], abbreviations:{}, conventions:{}, consultantKeys:{}, networks:[], rooms:[], pricing:{items:[],totals:[]}}]
function rebuild(contribs){const L=empty(); const at=new Date().toISOString();
  // symbols: one entry per geoHash + device; a geoHash two consultants use for different devices stays two entries (consultant decides)
  const S=new Map();
  for(const c of contribs) for(const s of c.symbols||[]){const k=s.geoHash+'|'+s.deviceType; let e=S.get(k);
    if(!e) S.set(k,e={geoHash:s.geoHash,deviceType:s.deviceType,code:s.code||null,fingerprint:s.fingerprint,desc:s.desc,template:s.template||null,text:{},status:{},consultants:{},sources:{},n:0,confSum:0});
    e.n+=s.n||1; e.confSum+=(s.confidence||1)*(s.n||1); add(e.sources,c.projectId,s.n||1); if(c.consultant) add(e.consultants,c.consultant,s.n||1);
    for(const t of s.text||[]) add(e.text,t); for(const st of s.status||[]) add(e.status,st);
    if(!e.template&&s.template) e.template=s.template}
  // a geoHash read as two devices by the same consultant is ambiguous: both entries keep their counts, agreement says how far to trust each
  const byHash={}; for(const e of S.values()) (byHash[e.geoHash]=byHash[e.geoHash]||[]).push(e);
  L.symbols=[...S.values()].map(e=>{const tot=byHash[e.geoHash].reduce((a,x)=>a+x.n,0); const {confSum,...o}=e; return {...o,confidence:r2(confSum/e.n),agreement:r2(e.n/tot)}}).sort((a,b)=>b.n-a.n);
  // consultants
  const C=new Map();
  for(const c of contribs){if(!c.consultant) continue; const k=ckey(c.consultant); let e=C.get(k);
    if(!e) C.set(k,e={consultant:c.consultant,key:k,aliases:{},emailDomains:{},logoHashes:{},symbols:{},abbreviations:{},conventions:{statusColours:{},legendStyle:{},scales:{},lineTypes:{}},projects:[]});
    e.projects.push(c.projectId); const K=c.consultantKeys||{};
    for(const a of K.aliases||[]) add(e.aliases,a); for(const d of K.emailDomains||[]) add(e.emailDomains,d); if(K.logoHash) add(e.logoHashes,K.logoHash);
    for(const s of c.symbols||[]){const sk=s.geoHash+'|'+s.deviceType; e.symbols[sk]=e.symbols[sk]||{geoHash:s.geoHash,deviceType:s.deviceType,n:0,sources:{}}; e.symbols[sk].n+=s.n||1; add(e.symbols[sk].sources,c.projectId,s.n||1)}
    for(const [ab,t] of Object.entries(c.abbreviations||{})){e.abbreviations[ab]=e.abbreviations[ab]||{}; add(e.abbreviations[ab],t)}
    const cv=c.conventions||{}; for(const [col,st] of Object.entries(cv.statusColours||{})){e.conventions.statusColours[col]=e.conventions.statusColours[col]||{}; add(e.conventions.statusColours[col],st)}
    if(cv.legendStyle) add(e.conventions.legendStyle,cv.legendStyle); for(const sc of cv.scales||[]) add(e.conventions.scales,String(sc));
    for(const lt of cv.lineTypes||[]){const lk=lt.cls+'|'+lt.stroke+'|'+(lt.dashed?1:0); e.conventions.lineTypes[lk]=e.conventions.lineTypes[lk]||{...lt,n:0}; e.conventions.lineTypes[lk].n++}}
  L.consultants=[...C.values()].map(e=>({...e,symbols:Object.values(e.symbols)}));
  // networks
  const P={}, circ={}, loopsDev=[], loopsM=[], mPerDev=[];
  for(const c of contribs) for(const n of c.networks||[]){if(n.pattern){P[n.pattern]=P[n.pattern]||{pattern:n.pattern,n:0,sources:{}}; P[n.pattern].n++; add(P[n.pattern].sources,c.projectId)}
    const ck=n.circuit||'cable'; circ[ck]=circ[ck]||{circuit:ck,desc:{},mix:{},loops:0,sources:{}}; circ[ck].loops++; add(circ[ck].sources,c.projectId); if(n.desc) add(circ[ck].desc,n.desc);
    for(const [t,v] of Object.entries(n.mix||{})) add(circ[ck].mix,t,v);
    for(let i=1;i<(n.sequence||[]).length;i++) add(L.networks.transitions,n.sequence[i-1]+'->'+n.sequence[i]);
    if(n.devices) loopsDev.push(n.devices); if(n.length_m) loopsM.push(n.length_m); if(n.devices&&n.length_m) mPerDev.push(n.length_m/n.devices)}
  L.networks.patterns=Object.values(P).sort((a,b)=>b.n-a.n).slice(0,500);
  L.networks.circuits=Object.values(circ).map(c=>{const tot=Object.values(c.mix).reduce((a,b)=>a+b,0)||1; return {...c,share:Object.fromEntries(Object.entries(c.mix).map(([t,v])=>[t,r2(v/tot)]))}});
  L.networks.loops={devices:stat(loopsDev),length_m:stat(loopsM),metresPerDevice:stat(mPerDev)};
  // rooms
  const R={};
  for(const c of contribs) for(const rm of c.rooms||[]){const k=rm.type||rm.name; const e=R[k]=R[k]||{room:k,n:0,areas:[],withDevice:{},count:{},sources:{}}; e.n++; add(e.sources,c.projectId); if(rm.area_m2) e.areas.push(rm.area_m2);
    for(const [t,v] of Object.entries(rm.devices||{})){add(e.count,t,v); add(e.withDevice,t)}}
  L.rooms=Object.values(R).map(e=>{const area=stat(e.areas), totA=e.areas.reduce((a,b)=>a+b,0);
    return {room:e.room,n:e.n,area_m2:area,expectedDevices:Object.keys(e.count).map(t=>({device:t,presence:r2(e.withDevice[t]/e.n),perRoom:r2(e.count[t]/e.n),per100m2:totA?r2(100*e.count[t]/totA):null})).sort((a,b)=>b.presence-a.presence),sources:e.sources}}).sort((a,b)=>b.n-a.n);
  // pricing
  const PR={};
  for(const c of contribs) for(const it of (c.pricing&&c.pricing.items)||[]){const k=it.key||('desc:'+String(it.description).toUpperCase().replace(/\s+/g,' ').slice(0,60)); const e=PR[k]=PR[k]||{item:k,names:{},unit:{},supply:[],install:[],rate:[],labourRatio:[],qty:[],sources:{}};
    add(e.names,it.description); if(it.unit) add(e.unit,it.unit); add(e.sources,c.projectId);
    for(const f of ['supply','install','rate','qty']) if(typeof it[f]==='number') e[f].push(it[f]);
    if(typeof it.supply==='number'&&typeof it.install==='number'&&it.supply+it.install>0) e.labourRatio.push(it.install/(it.supply+it.install))}
  L.pricing=Object.values(PR).map(e=>({item:e.item,name:Object.entries(e.names).sort((a,b)=>b[1]-a[1])[0][0],unit:(Object.entries(e.unit).sort((a,b)=>b[1]-a[1])[0]||[null])[0],
    supplyCost:stat(e.supply),installCost:stat(e.install),rate:stat(e.rate),labourRatio:stat(e.labourRatio),qty:stat(e.qty),sources:e.sources}));
  L.index={projects:contribs.map(c=>({projectId:c.projectId,at:c.at,consultant:c.consultant||null,devices:(c.summary&&c.summary.devices)||0,symbols:(c.symbols||[]).length,networks:(c.networks||[]).length,rooms:(c.rooms||[]).length,pricingItems:((c.pricing&&c.pricing.items)||[]).length})),updated:at};
  for(const k of Object.keys(FILES)) if(k!=='index') L[k]={schema:SCHEMA,updated:at,entries:L[k]};
  L.index={schema:SCHEMA,...L.index};
  return L}

// what recognition reads, for one consultant; excludeProject leaves that project's own knowledge out (no scoring on what it taught)
function forRecognition(L,opts){opts=opts||{}; const ex=opts.excludeProject||null; const ent=entries;
  const keep=e=>!ex||!e.sources||Object.keys(e.sources).some(p=>p!==ex);
  const k=ckey(opts.consultant); const cons=ent(L.consultants).find(c=>c.key===k||Object.keys(c.aliases||{}).some(a=>ckey(a)===k)||Object.keys(c.emailDomains||{}).some(d=>ckey(d)===k))||null;
  const consSyms=new Set(cons?cons.symbols.filter(keep).map(s=>s.geoHash+'|'+s.deviceType):[]);
  const symbols=ent(L.symbols).filter(keep).map(e=>({...e,consultantMatch:consSyms.has(e.geoHash+'|'+e.deviceType)}));
  // templates: this consultant's symbols first; other consultants' only when they agree (≥ 0.8) and were seen at least 3 times
  const templates=symbols.filter(e=>e.template&&(e.consultantMatch||(e.agreement>=.8&&e.n>=3))).slice(0,120);
  const library=symbols.filter(e=>e.agreement>=.6).map(e=>({geoHash:e.geoHash,device:e.deviceType,consultant:e.consultantMatch?(cons&&cons.consultant):null,n:e.n}));
  const abbrev={}; if(cons) for(const [ab,c] of Object.entries(cons.abbreviations||{})){const [t,n]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; if(n>=1) abbrev[ab]=t}
  const statusColours={}; if(cons) for(const [col,c] of Object.entries(cons.conventions.statusColours||{})) statusColours[col]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
  const net=L.networks&&L.networks.schema?L.networks.entries:(L.networks||{}); const networkPriors=(net.circuits||[]).filter(c=>c.share&&keep(c)).map(c=>({circuit:c.circuit,share:c.share,loops:c.loops}));
  return {consultant:cons?cons.consultant:(opts.consultant||null),consultantKnown:!!cons,library,templates,abbrev,statusColours,networkPriors,rooms:ent(L.rooms),symbols:symbols.length}}

/* ---- Node file IO ---- */
function fsx(){return typeof require==='function'?{fs:require('fs'),path:require('path')}:null}
function load(dir){const X=fsx(); const L=empty(); if(!X||!X.fs.existsSync(dir)) return L;
  for(const [k,f] of Object.entries(FILES)){const p=X.path.join(dir,f); if(X.fs.existsSync(p)) L[k]=JSON.parse(X.fs.readFileSync(p,'utf8'))}
  return L}
function contributions(dir){const X=fsx(), pd=X.path.join(dir,'projects'); if(!X.fs.existsSync(pd)) return [];
  return X.fs.readdirSync(pd).sort().map(id=>X.path.join(pd,id,'contributions.json')).filter(f=>X.fs.existsSync(f)).map(f=>JSON.parse(X.fs.readFileSync(f,'utf8')))}
function saveProject(dir,graph,contrib){const X=fsx(), pd=X.path.join(dir,'projects',String(contrib.projectId).replace(/[^\w.-]+/g,'_')); X.fs.mkdirSync(pd,{recursive:true});
  X.fs.writeFileSync(X.path.join(pd,'knowledge-graph.json'),JSON.stringify(graph,null,1)); X.fs.writeFileSync(X.path.join(pd,'contributions.json'),JSON.stringify(contrib)); return pd}
// rebuild every library from the project contributions and write them (plus knowledge.bundle.js, which the app loads)
function save(dir){const X=fsx(); X.fs.mkdirSync(dir,{recursive:true}); const L=rebuild(contributions(dir));
  for(const [k,f] of Object.entries(FILES)) X.fs.writeFileSync(X.path.join(dir,f),JSON.stringify(L[k],null,1));
  X.fs.writeFileSync(X.path.join(dir,'knowledge.bundle.js'),'/* generated by the Learning Engine (npm run learn) — the knowledge base the app reads at recognition */\nwindow.FT_KNOWLEDGE='+JSON.stringify(L)+';\n');
  return L}

NS.db={SCHEMA,FILES,entries,ckey,rebuild,forRecognition,load,save,saveProject,contributions,empty};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.db;
})(typeof window!=='undefined'?window:globalThis);
