begin;
-- Identidad sólo dentro de esta transacción de pruebas; no se leen nombres ni correos.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$declare w jsonb; answer jsonb; rejected boolean:=false;begin
 w=public.ar_read_reminder_workspace();
 if w is null then raise exception 'No se pudo leer la cartera de administrador';end if;
 begin perform public.ar_write_reminder_workspace((w->>'version')::bigint,'{}'::jsonb);exception when others then rejected=true;end;
 if not rejected then raise exception 'Se aceptó una cartera incompleta';end if;
 rejected=false;
 begin perform public.ar_write_reminder_workspace((w->>'version')::bigint-1,w->'payload');exception when serialization_failure then rejected=true;end;
 if not rejected then raise exception 'No se bloqueó una versión obsoleta';end if;
 answer=public.ar_write_reminder_workspace((w->>'version')::bigint,w->'payload');
 if (answer->>'version')::bigint<>(w->>'version')::bigint+1 then raise exception 'No confirmó la nueva versión';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='solo_consulta' limit 1),true);
set local role authenticated;
do $$declare w jsonb; rejected boolean:=false;begin
 w=public.ar_read_dashboard_workspace();if w is null then raise exception 'Consulta no ve cartera compartida';end if;
 begin perform public.ar_write_reminder_workspace((w->>'version')::bigint,w->'payload');exception when insufficient_privilege then rejected=true;end;
 if not rejected then raise exception 'Consulta pudo escribir';end if;
end $$;
reset role;
set local role anon;
do $$declare rejected boolean:=false;begin
 begin perform 1 from public.invoices limit 1;exception when insufficient_privilege then rejected=true;end;
 if not rejected then raise exception 'Anónimo pudo leer facturas';end if;
end $$;
rollback;
select jsonb_build_object('permission_and_version_tests','passed_rolled_back','enabled',enabled,'version',version,'invoices',(select count(*) from public.invoices),'payments',(select count(*) from public.payments),'audit_entries',(select count(*) from public.ar_audit_log)) verification from public.ar_reminder_workspace where id='main';
