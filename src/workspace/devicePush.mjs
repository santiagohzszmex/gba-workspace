import { isAppleMobile, isWorkspaceStandalone } from './pwa.mjs';
import { nativeWorkspace, registerWorkspaceWorker, WORKSPACE_WORKER_SCOPE } from './workspaceServiceWorker.mjs';

export { nativeWorkspace };
export const DEVICE_SETUP_URL='https://gba.software/workspace/web/?device-notifications=1';
export const supportsDevicePush=()=>Boolean((!isAppleMobile()||isWorkspaceStandalone())&&globalThis.isSecureContext&&globalThis.navigator?.serviceWorker&&globalThis.PushManager&&globalThis.Notification);
const keyFor=actor=>`workspace-push-device:${actor}`;
export function deviceId(actor){try{return localStorage.getItem(keyFor(actor));}catch{return null;}}
function remember(actor,id){try{if(id)localStorage.setItem(keyFor(actor),id);else localStorage.removeItem(keyFor(actor));}catch{/* Storage is optional; the server device list still works. */}}
export async function prepareDevicePush(){
 if(!supportsDevicePush())throw Error('Este dispositivo no admite avisos de Workspace.');
 const [registration,config]=await Promise.all([
  registerWorkspaceWorker(),
  fetch('/api/workspace-push',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('El servicio de avisos no está disponible.');return r.json();})
 ]);
 if(!config.enabled||!config.publicKey)throw Error('El servicio de avisos aún no está configurado.');
 if(!registration.active)await new Promise((resolve,reject)=>{
  const worker=registration.installing||registration.waiting;if(!worker)return reject(Error('Vuelve a intentar activar los avisos.'));
  const changed=()=>{if(worker.state==='activated'){worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){worker.removeEventListener('statechange',changed);reject(Error('No se pudo activar el servicio de avisos.'));}};
  worker.addEventListener('statechange',changed);changed();
 });
 const publicKey=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 return {registration,publicKey,subscription:await registration.pushManager.getSubscription()};
}

export async function enableDevicePush(actor,call,prepared){
 const {registration,publicKey}=prepared;
 const subscribe=()=>registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
 let {subscription}=prepared;
 if(subscription?.options.applicationServerKey&&String(new Uint8Array(subscription.options.applicationServerKey))!==String(publicKey)){await subscription.unsubscribe();subscription=null;}
 // En Safari la primera suscripción debe arrancar dentro del toque, antes de esperar a la red.
 try{subscription ||= await subscribe();}catch(error){
  if(error.name==='NotAllowedError'||Notification.permission==='denied')throw Error('Permite las notificaciones de Workspace en los ajustes del dispositivo.');
  throw error;
 }
 prepared.subscription=subscription;
 const register=()=>call('workspace_push_preferences',{p_action:'register',p_data:{subscription:subscription.toJSON(),label:`${/Mac/.test(navigator.platform)?'Mac':/Win/.test(navigator.platform)?'Windows':'Dispositivo'} · ${/Firefox/.test(navigator.userAgent)?'Firefox':/Edg\//.test(navigator.userAgent)?'Edge':/Chrome\//.test(navigator.userAgent)?'Chrome':'Safari / navegador'}`}});
 let result;
 try{result=await register();}catch(error){
  // Reutilizar una suscripción de otra cuenta nunca transfiere sus permisos.
  if(error.code!=='23505')throw error;
  await subscription.unsubscribe();prepared.subscription=null;subscription=await subscribe();prepared.subscription=subscription;result=await register();
 }
 remember(actor,result.id);return result;
}
export async function disableDevicePush(actor,id,call){
 await call('workspace_push_preferences',{p_action:'disable',p_data:{id}});
 if(deviceId(actor)===id){
  remember(actor,null);
  const registration=await navigator.serviceWorker?.getRegistration(WORKSPACE_WORKER_SCOPE);
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
  for(const notice of await registration?.getNotifications()||[])if(notice.data?.owner===actor)notice.close();
 }
}
export async function closeReadDeviceNotices(actor,inbox){
 if(!globalThis.navigator?.serviceWorker)return;
 const registration=await navigator.serviceWorker.getRegistration(WORKSPACE_WORKER_SCOPE);if(!registration)return;
 // La bandeja contiene los últimos 60 avisos: sólo se cierran los que constan como leídos.
 const read=new Set(inbox.items.filter(n=>n.read_at).map(n=>n.id));
 for(const notice of await registration.getNotifications())if(notice.data?.owner===actor&&read.has(notice.data?.notificationId))notice.close();
}
