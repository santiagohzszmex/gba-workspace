import {runDeviceNotificationAcceptance} from './workspace-device-notifications.test.mjs';
import {runUltramarAcceptance} from './workspace-ultramar.test.mjs';
import {runProductionKindsAcceptance,applyProductionKinds} from './workspace-production-kinds.test.mjs';
import {runVideoReviewsAcceptance,applyVideoReviews} from './workspace-video-reviews.test.mjs';
import {runVisualFunctionsAcceptance} from './workspace-visual-functions.test.mjs';
import {runClosedEditionAcceptance} from './workspace-closed-editions.test.mjs';
import {runDeadlineAcceptance} from './workspace-deadlines.test.mjs';
import {runLapisPilotAcceptance} from './workspace-lapis-pilot.test.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runOpalAcceptance } from './workspace-opal.test.mjs';
import { runSupportAcceptance } from './workspace-support.test.mjs';
import { runCuarzoAcceptance } from './workspace-cuarzo.test.mjs';
import {runLapisInterfaceAcceptance} from './workspace-lapis-interface.test.mjs';
import {runLapisGatewayAcceptance} from './workspace-lapis-gateway.test.mjs';
import {runLapisAcceptance} from './workspace-lapis.test.mjs';
import { runCoordinationScopeAcceptance } from './workspace-coordination-scope.test.mjs';
import {CUARZO_SCHEMA_QUERY} from '../scripts/workspace-cuarzo-schema-evidence.mjs';
import {runWorkspaceAuthAcceptance} from './workspace-auth.test.mjs';
import { runConnectorAcceptance } from './workspace-connector.test.mjs';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const db = new PGlite({ extensions: { pgcrypto } });
let checks=0;
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const session=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denied=async(p,re=/permiso|permission|denied|autorizad|propio|Sesión|Membresía|ronda|QA|Dirección|cambió|Transición|cerrado|Almacenamiento/i)=>{await assert.rejects(p,re);checks++;};
async function actor(n){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.session',$2,false)",[n?id(n):'',n?session(n):'']);await db.exec('set role authenticated');}
async function scalar(q,args=[]){return Object.values((await db.query(q,args)).rows[0])[0];}
async function cmd(action,data,revision=null){return scalar('select public.workspace_command($1,$2,$3)',[action,data,revision]);}
async function admin(q,args=[]){await db.exec('reset role');return db.query(q,args);}
try {
await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key,email text,encrypted_password text,updated_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create schema vault;
 create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text not null,name text,key_id uuid);
 create view vault.decrypted_secrets as select id,key_id,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid language sql as $$insert into vault.secrets(secret,name) values(new_secret,new_name) returning id$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid(),auth.jwt() to authenticated;
 create table public.usuarios(id uuid primary key references auth.users(id),rol text,nombre text,nombre_publico text,frase_seguridad text);
 alter table public.usuarios add column sello_editorial text;
 create table public.editoriales(id uuid primary key default gen_random_uuid(),nombre text,slug text,descripcion text,created_by uuid);
 create table public.solicitudes_editoriales(id uuid primary key,usuario_id uuid,nombre_noticiero text,descripcion text);
 create function public.vista_is_platform_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.usuarios where id=auth.uid() and rol in ('Dueño','Admin'))$$;
 create function public.vista_editorial_slugify(value text) returns text language sql immutable strict as $$select trim(both '-' from regexp_replace(lower(value),'[^a-z0-9]+','-','g'))$$;
 create table public.editorial_invitations(id uuid primary key,editorial_id uuid references public.editoriales(id),invited_user_id uuid references auth.users(id),role text,status text,expires_at timestamptz,invited_by uuid,responded_at timestamptz,updated_at timestamptz);
 create table public.editorial_members(editorial_id uuid,usuario_id uuid,role text,status text,invited_by uuid,updated_at timestamptz,unique(editorial_id,usuario_id));
 create table public.editorial_audit_log(editorial_id uuid,actor_id uuid,action text,target_type text,target_id text,details jsonb);
 create table public.gimg_recruitment_reviewers(user_id uuid,role text);
 create schema gimg_recruitment_private;grant usage on schema gimg_recruitment_private to authenticated;
 create function gimg_recruitment_private.active_session() returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$select auth.uid() is not null and exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id')$$;
 create table gimg_recruitment_private.identities(user_id uuid,recovery_hash text);
 create function public.gimg_recover_identity(text,text,text) returns boolean language sql as $$select false$$;
 create function gimg_recruitment_private.recover_identity(text,text,text) returns boolean language sql as $$select false$$;`);
for(let n=1;n<=12;n++) { await db.query("insert into auth.users values($1,$2,extensions.crypt('GBA-1234-SecureVault',extensions.gen_salt('bf',4)),now())",[id(n),`person${n}@gba.com`]);await db.query('insert into auth.sessions values($1,$2)',[session(n),id(n)]);await db.query('insert into public.usuarios values($1,$2,$3,$3,$4)',[id(n),n===1?'Dueño':'Usuario',`person${n}`,n===12?'sol':'old secret']); }
await db.query("insert into public.gimg_recruitment_reviewers values($1,'director')",[id(2)]);
for(const file of ['202608010001_gba_workspace_phase1.sql','202608140001_public_keynotes.sql','20261010005048_workspace_gimg.sql','20261010005053_workspace_licenses.sql','20261010005130_gba_id_secure_gateway.sql','20261010005309_gimg_role_isolation.sql','20261009123356_gimg_identity_role_isolation.sql','20261010010427_workspace_scope_search_path.sql','20261010012802_workspace_owner_desktop_access.sql','20261010183926_workspace_personal_drafts_and_library.sql','20261011002134_workspace_prisma_references_and_originals.sql','20261011002843_workspace_prisma_original_completion_scope.sql','20261011010112_workspace_prisma_metered_singleton_updates.sql','20261011051823_workspace_prisma_notifications.sql','20261011051829_workspace_prisma_edition_removal.sql','20261011065113_workspace_people_access.sql','20261011070825_workspace_people_access_lock.sql','20261011143801_workspace_reference_access_and_documents.sql','20261012012500_workspace_opal_editor_and_mentions.sql']) await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
const restoredCheckpoint=await scalar('select extensions.pgp_sym_decrypt(b.encrypted_payload,k.decrypted_secret)::jsonb from workspace_private.identity_rollout_backups b join vault.decrypted_secrets k on k.id=b.key_id');
eq(restoredCheckpoint.length,12);eq(restoredCheckpoint[0].frase_seguridad,'old secret');
eq(restoredCheckpoint[0].encrypted_password,await scalar('select pin_hash from workspace_private.id_secrets where user_id=$1',[id(1)]));
await actor(1);await denied(db.query('select * from workspace_private.identity_rollout_backups'));await admin('select 1');
await actor(1);eq(await scalar("select public.workspace_license_recipient(' @PERSON5 ')"),id(5));await denied(scalar("select public.workspace_license_recipient('missingperson')"),/GBA ID único/i);
await actor(2);await denied(scalar("select public.workspace_license_recipient('person5')"));await admin('select 1');
const unit=await scalar("select id from public.workspace_units where slug='gimg'");
await actor(1);const keynoteCollection=await scalar("select id from public.gba_workspace_collections where slug='keynotes'");const oldKeynote=(await db.query("insert into public.gba_workspace_documents(collection_id,title,content_markdown,status,owner_id,created_by,updated_by) values($1,'Keynote conservada','Contenido aprobado de Keynote','approved',$2,$2,$2) returning id",[keynoteCollection,id(1)])).rows[0].id;const keynote=await scalar('select to_jsonb(public.gba_workspace_publish_keynote($1,$2,$3))',[oldKeynote,'Esta Keynote conserva su publicación y su contenido.', '2026-10-08']);eq(keynote.content_markdown,'Contenido aprobado de Keynote');eq(keynote.is_published,true);
await actor(1);eq((await scalar('select public.workspace_context()')).platform_owner,true);eq((await scalar('select public.workspace_context()')).units.length,0);await denied(cmd('project.create',{unit_id:unit,title:'Not editorial'}));
// Owner exemption works in existing installed clients, without issuing a code.
const ownerStatus=await scalar('select public.workspace_license_status()');eq(ownerStatus.active,true);eq(ownerStatus.owner_access,true);eq(new Date(ownerStatus.expires_at)>new Date(),true);eq(await scalar('select count(*)::integer from public.workspace_licenses'),0);
await actor(2);eq((await scalar('select public.workspace_license_status()')).active,false);eq((await scalar('select public.workspace_license_status()')).owner_access,false);
await admin("update public.usuarios set rol='Admin' where id=$1",[id(1)]);await actor(1);eq((await scalar('select public.workspace_license_status()')).active,false);
await admin("update public.usuarios set rol='Dueño' where id=$1",[id(1)]);await db.query("update public.workspace_access_grants set revoked_at=now() where user_id=$1 and access_role='gba_platform_owner'",[id(1)]);await actor(1);eq((await scalar('select public.workspace_license_status()')).active,false);
await admin("update public.workspace_access_grants set revoked_at=null where user_id=$1 and access_role='gba_platform_owner'",[id(1)]);await actor(1);await db.query("select set_config('test.session','invalid-session',false)");eq((await scalar('select public.workspace_license_status()')).active,false);eq((await scalar('select public.workspace_license_status()')).expires_at,null);await actor(1);
await actor(1);eq(await scalar('select gimg_recruitment_private.director()'),false);eq(await scalar('select gimg_recruitment_private.reviewer()'),false);await actor(2);eq(await scalar('select gimg_recruitment_private.director()'),true);
await db.exec('reset role');await denied(db.query('update public.usuarios set rol=$1 where id=$2',['gimg_direction',id(2)]),/rangos generales/);const otherUnit=(await db.query("insert into public.workspace_units(slug,name) values('gba-other','Otra unidad') returning id")).rows[0].id;await denied(db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Prueba de aislamiento')",[id(2),otherUnit]),/unidad GIMG/);eq((await db.query('select rol from public.usuarios where id=$1',[id(2)])).rows[0].rol,'Usuario');await denied(db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gba_platform_owner',$2,'unit',$2,'Prueba de aislamiento')",[id(2),unit]),/workspace_role_domain/);
for(const [n,rank] of [[9,'Admin'],[10,'Editor'],[11,'Forge Engineer'],[12,'ANIMA Researcher']]){await admin('update public.usuarios set rol=$1 where id=$2',[rank,id(n)]);await actor(n);eq(await scalar('select gimg_recruitment_private.director()'),false);eq(await scalar('select gimg_recruitment_private.reviewer()'),false);eq((await scalar('select public.workspace_context()')).units.length,0);await denied(cmd('project.create',{unit_id:unit,title:'Rango general no es cargo GIMG'}));}
await admin("insert into public.editoriales(id,nombre,slug) values($1,'GIMG','gimg'),($2,'Editorial externa','external')",[id(80),id(81)]);await db.query("insert into public.editorial_invitations(id,editorial_id,invited_user_id,role,status,expires_at) values($1,$2,$3,'editor','pending',now()+interval '1 day'),($4,$5,$6,'editor','pending',now()+interval '1 day')",[id(82),id(80),id(5),id(83),id(81),id(4)]);await actor(5);eq(await scalar('select public.vista_editorial_respond_invitation($1,true)',[id(82)]),true);await admin('select 1');eq((await db.query('select rol from public.usuarios where id=$1',[id(5)])).rows[0].rol,'Usuario');await actor(4);eq(await scalar('select public.vista_editorial_respond_invitation($1,true)',[id(83)]),true);await admin('select 1');eq((await db.query('select rol from public.usuarios where id=$1',[id(4)])).rows[0].rol,'Editor');
// Live schema has many NULL ranks: GIMG enrollment must preserve them too.
await admin('update public.usuarios set rol=null where id=$1',[id(7)]);
await db.query("insert into public.solicitudes_editoriales values($1,$2,'Global Insight Media Group','GIMG'),($3,$4,'Editorial nueva externa','Externa')",[id(84),id(7),id(85),id(8)]);
await actor(7);await denied(scalar('select to_jsonb(public.vista_approve_editorial_request($1))',[id(84)]),/Platform admin/);
await actor(1);const newGimg=await scalar('select to_jsonb(public.vista_approve_editorial_request($1))',[id(84)]);eq(newGimg.slug,'global-insight-media-group');
await admin('select 1');eq((await db.query('select rol from public.usuarios where id=$1',[id(7)])).rows[0].rol,null);eq((await db.query('select role from public.editorial_members where editorial_id=$1 and usuario_id=$2',[newGimg.id,id(7)])).rows[0].role,'owner');eq(await scalar('select count(*)::integer from public.solicitudes_editoriales where id=$1',[id(84)]),0);
await actor(1);await scalar('select to_jsonb(public.vista_approve_editorial_request($1))',[id(85)]);await admin('select 1');eq((await db.query('select rol from public.usuarios where id=$1',[id(8)])).rows[0].rol,'Editor');
await actor(2);const project=await cmd('project.create',{unit_id:unit,title:'Halloween',brief:'Edición'});const second=await cmd('project.create',{unit_id:unit,title:'Leyendas'});
const areas=await db.query('select * from public.workspace_areas where project_id=$1',[project.id]);const art=areas.rows.find(x=>x.specialty==='art');
for(const [n,role] of [[3,'gimg_production_lead'],[4,'gimg_area_lead'],[5,'gimg_contributor'],[6,'gimg_quality_manager'],[7,'gimg_project_director'],[8,'gimg_viewer']]){
 await cmd('member.save',{unit_id:unit,user_id:id(n),membership_status:'active'});
 await cmd('grant.save',{unit_id:unit,user_id:id(n),access_role:role,scope_type:n===4?'area':n===7?'project':'unit',scope_id:n===4?art.id:n===7?project.id:unit,expires_at:n===7?new Date(Date.now()+86400000).toISOString():null,reason:'Asignación explícita aprobada'});
 if([4,6,7].includes(n))await cmd('assignment.save',{unit_id:unit,user_id:id(n),assignment_role:n===4?'area_lead':n===6?'qa':'direction',project_id:project.id,area_id:n===4?art.id:null});
}
await actor(2);await cmd('member.save',{unit_id:unit,user_id:id(9),membership_status:'active'});await cmd('grant.save',{unit_id:unit,user_id:id(9),access_role:'gimg_contributor',scope_type:'unit',scope_id:unit,reason:'Cargo de GIMG independiente del rango general'});await actor(9);await denied(cmd('project.create',{unit_id:unit,title:'Admin global con cargo colaborador'}));await admin('select 1');eq((await db.query('select rol from public.usuarios where id=$1',[id(9)])).rows[0].rol,'Admin');await actor(2);await denied(cmd('grant.save',{unit_id:unit,user_id:id(9),access_role:'Admin',scope_type:'unit',scope_id:unit,reason:'Rango general inválido para GIMG'}),/check constraint|Rol técnico/);
await actor(3);let task=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Portada',responsible_id:id(5)});
await denied(db.query('update public.workspace_deliverables set final_approved_by=$1 where id=$2',[id(3),task.id]));
await actor(5);eq((await db.query('select id from public.workspace_projects')).rows.map(x=>x.id),[project.id]);eq((await db.query('select id from public.workspace_deliverables')).rows.length,1);await denied(cmd('project.create',{unit_id:unit,title:'Denied'}));
task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'in_progress'},task.revision);
task=await cmd('version.submit',{project_id:project.id,deliverable_id:task.id,content_markdown:'Primera entrega',asset_url:'https://controlled.example/private/cover',change_summary:'Versión inicial'},task.revision);
await actor(3);await denied(cmd('version.submit',{project_id:project.id,deliverable_id:task.id,content_markdown:'Producción no asignada'},task.revision));await denied(cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'area_approved'},task.revision));await denied(cmd('publication.approve',{project_id:project.id,deliverable_id:task.id},task.revision));
await actor(4);task=await cmd('review.changes',{project_id:project.id,deliverable_id:task.id,body:'Ajusta los créditos'},task.revision);
await actor(5);task=await cmd('version.submit',{project_id:project.id,deliverable_id:task.id,content_markdown:'Entrega corregida',credits:'Autora: person5',change_summary:'Créditos corregidos'},task.revision);
await actor(4);await denied(cmd('review.changes',{project_id:project.id,deliverable_id:task.id,body:'Otra ronda'},task.revision),/ronda/);task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'area_approved'},task.revision);await denied(cmd('publication.approve',{project_id:project.id,deliverable_id:task.id},task.revision));
await actor(3);task=await cmd('task.schedule',{project_id:project.id,deliverable_id:task.id,due_at:'2026-11-01T18:00:00Z',priority:'high'},task.revision);eq((await db.query('select starts_at from public.workspace_events where deliverable_id=$1',[task.id])).rows.length,1);task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'in_qa'},task.revision);
await actor(6);task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'qa_approved'},task.revision);await denied(cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'published'},task.revision),/Dirección/);
await actor(2);task=await cmd('publication.approve',{project_id:project.id,deliverable_id:task.id},task.revision);await actor(6);task=await cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'published'},task.revision);eq(task.state,'published');
await actor(null);await db.exec('set role anon');const publicRows=(await db.query('select * from public.workspace_publications')).rows;eq(publicRows.length,1);eq(publicRows[0].content_markdown,'Entrega corregida');eq(publicRows[0].source_url,undefined);
await actor(6);task=await cmd('qa.block',{project_id:project.id,deliverable_id:task.id,reason:'Crédito faltante detectado después de publicar'},task.revision);await actor(null);await db.exec('set role anon');eq((await db.query('select * from public.workspace_publications')).rows.length,0);await actor(3);await denied(cmd('task.transition',{project_id:project.id,deliverable_id:task.id,state:'published'},task.revision),/QA/);await actor(6);task=await cmd('qa.release',{project_id:project.id,deliverable_id:task.id,reason:'Crédito corregido y verificado por QA'},task.revision);eq(task.final_approved_by,null);

eq((await db.query('select * from public.workspace_versions where deliverable_id=$1',[task.id])).rows.length,2);await denied(db.query("update public.workspace_versions set content_markdown='forged' where deliverable_id=$1",[task.id]));
await actor(2);await cmd('member.save',{unit_id:unit,user_id:id(5),membership_status:'suspended',reason:'Suspensión de prueba registrada'});await actor(5);eq((await db.query('select * from public.workspace_versions')).rows.length,0);await denied(cmd('comment.add',{project_id:project.id,deliverable_id:task.id,body:'Bypass'},task.revision));
await actor(2);await cmd('member.save',{unit_id:unit,user_id:id(5),membership_status:'active'});
await cmd('delegation.save',{unit_id:unit,user_id:id(8),scope_type:'deliverable',scope_id:task.id,permission_keys:['task.read','content.comment'],starts_at:new Date(Date.now()-10000).toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),reason:'Consulta de la portada aprobada'});
await actor(8);eq((await db.query('select * from public.workspace_deliverables')).rows.length,1);eq((await db.query('select * from public.workspace_versions')).rows.length,0);const hiddenVersion=(await admin('select id from public.workspace_versions where deliverable_id=$1 and version_number=1',[task.id])).rows[0].id;await actor(8);await denied(scalar('select public.workspace_asset_link($1)',[hiddenVersion]));
await actor(5);const version=(await db.query('select id from public.workspace_versions where deliverable_id=$1 and version_number=1',[task.id])).rows[0].id;eq((await scalar('select public.workspace_asset_link($1)',[version])).url,'https://controlled.example/private/cover');await denied(db.query('select * from workspace_private.asset_links'),/permission|denied/);
await admin("update public.workspace_assignments set expires_at=now()-interval '1 second',starts_at=now()-interval '1 day' where user_id=$1",[id(5)]);await actor(5);eq((await db.query('select * from public.workspace_deliverables')).rows.length,0);await admin('update public.workspace_assignments set expires_at=null where user_id=$1',[id(5)]);await actor(8);

await admin('update public.workspace_delegations set expires_at=now()-interval \'1 second\',starts_at=now()-interval \'1 day\' where delegate_user_id=$1',[id(8)]);await actor(8);eq((await db.query('select * from public.workspace_deliverables')).rows.length,0);
// Own deliverables cannot be approved by their author even with Direction.
await actor(2);let own=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Own',responsible_id:id(2)});own=await cmd('version.submit',{project_id:project.id,deliverable_id:own.id,content_markdown:'Owned'},own.revision);own=await cmd('task.transition',{project_id:project.id,deliverable_id:own.id,state:'area_approved'},own.revision);own=await cmd('task.transition',{project_id:project.id,deliverable_id:own.id,state:'in_qa'},own.revision);own=await cmd('task.transition',{project_id:project.id,deliverable_id:own.id,state:'qa_approved'},own.revision);await denied(cmd('publication.approve',{project_id:project.id,deliverable_id:own.id},own.revision),/propio/);
await actor(3);await denied(scalar('select public.workspace_export_audit($1)',[unit]));await actor(2);eq((await scalar('select public.workspace_export_audit($1)',[unit])).records.some(r=>r.action==='audit.exported'),true);
// Every new table denies direct access, and public RPCs pin their search path.
await admin('select 1');eq((await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='workspace_private' and relname in('drafts','version_documents','document_acceptances')")).rows.every(row=>row.relrowsecurity),true);eq((await db.query("select proname,proconfig from pg_proc where proname in('workspace_draft','workspace_save_draft','workspace_submit_draft','workspace_edition_documents','workspace_work_permissions')")).rows.every(row=>row.proconfig?.includes('search_path=pg_catalog, pg_temp')),true);
// Empty headings are not a real submission; a failed send preserves the private draft.
await actor(3);const emptyWork=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Documento vacío',responsible_id:id(5)});
await actor(5);const emptyDraft=await scalar('select public.workspace_save_draft($1,$2,0,0)',[emptyWork.id,{content_document:{type:'doc',content:[{type:'heading',attrs:{level:2}}]}}]);await denied(scalar('select public.workspace_submit_draft($1,$2,$3)',[emptyWork.id,emptyDraft.revision,emptyWork.revision]),/vacía/);eq((await scalar('select public.workspace_draft($1)',[emptyWork.id])).revision,emptyDraft.revision);eq(await scalar('select count(*)::integer from public.workspace_versions where deliverable_id=$1',[emptyWork.id]),0);
// Working copies stay private; accepted snapshots survive a later reopening.
await actor(3);let writing=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Documento de trabajo',responsible_id:id(5)});
const draftBody={content_markdown:'Este texto distinto no debe llegar a publicación',content_document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Investigación en borrador',marks:[{type:'textStyle',attrs:{color:'#663399'}}]}]}]},credits:'Autor: person5'};
const saveDraft=(body,revision=0,base=0)=>scalar('select public.workspace_save_draft($1,$2,$3,$4)',[writing.id,body,revision,base]);
await actor(5);let draft=await saveDraft(draftBody);eq(draft.revision,1);eq(draft.content_markdown.trim(),'Investigación en borrador');eq((await db.query('select state,current_version from public.workspace_deliverables where id=$1',[writing.id])).rows[0],{state:'assigned',current_version:0});
eq(await scalar('select count(*)::integer from public.workspace_versions where deliverable_id=$1',[writing.id]),0);
await denied(saveDraft(draftBody),/borrador cambió/);await denied(saveDraft(draftBody,draft.revision,1),/trabajo cambió/);
await denied(db.query('select * from workspace_private.drafts'));await denied(saveDraft({...draftBody,content_document:{}},draft.revision),/Elemento|check constraint|Documento inválido/);await denied(saveDraft({...draftBody,content_document:{type:'doc',content:[{type:'script',text:'bad'}]}},draft.revision),/Elemento/);await denied(db.query('select * from workspace_private.document_acceptances'));
await actor(3);await denied(scalar('select public.workspace_draft($1)',[writing.id]));
await actor(2);eq(await scalar('select public.workspace_draft($1)',[writing.id]),null); // Direction cannot see another author's private working copy.
await actor(5);await denied(scalar('select public.workspace_submit_draft($1,$2,$3,$4)',[writing.id,0,writing.revision,'Entrega']),/borrador cambió/);
writing=await scalar('select public.workspace_submit_draft($1,$2,$3,$4)',[writing.id,draft.revision,writing.revision,'Primera entrega']);eq(writing.state,'review');eq(writing.current_version,1);eq(await scalar('select public.workspace_draft($1)',[writing.id]),null);
await denied(saveDraft(draftBody,0,1),/revisión o cerrado/);
eq((await scalar('select public.workspace_work_permissions($1)',[project.id])).tasks[writing.id]['content.edit_assigned'],true);
const submittedVersion=(await db.query('select id from public.workspace_versions where deliverable_id=$1',[writing.id])).rows[0].id;
eq(await scalar('select public.workspace_version_document($1)',[submittedVersion]),draftBody.content_document);
eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).some(x=>x.deliverable_id===writing.id),false);
await actor(4);eq((await scalar('select public.workspace_work_permissions($1)',[project.id])).areas[art.id]['task.assign'],true);writing=await cmd('review.changes',{project_id:project.id,deliverable_id:writing.id,body:'Añadir referencias antes de aceptar'},writing.revision);
await actor(5);draft=await saveDraft({...draftBody,content_document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Investigación corregida'}]}]}},0,1);writing=await scalar('select public.workspace_submit_draft($1,$2,$3,$4)',[writing.id,draft.revision,writing.revision,'Referencias añadidas']);
await actor(4);writing=await cmd('task.transition',{project_id:project.id,deliverable_id:writing.id,state:'area_approved'},writing.revision);
await actor(2);let accepted=(await scalar('select public.workspace_edition_documents($1)',[project.id])).find(x=>x.deliverable_id===writing.id);eq(accepted.content_markdown.trim(),'Investigación corregida');eq(accepted.version_number,2);eq(accepted.content_document,draft.content_document);
writing=await cmd('review.reopen',{project_id:project.id,deliverable_id:writing.id,reason:'Actualizar investigación con nuevas fuentes'},writing.revision);
eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).find(x=>x.deliverable_id===writing.id).version_id,accepted.version_id);
await actor(3);const referenceReader=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Trabajo que usa la referencia',responsible_id:id(9)});
await actor(9);eq((await db.query('select id from public.workspace_versions where deliverable_id=$1',[writing.id])).rows.length,0);eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).find(x=>x.deliverable_id===writing.id).content_markdown.trim(),'Investigación corregida');await denied(scalar('select public.workspace_version_document($1)',[submittedVersion]));await denied(scalar('select public.workspace_edition_documents($1)',[second.id]));
await actor(2);const narrowReference=await cmd('grant.save',{unit_id:unit,user_id:id(9),access_role:'gimg_viewer',scope_type:'deliverable',scope_id:writing.id,reason:'Restringir este documento de referencia'});
await actor(9);eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).some(x=>x.deliverable_id===writing.id),false);
await actor(2);await cmd('grant.revoke',{unit_id:unit,id:narrowReference.id,reason:'Cambio de asignación de referencia'});await actor(9);eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).some(x=>x.deliverable_id===writing.id),true);
await actor(1);await denied(scalar('select public.workspace_work_permissions($1)',[project.id]));await denied(scalar('select public.workspace_edition_documents($1)',[project.id])); // Global owner has no editorial assignment.
await actor(6);writing=await cmd('qa.block',{project_id:project.id,deliverable_id:writing.id,reason:'La referencia necesita una verificación crítica'},writing.revision);eq((await scalar('select public.workspace_edition_documents($1)',[project.id])).some(x=>x.deliverable_id===writing.id),false);
await actor(2);await cmd('member.save',{unit_id:unit,user_id:id(9),membership_status:'suspended',reason:'Suspensión de prueba para referencias'});await actor(9);await denied(scalar('select public.workspace_edition_documents($1)',[project.id]));
// Prisma references: creative authority, area instructions, originals and hard limits.
const richReference={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Referencia de color',marks:[{type:'textStyle',attrs:{color:'#673AB7',fontFamily:'Georgia, serif'}}]}]}]};
const saveReference=(data,revision=0)=>scalar('select public.workspace_save_reference($1,$2,$3)',[project.id,data,revision]);
await actor(2);let concept=await saveReference({kind:'concept',title:'Concepto de Prisma',content_document:richReference,palette:['#673AB7']});
eq(concept.content_markdown.trim(),'Referencia de color');eq(concept.content_document.content[0].content[0].marks[0].attrs.color,'#673AB7');
await actor(3);await denied(saveReference({kind:'concept',title:'Producción cambia concepto',content_document:richReference}));
const productionGuide=await saveReference({kind:'instructions',title:'Indicaciones operativas',content_document:richReference});
await denied(cmd('project.save',{project_id:project.id,title:project.title,brief:'Cambio creativo por producción',status:'active'},project.revision));
await actor(4);let artGuide=await saveReference({kind:'instructions',area_id:art.id,title:'Instrucciones de ilustración',content_document:richReference});
await denied(saveReference({kind:'creative_direction',title:'Responsable modifica dirección',content_document:richReference}));
const otherArea=areas.rows.find(item=>item.id!==art.id);
await denied(saveReference({kind:'instructions',area_id:otherArea.id,title:'Fuera del área',content_document:richReference}));
await actor(6);await denied(saveReference({kind:'concept',title:'QA cambia concepto',content_document:richReference}));
await actor(1);await denied(scalar('select public.workspace_reference_bundle($1)',[project.id]));await denied(saveReference({kind:'concept',title:'Dueño GBA sin GIMG',content_document:richReference}));
await actor(5);let bundle=await scalar('select public.workspace_reference_bundle($1)',[project.id]);eq(bundle.references.some(item=>item.id===concept.id),true);eq(bundle.references.some(item=>item.id===artGuide.id),true);eq(bundle.references.every(item=>!item.can_edit),true);
await denied(saveReference({kind:'concept',title:'Colaborador cambia concepto',content_document:richReference}));await denied(scalar('select public.workspace_reference_bundle($1)',[second.id]));
await actor(2);await denied(saveReference({...concept,palette:['javascript:alert(1)']},concept.revision),/color/);
concept=await saveReference({...concept,title:'Concepto actualizado'},concept.revision);await denied(saveReference({...concept,title:'Edición antigua'},1),/cambió/);
await denied(saveReference({...artGuide,area_id:otherArea.id},artGuide.revision),/alcance/);
const moodboard=await saveReference({kind:'moodboard',title:'Moodboard privado',content_document:{type:'doc',content:[{type:'paragraph'}]}});
await denied(scalar('select public.workspace_original_gate($1,$2)',[moodboard.id,'wrong']),/Almacenamiento/);
const gatewayKey='local-gateway-test-only';
await admin("update workspace_private.original_limits set enabled=true,gateway_url='https://workspace-originals.test.workers.dev',gateway_key_hash=encode(extensions.digest($1,'sha256'),'hex')",[gatewayKey]);
await actor(2);const originalBegin=(reference,mime,size=100)=>scalar('select public.workspace_original_begin($1,$2,$3,$4,$5,$6)',[reference.id,'Original.pdf',mime,size,'a'.repeat(64),gatewayKey]);
const conceptPdf=await originalBegin(concept,'application/pdf');eq(conceptPdf.status,'reserved');await scalar('select public.workspace_original_finish($1,false,$2)',[conceptPdf.id,gatewayKey]);await denied(originalBegin(moodboard,'image/svg+xml'),/formato/);await denied(originalBegin(moodboard,'application/pdf',26214401),/25 MB/);
let original=await originalBegin(moodboard,'application/pdf');eq(original.status,'reserved');await admin("update public.workspace_unit_memberships set membership_status='inactive' where unit_id=$1 and user_id=$2",[unit,id(2)]);await actor(2);await denied(scalar('select public.workspace_original_finish($1,true,$2)',[original.id,gatewayKey]));await admin("update public.workspace_unit_memberships set membership_status='active' where unit_id=$1 and user_id=$2",[unit,id(2)]);await actor(2);await scalar('select public.workspace_original_finish($1,true,$2)',[original.id,gatewayKey]);
await denied(scalar('select public.workspace_original_finish($1,false,$2)',[original.id,gatewayKey]),/procesó/);
await actor(5);bundle=await scalar('select public.workspace_reference_bundle($1)',[project.id]);eq(bundle.references.find(item=>item.id===moodboard.id).originals[0].sha256,'a'.repeat(64));eq(bundle.references.find(item=>item.id===moodboard.id).originals[0].object_key,undefined);
eq((await scalar('select public.workspace_original_access($1,false,$2)',[original.id,gatewayKey])).id,original.id);
await denied(scalar('select public.workspace_original_finish($1,false,$2)',[original.id,gatewayKey]),/autorizado/);
await denied(scalar('select public.workspace_original_gate($1,$2)',[concept.id,gatewayKey]));
await admin('update workspace_private.original_limits set capacity_bytes=allocated_bytes+50');await actor(2);await denied(originalBegin(moodboard,'application/pdf'),/10 GB/);
await admin('update workspace_private.original_limits set capacity_bytes=10000000000,write_operations=200000');await actor(2);await denied(originalBegin(moodboard,'application/pdf'),/gratuito/);
await admin('update workspace_private.original_limits set write_operations=0,read_operations=2000000');await actor(2);await denied(scalar('select public.workspace_original_access($1,false,$2)',[original.id,gatewayKey]),/gratuito/);
await admin('update workspace_private.original_limits set read_operations=0,gateway_requests=50000');await actor(2);await denied(scalar('select public.workspace_original_gate($1,$2)',[moodboard.id,gatewayKey]),/gratuito/);
await admin('update workspace_private.original_limits set gateway_requests=0');await actor(2);const failedOriginal=await originalBegin(moodboard,'image/png');
await scalar('select public.workspace_original_finish($1,false,$2)',[failedOriginal.id,gatewayKey]);
await admin('select 1');eq(await scalar('select allocated_bytes from workspace_private.original_limits'),100);
await actor(2);await scalar('select public.workspace_archive_reference($1,$2)',[moodboard.id,moodboard.revision]);
eq((await scalar('select public.workspace_reference_bundle($1)',[project.id])).references.some(item=>item.id===moodboard.id),false);
await denied(scalar('select public.workspace_original_access($1,false,$2)',[original.id,gatewayKey]));
await admin('select 1');eq(await scalar('select allocated_bytes from workspace_private.original_limits'),100);eq(await scalar('select count(*)::int from workspace_private.reference_history where reference_id=$1',[concept.id]),2);
await actor(2);await db.query("select set_config('test.session','revoked-session',false)");await denied(scalar('select public.workspace_reference_bundle($1)',[project.id]));await denied(scalar('select public.workspace_original_gate($1,$2)',[concept.id,gatewayKey]));
await actor(9);await denied(scalar('select public.workspace_reference_bundle($1)',[project.id]));
await actor(5);await denied(db.query('select * from workspace_private.edition_references'));await denied(db.query('select * from workspace_private.original_limits'));
await actor(2);await cmd('member.save',{unit_id:unit,user_id:id(10),membership_status:'active'});await cmd('grant.save',{unit_id:unit,user_id:id(10),access_role:'gimg_workspace_coordinator',scope_type:'project',scope_id:project.id,reason:'Coordinación scoped'});await cmd('assignment.save',{unit_id:unit,user_id:id(10),assignment_role:'production',project_id:project.id});
await actor(10);await denied(saveReference({kind:'concept',title:'Coordinación modifica concepto',content_document:richReference}));await saveReference({kind:'instructions',title:'Coordinación operativa',content_document:richReference});
await actor(7);await denied(saveReference({kind:'concept',title:'Dirección sin mandato creativo',content_document:richReference}));
await actor(2);const creativeMandate=await cmd('delegation.save',{unit_id:unit,user_id:id(7),scope_type:'project',scope_id:project.id,permission_keys:['reference.manage_creative'],starts_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),reason:'Mandato creativo explícito de esta edición'});
await actor(7);await saveReference({kind:'concept',title:'Concepto delegado',content_document:richReference});
await admin("update public.workspace_delegations set expires_at=now()-interval '1 second',starts_at=now()-interval '1 day' where id=$1",[creativeMandate.id]);await actor(7);await denied(saveReference({kind:'concept',title:'Delegación vencida',content_document:richReference}));

// 1.5.5 recipient authority, private inbox, legacy conversion and reversible removal.
await actor(2);const legacy=await cmd('project.create',{unit_id:unit,title:'Legacy concept',brief:'Original preserved brief'});
await actor(3);await denied(scalar('select public.workspace_import_concept($1,$2)',[legacy.id,{title:'Denied concept',content_document:richReference}]));
await actor(2);const converted=await scalar('select public.workspace_import_concept($1,$2)',[legacy.id,{title:'Editable concept',content_document:richReference}]);
eq((await scalar('select public.workspace_reference_history($1)',[converted.id])).map(row=>row.revision),[1,0]);
eq((await scalar('select public.workspace_reference_history($1)',[converted.id]))[1].snapshot.content_markdown,'Original preserved brief');
eq(await scalar('select brief from public.workspace_projects where id=$1',[legacy.id]),'Original preserved brief');
await denied(scalar('select public.workspace_import_concept($1,$2)',[legacy.id,{title:'Duplicate',content_document:richReference}]),/ya tiene/);
await actor(3);let inboxTask=await cmd('task.create',{project_id:project.id,area_id:art.id,title:'Inbox assignment',responsible_id:id(5)});
await actor(5);let inbox=await scalar('select public.workspace_notifications()');let ownNotice=inbox.items.find(row=>row.deliverable_id===inboxTask.id);eq(Boolean(ownNotice),true);eq(ownNotice.read_at,null);
eq((await scalar('select public.workspace_read_notification($1)',[ownNotice.id])).deliverable_id,inboxTask.id);
eq(Boolean((await scalar('select public.workspace_notifications()')).items.find(row=>row.id===ownNotice.id).read_at),true);
await actor(6);await denied(scalar('select public.workspace_read_notification($1)',[ownNotice.id]),/alcance/);
await actor(1);eq((await scalar('select public.workspace_notifications()')).items.length,0);await denied(scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,legacy.revision,legacy.title,'Unauthorized technical account']));
await actor(5);await denied(db.query('select * from workspace_private.notifications'));
await db.query("select set_config('test.session','expired',false)");await denied(scalar('select public.workspace_notifications()'));await actor(5);
await admin("update public.workspace_unit_memberships set membership_status='suspended' where unit_id=$1 and user_id=$2",[unit,id(5)]);await actor(5);eq((await scalar('select public.workspace_notifications()')).items.length,0);
await admin("update public.workspace_unit_memberships set membership_status='active' where unit_id=$1 and user_id=$2",[unit,id(5)]);
await actor(3);inboxTask=await cmd('task.schedule',{project_id:project.id,deliverable_id:inboxTask.id,due_at:new Date(Date.now()+3600000).toISOString(),priority:'high'},inboxTask.revision);
await actor(5);const deadlineCount=()=>scalar('select public.workspace_notifications()').then(result=>result.items.filter(row=>row.event_type==='deadline' && row.deliverable_id===inboxTask.id).length);eq(await deadlineCount(),1);eq(await deadlineCount(),1);
await actor(5);inboxTask=await cmd('version.submit',{project_id:project.id,deliverable_id:inboxTask.id,content_markdown:'Review this document'},inboxTask.revision);
await actor(4);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='review.requested' && row.deliverable_id===inboxTask.id),true);
await actor(4);inboxTask=await cmd('task.transition',{project_id:project.id,deliverable_id:inboxTask.id,state:'area_approved'},inboxTask.revision);
await actor(5);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='document.accepted' && row.deliverable_id===inboxTask.id),true);
await actor(3);inboxTask=await cmd('task.transition',{project_id:project.id,deliverable_id:inboxTask.id,state:'in_qa'},inboxTask.revision);
await actor(6);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='qa.requested' && row.deliverable_id===inboxTask.id),true);inboxTask=await cmd('task.transition',{project_id:project.id,deliverable_id:inboxTask.id,state:'qa_approved'},inboxTask.revision);
await actor(2);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='publication.requested' && row.deliverable_id===inboxTask.id),true);inboxTask=await cmd('publication.approve',{project_id:project.id,deliverable_id:inboxTask.id},inboxTask.revision);
await actor(3);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='publication.authorized' && row.deliverable_id===inboxTask.id),false);
await actor(6);eq((await scalar('select public.workspace_notifications()')).items.some(row=>row.event_type==='publication.authorized' && row.deliverable_id===inboxTask.id),true);
await actor(3);await denied(scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,legacy.revision,legacy.title,'Production without delegation']));
await actor(2);await denied(scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,legacy.revision,'wrong','Reason for removal']),/nombre exacto/);
await denied(scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,legacy.revision,legacy.title,'short']),/motivo/);
await denied(scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,0,legacy.title,'Reason for removal']),/cambió/);
const removed=await scalar('select public.workspace_remove_edition($1,$2,$3,$4)',[legacy.id,legacy.revision,legacy.title,'Reversible removal test']);
eq((await db.query('select id from public.workspace_projects where id=$1',[legacy.id])).rows.length,0);
await denied(scalar('select public.workspace_reference_bundle($1)',[legacy.id]));
await denied(cmd('project.save',{project_id:legacy.id,title:'Bypass',status:'active'},removed.revision),/eliminada/);
eq((await scalar('select public.workspace_removed_editions($1)',[unit])).some(row=>row.id===legacy.id),true);
await actor(3);eq((await scalar('select public.workspace_removed_editions($1)',[unit])).length,0);await denied(scalar('select public.workspace_restore_edition($1,$2)',[legacy.id,removed.revision]));
await actor(2);const restored=await scalar('select public.workspace_restore_edition($1,$2)',[legacy.id,removed.revision]);eq(restored.revision,removed.revision+1);
eq((await scalar('select public.workspace_reference_history($1)',[converted.id])).length,2);
eq((await scalar('select public.workspace_reference_bundle($1)',[legacy.id])).references[0].id,converted.id);
await admin('select 1');
for(const n of [2,3,4,5,6,7,8,9,10]){
 for(const key of ['project.archive','task.assign','review.approve_art','qa.approve','publication.approve_final','reference.manage_creative']){
  await actor(n);const current=await scalar('select workspace_private.allowed($1,$2,$3,$4,$5)',[key,unit,project.id,art.id,inboxTask.id]);
  await admin('select 1');eq(await scalar('select workspace_private.notification_allowed($1,$2,$3,$4,$5,$6)',[id(n),key,unit,project.id,art.id,inboxTask.id]),current);
 }
}
// Person-first 1.5.6 APIs: atomicity, current authority, expiry and legacy bypass checks.
for(let n=13;n<=18;n++){await admin('insert into auth.users(id,email) values($1,$2)',[id(n),`people${n}@example.invalid`]);await db.query('insert into auth.sessions values($1,$2)',[session(n),id(n)]);await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[id(n),`people${n}`]);}
const people=(action,value)=>scalar('select public.workspace_people_action($1,$2,$3)',[unit,action,value]);
await actor(2);const peopleEdition=await cmd('project.create',{unit_id:unit,title:'People acceptance',ends_at:new Date(Date.now()+30*86400000).toISOString()});
const peopleAreas=(await db.query('select * from public.workspace_areas where project_id=$1',[peopleEdition.id])).rows;const researchArea=peopleAreas.find(a=>a.specialty==='research'),illustrationArea=peopleAreas.find(a=>a.specialty==='art');
let found=await scalar('select public.workspace_find_profile($1,$2)',[unit,' @PEOPLE13 ']);eq(found.profile.handle,'people13');eq(found.profile.email,undefined);eq(found.alreadyMember,false);
await people('invite',{userId:id(13),mode:'team',expiresAt:new Date(Date.now()+10*86400000).toISOString()});
await denied(people('invite',{userId:id(13),mode:'team'}),/ya es integrante/);
await admin('select 1');const accessNotices=await scalar("select count(*)::integer from workspace_private.notifications where recipient_id=$1 and event_type='access.updated'",[id(13)]);await actor(2);
let coupled=await people('assign',{userId:id(13),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research',expiresAt:new Date(Date.now()+30*86400000).toISOString()});eq(coupled.clamped,true);
await admin('select 1');eq(await scalar("select count(*)::integer from workspace_private.notifications where recipient_id=$1 and event_type='access.updated'",[id(13)]),accessNotices+1);let paired=(await db.query('select * from public.workspace_assignments where grant_id=$1',[coupled.id])).rows[0];eq(paired.function_key,'research');eq(paired.area_id,researchArea.id);eq(new Date(paired.expires_at).getTime(),new Date(coupled.expiresAt).getTime());
await actor(2);let snapshot=await scalar('select public.workspace_members_snapshot($1,$2,$3,$4)',[unit,peopleEdition.id,null,null]);eq(snapshot.matrix.gimg_direction['publication.approve_final'],'U');eq(snapshot.delegableKeys.includes('publication.approve_final'),false);eq(snapshot.delegableKeys.includes('unit.roles.grant'),false);eq(snapshot.delegableKeys.includes('asset.delete_physical'),false);eq(snapshot.grants.some(g=>g.id===coupled.id),true);
const shorter=new Date(Date.now()+5*86400000).toISOString();await people('expiry',{grantId:coupled.id,expiresAt:shorter,reason:'Ajuste de vigencia de prueba'});
await admin('select 1');eq(new Date((await db.query('select expires_at from public.workspace_assignments where grant_id=$1',[coupled.id])).rows[0].expires_at).getTime(),new Date(shorter).getTime());
await actor(2);await denied(people('assign',{userId:id(13),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research',expiresAt:shorter}),/Ya existe/);
await denied(people('assign',{userId:id(13),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'not-a-function'}),/función válida/);
// A live organizational assignment opens common materials before the first task.
await actor(13);eq((await db.query('select id from public.workspace_projects where id=$1',[peopleEdition.id])).rows.length,1);eq((await db.query('select id from public.workspace_deliverables where project_id=$1',[peopleEdition.id])).rows.length,0);eq((await db.query('select id from public.workspace_areas where project_id=$1',[peopleEdition.id])).rows.map(a=>a.id),[researchArea.id]);

await actor(2);const sharedRefs=[];
for(const kind of ['concept','creative_direction','moodboard','instructions']){
 const ref=await scalar('select public.workspace_save_reference($1,$2,0)',[peopleEdition.id,{kind,title:`File-only ${kind}`,content_document:{type:'doc',content:[{type:'paragraph'}]}}]);
 const asset=await originalBegin(ref,'application/pdf');await scalar('select public.workspace_original_finish($1,true,$2)',[asset.id,gatewayKey]);sharedRefs.push({ref,asset});
}
const ownGuide=await scalar('select public.workspace_save_reference($1,$2,0)',[peopleEdition.id,{kind:'instructions',area_id:researchArea.id,title:'Research guide',content_document:richReference}]);
const hiddenGuide=await scalar('select public.workspace_save_reference($1,$2,0)',[peopleEdition.id,{kind:'instructions',area_id:illustrationArea.id,title:'Other area guide',content_document:richReference}]);
let privateOther=await cmd('task.create',{project_id:peopleEdition.id,area_id:researchArea.id,title:'Private research',responsible_id:id(5)});
await actor(5);privateOther=await cmd('version.submit',{project_id:peopleEdition.id,deliverable_id:privateOther.id,content_markdown:'Private unaccepted version',asset_url:'https://private.example/source'},privateOther.revision);
await actor(2);const commonEvent=await cmd('event.save',{project_id:peopleEdition.id,title:'Common edition milestone',kind:'milestone',starts_at:'2026-11-01T12:00:00Z'});
await cmd('task.schedule',{project_id:peopleEdition.id,deliverable_id:privateOther.id,due_at:'2026-11-02T12:00:00Z',priority:'normal'},privateOther.revision);
await actor(13);const startupBundle=await scalar('select public.workspace_reference_bundle($1)',[peopleEdition.id]);
eq(startupBundle.references.length,5);eq(startupBundle.references.some(r=>r.id===ownGuide.id),true);eq(startupBundle.references.some(r=>r.id===hiddenGuide.id),false);
for(const {ref,asset} of sharedRefs){eq(startupBundle.references.find(r=>r.id===ref.id).originals[0].can_download,true);eq((await scalar('select public.workspace_original_access($1,true,$2)',[asset.id,gatewayKey])).id,asset.id);}
eq((await db.query('select id from public.workspace_deliverables where project_id=$1',[peopleEdition.id])).rows.length,0);
eq((await db.query('select id from public.workspace_versions where deliverable_id=$1',[privateOther.id])).rows.length,0);
eq((await db.query('select id from public.workspace_events where project_id=$1',[peopleEdition.id])).rows.map(e=>e.id),[commonEvent.id]);
await denied(scalar('select public.workspace_draft($1)',[privateOther.id]));
await denied(cmd('task.create',{project_id:peopleEdition.id,area_id:researchArea.id,title:'Try assigning other person',responsible_id:id(5)}));
await denied(scalar('select public.workspace_reference_bundle($1)',[second.id]));

for(const action of ['invite','assign','expiry','remove','membership','delegate','revoke'])await denied(people(action,{userId:id(13),grantId:coupled.id,delegationId:id(90),status:'active',mode:'team'}));
await denied(scalar('select public.workspace_find_profile($1,$2)',[unit,'people14']));await denied(db.query('select * from workspace_private.written_briefs'));
await actor(2);await denied(people('delegate',{delegateId:id(13),scopeType:'project',projectId:peopleEdition.id,permissionKeys:['publication.approve_final'],expiresAt:shorter,brief:'Intento de delegar aprobación final'}),/delegar/);
await denied(people('delegate',{delegateId:id(13),scopeType:'unit',permissionKeys:['unit.roles.grant'],expiresAt:shorter,brief:'Intento de delegar gestión de cargos'}),/delegar/);
await denied(people('delegate',{delegateId:id(13),scopeType:'project',projectId:peopleEdition.id,permissionKeys:['content.comment'],expiresAt:shorter,brief:'short'}),/mandato/);
await denied(people('delegate',{delegateId:id(13),scopeType:'project',projectId:peopleEdition.id,permissionKeys:['content.comment'],expiresAt:shorter,brief:'Mandato incompleto. Motivo: [escribe el motivo]'}),/mandato/);
const mandate=await people('delegate',{delegateId:id(13),scopeType:'project',projectId:peopleEdition.id,permissionKeys:['content.comment'],expiresAt:shorter,brief:'Puede comentar los trabajos de esta edición para apoyar la investigación; no puede aprobar entregas.'});
await actor(13);eq(await scalar("select workspace_private.allowed('content.comment',$1,$2,$3)",[unit,peopleEdition.id,researchArea.id]),true);
await actor(2);await people('revoke',{delegationId:mandate.id,reason:'Fin de la revisión de prueba'});await actor(13);eq(await scalar("select workspace_private.allowed('content.comment',$1,$2,$3)",[unit,peopleEdition.id,researchArea.id]),false);
await actor(2);await people('remove',{grantId:coupled.id,reason:'Fin del cargo de prueba'});await actor(13);eq((await db.query('select id from public.workspace_projects where id=$1',[peopleEdition.id])).rows.length,0);
await admin('select 1');eq((await db.query('select revoked_at is not null as revoked from public.workspace_access_grants where id=$1',[coupled.id])).rows[0].revoked,true);eq(await scalar('select count(*)::integer from workspace_private.written_briefs'),3); // two earlier mandates plus this immutable one
await actor(2);await people('membership',{userId:id(13),status:'suspended',reason:'Suspensión de prueba'});await denied(people('assign',{userId:id(13),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research'}),/activo|activa/);
await people('membership',{userId:id(13),status:'active',expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'Reactivación de prueba'});
await people('assign',{userId:id(13),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'photography',expiresAt:shorter});
await admin('select 1');const photography=(await db.query("select id from public.workspace_areas where project_id=$1 and name='Fotografía'",[peopleEdition.id])).rows[0];eq(photography.id===illustrationArea.id,false);
// Shortening the membership through the legacy API also caps linked records permanently.
await actor(2);const capAgain=new Date(Date.now()+3600000).toISOString();await cmd('member.save',{unit_id:unit,user_id:id(13),membership_status:'active',expires_at:capAgain,reason:'Reduced membership from legacy client'});
await admin('select 1');eq(await scalar('select bool_and(expires_at <= $3::timestamptz) from public.workspace_access_grants where unit_id=$1 and user_id=$2 and revoked_at is null',[unit,id(13),capAgain]),true);eq(await scalar('select bool_and(expires_at <= $3::timestamptz) from public.workspace_assignments where unit_id=$1 and user_id=$2',[unit,id(13),capAgain]),true);
await db.query("update public.workspace_unit_memberships set expires_at=now()-interval '1 second' where unit_id=$1 and user_id=$2",[unit,id(13)]);await actor(2);await denied(people('assign',{userId:id(13),cargoKey:'quality',projectId:peopleEdition.id}),/activo|activa/);
await actor(2);await people('invite',{userId:id(14),mode:'reserve'});await actor(14);eq((await scalar('select public.workspace_context()')).units.length,0);await actor(2);await denied(people('assign',{userId:id(14),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research'}),/activo|activa/);
await people('invite',{userId:id(15),mode:'team'});await people('assign',{userId:id(15),cargoKey:'coordination',projectId:peopleEdition.id,expiresAt:shorter});
await actor(15);await denied(people('invite',{userId:id(16),mode:'team'}));
await actor(2);await people('delegate',{delegateId:id(15),scopeType:'unit',permissionKeys:['unit.members.invite'],expiresAt:shorter,brief:'Puede incorporar cuentas ya autorizadas por Dirección para esta prueba; no puede otorgar cargos.'});
await actor(15);await people('invite',{userId:id(16),mode:'team'});await denied(people('assign',{userId:id(16),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research'}));
await denied(people('invite',{userId:id(17),mode:'viewer',projectId:peopleEdition.id}));await admin('select 1');eq(await scalar('select count(*)::integer from public.workspace_unit_memberships where unit_id=$1 and user_id=$2',[unit,id(17)]),0);
await actor(2);await people('invite',{userId:id(17),mode:'viewer',projectId:peopleEdition.id,expiresAt:shorter});
await actor(17);eq((await db.query('select id from public.workspace_projects')).rows.map(p=>p.id),[peopleEdition.id]);eq(await scalar("select workspace_private.allowed('content.edit_assigned',$1,$2,$3)",[unit,peopleEdition.id,researchArea.id]),false);eq(await scalar("select workspace_private.allowed('asset.download_source',$1,$2,$3)",[unit,peopleEdition.id,researchArea.id]),false);
await actor(2);await admin('select 1');const viewerGrant=await scalar("select id from public.workspace_access_grants where user_id=$1 and access_role='gimg_viewer' and revoked_at is null",[id(17)]);await actor(2);await people('expiry',{grantId:viewerGrant,expiresAt:shorter,reason:'Shorten shared consultation'});await admin('select 1');eq(await scalar('select expires_at=$2::timestamptz from public.workspace_delegations where grant_id=$1',[viewerGrant,shorter]),true);await actor(2);await people('remove',{grantId:viewerGrant,reason:'End consultation'});await actor(17);eq((await db.query('select id from public.workspace_projects where id=$1',[peopleEdition.id])).rows.length,0);
await actor(2);await people('invite',{userId:id(18),mode:'team'});await denied(people('assign',{userId:id(18),cargoKey:'contributor',projectId:peopleEdition.id,functionKey:'research',accessRole:'gba_platform_owner'}),/rango técnico/);
await denied(cmd('delegation.save',{unit_id:unit,user_id:id(18),scope_type:'project',scope_id:peopleEdition.id,permission_keys:['publication.approve_final'],starts_at:new Date().toISOString(),expires_at:shorter,reason:'Llamada directa antigua intentando aprobación final'}),/delegar/);
await denied(cmd('member.save',{unit_id:unit,user_id:id(18),membership_status:'suspended'}),/motivo/);
await admin('select 1');eq(await scalar("select count(*)::integer>0 from public.workspace_audit where action='people.cargo_assigned' and actor_id=$1",[id(2)]),true);

await actor(1);const issued=await scalar('select public.workspace_issue_license($1,$2,$3)',[7200,'Pilot',id(5)]);eq(issued.code.length,48);eq((await scalar('select public.workspace_license_codes()'))[0].code_hash,undefined);
await actor(6);eq(Boolean((await scalar('select public.workspace_activate_license($1)',[issued.code])).error),true);
await actor(5);let license=await scalar('select public.workspace_activate_license($1)',[issued.code]);eq(license.user_id,id(5));eq(new Date(license.expires_at).getTime()-new Date(license.starts_at).getTime(),7200000);eq((await scalar('select public.workspace_license_status()')).active,true);eq((await scalar('select public.workspace_activate_license($1)',[issued.code])).id,license.id);
await admin("update public.workspace_licenses set starts_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[license.id]);await actor(5);eq((await scalar('select public.workspace_license_status()')).active,false);
await actor(1);await scalar('select public.workspace_revoke_license($1,$2)',[issued.id,'Revocación de prueba']);await actor(5);eq((await scalar('select public.workspace_license_status()')).active,false);eq((await db.query('select * from public.workspace_deliverables where id=$1',[task.id])).rows.length,1);
await actor(1);await denied(scalar("select public.gba_id_gateway('login','person5','1234','','origin','device',null)"),/permission|denied/i);
await db.exec('reset role');let login=await scalar("select public.gba_id_gateway('login','person5','1234','','origin','device',null)");eq(login.user_id,id(5));eq(await scalar("select count(*)::integer from public.usuarios where frase_seguridad is not null"),0);eq(await scalar("select encrypted_password=extensions.crypt('GBA-1234-SecureVault',encrypted_password) from auth.users where id=$1",[id(5)]),false);
await db.query("insert into gimg_recruitment_private.identities values($1,encode(sha256(convert_to($2,'UTF8')),'hex'))",[id(6),'a'.repeat(48)]);eq((await scalar("select public.gba_id_gateway('recover','person6','9876',$1,'origin','device',null)",['a'.repeat(48)])).user_id,id(6));
for(let n=0;n<5;n++)eq(Boolean((await scalar("select public.gba_id_gateway('login','person7','0000','','origin','device',null)")).error),true);eq(Boolean((await scalar("select public.gba_id_gateway('login','person7','1234','','origin','device',null)")).retry_after),true);
const reset=await scalar("select public.gba_id_gateway('recover','person5','5678','old secret','origin','device',null)");eq(reset.user_id,id(5));await actor(5);eq((await scalar('select public.workspace_context()')).units.length,0);eq((await db.query('select * from public.workspace_deliverables')).rows.length,0);
await db.exec('reset role');
const shortPhraseRecovery=await scalar("select public.gba_id_gateway('recover','person12','9999',' Sol ','origin','device',null)");eq(shortPhraseRecovery.user_id,id(12));
eq((await scalar("select public.gba_id_gateway('login','person12','9999','','origin','device',null)")).user_id,id(12));
eq(Boolean((await scalar("select public.gba_id_gateway('prepare','newperson','1234','sol','origin','device',null)")).error),true);
// Run the dedicated release SQL in isolated local Postgres-compatible storage.
await db.exec(`alter table auth.users add column aud text,add column role text,add column raw_user_meta_data jsonb,add column is_sso_user boolean,add column is_anonymous boolean,add column created_at timestamptz;
 alter table auth.sessions add column created_at timestamptz,add column updated_at timestamptz;
 create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',nullif(current_setting('test.uid',true),''))::uuid$$;
 create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,jsonb_build_object('session_id',current_setting('test.session',true)))$$;
 create function public.test_reference_profile() returns trigger language plpgsql as $$begin insert into public.usuarios(id,rol,nombre,nombre_publico) values(new.id,'Usuario','fixture-'||new.id,'Fixture');return new;end;$$;
 create trigger test_reference_profile after insert on auth.users for each row execute function public.test_reference_profile();
 begin;`);
await db.exec(fs.readFileSync(new URL('./workspace-reference-access-live-acceptance.sql',import.meta.url),'utf8'));
const referenceAcceptance=(await db.query('select * from workspace_reference_access_test_result')).rows[0];
eq(referenceAcceptance.checks,26);eq(referenceAcceptance.credentials_preserved,true);eq(referenceAcceptance.keynotes_preserved,true);
await db.exec('rollback');
checks += await runOpalAcceptance(db);
checks += await runConnectorAcceptance(db);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261013040243_workspace_support_and_team.sql',import.meta.url),'utf8'));
checks += await runSupportAcceptance(db);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261014013712_workspace_cuarzo_documents.sql',import.meta.url),'utf8'));
checks += await runCuarzoAcceptance(db);
checks += await runCoordinationScopeAcceptance(db);
checks += await runLapisAcceptance(db);
checks += await runLapisGatewayAcceptance(db);
checks += await runLapisInterfaceAcceptance(db);
console.log(`BASELINE: ${checks} Workspace assertions before allowlist additions.`);
checks += await runLapisPilotAcceptance(db);
checks += await runDeadlineAcceptance(db);
checks += await runClosedEditionAcceptance(db);
checks += await runVisualFunctionsAcceptance(db);
checks += await runDeviceNotificationAcceptance(db);
checks += await runUltramarAcceptance(db);
await applyProductionKinds(db);
checks += await runProductionKindsAcceptance(db);
await applyVideoReviews(db);
checks += await runVideoReviewsAcceptance(db);
const authUi=await runWorkspaceAuthAcceptance();
if(process.env.WORKSPACE_SCHEMA_PROOF){await db.exec('reset role');fs.writeFileSync(process.env.WORKSPACE_SCHEMA_PROOF,JSON.stringify({sourceCommit:process.env.GITHUB_SHA,assertions:checks,authUi,evidence:(await db.query(CUARZO_SCHEMA_QUERY)).rows[0].evidence}));}
console.log(`PASS: ${checks} Workspace assertions: direct API denial, scopes, full editorial cycle, suspension, delegation expiry, immutable versions, self approval, licenses, recovery and session revocation.`);
}catch(error){console.error(error.stack,error.where||'',error.params||'');process.exitCode=1;}finally{await db.close();}
