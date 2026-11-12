/* Instalación web y avisos comparten el registro de /workspace/. */
const shell = self.WORKSPACE_APP_SHELL;
const cachePrefix = 'workspace-app-shell:';
const cacheName = shell && cachePrefix + shell.version;
const staticPaths = new Set(shell?.assets || []);
const offlineHtml = `<!doctype html>
<html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#fafafb"><title>Sin conexión · Workspace</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f2f5;color:#302d36;font:16px/1.5 system-ui}main{box-sizing:border-box;width:min(100%,31rem);padding:2rem}h1{margin:0}a{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border-radius:.5rem;background:#302d36;color:white;text-decoration:none}</style>
<main><p>Workspace · GIMG</p><h1>Sin conexión</h1><p>Vuelve a conectarte para abrir tus producciones y documentos.</p><a href="/workspace/web/">Volver a intentar</a></main></html>`;

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (cacheName) {
      try {
        const old = (await caches.keys()).filter(key => key.startsWith(cachePrefix) && key !== cacheName);
        await Promise.all(old.map(key => caches.delete(key)));
      } catch { /* El almacenamiento puede estar deshabilitado. */ }
    }
    await self.clients.claim();
  })());
});

async function readStatic(url) {
  let cache;
  try {
    cache = await caches.open(cacheName);
    const stored = await cache.match(url.href);
    if (stored) return stored;
  } catch { /* Una caché llena o deshabilitada no impide usar la web. */ }

  const response = await fetch(url.href, { credentials: 'omit', redirect: 'error' });
  const type = response.headers.get('content-type') || '';
  const policy = response.headers.get('cache-control') || '';
  const vary = response.headers.get('vary') || '';
  if (cache && response.status === 200 && response.url === url.href &&
      /^(?:(?:text|application)\/(?:css|javascript|wasm)|image\/|font\/)/i.test(type) &&
      !/\b(private|no-store)\b/i.test(policy) && !/(cookie|authorization|\*)/i.test(vary)) {
    try { await cache.put(url.href, response.clone()); } catch { /* La respuesta de red sigue disponible. */ }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && ['/workspace/web', '/workspace/web/', '/workspace/web/index.html'].includes(url.pathname)) {
    // El HTML siempre viene de la red. Sin red se muestra una página genérica.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() =>
      new Response(offlineHtml, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
    return;
  }
  if (request.mode !== 'navigate' && !url.search && !request.headers.has('Range') && staticPaths.has(url.pathname)) {
    event.respondWith(readStatic(url));
  }
});

const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{return;}
 if(data.v!==1||!validId(data.owner)||!validId(data.deliveryId)||(data.notificationId!==null&&!validId(data.notificationId)))return;
 event.waitUntil(self.registration.showNotification(data.test?'Avisos de Workspace activados':'Workspace · Tienes una actualización',{
  body:data.test?'Este dispositivo ya puede recibir tus avisos.':'Abre Workspace para consultar el aviso con tu GBA ID.',
  icon:'/workspace/notification-icon.png',badge:'/workspace/notification-icon.png',
  tag:`workspace:${data.owner}:${data.notificationId||data.deliveryId}`,renotify:false,
  data:{owner:data.owner,notificationId:data.notificationId}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL('/workspace/web/',self.location.origin),id=event.notification.data?.notificationId;
 if(validId(id))url.searchParams.set('notification',id);
 // Abrir otra ventana conserva los documentos que se están editando.
 event.waitUntil(self.clients.openWindow(url.href));
});
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients)client.postMessage({type:'workspace-push-expired'});}));
});
