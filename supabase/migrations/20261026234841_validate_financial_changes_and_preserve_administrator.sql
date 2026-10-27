-- Validación adicional sin modificar registros existentes.
create function ar_private.guard_last_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.role='admin' and (tg_op='DELETE' or new.role<>'admin') and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'Debe conservarse al menos un administrador';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_last_admin before update or delete on public.profiles for each row execute function ar_private.guard_last_admin();
create trigger audit_profiles after update or delete on public.profiles for each row execute function ar_private.audit_row();
create function ar_private.validate_financial_payload(p jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform ar_private.validate_payload(p);
 if exists(select 1 from jsonb_array_elements(p->'creditSettings') s where coalesce((s->>'credit_days')::int,-1) not between 0 and 365) or exists(select 1 from jsonb_array_elements(p->'creditSettings') s group by s->>'customer_id' having count(*)>1) then raise exception 'Revisa los plazos o clientes repetidos en crédito';end if;
 if exists(select 1 from jsonb_array_elements(p->'receipts') r where r->>'payment_date' is null or (r->>'payment_date')::date>(now() at time zone 'America/Ciudad_Juarez')::date) then raise exception 'Fecha de ingreso inválida';end if;
 if exists(select 1 from jsonb_array_elements(p->'plans') t where not exists(select 1 from public.customers c where c.id::text=t->>'customer_id') or coalesce(t->>'currency','') not in ('USD','MXN')) then raise exception 'Acuerdo sin cliente o moneda válidos';end if;
 if exists(select 1 from jsonb_array_elements(p->'promises') q where q->>'scheduled_date' is null or (q->>'scheduled_date')::date is null) then raise exception 'Promesa sin fecha';end if;
 if exists(select 1 from jsonb_array_elements(p->'creditNotes') n where coalesce((n->>'amount')::numeric,0)<=0 or jsonb_typeof(n->'allocations') is distinct from 'array' or not exists(select 1 from public.customers c where c.id::text=n->>'customer_id')) then raise exception 'Nota de crédito inválida';end if;
 if exists(select 1 from jsonb_array_elements(p->'creditNotes') n cross join lateral jsonb_array_elements(n->'allocations') a left join public.invoices i on i.id::text=a->>'invoice_id' where i.id is null or coalesce((a->>'amount')::numeric,0)<=0 or i.customer_id::text is distinct from n->>'customer_id' or i.currency is distinct from n->>'currency') then raise exception 'Aplicación de nota de crédito inválida';end if;
 if exists(select 1 from jsonb_array_elements(p->'creditNotes') n where (select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(n->'allocations') a)>(n->>'amount')::numeric+0.005) then raise exception 'La aplicación supera la nota de crédito';end if;
 if exists(select 1 from public.invoices i where
 (select coalesce(sum(x.amount),0) from public.payments x where x.invoice_id=i.id)
 +(select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(p->'localPayments') a where a->>'invoice_id'=i.id::text and not exists(select 1 from public.payments x where x.id::text=a->>'id'))
 +(select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(p->'creditNotes') n cross join lateral jsonb_array_elements(n->'allocations') a where n->>'cancelled_at' is null and a->>'invoice_id'=i.id::text)>i.total+0.005) then raise exception 'Pagos y notas exceden el total de una factura';end if;
end $$;
-- Las tres operaciones financieras comparten la misma validación estricta.
do $$declare f record;begin
 for f in select p.oid,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ar_write_reminder_workspace','ar_apply_customer_credit') loop
  execute replace(f.def,'ar_private.validate_payload(','ar_private.validate_financial_payload(');
 end loop;
end $$;
