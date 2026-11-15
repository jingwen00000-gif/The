/* Strix FireTake · a company profile from an "Estimate Master Sheet" style workbook (wet price schedule + FireSense dry fire list)
   parse(sheets) → {rows:[{src, sec, name, m, l, keys, note}], dry:[{key, parts, m, h}], catalog:[…], settings:{gm, cont, labour}, warnings}
     sheets: [{name, rows:[[value]]}] (the app's xlsx reader; cached formula values)
     rows: '4. Price Schedule' — material $ and labour $ per unit, proposed FireTake item / pipe keys
     dry: FireTake detection items built from FireSense parts (head + base, module + box …), cost and install hours
   pack(P, choice) → a company pack (type 'company-pack') for the app's importPack: rates (labour hours = labour $ ÷ labour rate,
     so every labour cost is kept), margin as a mark-up equal to the sheet's gross margin, contingency, the FireSense price list. */
(function(root){
'use strict';
const n=v=>{const x=typeof v==='number'?v:parseFloat(String(v==null?'':v).replace(/[$,\s]/g,'')); return isFinite(x)?x:null};
const t=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const U=s=>t(s).toUpperCase();
// [section, item name] → FireTake keys ('P:GMS-100' a pipe size); null = not mapped, with the reason
const WET=[
  ['SPRINKLER HEAD',/^EXPOSED SPRINKLER$/,['spk_up','spk_resx','spk_bccom','spk_bcres']],['SPRINKLER HEAD',/^UNDER DUCT$/,['spk_duct']],['SPRINKLER HEAD',/^W\/?GUARD$/,['spk_dock']],
  ['SPRINKLER HEAD',/^SEMI-?RECESSED$/,['spk_pend','spk_semi']],['SPRINKLER HEAD',/^FLUSH SPRINKLER$/,['spk_conc']],['SPRINKLER HEAD',/^BALCONY$/,['spk_side']],
  ['SPRINKLER HEAD',/^GARBAGE CHUTE$/,['spk_garb']],['SPRINKLER HEAD',/^LIFT SHAFT/,['spk_lift']],['SPRINKLER HEAD',/DRENCHER/,['spk_wsd','spk_wind']],
  ['SPRINKLER HEAD',/EXHAUST DUCT/,['spk_kduct']],['SPRINKLER HEAD',/FREEZER/,['spk_cool']],
  ['SPRINKLER HEAD',/^CONCEALED/,null,'an add-on to a head (cover plate), not a head: not mapped'],['SPRINKLER HEAD',/^REFURB/,null,'refurbishment variant: the refurbishment rates set this'],
  ['SPRINKLER VALVE',/ALARM VALVE/,['valveset']],['SPRINKLER VALVE',/SCV/,null,'zone control valve: no matching FireTake item'],
  ['SPRINKLER MAIN',/^100/,['P:GMS-100']],['SPRINKLER MAIN',/^80/,['P:GMS-80']],['SPRINKLER MAIN',/^65/,['P:GMS-65']],['SPRINKLER MAIN',/^50/,['P:GMS-50']],
  ['HYDRANT MAIN',/^150/,['P:GMS-150']],['HYDRANT MAIN',/^100/,null,'DN100 pipe takes the sprinkler main rate (one rate per size)'],
  ['HYDRANT LANDING VALVE',/^LANDING VALVE/,['hydrant','hydrant2']],
  ['ISOLATION VALVE',/^150/,['isov150']],['ISOLATION VALVE',/^100/,['isov','hydv']],
  ['BOOSTER WITHOUT DDCV',/^100/,['booster']],['PUMP',/ELECTRIC PUMP BELOW/,['pump']],
  ['FEX',/4\.5\s*KG\s*ABE/,['ext_abe']],['FEX',/CO2/,['ext_co2']],
  ['FHR',/^NEW$/,['hosereel']],['PIPEWORK',/^50/,['P:CU-50']],['PIPEWORK',/^32/,['P:CU-32']]];
// FireTake detection items from FireSense parts: [key, [part codes or description words], hours added]
const DRY=[['smoke',['FSP-851AUS-IV','B501AUS-IV']],['heat',['FST-851RAUS-IV','B501AUS-IV']],['cs_smoke',['DETBKT-1','RI-CON','FSP-851AUS-IV','B501AUS-IV']],
  ['duct_probe',['DNR-AUS','FSP-851AUS-IV']],['sounder',['FS-BSS']],['mcp',['NFX-MCP-GLASS']],['speaker',['L-VCP06D-W']],['spk_surf',['L-VCP06D-W','L-SMB-W']],
  ['proj_spk',['L-VJM10A/ENC']],['wip',['WIP']],['door_mag',['MDH400','MDHREM']],['relay',['FRM-1','SMB500']],['mod_mv',['FMM-1','SMB500']],['mod_spr',['FDMR-1','M200E-DIN']],
  ['fip',['AFP-3030/900-1L-PS5']]];
const sheet=(S,re)=>S.find(s=>re.test(s.name));
function parse(S){const out={rows:[],dry:[],catalog:[],settings:{gm:null,cont:null,labour:null},warnings:[]};
  // margin and contingency (the summary sheet: "Gross Margin (GM%): 0.15", "Contingency 0.1 of cost")
  for(const s of S) for(const r of s.rows.slice(0,12)) for(let i=0;i<(r||[]).length;i++){const c=U(r[i]);
    if(/GROSS MARGIN/.test(c)&&out.settings.gm==null){const v=n(r[i+1]); if(v!=null) out.settings.gm=v<1?v*100:v}
    if(/^CONTINGENCY$/.test(c)&&out.settings.cont==null){const v=n(r[i+1])??n(r[i+2]); if(v!=null&&v<1) out.settings.cont=v*100; else if(v!=null&&v<100) out.settings.cont=v}}
  // the wet price schedule
  const ps=sheet(S,/PRICE\s*SCHEDULE/i); let sec='';
  if(ps) for(const r of ps.rows){if(!r) continue; const a=t(r[0]), c=r[2], d=r[3], e=r[4];
    if(a&&/^MAT(E|E)?RIAL$/i.test(t(c))){sec=U(a); continue}
    if(a&&!n(c)&&!n(d)&&(r.slice(1).every(x=>!t(x))||/^UNIT$/i.test(t(r[1])))){sec=U(a); continue}
    const m=n(c), l=n(d), p=n(e); if(!a||(m==null&&l==null)) continue;
    const rule=WET.find(([s,re])=>sec.includes(s)&&re.test(U(a)));
    out.rows.push({src:`${ps.name} · ${sec} · ${a}`,sec,name:a,m:(m||0)+(p||0),l:l||0,keys:rule&&rule[2]?rule[2].slice():[],note:rule?(rule[3]||(p?`incl. painting $${p}`:'')):'no matching FireTake item'})}
  else out.warnings.push('no "Price Schedule" sheet');
  // the FireSense dry fire list: part, description, cost, hours; its labour rate
  const fs=sheet(S,/FIRESENSE/i); const parts={}; let cat='';
  if(fs){for(const r of fs.rows.slice(0,5)) for(let i=0;i<(r||[]).length;i++) if(/^HRS COST$/i.test(t(r[i]))){const v=n(((fs.rows[2]||[])[i])); if(v) out.settings.labour=v}
    fs.rows.forEach((r,ri)=>{if(!r) return; const code=t(r[0]), desc=t(r[1]), cost=n(r[5]), hrs=n(r[6]);
      if(!code&&desc&&cost==null&&hrs==null){cat=desc; return} if(!desc||cost==null||ri<2) return;
      if(code) parts[code.toUpperCase()]={code,desc,cost,hrs:hrs||0};
      out.catalog.push({code:code||'',desc,unit:/ per m$|CORE 1\.5|1\.5mm2|TRAY|CONDUIT|\bper m\b/i.test(desc)?'m':'ea',price:cost,hrs:hrs||0,cat:cat||'FireSense'})})
    for(const [key,codes] of DRY){const got=codes.map(c=>parts[c.toUpperCase()]); if(got.some(g=>!g)){out.warnings.push(`${key}: part ${codes[got.findIndex(g=>!g)]} not in the list`); continue}
      out.dry.push({key,parts:got.map(g=>g.code),m:Math.round(got.reduce((a,g)=>a+g.cost,0)*100)/100,h:Math.round(got.reduce((a,g)=>a+g.hrs,0)*100)/100})}}
  else out.warnings.push('no "FireSense" sheet');
  return out}
// choice: {name, prefix, labour, gm, cont, rows:{index: [keys]} (overrides), today}
function pack(P,choice){choice=choice||{}; const L=+choice.labour||P.settings.labour||90, gm=choice.gm!=null?+choice.gm:(P.settings.gm??15), cont=choice.cont!=null?+choice.cont:(P.settings.cont??5);
  const items={}, pipe={}, used=[];
  P.rows.forEach((r,i)=>{const keys=(choice.rows&&choice.rows[i])||r.keys; for(const k of keys){const h=Math.round(r.l/L*1000)/1000;
    if(k.startsWith('P:')) pipe[k.slice(2)]={m:r.m,h}; else items[k]={m:r.m,h}; used.push(k)}});
  for(const d of P.dry){items[d.key]={m:d.m,h:d.h}; used.push(d.key)}
  const id='co_'+String(choice.prefix||choice.name||'company').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24);
  const sup=choice.supplier||'FireSense (price list)';
  const company={id,name:choice.name||'Company',label:choice.label||'Estimate Master Sheet',prefix:choice.prefix||'',
    rates:{fs:{labour:L,margin:Math.round(gm/(1-gm/100)*100)/100,cont,items,pipe}},cableSep:true,sourceSheet:choice.file||''};
  const day=choice.today||new Date().toISOString().slice(0,10);
  // the price schedule's rows FireTake has no item for (testing, DLP, signage, core holes …) join the materials library, so they can be found and used
  const own=choice.ownSupplier||(choice.name?choice.name+' price schedule':'Price schedule');
  const rest=P.rows.map((r,i)=>[r,i]).filter(([r,i])=>!((choice.rows&&choice.rows[i])||r.keys).length).map(([r,i])=>({id:`m_${id}_ps${i}`,code:'',desc:`${r.sec.charAt(0)+r.sec.slice(1).toLowerCase()} – ${r.name}`,unit:'ea',price:r.m,supplier:own,cat:r.sec,date:day,note:r.l?`labour $${r.l}`:''}));
  const catalog={items:P.catalog.map((c,i)=>({id:`m_${id}_${i}`,code:c.code,desc:c.desc,unit:c.unit,price:c.price,supplier:sup,cat:c.cat,date:day,note:c.hrs?`install ${c.hrs} h`:''})).concat(rest),sup:{[sup]:{date:day},...(rest.length?{[own]:{date:day}}:{})}};
  return {type:'company-pack',companies:[company],catalog,default:null,used}}
const NS={parse,pack,WET,DRY};
root.FT_MASTER=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
