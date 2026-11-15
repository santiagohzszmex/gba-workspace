-- Workspace 1.8.1 · Producciones de diseño, equivalencias de funciones y «Dirección de producción».
-- Aditiva. No cambia producciones, áreas, cargos ni permisos existentes; sólo agrega el tipo «design», sus áreas y
-- permisos de aprobación, y corrige cómo Accesos coloca a una persona en el área de cada tipo de producción.
set lock_timeout='5s';

-- 1. Tipo de producción «Diseño» (personajes como Giko, productos como el dispositivo).
do $$declare c text;begin
 select conname into c from pg_constraint where conrelid='public.workspace_projects'::regclass and contype='c' and pg_get_constraintdef(oid) like '%publication%video%';
 if c is null then raise exception 'No se encontró la restricción de tipo de producción';end if;
 execute format('alter table public.workspace_projects drop constraint %I',c);
 select conname into c from pg_constraint where conrelid='public.workspace_areas'::regclass and contype='c' and pg_get_constraintdef(oid) like '%animation_3d%';
 if c is null then raise exception 'No se encontró la restricción de especialidades';end if;
 execute format('alter table public.workspace_areas drop constraint %I',c);
end;$$;
alter table public.workspace_projects add constraint workspace_projects_kind_check check(kind in('publication','video','design'));
alter table public.workspace_areas add constraint workspace_areas_specialty_check check(specialty in('research','text','art','integration','qa',
 'script','storyboard','animation_3d','animation_2d','editing','social','concept','design','modeling_3d','prototype','presentation'));

create or replace function workspace_private.production_specialties(p_kind text) returns text[] language sql immutable set search_path=pg_catalog,pg_temp as $$
 select case p_kind when 'video' then array['script','storyboard','art','animation_3d','animation_2d','editing','social']
  when 'design' then array['research','concept','design','modeling_3d','prototype','presentation']
  else array['research','text','art','integration','qa'] end$$;

-- Aprobar en las áreas de diseño: los mismos cargos y alcances que en las demás.
insert into workspace_private.role_permissions(role,permission,mode)
select r.role,'review.approve_'||s.specialty,r.mode
from (values('gimg_direction','U'),('gimg_project_director','P'),('gimg_area_lead','A')) r(role,mode)
cross join unnest(array['concept','design','modeling_3d','prototype','presentation']) s(specialty)
on conflict do nothing;

-- Crear una producción de diseño: se crea como siempre y, en la misma transacción, recibe sus áreas.
alter function public.workspace_command(text,jsonb,integer) set schema workspace_private;
alter function workspace_private.workspace_command(text,jsonb,integer) rename to command_before_design;
revoke all on function workspace_private.command_before_design(text,jsonb,integer) from public,anon,authenticated;
create function public.workspace_command(p_action text,p_data jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r jsonb;pid uuid;u uuid;begin
 if p_action<>'project.create' or p_data->>'kind' is distinct from 'design' then return workspace_private.command_before_design(p_action,p_data,p_revision);end if;
 r:=workspace_private.command_before_design(p_action,p_data-'kind',p_revision);
 pid:=(r->>'id')::uuid;
 select unit_id into u from public.workspace_projects where id=pid;
 delete from public.workspace_areas where project_id=pid;
 update public.workspace_projects set kind='design' where id=pid;
 insert into public.workspace_areas(unit_id,project_id,name,specialty) values
  (u,pid,'Investigación y referencias','research'),(u,pid,'Concepto y bocetos','concept'),(u,pid,'Diseño','design'),
  (u,pid,'Modelado 3D y render','modeling_3d'),(u,pid,'Prototipo','prototype'),(u,pid,'Presentación','presentation');
 select to_jsonb(p) into r from public.workspace_projects p where id=pid;
 return r;
end;$$;
revoke all on function public.workspace_command(text,jsonb,integer) from public,anon;
grant execute on function public.workspace_command(text,jsonb,integer) to authenticated;

-- Los diseños también entregan videos (por ejemplo, un render giratorio) con la misma revisión que los videos.
create or replace function workspace_private.video_uploads_enabled(p_project uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select coalesce((select video_enabled from workspace_private.upload_policy where singleton),false)
 and workspace_private.image_project_enabled(p_project)
 and exists(select 1 from public.workspace_projects where id=p_project and kind in('video','design') and status='active' and deleted_at is null);
$$;
create or replace function workspace_private.video_task_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if new.kind='video' and (tg_op='INSERT' or old.kind is distinct from new.kind or old.project_id is distinct from new.project_id)
  and not exists(select 1 from public.workspace_projects where id=new.project_id and kind in('video','design')) then
  raise exception 'Las entregas de video sólo existen en producciones de video o diseño' using errcode='23514';
 end if;return new;
end;$$;

-- 2. Equivalencias: cada persona conserva su función y se coloca en el área equivalente del tipo de producción.
create function workspace_private.function_area(p_kind text,p_function text) returns table(specialty text,name text)
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select x.s,x.n from (values
  ('publication','research','research','Investigación'),('publication','writing','text','Editorial'),('publication','editorial','text','Editorial'),
  ('publication','layout','integration','Diseño y maquetación'),('publication','design','integration','Diseño y maquetación'),('publication','photography','art','Fotografía'),
  ('publication','illustration','art','Ilustración'),('publication','video_editing','art','Ilustración'),('publication','animation_2d','art','Ilustración'),('publication','animation_3d','art','Ilustración'),
  ('video','research','script','Guion'),('video','writing','script','Guion'),('video','editorial','script','Guion'),
  ('video','layout','social','Publicación en redes'),('video','design','social','Publicación en redes'),('video','photography','art','Arte y personajes'),
  ('video','illustration','art','Arte y personajes'),('video','video_editing','editing','Edición y montaje'),('video','animation_2d','animation_2d','Animación 2D'),('video','animation_3d','animation_3d','Animación 3D'),
  ('design','research','research','Investigación y referencias'),('design','writing','concept','Concepto y bocetos'),('design','editorial','concept','Concepto y bocetos'),
  ('design','layout','design','Diseño'),('design','design','design','Diseño'),('design','photography','presentation','Presentación'),
  ('design','illustration','design','Diseño'),('design','video_editing','presentation','Presentación'),('design','animation_2d','design','Diseño'),('design','animation_3d','modeling_3d','Modelado 3D y render')
 ) x(k,f,s,n) where x.k=coalesce(p_kind,'publication') and x.f=p_function
 union all select 'art','Ilustración' where coalesce(p_kind,'publication')='publication' and p_function not in('research','writing','editorial','layout','design','photography','illustration','video_editing','animation_2d','animation_3d')
 limit 1;
$$;
revoke all on function workspace_private.function_area(text,text) from public,anon,authenticated;

create or replace function workspace_private.cargo_catalog() returns jsonb language sql immutable set search_path=pg_catalog,pg_temp as $$
 select '[{"key":"direction","title":"Dirección general y creativa","accessRole":"gimg_direction","assignmentRole":"direction","scope":"unit","expiry":"none"},{"key":"production","title":"Responsable de Producción","accessRole":"gimg_production_lead","assignmentRole":"production","scope":"unit","expiry":"optional"},{"key":"coordination","title":"Coordinación de Producción y Workspace","accessRole":"gimg_workspace_coordinator","assignmentRole":"production","scope":"unit","expiry":"optional","needsProject":true},{"key":"project_director","title":"Dirección de producción","accessRole":"gimg_project_director","assignmentRole":"direction","scope":"project","expiry":"required"},{"key":"area_lead","title":"Responsable de área","accessRole":"gimg_area_lead","scope":"area","expiry":"optional","functions":["research","writing","editorial","layout","design","illustration","photography","video_editing","animation_2d","animation_3d"]},{"key":"contributor","title":"Integrante de un área","accessRole":"gimg_contributor","scope":"area","expiry":"optional","functions":["research","writing","editorial","layout","design","illustration","photography","video_editing","animation_2d","animation_3d"]},{"key":"quality","title":"Gestión de archivos y QA","accessRole":"gimg_quality_manager","assignmentRole":"qa","scope":"unit","expiry":"optional","needsProject":true},{"key":"viewer","title":"Consulta","accessRole":"gimg_viewer","scope":"project","expiry":"required"}]'::jsonb;
$$;

do $$declare f text;old_block text;begin
 f:=pg_get_functiondef('public.workspace_people_action(uuid,text,jsonb)'::regprocedure);
 old_block:=substring(f from position('  selected_specialty:=case fn' in f) for position('returning id into aid;end if;' in f)+length('returning id into aid;end if;')-position('  selected_specialty:=case fn' in f));
 if position('  selected_specialty:=case fn' in f)=0 or position('returning id into aid;end if;' in f)=0 or length(old_block)>2000 then raise exception 'Código de Accesos inesperado';end if;
 f:=replace(f,old_block,$b$  perform 1 from public.workspace_projects where id=pid for update;
  if nullif(p_data->>'areaId','') is not null then
   -- Área elegida a mano en Accesos: debe pertenecer a la producción elegida.
   select wa.id into aid from public.workspace_areas wa where wa.id=(p_data->>'areaId')::uuid and wa.project_id=pid;
   if aid is null then raise exception 'El área no pertenece a esa producción';end if;
  else
   -- Área equivalente a la función según el tipo de producción. En ediciones, Fotografía sigue separada de Ilustración.
   select fa.specialty,fa.name into selected_specialty,area_name from workspace_private.function_area((select kind from public.workspace_projects where id=pid),fn) fa;
   select wa.id into aid from public.workspace_areas wa join public.workspace_projects wp on wp.id=wa.project_id where wa.project_id=pid and wa.specialty=selected_specialty
    and (wp.kind<>'publication' or ((fn<>'photography' or wa.name=area_name) and (fn='photography' or wa.name<>'Fotografía'))) order by wa.name=area_name desc,wa.id limit 1;
   if aid is null then insert into public.workspace_areas(unit_id,project_id,name,specialty) values(p_unit_id,pid,area_name,selected_specialty) returning id into aid;end if;
  end if;$b$);
 f:=replace(f,'La Dirección de producto requiere vencimiento','La Dirección de producción requiere vencimiento');
 execute f;
end;$$;
notify pgrst,'reload schema';
