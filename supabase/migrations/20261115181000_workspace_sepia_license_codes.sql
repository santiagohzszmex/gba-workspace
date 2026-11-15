-- Workspace 1.8.1 · Activar códigos de Sepia '01 desde Workspace (escritorio y web).
-- Workspace ya reconocía una licencia de Sepia vigente (workspace_license_status). Ahora la caja «Código de licencia»
-- también canjea códigos de Sepia, con las mismas reglas que Ultramar: servicio encendido, cuenta activa, máximo 8
-- intentos por hora por persona (compartidos con Ultramar), código vigente, no asignado a otra persona ni usado por otra.
-- Los códigos de Workspace (48 caracteres) siguen igual. No se abre ninguna ruta nueva al esquema privado de Sepia.
set lock_timeout='5s';

set role sepia_access_owner;
create function sepia_private.workspace_redeem(p_user uuid,p_code_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code sepia_private.license_codes;l sepia_private.licenses;begin
 if p_user is null or p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','license_invalid_or_used');end if;
 if not exists(select 1 from sepia_private.runtime where enabled) then return jsonb_build_object('error','service_unavailable');end if;
 if not sepia_private.account_active(p_user) then return jsonb_build_object('error','account_suspended');end if;
 if not sepia_private.limit_ok('activate:'||p_user,8,3600) then return jsonb_build_object('error','rate_limited');end if;
 select * into code from sepia_private.license_codes where code_hash=p_code_hash for update;
 if code.id is null or code.revoked_at is not null or code.redeem_before<=now() or (code.assigned_user_id is not null and code.assigned_user_id<>p_user)
  or (code.redeemed_at is not null and code.redeemed_by is distinct from p_user) then return jsonb_build_object('error','license_invalid_or_used');end if;
 if code.redeemed_by=p_user then
  select * into l from sepia_private.licenses where code_id=code.id;
  if l.id is null or l.revoked_at is not null or l.expires_at<=now() then return jsonb_build_object('error','license_invalid_or_used');end if;
 else
  insert into sepia_private.licenses(user_id,code_id,starts_at,expires_at) values(p_user,code.id,now(),now()+make_interval(secs=>code.duration_seconds)) returning * into l;
  update sepia_private.license_codes set redeemed_by=p_user,redeemed_at=now() where id=code.id;
  insert into sepia_private.audit(actor_id,action,entity_id,reason) values(p_user,'license.activated',l.id,'workspace');
 end if;
 return jsonb_build_object('product','sepia','edition',l.edition,'starts_at',l.starts_at,'expires_at',l.expires_at);
end;$$;
revoke all on function sepia_private.workspace_redeem(uuid,text) from public;
grant execute on function sepia_private.workspace_redeem(uuid,text) to postgres;
reset role;

alter function public.workspace_activate_license(text) set schema workspace_private;
alter function workspace_private.workspace_activate_license(text) rename to activate_license_before_sepia;
revoke all on function workspace_private.activate_license_before_sepia(text) from public,anon,authenticated;
create function public.workspace_activate_license(p_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare normalized text:=upper(regexp_replace(coalesce(p_code,''),'[-[:space:]]','','g'));r jsonb;begin
 -- Códigos de Workspace: 48 caracteres; códigos de Sepia: 32 en base32 (A-Z, 2-7).
 if normalized !~ '^[A-Z2-7]{32}$' then return workspace_private.activate_license_before_sepia(p_code);end if;
 if not workspace_private.session_active() then return jsonb_build_object('error','Sesión inválida');end if;
 if length(coalesce(p_code,''))>100 then return jsonb_build_object('error','Código inválido, vencido o ya utilizado');end if;
 r:=sepia_private.workspace_redeem(auth.uid(),encode(sha256(convert_to(normalized,'UTF8')),'hex'));
 if r ? 'error' then
  perform workspace_private.log(null,null,null,null,'license.activation_failed',null,jsonb_build_object('product','sepia'));
  return jsonb_build_object('error',case r->>'error' when 'rate_limited' then 'Demasiados intentos. Vuelve a intentarlo en una hora.'
   when 'account_suspended' then 'Tu cuenta está suspendida.' when 'service_unavailable' then 'Las licencias de Sepia no están disponibles en este momento.'
   else 'Código inválido, vencido o ya utilizado' end);
 end if;
 perform workspace_private.log(null,null,null,null,'license.activated',null,jsonb_build_object('product','sepia','expires_at',r->>'expires_at'));
 return r;
end;$$;
revoke all on function public.workspace_activate_license(text) from public,anon;
grant execute on function public.workspace_activate_license(text) to authenticated;
notify pgrst,'reload schema';
