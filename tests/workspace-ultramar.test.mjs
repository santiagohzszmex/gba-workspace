import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Workspace 1.7.5 · Puente con Ultramar. Datos sintéticos en PGlite; nunca contra producción.
// Convención de huella acordada con Ultramar (F1.13): claves ordenadas, JSON compacto, UTF-8.
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const sha=v=>createHash('sha256').update(canonical(v),'utf8').digest('hex');

export async function runUltramarAcceptance(db){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 // Un código (UM0xx/40001) se compara exacto con el `code` que verá Ultramar; una expresión, con el mensaje.
 const bad=async(p,re)=>{await assert.rejects(p,typeof re==='string'?e=>{assert.equal(e.code,re,e.message);return true;}:re);checks++;};
 const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
 const uid=n=>`86000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid=n=>`87000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=()=>db.exec('reset role');
 const actor=async(n,session=sid(n))=>{await admin();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(n),session_id:session,role:'authenticated'})]);await db.exec('set role authenticated');};
 await admin();
 const matrixBefore=await scalar('select md5(jsonb_agg(to_jsonb(r) order by role,permission)::text) from workspace_private.role_permissions r');
 // Tablas mínimas de Sepia para la prueba local (en producción las crea el servicio de acceso).
 await db.exec(`create schema if not exists sepia_private;
  create table if not exists sepia_private.licenses(id uuid primary key default gen_random_uuid(),user_id uuid not null,code_id uuid not null default gen_random_uuid(),edition text not null default '01',starts_at timestamptz not null,expires_at timestamptz not null,revoked_at timestamptz);
  create table if not exists sepia_private.connections(id uuid primary key default gen_random_uuid(),token_hash text not null default md5(random()::text)||md5(random()::text),user_id uuid not null,app text not null,device_id uuid not null default gen_random_uuid(),device_name text not null default 'Mac local',epoch bigint not null default 1,auth_session_id uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',last_checked_at timestamptz not null default now(),revoked_at timestamptz);`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261104010000_workspace_ultramar_bridge.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261110230000_workspace_ultramar_read_only_open_check.sql',import.meta.url),'utf8'));

 // La huella del servidor coincide con la de Ultramar, incluidos Unicode, números y claves anidadas.
 const sample={z:1,a:[{b:'ñandú “x”',a:612},{c:595.276,d:null,e:true}],m:{y:'\u0007',x:''}};
 eq(await scalar('select workspace_private.ultramar_canonical($1::jsonb)',[JSON.stringify(sample)]),canonical(sample));
 eq(await scalar('select workspace_private.ultramar_sha($1::jsonb)',[JSON.stringify(sample)]),sha(sample));
 // Vectores publicados para Ultramar (docs/workspace/ultramar-vectores.json): el servidor debe dar exactamente lo mismo.
 const vectors=JSON.parse(fs.readFileSync(new URL('../docs/workspace/ultramar-vectores.json',import.meta.url),'utf8'));
 for(const v of vectors.vectores){eq(await scalar('select workspace_private.ultramar_canonical($1::jsonb)',[JSON.stringify(v.entrada)]),v.canonico);eq(await scalar('select workspace_private.ultramar_sha($1::jsonb)',[JSON.stringify(v.entrada)]),v.sha256);eq(sha(v.entrada),v.sha256);}

 // Fixture: personas propias (41 Dirección, 44 sin acceso), edición abierta nueva y asignación de maquetación.
 const unit=await scalar("select id from public.workspace_units where slug='gimg'");
 for(const n of [41,44]){await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`ultramar-${n}@example.invalid`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid(n),uid(n)]);await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[uid(n),`ultramar-${n}`]);await db.query("insert into public.workspace_unit_memberships(unit_id,user_id,membership_status) values($1,$2,'active')",[unit,uid(n)]);}
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Local Ultramar')",[uid(41),unit]);
 await actor(41);const cmd=(a,d,r=null)=>scalar('select public.workspace_command($1,$2,$3)',[a,d,r]);
 const project=await cmd('project.create',{unit_id:unit,title:'Ultramar · local'});
 const projectId=project.id||project.project_id;
 await admin();
 const area=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='integration'",[projectId]);
 const textArea=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='text'",[projectId]);
 await actor(41);
 const layout=await cmd('task.create',{project_id:projectId,area_id:area,title:'Maquetar portada',description:'Portada a dos páginas.',responsible_id:uid(41)});
 const text=await cmd('task.create',{project_id:projectId,area_id:textArea,title:'Texto de apertura',description:'',responsible_id:uid(41)});
 const layoutId=layout.id||layout.deliverable_id,textId=text.id||text.deliverable_id;
 if(process.env.ULTRAMAR_DEBUG)console.log({project,layout});
 await admin();
 const version=await scalar("insert into public.workspace_versions(deliverable_id,version_number,content_markdown,change_summary,author_id) values($1,1,'Primer párrafo\n\nSegundo párrafo','Aceptado',$2) returning id",[textId,uid(41)]);
 const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Érase una vez en Oaxaca.'}]}]};
 const reference=await scalar("insert into workspace_private.edition_references(project_id,kind,title,content_markdown,created_by) values($1,'moodboard','Paleta de portada','',$2) returning id",[projectId,uid(41)]);
 const original=await scalar("insert into workspace_private.reference_originals(reference_id,file_name,mime_type,size_bytes,sha256,object_key,status,uploaded_by) values($1,'portada.png','image/png',70,$2,'local/ultramar/portada.png','ready',$3) returning id",[reference,'a'.repeat(64),uid(41)]);
 await db.query("insert into workspace_private.task_references(deliverable_id,source_id,version_id,revision,snapshot,linked_by) values($1,$2,$2,1,$3,$4)",[layoutId,version,JSON.stringify({title:'Texto de apertura',kind:'instructions',content_markdown:'Érase una vez en Oaxaca.',content_document:doc}),uid(41)]);
 await db.query("insert into workspace_private.task_references(deliverable_id,source_id,reference_id,revision,snapshot,original_ids,linked_by) values($1,$2,$2,1,$3,array[$4::uuid],$5)",[layoutId,reference,JSON.stringify({title:'Paleta de portada'}),original,uid(41)]);
 // Lee la asignación como administrador y vuelve a la persona activa.
 let current=41;const task=async()=>{await admin();const row=(await db.query('select * from public.workspace_deliverables where id=$1',[layoutId])).rows[0];await actor(current);return row;};

 // Apagado por defecto: nadie prepara ni lee.
 await actor(41);
 const page={ancho:612,alto:792,sangrado:{arriba:9,derecha:9,abajo:9,izquierda:9},unidad:'pt',colorModel:'RGB'};
 await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:page},(await task()).revision]),'UM001');
 await admin();await db.exec('update workspace_private.upload_policy set ultramar_enabled=true');

 // Preparar: sólo áreas de maquetación, página válida y revisión vigente.
 await actor(41);
 await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[textId,{pagina:page},1]),'UM006');
 await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:{...page,unidad:'mm'}},(await task()).revision]),'UM009');
 await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:{...page,sangrado:{arriba:-1,derecha:0,abajo:0,izquierda:0}}},(await task()).revision]),'UM009');
 await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:page},999]),'40001');
 const snap=await scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:page},(await task()).revision]);
 eq([snap.version,snap.textos,snap.recursos],[1,1,1]);
 // Una persona sin acceso a la asignación no puede prepararla.
 current=44;await actor(44);await bad(scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:page},(await task()).revision]),'UM005');current=41;

 // Puerta Sepia: sin licencia ni conexión de Ultramar no hay catálogo.
 await actor(41);await bad(scalar('select public.workspace_ultramar_assignments()'),'UM003');
 await admin();await db.query("insert into sepia_private.connections(user_id,app,auth_session_id) values($1,'ultramar',$2)",[uid(41),sid(41)]);
 await actor(41);await bad(scalar('select public.workspace_ultramar_assignments()'),'UM004');
 await admin();await db.query("insert into sepia_private.licenses(user_id,starts_at,expires_at) values($1,now()-interval '1 day',now()+interval '30 days')",[uid(41)]);
 // Una conexión de Workspace o de otra sesión no abre el puente.
 await actor(41,sid(49));await bad(scalar('select public.workspace_ultramar_assignments()'),/Sesión|Conecta Ultramar/);

 await actor(41);
 const config=await scalar('select public.workspace_ultramar_config()');eq([config.contrato,config.limites.ultramar,config.limites.previewLado],['gba.workspace.ultramar/1',94371840,4096]);
 const list=await scalar('select public.workspace_ultramar_assignments()');
 eq(list.map(x=>[x.asignacionId,x.instantanea.version]),[[layoutId,'1']]);

 // Instantánea: forma de F1.13, huella verificable y textos/originales de los materiales.
 const snapshot=await scalar('select public.workspace_ultramar_snapshot($1,null)',[layoutId]);
 const {referencia,...content}=snapshot;
 eq(referencia.sha256,sha(content));
 eq(snapshot.especificaciones,{unidad:'pt',colorModel:'RGB',ancho:612,alto:792,sangrado:{arriba:9,derecha:9,abajo:9,izquierda:9}});
 eq(snapshot.textos[0].bloques,doc.content);
 eq(snapshot.textos[0].referencia.sha256,sha({titulo:'Texto de apertura',bloques:doc.content}));
 eq(snapshot.recursos.map(r=>[r.referencia.id,r.nombre,r.mime,r.tamano]),[[original,'portada.png','image/png',70]]);
 eq(JSON.stringify(snapshot).includes('object_key')||JSON.stringify(snapshot).includes('local/ultramar'),false);
 const descriptor=await scalar('select public.workspace_ultramar_original($1,$2,$3)',[layoutId,referencia.id,original]);
 eq(descriptor.ruta,'/originals/'+original);
 await bad(scalar('select public.workspace_ultramar_original($1,$2,$3)',[layoutId,referencia.id,reference]),'UM011');
 // La API (PostgREST) ejecuta las funciones STABLE en una transacción de solo lectura: catálogo, instantánea y original
 // deben funcionar ahí sin candados (fallo real de producción 2026-11-10: «La edición está cerrada» por SELECT FOR SHARE).
 const soloLectura=async(q,p)=>{await db.exec('begin');try{await db.exec('set transaction read only');return await scalar(q,p);}finally{await db.exec('rollback');}};
 eq((await soloLectura('select public.workspace_ultramar_snapshot($1,null)',[layoutId])).referencia.id,referencia.id);
 eq((await soloLectura('select public.workspace_ultramar_original($1,$2,$3)',[layoutId,referencia.id,original])).ruta,'/originals/'+original);
 eq((await soloLectura('select public.workspace_ultramar_assignments()')).length,1);
 // Una edición realmente cerrada sigue dando UM008, en lectura y al reservar.
 await admin();await db.query("update public.workspace_projects set status='closed' where id=$1",[projectId]);await actor(41);
 await bad(soloLectura('select public.workspace_ultramar_snapshot($1,null)',[layoutId]),'UM008');
 await bad(scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,(await task()).revision,'cerrada-'+'x'.repeat(16),JSON.stringify([])]),'UM008');
 await admin();await db.query("update public.workspace_projects set status='active' where id=$1",[projectId]);await actor(41);

 // Instantáneas inmutables: preparar otra vez crea la versión 2 y conserva la 1.
 const snap2=await scalar('select public.workspace_ultramar_prepare($1,$2,$3)',[layoutId,{pagina:{...page,ancho:595.276,alto:841.89},instrucciones:'Usa la paleta.'},(await task()).revision]);
 eq(snap2.version,2);eq((await scalar('select public.workspace_ultramar_snapshot($1,$2)',[layoutId,referencia.id])).especificaciones.ancho,612);
 const latest=await scalar('select public.workspace_ultramar_snapshot($1,null)',[layoutId]);eq([latest.especificaciones.ancho,latest.instrucciones],[595.276,'Usa la paleta.']);

 // Reserva idempotente y validación de archivos.
 const files=[{role:'ultramar',file_name:'portada.ultramar',size_bytes:4096,sha256:'b'.repeat(64)},{role:'pdf',file_name:'portada.pdf',size_bytes:2048,sha256:'c'.repeat(64)},{role:'preview',file_name:'portada.png',size_bytes:1024,sha256:'d'.repeat(64)}];
 const key='mac-local-0000000001';const rev=(await task()).revision;
 await bad(scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,rev,key,JSON.stringify(files.slice(0,2))]),'UM014');
 await bad(scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,rev,key,JSON.stringify([{...files[0],file_name:'portada.zip'},files[1],files[2]])]),'UM014');
 await bad(scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,rev+1,key,JSON.stringify(files)]),'40001');
 const reservation=await scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,rev,key,JSON.stringify(files)]);
 const again=await scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,rev,key,JSON.stringify(files)]);
 eq(again.id,reservation.id);
 await bad(scalar('select public.workspace_ultramar_submit($1,$2)',[reservation.id,'Primera maqueta']),'UM019');
 // Pasarela: sólo con la clave de la pasarela; la ruta del objeto la decide el servidor.
 await admin();await db.query("update workspace_private.original_limits set enabled=true,gateway_url=coalesce(gateway_url,'https://originals.local.invalid'),gateway_key_hash=encode(extensions.digest('ultramar-local-gateway','sha256'),'hex') where singleton");
 await actor(41);const gw='ultramar-local-gateway';
 await bad(scalar('select public.workspace_ultramar_upload_gate($1,$2,$3)',[reservation.id,'pdf','wrong-key']),/Almacenamiento privado/);
 const gate=await scalar('select public.workspace_ultramar_upload_gate($1,$2,$3)',[reservation.id,'pdf',gw]);
 eq([gate.object_key,gate.size_bytes,gate.sha256],[`ultramar/${reservation.id}/pdf`,2048,'c'.repeat(64)]);
 await bad(scalar('select public.workspace_ultramar_file_verified($1,$2,$3,$4)',[reservation.id,'ultramar',{ok:false,reason:'zip'},gw]),'UM018');
 current=44;await actor(44);await bad(scalar('select public.workspace_ultramar_upload_gate($1,$2,$3)',[reservation.id,'pdf',gw]),/acceso|Conecta|licencia|Sesión/i);current=41;await actor(41);
 for(const f of files)await scalar('select public.workspace_ultramar_file_verified($1,$2,$3,$4)',[reservation.id,f.role,{ok:true,checks:['firma']},gw]);
 await bad(scalar('select public.workspace_ultramar_upload_gate($1,$2,$3)',[reservation.id,'pdf',gw]),'UM017');

 // Confirmar crea una sola versión en revisión de área; repetir no duplica.
 await actor(41);
 const submitted=await scalar('select public.workspace_ultramar_submit($1,$2)',[reservation.id,'Primera maqueta']);
 eq(submitted.estado,'submitted');
 const repeated=await scalar('select public.workspace_ultramar_submit($1,$2)',[reservation.id,'Primera maqueta']);
 eq([repeated.version_id,repeated.repetido],[submitted.version_id,true]);
 const after=await task();eq([after.state,after.current_version],['review',1]);
 const filesView=await scalar('select public.workspace_ultramar_version_files($1)',[submitted.version_id]);
 eq(filesView.archivos.map(f=>f.rol),['pdf','preview','ultramar']);
 // Con la asignación en revisión ya no se envía otra versión ni se prepara una nueva instantánea.
 await bad(scalar('select public.workspace_ultramar_reserve($1,$2,$3,$4,$5)',[layoutId,referencia.id,after.revision,'mac-local-0000000002',JSON.stringify(files)]),'UM007');

 // Resumen para la interfaz: última instantánea y archivos de la versión; nada para quien no lee la edición.
 const bundle=await scalar('select public.workspace_ultramar_bundle($1)',[projectId]);
 eq([bundle.enabled,bundle.snapshots[layoutId].version,bundle.versions[submitted.version_id].archivos.length],[true,2,3]);
 eq(JSON.stringify(bundle).includes('ultramar/'),false);
 current=44;await actor(44);eq(Object.keys((await scalar('select public.workspace_ultramar_bundle($1)',[projectId])).snapshots).length,0);current=41;await actor(41);

 // Descarga para revisión: quien puede leer la asignación, por la pasarela; nadie más.
 const access=await scalar('select public.workspace_ultramar_file_access($1,$2,$3)',[submitted.version_id,'pdf','ultramar-local-gateway']);
 eq([access.object_key,access.mime_type],[`ultramar/${reservation.id}/pdf`,'application/pdf']);
 current=44;await actor(44);await bad(scalar('select public.workspace_ultramar_file_access($1,$2,$3)',[submitted.version_id,'pdf','ultramar-local-gateway']),'UM020');current=41;await actor(41);

 // Revocar la conexión de Ultramar corta el puente aunque la sesión siga activa.
 await admin();await db.query("update sepia_private.connections set revoked_at=now() where user_id=$1 and app='ultramar'",[uid(41)]);
 await actor(41);await bad(scalar('select public.workspace_ultramar_snapshot($1,null)',[layoutId]),'UM003');

 // Privilegios mínimos y matriz de permisos sin cambios.
 await admin();
 eq(await scalar("select has_table_privilege('authenticated','workspace_private.ultramar_snapshots','select')"),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_ultramar_assignments()','execute')"),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_ultramar_file_verified(uuid,text,jsonb,text)','execute')"),false);
 eq(await scalar('select md5(jsonb_agg(to_jsonb(r) order by role,permission)::text) from workspace_private.role_permissions r'),matrixBefore);
 console.log(`PASS: ${checks} Ultramar bridge checks: shared hash convention, off by default, Sepia license and connection gate, integration-only preparation, immutable snapshots, idempotent reservation, gateway-only verification, single review version and revocation.`);
 return checks;
}
