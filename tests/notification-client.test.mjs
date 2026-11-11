import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import vm from 'node:vm';
import {createNotificationInbox} from '../src/workspace/notificationInbox.mjs';
// Cliente de avisos de Workspace (bandeja y trabajador). El servicio de envío vive en GBA-VISTA (api/workspace-push.js) y tiene su propia prueba allá.
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const first={items:[{id:'a',read_at:null}],unread_count:1,fetched_at:'2026-11-01T12:00:00Z'};
let calls=[],states=[];const queue=[];const box=createNotificationInbox((name,args)=>{calls.push({name,args});return queue.shift().promise;},s=>states.push(s));
let q=defer();queue.push(q);const initial=box.refresh();q.resolve(first);await initial;
const stale=defer();queue.push(stale);const pending=box.refresh();const ack=defer();queue.push(ack);const read=box.read();assert.equal(box.snapshot.reading,true);
// A new notification after the cutoff stays unread; an old in-flight query cannot restore the old flags.
ack.resolve({read:1,inbox:{...first,items:[{id:'a',read_at:'read'},{id:'b',read_at:null}],unread_count:1}});await read;stale.resolve(first);await pending;
assert.equal(box.snapshot.items[0].read_at,'read');assert.equal(box.snapshot.items[1].id,'b');assert.equal(box.snapshot.unread_count,1);assert.equal(calls[2].args.p_before,first.fetched_at);assert.equal(box.snapshot.reading,false);
q=defer();queue.push(q);const failure=box.read('b');q.reject(Error('Sin conexión'));assert.equal(await failure,null);assert.match(box.snapshot.error,/Sin conexión/);assert.equal(box.snapshot.items[1].read_at,null);
q=defer();queue.push(q);const exit=box.refresh();const count=states.length;box.dispose();q.resolve({items:[],unread_count:0});await exit;assert.equal(states.length,count);
// A service worker must show generic text and open a fresh, fixed-origin window.
const listeners={},shown=[],opened=[];let waited;
const self={location:{origin:'https://gba.software'},addEventListener:(k,v)=>listeners[k]=v,registration:{showNotification:async(...a)=>shown.push(a)},clients:{openWindow:async u=>opened.push(u),matchAll:async()=>[]}};
vm.runInNewContext(await fs.readFile('public/workspace/notification-worker.js','utf8'),{self,URL});
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
listeners.push({data:{json:()=>({v:1,owner,notificationId:id,deliveryId:id,title:'private',url:'https://evil.example'})},waitUntil:p=>waited=p});await waited;
assert.equal(shown.length,1);assert.equal(JSON.stringify(shown).includes('private'),false);assert.match(shown[0][1].tag,new RegExp(id));
listeners.notificationclick({notification:{data:{owner,notificationId:id},close(){}},waitUntil:p=>waited=p});await waited;assert.equal(opened.length,1);assert.equal(new URL(opened[0]).origin,'https://gba.software');assert.equal(new URL(opened[0]).pathname,'/workspace/web/');
// workspace.gba.software no tiene el servicio de avisos: sólo la consulta de configuración (GET) se reenvía a gba.software.
const routes=JSON.parse(await fs.readFile('vercel.json','utf8')).routes;
const pushRoute=routes.findIndex(r=>r.src==='^/api/workspace-push$');
assert.ok(pushRoute>=0,'falta la ruta de configuración de avisos');
assert.deepEqual(routes[pushRoute],{src:'^/api/workspace-push$',methods:['GET'],dest:'https://gba.software/api/workspace-push'});
assert.ok(pushRoute<routes.findIndex(r=>r.handle==='filesystem'));
assert.equal(routes.filter(r=>String(r.dest||'').startsWith('http')).length,1,'ninguna otra ruta sale del dominio');
assert.match(await fs.readFile('src/workspace/devicePush.mjs','utf8'),/fetch\('\/api\/workspace-push',\{cache:'no-store'\}\)/);
// La pasarela de archivos acepta la web nueva (workspace.gba.software) con origen exacto, sin comodines.
const gatewayOrigins=(await fs.readFile('cloudflare/workspace-originals/wrangler.jsonc','utf8')).match(/"ALLOWED_ORIGINS":\s*"([^"]+)"/)[1].split(',');
for(const origin of ['https://workspace.gba.software','https://gba.software','https://www.gba.software','https://vista.gba.software'])assert.ok(gatewayOrigins.includes(origin),origin);
assert.ok(!gatewayOrigins.some(origin=>origin.includes('*')));
console.log('PASS: notification acknowledgment races, preserved new arrivals, disposal, safe service-worker delivery, push configuration route and gateway origin for the web domain.');
