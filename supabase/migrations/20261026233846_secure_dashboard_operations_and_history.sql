-- AMAO: seguridad, trazabilidad y guardado. No activa correos ni altera importes existentes.
drop policy if exists "Insertar facturas desde web" on public.invoices;
drop policy if exists "Actualizar facturas desde web" on public.invoices;
drop policy if exists "Lectura publica facturas" on public.invoices;
drop policy if exists "Insertar pagos desde web" on public.payments;
drop policy if exists "Lectura publica clientes" on public.customers;
revoke all on public.customers,public.invoices,public.payments,public.profiles,public.ar_reminder_workspace,public.ar_reminder_deliveries,public.ar_collection_activities,public.ar_portfolio_snapshots,public.clientes,public.facturas,public.pagos,public.vista_estados_cuenta,public.invoice_balances from anon;
alter view public.vista_estados_cuenta set (security_invoker=true);
revoke all on function public.handle_new_user(),public.rls_auto_enable() from public,anon,authenticated;
create schema if not exists ar_private;
revoke all on schema ar_private from public,anon,authenticated;
create table public.ar_audit_log (
 id bigint generated always as identity primary key,
 happened_at timestamptz not null default now(), actor_id uuid default auth.uid(),
 actor_role text, entity text not null, record_id text not null, action text not null,
 before_data jsonb, after_data jsonb
);
alter table public.ar_audit_log enable row level security;
create policy audit_read_staff on public.ar_audit_log for select to authenticated using ((select public.current_app_role()) in ('admin','facturacion','cobranza'));
revoke all on public.ar_audit_log from anon,authenticated;
grant select on public.ar_audit_log to authenticated;
create index ar_audit_record on public.ar_audit_log(entity,record_id,happened_at desc);
create index ar_audit_time on public.ar_audit_log(happened_at desc);
create function ar_private.audit_row() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ar_audit_log(actor_role,entity,record_id,action,before_data,after_data)
 values(public.current_app_role()::text,tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id'),tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger audit_customers after insert or update or delete on public.customers for each row execute function ar_private.audit_row();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function ar_private.audit_row();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function ar_private.audit_row();
create trigger audit_activities after insert or update or delete on public.ar_collection_activities for each row execute function ar_private.audit_row();
alter table public.payments add column updated_at timestamptz not null default now();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create table public.ar_operations (
 id text primary key check(id='main'), version bigint not null default 0,
 payload jsonb not null default '{"company":{},"creditReviews":{},"virtuals":[],"attachments":[]}'::jsonb,
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
alter table public.ar_operations enable row level security;
create policy operations_read on public.ar_operations for select to authenticated using ((select public.current_app_role()) is not null);
revoke all on public.ar_operations from anon,authenticated;
grant select on public.ar_operations to authenticated;
insert into public.ar_operations(id) values('main');
create trigger audit_operations after update on public.ar_operations for each row execute function ar_private.audit_row();
create function ar_private.audit_workspace() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; a jsonb; b jsonb; entry record;
begin
 for k in select jsonb_object_keys(new.payload||old.payload) loop
  if new.payload->k is not distinct from old.payload->k then continue;end if;
  if jsonb_typeof(new.payload->k)='array' and jsonb_typeof(old.payload->k)='array' then
   for entry in select coalesce(n.x->>'id',n.x->>'customer_id',o.x->>'id',o.x->>'customer_id') rid,o.x before_value,n.x after_value
   from jsonb_array_elements(old.payload->k) o(x) full join jsonb_array_elements(new.payload->k) n(x)
   on coalesce(o.x->>'id',o.x->>'customer_id')=coalesce(n.x->>'id',n.x->>'customer_id')
   where o.x is distinct from n.x loop
    insert into public.ar_audit_log(actor_role,entity,record_id,action,before_data,after_data)
    values(public.current_app_role()::text,k,coalesce(entry.rid,'main'),case when entry.before_value is null then 'INSERT' when entry.after_value is null then 'DELETE' else 'UPDATE' end,entry.before_value,entry.after_value);
   end loop;
  else
   insert into public.ar_audit_log(actor_role,entity,record_id,action,before_data,after_data) values(public.current_app_role()::text,k,'main','UPDATE',old.payload->k,new.payload->k);
  end if;
 end loop;
 return new;
end $$;
create trigger audit_workspace after update of payload on public.ar_reminder_workspace for each row execute function ar_private.audit_workspace();
create policy ar_workspace_staff_read on public.ar_reminder_workspace for select to authenticated using ((select public.current_app_role()) in ('facturacion','cobranza'));
create or replace function public.ar_read_reminder_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.current_app_role()::text,'') not in ('admin','facturacion','cobranza') then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 return (select to_jsonb(w)-'provider_verified' from public.ar_reminder_workspace w where id='main');
end $$;
create function ar_private.validate_payload(p jsonb) returns void language plpgsql set search_path='' as $$
declare k text;
begin
 if jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>20971520 then raise exception 'Formato de cartera inválido';end if;
 foreach k in array array['localPayments','receipts','creditSettings','plans','promises','creditNotes','archivedMovements'] loop
  if jsonb_typeof(p->k) is distinct from 'array' then raise exception 'Falta la lista obligatoria: %',k;end if;
  if k<>'creditSettings' and exists(select 1 from jsonb_array_elements(p->k) x group by x->>'id' having count(*)>1 or x->>'id' is null) then raise exception 'Identificadores inválidos o repetidos en %',k;end if;
 end loop;
 foreach k in array array['invoiceCancellations','holdPreferences','reminderSettings','reminderCustomers'] loop
  if jsonb_typeof(p->k) is distinct from 'object' then raise exception 'Falta configuración: %',k;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p->'creditSettings') s where not exists(select 1 from public.customers c where c.id::text=s->>'customer_id') or (s->>'credit_days')::int not between 0 and 365 or coalesce((s->>'limit_usd')::numeric,0)<0 or coalesce((s->>'limit_mxn')::numeric,0)<0) then raise exception 'Revisa los plazos y límites de crédito';end if;
 if exists(select 1 from jsonb_array_elements(p->'receipts') r where coalesce((r->>'amount')::numeric,0)<=0 or coalesce(r->>'currency','') not in ('MXN','USD') or not exists(select 1 from public.customers c where c.id::text=r->>'customer_id')) then raise exception 'Ingreso inválido';end if;
 if exists(select 1 from jsonb_array_elements(p->'localPayments') a left join public.invoices i on i.id::text=a->>'invoice_id' left join jsonb_array_elements(p->'receipts') r on r->>'id'=a->>'receipt_id' where i.id is null or r is null or coalesce((a->>'amount')::numeric,0)<=0 or i.customer_id::text<>r->>'customer_id' or i.currency is distinct from a->>'currency' or i.currency is distinct from r->>'currency') then raise exception 'Aplicación sin recibo, factura, cliente o moneda válidos';end if;
 if exists(select 1 from jsonb_array_elements(p->'receipts') r where (select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(p->'localPayments') a where a->>'receipt_id'=r->>'id')>(r->>'amount')::numeric+0.005) then raise exception 'Las aplicaciones exceden el ingreso';end if;
 if exists(select 1 from jsonb_array_elements(p->'promises') q where coalesce((q->>'amount')::numeric,0)<=0 or not exists(select 1 from jsonb_array_elements(p->'plans') t where t->>'id'=q->>'plan_id' and t->>'customer_id'=q->>'customer_id' and t->>'currency'=q->>'currency')) then raise exception 'Promesa sin acuerdo válido';end if;
end $$;
create or replace function public.ar_write_reminder_workspace(expected_version bigint,next_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ar_reminder_workspace; role_name text:=public.current_app_role()::text;
begin
 if coalesce(role_name,'') not in ('admin','facturacion','cobranza') then raise exception 'Sin permiso para guardar' using errcode='42501';end if;
 select * into w from public.ar_reminder_workspace where id='main' for update;
 if w.version<>expected_version then raise exception 'Otra sesión cambió la cartera. Revisa el conflicto antes de guardar.' using errcode='40001';end if;
 if role_name='facturacion' and (next_payload-array['creditSettings','invoiceCancellations']) is distinct from (w.payload-array['creditSettings','invoiceCancellations']) then raise exception 'Facturación sólo puede modificar crédito y cancelaciones' using errcode='42501';end if;
 if role_name='cobranza' and (next_payload-array['receipts','localPayments','plans','promises','creditNotes','archivedMovements']) is distinct from (w.payload-array['receipts','localPayments','plans','promises','creditNotes','archivedMovements']) then raise exception 'Cobranza sólo puede modificar movimientos y acuerdos' using errcode='42501';end if;
 perform ar_private.validate_payload(next_payload);
 update public.ar_reminder_workspace set payload=next_payload,version=version+1,updated_at=now(),updated_by=auth.uid() where id='main' returning * into w;
 return jsonb_build_object('version',w.version,'updated_at',w.updated_at);
end $$;
create function public.ar_write_operations(expected_version bigint,next_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ar_operations; r text:=public.current_app_role()::text;
begin
 if coalesce(r,'') not in ('admin','facturacion','cobranza') then raise exception 'Sin permiso' using errcode='42501';end if;
 if jsonb_typeof(next_payload) is distinct from 'object' or jsonb_typeof(next_payload->'company') is distinct from 'object' or jsonb_typeof(next_payload->'creditReviews') is distinct from 'object' or jsonb_typeof(next_payload->'virtuals') is distinct from 'array' or jsonb_typeof(next_payload->'attachments') is distinct from 'array' or pg_column_size(next_payload)>3145728 then raise exception 'Configuración inválida';end if;
 select * into w from public.ar_operations where id='main' for update;
 if w.version<>expected_version then raise exception 'La configuración cambió. Actualiza antes de continuar.' using errcode='40001';end if;
 if r<>'admin' and (next_payload-array['virtuals','attachments']) is distinct from (w.payload-array['virtuals','attachments']) then raise exception 'Sólo administración puede cambiar empresa o crédito' using errcode='42501';end if;
 update public.ar_operations set payload=next_payload,version=version+1,updated_at=now(),updated_by=auth.uid() where id='main' returning * into w;
 return to_jsonb(w);
end $$;
revoke all on function public.ar_write_operations(bigint,jsonb) from public,anon;
grant execute on function public.ar_write_operations(bigint,jsonb) to authenticated;
-- El cierre histórico funciona aunque los correos permanezcan apagados.
do $$declare j record;begin
 select * into j from cron.job where jobname='amao-portfolio-history';
 if found then perform cron.alter_job(j.jobid,command:=replace(j.command,'and enabled',''));end if;
end $$;
create function public.ar_apply_customer_credit(target_customer uuid,settings jsonb,apply_open boolean,expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ar_reminder_workspace; next_data jsonb; changed jsonb; terms jsonb;
begin
 if coalesce(public.current_app_role()::text,'') not in ('admin','facturacion') then raise exception 'Sin permiso para cambiar crédito' using errcode='42501';end if;
 select * into w from public.ar_reminder_workspace where id='main' for update;
 if w.version<>expected_version then raise exception 'La cartera cambió. Actualiza antes de modificar el crédito.' using errcode='40001';end if;
 if not exists(select 1 from public.customers where id=target_customer) or coalesce((settings->>'credit_days')::int,-1) not between 0 and 365 then raise exception 'Cliente o plazo inválido';end if;
 terms=settings||jsonb_build_object('customer_id',target_customer);
 next_data=jsonb_set(w.payload,'{creditSettings}',coalesce((select jsonb_agg(x) from jsonb_array_elements(w.payload->'creditSettings') x where x->>'customer_id'<>target_customer::text),'[]'::jsonb)||jsonb_build_array(terms));
 perform ar_private.validate_payload(next_data);
 if apply_open then
  with updated as (
   update public.invoices i set due_date=i.invoice_date+(settings->>'credit_days')::int
   where i.customer_id=target_customer and i.status='abierta' and i.due_date is distinct from i.invoice_date+(settings->>'credit_days')::int
   and i.total>(select coalesce(sum(p.amount),0) from public.payments p where p.invoice_id=i.id)
    +(select coalesce(sum((p->>'amount')::numeric),0) from jsonb_array_elements(w.payload->'localPayments') p where p->>'invoice_id'=i.id::text)
    +(select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(w.payload->'creditNotes') n cross join lateral jsonb_array_elements(n->'allocations') a where n->>'cancelled_at' is null and a->>'invoice_id'=i.id::text)
   returning i.id,i.due_date
  ) select coalesce(jsonb_agg(to_jsonb(updated)),'[]'::jsonb) into changed from updated;
 else changed='[]'::jsonb;end if;
 update public.ar_reminder_workspace set payload=next_data,version=version+1,updated_at=now(),updated_by=auth.uid() where id='main' returning * into w;
 return jsonb_build_object('version',w.version,'updated_at',w.updated_at,'invoices',changed,'terms',terms);
end $$;
create function public.ar_cancel_invoice(target_invoice uuid,replacement_invoice uuid,cancel_date date,cancel_reason text,expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ar_reminder_workspace; i public.invoices; n jsonb;
begin
 if coalesce(public.current_app_role()::text,'') not in ('admin','facturacion') then raise exception 'Sin permiso para cancelar facturas' using errcode='42501';end if;
 select * into w from public.ar_reminder_workspace where id='main' for update;
 if w.version<>expected_version then raise exception 'La cartera cambió. Actualiza antes de cancelar.' using errcode='40001';end if;
 select * into i from public.invoices where id=target_invoice for update;
 if not found or i.status<>'abierta' or cancel_date<i.invoice_date or cancel_date>(now() at time zone 'America/Ciudad_Juarez')::date or length(trim(coalesce(cancel_reason,'')))=0 then raise exception 'Revisa factura, fecha y motivo de cancelación';end if;
 if exists(select 1 from public.payments p where p.invoice_id=i.id) or exists(select 1 from jsonb_array_elements(w.payload->'localPayments') p where p->>'invoice_id'=i.id::text) or exists(select 1 from jsonb_array_elements(w.payload->'plans') p where p->>'invoice_id'=i.id::text and p->>'cancelled_at' is null) or exists(select 1 from jsonb_array_elements(w.payload->'creditNotes') c cross join lateral jsonb_array_elements(c->'allocations') a where c->>'cancelled_at' is null and a->>'invoice_id'=i.id::text) then raise exception 'Primero corrige los pagos, notas o acuerdos ligados a la factura';end if;
 if replacement_invoice is not null and not exists(select 1 from public.invoices r where r.id=replacement_invoice and r.id<>i.id and r.customer_id=i.customer_id and r.currency=i.currency and r.status='abierta') then raise exception 'Sustituta inválida';end if;
 n=jsonb_set(w.payload,array['invoiceCancellations',i.id::text],jsonb_build_object('replacement_id',replacement_invoice,'date',cancel_date,'reason',trim(cancel_reason),'at',now()));
 update public.invoices set status='cancelada' where id=i.id;
 update public.ar_reminder_workspace set payload=n,version=version+1,updated_at=now(),updated_by=auth.uid() where id='main' returning * into w;
 return jsonb_build_object('version',w.version,'detail',n->'invoiceCancellations'->i.id::text);
end $$;
revoke all on function public.ar_apply_customer_credit(uuid,jsonb,boolean,bigint),public.ar_cancel_invoice(uuid,uuid,date,text,bigint) from public,anon;
grant execute on function public.ar_apply_customer_credit(uuid,jsonb,boolean,bigint),public.ar_cancel_invoice(uuid,uuid,date,text,bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('amao-documents','amao-documents',false,10485760,array['application/pdf','image/png','image/jpeg','text/xml','application/xml','text/plain']) on conflict(id) do nothing;
create policy amao_document_read on storage.objects for select to authenticated using(bucket_id='amao-documents' and (select public.current_app_role()) is not null);
create policy amao_document_insert on storage.objects for insert to authenticated with check(bucket_id='amao-documents' and (select public.current_app_role()) in ('admin','facturacion','cobranza') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy amao_document_delete on storage.objects for delete to authenticated using(bucket_id='amao-documents' and ((select public.current_app_role())='admin' or (owner_id=(select auth.uid())::text and (select public.current_app_role()) in ('facturacion','cobranza'))));
create function ar_private.validate_invoice_dates() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' or new.invoice_date is distinct from old.invoice_date or new.due_date is distinct from old.due_date) and new.due_date<new.invoice_date then raise exception 'El vencimiento no puede ser anterior a la emisión';end if;
 return new;
end $$;
create trigger validate_invoice_dates before insert or update on public.invoices for each row execute function ar_private.validate_invoice_dates();
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
