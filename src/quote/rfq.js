/* Strix FireTake · supplier quotes: packages of the bill of quantities sent out, prices read back, quotes levelled
   fromLines(lines) → [{code, desc, qty, unit, sys, kind, k, mk, dn}]      (code 'I:spk_pend' an item, 'P:GMS-50' a pipe size, all systems)
   packages(rows, sysName) → default packages: one per system's equipment, one for pipe
   sheetRows(pkg, rows, info) → rows for the price sheet a supplier fills in (Code / Description / Qty / Unit / Rate / Amount)
   readReply(table) → {code: rate} from a returned sheet ([[cell]]), by the Code column, else by description
   level(pkg, rows) → {lines:[{code, desc, qty, unit, rates:{sid: rate}, best}], totals:{sid}, missing:{sid}, cheapest} */
(function(root){
'use strict';
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function fromLines(lines){const out={};
  for(const l of lines||[]){if(l.demo) continue;
    if(l.kind==='item'&&l.k){const c='I:'+l.k; const o=out[c]||(out[c]={code:c,desc:l.desc,qty:0,unit:'ea',sys:l.sys,kind:'item',k:l.k}); o.qty+=l.qty}
    else if(l.kind==='pipe'&&l.mk&&l.dn){const c=`P:${l.mk}-${l.dn}`; const o=out[c]||(out[c]={code:c,desc:String(l.desc).replace(/^DN25 sprinkler drops.*$/,'DN25 pipe'),qty:0,unit:'m',sys:'PIPE',kind:'pipe',mk:l.mk,dn:+l.dn}); o.qty+=l.qty; if(!l.drop) o.desc=l.desc}}
  return Object.values(out).map(o=>({...o,qty:o.unit==='m'?Math.ceil(o.qty):Math.round(o.qty*100)/100})).filter(o=>o.qty>0)}
function packages(rows,sysName){const by={}; for(const r of rows) (by[r.sys]=by[r.sys]||[]).push(r.code);
  return Object.entries(by).map(([s,codes])=>({id:'pk_'+s.toLowerCase(),name:s==='PIPE'?'Pipe and fittings':(sysName&&sysName[s]||s)+' – equipment',codes,suppliers:[],choice:''}))}
function sheetRows(pkg,rows,info){info=info||{}; const R=rows.filter(r=>pkg.codes.includes(r.code)), first=6;
  return [[{v:`Request for quotation – ${pkg.name}`,s:1}],[`Project: ${info.project||''}`],[`From: ${info.company||''}${info.contact?' · '+info.contact:''}${info.email?' · '+info.email:''}`],
    [`Please enter your unit rates (supply only, ex GST) in the Rate column and return this sheet. Keep the Code column as it is.${info.due?' Quotes by '+info.due+'.':''}`],
    [{v:'Code',s:4},{v:'Description',s:4},{v:'Qty',s:4},{v:'Unit',s:4},{v:'Rate $ ex GST',s:4},{v:'Amount $',s:4}],
    ...R.map((r,i)=>[r.code,r.desc,r.qty,r.unit,null,{f:`C${first+i}*E${first+i}`,s:2}]),
    [null,{v:'Total',s:1},null,null,null,{f:`SUM(F${first}:F${first+R.length-1})`,s:3}]]}
const num=v=>{if(v==null||v==='') return null; const n=typeof v==='number'?v:parseFloat(String(v).replace(/[$,\s]/g,'')); return isFinite(n)?n:null};
function readReply(table,rows){const T=(table||[]).map(r=>(r||[]).map(c=>c&&typeof c==='object'&&'v' in c?c.v:c)); let hr=-1, ci=-1, ri=-1, di=-1;
  for(let i=0;i<Math.min(T.length,40);i++){const h=T[i].map(c=>norm(c)); const c=h.findIndex(x=>/^(code|item code|our code|ref)$/.test(x)), r=h.findIndex(x=>/^(rate|unit rate|rate ex gst|unit price|price|rate ex gst|rate (ex|excl) gst)/.test(x)||/^rate/.test(x));
    if(r>=0){hr=i; ci=c; ri=r; di=h.findIndex(x=>/^desc/.test(x)); if(di<0) di=h.findIndex(x=>/^item/.test(x)&&x!==h[ci]); break}}
  if(hr<0) throw new Error('no Rate column');
  const byDesc=Object.fromEntries((rows||[]).map(r=>[norm(r.desc),r.code])), out={};
  for(const r of T.slice(hr+1)){const rate=num(r[ri]); if(rate==null) continue; let code=ci>=0?String(r[ci]||'').trim():''; if(!code&&di>=0) code=byDesc[norm(r[di])]||''; if(code) out[code]=rate}
  return out}
function level(pkg,rows){const R=rows.filter(r=>pkg.codes.includes(r.code)), S=pkg.suppliers||[], totals={}, missing={}; let cheapest=0, cheapestMissing=0;
  const lines=R.map(r=>{const rates={}; let best=null; for(const s of S){const v=(s.prices||{})[r.code]; if(v!=null&&isFinite(v)){rates[s.id]=v; if(best==null||v<rates[best]) best=s.id}}
    for(const s of S){if(rates[s.id]!=null) totals[s.id]=(totals[s.id]||0)+rates[s.id]*r.qty; else missing[s.id]=(missing[s.id]||0)+1}
    if(best) cheapest+=rates[best]*r.qty; else cheapestMissing++; return {code:r.code,desc:r.desc,qty:r.qty,unit:r.unit,rates,best}});
  return {lines,totals,missing,cheapest,cheapestMissing}}
// the rates to use: one supplier's, or the cheapest per line ('cheapest')
function chosenRates(pkg,rows){const L=level(pkg,rows), out={};
  for(const l of L.lines){const sid=pkg.choice==='cheapest'?l.best:pkg.choice; if(sid&&l.rates[sid]!=null) out[l.code]={rate:l.rates[sid],supplier:sid}}
  return out}
const NS={fromLines,packages,sheetRows,readReply,level,chosenRates,norm};
root.FT_RFQ=NS; if(typeof module!=='undefined'&&module.exports) module.exports=NS;
})(typeof window!=='undefined'?window:globalThis);
