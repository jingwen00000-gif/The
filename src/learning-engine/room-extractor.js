/* FireTake Learning Engine · room knowledge extractor

   Rooms are found from their names on the plan (the text layer) and the smallest closed outline drawn around the name; the devices
   the takeoff confirmed inside that outline belong to the room. Area from the drawing scale. The room library then says, per room
   type, what an estimator found there: presence (share of rooms with at least one), devices per room, per 100 m².
   Plans whose rooms are drawn as loose wall lines (no closed outline) give room names without an area: they are skipped, not
   guessed — full room detection is Stage 3. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const ROOMS=[['PLANT ROOM',/PLANT|MECH(ANICAL)?\s+ROOM|A\/?C\s+PLANT|BOILER/],['SWITCH ROOM',/SWITCH\s*(ROOM|BOARD)|MSB|ELEC(TRICAL)?\s+(ROOM|CUPBOARD)/],['COMMUNICATIONS ROOM',/COMMS?\b|COMMUNICATIONS?|SERVER|DATA\s+ROOM|\bIT\s+ROOM|\bMDF\b|\bIDF\b/],
  ['KITCHEN',/KITCHEN|KITCHENETTE|PANTRY|TEA\s*ROOM|BREAKOUT/],['MEETING ROOM',/MEETING|BOARD\s*ROOM|CONFERENCE|INTERVIEW/],['OFFICE',/OFFICE|WORKSTATION|OPEN\s+PLAN|WORKSPACE/],
  ['STORE',/STORE|STORAGE|CLEANER|JANITOR|\bCLR\b/],['CORRIDOR',/CORRIDOR|PASSAGE|HALLWAY|\bHALL\b/],['LOBBY',/LOBBY|FOYER|RECEPTION|ENTRY/],['STAIR',/STAIR|FIRE\s+ESCAPE/],
  ['LIFT',/\bLIFT\b|ELEVATOR/],['BATHROOM',/TOILET|BATHROOM|\bWC\b|AMENITIES|ACCESSIBLE|SHOWER|ENSUITE|POWDER/],['CARPARK',/CAR\s*PARK|PARKING|GARAGE/],['BEDROOM',/BED(ROOM)?\b/],['LIVING',/LIVING|LOUNGE|DINING|FAMILY/],
  ['LOADING DOCK',/LOADING|DOCK/],['RETAIL',/RETAIL|SHOP|TENANCY/]];
const roomType=s=>{const u=String(s||'').toUpperCase(); if(u.length>40||/\d{3,}/.test(u)) return null; const r=ROOMS.find(([,re])=>re.test(u)); return r?r[0]:null};
// walls are drawn black / grey; a closed coloured outline round a name is a cable loop or a zone, not the room
const grey=c=>{const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16); return Math.max(r,g,b)-Math.min(r,g,b)<40};
function polyArea(p){let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]); return Math.abs(a/2)}
function inPoly(q,p){let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>q[1])!==(p[j][1]>q[1]))&&(q[0]<(p[j][0]-p[i][0])*(q[1]-p[i][1])/((p[j][1]-p[i][1])||1e-9)+p[i][0])) c=!c} return c}

function extract(models,devices,ctx){ctx=ctx||{}; const FVE=ctx.FVE||root.FVE; const out=[];
  models.forEach((m,pi)=>{if(m.sheet&&m.sheet.kind!=='plan') return; const mpu=m.scale?m.scale.mPerUnit:null, tb=FVE.titleBlock(m), sheetA=m.page.w*m.page.h;
    const labels=(m.lines||[]).filter(l=>!tb.some(z=>l.x>=z[0]&&l.cy>=z[1])).map(l=>({l,type:roomType(l.s)})).filter(x=>x.type);
    for(const {l,type} of labels){const q=[(l.x+l.x1)/2,l.cy];
      const enc=m.index.search(q[0],q[1],q[0],q[1]).filter(o=>o.closed&&o.stroke&&!o.fill&&grey(o.stroke)&&(o.k==='rect'||o.k==='polygon')&&o.pts.length>=4).map(o=>({o,A:polyArea(o.pts)})).filter(x=>x.A>400&&x.A<sheetA*.25&&inPoly(q,x.o.pts)).sort((a,b)=>a.A-b.A)[0];
      if(!enc) continue; const P=enc.o.pts, dv={}; devices.filter(d=>d.page===pi&&inPoly([d.x,d.y],P)).forEach(d=>dv[d.type]=(dv[d.type]||0)+1);
      if(out.some(r=>r.page===pi&&r._o===enc.o)) continue;
      out.push({page:pi,name:l.s.trim(),type,area_m2:mpu?Math.round(enc.A*mpu*mpu*100)/100:null,bb:enc.o.bb.slice(),pts:enc.o.pts.map(p=>[+p[0].toFixed(2),+p[1].toFixed(2)]),devices:dv,_o:enc.o})}});
  return out.map(({_o,...r})=>r)}

NS.rooms={extract,roomType,ROOMS};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.rooms;
})(typeof window!=='undefined'?window:globalThis);
