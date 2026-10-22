(function(root){
 const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
 async function readMetadata(files,onProgress=()=>{}){
  if(typeof Worker!=='undefined'){
   try{return await new Promise((resolve,reject)=>{
    const worker=new Worker('import-metadata-worker.js');let timer;
    const stop=()=>{clearTimeout(timer);worker.terminate();},fail=()=>{stop();reject(new Error('Leitura em segundo plano indisponível'));};
    const renew=()=>{clearTimeout(timer);timer=setTimeout(fail,30000);};renew();
    worker.onerror=fail;worker.onmessage=({data})=>{renew();if(data.type==='progress')onProgress(data.done,data.total);else if(data.type==='done'){stop();resolve(data.entries.map(e=>{const {index,...capture}=e;return {file:files[index],...capture};}));}else if(data.type==='error')fail();};
    worker.postMessage({files});
   });}catch(_){} // Older engines/offline installations retain the safe path below.
  }
  const entries=[];for(let i=0;i<files.length;i++){
   await yieldUI();const file=files[i];let capture={};try{capture=root.PhotoDates.readExif(await file.slice(0,1024*1024).arrayBuffer())||{};}catch(_){}
   entries.push({file,...capture,name:file.name});onProgress(i+1,files.length);
  }return entries;
 }
 function jpeg(canvas,quality){return new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>{if(!blob){reject(new Error('Não foi possível criar a prévia'));return;}const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('Falha na prévia'));reader.readAsDataURL(blob);},'image/jpeg',quality);
 });}
 async function previews(src,w,h,makeCanvas,freeCanvas){
  const pk=Math.min(1,1080/Math.max(w,h)),pv=makeCanvas(Math.max(1,Math.round(w*pk)),Math.max(1,Math.round(h*pk)));
  let tc;
  try{
   const pg=pv.getContext('2d');pg.imageSmoothingQuality='high';pg.drawImage(src,0,0,pv.width,pv.height);
   // Yield between drawing and encoding so progress/spinner can paint.
   await yieldUI();const prev=await jpeg(pv,.94),tk=136/Math.min(w,h);
   tc=makeCanvas(Math.max(1,Math.round(w*tk)),Math.max(1,Math.round(h*tk)));const tg=tc.getContext('2d');tg.imageSmoothingQuality='high';tg.drawImage(pv,0,0,tc.width,tc.height);
   const thumb=await jpeg(tc,.85);return {prev,thumb,canvas:pv};
  }catch(error){freeCanvas(pv);throw error;}finally{if(tc)freeCanvas(tc);}
 }
 const api={readMetadata,previews};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ImportTools=api;
})(typeof self!=='undefined'?self:globalThis);
