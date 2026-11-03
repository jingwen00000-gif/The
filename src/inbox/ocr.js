/* Strix FireTake · reading text from an image (a contact details screenshot, an e-mail signature) without an API key.
   Tesseract.js (Apache-2.0) runs offline from app/ocr/ in the desktop edition; the web edition loads the same version from jsDelivr.
   FT_OCR.read(file) → text ('' when it cannot run). */
(function(root){
'use strict';
const VER='6.0.1', CORE='6.1.2';
const base=()=>{const here=location.href.replace(/[^/]*$/,''); return here+'ocr/'};
let loading=null, worker=null;
function script(src){return new Promise((res,rej)=>{const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('cannot load '+src)); document.head.appendChild(s)})}
async function getWorker(){if(worker) return worker; if(loading) return loading;
  loading=(async()=>{let paths=null;
    try{await script(base()+'tesseract.min.js'); paths={workerPath:base()+'worker.min.js',corePath:base()+'tesseract-core-simd-lstm.wasm.js',langPath:base()+'lang',workerBlobURL:false}}
    catch(e){await script(`https://cdn.jsdelivr.net/npm/tesseract.js@${VER}/dist/tesseract.min.js`); paths={workerPath:`https://cdn.jsdelivr.net/npm/tesseract.js@${VER}/dist/worker.min.js`,corePath:`https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE}/tesseract-core-simd-lstm.wasm.js`,langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int'}}
    worker=await root.Tesseract.createWorker('eng',1,{...paths,cacheMethod:'none'}); return worker})();
  try{return await loading}finally{loading=null}}
// an image file → its text. Small images are scaled up first (signatures are often small; Tesseract reads ~30 px letters best)
async function read(file){try{const url=URL.createObjectURL(file); let src=file;
    try{const im=await new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url}); const k=Math.max(1,Math.min(3,1800/Math.max(im.width,im.height)));
      const cv=document.createElement('canvas'); cv.width=Math.round(im.width*k); cv.height=Math.round(im.height*k); const c=cv.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,cv.width,cv.height); c.imageSmoothingQuality='high'; c.drawImage(im,0,0,cv.width,cv.height); src=cv}
    finally{URL.revokeObjectURL(url)}
    const w=await getWorker(); const r=await w.recognize(src); return (r&&r.data&&r.data.text)||''}catch(e){console.warn('OCR',e); return ''}}
root.FT_OCR={read};
})(typeof window!=='undefined'?window:globalThis);
