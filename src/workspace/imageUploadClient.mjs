// No UI, token persistence or file-system access. Phase 3 supplies these adapters.
// Stopping a fetch pauses the upload; cancel() explicitly deletes its parts.
export function createImageUploader({gateway,authorization,hashFile,persist=async()=>{},fetcher=fetch,onProgress=()=>{}}){
 const base=new URL(gateway);if((base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))||base.username||base.password)throw Error('Pasarela inválida');
 const call=async(path,options={},signal)=>{
  const bearer=await authorization();if(!bearer)throw Error('Inicia sesión en Workspace');
  const response=await fetcher(new URL(path,base),{...options,headers:{...(options.headers||{}),Authorization:bearer},signal});
  let body;try{body=await response.json();}catch{throw Error('La conexión se interrumpió; puedes reanudar la subida');}
  if(!response.ok)throw Object.assign(Error(body.error||'No se pudo completar la subida'),{status:response.status});return body;
 };
 const json=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 return {
  async prepare(file,{ownerId,deliverableId,role,format,requestId=crypto.randomUUID()}){
   if(!ownerId||!file?.size||!hashFile)throw Error('Falta el original o el adaptador de integridad');
   const sha256=await hashFile(file);if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('Huella de integridad inválida');
   const plan={request_id:requestId,owner_id:ownerId,deliverable_id:deliverableId,role,format,file_name:file.name,size_bytes:file.size,sha256};await persist(plan);return plan;
  },
  async upload(plan,file,{ownerId,signal}={}){
   if(ownerId!==plan.owner_id)throw Error('La subida pertenece a otra cuenta');
   if(file.size!==plan.size_bytes||file.name!==plan.file_name||await hashFile(file)!==plan.sha256)throw Error('El archivo cambió; selecciona el mismo original para reanudar');
   if(signal?.aborted)throw signal.reason||Error('Subida pausada');
   let state=plan.session_id?await call(`/images/uploads/${plan.session_id}`,{},signal):await call('/images/uploads',json(plan),signal);
   plan={...plan,session_id:state.id,asset_id:state.asset_id,expires_at:state.expires_at};await persist(plan);
   if(['cancelled','expired','failed','cleaning'].includes(state.state))throw Error('La sesión terminó; inicia una nueva subida');
   const total=Math.ceil(file.size/state.part_bytes),done=new Set(state.parts.map(p=>p.partNumber));
   onProgress({received:state.received_bytes,total:file.size,parts:done.size,totalParts:total,state:state.state});
   if(state.state!=='ready')for(let number=1;number<=total;number++){
    if(done.has(number))continue;
    state=await call(`/images/uploads/${state.id}/parts/${number}`,{method:'PUT',body:file.slice((number-1)*state.part_bytes,Math.min(number*state.part_bytes,file.size))},signal);
    await persist(plan);onProgress({received:state.received_bytes,total:file.size,parts:state.parts.length,totalParts:total,state:state.state});
   }
   if(state.state!=='ready')state=await call(`/images/uploads/${state.id}/complete`,{method:'POST'},signal);
   await persist({...plan,completed:state.state==='ready'});onProgress({received:file.size,total:file.size,parts:total,totalParts:total,state:state.state});return state;
  },
  async cancel(plan,{ownerId}={}){if(ownerId!==plan.owner_id)throw Error('La subida pertenece a otra cuenta');if(!plan.session_id)return {cancelled:true};const result=await call(`/images/uploads/${plan.session_id}`,{method:'DELETE'});await persist({...plan,cancelled:true});return result;},
  async downloadLink(assetId,operation='original'){if(!['original','preview','thumbnail','stream'].includes(operation))throw Error('Operación inválida');return call(`/images/files/${assetId}/${operation}/link`,{method:'POST'});}
 };
}
