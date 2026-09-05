const CACHE='dlr-masters-finals-v3.1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-finals-192.png','./icon-finals-512.png','./icon-finals-maskable.png','./logo.png','./favicon.png','./apple-touch-icon.png','./finals.js','./finals.css'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dlr-masters-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Cache only application assets, never API responses or tournament data.
  if(!SHELL.some(path=>new URL(path,self.registration.scope).href===url.href))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,clone)));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
