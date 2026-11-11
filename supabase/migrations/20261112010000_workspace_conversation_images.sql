-- Workspace 1.8.0 Labradorita · Imágenes y capturas en la conversación de cada asignación.
-- Aditiva. Quien puede comentar en una asignación (y subir archivos) puede adjuntar una imagen a su mensaje.
-- Antes de enviarse, la imagen sólo la ve quien la subió. Al enviarse, la ve quien puede leer la asignación,
-- por la regla existente de imágenes de comentarios (comment_media). No cambia documentos ni materiales.
set lock_timeout='5s';

do $$declare c text;begin
 select conname into c from pg_constraint where conrelid='workspace_private.edition_references'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%document_image%' and pg_get_constraintdef(oid) not like '%deliverable_id%';
 if c is null then raise exception 'No se encontró la restricción de propósito de materiales';end if;
 execute format('alter table workspace_private.edition_references drop constraint %I',c);
end;$$;
alter table workspace_private.edition_references add constraint edition_references_purpose_check check(purpose in('assignment','document_image','conversation'));

-- Escritura: sólo quien la creó, mientras pueda comentar y la producción siga abierta.
alter function workspace_private.reference_writable(workspace_private.edition_references) rename to conversation_reference_writable_v1;
create function workspace_private.reference_writable(r workspace_private.edition_references) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select case when r.purpose='conversation' then coalesce((
  select r.created_by=auth.uid() and r.archived_at is null and workspace_private.session_active() and t.state<>'archived'
   and workspace_private.allowed('content.comment',t.unit_id,t.project_id,t.area_id,t.id)
  from public.workspace_deliverables t join public.workspace_projects p on p.id=t.project_id
  where t.id=r.deliverable_id and p.deleted_at is null and p.status not in('closed','archived')),false)
 else workspace_private.conversation_reference_writable_v1(r) end;
$$;
revoke all on function workspace_private.conversation_reference_writable_v1(workspace_private.edition_references),workspace_private.reference_writable(workspace_private.edition_references) from public,anon,authenticated;

alter function public.workspace_prepare_task_reference(uuid,text,text) set schema workspace_private;
alter function workspace_private.workspace_prepare_task_reference(uuid,text,text) rename to prepare_task_reference_before_conversation;
revoke all on function workspace_private.prepare_task_reference_before_conversation(uuid,text,text) from public,anon,authenticated;
create function public.workspace_prepare_task_reference(p_deliverable_id uuid,p_title text,p_purpose text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare t public.workspace_deliverables;r workspace_private.edition_references;
begin
 if p_purpose is distinct from 'conversation' then return workspace_private.prepare_task_reference_before_conversation(p_deliverable_id,p_title,p_purpose);end if;
 if not workspace_private.session_active() then raise exception 'Sesión activa requerida' using errcode='42501';end if;
 select * into t from public.workspace_deliverables where id=p_deliverable_id;
 if t.id is null then raise exception 'Encargo o tipo de material inválido';end if;
 perform workspace_private.require('content.comment',t.unit_id,t.project_id,t.area_id,t.id);
 perform workspace_private.require('asset.upload',t.unit_id,t.project_id,t.area_id,t.id);
 if t.state='archived' or not exists(select 1 from public.workspace_projects where id=t.project_id and deleted_at is null and status not in('closed','archived')) then raise exception 'La producción está cerrada';end if;
 if (select count(*) from workspace_private.edition_references where deliverable_id=t.id and purpose='conversation' and created_by=auth.uid() and archived_at is null)>=200 then raise exception 'Límite de 200 imágenes por persona en esta conversación';end if;
 insert into workspace_private.edition_references(project_id,area_id,kind,title,content_document,created_by,deliverable_id,purpose)
 values(t.project_id,t.area_id,'instructions',left(coalesce(nullif(trim(p_title),''),'Imagen de la conversación'),180),
  jsonb_build_object('type','doc','attrs',jsonb_build_object('schemaVersion',2),'content','[]'::jsonb),auth.uid(),t.id,'conversation') returning * into r;
 perform workspace_private.log(t.unit_id,t.project_id,t.area_id,t.id,'task.material_prepared',r.id,jsonb_build_object('purpose','conversation'));
 return to_jsonb(r);
end;$$;
revoke all on function public.workspace_prepare_task_reference(uuid,text,text) from public,anon;
grant execute on function public.workspace_prepare_task_reference(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
