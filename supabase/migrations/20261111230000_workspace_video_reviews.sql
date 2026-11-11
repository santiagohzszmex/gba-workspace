-- Workspace 1.8.0 Labradorita · Entregas y revisión de video.
-- Aditiva. Reutiliza la pasarela, el almacenamiento y la cuota de Lapislázuli (imágenes) para subir copias de revisión en
-- MP4 (H.264, máximo 720p, 10 minutos, 300 MB). La revisión, los comentarios con tiempo, los dibujos y el registro de
-- publicación en redes viven en tablas propias. Interruptor: upload_policy.video_enabled (apagado al aplicar).
-- No toca imágenes, documentos ni ediciones existentes.
set lock_timeout='5s';

-- 1. Tipo de entrega de video.
do $$declare c text;begin
 for c in select conname from pg_constraint where conrelid='public.workspace_deliverables'::regclass and contype='c' and pg_get_constraintdef(oid) like '%kind%image%' loop
  execute format('alter table public.workspace_deliverables drop constraint %I',c);end loop;
 for c in select conname from pg_constraint where conrelid='public.workspace_versions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%kind%image%' loop
  execute format('alter table public.workspace_versions drop constraint %I',c);end loop;
end;$$;
alter table public.workspace_deliverables add constraint workspace_deliverables_kind_check check(kind in('document','image','video'));
alter table public.workspace_versions add constraint workspace_versions_kind_check check(kind in('document','image','video'));

-- 2. Límites e interruptor. Una sola autoridad: la fila privada de política.
alter table workspace_private.upload_policy
 add column video_enabled boolean not null default false,
 add column video_max_bytes bigint not null default 314572800 check(video_max_bytes>0),
 add column video_max_seconds integer not null default 600 check(video_max_seconds between 1 and 3600),
 add column video_max_long_side integer not null default 1280 check(video_max_long_side between 16 and 7680),
 add column video_max_short_side integer not null default 720 check(video_max_short_side between 16 and 4320),
 add column video_link_seconds integer not null default 1800 check(video_link_seconds between 60 and 7200),
 add column video_purge_hours integer not null default 48 check(video_purge_hours between 1 and 720);

create or replace function workspace_private.upload_limit(p_kind text) returns bigint
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select case p_kind when 'reference' then reference_max_bytes when 'png' then png_max_bytes when 'layered' then layered_max_bytes when 'video' then video_max_bytes end from workspace_private.upload_policy where singleton;
$$;
revoke all on function workspace_private.upload_limit(text) from public,anon,authenticated;

-- 3. Las copias de revisión son activos del mismo almacén: rol video, formato mp4.
do $$declare c record;n integer:=0;begin
 for c in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid='workspace_private.image_assets'::regclass and contype='c' loop
  if (c.def like '%layered%' and c.def not like '%format%' and c.def not like '%status%')
   or c.def like '%image/png%'
   or (c.def like '%procreate%' and c.def not like '%role%') then
   execute format('alter table workspace_private.image_assets drop constraint %I',c.conname);n:=n+1;
  end if;
 end loop;
 if n<>3 then raise exception 'Restricciones de activos inesperadas: %',n;end if;
end;$$;
alter table workspace_private.image_assets
 add constraint image_asset_role check(role in('png','layered','video')),
 add constraint image_asset_format check(format in('png','psd','tiff','kra','procreate','afphoto','clip','mp4')),
 add constraint image_asset_role_format check((role='png' and format='png' and mime_type='image/png') or (role='layered' and format not in('png','mp4')) or (role='video' and format='mp4' and mime_type='video/mp4')),
 add constraint image_asset_verification check(verification in('unverified','header','zip_manifest','decoded','mp4'));

-- 4. Revisión de video.
create table workspace_private.video_versions(
 version_id uuid primary key references public.workspace_versions(id),deliverable_id uuid not null references public.workspace_deliverables(id),
 asset_id uuid not null unique references workspace_private.image_assets(id),duration_ms integer not null check(duration_ms>0),
 width integer not null check(width>0),height integer not null check(height>0),note text not null default '' check(length(note)<=4000),
 created_at timestamptz not null default now(),foreign key(version_id,deliverable_id) references public.workspace_versions(id,deliverable_id)
);
create index video_versions_task on workspace_private.video_versions(deliverable_id);
create table workspace_private.video_notes(
 id uuid primary key default gen_random_uuid(),version_id uuid not null references workspace_private.video_versions(version_id),
 author_id uuid not null references auth.users(id),time_ms integer not null check(time_ms>=0),
 drawing jsonb check(drawing is null or (jsonb_typeof(drawing)='array' and octet_length(drawing::text)<=65536)),
 body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz not null default now()
);
create index video_notes_version on workspace_private.video_notes(version_id,time_ms,created_at);
create index video_notes_author on workspace_private.video_notes(author_id);
create table workspace_private.video_note_replies(
 id uuid primary key default gen_random_uuid(),note_id uuid not null references workspace_private.video_notes(id),
 author_id uuid not null references auth.users(id),body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz not null default now()
);
create index video_replies_note on workspace_private.video_note_replies(note_id,created_at);
create index video_replies_author on workspace_private.video_note_replies(author_id);
create table workspace_private.video_note_resolutions(
 id uuid primary key default gen_random_uuid(),note_id uuid not null references workspace_private.video_notes(id),
 verified_version_id uuid not null references workspace_private.video_versions(version_id),resolved boolean not null,
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index video_resolutions_note on workspace_private.video_note_resolutions(note_id,created_at desc);
create index video_resolutions_version on workspace_private.video_note_resolutions(verified_version_id);
create index video_resolutions_actor on workspace_private.video_note_resolutions(actor_id);
-- Dónde y cuándo se publicó. Workspace no publica por su cuenta.
create table workspace_private.video_publications(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.workspace_projects(id),
 deliverable_id uuid not null references public.workspace_deliverables(id),
 network text not null check(network in('instagram','tiktok','youtube','facebook','x','threads','other')),
 url text not null check(length(url)<=2000 and url ~ '^https://[^[:space:]/]+\.[^[:space:]]+$'),
 published_at timestamptz not null,author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 removed_at timestamptz,removed_by uuid references auth.users(id),check((removed_at is null)=(removed_by is null))
);
create index video_publications_project on workspace_private.video_publications(project_id,published_at desc);
create index video_publications_task on workspace_private.video_publications(deliverable_id);
create index video_publications_author on workspace_private.video_publications(author_id);
create index video_publications_remover on workspace_private.video_publications(removed_by) where removed_by is not null;
-- Copias viejas que se borran después de publicar. Se conservan comentarios, dibujos y el registro de versiones.
create table workspace_private.video_purges(
 asset_id uuid primary key references workspace_private.image_assets(id),project_id uuid not null references public.workspace_projects(id),
 due_at timestamptz not null,lease_id uuid,lease_until timestamptz,deleted_at timestamptz,created_at timestamptz not null default now()
);
create index video_purges_due on workspace_private.video_purges(due_at) where deleted_at is null;
create index video_purges_project on workspace_private.video_purges(project_id);
do $$declare n text;begin
 foreach n in array array['video_versions','video_notes','video_note_replies','video_note_resolutions','video_publications','video_purges'] loop
  execute format('alter table workspace_private.%I enable row level security',n);
  execute format('revoke all on workspace_private.%I from public,anon,authenticated',n);
 end loop;
end;$$;
create trigger video_version_immutable before update or delete on workspace_private.video_versions for each row execute function workspace_private.image_immutable();
create trigger video_notes_immutable before update or delete on workspace_private.video_notes for each row execute function workspace_private.image_immutable();
create trigger video_replies_immutable before update or delete on workspace_private.video_note_replies for each row execute function workspace_private.image_immutable();
create trigger video_resolutions_immutable before update or delete on workspace_private.video_note_resolutions for each row execute function workspace_private.image_immutable();
create function workspace_private.video_asset_frozen() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if exists(select 1 from workspace_private.video_versions where asset_id=old.id) then raise exception 'La copia enviada es inmutable';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger video_asset_frozen before update or delete on workspace_private.image_assets for each row execute function workspace_private.video_asset_frozen();
revoke all on function workspace_private.video_asset_frozen() from public,anon,authenticated;

-- Una entrega de video sólo existe en una producción de video.
create function workspace_private.video_task_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if new.kind='video' and (tg_op='INSERT' or old.kind is distinct from new.kind or old.project_id is distinct from new.project_id)
  and not exists(select 1 from public.workspace_projects where id=new.project_id and kind='video') then
  raise exception 'Las entregas de video sólo existen en producciones de video' using errcode='23514';
 end if;return new;
end;$$;
create trigger video_task_guard before insert or update of kind,project_id on public.workspace_deliverables for each row execute function workspace_private.video_task_guard();
revoke all on function workspace_private.video_task_guard() from public,anon,authenticated;

-- Dibujo sobre un fotograma: trazos con coordenadas relativas (0 a 1) y colores de una paleta fija.
create function workspace_private.video_drawing_valid(d jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$declare s jsonb;p jsonb;begin
 if d is null then return true;end if;
 if jsonb_typeof(d)<>'array' or jsonb_array_length(d) not between 1 and 40 or octet_length(d::text)>65536 then return false;end if;
 for s in select * from jsonb_array_elements(d) loop
  if jsonb_typeof(s)<>'object' or (select count(*) from jsonb_object_keys(s) k where k not in('color','width','points'))>0 then return false;end if;
  if s->>'color' is null or s->>'color' not in('#e5484d','#f5d90a','#30a46c','#0091ff','#ffffff','#111111') then return false;end if;
  if jsonb_typeof(s->'width')<>'number' or (s->>'width')::numeric not between 1 and 16 then return false;end if;
  if jsonb_typeof(s->'points')<>'array' or jsonb_array_length(s->'points') not between 1 and 500 then return false;end if;
  for p in select * from jsonb_array_elements(s->'points') loop
   if jsonb_typeof(p)<>'array' or jsonb_array_length(p)<>2 or jsonb_typeof(p->0)<>'number' or jsonb_typeof(p->1)<>'number'
    or (p->>0)::numeric not between 0 and 1 or (p->>1)::numeric not between 0 and 1 then return false;end if;
  end loop;
 end loop;
 return true;
end;$$;
revoke all on function workspace_private.video_drawing_valid(jsonb) from public,anon,authenticated;

create function workspace_private.video_uploads_enabled(p_project uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select coalesce((select video_enabled from workspace_private.upload_policy where singleton),false)
 and workspace_private.image_project_enabled(p_project)
 and exists(select 1 from public.workspace_projects where id=p_project and kind='video' and status='active' and deleted_at is null);
$$;
revoke all on function workspace_private.video_uploads_enabled(uuid) from public,anon,authenticated;

-- Quién registra publicaciones: responsables de la etapa de redes, quien aprueba esa área o Dirección.
create function workspace_private.video_can_publish(t public.workspace_deliverables) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select workspace_private.allowed('publication.approve_final',t.unit_id,t.project_id,t.area_id,t.id)
 or exists(select 1 from public.workspace_areas a where a.project_id=t.project_id and a.specialty='social'
  and (workspace_private.allowed('review.approve_social',t.unit_id,t.project_id,a.id,null)
   or exists(select 1 from public.workspace_deliverables d where d.area_id=a.id and (d.responsible_id=auth.uid() or auth.uid()=any(d.collaborator_ids)))));
$$;
revoke all on function workspace_private.video_can_publish(public.workspace_deliverables) from public,anon,authenticated;

-- 5. Comandos de video. Superficie propia; el comando general no envía videos.
create function public.workspace_video_command(p_action text,p_deliverable_id uuid,p_data jsonb default '{}',p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare t public.workspace_deliverables;p workspace_private.upload_policy;a workspace_private.image_assets;n workspace_private.video_notes;
 vv workspace_private.video_versions;v public.workspace_versions;pub workspace_private.video_publications;result jsonb;body text;target uuid;num integer;
begin
 if not workspace_private.session_active() then raise exception 'Sesión activa requerida' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>80000 then raise exception 'Datos inválidos';end if;
 select * into t from public.workspace_deliverables where id=p_deliverable_id for update;
 if t.id is null or not workspace_private.can_read_task(t.id) or not exists(select 1 from public.workspace_projects where id=t.project_id and deleted_at is null) then raise exception 'Asignación fuera de tu acceso' using errcode='42501';end if;
 select * into p from workspace_private.upload_policy where singleton;
 if p_action='kind.set' then
  perform workspace_private.require('task.assign',t.unit_id,t.project_id,t.area_id,t.id);
  if p_revision is distinct from t.revision then raise exception 'La asignación cambió; vuelve a cargar' using errcode='40001';end if;
  if p_data->>'kind' not in('video','document') then raise exception 'Tipo de entrega inválido';end if;
  if t.kind=p_data->>'kind' then return to_jsonb(t);end if;
  if t.state not in('pending','assigned','in_progress','changes_requested') then raise exception 'Reabre la asignación antes de cambiar su tipo';end if;
  if t.current_version>0 or exists(select 1 from workspace_private.drafts where deliverable_id=t.id) or exists(select 1 from workspace_private.image_assets where deliverable_id=t.id) then raise exception 'La asignación ya tiene entregas; crea otra para cambiar el tipo';end if;
  if p_data->>'kind'='video' and not workspace_private.video_uploads_enabled(t.project_id) then raise exception 'Las entregas de video no están habilitadas en esta producción';end if;
  if t.kind='image' then raise exception 'Esta asignación es de imagen';end if;
  update public.workspace_deliverables set kind=p_data->>'kind',revision=revision+1,updated_at=now() where id=t.id returning to_jsonb(workspace_deliverables.*) into result;
  perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'video.kind.set',t.id,jsonb_build_object('kind',p_data->>'kind'));
  return result;
 end if;
 -- Publicaciones: desde la etapa de redes (o cualquier asignación, para Dirección) de una producción de video.
 if p_action in('publication.add','publication.remove') and not exists(select 1 from public.workspace_projects where id=t.project_id and kind='video') then raise exception 'Las publicaciones se registran en producciones de video';end if;
 if p_action='publication.add' then
  if not workspace_private.video_can_publish(t) then raise exception 'No puedes registrar publicaciones de esta producción' using errcode='42501';end if;
  if not exists(select 1 from public.workspace_deliverables d where d.project_id=t.project_id and d.kind='video' and d.current_version>0 and d.state in('area_approved','in_qa','qa_approved','published')) then raise exception 'Registra la publicación cuando el video esté aprobado';end if;
  if p_data->>'network' is null or p_data->>'network' not in('instagram','tiktok','youtube','facebook','x','threads','other') then raise exception 'Elige la red social';end if;
  if length(p_data->>'url')>2000 or coalesce(p_data->>'url','') !~ '^https://[^[:space:]/]+\.[^[:space:]]+$' then raise exception 'Pega el enlace completo de la publicación (https://…)';end if;
  if coalesce((p_data->>'published_at')::timestamptz,now()) not between now()-interval '5 years' and now()+interval '1 day' then raise exception 'Revisa la fecha de publicación';end if;
  insert into workspace_private.video_publications(project_id,deliverable_id,network,url,published_at,author_id)
  values(t.project_id,t.id,p_data->>'network',p_data->>'url',coalesce((p_data->>'published_at')::timestamptz,now()),auth.uid()) returning * into pub;
  -- Copias viejas de toda la producción: todas menos la versión vigente de cada entrega.
  insert into workspace_private.video_purges(asset_id,project_id,due_at)
  select x.id,t.project_id,now()+make_interval(hours=>p.video_purge_hours) from workspace_private.image_assets x join public.workspace_deliverables d on d.id=x.deliverable_id
  where d.project_id=t.project_id and x.role='video' and x.status='validated'
   and not exists(select 1 from workspace_private.video_versions cv join public.workspace_versions w on w.id=cv.version_id where cv.asset_id=x.id and w.version_number=d.current_version)
  on conflict(asset_id) do nothing;
  perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'video.publication.add',pub.id,jsonb_build_object('network',pub.network));
  return to_jsonb(pub);
 elsif p_action='publication.remove' then
  select * into pub from workspace_private.video_publications where id=(p_data->>'publication_id')::uuid and project_id=t.project_id and removed_at is null for update;
  if pub.id is null then raise exception 'Registro no encontrado';end if;
  if pub.author_id<>auth.uid() and not workspace_private.allowed('publication.approve_final',t.unit_id,t.project_id,t.area_id,t.id) then raise exception 'Solo quien registró la publicación o Dirección puede quitarla' using errcode='42501';end if;
  update workspace_private.video_publications set removed_at=now(),removed_by=auth.uid() where id=pub.id returning * into pub;
  perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'video.publication.remove',pub.id,'{}');
  return to_jsonb(pub);
 end if;
 if t.kind<>'video' then raise exception 'Esta asignación no es de video';end if;
 if p_action='version.submit' then
  perform workspace_private.require('content.edit_assigned',t.unit_id,t.project_id,t.area_id,t.id);
  perform workspace_private.require('content.request_review',t.unit_id,t.project_id,t.area_id,t.id);
  if not workspace_private.video_uploads_enabled(t.project_id) then raise exception 'Las entregas de video no están habilitadas en esta producción';end if;
  if t.state not in('pending','assigned','in_progress','changes_requested') then raise exception 'Reabre la asignación antes de enviar una versión';end if;
  if (p_data->>'base_version')::integer is distinct from t.current_version then raise exception 'La versión base cambió; vuelve a cargar' using errcode='40001';end if;
  select * into a from workspace_private.image_assets where id=(p_data->>'asset_id')::uuid;
  if a.id is null or a.deliverable_id<>t.id or a.owner_id<>auth.uid() or a.role<>'video' then raise exception 'Video de otra asignación' using errcode='42501';end if;
  if a.status<>'validated' or a.verification<>'mp4' or exists(select 1 from workspace_private.image_upload_sessions s where s.asset_id=a.id and s.state<>'ready') then raise exception 'El video todavía no termina de subir';end if;
  if exists(select 1 from workspace_private.video_versions where asset_id=a.id) then raise exception 'Ese video ya se envió';end if;
  if exists(select 1 from workspace_private.video_purges where asset_id=a.id) then raise exception 'Esa copia ya no está disponible; sube el video otra vez';end if;
  if a.size_bytes>p.video_max_bytes or greatest(a.width,a.height)>p.video_max_long_side or least(a.width,a.height)>p.video_max_short_side
   or (a.metadata->>'duration_ms')::integer>p.video_max_seconds*1000 then raise exception 'El video supera los límites de revisión';end if;
  body:=trim(coalesce(p_data->>'note',''));
  if length(body)>4000 then raise exception 'La nota supera 4,000 caracteres';end if;
  num:=t.current_version+1;
  insert into public.workspace_versions(deliverable_id,version_number,kind,credits,change_summary,author_id)
  values(t.id,num,'video',left(coalesce(nullif(trim(p_data->>'credits'),''),(select coalesce(nullif(nombre_publico,''),nombre,'') from public.usuarios where id=auth.uid()),''),500),
   left(coalesce(nullif(trim(p_data->>'change_summary'),''),'Nueva versión de video'),500),auth.uid()) returning * into v;
  insert into workspace_private.video_versions(version_id,deliverable_id,asset_id,duration_ms,width,height,note)
  values(v.id,t.id,a.id,(a.metadata->>'duration_ms')::integer,a.width,a.height,body) returning * into vv;
  update public.workspace_deliverables set current_version=num,state='review',area_approved_by=null,qa_approved_by=null,final_approved_by=null,final_approved_at=null,revision=revision+1,updated_at=now() where id=t.id;
  perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'version.submit',v.id,jsonb_build_object('kind','video','asset_id',a.id));
  return to_jsonb(v)||jsonb_build_object('video',to_jsonb(vv));
 elsif p_action in('note.add','note.reply','note.resolve','note.verify') then
  if t.state not in('review','in_qa','changes_requested','in_progress') then raise exception 'El video está en solo lectura';end if;
  if p_action='note.add' then
   select * into vv from workspace_private.video_versions where version_id=(p_data->>'version_id')::uuid;
  else
   select * into n from workspace_private.video_notes where id=(p_data->>'note_id')::uuid;
   select * into vv from workspace_private.video_versions where version_id=n.version_id;
  end if;
  if vv.version_id is null or vv.deliverable_id<>t.id then raise exception 'Nota o versión de otra asignación' using errcode='42501';end if;
  if p_action in('note.add','note.verify') and not workspace_private.image_reviewer(t) then raise exception 'Solo quienes revisan pueden publicar o verificar notas' using errcode='42501';end if;
  if p_action='note.reply' and not (workspace_private.image_reviewer(t) or t.responsible_id=auth.uid() or auth.uid()=any(t.collaborator_ids)) then raise exception 'No puedes responder en esta entrega' using errcode='42501';end if;
  if p_action='note.resolve' and not (workspace_private.image_reviewer(t) or n.author_id=auth.uid()) then raise exception 'Solo quien publicó la nota o quien revisa puede resolverla' using errcode='42501';end if;
  perform workspace_private.require('content.comment',t.unit_id,t.project_id,t.area_id,t.id);
  if p_action in('note.add','note.reply') then
   body:=trim(coalesce(p_data->>'body',''));
   if length(body) not between 1 and 4000 then raise exception 'Escribe el comentario (hasta 4,000 caracteres)';end if;
  end if;
  if p_action='note.add' then
   if coalesce(jsonb_typeof(p_data->'time_ms'),'')<>'number' or (p_data->>'time_ms')::numeric<>trunc((p_data->>'time_ms')::numeric) or (p_data->>'time_ms')::numeric not between 0 and vv.duration_ms then raise exception 'El momento del comentario está fuera del video';end if;
   if not workspace_private.video_drawing_valid(nullif(p_data->'drawing','null'::jsonb)) then raise exception 'Dibujo inválido';end if;
   insert into workspace_private.video_notes(version_id,author_id,time_ms,drawing,body) values(vv.version_id,auth.uid(),(p_data->>'time_ms')::integer,nullif(p_data->'drawing','null'::jsonb),body) returning to_jsonb(video_notes.*) into result;
   perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'comment.add',(result->>'id')::uuid,jsonb_build_object('kind','video_note','version_id',vv.version_id));
  elsif p_action='note.reply' then
   insert into workspace_private.video_note_replies(note_id,author_id,body) values(n.id,auth.uid(),body) returning to_jsonb(video_note_replies.*) into result;
   perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'comment.add',(result->>'id')::uuid,jsonb_build_object('kind','video_reply','note_id',n.id));
  else
   target:=coalesce((p_data->>'verified_version_id')::uuid,n.version_id);
   if p_action='note.resolve' and target<>n.version_id then raise exception 'La verificación entre versiones requiere revisión';end if;
   if not exists(select 1 from workspace_private.video_versions x join public.workspace_versions nv on nv.id=x.version_id join public.workspace_versions ov on ov.id=n.version_id
    where x.version_id=target and x.deliverable_id=t.id and nv.version_number>=ov.version_number) then raise exception 'No se verifica en una versión anterior ni de otra asignación';end if;
   insert into workspace_private.video_note_resolutions(note_id,verified_version_id,resolved,actor_id) values(n.id,target,coalesce((p_data->>'resolved')::boolean,true),auth.uid()) returning to_jsonb(video_note_resolutions.*) into result;
   perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'video.'||p_action,n.id,jsonb_build_object('resolved',result->'resolved'));
  end if;
  return result;
 end if;
 raise exception 'Comando de video desconocido';
end;$$;
revoke all on function public.workspace_video_command(text,uuid,jsonb,integer) from public,anon;
grant execute on function public.workspace_video_command(text,uuid,jsonb,integer) to authenticated;

-- El comando general no envía versiones de video (clientes viejos o conectores).
alter function public.workspace_command(text,jsonb,integer) set schema workspace_private;
alter function workspace_private.workspace_command(text,jsonb,integer) rename to command_before_video_reviews;
revoke all on function workspace_private.command_before_video_reviews(text,jsonb,integer) from public,anon,authenticated;
create function public.workspace_command(p_action text,p_data jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if p_action='version.submit' and exists(select 1 from public.workspace_deliverables where id=(p_data->>'deliverable_id')::uuid and kind='video') then
  raise exception 'Los videos se envían desde su entrega de video';
 end if;
 return workspace_private.command_before_video_reviews(p_action,p_data,p_revision);
end;$$;
revoke all on function public.workspace_command(text,jsonb,integer) from public,anon;
grant execute on function public.workspace_command(text,jsonb,integer) to authenticated;

-- 6. Pasarela: abrir y validar copias de video. Todo lo demás (partes, bloqueos, limpieza) es el flujo existente.
alter function public.workspace_image_storage(text,jsonb,text) set schema workspace_private;
alter function workspace_private.workspace_image_storage(text,jsonb,text) rename to image_storage_before_video;
revoke all on function workspace_private.image_storage_before_video(text,jsonb,text) from public,anon,authenticated;
create function public.workspace_image_storage(p_action text,p_data jsonb,p_gateway_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p workspace_private.upload_policy;t public.workspace_deliverables;s workspace_private.image_upload_sessions;a workspace_private.image_assets;file_name text;r jsonb;w integer;h integer;d integer;
begin
 perform workspace_private.original_gateway(p_gateway_key);
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>32768 then raise exception 'Datos inválidos';end if;
 if p_action='open' and p_data->>'role'='video' then
  perform workspace_private.original_tick('request');
  perform 1 from workspace_private.upload_policy where singleton for share;
  select * into p from workspace_private.upload_policy where singleton;
  select * into t from public.workspace_deliverables where id=(p_data->>'deliverable_id')::uuid for update;
  if t.id is null or t.kind<>'video' or t.state not in('pending','assigned','in_progress','changes_requested') then raise exception 'Asignación de video no disponible' using errcode='42501';end if;
  perform workspace_private.require('content.edit_assigned',t.unit_id,t.project_id,t.area_id,t.id);
  if not workspace_private.video_uploads_enabled(t.project_id) then raise exception 'Las entregas de video no están habilitadas en esta producción' using errcode='42501';end if;
  select * into s from workspace_private.image_upload_sessions where request_id=(p_data->>'request_id')::uuid;
  if s.id is not null then
   select * into a from workspace_private.image_assets where id=s.asset_id;
   if s.owner_id<>auth.uid() or a.deliverable_id<>t.id or a.sha256 is distinct from p_data->>'sha256' or a.size_bytes is distinct from (p_data->>'size_bytes')::bigint or a.role<>'video' then raise exception 'La solicitud ya pertenece a otro archivo' using errcode='42501';end if;
   return workspace_private.image_session_descriptor(s.id);
  end if;
  if p_data->>'request_id' is null then raise exception 'Falta el identificador de reanudación';end if;
  file_name:=regexp_replace(trim(coalesce(p_data->>'file_name','')),'[[:cntrl:]/\\]','_','g');
  if p_data->>'format' is distinct from 'mp4' or length(file_name) not between 1 and 240 or lower(file_name) !~ '\.(mp4|m4v)$' then raise exception 'Sube un video MP4 (.mp4)';end if;
  if (p_data->>'size_bytes')::bigint>p.video_max_bytes then raise exception 'El video pesa más de % MB; expórtalo a 720p',p.video_max_bytes/1048576;end if;
  a.id:=gen_random_uuid();
  insert into workspace_private.image_assets(id,deliverable_id,owner_id,role,object_key,file_name,size_bytes,sha256,mime_type,format)
  values(a.id,t.id,auth.uid(),'video','videos/'||t.project_id||'/'||t.id||'/'||a.id,file_name,(p_data->>'size_bytes')::bigint,p_data->>'sha256','video/mp4','mp4') returning * into a;
  insert into workspace_private.image_upload_sessions(asset_id,owner_id,request_id,reserved_bytes,expires_at,part_bytes)
  values(a.id,auth.uid(),(p_data->>'request_id')::uuid,a.size_bytes,now()+make_interval(hours=>p.session_hours),p.part_bytes) returning * into s;
  perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'video.upload.reserved',a.id,jsonb_build_object('bytes',a.size_bytes,'session_id',s.id));
  return workspace_private.image_session_descriptor(s.id);
 end if;
 if p_action in('lock','verified') then
  select x.* into a from workspace_private.image_upload_sessions s2 join workspace_private.image_assets x on x.id=s2.asset_id where s2.id=(p_data->>'session_id')::uuid;
  if a.role='video' then
   select * into p from workspace_private.upload_policy where singleton;
   select * into t from public.workspace_deliverables where id=a.deliverable_id;
   if p_action='lock' and p_data->>'operation' in('begin','part','complete') and not workspace_private.video_uploads_enabled(t.project_id) then raise exception 'Las entregas de video no están habilitadas en esta producción' using errcode='42501';end if;
   if p_action='verified' then
    if p_data->>'verification' is distinct from 'mp4' then raise exception 'Validación de formato incorrecta';end if;
    w:=(p_data->>'width')::integer;h:=(p_data->>'height')::integer;d:=(p_data->>'duration_ms')::integer;
    if w is null or h is null or w<1 or h<1 then raise exception 'Video inválido: sin tamaño de imagen';end if;
    if greatest(w,h)>p.video_max_long_side or least(w,h)>p.video_max_short_side then raise exception 'Video de % × %: la copia de revisión debe ser de 720p como máximo',w,h;end if;
    if d is null or d<1 then raise exception 'Video inválido: sin duración';end if;
    if d>p.video_max_seconds*1000 then raise exception 'El video dura más de % minutos',p.video_max_seconds/60;end if;
    if p_data->>'video_codec' not in('avc1','avc3') then raise exception 'Video en formato %: expórtalo en H.264',coalesce(p_data->>'video_codec','desconocido');end if;
    r:=workspace_private.image_storage_before_video(p_action,p_data,p_gateway_key);
    update workspace_private.image_assets set metadata=jsonb_build_object('duration_ms',d,'video_codec',p_data->>'video_codec','audio_codec',left(p_data->>'audio_codec',8),
     'faststart',coalesce((p_data->>'faststart')::boolean,false),'sha256_source','client_with_server_parts') where id=a.id;
    return r;
   end if;
  end if;
 end if;
 return workspace_private.image_storage_before_video(p_action,p_data,p_gateway_key);
end;$$;
revoke all on function public.workspace_image_storage(text,jsonb,text) from public,anon;
grant execute on function public.workspace_image_storage(text,jsonb,text) to authenticated;

-- 7. Reproducir: enlace firmado de tipo «stream», revalidado en cada solicitud del reproductor.
alter function public.workspace_image_file(jsonb,text) set schema workspace_private;
alter function workspace_private.workspace_image_file(jsonb,text) rename to image_file_before_video;
revoke all on function workspace_private.image_file_before_video(jsonb,text) from public,anon,authenticated;
create function public.workspace_image_file(p_data jsonb,p_gateway_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a workspace_private.image_assets;t public.workspace_deliverables;u uuid;sid uuid;ttl integer;submitted boolean;
begin
 perform workspace_private.image_gateway_authorized(p_gateway_key);
 select * into a from workspace_private.image_assets where id=(p_data->>'asset_id')::uuid;
 if a.role is distinct from 'video' then
  if p_data->>'operation'='stream' then raise exception 'Archivo fuera de tu acceso' using errcode='42501';end if;
  return workspace_private.image_file_before_video(p_data,p_gateway_key);
 end if;
 if p_data->>'redeem'='true' then u:=(p_data->>'user_id')::uuid;sid:=(p_data->>'session_id')::uuid;
 else
  if not workspace_private.session_active() then raise exception 'Sesión activa requerida' using errcode='42501';end if;
  u:=auth.uid();sid:=(auth.jwt()->>'session_id')::uuid;
 end if;
 if not exists(select 1 from auth.sessions where id=sid and user_id=u) then raise exception 'Sesión revocada' using errcode='42501';end if;
 if p_data->>'operation' is distinct from 'stream' or a.status<>'validated' then raise exception 'Archivo fuera de tu acceso' using errcode='42501';end if;
 if p_data->>'file_id' is not null and (p_data->>'file_id')::uuid<>a.id then raise exception 'Archivo firmado incorrecto';end if;
 select * into t from public.workspace_deliverables where id=a.deliverable_id;
 submitted:=exists(select 1 from workspace_private.video_versions where asset_id=a.id);
 if not workspace_private.image_member_for(t.unit_id,u) or not exists(select 1 from public.workspace_projects where id=t.project_id and deleted_at is null)
  or (not submitted and a.owner_id<>u)
  or not workspace_private.image_allowed_for(u,'content.read',t.unit_id,t.project_id,t.area_id,t.id) then raise exception 'Archivo fuera de tu acceso' using errcode='42501';end if;
 if exists(select 1 from workspace_private.video_purges where asset_id=a.id and (deleted_at is not null or lease_id is not null)) then
  return jsonb_build_object('available',false,'message','La copia de revisión se borró después de publicar el video. Los comentarios se conservan.');
 end if;
 perform workspace_private.original_tick(case when p_data->>'redeem'='true' then 'read' else 'request' end);
 select video_link_seconds into ttl from workspace_private.upload_policy where singleton;
 return jsonb_build_object('available',true,'asset_id',a.id,'file_id',a.id,'operation','stream','object_key',a.object_key,'file_name',a.file_name,'mime_type','video/mp4',
  'size_bytes',a.size_bytes,'sha256',a.sha256,'user_id',u,'session_id',sid,'ttl',ttl);
end;$$;
revoke all on function public.workspace_image_file(jsonb,text) from public;
grant execute on function public.workspace_image_file(jsonb,text) to authenticated,anon;

-- 8. Borrado de copias viejas: la pasarela borra el objeto y confirma; sólo entonces se libera la cuota.
alter function public.workspace_image_maintenance(text,jsonb,text) set schema workspace_private;
alter function workspace_private.workspace_image_maintenance(text,jsonb,text) rename to image_maintenance_before_video;
revoke all on function workspace_private.image_maintenance_before_video(text,jsonb,text) from public,anon,authenticated;
create function public.workspace_image_maintenance(p_action text,p_data jsonb,p_gateway_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare g workspace_private.video_purges;a workspace_private.image_assets;p workspace_private.upload_policy;begin
 perform workspace_private.image_gateway_authorized(p_gateway_key);
 if p_action='video.purge.claim' then
  select * into p from workspace_private.upload_policy where singleton;
  select * into g from workspace_private.video_purges where deleted_at is null and due_at<=now() and (lease_until is null or lease_until<=now())
   order by due_at limit 1 for update skip locked;
  if g.asset_id is null then return null;end if;
  update workspace_private.video_purges set lease_id=gen_random_uuid(),lease_until=now()+make_interval(secs=>p.lease_seconds) where asset_id=g.asset_id returning * into g;
  select * into a from workspace_private.image_assets where id=g.asset_id;
  return jsonb_build_object('asset_id',a.id,'object_key',a.object_key,'lease_id',g.lease_id);
 elsif p_action='video.purge.confirm' then
  select * into g from workspace_private.video_purges where asset_id=(p_data->>'asset_id')::uuid for update;
  if g.deleted_at is not null then return jsonb_build_object('deleted',true);end if;
  if g.asset_id is null or g.lease_id is null or g.lease_id is distinct from (p_data->>'lease_id')::uuid or g.lease_until<=now() or p_data->>'deleted' is distinct from 'true' then raise exception 'Borrado sin confirmar';end if;
  select * into a from workspace_private.image_assets where id=g.asset_id;
  update workspace_private.video_purges set deleted_at=now(),lease_id=null,lease_until=null where asset_id=g.asset_id;
  update workspace_private.original_limits set allocated_bytes=greatest(0,allocated_bytes-a.size_bytes) where singleton;
  insert into workspace_private.image_storage_audit(asset_id,deliverable_id,actor_id,action,details)
  values(a.id,a.deliverable_id,null,'video.copy.purged',jsonb_build_object('confirmed_r2_deletion',true,'bytes',a.size_bytes,'due_at',g.due_at));
  return jsonb_build_object('deleted',true);
 end if;
 return workspace_private.image_maintenance_before_video(p_action,p_data,p_gateway_key);
end;$$;
revoke all on function public.workspace_image_maintenance(text,jsonb,text) from public;
grant execute on function public.workspace_image_maintenance(text,jsonb,text) to anon,authenticated;

-- 9. Lo que ve la interfaz de una producción de video.
create function public.workspace_video_bundle(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$declare p workspace_private.upload_policy;result jsonb;begin
 if not workspace_private.session_active() or not workspace_private.can_read_project(p_project_id) then raise exception 'Producción fuera de tu acceso' using errcode='42501';end if;
 select * into p from workspace_private.upload_policy where singleton;
 with tasks as(select t.* from public.workspace_deliverables t where t.project_id=p_project_id and t.kind='video' and workspace_private.can_read_content(t.id)),
 versions as(select v.*,w.version_number,w.author_id,w.change_summary,w.credits from workspace_private.video_versions v join public.workspace_versions w on w.id=v.version_id where v.deliverable_id in(select id from tasks)),
 assets as(select x.* from workspace_private.image_assets x where x.role='video' and x.deliverable_id in(select id from tasks)
  and (x.id in(select asset_id from versions) or (x.owner_id=auth.uid() and x.status='validated')))
 select jsonb_build_object(
  'enabled',p.video_enabled or exists(select 1 from tasks),
  'uploads_enabled',workspace_private.video_uploads_enabled(p_project_id),
  'policy',jsonb_build_object('max_bytes',p.video_max_bytes,'max_seconds',p.video_max_seconds,'max_long_side',p.video_max_long_side,'max_short_side',p.video_max_short_side,'part_bytes',p.part_bytes,'purge_hours',p.video_purge_hours),
  'assets',coalesce((select jsonb_object_agg(x.id,jsonb_build_object('id',x.id,'deliverable_id',x.deliverable_id,'file_name',x.file_name,'size_bytes',x.size_bytes,'sha256',x.sha256,
    'width',x.width,'height',x.height,'duration_ms',(x.metadata->>'duration_ms')::integer,'audio_codec',x.metadata->>'audio_codec','owner_id',x.owner_id,'created_at',x.created_at,
    'purge_due_at',g.due_at,'purged',g.deleted_at is not null or g.lease_id is not null)) from assets x left join workspace_private.video_purges g on g.asset_id=x.id),'{}'),
  'versions',coalesce((select jsonb_object_agg(v.version_id,jsonb_build_object('version_id',v.version_id,'deliverable_id',v.deliverable_id,'version_number',v.version_number,'asset_id',v.asset_id,
    'duration_ms',v.duration_ms,'width',v.width,'height',v.height,'note',v.note,'author_id',v.author_id,'change_summary',v.change_summary,'credits',v.credits,'created_at',v.created_at)) from versions v),'{}'),
  'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.time_ms,n.created_at,n.id) from workspace_private.video_notes n where n.version_id in(select version_id from versions)),'[]'),
  'replies',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from workspace_private.video_note_replies r join workspace_private.video_notes n on n.id=r.note_id where n.version_id in(select version_id from versions)),'[]'),
  'resolutions',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from workspace_private.video_note_resolutions r join workspace_private.video_notes n on n.id=r.note_id where n.version_id in(select version_id from versions)),'[]'),
  'publications',coalesce((select jsonb_agg(to_jsonb(x)-'removed_at'-'removed_by' order by x.published_at desc,x.id) from workspace_private.video_publications x where x.project_id=p_project_id and x.removed_at is null),'[]'),
  'has_approved_video',exists(select 1 from public.workspace_deliverables d where d.project_id=p_project_id and d.kind='video' and d.current_version>0 and d.state in('area_approved','in_qa','qa_approved','published')),
  'publish_task_id',(select d.id from public.workspace_deliverables d join public.workspace_areas a on a.id=d.area_id join public.workspace_projects pr on pr.id=d.project_id
    where d.project_id=p_project_id and pr.kind='video' and workspace_private.can_read_task(d.id) and workspace_private.video_can_publish(d)
    order by (a.specialty='social' and (d.responsible_id=auth.uid() or auth.uid()=any(d.collaborator_ids))) desc,a.specialty='social' desc,d.created_at limit 1),
  'reviewer',coalesce((select jsonb_object_agg(d.id,workspace_private.image_reviewer(d)) from public.workspace_deliverables d where d.id in(select id from tasks)),'{}')) into result;
 return result;
end;$$;
revoke all on function public.workspace_video_bundle(uuid) from public,anon;
grant execute on function public.workspace_video_bundle(uuid) to authenticated;
notify pgrst,'reload schema';
