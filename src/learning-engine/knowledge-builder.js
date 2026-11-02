/* FireTake Learning Engine · knowledge builder

   One finished job → its project knowledge graph (what the job WAS: devices, rooms, networks, pricing, consultant, provenance) and its
   contributions (what the job TEACHES: symbols, the consultant's keys and conventions, circuit patterns, room expectations, rates).
   The graph is kept per project (data/knowledge/projects/<id>/knowledge-graph.json); contributions feed the libraries. */
(function(root){
'use strict';
const NS=root.FT_LEARN=root.FT_LEARN||{};
const SCHEMA='firetake.project-graph/1';

// input: {projectId, metadata, files}; ex: in-app extraction result; pricing: {boq, quote} from the pricing extractor
function build(input,ex,pricing){const at=new Date().toISOString(); pricing=pricing||{};
  const items=[].concat((pricing.boq&&pricing.boq.items)||[],(pricing.quote&&pricing.quote.items)||[]);
  const totals=[].concat((pricing.boq&&pricing.boq.totals)||[],(pricing.quote&&pricing.quote.totals)||[],(pricing.quote&&pricing.quote.sections)||[]);
  const counts={}; ex.devices.forEach(d=>counts[d.type]=(counts[d.type]||0)+1);
  // BOQ quantities against the takeoff's counts: where they disagree, the estimator counted something the markups do not show
  const boqCheck=items.filter(i=>i.key&&!/[@]|cable|pipe/.test(i.key)&&i.qty!=null).map(i=>({key:i.key,boq:i.qty,takeoff:counts[i.key]||0,diff:(counts[i.key]||0)-i.qty}));
  const graph={schema:SCHEMA,projectId:input.projectId,at,metadata:input.metadata||{},files:input.files||{},consultant:ex.consultant,
    sheets:ex.sheets,devices:ex.devices,rooms:ex.rooms,networks:ex.networks,measurements:ex.measurements,
    symbols:ex.symbols.map(s=>({fingerprint:s.fingerprint,geoHash:s.geoHash,deviceType:s.deviceType,n:s.n,text:s.text})),
    markupClasses:ex.classes,labels:ex.labels,notes:ex.notes,pricing:{items,totals,boqCheck},
    summary:{devices:ex.devices.length,byType:counts,symbols:ex.symbols.length,networks:ex.networks.length,rooms:ex.rooms.length,pricingItems:items.length,unknownMarkupClasses:ex.unknownClasses.length},
    provenance:{diff:ex.diffStats,legend:ex.legend,generatedBy:'src/learning-engine'}};
  const contributions={projectId:input.projectId,at,consultant:ex.consultant&&ex.consultant.consultant||null,
    consultantKeys:{aliases:(ex.consultant&&ex.consultant.aliases)||[],emailDomains:(ex.consultant&&ex.consultant.emailDomains)||[],logoHash:ex.consultant&&ex.consultant.logoHash||null},
    symbols:ex.symbols,abbreviations:ex.abbreviations,conventions:ex.conventions,networks:ex.networks.map(({page,...n})=>n),rooms:ex.rooms.map(({page,bb,...r})=>r),
    pricing:{items,totals},summary:graph.summary};
  return {graph,contributions}}

NS.builder={build,SCHEMA};
if(typeof module!=='undefined'&&module.exports) module.exports=NS.builder;
})(typeof window!=='undefined'?window:globalThis);
