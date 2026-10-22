const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {History,turnDelta}=require('../editor-actions.js');
const dates=require('../photo-dates.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('selector groups 1x then 2x per angle, with capture order within each zoom',()=>{
  const shots=[{id:'2b',pose:'Frente',focal35:48,capturedAt:4},{id:'1b',pose:'Frente',focal35:24,capturedAt:3},{id:'2a',pose:'Frente',focal35:48,capturedAt:1},{id:'1a',pose:'Frente',focal35:24,capturedAt:2},{id:'unknown',pose:'Frente',capturedAt:0},{id:'side',pose:'45° D',focal35:24,capturedAt:0}];
  assert.deepEqual(shots.slice().sort(dates.selectorCompare).map(s=>s.id),['1a','1b','2a','2b','unknown','side']);
  assert.equal(dates.zoomGroup({digitalZoom:2}),2);
  assert.equal(dates.zoomGroup({focal35:48,digitalZoom:2}),2);
});
test('EXIF reads equivalent focal length and rational digital zoom without requiring a date',()=>{
  for(const little of [true,false]) {
    const b=Buffer.alloc(60),w16=(x,p)=>little?b.writeUInt16LE(x,p):b.writeUInt16BE(x,p),w32=(x,p)=>little?b.writeUInt32LE(x,p):b.writeUInt32BE(x,p);
    b.write(little?'II':'MM');w16(42,2);w32(8,4);w16(2,8);
    w16(0xa405,10);w16(3,12);w32(1,14);w16(48,18);
    w16(0xa404,22);w16(5,24);w32(1,26);w32(40,30);w32(2,40);w32(1,44);
    const m=dates.readExif(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    assert.equal(m.focal35,48);assert.equal(m.digitalZoom,2);assert.equal(m.capturedAt,undefined);
  }
});
test('saving to gallery retains the complete rendered output in the project',()=>{
  let rendered=false;
  const comp={};
  const ctx=vm.createContext({curComp:comp,linked:true,render:()=>{rendered=true;},savePair(){},saveComp(){},
    cv:{toDataURL:(mime,quality)=>{assert.equal(rendered,true);assert.equal(mime,'image/jpeg');assert.equal(quality,.95);return 'full-output';}}});
  vm.runInContext(source.slice(source.indexOf('function compThumb('),source.indexOf("$('save').onclick =")),ctx);
  ctx.compThumb();assert.equal(comp.out,'full-output');
});

test('each stroke reverses independently, redo restores, new paint discards redo',()=>{
  const h=new History(), state=new Uint8Array(8);
  let before=state.slice();state[0]=100;h.record(before,state);
  before=state.slice();state[4]=240;h.record(before,state);
  h.apply(state);assert.deepEqual([...state],[100,0,0,0,0,0,0,0]);
  h.apply(state);assert.equal(state[0],0);
  h.apply(state,true);h.apply(state,true);assert.equal(state[4],240);
  h.apply(state);before=state.slice();state[2]=80;h.record(before,state);
  assert.equal(h.apply(state,true),false);assert.equal(state[0],100);
});
test('history limit retains visible old strokes, separate photos have separate histories',()=>{
  const h=new History(6),other=new History(),s=new Uint8Array(4);
  for(let i=0;i<3;i++){const before=s.slice();s[i]=255;h.record(before,s);}
  assert.equal(h.past.length,1);h.apply(s);assert.deepEqual([...s],[255,255,0,0]);
  assert.equal(other.apply(s),false);
  h.record(s,s);assert.equal(h.future.length,1);
});
test('gesture rotation unwraps the branch cut and accumulates several turns',()=>{
  const rad=d=>d*Math.PI/180;
  assert.ok(Math.abs(turnDelta(rad(179),rad(-179))-2)<1e-9);
  assert.ok(Math.abs(turnDelta(rad(-179),rad(179))+2)<1e-9);
  let angle=0,prior=0;
  for(let d=10;d<=1080;d+=10){const now=rad(((d+180)%360)-180);angle+=turnDelta(prior,now);prior=now;}
  assert.ok(Math.abs(angle-1080)<1e-8);
});
function exifPrecision(little) {
  const b=Buffer.alloc(140),w16=(x,p)=>little?b.writeUInt16LE(x,p):b.writeUInt16BE(x,p),w32=(x,p)=>little?b.writeUInt32LE(x,p):b.writeUInt32BE(x,p);
  b.write(little?'II':'MM');w16(42,2);w32(8,4);w16(3,8);
  const entry=(i,tag,text,offset)=>{const p=10+i*12;w16(tag,p);w16(2,p+2);w32(text.length+1,p+4);if(text.length+1<=4)b.write(text,p+8);else{w32(offset,p+8);b.write(text,offset);}};
  // Put subsecond before date to test tag-order independence and inline storage.
  entry(0,0x9291,'125',0);entry(1,0x9003,'2026:10:14 11:00:00',60);entry(2,0x9011,'-03:00',100);
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
}
test('EXIF reads original subsecond and UTC offset in both endian orders',()=>{
  for(const little of [true,false]){
    const d=dates.readExif(exifPrecision(little));
    assert.equal(d.capturedAt,Date.parse('2026-10-14T14:00:00.125Z'));
    assert.equal(d.captureSubsecond,'125');assert.equal(d.captureDay,'2026-10-14');
  }
});
test('capture time wins over selector order and numeric filenames break ties',()=>{
  const shots=[{name:'IMG_12.jpg',capturedAt:1000},{name:'IMG_11.jpg',capturedAt:1000.5},{name:'IMG_9.jpg',capturedAt:1000},{name:'IMG_2.jpg'},{name:'IMG_1.jpg'}];
  const sorted=shots.slice().sort(dates.compare);
  assert.deepEqual(sorted.map(s=>s.name),['IMG_9.jpg','IMG_12.jpg','IMG_11.jpg','IMG_1.jpg','IMG_2.jpg']);
  assert.equal(shots[0].name,'IMG_12.jpg');
});
test('mask cleanup removes detached fragments and preserves subject and narrow fringe',()=>{
  const N=48,m=new Uint8Array(N*N),ctx=vm.createContext({RES:N,Uint8Array,Int32Array,MaskRefinement:require('../mask-refinement.js')});
  vm.runInContext(source.slice(source.indexOf('function cleanMask('),source.indexOf('function isSelected(')),ctx);
  for(let y=10;y<38;y++)for(let x=12;x<34;x++)m[y*N+x]=255;
  m[20*N+11]=100; // soft fringe one pixel outside subject
  for(let y=2;y<7;y++)for(let x=2;x<7;x++)m[y*N+x]=255;
  const result=ctx.cleanMask(m);
  assert.equal(result[20*N+20],255);assert.equal(result[20*N+11],100);assert.equal(result[4*N+4],0);
  assert.equal(m[4*N+4],255); // original probability input untouched
});
test('wide-gamut context requested, safe fallback without exposure manipulation',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function photoContext('),source.indexOf("const cv = $('cv')")),ctx);
  let setting;
  const expected={};assert.equal(ctx.photoContext({getContext:(kind,s)=>{setting=s;return expected;}}),expected);
  assert.equal(setting.colorSpace,'display-p3');
  assert.equal(ctx.photoContext({getContext:(kind,s)=>{if(s)throw Error('unsupported');return expected;}}),expected);
});
test('opening the native picker does not display import progress before selection',()=>{
  const calls=[],events={};
  const elements=new Proxy({}, {get:(o,k)=>o[k] ||= {addEventListener:(event,fn)=>{events[k+event]=fn;},showModal:()=>calls.push('waiting'),click:()=>calls.push('picker'),close:()=>calls.push('closed')}});
  const ctx=vm.createContext({$:id=>elements[id]});
  vm.runInContext(source.slice(source.indexOf('let awaitingPhotoFiles ='),source.indexOf("$('filePool').onchange =")),ctx);
  elements.importMore.onclick();assert.deepEqual(calls,['picker']);
  events.filePoolcancel();assert.equal(calls.at(-1),'closed');
});
test('loupe follows contact, stays inside viewport and disappears without a stroke',()=>{
  const lens={style:{}},draws=[];
  const ctx=vm.createContext({$:()=>lens,brushing:true,loupePoint:{x:6,y:30},ring:{x:50,y:80},W:1080,innerWidth:390,innerHeight:844,
    cv:{getBoundingClientRect:()=>({width:390})},photoContext:()=>({clearRect(){},fillRect(){},drawImage(...args){draws.push(args);},beginPath(){},moveTo(){},lineTo(){},stroke(){}})});
  vm.runInContext(source.slice(source.indexOf('function drawLoupe('),source.indexOf('function toImage(')),ctx);
  ctx.drawLoupe();assert.equal(lens.hidden,false);assert.equal(lens.style.left,'8px');assert.equal(lens.style.top,'65px');assert.equal(draws.length,1);
  ctx.brushing=false;ctx.drawLoupe();assert.equal(lens.hidden,true);
});
