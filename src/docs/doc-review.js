/* FireTake · document review: FER (fire engineering report) and fire services specification → items to act on

   Each item: {id, cat, topic, text, clause, page, rfi, line}
     cat    'note'  需要注意   performance solutions, departures from DtS, design criteria, commissioning / certification, warranties
            'incl'  包含       what the documents require of the fire services contractor (shall / provide / install …)
            'excl'  不包含     what someone else does (by others / by the builder / existing to remain / not in this contract)
            'rfi'   需澄清     what is unclear, open or conflicting (TBC, subject to, where required, or similar, conflicting editions)
     rfi    a question for the builder / engineer (cites the document and clause)
     line   a short line for the quote (Inclusions / Exclusions / Assumptions)

   rules(text, {name, kind})  built-in reading, no AI: statements split by clause numbers and sentences, kept when they concern fire
                              services, classified by wording. Works on any PDF / Word text the app can extract.
   aiPrompt(text, {...})      the prompt for Claude (same item shape), used when an API key is set; parseAI(json) → items */
(function(root){
'use strict';
const TOPICS=[ /* most specific first: a 'sprinklered building' mentions sprinklers in passing */
  ['Performance solution',/PERFORMANCE\s+SOLUTION|PERFORMANCE[- ]BASED|DEEMED[- ]TO[- ]SATISFY|\bDTS\b|DEPARTURE|ALTERNATIVE\s+SOLUTION|PERFORMANCE\s+REQUIREMENT|\b[CDE][PF]?\d\.\d+\b/],
  ['Hose reels',/HOSE\s*REEL|AS\s?2441/],
  ['Hydrants',/HYDRANT|AS\s?2419|BOOSTER|FIRE\s+BRIGADE\s+(CONNECTION|BOOSTER)|RING\s+MAIN/],
  ['Extinguishers',/EXTINGUISHER|FIRE\s+BLANKET|AS\s?2444/],
  ['Occupant warning',/EWIS|OCCUPANT\s+WARNING|SOUND\s+SYSTEM|SPEAKER|STROBE|SOUNDER|AS\s?1670\.4|\bWIP\b|WARDEN/],
  ['Detection & alarm',/DETECT|SMOKE\s+ALARM|\bFIP\b|FIRE\s+INDICATOR|FDCIE|AS\s?1670\.1|MANUAL\s+CALL|\bMCP\b|ASPIRAT|VESDA|ALARM\s+SIGNALLING|MONITORING/],
  ['Smoke control',/SMOKE\s+(EXHAUST|CONTROL|MANAGEMENT)|STAIR\s+PRESSURI|ZONE\s+PRESSURI|AS\s?\/?NZS\s?1668/],
  ['Pumps & water supply',/PUMP|\bTANK\b|WATER\s+SUPPLY|TOWN\s+MAIN|FLOW\s+TEST|PRESSURE\s+TEST|HYDRAULIC\s+CALC/],
  ['Emergency lighting & exits',/EMERGENCY\s+LIGHT|EXIT\s+SIGN|AS\s?\/?NZS\s?2293/],
  ['Passive fire',/PENETRATION|FIRE\s*STOP|\bFRL\b|FIRE[- ]RATED|FIRE\s+COLLAR|FIRE\s+DOOR|COMPARTMENT|SMOKE\s+SEAL/],
  ['Commissioning & handover',/COMMISSION|CERTIFICAT|AS\s?1851|MAINTENANCE|WARRANT|DEFECTS\s+LIABILITY|AS[- ]BUILT|HANDOVER|BLOCK\s+PLAN|LOGBOOK|O\s?&\s?M\s+MANUAL|TRAINING|ANNUAL\s+FIRE\s+SAFETY/],
  ['Sprinklers',/SPRINKLER|\bHEADS?\b|AS\s?2118|HAZARD\s+CLASS|\bOH\s?[1-4]\b|LIGHT\s+HAZARD|ORDINARY\s+HAZARD|K-?FACTOR|ESFR|DRENCHER|ALARM\s+VALVE|VALVE\s+SET/]];
const RX={
  rfi:/\b(TBC|TBA|TBD|TO\s+BE\s+(CONFIRMED|DETERMINED|ADVISED|AGREED|VERIFIED)|SUBJECT\s+TO\s+(CONFIRMATION|APPROVAL|FURTHER|DETAILED|REVIEW|FINAL)|TO\s+BE\s+CONFIRMED|(SHALL|IS|ARE|TO)\s+BE\s+CONFIRMED|BE\s+CONFIRMED\s+BY|WHERE\s+REQUIRED|IF\s+REQUIRED|AS\s+REQUIRED|WHERE\s+NECESSARY|IF\s+NECESSARY|OR\s+SIMILAR|OR\s+EQUIVALENT|PROVISIONAL|NOT\s+YET|UNKNOWN|NOT\s+KNOWN|UNCLEAR|DISCREPANC\w*|CONFLICT\w*|REFER\s+TO\s+(THE\s+)?(FIRE\s+ENGINEER|ENGINEER)|AT\s+THE\s+DISCRETION|MAY\s+BE\s+REQUIRED|IT\s+IS\s+ASSUMED|ASSUMED\s+THAT)\b/,
  excl:/\b(BY\s+OTHERS|BY\s+THE\s+(BUILDER|HEAD\s+CONTRACTOR|MAIN\s+CONTRACTOR|CLIENT|OWNER|PRINCIPAL|TENANT|ELECTRICAL|MECHANICAL|HYDRAULIC|LANDLORD)(\s+CONTRACTOR)?|BY\s+(ELECTRICAL|MECHANICAL|HYDRAULIC)\s+(CONTRACTOR|TRADE|SERVICES)|NOT\s+(PART\s+OF|INCLUDED|IN\s+(THE\s+)?SCOPE|REQUIRED)|EXCLUDED|OUTSIDE\s+(THE\s+)?SCOPE|SEPARATE\s+CONTRACT|EXISTING\s+[\w\s,/-]{0,40}\s+(TO\s+REMAIN|RETAINED|IS\s+TO\s+REMAIN)|NOMINATED\s+SUB|SUPPLIED\s+BY\s+(THE\s+)?(BUILDER|CLIENT|OWNER|OTHERS))\b/,
  note:/\b(PERFORMANCE\s+SOLUTION|DEPARTURE|IN\s+LIEU\s+OF|TRADE[- ]?OFF|DEEMED[- ]TO[- ]SATISFY|PERFORMANCE\s+REQUIREMENT|ALTERNATIVE\s+SOLUTION|HAZARD\s+CLASS|LIGHT\s+HAZARD|ORDINARY\s+HAZARD|HIGH\s+HAZARD|OH\s?[1-4]|FAST[- ]RESPONSE|QUICK[- ]RESPONSE|K-?FACTOR|FIRE\s+BRIGADE|FRNSW|FRV|QFES|MFB|FIRE\s+RESCUE|SPECIAL\s+REQUIREMENT|COMMISSION|CERTIFICAT|WARRANT|DEFECTS\s+LIABILITY|MAINTENANCE\s+PERIOD|AS\s?1851|FLOW\s+TEST|PEER\s+REVIEW|ESSENTIAL\s+SAFETY|FIRE\s+SAFETY\s+SCHEDULE|FIRE\s+SAFETY\s+MEASURE|TESTING)\b/,
  incl:/\b(SHALL|MUST|IS\s+REQUIRED|ARE\s+REQUIRED|TO\s+BE\s+(PROVIDED|INSTALLED|UPGRADED|EXTENDED|RELOCATED|MODIFIED|REPLACED)|PROVIDE|INSTALL|UPGRADE|EXTEND|RELOCATE|MODIFY|REPLACE|ALLOW\s+FOR)\b/};
const ST=/\bAS\s?\/?\s?(NZS\s?)?\d{4}(\.\d+)?(\s?[-:–]\s?\d{4})?/g;
const clean=s=>String(s).replace(/\s+/g,' ').trim();
const cut=(s,n)=>s.length>n?s.slice(0,n-1).replace(/\s+\S*$/,'')+'…':s;

// statements with their page and clause: '[Page 3]' markers from the app's text extraction; clause numbers at the start of a line
function statements(text){const out=[]; let page=null, clause=null, buf='', bufClause=null, bufPage=null, title=null;
  const flush=()=>{const t=clean(buf); if(t.length>=25) for(const s of t.split(/(?<=[.;])\s+(?=[A-Z(])/)){const u=clean(s); if(u.length>=25&&u.length<=700) out.push({text:u,clause:bufClause,page:bufPage,title})} buf=''};
  for(const raw of String(text||'').split(/\r?\n/)){const line=raw.trim(); const pm=line.match(/^\[Page (\d+)\]$/); if(pm){flush(); page=+pm[1]; continue}
    if(!line){flush(); continue}
    const cm=line.match(/^((?:\d{1,2}\.){1,4}\d{0,3}|\d{1,2}\.\d{1,2}[a-z]?|[A-Z]\d{1,2}(?:\.\d{1,2}){0,2}|\(?[a-z]\)|\(?[ivx]{1,4}\))\s+(.*)$/);
    if(cm){flush(); clause=cm[1].replace(/\.$/,'').replace(/[()]/g,''); bufClause=clause; bufPage=page; /* a short heading ('3.3 Sprinkler system') is the clause's title, not part of its first sentence */
      if(cm[2].length<60&&!/[.;:,]$/.test(cm[2])&&!/\b(SHALL|MUST|IS|ARE|BY)\b/i.test(cm[2])){title=cm[2]; buf=''} else {title=null; buf=cm[2]} continue}
    if(/^[•\-–·▪●]\s+/.test(line)){flush(); bufClause=clause; bufPage=page; buf=line.replace(/^[•\-–·▪●]\s+/,''); continue}
    if(!buf){bufClause=clause; bufPage=page}
    buf+=(buf?' ':'')+line; if(/[.:;]$/.test(line)&&buf.length>200) flush()}
  flush(); return out}

function topicOf(u){const t=TOPICS.find(([,re])=>re.test(u)); return t?t[0]:null}
const where=(o,name)=>[name?`“${name}”`:null,o.clause?`cl. ${o.clause}`:null,o.page?`p. ${o.page}`:null].filter(Boolean).join(', ');

function rules(text,opts){opts=opts||{}; const name=opts.name||'', items=[], seen=new Set(); let n=0;
  for(const st of statements(text)){const u=st.text.toUpperCase(); const topic=topicOf(u)||(st.title?topicOf(st.title.toUpperCase()):null); if(!topic) continue;
    let cat=RX.rfi.test(u)?'rfi':RX.excl.test(u)?'excl':RX.note.test(u)||topic==='Performance solution'?'note':RX.incl.test(u)?'incl':null; if(!cat) continue;
    const key=u.replace(/[^A-Z0-9]/g,'').slice(0,90); if(seen.has(key)) continue; seen.add(key);
    const short=cut(st.text,220), w=where(st,name);
    const rfi=cat==='rfi'?`Please clarify${w?' ('+w+')':''}: “${cut(st.text,260)}” — confirm the requirement and whether it is part of the fire services scope.`
      :cat==='excl'?`Please confirm this is excluded from the fire services scope${w?' ('+w+')':''}: “${cut(st.text,220)}”.`
      :`Please confirm${w?' ('+w+')':''}: “${cut(st.text,220)}”.`;
    const line=`${cut(st.text,180)}${st.clause?` (${name?name+' ':''}cl. ${st.clause})`:''}`;   /* the document's own words: 'by the mechanical contractor', 'not required' … */
    items.push({id:'r'+(++n),cat,topic,title:st.title||null,text:short,clause:st.clause,page:st.page,rfi,line,src:'rules',standards:[...new Set((st.text.match(ST)||[]).map(clean))]})}
  // most useful first: what needs clarifying, what someone else does, what to watch, what is required; at most 150
  const ord={rfi:0,excl:1,note:2,incl:3}; items.sort((a,b)=>ord[a.cat]-ord[b.cat]); return items.slice(0,150)}

function aiPrompt(text,o){o=o||{}; return `You are an experienced Australian fire services estimator (sprinklers, hydrants, hose reels, detection, EWIS / occupant warning, extinguishers, emergency lighting, passive fire) reviewing ${o.kind==='FER'?'a Fire Engineering Report (FER)':'a fire services specification'} "${o.name||''}" for the tender "${o.project||''}".
List what the estimator must act on. For an FER: every performance solution / departure from DtS and what it requires of the fire services (systems added, removed or changed, hazard class, detection type, coverage, occupant warning, brigade requirements, maintenance / commissioning conditions), and anything left to others. For a specification: required systems and standards, brands / products, testing, commissioning, certification, warranty, maintenance period, as-builts and anything by others, provisional or unclear.
Cite clause / section or page numbers. Do not invent anything not in the text.
Return ONLY JSON: {"items":[{"cat":"note|incl|excl|rfi","topic":"Sprinklers|Hydrants|Hose reels|Detection & alarm|Occupant warning|Extinguishers|Pumps & water supply|Emergency lighting & exits|Passive fire|Smoke control|Performance solution|Commissioning & handover|Commercial","text":"what the document says (short)","clause":"…or null","page":null,"rfi":"a clear question for the builder / fire engineer","line":"a short line for our quote's inclusions / exclusions / assumptions"}]}
cat: note = important / watch out; incl = required of the fire services contractor; excl = by others / not in our scope; rfi = unclear, missing, conflicting or provisional.
TEXT:
<<<
${text}
>>>`}
function parseAI(out){const L=(out&&out.items)||[]; let n=0; return L.filter(x=>x&&x.text&&/^(note|incl|excl|rfi)$/.test(x.cat)).map(x=>({id:'a'+(++n),cat:x.cat,topic:x.topic||null,text:clean(x.text),clause:x.clause||null,page:x.page||null,rfi:x.rfi||`Please clarify: ${x.text}`,line:x.line||x.text,src:'ai'}))}
// the category a file name suggests
function guessCat(name){const s=String(name||''); if(/\bFER\b|fire[\s_-]*eng(ineer(ing)?)?[\s_-]*(report|brief)|\bFEB\b|performance[\s_-]*solution/i.test(s)) return 'FER'; if(/spec/i.test(s)) return 'SPEC'; if(/addend/i.test(s)) return 'ADD'; return null}

const NS={rules,statements,aiPrompt,parseAI,guessCat,TOPICS};
root.FT_DOCREVIEW=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
