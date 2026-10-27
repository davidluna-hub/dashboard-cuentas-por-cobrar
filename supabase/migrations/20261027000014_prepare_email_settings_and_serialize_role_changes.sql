-- Protección de permisos y preparación del proveedor; no guarda claves ni habilita envíos.
create or replace function ar_private.guard_last_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('amao-administrator-roles',0));
 if old.role='admin' and (tg_op='DELETE' or new.role<>'admin') and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'Debe conservarse al menos un administrador';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function public.ar_set_email_provider(sender text,email_api_key text,reply_address text,verified_domain boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if coalesce(public.current_app_role()::text,'')<>'admin' then raise exception 'Sólo administración puede configurar correo' using errcode='42501';end if;
 if sender !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or length(sender)>200 then raise exception 'Revisa el remitente';end if;
 if reply_address<>'' and reply_address !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then raise exception 'Revisa el correo de respuesta';end if;
 select id into secret_id from vault.secrets where name='amao_resend_api_key' limit 1;
 if email_api_key<>'' then
  if email_api_key !~ '^re_[A-Za-z0-9_-]{10,}$' then raise exception 'La clave no tiene el formato de Resend';end if;
  if secret_id is null then perform vault.create_secret(email_api_key,'amao_resend_api_key','Clave de correo de AMAO');else perform vault.update_secret(secret_id,email_api_key);end if;
 elsif secret_id is null then raise exception 'Captura primero una API key de Resend';end if;
 update public.ar_reminder_workspace set mail_from=sender,reply_to=reply_address,provider_verified=verified_domain,enabled=case when verified_domain then enabled else false end,updated_at=now() where id='main';
 return jsonb_build_object('saved',true);
end $$;
