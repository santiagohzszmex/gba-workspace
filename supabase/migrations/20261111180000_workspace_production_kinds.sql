-- Workspace 1.8.0 Labradorita · Tipos de producción.
-- GIMG ya no hace sólo ediciones editoriales. Cada producción tiene un tipo:
--   publication: las ediciones de siempre (Investigación, Editorial, Ilustración, Diseño y maquetación, QA).
--   video: Guion, Storyboard y animatic, Arte y personajes, Animación 3D, Animación 2D, Edición y montaje, Publicación en redes.
-- Aditiva: las producciones existentes quedan como publicaciones y sus áreas no cambian. No quita permisos; sólo agrega la
-- aprobación de las áreas de video a los mismos cargos que ya aprueban las áreas editoriales.
set lock_timeout='5s';

alter table public.workspace_projects add column kind text not null default 'publication' check(kind in('publication','video'));

do $$declare c text;begin
 select conname into c from pg_constraint where conrelid='public.workspace_areas'::regclass and contype='c' and pg_get_constraintdef(oid) like '%specialty%';
 if c is null then raise exception 'No se encontró la restricción de especialidades';end if;
 execute format('alter table public.workspace_areas drop constraint %I',c);
end;$$;
alter table public.workspace_areas add constraint workspace_areas_specialty_check check(specialty in('research','text','art','integration','qa','script','storyboard','animation_3d','animation_2d','editing','social'));

create function workspace_private.production_specialties(p_kind text) returns text[] language sql immutable set search_path=pg_catalog,pg_temp as $$
 select case p_kind when 'video' then array['script','storyboard','art','animation_3d','animation_2d','editing','social']
  else array['research','text','art','integration','qa'] end$$;

-- Un área sólo puede pertenecer a una producción de su tipo.
create function workspace_private.area_matches_production() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
declare k text;begin
 select kind into k from public.workspace_projects where id=new.project_id;
 if not new.specialty=any(workspace_private.production_specialties(k)) then
  raise exception 'El área no corresponde al tipo de producción' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger workspace_area_matches_production before insert or update of specialty,project_id on public.workspace_areas
 for each row execute function workspace_private.area_matches_production();

-- El tipo se fija al crear la producción (en la misma transacción) y después no cambia.
create function workspace_private.lock_production_kind() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if new.kind is distinct from old.kind and (old.created_at<>now() or exists(select 1 from public.workspace_deliverables d where d.project_id=old.id)) then
  raise exception 'El tipo de producción no se puede cambiar' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger workspace_lock_production_kind before update of kind on public.workspace_projects
 for each row execute function workspace_private.lock_production_kind();

-- Aprobar en las áreas de video: los mismos cargos y alcances que aprueban las áreas editoriales.
insert into workspace_private.role_permissions(role,permission,mode)
select r.role,'review.approve_'||s.specialty,r.mode
from (values('gimg_direction','U'),('gimg_project_director','P'),('gimg_area_lead','A')) r(role,mode)
cross join unnest(array['script','storyboard','animation_3d','animation_2d','editing','social']) s(specialty)
on conflict do nothing;

-- Crear producción: el comando anterior crea la producción y sus áreas editoriales; si es de video, se cambian por las
-- áreas de video en la misma transacción. Todo lo demás pasa sin cambios.
alter function public.workspace_command(text,jsonb,integer) set schema workspace_private;
alter function workspace_private.workspace_command(text,jsonb,integer) rename to command_before_production_kinds;
revoke all on function workspace_private.command_before_production_kinds(text,jsonb,integer) from public,anon,authenticated;
create function public.workspace_command(p_action text,p_data jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare k text:=coalesce(p_data->>'kind','publication');r jsonb;pid uuid;u uuid;begin
 if p_action<>'project.create' then return workspace_private.command_before_production_kinds(p_action,p_data,p_revision);end if;
 if k not in('publication','video') then raise exception 'Tipo de producción no válido' using errcode='22023';end if;
 r:=workspace_private.command_before_production_kinds(p_action,p_data-'kind',p_revision);
 if k='video' then
  pid:=(r->>'id')::uuid;
  select unit_id into u from public.workspace_projects where id=pid;
  delete from public.workspace_areas where project_id=pid;
  update public.workspace_projects set kind='video' where id=pid;
  insert into public.workspace_areas(unit_id,project_id,name,specialty) values
   (u,pid,'Guion','script'),(u,pid,'Storyboard y animatic','storyboard'),(u,pid,'Arte y personajes','art'),
   (u,pid,'Animación 3D','animation_3d'),(u,pid,'Animación 2D','animation_2d'),(u,pid,'Edición y montaje','editing'),
   (u,pid,'Publicación en redes','social');
  select to_jsonb(p) into r from public.workspace_projects p where id=pid;
 end if;
 return r;
end;$$;
revoke all on function public.workspace_command(text,jsonb,integer) from public,anon;
grant execute on function public.workspace_command(text,jsonb,integer) to authenticated;
