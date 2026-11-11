import assert from 'node:assert/strict';
import fs from 'node:fs';

// Workspace 1.8.0 Labradorita · Tipos de producción. Datos sintéticos en PGlite; nunca contra producción.
export const VIDEO_AREAS=[['Guion','script'],['Storyboard y animatic','storyboard'],['Arte y personajes','art'],['Animación 3D','animation_3d'],['Animación 2D','animation_2d'],['Edición y montaje','editing'],['Publicación en redes','social']];
export const PUBLICATION_AREAS=[['Investigación','research'],['Editorial','text'],['Ilustración','art'],['Diseño y maquetación','integration'],['QA','qa']];

export async function runProductionKindsAcceptance(db){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const bad=async(p,re)=>{await assert.rejects(p,re);checks++;};
 const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
 const uid=n=>`88000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid=n=>`89000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=()=>db.exec('reset role');
 const actor=async n=>{await admin();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(n),session_id:sid(n),role:'authenticated'})]);await db.exec('set role authenticated');};
 const cmd=(a,d,r=null)=>scalar('select public.workspace_command($1,$2,$3)',[a,d,r]);
 const areasOf=async project=>{await admin();return (await db.query('select name,specialty from public.workspace_areas where project_id=$1 order by name',[project])).rows.map(r=>[r.name,r.specialty]);};
 const sorted=list=>[...list].sort((a,b)=>a[0].localeCompare(b[0]));
 await admin();
 const unit=await scalar("select id from public.workspace_units where slug='gimg'");
 const existing=(await db.query("select id,kind from public.workspace_projects where kind is not null")).rows;
 // 1 Dirección; 2 responsable del área de Animación 3D; 3 animador; 4 responsable de otra área.
 for(const n of [1,2,3,4]){await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`labradorita-${n}@example.invalid`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid(n),uid(n)]);await db.query("insert into public.usuarios(id,rol,nombre,nombre_publico) values($1,'Usuario',$2,$2)",[uid(n),`labradorita-${n}`]);await db.query("insert into public.workspace_unit_memberships(unit_id,user_id,membership_status) values($1,$2,'active')",[unit,uid(n)]);}
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_direction',$2,'unit',$2,'Labradorita local')",[uid(1),unit]);

 // Las ediciones que ya existían quedan como publicaciones; nada se migra de otra forma.
 eq(existing.every(row=>row.kind==='publication'),true);
 eq(await scalar("select column_default from information_schema.columns where table_schema='public' and table_name='workspace_projects' and column_name='kind'"),"'publication'::text");

 // Sin tipo, o con tipo publicación, se crea una edición como siempre.
 await actor(1);
 const plain=await cmd('project.create',{unit_id:unit,title:'Edición de siempre'});
 eq(plain.kind,'publication');eq(sorted(await areasOf(plain.id)),sorted(PUBLICATION_AREAS));
 await actor(1);
 const explicit=await cmd('project.create',{unit_id:unit,title:'Edición explícita',kind:'publication'});
 eq(explicit.kind,'publication');eq(sorted(await areasOf(explicit.id)),sorted(PUBLICATION_AREAS));

 // Video: siete áreas propias y ninguna editorial.
 await actor(1);
 const video=await cmd('project.create',{unit_id:unit,title:'Corto de la mascota',kind:'video'});
 eq(video.kind,'video');eq(video.title,'Corto de la mascota');
 eq(sorted(await areasOf(video.id)),sorted(VIDEO_AREAS));
 eq(await scalar("select count(*)::int from public.workspace_audit where project_id=$1 and action='project.create'",[video.id]),1);

 // Tipos desconocidos y cambios de tipo se rechazan.
 await actor(1);
 await bad(cmd('project.create',{unit_id:unit,title:'Tipo raro',kind:'podcast'}),/Tipo de producción/);
 await admin();
 await bad(db.query("update public.workspace_projects set kind='video' where id=$1",[plain.id]),/tipo de producción/i);
 // Un área que no corresponde al tipo de producción no se puede crear.
 await bad(db.query("insert into public.workspace_areas(unit_id,project_id,name,specialty) values($1,$2,'Editorial','text')",[unit,video.id]),/no corresponde/);
 await bad(db.query("insert into public.workspace_areas(unit_id,project_id,name,specialty) values($1,$2,'Animación 3D','animation_3d')",[unit,plain.id]),/no corresponde/);
 await bad(db.query("insert into public.workspace_areas(unit_id,project_id,name,specialty) values($1,$2,'Otro','podcast')",[unit,video.id]),/no corresponde|check|specialty/i);

 // Permisos: Dirección aprueba en todas las áreas de video; un responsable, sólo en la suya.
 await admin();
 const area3d=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='animation_3d'",[video.id]);
 const areaScript=await scalar("select id from public.workspace_areas where project_id=$1 and specialty='script'",[video.id]);
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_area_lead',$2,'area',$3,'Labradorita local')",[uid(2),unit,area3d]);
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_area_lead',$2,'area',$3,'Labradorita local')",[uid(4),unit,areaScript]);
 // Un cargo de área sólo actúa con una asignación vigente en esa área.
 await db.query("insert into public.workspace_assignments(user_id,assignment_role,unit_id,project_id,area_id,assigned_by) values($1,'area_lead',$2,$3,$4,$5),($6,'area_lead',$2,$3,$7,$5)",[uid(2),unit,video.id,area3d,uid(1),uid(4),areaScript]);
 await db.query("insert into public.workspace_access_grants(user_id,access_role,unit_id,scope_type,scope_id,reason) values($1,'gimg_contributor',$2,'area',$3,'Labradorita local')",[uid(3),unit,area3d]);
 await db.query("insert into public.workspace_assignments(user_id,assignment_role,unit_id,project_id,area_id,assigned_by) values($1,'animation_3d',$2,$3,$4,$5)",[uid(3),unit,video.id,area3d,uid(1)]);
 for(const [,specialty] of VIDEO_AREAS){await actor(1);eq((await scalar('select public.workspace_permissions($1,$2,$3,null)',[unit,video.id,await (async()=>{await admin();const a=await scalar('select id from public.workspace_areas where project_id=$1 and specialty=$2',[video.id,specialty]);await actor(1);return a;})()]))[`review.approve_${specialty}`],true);}
 await actor(2);eq((await scalar('select public.workspace_permissions($1,$2,$3,null)',[unit,video.id,area3d]))['review.approve_animation_3d'],true);
 await actor(4);eq(Boolean((await scalar('select public.workspace_permissions($1,$2,$3,null)',[unit,video.id,area3d]))['review.approve_animation_3d']),false);

 // Ciclo completo en Animación 3D: el animador entrega, su responsable aprueba y otro responsable no puede.
 await actor(1);
 let t=await cmd('task.create',{unit_id:unit,project_id:video.id,area_id:area3d,title:'Animar la entrada de la mascota',responsible_id:uid(3)});
 await actor(3);
 t=await cmd('version.submit',{deliverable_id:t.id,project_id:video.id,editor_version:2,content_markdown:'Primer pase de animación',change_summary:'Primer pase'},t.revision);
 eq(t.state,'review');
 await actor(4);
 await bad(cmd('task.transition',{deliverable_id:t.id,project_id:video.id,state:'area_approved'},t.revision),/permiso|permission|denied|autorizad/i);
 await actor(2);
 t=await cmd('task.transition',{deliverable_id:t.id,project_id:video.id,state:'area_approved'},t.revision);
 eq(t.state,'area_approved');

 // La función anterior queda privada.
 await admin();
 eq(await scalar("select has_function_privilege('authenticated','workspace_private.command_before_production_kinds(text,jsonb,integer)','execute')"),false);
 eq(await scalar("select has_function_privilege('authenticated','public.workspace_command(text,jsonb,integer)','execute')"),true);
 console.log(`PASS: ${checks} production kind SQL assertions: publication defaults, video areas, kind locks, area/kind match, approvals per video area.`);
 return checks;
}

export async function applyProductionKinds(db){
 await db.exec('reset role');
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261111180000_workspace_production_kinds.sql',import.meta.url),'utf8'));
}
