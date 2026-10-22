const {test}=require('node:test');const assert=require('node:assert/strict');
const {cleanMask,refineEdges}=require('../mask-refinement.js');
test('cleanup preserves openings, soft hairs near subject and immutable original probabilities',()=>{
 const N=128,m=new Uint8Array(N*N);for(let y=12;y<120;y++)for(let x=30;x<100;x++)m[y*N+x]=255;
 for(let y=30;y<36;y++)for(let x=60;x<66;x++)m[y*N+x]=0; // A real gap, not a pinhole.
 m[40*N+29]=90;m[40*N+28]=45;m[80*N+70]=0;m[2*N+2]=255;
 const copy=m.slice(),out=cleanMask(m,N);assert.deepEqual(m,copy);assert.equal(out[2*N+2],0);assert.equal(out[32*N+62],0);assert.equal(out[80*N+70],255);assert.equal(out[40*N+28],45);
});
test('edge refinement respects contrasting image boundaries, stable interior and source RGB',()=>{
 const w=7,h=7,a=new Uint8Array(w*h),rgb=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;a[i]=x<=2?255:x===3?180:0;rgb[i*4]=x<=3?255:0;rgb[i*4+2]=x<=3?0:255;rgb[i*4+3]=255;}
 const original=rgb.slice(),mask=a.slice(),out=refineEdges(a,rgb,w,h),flat=refineEdges(a,new Uint8ClampedArray(rgb.length).fill(128),w,h);
 assert.deepEqual(a,mask);assert.deepEqual(rgb,original);assert.equal(out[3*w+1],255);assert.equal(out[3*w+5],0);assert(out[3*w+3]>flat[3*w+3]);assert(out[3*w+3]>0&&out[3*w+3]<255);
});
test('dimensions are checked before accessing pixel buffers',()=>assert.throws(()=>refineEdges(new Uint8Array(1),new Uint8Array(4),2,2),/Dimensões/));
