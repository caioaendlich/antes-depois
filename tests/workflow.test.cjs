const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'),'utf8');
const dates = require('../photo-dates.js');
const plain = value => JSON.parse(JSON.stringify(value));
test('routing a session persists only its photos, keeps pending photos and unlocks controls',async()=>{
  const c={id:'c',A:['a'],D:[],U:['d','pending'],drafts:{}};
  const shots=[{id:'a',kind:'A'},{id:'d',kind:'U'},{id:'pending',kind:'U'},{id:'other',kind:'A'}];
  let commits=0,unlock=0;
  const {ctx,elements}=context({Pj:{rec:{comps:[c]},shots},curComp:c,explorer:{comp:c,selected:new Set(['d'])},explorerBusy:false,
    cloneValue:plain,exCounts:()=>{unlock++;},renderExplorer:async()=>{},setStatus(){},shotById:id=>shots.find(s=>s.id===id),
    commitProject:async(removed,changed)=>{commits++;assert.deepEqual(plain(changed).map(s=>s.id),['d']);}});
  const start=source.indexOf('async function exAction(');
  vm.runInContext(source.slice(start,source.indexOf("$('exBefore').onclick",start)),ctx);
  await ctx.classify('D');
  assert.equal(commits,1);assert.deepEqual(c.D,['d']);assert.deepEqual(c.U,['pending']);
  assert.equal(ctx.explorerBusy,false);assert.ok(unlock>=2);assert.match(ctx.explorer.notice,/Depois/);
});
test('failed routing restores assignments and allows another attempt',async()=>{
  const c={id:'c',A:[],D:[],U:['s'],drafts:{}};
  const {ctx}=context({Pj:{rec:{comps:[c]},shots:[{id:'s',kind:'U'}]},curComp:c,explorer:{comp:c,selected:new Set(['s'])},explorerBusy:false,
    cloneValue:plain,exCounts(){},renderExplorer:async()=>{},setStatus(){},shotById:id=>ctx.Pj.shots.find(s=>s.id===id),commitProject:async()=>{throw Error('storage failure');}});
  const start=source.indexOf('async function exAction(');
  vm.runInContext(source.slice(start,source.indexOf("$('exBefore').onclick",start)),ctx);
  await ctx.classify('D');assert.equal(ctx.explorerBusy,false);assert.deepEqual(plain(ctx.curComp.U),['s']);assert.deepEqual(plain(ctx.curComp.D),[]);
  assert.match(ctx.explorer.notice,/storage failure/);
});
test('angle selection ignores old automatic drafts and preserves deliberate selections',async()=>{
  for(const manual of [false,true]) {
    const comp={angle:'Frente',drafts:{'45° direita':{selA:'wrong',manual}},angles:[]};
    const {ctx}=context({curComp:comp,rememberDraft(){},linked:false,cloneValue:v=>v,saveComp:async()=>{},openPick(){}});
    const start=source.indexOf('async function selectAngle(');
    vm.runInContext(source.slice(start,source.indexOf("$('workflow').querySelectorAll",start)),ctx);
    await ctx.selectAngle('45° direita');
    assert.equal(comp.selA,manual?'wrong':null);
  }
  const {ctx}=context();
  vm.runInContext(source.slice(source.indexOf('function pickIndexForAngle('),source.indexOf('function openPick(')),ctx);
  const list=[{id:'f',pose:'Frente'},{id:'r',pose:'Perfil D'}];
  assert.equal(ctx.pickIndexForAngle(list,null,'Perfil D'),1);
  assert.equal(ctx.pickIndexForAngle(list,null,'45° D'),0);
  assert.equal(ctx.pickIndexForAngle(list,'f','Perfil D'),0);
});
test('ghost pyramid is recalculated from the reference photo, then reused',async()=>{
  const shot={id:'a',pid:'p',prev:'reference.jpg',w:600,h:800,pyr:{pts:['stale']}};
  let detections=0;
  const {ctx}=context({camMode:'D',camA:()=>[shot],curA:0,loadImg:async src=>src,
    detectOn:async image=>{assert.equal(image,'reference.jpg');detections++;return [{x:.4,y:.3}];},DB:{put:async()=>{}},camDraw(){}});
  vm.runInContext(source.slice(source.indexOf('let tgtTok ='),source.indexOf('function toScreen(')),ctx);
  await ctx.camTargetPyr();await ctx.camTargetPyr();
  assert.equal(detections,1);assert.equal(shot.pyrVersion,2);
  assert.equal(shot.pyr.pts[0].x,.4);
});
test('worker reset rejects pending recuts and permits a fresh load',()=>{
  let terminated=0,rejected=0;
  const {ctx}=context({worker:{terminate:()=>terminated++},session:true,sessionP:Promise.resolve(),wwait:new Map([[1,{rej:()=>rejected++}]])});
  vm.runInContext(source.slice(source.indexOf('function resetModel('),source.indexOf('function loadModel(')),ctx);
  ctx.resetModel(new Error('stopped'));
  assert.equal(terminated,1);assert.equal(rejected,1);assert.equal(ctx.wwait.size,0);assert.equal(ctx.sessionP,null);
});
test('camera keeps the pose at shutter time and allows repeated afters for one reference', async()=>{
  for(const mode of ['A','D']) {
    const before={id:'a',pose:'45° D',poseManual:true};
    const old={id:'old',kind:'D',of:'a'};
    const saved=[];
    const {ctx,elements}=context({vid:{videoWidth:100,videoHeight:100},mkCanvas:()=>({getContext:()=>({drawImage(){}})}),
      requestAnimationFrame:fn=>fn(),live:null,curYaw:()=>null,camMode:mode,camPose:'45° D',curA:0,lastDone:-1,
      camA:()=>[before],pendingDone:new Set(),camUI:()=>{},shotChain:Promise.resolve(),
      shotFromCanvas:async(c,extra)=>({id:'new',...extra}),depOf:()=>old,DB:{put:async(k,v)=>saved.push({...v})},
      Pj:{shots:[before,old]},curComp:{A:['a'],D:['old'],selA:'a'},touchProj:async()=>{}});
    elements.camFlash={style:{}};elements.cam={hidden:true};
    vm.runInContext(source.slice(source.indexOf("$('camShot').onclick ="),source.indexOf('let galFor =')),ctx);
    elements.camShot.onclick();ctx.camPose='Perfil E';await ctx.shotChain;
    assert.equal(ctx.Pj.shots.at(-1).pose,'45° D');
    assert.equal(ctx.curA,0);
    if(mode==='D') { assert.equal(old.of,null);assert.equal(ctx.Pj.shots.length,3);assert.equal(ctx.Pj.shots.at(-1).of,'a'); }
  }
});
function exif(date, little = true) {
  const b = Buffer.alloc(70); b.write(little ? 'II' : 'MM');
  const w16 = (n,p) => little ? b.writeUInt16LE(n,p) : b.writeUInt16BE(n,p);
  const w32 = (n,p) => little ? b.writeUInt32LE(n,p) : b.writeUInt32BE(n,p);
  w16(42,2); w32(8,4); w16(1,8); w16(0x8769,10); w16(4,12); w32(1,14); w32(26,18);
  w16(1,26); w16(0x9003,28); w16(2,30); w32(20,32); w32(44,36); b.write(date,44);
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
}
test('EXIF capture dates: both byte orders, leap day and invalid input', () => {
  for (const little of [true,false]) assert.equal(dates.readExif(exif('2024:02:29 13:45:00',little)).captureDay,'2024-02-29');
  assert.equal(dates.readExif(exif('2026:02:29 13:45:00')),null);
  assert.equal(dates.readExif(new Uint8Array([0,1,2]).buffer),null);
  assert.equal(dates.parseDate('2026:01:01 25:00:00'),null);
});
test('consecutive gaps: exactly 30 minutes stays together; larger gap splits on same day', () => {
  const shots = [61,30,0,90].map((m,i)=>({id:String(i),capturedAt:m*60000}));
  assert.deepEqual(dates.sessions(shots).groups.map(g=>g.map(s=>s.capturedAt/60000)),[[0,30],[61,90]]);
  assert.deepEqual(dates.split(shots).map(s=>s.side),['D','A','A','D']);
});
test('one block, three blocks and missing timestamps require classification', () => {
  for (const minutes of [[0,20,40],[0,31,62]]) assert.ok(dates.split(minutes.map((m,id)=>({id,capturedAt:m*60000}))).every(s=>s.side==='U'));
  const shots = [{id:'a',capturedAt:0},{id:'d',capturedAt:3600000},{id:'u',lastModified:42,captureDay:'2026-01-01'}];
  assert.ok(dates.split(shots).every(s=>s.side==='U'));
  assert.deepEqual(dates.sessions(shots).unknown.map(s=>s.id),['u']);
});
function context(extra = {}) {
  const elements = {};
  const ctx = vm.createContext({requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),console,Blob,File,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,fetch,Date,
    $: id => elements[id] ||= {disabled:false}, ...extra});
  return {ctx,elements};
}
test('removing an original detaches references while retaining saved montage images', () => {
  const c = {id:'c',A:['a'],D:['d'],U:['u'],selA:'a',tf:{s:1},drafts:{Frente:{selA:'a',tf:{s:1}}},angles:[{out:'saved-image',selA:'a'}]};
  const Pj = {rec:{comps:[c]},shots:[{id:'a',kind:'A'},{id:'d',kind:'D',of:'a'},{id:'u',kind:'U'}]};
  const {ctx} = context({Pj});
  vm.runInContext(source.slice(source.indexOf('function detachShot('),source.indexOf('async function commitProject(')),ctx);
  vm.runInContext('detachShot(Pj.shots[0])',ctx);
  assert.deepEqual(Pj.shots.map(s=>s.id),['d','u']); assert.equal(Pj.shots[0].of,null);
  assert.equal(c.selA,null); assert.equal(c.drafts.Frente.selA,null); assert.equal(c.drafts.Frente.tf,null);
  assert.equal(c.angles[0].out,'saved-image');
});
test('project export contains original bytes, capture dates, angle images and a restorable manifest', async () => {
  const {ctx} = context({slug:s=>s.toLowerCase(),localDay:()=> '2026-10-08'});
  vm.runInContext(source.slice(source.indexOf('const CRC ='),source.indexOf('const unbacked =')),ctx);
  vm.runInContext(source.slice(source.indexOf('async function projectEntries('),source.indexOf("$('exDownload').onclick")),ctx);
  ctx.rec = {id:'p',comps:[{id:'c',date:'2026-10-08',angles:[{name:'Frente',out:'data:image/jpeg;base64,AQID'}]}]};
  ctx.shots = [{id:'s',kind:'A',blob:new Blob([new Uint8Array([7,8,9])],{type:'image/png'}),captureDay:'2026-09-01'}];
  const files = await vm.runInContext("projectEntries(rec,shots,'').then(async e => unzip(await zip(e).arrayBuffer()))",ctx);
  const manifest = JSON.parse(new TextDecoder().decode(files['projeto.json']));
  assert.equal(manifest.shots[0].captureDay,'2026-09-01'); assert.equal(manifest.shots[0].mime,'image/png');
  assert.deepEqual([...files[manifest.shots[0].file]],[7,8,9]); assert.deepEqual([...files['2026-10-08_c/frente.jpg']],[1,2,3]);
});
test('saving angles keeps separate outputs, requires replacement confirmation and rolls back failed writes', async () => {
  const curComp = {id:'c',angle:'Frente',angles:[],selA:'a',selD:'d',tf:{A:{s:1},D:{s:1}},edit:{opts:{fade:.6},A:{id:'a',plus:'paint'},backgroundRemoved:true}};
  class Reader { readAsDataURL() { this.result='data:image/jpeg;base64,AQID'; queueMicrotask(()=>this.onload()); } }
  const {ctx,elements} = context({curComp,linked:true,savingAngle:false,cloneValue:plain,confirm:()=>false,FileReader:Reader,
    savePair:()=>{},makeFile:()=>({blob:new Blob(['output'])}),newId:()=>Math.random()+'',rememberDraft:()=>{},
    saveComp:async()=>{},setStatus:()=>{},angleUI:()=>{}});
  vm.runInContext(source.slice(source.indexOf("$('saveAngle').onclick ="),source.indexOf('function exButton(')),ctx);
  await elements.saveAngle.onclick(); assert.equal(curComp.angles.length,1);
  assert.deepEqual(curComp.angles[0].edit,curComp.edit);
  curComp.angle='45° esquerda'; await elements.saveAngle.onclick(); assert.equal(curComp.angles.length,2);
  const saved = plain(curComp.angles); await elements.saveAngle.onclick(); assert.deepEqual(plain(curComp.angles),saved);
  curComp.angle='Perfil direito'; ctx.saveComp=async()=>{throw new Error('quota');};
  await elements.saveAngle.onclick(); assert.deepEqual(plain(curComp.angles),saved);
});
function deletionContext(fail = false) {
  const a = {id:'a',kind:'A'}, shared = {id:'shared',kind:'D'}, u = {id:'u',kind:'U'};
  const remove = {id:'remove',A:['a'],D:['shared'],U:['u'],angles:[{out:'saved'}]};
  const keep = {id:'keep',A:[],D:['shared'],U:[]};
  const writes=[];
  const {ctx,elements} = context({Pj:{rec:{comps:[remove,keep]},shots:[a,shared,u]},curComp:null,
    explorer:{kind:'projects',selected:new Set(['remove'])},explorerBusy:false,cloneValue:plain,confirm:()=>true,
    exCounts:()=>{},renderExplorer:async()=>{},setStatus:()=>{},
    DB:{commitProject:async(rec,shots,ids)=>{if(fail) throw Error('storage failure'); writes.push({rec:plain(rec),shots:plain(shots),ids:plain(ids)});}}});
  vm.runInContext(`const shotById = id => Pj.shots.find(s=>s.id===id); const antesList = () => Pj.shots.filter(s=>s.kind==='A'); const depOf = a => Pj.shots.find(s=>s.of===a.id); const projectPhotos = c => [...c.A,...c.D,...(c.U||[])].map(shotById).filter(Boolean);`,ctx);
  vm.runInContext(source.slice(source.indexOf('function detachShot('),source.indexOf('async function importToComp(')),ctx);
  vm.runInContext(source.slice(source.indexOf('async function exAction('),source.indexOf('async function classify(')),ctx);
  vm.runInContext(source.slice(source.indexOf("$('exDelete').onclick ="),source.indexOf("$('managePatients').onclick")),ctx);
  return {ctx,elements,writes};
}
test('batch project deletion preserves shared originals and commits the selected changes together', async()=>{
  const {ctx,elements,writes}=deletionContext(); await elements.exDelete.onclick();
  assert.equal(writes.length,1); assert.deepEqual(writes[0].ids.sort(),['a','u']);
  assert.deepEqual(writes[0].shots.map(s=>s.id),['shared']); assert.deepEqual(writes[0].rec.comps.map(c=>c.id),['keep']);
});
test('failed deletion restores the local view instead of reporting success',async()=>{
  const {ctx,elements,writes}=deletionContext(true); await elements.exDelete.onclick();
  assert.equal(writes.length,0); assert.deepEqual(plain(ctx.Pj.rec.comps.map(c=>c.id)),['remove','keep']);
  assert.deepEqual(plain(ctx.Pj.shots.map(s=>s.id)),['a','shared','u']); assert.match(ctx.explorer.notice,/storage failure/);
});
test('long press opens actions without navigating; a scroll cancels the press', () => {
  const handlers = {}, timers = new Map(); let seq = 0, opens = 0, menus = 0;
  const {ctx} = context({setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source.slice(source.indexOf('function bindCard('), source.indexOf('function menuButton(')),ctx);
  ctx.el = {addEventListener:(name,fn)=>handlers[name]=fn}; ctx.open=()=>opens++; ctx.menu=()=>menus++;
  vm.runInContext('bindCard(el,open,menu)',ctx);
  handlers.pointerdown({button:0,clientX:10,clientY:10}); const pending = [...timers.entries()][0]; timers.delete(pending[0]); pending[1]();
  handlers.pointerup(); handlers.click({preventDefault(){},stopPropagation(){}});
  assert.equal(menus,1); assert.equal(opens,0);
  handlers.pointerdown({button:0,clientX:10,clientY:10}); handlers.pointermove({clientX:10,clientY:40});
  assert.equal(timers.size,0);
  handlers.pointerdown({button:0,clientX:10,clientY:10}); handlers.pointerup(); handlers.click({});
  assert.equal(opens,1);
});
test('selected angles share image files immediately, with no ZIP or async preparation before share', async () => {
  let shared;
  const c = {date:'2026-10-08'}, angles = ['Frente','Perfil direito','45 esquerda'].map((name,i)=>({id:String(i),name,out:'data:image/jpeg;base64,/9j/2Q=='}));
  const {ctx,elements} = context({atob,slug:s=>s.toLowerCase().replaceAll(' ','-'),Pj:{rec:{name:'Teste'}},localDay:()=>'',
    navigator:{canShare:({files})=>files.every(f=>f.type==='image/jpeg'),share:({files})=>{shared=files;return Promise.resolve();}},
    setStatus:()=>{},explorerBusy:false,explorer:{kind:'angles',comp:c,selected:new Set(['0','2']),rows:angles.map(value=>({id:value.id,value}))},
    exAction:()=>{throw Error('Image export must not use the backup path');}});
  vm.runInContext(source.slice(source.indexOf('function angleFile('),source.indexOf('async function projectEntries(')),ctx);
  vm.runInContext(source.slice(source.indexOf("$('exDownload').onclick ="),source.indexOf("$('exDelete').onclick =")),ctx);
  const result = elements.exDownload.onclick();
  assert.equal(shared.length,2); assert.ok(shared.every(f=>f.name.endsWith('.jpg')));
  assert.match(shared[0].name,/frente/); assert.match(shared[1].name,/45-esquerda/);
  assert.deepEqual([...new Uint8Array(await shared[0].arrayBuffer())],[255,216,255,217]); await result;
});
test('cancelling the native gallery sheet does not start downloads or retry', async () => {
  let fallback = 0;
  const {ctx} = context({navigator:{canShare:()=>true,share:async()=>{const e=Error('cancelled');e.name='AbortError';throw e;}},overlay:()=>fallback++,setStatus:()=>{}});
  vm.runInContext(source.slice(source.indexOf('async function deliverImages('),source.indexOf('async function projectEntries(')),ctx);
  ctx.files=[new File(['image'],'photo.jpg',{type:'image/jpeg'})];
  await vm.runInContext('deliverImages(files)',ctx); assert.equal(fallback,0);
});
test('import routes two sessions to editor and three sessions to manual routing', async () => {
  for (const [count,existing] of [[2,false],[3,false],[2,true]]) {
    const added = Array.from({length:count},(_,i)=>({id:String(i),capturedAt:i*3600000}));
    let opens=0, picks=0;
    const {ctx,elements}=context({requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),curComp:{A:[],D:[],U:[]},PhotoDates:dates,explorer:null,
      rememberDraft:()=>{},projectPhotos:()=>existing?[{id:'old'}]:[],importToProject:async()=>added,shotById:id=>added.find(s=>s.id===id),
      DB:{put:async()=>{}},touchProj:async()=>{},saveComp:async()=>{},openPick:()=>picks++,setStatus:()=>{},renderExplorer:async()=>{},
      openExplorer:async()=>{opens++;ctx.explorer={};}});
    let importing=false;
    elements.importProgress={showModal:()=>{importing=true;},close:()=>{importing=false;}};
    vm.runInContext(source.slice(source.indexOf("$('importPool').onclick ="),source.indexOf("$('poolManage').onclick =")),ctx);
    await elements.filePool.onchange({target:{files:added,value:'files'}});
    assert.equal(picks,1); assert.equal(opens,count===2&&!existing?0:1);
    if(count===2&&!existing) { assert.deepEqual(plain(ctx.curComp.A),['0']); assert.deepEqual(plain(ctx.curComp.D),['1']); }
    else assert.equal(ctx.explorer.sessionMode,true);
    assert.equal(elements.importPool.disabled,false);
    assert.equal(importing,false);
  }
});
test('original background mode preserves the stored automatic mask',()=>{
  const mask=new Uint8Array([42]);
  const {ctx}=context({MAX_SRC:2200,RES:2,uid:0,Image:class{},queue:[],curComp:{edit:{backgroundRemoved:false,A:{id:'a',edge:9,plus:'paint'}}},analyse:()=>({}),screen:'edit'});
  ctx.shot={id:'a',w:300,h:400,prev:'test',mask,mc:1};
  vm.runInContext(source.slice(source.indexOf('function itemFromShot('),source.indexOf('function queueIt(')),ctx);
  const it=vm.runInContext("itemFromShot(shot,'A',true)",ctx);
  assert.equal(ctx.shot.mask[0],42);assert.deepEqual([...it.raw],[255,255,255,255]);assert.equal(it.edge,9);assert.equal(it.savedPaint.plus,'paint');
});
test('paint restores before being discarded from pending state',async()=>{
  const draw=[];
  const {ctx}=context({loadImg:async src=>({src})});
  vm.runInContext(source.slice(source.indexOf('async function restorePaint('),source.indexOf("let active =")),ctx);
  ctx.it={savedPaint:{plus:'plus.png',minus:'minus.png'},plus:{width:10,height:20,getContext:()=>({drawImage:im=>draw.push(im.src)})},minus:{width:10,height:20,getContext:()=>({drawImage:im=>draw.push(im.src)})}};
  await vm.runInContext('restorePaint(it)',ctx);assert.deepEqual(draw,['plus.png','minus.png']);assert.equal(ctx.it.edited,true);assert.equal(ctx.it.savedPaint,null);
});
test('camera close button waits for pending photos and returns to selection',async()=>{
  let complete,returned=0;
  const shotChain=new Promise(r=>complete=r);
  const {ctx,elements}=context({camMode:'A',camStream:null,trk:null,Pj:{},curComp:{},shotChain,setTimeout:()=>{},pump:()=>{},openPick:()=>returned++});
  vm.runInContext(source.slice(source.indexOf('function camClose(quiet)'),source.indexOf("$('camA').onclick")),ctx);
  vm.runInContext(source.match(/\$\('camClose'\)\.onclick = [^\n]+/)[0],ctx);
  elements.camClose.onclick({type:'click'});assert.equal(returned,0);complete();await shotChain;await Promise.resolve();assert.equal(returned,1);assert.equal(elements.cam.hidden,true);
});
test('finishing settings restore from saved edit and reset absent legacy values',()=>{
  const {ctx,elements}=context();
  vm.runInContext(source.slice(source.indexOf('const DEFAULT_OPTS'),source.indexOf('function snapshotEdit()')),ctx);
  vm.runInContext("restoreFinish({opts:{fade:.6,handTxt:'Saved',title:false}})",ctx);
  assert.equal(elements.fade.value,60);assert.equal(elements.handTxt.value,'Saved');assert.equal(elements.titleOn.checked,false);
  vm.runInContext('restoreFinish(null)',ctx);assert.equal(elements.fade.value,80);assert.equal(elements.titleOn.checked,true);
});
test('nested selection backup is recognized, missing photos rejected before restore',async()=>{
  const {ctx}=context();
  vm.runInContext(source.slice(source.indexOf('const CRC ='),source.indexOf('const unbacked =')),ctx);
  vm.runInContext(source.slice(source.indexOf('function backupPackages('),source.indexOf('async function restorePackage(')),ctx);
  ctx.meta={app:'prisma',project:{id:'p'},shots:[]};
  const inner=vm.runInContext("zip([{name:'projeto.json',data:new TextEncoder().encode(JSON.stringify(meta))}])",ctx);
  ctx.inner=new Uint8Array(await inner.arrayBuffer());
  const outer=vm.runInContext("zip([{name:'patient.zip',data:inner}])",ctx);ctx.buffer=await outer.arrayBuffer();
  assert.equal(vm.runInContext('backupPackages(buffer).length',ctx),1);
  ctx.meta.shots=[{file:'missing.jpg'}];
  const bad=vm.runInContext("zip([{name:'projeto.json',data:new TextEncoder().encode(JSON.stringify(meta))}])",ctx);ctx.buffer=await bad.arrayBuffer();
  assert.throws(()=>vm.runInContext('backupPackages(buffer)',ctx),/falta uma foto/);
});
test('restore commits complete patient once and remaps saved paint references',async()=>{
  const writes=[];let id=0;
  const {ctx}=context({URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},loadImg:async()=>({}),previews:()=>({prev:'p',thumb:'t',canvas:{}}),freeCanvas:()=>{},newId:()=>String(++id),
    DB:{get:async()=>({id:'old'}),commitProject:async(...args)=>writes.push(args)}});
  vm.runInContext(source.slice(source.indexOf('async function restorePackage('),source.indexOf("$('fileZip').onchange")),ctx);
  ctx.entry={files:{'a.jpg':new Uint8Array([1])},meta:{project:{id:'old',name:'Test',comps:[{id:'c',A:['a'],D:[],selA:'a',angles:[{selA:'a',edit:{A:{id:'a',plus:'paint'}}}]}]},shots:[{id:'a',kind:'A',file:'a.jpg',w:1,h:1}]}};
  await vm.runInContext('restorePackage(entry)',ctx);assert.equal(writes.length,1);
  const [rec,shots]=writes[0];assert.equal(rec.comps[0].angles[0].edit.A.id,shots[0].id);assert.equal(rec.comps[0].angles[0].edit.A.plus,'paint');assert.match(rec.name,/restaurado/);
  ctx.loadImg=async()=>{throw Error('bad image');};await assert.rejects(vm.runInContext('restorePackage(entry)',ctx),/bad image/);assert.equal(writes.length,1);
});
