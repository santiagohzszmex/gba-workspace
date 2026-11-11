import {inspectPngHeader} from './pngHeader.mjs';
import {inspectLayered} from './layered.mjs';
import {cloudflareProcessor} from './previews.mjs';
import {inspectMp4} from './mp4.mjs';
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const problem=(message,status=400)=>Object.assign(Error(message),{status});
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const un64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
function publicSession(s){return {id:s.id,asset_id:s.asset.id,deliverable_id:s.asset.deliverable_id,state:s.state,size_bytes:s.asset.size_bytes,sha256:s.asset.sha256,file_name:s.asset.file_name,format:s.asset.format,role:s.asset.role,verification:s.asset.verification,width:s.asset.width,height:s.asset.height,received_bytes:s.received_bytes,parts:s.parts.map(({partNumber,size_bytes,sha256})=>({partNumber,size_bytes,sha256})),expires_at:s.expires_at,part_bytes:s.policy.part_bytes,preview_state:s.preview_state||'pending'};}
function rangeFile(bucket,asset){return {size:asset.size_bytes,slice(start,end){start=Math.max(0,Math.min(start,asset.size_bytes));end=Math.max(start,Math.min(end,asset.size_bytes));return {async arrayBuffer(){const size=end-start;if(size<=0)return new ArrayBuffer(0);const obj=await bucket.get(asset.object_key,{range:{offset:start,length:size}});if(!obj?.body)throw problem('Original no disponible.',502);const bytes=await obj.arrayBuffer();if(bytes.byteLength!==size)throw problem('Original truncado.',502);return bytes;}};}};}
function missingUpload(error){return error?.code==='NoSuchUpload'||/NoSuchUpload|multipart upload (does not exist|has been aborted|was not found)/i.test(error?.message||'');}
export function createImageGateway({completionHash=null,fetcher=fetch,logger=console,processorFactory=env=>cloudflareProcessor(env.IMAGES),digestFactory=()=>new crypto.DigestStream('SHA-256'),fixedLength=n=>new FixedLengthStream(n),now=()=>Date.now()}={}){
 async function hashStream(stream,expected){const digest=digestFactory(),writer=digest.getWriter(),reader=stream.getReader();let size=0;digest.digest.catch(()=>{});
  try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>expected)throw problem('El tamaño del original no coincide.');await writer.write(n.value);}if(size!==expected)throw problem('El tamaño del original no coincide.');await writer.close();return hex(await digest.digest);}catch(error){await writer.abort(error).catch(()=>{});await reader.cancel().catch(()=>{});throw error;}}
 function rpcFor(env,bearer){return async(name,data)=>{
  const response=await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(bearer?{Authorization:bearer}:{})},body:JSON.stringify({...data,p_gateway_key:env.GATEWAY_KEY})});
  const result=await response.json();if(!response.ok)throw problem(result.message||'No se pudo autorizar el archivo.',response.status===401||response.status===403?403:result.code==='40001'?409:400);return result;
 };}
 const storage=(rpc,action,data)=>rpc('workspace_image_storage',{p_action:action,p_data:data});
 const machine=(rpc,action,data={})=>rpc('workspace_image_maintenance',{p_action:action,p_data:data});
 async function cleanSession(env,rpc,s){
  if(s.upload_id){try{await env.ORIGINALS.resumeMultipartUpload(s.asset.object_key,s.upload_id).abort();}catch(error){if(!missingUpload(error))throw error;}}
  await env.ORIGINALS.delete(s.asset.object_key);if(await env.ORIGINALS.head(s.asset.object_key))throw problem('No se confirmó la eliminación; la reserva se conserva.',502);
  return machine(rpc,'cleanup.confirm',{session_id:s.id,lease_id:s.lease_id,deleted:true});
 }
 async function processPreview(env,rpc,assetId){
  const processor=processorFactory(env),job=await machine(rpc,'preview.claim',{asset_id:assetId,processor:processor.id});if(!job)return;
  let code=null;
  try{
   const variants=await processor.generate({policy:job.policy,asset:job.asset,source:async()=>{const object=await env.ORIGINALS.get(job.asset.object_key);if(!object?.body)throw Error('Original unavailable');return object.body;}});
   if(variants.length!==2||new Set(variants.map(x=>x.kind)).size!==2)throw Error('Incomplete preview variants');
   for(const variant of variants){
    if(!variant.metadata_stripped||!['thumbnail','preview'].includes(variant.kind))throw Error('Unverified preview');
    const sha256=hex(await crypto.subtle.digest('SHA-256',variant.body));
    const row=await machine(rpc,'preview.reserve',{asset_id:job.asset_id,lease_id:job.lease_id,kind:variant.kind,size_bytes:variant.body.byteLength,sha256,width:variant.width,height:variant.height});
    if(row.state!=='ready'){
     const object=await env.ORIGINALS.put(row.object_key,variant.body,{sha256:unhex(sha256),httpMetadata:{contentType:'image/webp'},storageClass:'Standard',onlyIf:new Headers({'If-None-Match':'*'})});
     const stored=object||await env.ORIGINALS.head(row.object_key);
     if(!stored||stored.size!==row.size_bytes||hex(stored.checksums?.sha256||new ArrayBuffer(0))!==sha256)throw Error('Preview integrity mismatch');
     await machine(rpc,'preview.commit',{asset_id:job.asset_id,lease_id:job.lease_id,reservation_id:row.id,written:true});
    }
   }
  }catch(error){code=error.code||(/9402/.test(error.message)?'binding_input_too_large':'preview_unavailable');}
  const finished=await machine(rpc,'preview.finish',{asset_id:job.asset_id,lease_id:job.lease_id,error_code:code});
  return {state:finished.state,message:finished.state!=='ready'?'Vista previa no disponible; descarga el original':null};
 }
 function unhex(text){return Uint8Array.from(text.match(/../g)||[],x=>parseInt(x,16));}
 async function signature(env,text){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.GATEWAY_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return {key,bytes:new TextEncoder().encode(`workspace-image-download:v1:${text}`)};}
 const result={
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
  const headers={'Referrer-Policy':'no-referrer','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",...(origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Range','Access-Control-Expose-Headers':'X-Original-Sha256, Content-Range, Content-Length, Accept-Ranges','Access-Control-Max-Age':'600'}:{})};
  const json=(body,status=200)=>Response.json(body,{status,headers});let rpc,s,lease;
  try{
   if(origin&&!allowed.includes(origin))throw problem('Origen no autorizado.',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(!env.ORIGINALS||!env.GATEWAY_KEY||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw problem('Almacenamiento pendiente de conexión.',503);
   const download=url.pathname.match(new RegExp(`^/image-downloads/(${uuid})/(original|preview|thumbnail|stream)$`,'i'));
   if(download&&request.method==='GET'){
    const token=url.searchParams.get('token')||'';if(token.length>4096||!token.includes('.'))throw problem('Enlace inválido.',403);
    const [body,sig,...extra]=token.split('.');if(extra.length)throw problem('Enlace inválido.',403);
    let data,signatureBytes;try{signatureBytes=un64(sig);if(b64(signatureBytes)!==sig||b64(un64(body))!==body)throw Error();data=JSON.parse(new TextDecoder().decode(un64(body)));}catch{throw problem('Enlace inválido.',403);}
    const signed=await signature(env,body);
    if(!await crypto.subtle.verify('HMAC',signed.key,signatureBytes,signed.bytes))throw problem('Enlace inválido.',403);
    if(!Number.isSafeInteger(data.expires)||data.expires<=Math.floor(now()/1000)||data.asset_id!==download[1]||data.operation!==download[2])throw problem('El enlace venció o no corresponde al archivo.',403);
    rpc=rpcFor(env);const file=await rpc('workspace_image_file',{p_data:{...data,redeem:true}});
    if(!file.available)throw problem('Vista previa no disponible; descarga el original.',404);
    const range=request.headers.get('Range');let offset=0,length=file.size_bytes;
    if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)throw problem('Rango inválido.',416);offset=Number(match[1]);const end=match[2]?Number(match[2]):file.size_bytes-1;if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset>=file.size_bytes||end<offset)throw problem('Rango fuera del archivo.',416);length=Math.min(end,file.size_bytes-1)-offset+1;}
    const object=await env.ORIGINALS.get(file.object_key,range?{range:{offset,length}}:undefined);if(!object?.body||object.size!==file.size_bytes)throw problem('Original no disponible o tamaño incorrecto.',502);
    if(object.checksums?.sha256&&hex(object.checksums.sha256)!==file.sha256)throw problem('La integridad del archivo no coincide.',502);
    return new Response(object.body,{status:range?206:200,headers:{...headers,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${file.size_bytes}`} : {}),'Content-Type':file.mime_type,'Content-Length':String(length),'X-Original-Sha256':file.sha256,'Content-Disposition':`${file.operation==='original'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`}});
   }
   const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))throw problem('Inicia sesión para acceder a los archivos.',401);
   // Connector tokens use their own reviewed dispatcher; not interpreted as JWTs.
   if(bearer.startsWith('Bearer wsc_'))throw problem('Esta operación requiere una sesión de GBA ID.',403);
   rpc=rpcFor(env,bearer);
   const sign=url.pathname.match(new RegExp(`^/images/files/(${uuid})/(original|preview|thumbnail|stream)/link$`,'i'));
   if(sign&&request.method==='POST'){
    const file=await rpc('workspace_image_file',{p_data:{asset_id:sign[1],operation:sign[2]}});if(!file.available)return json(file);
    const data={asset_id:file.asset_id,file_id:file.file_id,operation:file.operation,user_id:file.user_id,session_id:file.session_id,expires:Math.floor(now()/1000)+file.ttl};
    const body=b64(new TextEncoder().encode(JSON.stringify(data))),signed=await signature(env,body),sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',signed.key,signed.bytes)));
    const link=new URL(`/image-downloads/${file.asset_id}/${file.operation}`,url.origin);link.searchParams.set('token',`${body}.${sig}`);
    return json({available:true,url:link.href,expires_at:new Date(data.expires*1000).toISOString()});
   }
   const route=url.pathname.match(new RegExp(`^/images/uploads/(${uuid})(?:/(complete|parts/([0-9]+)))?$`,'i'));
   if(url.pathname==='/images/uploads'&&request.method==='POST'){
    const body=await boundedJson(request);s=await storage(rpc,'open',body);
    if(!s.upload_id&&s.state!=='ready'){
     s=await storage(rpc,'lock',{session_id:s.id,operation:'begin'});lease=s.lease_id;
     if(!s.upload_id){const upload=await env.ORIGINALS.createMultipartUpload(s.asset.object_key,{httpMetadata:{contentType:s.asset.mime_type},customMetadata:{sha256:s.asset.sha256},storageClass:'Standard'});
      try{s=await storage(rpc,'attach',{session_id:s.id,lease_id:lease,upload_id:upload.uploadId});}catch(error){await upload.abort().catch(()=>{});throw error;}}
    }
    return json(publicSession(s),201);
   }
   if(!route)throw problem('Ruta no disponible.',404);
   const id=route[1],action=route[2];
   if(request.method==='GET'&&!action){s=await storage(rpc,'status',{session_id:id});return json(publicSession(s));}
   if(request.method==='DELETE'&&!action){
    s=await storage(rpc,'lock',{session_id:id,operation:'cancel'});lease=s.lease_id;if(s.state==='ready')throw problem('El archivo ya se guardó; no se elimina al cancelar una subida.',409);
    await cleanSession(env,rpc,s);return json({cancelled:true});
   }
   if(request.method==='PUT'&&route[3]){
    s=await storage(rpc,'lock',{session_id:id,operation:'part'});lease=s.lease_id;if(s.state==='ready')return json(publicSession(s));
    const number=Number(route[3]),expected=Math.min(s.policy.part_bytes,s.asset.size_bytes-(number-1)*s.policy.part_bytes);
    if(!Number.isSafeInteger(number)||number<1||expected<=0||!request.body)throw problem('Parte inválida.');
    const digest=digestFactory(),writer=digest.getWriter();digest.digest.catch(()=>{});let size=0;
    const hashing=new TransformStream({async transform(chunk,controller){size+=chunk.length;if(size>expected)throw problem('La parte supera su tamaño.');await writer.write(chunk);controller.enqueue(chunk);},async flush(){if(size!==expected)throw problem('Parte incompleta.');await writer.close();}});
    const fixed=fixedLength(expected),abort=new AbortController();let pumping;
    try{
     pumping=request.body.pipeThrough(hashing).pipeTo(fixed.writable,{signal:abort.signal});
     const [part]=await Promise.all([env.ORIGINALS.resumeMultipartUpload(s.asset.object_key,s.upload_id).uploadPart(number,fixed.readable),pumping]);
     const sha256=hex(await digest.digest);s=await storage(rpc,'part',{session_id:id,lease_id:lease,part_number:number,size_bytes:size,sha256,etag:part.etag});
     return json(publicSession(s));
    }catch(error){abort.abort();await pumping?.catch(()=>{});await writer.abort(error).catch(()=>{});throw error;}
   }
   if(request.method==='POST'&&action==='complete'){
    s=await storage(rpc,'lock',{session_id:id,operation:'complete'});lease=s.lease_id;if(s.state==='ready')return json(publicSession(s));
    const count=Math.ceil(s.asset.size_bytes/s.policy.part_bytes);
    if(s.parts.length!==count||s.received_bytes!==s.asset.size_bytes||s.parts.some((p,i)=>p.partNumber!==i+1))throw problem('Faltan partes por subir.');
    let object=await env.ORIGINALS.head(s.asset.object_key);
    if(!object)object=await env.ORIGINALS.resumeMultipartUpload(s.asset.object_key,s.upload_id).complete(s.parts.map(({partNumber,etag})=>({partNumber,etag})));
    if(object.size!==s.asset.size_bytes)throw problem('El tamaño del original no coincide.');
    const verifyFull=async()=>{const original=await env.ORIGINALS.get(s.asset.object_key);if(!original?.body)throw problem('Original no disponible.',502);return hashStream(original.body,s.asset.size_bytes);};
    // Video: cada parte ya se calculó en el servidor al recibirla; releer 300 MB completos rebasaría el límite de CPU.
    // La huella completa del video queda como declaración del cliente (sha256_source en la base de datos).
    const sha256=s.asset.role==='video'?s.asset.sha256:completionHash?await completionHash({request,env,asset:s.asset,verifyFull}):await verifyFull();if(sha256!==s.asset.sha256)throw problem('La integridad del original no coincide.');
    let info;
    try{if(s.asset.role==='png')info=await inspectPngHeader(rangeFile(env.ORIGINALS,s.asset),s.policy);else if(s.asset.role==='video')info=await inspectMp4(rangeFile(env.ORIGINALS,s.asset));else info=await inspectLayered(rangeFile(env.ORIGINALS,s.asset),s.asset.format,s.policy);}
    catch(error){throw problem(error.message);}
    s=await storage(rpc,'verified',{session_id:id,lease_id:lease,sha256,size_bytes:s.asset.size_bytes,...info});lease=null;
    let preview={state:'disabled'};if(s.asset.role==='png'&&s.policy.derivatives_enabled){
     try{preview=await processPreview(env,rpc,s.asset.id)||{state:'pending'};}catch{preview={state:'unavailable',message:'Vista previa no disponible; descarga el original'};}
    }
    if(s.asset.role==='video')return json({...publicSession(s),duration_ms:info.duration_ms,preview_state:'not_applicable',message:'Video guardado. Ya puedes enviarlo a revisión.'});
    return json({...publicSession(s),preview_state:preview.state,message:preview.message||'Original guardado. La aprobación del área se realiza por separado.'});
   }
   throw problem('Ruta no disponible.',404);
  }catch(error){
   // Deterministic invalid files are quarantined until R2 deletion is confirmed.
   if(s&&lease&&url.pathname.endsWith('/complete')&&error.status===400&&/PNG inválido|integridad|tamaño del original|PSD|TIFF|ZIP|KRA|MP4|QuickTime|H\.264|720p|dura más|audio|Video inválido|Video en formato/i.test(error.message)){
    try{await storage(rpc,'failed',{session_id:s.id,lease_id:lease});lease=null;const job=await machine(rpc,'cleanup.claim',{session_id:s.id});if(job)await cleanSession(env,rpc,job);}catch{}
   }
   logger.error(JSON.stringify({message:'Image gateway operation failed',status:error.status||502}));
   return json({error:error.status?error.message:'No se pudo completar la operación. Puedes reanudar la subida.'},error.status||502);
  }finally{if(s&&lease&&rpc)await storage(rpc,'unlock',{session_id:s.id,lease_id:lease}).catch(()=>{});}
 },
 async scheduled(_controller,env){
  const rpc=rpcFor(env);let cleaned=0;
  for(let i=0;i<5;i++){const job=await machine(rpc,'cleanup.claim');if(!job)break;try{await cleanSession(env,rpc,job);cleaned++;}catch{logger.error('Image cleanup postponed; quota retained');}}
  try{await processPreview(env,rpc);}catch{logger.error('Image preview job postponed');}
  // Copias de video viejas: se borran después de publicar; la cuota se libera sólo con el borrado confirmado.
  let purged=0;
  for(let i=0;i<5;i++){let job;try{job=await machine(rpc,'video.purge.claim');}catch{logger.error('Video purge unavailable');break;}if(!job)break;try{await env.ORIGINALS.delete(job.object_key);if(await env.ORIGINALS.head(job.object_key))throw Error('unconfirmed');await machine(rpc,'video.purge.confirm',{asset_id:job.asset_id,lease_id:job.lease_id,deleted:true});purged++;}catch{logger.error('Video purge postponed; quota retained');}}
  const derivative=await machine(rpc,'derived.claim');if(derivative){await env.ORIGINALS.delete(derivative.object_key);if(await env.ORIGINALS.head(derivative.object_key))throw Error('Preview deletion unconfirmed');await machine(rpc,'derived.confirm',{reservation_id:derivative.id,lease_id:derivative.cleanup_lease,deleted:true});}
  return {cleaned,purged};
 }
 };
 return result;
}
async function boundedJson(request){const reader=request.body?.getReader();if(!reader)throw problem('Datos vacíos.');const chunks=[];let size=0;
 try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>32768)throw problem('Solicitud demasiado grande.',413);chunks.push(n.value);}const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(all));}catch(error){await reader.cancel().catch(()=>{});throw error.status?error:problem('Datos inválidos.');}}
