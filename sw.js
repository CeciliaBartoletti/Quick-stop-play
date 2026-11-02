const CACHE='quickgirls-v2';
const ASSETS=['/','/style.css','/app.js','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/socket.io/')||u.pathname.startsWith('/api/')||u.pathname==='/health')return;
  // In una web app multiplayer il contenuto live si ottiene sempre dalla rete.
  e.respondWith(fetch(e.request).then(response=>{if(response.ok&&ASSETS.includes(u.pathname)){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;}).catch(()=>caches.match(e.request)));
});
