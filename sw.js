// Dois caches. C = código do app, troca a cada versão (menos de 1 MB).
// M = modelos e motor de IA (~40 MB), sobrevive às atualizações do app: só mude o nome de M quando um desses arquivos mudar.
// O modelo de reserva (m/*.wasm, 44 MB) não é baixado na instalação: só no dia em que o recorte precisar dele, e aí fica em M.
const C='ad-app-v43', M='prisma-modelos-1';
const F=["./", "index.html", "photo-dates.js", "import-tools.js", "import-metadata-worker.js", "editor-actions.js", "mask-refinement.js", "pair-match.js", "aiw.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
const MF=["ort.wasm.min.js", "modnet.onnx", "ort-wasm-simd.wasm", "ort-wasm.wasm", "fm/face_mesh.binarypb", "fm/face_mesh.js", "fm/face_mesh_solution_packed_assets.data", "fm/face_mesh_solution_packed_assets_loader.js", "fm/face_mesh_solution_simd_wasm_bin.data", "fm/face_mesh_solution_simd_wasm_bin.js", "fm/face_mesh_solution_simd_wasm_bin.wasm", "fm/face_mesh_solution_wasm_bin.js", "fm/face_mesh_solution_wasm_bin.wasm"];
const isModel=p=>/\/(m|fm)\/[^/]+$/.test(p)||/\/(modnet\.onnx|ort-wasm(-simd)?\.wasm|ort\.wasm\.min\.js)$/.test(p);
self.addEventListener('install',e=>{e.waitUntil(Promise.all([
  caches.open(C).then(c=>c.addAll(F.map(u=>new Request(u,{cache:'reload'})))),
  caches.open(M).then(async c=>{for(const u of MF)if(!await c.match(u))await c.add(new Request(u,{cache:'reload'}));})
]).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>(x.startsWith('ad-')&&x!==C)||(x.startsWith('prisma-modelos-')&&x!==M)).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(new URL(e.request.url).pathname.includes('/termos/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put('index.html',c));return r}).catch(()=>caches.match('index.html')));return}const p=new URL(e.request.url).pathname;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{if(res.ok&&isModel(p)){const c=res.clone();caches.open(M).then(x=>x.put(e.request,c))}return res})))});
