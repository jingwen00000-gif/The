/* FireTake Learning Engine · consultant extractor

   Who drew the set, from (strongest first): the job's metadata, a consultant the knowledge base already knows (by name / alias,
   e-mail domain or logo), the title block's e-mail domain, a company line (… ENGINEERING / CONSULTING / PTY LTD), the logo.
   The logo is vector line work: its fingerprint (LOGO_xxxxx) is the coloured objects in the title block — kinds, colours and
   proportions — so a consultant whose name is only drawn, never typed, is still recognised once a job has named it. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const ckey=s=>String(s||'').toLowerCase().replace(/\b(pty|ltd|limited|inc|llc|co)\b/g,'').replace(/[^a-z0-9]/g,'');
const GENERIC=/^(gmail|outlook|hotmail|bigpond|yahoo|icloud|live|me|optusnet|iinet)$/i;
const COMPANY=/^([A-Z][A-Za-z0-9&.,' -]{2,48}?\b(ENGINEERING|ENGINEERS|CONSULTING|CONSULTANTS|CONSULTANCY|PTY\.? ?LTD|GROUP|ASSOCIATES|PARTNERS|DESIGN))\b/i;
const ROLE=/^(CLIENT|OWNER|ARCHITECT|BUILDER|CONTRACTOR|PROJECT|PROJECT MANAGER|CONSULTANT|ENGINEER|STRUCTURAL ENGINEER|SERVICES ENGINEER|DESIGNED BY|DESIGNER)$/i;
const FIRM_END='(?:\\s+(?:ENGINEERING|ENGINEERS|CONSULTING|CONSULTANTS|CONSULTANCY|PTY\\.? ?LTD\\.?|GROUP|ASSOCIATES|PARTNERS))+';
const OWNER=new RegExp("(?:property of|prepared by|designed by|copyright of|©)\\s+((?:[A-Z][A-Za-z0-9&.'-]*\\s+){0,4}?[A-Z][A-Za-z0-9&.'-]*"+FIRM_END+")",'i');
const NOT_CONSULTANT=/FIRE SERVICES|FIRE PROTECTION SERVICES|ARCHITECT|BUILDER|CLIENT|PROJECT/i;
const fnv=s=>{let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619)} return (h>>>0).toString(36).toUpperCase().padStart(7,'0').slice(-5)};
const titleCase=s=>String(s).toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\bPty\b/,'Pty').replace(/\bLtd\b/,'Ltd');
const grey=c=>{if(!c) return true; const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16); return Math.max(r,g,b)-Math.min(r,g,b)<40};

function titleZone(m,FVE){const z=FVE&&FVE.titleBlock?FVE.titleBlock(m):[]; return z.length?z:[[m.page.w*.78,0,m.page.w,m.page.h],[0,m.page.h*.85,m.page.w,m.page.h]]}
const inZ=(z,x,y)=>z.some(b=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]);
// the logo: coloured (not black / grey / white) objects in the title block
function logoHash(m,FVE){const z=titleZone(m,FVE); const objs=m.objects.filter(o=>!o.synthetic&&inZ(z,(o.bb[0]+o.bb[2])/2,(o.bb[1]+o.bb[3])/2)&&!grey(o.stroke||o.fill));
  if(objs.length<3) return null; const bb=objs.reduce((u,o)=>[Math.min(u[0],o.bb[0]),Math.min(u[1],o.bb[1]),Math.max(u[2],o.bb[2]),Math.max(u[3],o.bb[3])],[Infinity,Infinity,-Infinity,-Infinity]);
  const S=Math.max(bb[2]-bb[0],bb[3]-bb[1])||1, k={}; for(const o of objs){const key=o.k+':'+(o.stroke||o.fill)+':'+Math.round(4*Math.max(o.bb[2]-o.bb[0],o.bb[3]-o.bb[1])/S); k[key]=(k[key]||0)+1}
  return 'LOGO_'+fnv(Object.entries(k).sort().map(([a,b])=>a+'='+Math.min(b,9)).join('|'))}

// known: consultant-library entries [{consultant, aliases:{}, emailDomains:{}, logoHashes:{}}]
function extract(models,opts){opts=opts||{}; const FVE=opts.FVE||root.FVE; const known=opts.known||[]; const votes={}, ev=[], domains=new Set(), names={}; let logo=null;
  const vote=(name,w,src,val)=>{if(!name) return; const k=ckey(name); if(!k) return; votes[k]=(votes[k]||0)+w; names[k]=names[k]||name; ev.push({src,value:val||name,w})};
  if(opts.metadata&&opts.metadata.consultant) vote(opts.metadata.consultant,10,'metadata');
  for(const m of models){const z=titleZone(m,FVE); const tb=m.texts.filter(t=>inZ(z,t.cx,t.cy)); const TL=(m.lines||[]).filter(l=>inZ(z,l.x,l.cy));
    // role columns: words under CLIENT / ARCHITECT / BUILDER / PROJECT are not the consultant; words under CONSULTANT / ENGINEER are
    const labels=TL.filter(l=>ROLE.test(String(l.s).trim())); const roleOf=l=>{const lab=labels.filter(r=>r!==l&&Math.abs(r.x-l.x)<30&&r.cy<l.cy&&l.cy-r.cy<60).sort((a,b)=>b.cy-a.cy)[0]; return lab?String(lab.s).trim().toUpperCase():null};
    const lines=[];
    for(const l of TL){if(labels.includes(l)) continue; const r=roleOf(l); if(r&&/CONSULTANT|ENGINEER|DESIGN/.test(r)){vote(titleCase(String(l.s).trim()),6,'consultant field',l.s); continue} if(r&&/CLIENT|OWNER|ARCHITECT|BUILDER|CONTRACTOR|PROJECT|MANAGER/.test(r)) continue; lines.push(l.s)}
    // sentences wrapped over lines: '… remains the property of Millimetre' / 'Consulting Engineers. Reproduction …'
    const cols={}; TL.forEach(l=>{const k=Math.round(l.x/20); (cols[k]=cols[k]||[]).push(l)});
    for(const c of Object.values(cols)){const para=c.sort((a,b)=>a.cy-b.cy).map(l=>l.s).join(' ').replace(/\s+/g,' '); const cp=para.match(OWNER); if(cp&&!NOT_CONSULTANT.test(cp[1])) vote(titleCase(cp[1].trim()),5,'copyright / prepared by',cp[0])}
    for(const s of lines){const e=String(s).match(/@([a-z0-9-]+)\.[a-z.]+/i); if(e&&!GENERIC.test(e[1])) domains.add(e[1].toLowerCase());
      const c=String(s).trim().match(COMPANY); if(c&&!NOT_CONSULTANT.test(c[1])) vote(titleCase(c[1]),2,'company line',c[1])
      for(const K of known){for(const a of [K.consultant,...Object.keys(K.aliases||{})]) if(a&&ckey(a).length>3&&ckey(s).includes(ckey(a))) vote(K.consultant,4,'known name',s)}}
    const lh=logoHash(m,FVE); if(lh) logo=logo||lh}
  for(const d of domains){const K=known.find(k=>Object.keys(k.emailDomains||{}).includes(d)); if(K) vote(K.consultant,5,'known e-mail domain',d);
    else {const match=Object.keys(names).find(k=>k.startsWith(d)||d.startsWith(k.slice(0,Math.max(4,d.length-2)))||k.includes(d)); if(match) vote(names[match],3,'e-mail domain',d); else vote(d.charAt(0).toUpperCase()+d.slice(1),3,'e-mail domain',d)}}
  if(logo){const K=known.find(k=>Object.keys(k.logoHashes||{}).includes(logo)); if(K) vote(K.consultant,5,'known logo',logo)}
  // the same firm under two spellings (company line, e-mail domain): the longer name absorbs the shorter key it starts with
  const keys=Object.keys(votes).sort((a,b)=>b.length-a.length); for(const a of keys) for(const b of keys) if(a!==b&&votes[b]!=null&&votes[a]!=null&&a.startsWith(b)){votes[a]+=votes[b]; delete votes[b]}
  const best=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
  const consultant=best?names[best[0]]:null, K=consultant?known.find(k=>ckey(k.consultant)===ckey(consultant)):null;
  return {consultant:K?K.consultant:consultant,key:consultant?ckey(K?K.consultant:consultant):null,known:!!K,score:best?best[1]:0,evidence:ev,emailDomains:[...domains],logoHash:logo,
    aliases:[...new Set(Object.values(names).filter(n=>consultant&&n!==consultant))]}}

NS.consultant={extract,logoHash,ckey};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.consultant;
})(typeof window!=='undefined'?window:globalThis);
