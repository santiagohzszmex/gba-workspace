import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FUNCTION_AREAS} from '../src/workspace/productionKinds.mjs';

// Workspace 1.8.1 · Producciones de diseño, equivalencias de funciones, «Dirección de producción» y códigos de Sepia.
// PGlite con datos sintéticos; nunca producción.
export const DESIGN_AREAS=[['Investigación y referencias','research'],['Concepto y bocetos','concept'],['Diseño','design'],['Modelado 3D y render','modeling_3d'],['Prototipo','prototype'],['Presentación','presentation']];
const migration=name=>fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');

export async function applyDesignProductions(db){
 await db.exec('reset role');
 await db.exec(migration('20261115180000_workspace_design_productions_and_roles.sql'));
 // Esquema mínimo de Sepia para la prueba local (en producción lo crea el servicio de acceso de Sepia).
 await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='sepia_access_owner') then create role sepia_access_owner nologin noinherit;end if;end$$;
  create schema if not exists sepia_private;
  create table if not exists sepia_private.runtime(id boolean primary key default true check(id),enabled boolean not null default false);
  insert into sepia_private.runtime values(true,true) on conflict(id) do update set enabled=true;
  create table if not exists sepia_private.license_codes(id uuid primary key default gen_random_uuid(),code_hash text not null unique,edition text not null default '01',duration_seconds bigint not null,assigned_user_id uuid,issued_by uuid,issued_at timestamptz not null default now(),redeem_before timestamptz,redeemed_by uuid,redeemed_at timestamptz,revoked_at timestamptz,label text not null default 'prueba');
  create table if not exists sepia_private.limits(key text primary key,started_at timestamptz not null default now(),attempts integer not null default 0);
  create table if not exists sepia_private.audit(id bigserial primary key,actor_id uuid,action text not null,entity_id uuid,reason text,created_at timestamptz not null default now());
  create or replace function sepia_private.account_active(u uuid) returns boolean language sql stable as $f$ select exists(select 1 from public.usuarios where id=u) and not exists(select 1 from workspace_private.accounts where user_id=u and suspended_at is not null)$f$;
  create or replace function sepia_private.limit_ok(k text,maximum integer,window_seconds integer) returns boolean language plpgsql as $f$declare n integer;begin
   insert into sepia_private.limits(key,attempts) values(k,1) on conflict(key) do update set attempts=case when sepia_private.limits.started_at<=now()-make_interval(secs=>window_seconds) then 1 else sepia_private.limits.attempts+1 end,started_at=case when sepia_private.limits.started_at<=now()-make_interval(secs=>window_seconds) then now() else sepia_private.limits.started_at end returning attempts into n;return n<=maximum;end$f$;
  grant usage on schema sepia_private to sepia_access_owner,postgres;grant all on all tables in schema sepia_private to sepia_access_owner;grant all on all sequences in schema sepia_private to sepia_access_owner;
  grant execute on all functions in schema sepia_private to sepia_access_owner;grant select on public.usuarios to sepia_access_owner;grant usage on schema workspace_private to sepia_access_owner;grant select on workspace_private.accounts to sepia_access_owner;
  grant create on schema sepia_private to sepia_access_owner;`);
 await db.exec(migration('20261115181000_workspace_sepia_license_codes.sql'));
}

export async function runDesignProductionsAcceptance(db){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const bad=async(p,re)=>{await assert.rejects(p,re);checks++;};
 const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
 const uid=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid=n=>`a2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=async(q,p=[])=>{await db.exec('reset role');return q?db.query(q,p):null;};
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(n),session_id:sid(n),role:'authenticated'})]);await db.exec('set role authenticated');};
 const cmd=(a,d,r=null)=>scalar('select public.workspace_command($1,$2,$3)',[a,d,r]);
 const people=(a,d)=>scalar("select public.workspace_people_action($1,$2,$3)",[unit,a,d]);
 const areasOf=async project=>(await admin('select name,specialty from public.workspace_areas where project_id=$1 order by name',[project])).rows.map(r=>[r.name,r.specialty]);
 const placed=async(project,user)=>(await admin('select ar.name,ar.specialty from public.workspace_assignments a join public.workspace_areas ar on ar.id=a.area_id where a.project_id=$1 and a.user_id=$2 order by a.starts_at desc limit 1',[project,user])).rows[0];
 const sorted=list=>[...list].sort((a,b)=>a[0].localeCompare(b[0]));
 await admin();
 const unit=await scalar("select id from public.workspace_units where slug='gimg'");
 // 1 Dirección · 2..7 integrantes que empezaron en ediciones · 8 integrante sin licencia.
 for(let n=1;n<=8;n++){await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`design-${n}@example.invalid`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid(n),uid(n)]);
  await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[uid(n),`design-${n}`]);await db.query("insert into public.workspace_unit_memberships(unit_id,user_id,membership_status) values($1,$2,'active')",[unit,uid(n)]);}
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Diseño local')",[uid(1),unit]);

 // Diseño: tercer tipo de producción, con sus seis áreas y sin tocar los otros.
 await actor(1);
 const design=await cmd('project.create',{unit_id:unit,title:'Giko · personaje',kind:'design'});
 eq(design.kind,'design');eq(sorted(await areasOf(design.id)),sorted(DESIGN_AREAS));
 await actor(1);const edition=await cmd('project.create',{unit_id:unit,title:'Edición de enero'});eq(edition.kind,'publication');
 await actor(1);const video=await cmd('project.create',{unit_id:unit,title:'Corto de Giko',kind:'video'});eq(video.kind,'video');
 await actor(1);await bad(cmd('project.create',{unit_id:unit,title:'Raro',kind:'podcast'}),/Tipo de producción/);
 await admin();await bad(db.query("update public.workspace_projects set kind='video' where id=$1",[design.id]),/tipo de producción/i);
 await bad(db.query("insert into public.workspace_areas(unit_id,project_id,name,specialty) values($1,$2,'Editorial','text')",[unit,design.id]),/no corresponde/);
 for(const specialty of ['concept','design','modeling_3d','prototype','presentation'])
  eq((await db.query("select role,mode from workspace_private.role_permissions where permission=$1 order by role",['review.approve_'+specialty])).rows,[{role:'gimg_area_lead',mode:'A'},{role:'gimg_direction',mode:'U'},{role:'gimg_project_director',mode:'P'}]);

 // Equivalencias: la misma función cae en el área equivalente de cada tipo de producción.
 const table=(await admin("select k,f,(select row(s.specialty,s.name)::text from workspace_private.function_area(k,f) s) area from unnest(array['publication','video','design']) k cross join unnest(array['research','writing','editorial','layout','design','illustration','photography','video_editing','animation_2d','animation_3d']) f")).rows;
 eq(table.filter(r=>!r.area).length,0);
 // La tabla que muestra Accesos es exactamente la del servidor.
 const quote=v=>/[\s,]/.test(v)?`"${v}"`:v;
 for(const r of table)eq([r.k,r.f,r.area],[r.k,r.f,`(${FUNCTION_AREAS[r.k][r.f][0]},${quote(FUNCTION_AREAS[r.k][r.f][1])})`]);
 const area=(k,f)=>table.find(r=>r.k===k&&r.f===f).area;
 eq([area('publication','writing'),area('video','writing'),area('design','writing')],['(text,Editorial)','(script,Guion)','(concept,"Concepto y bocetos")']);
 eq([area('video','animation_3d'),area('design','animation_3d'),area('publication','animation_3d')],['(animation_3d,"Animación 3D")','(modeling_3d,"Modelado 3D y render")','(art,Ilustración)']);
 eq([area('video','research'),area('design','research'),area('video','video_editing'),area('design','illustration')],['(script,Guion)','(research,"Investigación y referencias")','(editing,"Edición y montaje")','(design,Diseño)']);
 await actor(1);
 for(const [n,fn,project,expected] of [[2,'writing',video,['Guion','script']],[3,'animation_3d',video,['Animación 3D','animation_3d']],[4,'research',design,['Investigación y referencias','research']],
  [5,'animation_3d',design,['Modelado 3D y render','modeling_3d']],[6,'photography',edition,['Fotografía','art']],[7,'writing',edition,['Editorial','text']]]){
  await actor(1);await people('assign',{userId:uid(n),cargoKey:'contributor',projectId:project.id,functionKey:fn,reason:'Equivalencia local'});
  const row=await placed(project.id,uid(n));eq([row.name,row.specialty],expected);
 }
 // Antes de 1.8.1 un integrante de Redacción no podía entrar a un video: se buscaba «Editorial» y la base la rechazaba.
 eq((await areasOf(video.id)).some(([,s])=>s==='text'),false);
 // Elegir el área a mano: sólo áreas de la producción elegida.
 await admin();const prototype=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='prototype'",[design.id]);
 const otherArea=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='script'",[video.id]);
 await actor(1);await people('assign',{userId:uid(8),cargoKey:'contributor',projectId:design.id,functionKey:'design',areaId:prototype,reason:'Prototipo a mano'});
 eq((await placed(design.id,uid(8))).name,'Prototipo');
 await actor(1);await bad(people('assign',{userId:uid(5),cargoKey:'contributor',projectId:design.id,functionKey:'design',areaId:otherArea,reason:'Área ajena'}),/no pertenece/);
 // Responsable de área: ahora puede coordinar cualquier función, también las de video.
 await actor(1);await people('assign',{userId:uid(7),cargoKey:'area_lead',projectId:video.id,functionKey:'animation_3d',reason:'Responsable 3D'});
 eq((await placed(video.id,uid(7))).name,'Animación 3D');
 // El cargo se llama «Dirección de producción» y exige vencimiento.
 await admin();const catalog=await scalar('select workspace_private.cargo_catalog()');
 eq(catalog.find(c=>c.key==='project_director').title,'Dirección de producción');
 eq(catalog.find(c=>c.key==='area_lead').functions.includes('animation_3d'),true);
 await actor(1);await bad(people('assign',{userId:uid(6),cargoKey:'project_director',projectId:design.id,reason:'Sin vencimiento'}),/Dirección de producción requiere vencimiento|vencimiento/);

 // Los diseños aceptan entregas de video (render giratorio); las ediciones, no.
 await admin('update workspace_private.upload_policy set images_enabled=true,images_all_projects=true,video_enabled=true where singleton');
 await actor(1);let task=await cmd('task.create',{unit_id:unit,project_id:design.id,area_id:prototype,title:'Render giratorio del dispositivo',responsible_id:uid(8)});
 task=await scalar('select public.workspace_video_command($1,$2,$3,$4)',['kind.set',task.id,{kind:'video'},task.revision]);eq(task.kind,'video');
 await admin();const editionArea=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='art' limit 1",[edition.id]);
 await actor(1);const editionTask=await cmd('task.create',{unit_id:unit,project_id:edition.id,area_id:editionArea,title:'Portada',responsible_id:uid(6)});
 await bad(scalar('select public.workspace_video_command($1,$2,$3,$4)',['kind.set',editionTask.id,{kind:'video'},editionTask.revision]),/no están habilitadas|video o diseño/);
 await admin('update workspace_private.upload_policy set video_enabled=false where singleton');

 // Códigos de Sepia en la caja de licencia de Workspace (32 caracteres); los de Workspace siguen igual.
 const sepiaCode='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',hash=createHash('sha256').update(sepiaCode).digest('hex');
 await admin("insert into sepia_private.license_codes(code_hash,duration_seconds,assigned_user_id) values($1,2592000,null),($2,86400,$3)",[hash,createHash('sha256').update('B'.repeat(32)).digest('hex'),uid(2)]);
 await actor(8);const activated=await scalar('select public.workspace_activate_license($1)',['abcd-efgh ijkl-mnop qrst-uvwx yz23-4567']);
 eq([activated.product,activated.edition,Math.round((new Date(activated.expires_at)-new Date(activated.starts_at))/86400000)],['sepia','01',30]);
 // La licencia queda a nombre de la persona; en producción workspace_license_status ya cuenta las licencias de Sepia vigentes.
 await admin();eq(await scalar('select count(*)::int from sepia_private.licenses where user_id=$1 and revoked_at is null and expires_at>now()',[uid(8)]),1);
 await actor(8);eq((await scalar('select public.workspace_activate_license($1)',[sepiaCode])).product,'sepia');// la misma persona puede reintentar
 await actor(7);eq((await scalar('select public.workspace_activate_license($1)',[sepiaCode])).error,'Código inválido, vencido o ya utilizado');// otra persona, no
 await actor(7);eq((await scalar('select public.workspace_activate_license($1)',['B'.repeat(32)])).error,'Código inválido, vencido o ya utilizado');// asignado a otra persona
 await actor(7);eq((await scalar('select public.workspace_activate_license($1)',['Z'.repeat(48)])).error,'Código inválido, vencido o ya utilizado');// formato de Workspace: flujo anterior
 await admin("update sepia_private.runtime set enabled=false");
 await actor(2);eq((await scalar('select public.workspace_activate_license($1)',['B'.repeat(32)])).error,'Las licencias de Sepia no están disponibles en este momento.');
 await admin("update sepia_private.runtime set enabled=true");
 for(let i=0;i<8;i++){await actor(6);await scalar('select public.workspace_activate_license($1)',['C'.repeat(32)]);}
 await actor(6);eq((await scalar('select public.workspace_activate_license($1)',['C'.repeat(32)])).error,'Demasiados intentos. Vuelve a intentarlo en una hora.');
 await admin();eq(await scalar("select count(*)::int from sepia_private.audit where action='license.activated' and reason='workspace'"),1);

 // Superficie: funciones anteriores privadas.
 await admin();
 for(const fn of ['command_before_design(text,jsonb,integer)','activate_license_before_sepia(text)','function_area(text,text)'])
  eq(await scalar(`select has_function_privilege('authenticated','workspace_private.${fn}','execute')`),false);
 eq(await scalar("select has_function_privilege('authenticated','sepia_private.workspace_redeem(uuid,text)','execute')"),false);
 eq(await scalar("select has_function_privilege('anon','public.workspace_activate_license(text)','execute')"),false);
 console.log(`PASS: ${checks} 1.8.1 assertions: design productions, function equivalences, manual area, Dirección de producción, design videos and Sepia codes.`);
 return checks;
}
