/* Original blobs stay local; metadata scanning runs outside the interface thread. */
importScripts('photo-dates.js');
self.onmessage=async({data})=>{
 const entries=[];
 try{for(let i=0;i<data.files.length;i++){
  const file=data.files[i];let capture={};
  try{capture=PhotoDates.readExif(await file.slice(0,1024*1024).arrayBuffer())||{};}catch(_){}
  entries.push({index:i,...capture,name:file.name});self.postMessage({type:'progress',done:i+1,total:data.files.length});
 }self.postMessage({type:'done',entries});}catch(error){self.postMessage({type:'error',message:error.message});}
};
