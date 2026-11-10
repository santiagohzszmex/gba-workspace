-- Workspace 1.7.5.1 · Corrección del puente con Ultramar.
-- La API ejecuta las funciones STABLE (catálogo, instantánea, original) en una transacción de sólo lectura, donde
-- require_open_project falla por su SELECT ... FOR SHARE; el puente lo traducía como «La edición está cerrada» (UM008).
-- Lecturas: comprobación sin candado. Reserva y confirmación (p_for_update): se conserva el candado y sólo una edición
-- realmente cerrada se traduce a UM008; cualquier otro error ya no se disfraza.
create or replace function workspace_private.ultramar_task(p_deliverable_id uuid,p_for_update boolean default false) returns public.workspace_deliverables
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare t public.workspace_deliverables;
begin
 if p_for_update then select * into t from public.workspace_deliverables where id=p_deliverable_id for update;
 else select * into t from public.workspace_deliverables where id=p_deliverable_id;end if;
 if t.id is null or not exists(select 1 from public.workspace_areas a where a.id=t.area_id and a.specialty='integration') then raise exception 'Asignación fuera de tu acceso' using errcode='UM005';end if;
 if not (t.responsible_id=auth.uid() or auth.uid()=any(t.collaborator_ids)) then raise exception 'Asignación fuera de tu acceso' using errcode='UM005';end if;
 begin perform workspace_private.require('content.edit_assigned',t.unit_id,t.project_id,t.area_id,t.id);
 exception when others then raise exception 'Asignación fuera de tu acceso' using errcode='UM005';end;
 if p_for_update then
  begin perform workspace_private.require_open_project(t.project_id);
  exception when sqlstate '55000' then raise exception 'La edición está cerrada' using errcode='UM008';end;
 elsif not exists(select 1 from public.workspace_projects p where p.id=t.project_id and p.deleted_at is null and p.status not in('closed','archived')) then
  raise exception 'La edición está cerrada' using errcode='UM008';
 end if;
 return t;
end;$$;
revoke all on function workspace_private.ultramar_task(uuid,boolean) from public,anon,authenticated;
