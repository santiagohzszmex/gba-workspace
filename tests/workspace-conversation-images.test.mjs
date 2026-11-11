import assert from 'node:assert/strict';
import fs from 'node:fs';

// Workspace 1.8.0 Labradorita · Imágenes en la conversación de una asignación. PGlite con datos sintéticos.
export async function applyConversationImages(db){await db.exec('reset role');await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261112010000_workspace_conversation_images.sql',import.meta.url),'utf8'));}

export async function runConversationImagesAcceptance(db){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const bad=async(p,re)=>{await assert.rejects(p,re);checks++;};
 const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
 const uid=n=>`9a000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid=n=>`9b000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=async(q,p=[])=>{await db.exec('reset role');return q?db.query(q,p):null;};
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(n),session_id:sid(n),role:'authenticated'})]);await db.exec('set role authenticated');};
 const cmd=(a,d,r=null)=>scalar('select public.workspace_command($1,$2,$3)',[a,d,r]);
 const prepare=(task,purpose='conversation',title='Captura')=>scalar('select public.workspace_prepare_task_reference($1,$2,$3)',[task,title,purpose]);
 // Las reglas privadas se evalúan con la sesión de la persona (auth.uid) desde el rol administrador.
 const as=async(n,q,p=[])=>{await actor(n);await db.exec('reset role');return scalar(q,p);};
 const original=async(reference,n)=>{const id=`9c000000-0000-4000-8000-${String(n).padStart(12,'0')}`;await admin("insert into workspace_private.reference_originals(id,reference_id,object_key,file_name,mime_type,size_bytes,sha256,status,uploaded_by) values($1,$2,$3,'captura.png','image/png',1024,$4,'ready',(select created_by from workspace_private.edition_references where id=$2))",[id,reference,`conversation/${id}`,'a'.repeat(64)]);return id;};
 const doc=(text,image)=>({type:'doc',attrs:{schemaVersion:2},content:[{type:'paragraph',content:[{type:'text',text}]},...(image?[{type:'originalImage',attrs:{assetId:image,caption:'',credits:''}}]:[])]});

 await admin();
 const unit=await scalar("select id from public.workspace_units where slug='gimg'");
 // 1 Dirección · 2 autora de la asignación · 3 responsable del área (revisa) · 4 integrante de otra área.
 for(const n of [1,2,3,4]){await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`chat-${n}@example.invalid`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid(n),uid(n)]);
  await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[uid(n),`chat-${n}`]);await db.query("insert into public.workspace_unit_memberships(unit_id,user_id,membership_status) values($1,$2,'active')",[unit,uid(n)]);}
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Chat local')",[uid(1),unit]);
 await actor(1);const project=await cmd('project.create',{unit_id:unit,title:'Edición del chat'});
 await admin();
 const art=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='art'",[project.id]),text=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='text'",[project.id]);
 for(const [n,role,area,assignment] of [[2,'gimg_contributor',art,'contributor'],[3,'gimg_area_lead',art,'area_lead'],[4,'gimg_contributor',text,'contributor']]){
  await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,$2,$3,'area',$4,'Chat local')",[uid(n),role,unit,area]);
  await db.query('insert into public.workspace_assignments(user_id,assignment_role,unit_id,project_id,area_id,assigned_by) values($1,$2,$3,$4,$5,$6)',[uid(n),assignment,unit,project.id,area,uid(1)]);
 }
 await actor(1);const task=await cmd('task.create',{unit_id:unit,project_id:project.id,area_id:art,title:'Portada',responsible_id:uid(2)});

 // Quien revisa puede adjuntar a la conversación aunque no pueda editar la entrega.
 await actor(3);
 const leadRef=await prepare(task.id);eq([leadRef.purpose,leadRef.deliverable_id,leadRef.created_by],['conversation',task.id,uid(3)]);
 await actor(2);const ownRef=await prepare(task.id,'conversation','');eq(ownRef.title,'Imagen de la conversación');
 await actor(4);await bad(prepare(task.id),/permiso|permission|acceso/i);
 await actor(2);await bad(prepare(task.id,'otro'),/inválido/);
 eq(await as(3,'select workspace_private.support_upload_allowed(r) from workspace_private.edition_references r where id=$1',[leadRef.id]),true);
 eq(await as(2,'select workspace_private.support_upload_allowed(r) from workspace_private.edition_references r where id=$1',[leadRef.id]),false);
 eq(await as(2,'select workspace_private.reference_writable(r) from workspace_private.edition_references r where id=$1',[ownRef.id]),true);

 // Antes de enviarse, la imagen sólo la ve quien la subió.
 const image=await original(leadRef.id,1);
 const sees=n=>as(n,'select workspace_private.opal_original_for(o,$2) from workspace_private.reference_originals o where id=$1',[image,uid(n)]);
 eq([await sees(3),await sees(2),await sees(4)],[true,false,false]);
 // Al enviarse en un comentario, la ve quien puede leer la asignación; otra área no.
 const rev=async()=>{await admin();return scalar('select revision from public.workspace_deliverables where id=$1',[task.id]);};
 let r=await rev();await actor(3);await cmd('comment.add',{deliverable_id:task.id,project_id:project.id,body:'Mira el recorte',body_document:doc('Mira el recorte',image),editor_version:2},r);
 await admin();eq(await scalar("select count(*)::int from workspace_private.comment_media cm join public.workspace_comments c on c.id=cm.comment_id where c.deliverable_id=$1 and cm.original_id=$2",[task.id,image]),1);
 eq([await sees(2),await sees(4)],[true,false]);
 // Una imagen ajena no se puede usar en un comentario propio.
 await actor(2);const foreign=await original(ownRef.id,2);
 r=await rev();await actor(3);await bad(cmd('comment.add',{deliverable_id:task.id,project_id:project.id,body:'x',body_document:doc('x',foreign),editor_version:2},r),/acceso|permiso|permission/i);
 // Los comentarios generan avisos para la persona asignada.
 await admin();eq(await scalar("select count(*)::int from workspace_private.notifications where recipient_id=$1 and deliverable_id=$2 and event_type='conversation.updated'",[uid(2),task.id]),1);
 // Con la producción cerrada ya no se adjunta nada.
 await admin('update public.workspace_projects set status=$2 where id=$1',[project.id,'closed']);
 await actor(3);await bad(prepare(task.id),/cerrada|permiso|permission/i);
 eq(await as(2,'select workspace_private.reference_writable(r) from workspace_private.edition_references r where id=$1',[ownRef.id]),false);
 await admin('update public.workspace_projects set status=$2 where id=$1',[project.id,'active']);
 // Superficie: función anterior privada; materiales del encargo siguen igual.
 await admin();
 eq(await scalar("select has_function_privilege('authenticated','workspace_private.prepare_task_reference_before_conversation(uuid,text,text)','execute')"),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_prepare_task_reference(uuid,text,text)','execute')"),false);
 await actor(2);const material=await prepare(task.id,'document_image','Imagen del documento');eq(material.purpose,'document_image');
 console.log(`PASS: ${checks} conversation image assertions: reviewers can attach, private before sending, visible to task readers after, other areas denied, closed productions locked.`);
 return checks;
}
