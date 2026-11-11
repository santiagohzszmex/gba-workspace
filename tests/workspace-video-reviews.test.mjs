import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createImageGateway} from '../cloudflare/workspace-originals/images/gateway.mjs';
import {createImageUploader} from '../src/workspace/imageUploadClient.mjs';
import {Bucket,digestFactory,sha} from './helpers/memoryBucket.mjs';
import {makeMp4} from './helpers/mp4.mjs';

// Workspace 1.8.0 Labradorita · Entregas y revisión de video. Datos sintéticos en PGlite y R2 en memoria; nunca producción.
export async function applyVideoReviews(db){await db.exec('reset role');await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261111230000_workspace_video_reviews.sql',import.meta.url),'utf8'));}

export async function runVideoReviewsAcceptance(db){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const bad=async(p,re)=>{await assert.rejects(typeof p==='function'?p():p,re);checks++;};
 const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
 const uid=n=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid=n=>`97000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=async(q,p=[])=>{await db.exec('reset role');return q?db.query(q,p):null;};
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(n?{sub:uid(n),session_id:sid(n),role:'authenticated'}:{})]);await db.exec(`set role ${n?'authenticated':'anon'}`);};
 const cmd=(a,d,r=null)=>scalar('select public.workspace_command($1,$2,$3)',[a,d,r]);
 const video=(a,task,d={},r=null)=>scalar('select public.workspace_video_command($1,$2,$3,$4)',[a,task,d,r]);
 const bundle=project=>scalar('select public.workspace_video_bundle($1)',[project]);
 const allocated=async()=>BigInt((await admin('select allocated_bytes::text v from workspace_private.original_limits where singleton')).rows[0].v);

 // Preparación: política y llave de pasarela sintética. La llave anterior se restituye al final.
 await admin();
 const previousKey=await scalar('select gateway_key_hash from workspace_private.original_limits where singleton');
 const previousPolicy=(await db.query('select images_enabled,images_all_projects,part_bytes from workspace_private.upload_policy where singleton')).rows[0];
 const secret='labradorita-video-local';
 await db.query("update workspace_private.original_limits set enabled=true,capacity_bytes=10000000000,gateway_key_hash=encode(extensions.digest($1,'sha256'),'hex') where singleton",[secret]);
 await db.query('update workspace_private.upload_policy set images_enabled=true,images_all_projects=true where singleton');
 eq(await scalar('select video_enabled from workspace_private.upload_policy where singleton'),false);
 eq(await scalar('select row(video_max_bytes,video_max_seconds,video_max_long_side,video_max_short_side,video_purge_hours)::text from workspace_private.upload_policy where singleton'),'(314572800,600,1280,720,48)');
 const unit=await scalar("select id from public.workspace_units where slug='gimg'");
 // 1 Dirección · 2 animador 3D · 3 responsable de Animación 3D · 4 colaborador de Guion · 5 publicación en redes.
 for(let n=1;n<=5;n++){await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`video-${n}@example.invalid`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid(n),uid(n)]);
  await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[uid(n),`video-${n}`]);await db.query("insert into public.workspace_unit_memberships(unit_id,user_id,membership_status) values($1,$2,'active')",[unit,uid(n)]);}
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Labradorita local')",[uid(1),unit]);
 await actor(1);
 const project=await cmd('project.create',{unit_id:unit,title:'Corto sintético de la mascota',kind:'video'});
 const editorial=await cmd('project.create',{unit_id:unit,title:'Edición sintética',kind:'publication'});
 await admin();
 const areaOf=specialty=>scalar('select id from public.workspace_areas where project_id=$1 and specialty=$2',[project.id,specialty]);
 const area3d=await areaOf('animation_3d'),areaScript=await areaOf('script'),areaSocial=await areaOf('social');
 for(const [n,role,area,assignment] of [[2,'gimg_contributor',area3d,'contributor'],[3,'gimg_area_lead',area3d,'area_lead'],[4,'gimg_contributor',areaScript,'contributor'],[5,'gimg_contributor',areaSocial,'contributor']]){
  await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,$2,$3,'area',$4,'Labradorita local')",[uid(n),role,unit,area]);
  await db.query('insert into public.workspace_assignments(user_id,assignment_role,unit_id,project_id,area_id,assigned_by) values($1,$2,$3,$4,$5,$6)',[uid(n),assignment,unit,project.id,area,uid(1)]);
 }
 await actor(1);
 let task=await cmd('task.create',{unit_id:unit,project_id:project.id,area_id:area3d,title:'Animar la entrada de la mascota',responsible_id:uid(2)});
 const socialTask=await cmd('task.create',{unit_id:unit,project_id:project.id,area_id:areaSocial,title:'Publicar el corto',responsible_id:uid(5)});
 const editorialArea=await (async()=>{await admin();return scalar("select id from public.workspace_areas where project_id=$1 and specialty='art'",[editorial.id]);})();
 await actor(1);const editorialTask=await cmd('task.create',{unit_id:unit,project_id:editorial.id,area_id:editorialArea,title:'Portada',responsible_id:uid(1)});

 // Tipo de entrega: apagado por defecto; sólo en producciones de video; sólo quien asigna.
 await bad(video('kind.set',task.id,{kind:'video'},task.revision),/no están habilitadas/);
 await admin('update workspace_private.upload_policy set video_enabled=true where singleton');
 await actor(2);await bad(video('kind.set',task.id,{kind:'video'},task.revision),/permiso|permission/i);
 await actor(1);await bad(video('kind.set',editorialTask.id,{kind:'video'},editorialTask.revision),/no están habilitadas|producciones de video/);
 await bad(video('kind.set',task.id,{kind:'video'},task.revision-1),/cambió/);
 task=await video('kind.set',task.id,{kind:'video'},task.revision);eq(task.kind,'video');
 await admin();await bad(db.query("update public.workspace_deliverables set kind='video' where id=$1",[editorialTask.id]),/producciones de video/);

 // Pasarela con R2 en memoria. Cada solicitud corre con la sesión de quien la hace.
 const bucket=new Bucket(),env={ORIGINALS:bucket,GATEWAY_KEY:secret,SUPABASE_URL:'https://database.invalid',SUPABASE_PUBLISHABLE_KEY:'test',ALLOWED_ORIGINS:'https://workspace.invalid'};
 let queue=Promise.resolve();
 const fetcher=(url,options)=>{const run=queue.then(async()=>{const n=Number(options.headers.Authorization?.replace('Bearer local-',''))||0;await actor(n);const body=JSON.parse(options.body),name=url.split('/').at(-1);
  try{const value=await scalar(`select public.${name}(${name==='workspace_image_file'?'$1,$2':'$1,$2,$3'})`,name==='workspace_image_file'?[body.p_data,body.p_gateway_key]:[body.p_action,body.p_data,body.p_gateway_key]);return Response.json(value);}
  catch(error){return Response.json({message:error.message,code:error.code},{status:error.code==='42501'?403:400});}});queue=run.catch(()=>{});return run;};
 const gateway=createImageGateway({fetcher,logger:{error(){}},digestFactory,fixedLength:()=>new TransformStream()});
 const request=(path,{n=2,method='GET',body,headers={}}={})=>gateway.fetch(new Request(new URL(path,'https://gateway.invalid'),{method,headers:{...(n?{Authorization:`Bearer local-${n}`}:{}),...headers},...(body!==undefined?{body:typeof body==='object'&&!(body instanceof Uint8Array)?JSON.stringify(body):body}:{}),duplex:'half'}),env);
 const call=async(path,options={},expected=200)=>{const r=await request(path,options);const json=await r.json();assert.equal(r.status,expected,JSON.stringify(json));checks++;return json;};
 const open=(bytes,fields={},expected=201)=>call('/images/uploads',{method:'POST',body:{request_id:webcrypto.randomUUID(),deliverable_id:task.id,file_name:'corte.mp4',role:'video',format:'mp4',size_bytes:bytes.length,sha256:sha(bytes),...fields}},expected);
 const send=async(bytes,expected=200)=>{let s=await open(bytes);for(let n=1;n<=Math.ceil(bytes.length/s.part_bytes);n++)s=await call(`/images/uploads/${s.id}/parts/${n}`,{method:'PUT',body:bytes.subarray((n-1)*s.part_bytes,n*s.part_bytes)});return call(`/images/uploads/${s.id}/complete`,{method:'POST'},expected);};
 const base=await allocated();

 // Rechazos antes de subir: nombre, peso, tipo de asignación y quién sube.
 await open(makeMp4(),{file_name:'corte.mov'},400);
 await open(makeMp4(),{size_bytes:400*1024*1024},400);
 await open(makeMp4(),{deliverable_id:socialTask.id},403);
 await call('/images/uploads',{n:4,method:'POST',body:{request_id:webcrypto.randomUUID(),deliverable_id:task.id,file_name:'corte.mp4',role:'video',format:'mp4',size_bytes:100,sha256:'a'.repeat(64)}},403);
 // Rechazos al terminar: el archivo se borra de R2 y la cuota se libera sólo con el borrado confirmado.
 for(const [file,re] of [[makeMp4({width:1920,height:1080}),/720p/],[makeMp4({durationMs:11*60*1000}),/dura más/],[makeMp4({codec:'hvc1'}),/H\.264/],[makeMp4({brand:'qt  '}),/QuickTime/]]){
  const failed=await send(file,400);assert.match(failed.error,re);checks++;
 }
 eq([...bucket.objects.keys()].length,0);
 eq(await allocated(),base);

 // Una copia válida, subida por partes y reanudada después de un corte.
 await admin('update workspace_private.upload_policy set part_bytes=5242880 where singleton');
 const first=makeMp4({mdatBytes:11*1024*1024,moovFirst:false});
 let cut=false;const persisted=[];
 const uploader=(fail)=>createImageUploader({gateway:'https://gateway.invalid',authorization:async()=>'Bearer local-2',hashFile:async f=>sha(Buffer.from(await f.arrayBuffer())),persist:async plan=>{persisted.push(plan);},
  fetcher:async(url,options)=>{if(fail&&options.method==='PUT'&&url.pathname.endsWith('/parts/2')&&!cut){cut=true;throw Error('Conexión perdida');}return gateway.fetch(new Request(url,{...options,duplex:'half'}),env);}});
 const file=new File([first],'mascota-v1.mp4',{type:'video/mp4'});
 const plan=await uploader(true).prepare(file,{ownerId:uid(2),deliverableId:task.id,role:'video',format:'mp4'});
 await bad(uploader(true).upload(plan,file,{ownerId:uid(2)}),/Conexión perdida/);
 const resumed=await uploader(false).upload(persisted.at(-1),file,{ownerId:uid(2)});
 eq([resumed.state,resumed.verification,resumed.width,resumed.height,resumed.duration_ms],['ready','mp4',1280,720,30000]);
 eq(bucket.created,5);// cuatro rechazos y una subida reanudada en la misma sesión
 const v1Asset=resumed.asset_id;
 await admin();eq(await scalar("select metadata->>'sha256_source' from workspace_private.image_assets where id=$1",[v1Asset]),'client_with_server_parts');
 eq(await allocated(),base+BigInt(first.length));

 // Antes de enviarse, la copia sólo la ve quien la subió.
 await call(`/images/files/${v1Asset}/stream/link`,{n:1,method:'POST'},403);
 await call(`/images/files/${v1Asset}/original/link`,{method:'POST'},403);
 const own=await call(`/images/files/${v1Asset}/stream/link`,{method:'POST'});eq(own.available,true);

 // Envío: sólo por el comando de video, con versión base vigente.
 await actor(2);
 await bad(cmd('version.submit',{deliverable_id:task.id,project_id:project.id,content_markdown:'x'},task.revision),/entrega de video/);
 await bad(video('version.submit',task.id,{asset_id:v1Asset,base_version:3}),/versión base/);
 await actor(3);await bad(video('version.submit',task.id,{asset_id:v1Asset,base_version:0}),/permiso|permission|otra asignación/i);
 await actor(2);
 const v1=await video('version.submit',task.id,{asset_id:v1Asset,base_version:0,note:'Primer pase de animación'});
 eq([v1.version_number,v1.kind,v1.video.duration_ms,v1.video.note],[1,'video',30000,'Primer pase de animación']);
 await bad(video('version.submit',task.id,{asset_id:v1Asset,base_version:1}),/Reabre|ya se envió/);
 await admin();
 eq(await scalar('select state from public.workspace_deliverables where id=$1',[task.id]),'review');
 eq(await scalar("select count(*)::int from workspace_private.notifications where recipient_id=$1 and event_type='review.requested' and deliverable_id=$2",[uid(3),task.id]),1);
 await bad(db.query('update workspace_private.video_versions set note=$2 where version_id=$1',[v1.id,'cambio']),/inmutable/);
 await bad(db.query("update workspace_private.image_assets set file_name='otro.mp4' where id=$1",[v1Asset]),/inmutable/);

 // Reproducir: quien revisa sí; otra área no. El enlace se revalida en cada solicitud, con rangos.
 await call(`/images/files/${v1Asset}/stream/link`,{n:4,method:'POST'},403);
 const link=await call(`/images/files/${v1Asset}/stream/link`,{n:3,method:'POST'});
 eq(new Date(link.expires_at)-Date.now()>25*60*1000,true);
 const ranged=await request(link.url,{n:0,headers:{Range:'bytes=0-99'}});
 eq([ranged.status,ranged.headers.get('Content-Type'),ranged.headers.get('Content-Range'),ranged.headers.get('Content-Disposition').startsWith('inline')],[206,'video/mp4',`bytes 0-99/${first.length}`,true]);
 eq(sha(Buffer.from(await ranged.arrayBuffer())),sha(first.subarray(0,100)));
 const whole=await request(link.url,{n:0});eq(sha(Buffer.from(await whole.arrayBuffer())),sha(first));

 // Comentarios en un momento exacto, con dibujo opcional.
 const drawing=[{color:'#e5484d',width:4,points:[[0.1,0.2],[0.3,0.25],[0.32,0.4]]}];
 await actor(3);
 const note=await video('note.add',task.id,{version_id:v1.id,time_ms:1500,body:'La mascota entra demasiado rápido.',drawing});
 eq([note.time_ms,note.drawing],[1500,drawing]);
 const plain=await video('note.add',task.id,{version_id:v1.id,time_ms:29000,body:'El final está bien.'});eq(plain.drawing,null);
 await bad(video('note.add',task.id,{version_id:v1.id,time_ms:31000,body:'Fuera'}),/fuera del video/);
 await bad(video('note.add',task.id,{version_id:v1.id,body:'Sin momento'}),/fuera del video/);
 await bad(video('note.add',task.id,{version_id:v1.id,time_ms:10,body:'   '}),/Escribe/);
 for(const wrong of [[{color:'#123456',width:4,points:[[0,0]]}],[{color:'#e5484d',width:4,points:[[1.2,0]]}],[{color:'#e5484d',width:40,points:[[0,0]]}],[{color:'#e5484d',width:4,points:[[0,0]],script:'x'}],[]])
  await bad(video('note.add',task.id,{version_id:v1.id,time_ms:10,body:'Trazo',drawing:wrong}),/Dibujo inválido/);
 await actor(2);
 await bad(video('note.add',task.id,{version_id:v1.id,time_ms:10,body:'Me reviso solo'}),/revisan/);
 const reply=await video('note.reply',task.id,{note_id:note.id,body:'Lo ajusto en la siguiente versión.'});eq(reply.note_id,note.id);
 await bad(video('note.resolve',task.id,{note_id:note.id}),/Solo quien publicó/);
 await actor(4);await bad(video('note.reply',task.id,{note_id:note.id,body:'Opino'}),/acceso|responder|permiso/i);
 await admin();await bad(db.query('delete from workspace_private.video_notes where id=$1',[note.id]),/inmutable/);

 // Correcciones y segunda versión (vertical 720 × 1280); la nota se verifica sobre la versión nueva.
 await actor(3);task=await (async()=>{await admin();return (await db.query('select * from public.workspace_deliverables where id=$1',[task.id])).rows[0];})();
 await actor(3);await cmd('review.changes',{project_id:project.id,deliverable_id:task.id,body:'Ver comentarios en el video.'},task.revision);
 const second=makeMp4({width:720,height:1280,durationMs:31000});
 const v2Upload=await send(second);eq([v2Upload.width,v2Upload.height],[720,1280]);
 await actor(2);const v2=await video('version.submit',task.id,{asset_id:v2Upload.asset_id,base_version:1});eq(v2.version_number,2);
 await actor(3);
 await bad(video('note.resolve',task.id,{note_id:note.id,verified_version_id:v2.id}),/requiere revisión/);
 const verified=await video('note.verify',task.id,{note_id:note.id,verified_version_id:v2.id,resolved:true});eq([verified.resolved,verified.verified_version_id],[true,v2.id]);
 await actor(1);let b=await bundle(project.id);
 eq([Object.keys(b.versions).length,b.notes.length,b.replies.length,b.resolutions.length,b.uploads_enabled,b.reviewer[task.id],Boolean(b.publish_task_id)],[2,2,1,1,true,true,true]);
 eq(JSON.stringify(b).includes('object_key')||JSON.stringify(b).includes('videos/'),false);
 await actor(4);b=await bundle(project.id);eq(Object.keys(b.versions).length,0);

 // Aprobación del área; después se registra dónde se publicó.
 await actor(5);b=await bundle(project.id);eq([b.publish_task_id,b.has_approved_video],[socialTask.id,false]);
 await bad(video('publication.add',socialTask.id,{network:'tiktok',url:'https://www.tiktok.com/@gimg/video/1'}),/aprobado/);
 await admin();task=(await db.query('select * from public.workspace_deliverables where id=$1',[task.id])).rows[0];
 await actor(3);task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'area_approved'},task.revision);eq(task.state,'area_approved');
 await actor(2);await bad(video('publication.add',task.id,{network:'tiktok',url:'https://www.tiktok.com/@gimg/video/1'}),/No puedes registrar/);
 await actor(1);await bad(video('publication.add',editorialTask.id,{network:'tiktok',url:'https://www.tiktok.com/@gimg/video/1'}),/producciones de video/);
 await actor(5);
 await bad(video('publication.add',socialTask.id,{network:'tiktok',url:'http://www.tiktok.com/@gimg/video/1'}),/enlace completo/);
 await bad(video('publication.add',socialTask.id,{network:'myspace',url:'https://myspace.com/x'}),/red social/);
 await bad(video('publication.add',socialTask.id,{network:'tiktok',url:'https://www.tiktok.com/x',published_at:'2040-01-01T00:00:00Z'}),/fecha/);
 const pub=await video('publication.add',socialTask.id,{network:'tiktok',url:'https://www.tiktok.com/@gimg/video/7300000000000000000'});eq(pub.network,'tiktok');
 await video('publication.add',socialTask.id,{network:'instagram',url:'https://www.instagram.com/reel/abc123/'});
 await admin();
 // Sólo la copia vieja (v1) se programa para borrarse en 48 horas; la vigente (v2) se conserva.
 eq((await db.query('select asset_id,round(extract(epoch from due_at-now())/3600)::int hours from workspace_private.video_purges where project_id=$1',[project.id])).rows,[{asset_id:v1Asset,hours:48}]);
 await actor(5);b=await bundle(project.id);eq([b.publications.length,b.has_approved_video,Object.keys(b.versions).length],[2,true,0]);
 await actor(3);b=await bundle(project.id);eq([b.assets[v1Asset]?.purged,Boolean(b.assets[v1Asset]?.purge_due_at),b.assets[v2Upload.asset_id]?.purge_due_at],[false,true,null]);
 await actor(5);
 const removed=await video('publication.remove',socialTask.id,{publication_id:pub.id});eq(Boolean(removed.removed_at),true);
 await actor(2);await bad(video('publication.remove',task.id,{publication_id:pub.id}),/no encontrado/);
 await actor(1);eq((await bundle(project.id)).publications.length,1);

 // Borrado: antes de la fecha no pasa nada; después la pasarela borra la copia y libera su espacio.
 eq((await gateway.scheduled({},env)).purged,0);
 await admin("update workspace_private.video_purges set due_at=now()-interval '1 minute' where asset_id=$1",[v1Asset]);
 bucket.failDelete=true;eq((await gateway.scheduled({},env)).purged,0);bucket.failDelete=false;
 eq(await allocated(),base+BigInt(first.length+second.length));
 await admin("update workspace_private.video_purges set lease_until=now()-interval '1 second' where asset_id=$1",[v1Asset]);
 eq((await gateway.scheduled({},env)).purged,1);
 eq(await allocated(),base+BigInt(second.length));
 eq(bucket.objects.size,1);
 const gone=await call(`/images/files/${v1Asset}/stream/link`,{n:3,method:'POST'});eq([gone.available,/borró después de publicar/.test(gone.message)],[false,true]);
 await call(`/images/files/${v2Upload.asset_id}/stream/link`,{n:3,method:'POST'});
 // Se conservan comentarios, dibujos y versiones.
 await actor(3);b=await bundle(project.id);eq([b.assets[v1Asset].purged,b.notes.length,Object.keys(b.versions).length],[true,2,2]);
 await admin();eq(await scalar("select count(*)::int from workspace_private.image_storage_audit where asset_id=$1 and action='video.copy.purged'",[v1Asset]),1);

 // Interruptor: al apagar video no se sube nada nuevo, pero lo enviado se sigue viendo.
 await admin('update workspace_private.upload_policy set video_enabled=false where singleton');
 await open(makeMp4(),{},403);
 await call(`/images/files/${v2Upload.asset_id}/stream/link`,{n:3,method:'POST'});
 await actor(3);b=await bundle(project.id);eq([b.enabled,b.uploads_enabled],[true,false]);

 // Las imágenes siguen igual: una imagen no se puede pedir como «stream».
 await admin();
 const image=await scalar("select id from workspace_private.image_assets where role='png' and status='validated' limit 1");
 if(image){await bad(scalar("select public.workspace_image_file($1,$2)",[{asset_id:image,operation:'stream'},secret]),/fuera de tu acceso/);}

 // Superficie: funciones anteriores privadas, tablas cerradas y sin acceso anónimo.
 for(const fn of ['command_before_video_reviews(text,jsonb,integer)','image_storage_before_video(text,jsonb,text)','image_file_before_video(jsonb,text)','image_maintenance_before_video(text,jsonb,text)'])
  eq(await scalar(`select has_function_privilege('authenticated','workspace_private.${fn}','execute')`),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_video_command(text,uuid,jsonb,integer)','execute')"),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_video_bundle(uuid)','execute')"),false);
 for(const table of ['video_versions','video_notes','video_note_replies','video_note_resolutions','video_publications','video_purges'])
  eq(await scalar(`select has_table_privilege('authenticated','workspace_private.${table}','select')`),false);
 await actor(0);await bad(scalar('select public.workspace_image_maintenance($1,$2,$3)',['video.purge.claim',{},'otra-llave']),/no autorizada/);

 await admin();
 await db.query('update workspace_private.original_limits set gateway_key_hash=$1 where singleton',[previousKey]);
 await db.query('update workspace_private.upload_policy set images_enabled=$1,images_all_projects=$2,part_bytes=$3 where singleton',[previousPolicy.images_enabled,previousPolicy.images_all_projects,previousPolicy.part_bytes]);
 console.log(`PASS: ${checks} video SQL/gateway assertions: switch, kinds, MP4 limits, resumable upload, immutable versions, stream links, timecoded notes, drawings, publications and purge.`);
 return checks;
}
