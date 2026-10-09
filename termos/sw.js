const C='lqt-v3';const F=['./','index.html','catalogo.js','shade.jpg','grain.png','jspdf.umd.min.js','logo.png','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('lqt-')&&x!==C&&x!==C+'-f').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.hostname.includes('fonts.g')){e.respondWith(caches.open(C+'-f').then(c=>c.match(r).then(h=>h||fetch(r).then(x=>{c.put(r,x.clone());return x}))));return}
 if(u.pathname.endsWith('status.json')){e.respondWith(fetch(r,{cache:'no-store'}).catch(()=>new Response('{}',{headers:{'Content-Type':'application/json'}})));return}
 if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).then(x=>{const y=x.clone();caches.open(C).then(c=>c.put('index.html',y));return x}).catch(()=>caches.match('index.html')));return}
 e.respondWith(fetch(r,{cache:'no-cache'}).then(x=>{if(x.ok){const y=x.clone();caches.open(C).then(c=>c.put(r,y));}return x}).catch(()=>caches.match(r,{ignoreSearch:true})))});
