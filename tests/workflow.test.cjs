const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'),'utf8');
const dates = require('../photo-dates.js');
const plain = value => JSON.parse(JSON.stringify(value));
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
  const ctx = vm.createContext({console,Blob,File,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,fetch,Date,
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
  const curComp = {id:'c',angle:'Frente',angles:[],selA:'a',selD:'d',tf:{A:{s:1},D:{s:1}}};
  class Reader { readAsDataURL() { this.result='data:image/jpeg;base64,AQID'; queueMicrotask(()=>this.onload()); } }
  const {ctx,elements} = context({curComp,linked:true,savingAngle:false,cloneValue:plain,confirm:()=>false,FileReader:Reader,
    savePair:()=>{},makeFile:()=>({blob:new Blob(['output'])}),newId:()=>Math.random()+'',rememberDraft:()=>{},
    saveComp:async()=>{},setStatus:()=>{},angleUI:()=>{}});
  vm.runInContext(source.slice(source.indexOf("$('saveAngle').onclick ="),source.indexOf('function exButton(')),ctx);
  await elements.saveAngle.onclick(); assert.equal(curComp.angles.length,1);
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
  for (const count of [2,3]) {
    const added = Array.from({length:count},(_,i)=>({id:String(i),capturedAt:i*3600000}));
    let opens=0, picks=0;
    const {ctx,elements}=context({curComp:{A:[],D:[],U:[]},PhotoDates:dates,explorer:null,
      rememberDraft:()=>{},importToProject:async()=>added,shotById:id=>added.find(s=>s.id===id),
      DB:{put:async()=>{}},touchProj:async()=>{},saveComp:async()=>{},openPick:()=>picks++,setStatus:()=>{},renderExplorer:async()=>{},
      openExplorer:async()=>{opens++;ctx.explorer={};}});
    vm.runInContext(source.slice(source.indexOf("$('importPool').onclick ="),source.indexOf("$('poolManage').onclick =")),ctx);
    await elements.filePool.onchange({target:{files:added,value:'files'}});
    assert.equal(picks,1); assert.equal(opens,count===2?0:1);
    if(count===2) { assert.deepEqual(plain(ctx.curComp.A),['0']); assert.deepEqual(plain(ctx.curComp.D),['1']); }
    else assert.equal(ctx.explorer.sessionMode,true);
    assert.equal(elements.importPool.disabled,false);
  }
});
