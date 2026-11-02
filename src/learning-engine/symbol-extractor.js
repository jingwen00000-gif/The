/* FireTake Learning Engine · symbol knowledge extractor

   Every count markup the estimator left is a device the original drawing shows. Markups of one kind and colour are one class
   (the estimator's colour for smoke detectors, …); what a class counts is read from, in order:
     1. the job's markup-map.json (the estimator's own key)                                          confidence 1.0
     2. the markups' own words ('Speaker', 'SD', subject 'Smoke Detector')                           0.95
     3. what the original's legend says is under them (FVE + MSME run on the original)              share of agreeing markups
   Then, under each markup, the original's geometry is cut out; objects that recur under most markups of the class are the symbol
   (a cable passing one of them is not). Each distinct symbol becomes a library entry: geoHash, fingerprint, descriptor, a vector
   template (the app's own segments when given, so it matches plans exactly), the texts seen inside it, statuses, count.
   A plain outline with only a tag inside (a circle with 'SD') is not a symbol: it becomes the consultant's abbreviation instead. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const hyp=Math.hypot;
const CODE={smoke:'SD',heat:'HD',mcp:'MCP',fip:'FIP',speaker:'SPK',spk_surf:'SPK',horn:'HN',sounder:'VAD',relay:'IO',wip:'WIP',cs_smoke:'CSD',duct_probe:'DSD',door_mag:'DH',flowsw:'FS',
  spk_pend:'SP',spk_up:'SU',spk_side:'SW',spk_semi:'SS',spk_conc:'SC',spk_space:'SCS',hosereel:'FHR',hydrant:'FH',ext_abe:'EXT',ext_co2:'CO2',blanket:'FB'};
const ckey=c=>String(c||'').replace(/^#/,'').toLowerCase();

function classOf(a){return a.src+':'+a.kind+'#'+(a.colour||'none')}
// markup-map.json: {"classes": {"annotation:Circle#ff00ff": "smoke"}} or the per-page form {"pages": {"3": {"Square#ff0000": "smoke"}}}
// an entry is a device type, or {type, status} (count tables: the same colour can be 'Concealed head' and 'Concealed head R', told apart
// by the group total Bluebeam writes into each markup: key kind#colour|contents)
function mapEntry(map,a){if(!map) return null; if(map.classes){const t=map.classes[classOf(a)]||map.classes[a.kind+'#'+a.colour]; if(t) return t}
  const pg=map.pages&&map.pages[String(a.page)]; if(!pg) return null; return pg[a.kind+'#'+a.colour+'|'+String(a.contents||'').trim()]||pg[a.kind+'#'+a.colour]||null}
function mapType(map,a){const e=mapEntry(map,a); return e&&typeof e==='object'?e.type:e}
function mapStatus(map,a){const e=mapEntry(map,a); return e&&typeof e==='object'?e.status||null:null}
function wordType(s,FVE,D){const u=String(s||'').trim(); if(!u||/^[\d\s.,#xX×]+$/.test(u)) return null; /* a number is a count, not a name */ const ct=FVE.classifyDesc(u); if(ct.type) return ct.type;
  const tok=FVE.tagToken(u); if(tok){if(D&&D.tagType&&D.tagType[tok]) return D.tagType[tok]; const r=FVE.TAG_RULES.find(r=>r.tag.test(tok)); if(r) return r.type} return null}

function extract(models,diff,ctx){const FVE=ctx.FVE||root.FVE, FP=(ctx.MSME||root.FVE_MSME).fingerprint; const D=ctx.D||{symbols:[],tagType:{}}, dets=ctx.dets||[];
  const adds=diff.additions.filter(a=>a.size<=80); const classes=new Map();
  for(const a of adds){const k=classOf(a); let c=classes.get(k); if(!c) classes.set(k,c={key:k,src:a.src,kind:a.kind,colour:a.colour,items:[],words:{}}); c.items.push(a); for(const w of [a.contents,a.subject]) if(w) c.words[w]=(c.words[w]||0)+1}
  const pageOf=i=>models[i]&&models[i].page.id;
  // 3) the original's own reading under each markup
  const detAt=a=>{const pid=pageOf(a.page), r=Math.max(8,a.size*.75); let best=null, bd=Infinity; for(const d of dets){if(d.page!==pid) continue; const dd=hyp(d.x-a.c[0],d.y-a.c[1]); if(dd<r&&dd<bd){bd=dd; best=d}} return best};
  for(const c of classes.values()){
    // the estimator's key decides markup by markup (one colour can mean smoke on the dry sheet and sprinkler on the wet one);
    // markups the key does not cover are not counts
    if(ctx.markupMap){c.items.forEach(a=>{a.mtype=mapType(ctx.markupMap,a); a.mstatus=mapStatus(ctx.markupMap,a)}); const mt=c.items.map(a=>a.mtype).filter(Boolean); if(mt.length){c.type=mode(mt); c.how='markup-map'; c.confidence=1; c.perItem=true; continue} if(!ctx.markupMap.fromCountTables){c.type=null; c.how='not in markup-map'; continue}
      /* a group the count tables do not list (the estimator left it out of the summary): named like a job without a key, from its words or the symbols under it */}
    const ws=Object.entries(c.words).sort((a,b)=>b[1]-a[1]); const wt=ws.map(([w])=>wordType(w,FVE,D)).find(Boolean); if(wt){c.type=wt; c.how='markup text'; c.confidence=.95; continue}
    const under=c.items.map(detAt).filter(Boolean).map(d=>d.type); if(under.length){const t=mode(under), share=under.filter(x=>x===t).length/c.items.length; if(share>=.6){c.type=t; c.how='legend under markups'; c.confidence=Math.round(share*100)/100; continue}}
    // one colour can count different devices on different sheets (red: smoke detectors on the dry sheet, sprinklers on the wet one):
    // name it sheet by sheet when each sheet agrees on its own
    {const pages=[...new Set(c.items.map(a=>a.page))], per={}; let ok=0;
      for(const pg of pages){const it=c.items.filter(a=>a.page===pg), u=it.map(detAt).filter(Boolean).map(d=>d.type); if(!u.length) continue; const t=mode(u), sh=u.filter(x=>x===t).length/it.length; if(sh>=.6){per[pg]={t,sh}; ok+=it.length}}
      if(Object.keys(per).length&&ok>=c.items.length*.6){c.items.forEach(a=>a.mtype=per[a.page]?per[a.page].t:null); c.perItem=true; c.type=mode(Object.values(per).map(x=>x.t)); c.how='legend under markups, per sheet';
        c.perPage=Object.fromEntries(Object.entries(per).map(([k,v])=>[k,v.t])); c.confidence=Math.round(100*Object.values(per).reduce((a,v)=>a+v.sh,0)/Object.keys(per).length)/100; continue}}
    c.type=null; c.how='unknown'}
  // devices: the answer, snapped to the symbol the original drawing has there
  const devices=[];
  // a tick sits beside its symbol (often 20–30 pt off for a 27 pt tick): the nearest symbol of the markup's own family within 1.3 tick
  // sizes that no other tick has taken
  const taken=new Set(), snapAt=(a,t)=>{const pid=pageOf(a.page), r=Math.max(12,a.size*1.3); let best=null, bd=Infinity;
    for(const d of dets){if(d.page!==pid||taken.has(d)||!(d.type===t||family(d.type)===family(t))) continue; const dd=hyp(d.x-a.c[0],d.y-a.c[1]); if(dd<r&&dd<bd){bd=dd; best=d}} return best};
  for(const c of classes.values()) if(c.type) for(const a of c.items){let t=c.perItem?a.mtype:c.type; if(!t) continue; const d=snapAt(a,t)||detAt(a); if(d) taken.add(d);
    // a family in the key ('sprinkler') takes the exact type the drawing's legend shows under the markup (pendent, sidewall …)
    const ok=d&&(d.type===t||family(d.type)===t); if(ok) t=d.type;
    const x=ok?d.x:a.c[0], y=ok?d.y:a.c[1];
    if(devices.some(o=>o.page===a.page&&family(o.type)===family(t)&&hyp(o.x-x,o.y-y)<3)) continue;
    devices.push({page:a.page,type:t,x:Math.round(x*100)/100,y:Math.round(y*100)/100,status:a.mstatus||(ok?d.status||null:null),cls:c.key,grp:a.kind+'#'+(a.colour||'none')+'|'+String(a.contents||'').trim(),mx:Math.round(a.c[0]*100)/100,my:Math.round(a.c[1]*100)/100,box:ok?[d.x-d.w/2,d.y-d.h/2,d.x+d.w/2,d.y+d.h/2]:a.bb})}
  // labels the estimator wrote next to devices (SD-01): device IDs, and a vote for what a tag means to this estimator / consultant
  const abbrev={}; for(const l of diff.labels){const near=devices.filter(d=>d.page===l.page).sort((p,q)=>hyp(p.x-l.x,p.y-l.y)-hyp(q.x-l.x,q.y-l.y))[0]; if(near&&hyp(near.x-l.x,near.y-l.y)<40&&l.token&&l.token.length<=6){near.label=l.text; (abbrev[l.token]=abbrev[l.token]||{})[near.type]=(abbrev[l.token][near.type]||0)+1}}
  // symbols: the geometry under each device, kept where it recurs across the class
  // strokes in a pipe / cable colour of the legend are runs passing the device, not the device
  const lineCols=new Set((D.lineTypes||[]).map(l=>l.stroke).filter(Boolean));
  const cut=d=>{const m=models[d.page]; const b=d.box, s=Math.max(b[2]-b[0],b[3]-b[1],4), e=s*.25, c=[d.x,d.y];
    const objs=m.index.search(b[0]-e,b[1]-e,b[2]+e,b[3]+e).filter(o=>!o.synthetic&&!((o.k==='line'||o.k==='polyline')&&lineCols.has(o.stroke))&&o.stroke!=='ffffff'&&!(!o.stroke&&o.fill==='ffffff')&&(o.closed||o.len<s*2.5)&&o.bb[0]>=b[0]-e&&o.bb[2]<=b[2]+e&&o.bb[1]>=b[1]-e&&o.bb[3]<=b[3]+e);
    const texts=m.texts.filter(t=>t.cx>=b[0]-e&&t.cx<=b[2]+e&&t.cy>=b[1]-e&&t.cy<=b[3]+e).map(t=>String(t.s).trim()).filter(Boolean);
    return {objs,texts,c,s}};
  const sig=(o,s)=>o.k+'|'+(o.stroke||'')+'|'+(o.fill||'')+'|'+Math.round(10*Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])/s);
  const symbols=[], byType={};
  for(const d of devices) (byType[d.type]=byType[d.type]||[]).push(d);
  const trace=[];
  for(const [type,ds] of Object.entries(byType)){const cuts=ds.map(d=>({d,...cut(d)})).filter(x=>x.objs.length); trace.push({type,devices:ds.length,cuts:cuts.length,objs:cuts.slice(0,3).map(x=>x.objs.map(o=>o.k+':'+o.stroke+':'+Math.round(Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])*10)/10).join(' ')),box:ds.slice(0,2).map(d=>d.box.map(v=>Math.round(v)))});
    // group by geometry first (one device type can have several symbols: a legend symbol and a tag-only one)
    // what recurs under this device type's markups (≥ 35 % of them) is symbol; a pipe, a tag or a wall caught in a few cuts is not
    const tcnt={}; cuts.forEach(x=>{new Set(x.objs.map(o=>sig(o,x.s))).forEach(k=>tcnt[k]=(tcnt[k]||0)+1)});
    cuts.forEach(x=>{const keep=x.objs.filter(o=>tcnt[sig(o,x.s)]>=Math.max(2,cuts.length*.35)); if(keep.length) x.objs=keep});
    const groups=new Map(); for(const x of cuts){const lite=x.objs.map(liteOf); const desc=FP.describe(lite), gh=FP.geoHash(desc); x.gh=gh; x.desc=desc; let g=groups.get(gh); if(!g) groups.set(gh,g=[]); g.push(x)}
    // at most three symbols per device type, each seen under at least 5 % of its markups
    const ranked=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length).filter(([,g],i)=>i<3&&(i===0||g.length>=Math.max(2,cuts.length*.05))); groups.clear(); ranked.forEach(([k,g])=>groups.set(k,g));
    const big=[...groups.values()].some(g=>g.length>=2);
    for(const [gh,g] of groups){if(big&&g.length<2) continue; // one-off cuts (a markup off its symbol) are not symbols
      // the symbol = signatures under at least 60 % of this group's devices (one-off passing lines dropped)
      const cnt={}; g.forEach(x=>{const seen=new Set(x.objs.map(o=>sig(o,x.s))); seen.forEach(k=>cnt[k]=(cnt[k]||0)+1)}); const core=new Set(Object.keys(cnt).filter(k=>cnt[k]>=g.length*.6));
      const rep=g.map(x=>({x,objs:x.objs.filter(o=>core.has(sig(o,x.s)))})).sort((a,b)=>b.objs.length-a.objs.length)[0]; if(!rep||!rep.objs.length) continue;
      const lite=rep.objs.map(liteOf), desc=FP.describe(lite), geoHash=FP.geoHash(desc);
      if(FVE.segments(rep.objs).length<3) continue; // a stroke or two is not a symbol
      const texts={}; g.forEach(x=>x.texts.forEach(t=>texts[t]=(texts[t]||0)+1)); const text=Object.keys(texts).filter(t=>texts[t]>=g.length*.5);
      const empty=!Object.values(desc.inner).some(v=>v>0)&&desc.ext<.3;
      if(empty){for(const t of text){const tok=FVE.tagToken(t); if(tok){(abbrev[tok]=abbrev[tok]||{})[type]=(abbrev[tok][type]||0)+g.length}} continue}
      const c=rep.x.c, bb=lite.reduce((u,o)=>[Math.min(u[0],o.bb[0]),Math.min(u[1],o.bb[1]),Math.max(u[2],o.bb[2]),Math.max(u[3],o.bb[3])],[Infinity,Infinity,-Infinity,-Infinity]);
      const cc=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2];
      const rel=lite.map(o=>({...o,bb:[o.bb[0]-cc[0],o.bb[1]-cc[1],o.bb[2]-cc[0],o.bb[3]-cc[1]],c:o.c?[o.c[0]-cc[0],o.c[1]-cc[1]]:undefined,pts:o.pts.map(p=>[+(p[0]-cc[0]).toFixed(3),+(p[1]-cc[1]).toFixed(3)])}));
      const segs=FVE.segments(rep.objs).map(s=>({a:[+(s.a[0]-cc[0]).toFixed(3),+(s.a[1]-cc[1]).toFixed(3)],b:[+(s.b[0]-cc[0]).toFixed(3),+(s.b[1]-cc[1]).toFixed(3)],L:+s.L.toFixed(3),c:s.col,col:s.col,f:s.f}));
      let vsegs=null; if(ctx.vectorsAt){const v=ctx.vectorsAt(rep.x.d.page,bb,rep.objs); if(v&&v.length>=3) vsegs=v.map(s=>({a:[+(s.a[0]-cc[0]).toFixed(3),+(s.a[1]-cc[1]).toFixed(3)],b:[+(s.b[0]-cc[0]).toFixed(3),+(s.b[1]-cc[1]).toFixed(3)],L:+s.L.toFixed(3),c:s.col,col:s.col,f:s.f?1:0}))}
      const key=rel.filter(o=>o.closed&&o.stroke&&(o.k==='circle'||o.k==='rect'||o.k==='polygon')).map(o=>({k:o.k,col:o.stroke,size:o.k==='circle'?o.r:Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])})).sort((a,b)=>b.size-a.size)[0]||null;
      const cls=classes.get(rep.x.d.cls);
      symbols.push({fingerprint:FP.fingerprint({device:type,geoHash,text:text.join(' ')}),geoHash,deviceType:type,code:CODE[type]||null,text,status:[...new Set(g.map(x=>x.d.status).filter(Boolean))],
        n:g.length,confidence:cls?cls.confidence||1:1,desc,template:{objs:rel,segs,vsegs,bb:[bb[0]-cc[0],bb[1]-cc[1],bb[2]-cc[0],bb[3]-cc[1]],cols:[...new Set(rel.map(o=>o.stroke||o.fill).filter(Boolean))],key,shapes:[...new Set(rel.map(o=>o.k))]}})}}
  const abbreviations={}; for(const [tok,c] of Object.entries(abbrev)) abbreviations[tok]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
  return {classes:[...classes.values()].map(c=>({key:c.key,src:c.src,kind:c.kind,colour:c.colour,type:c.type,how:c.how,perPage:c.perPage||null,confidence:c.confidence||0,n:c.items.length,words:Object.keys(c.words)})),
    devices:devices.map(({box,...d})=>d),symbols,abbreviations,trace,unknownClasses:[...classes.values()].filter(c=>!c.type).map(c=>c.key)}}
const family=t=>/^spk_(pend|up|side|semi|space|conc|duct)/.test(t)?'sprinkler':/^ext_/.test(t)?'extinguisher':/^(speaker|spk_surf|horn|proj_spk)$/.test(t)?'speaker':/^(smoke|cs_smoke|duct_probe)$/.test(t)?'smoke':t;
const liteOf=o=>({k:o.k,bb:o.bb,c:o.c,r:o.r,pts:o.pts,stroke:o.stroke,fill:o.fill,closed:o.closed,len:o.len,w:o.w});
function mode(a){const c={}; a.forEach(x=>c[x]=(c[x]||0)+1); return Object.entries(c).sort((p,q)=>q[1]-p[1])[0][0]}

NS.symbols={extract,CODE,classOf};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.symbols;
})(typeof window!=='undefined'?window:globalThis);
