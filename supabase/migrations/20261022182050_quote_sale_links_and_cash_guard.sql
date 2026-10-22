alter table public.sales add column central_quote_id uuid;
alter table public.sales add constraint sales_central_quote_fk foreign key(central_quote_id,organization_id) references public.central_quotes(id,organization_id);
create index sales_central_quote_idx on public.sales(organization_id,central_quote_id) where central_quote_id is not null;

create or replace function app_private.attach_open_cash_session() returns trigger language plpgsql security definer set search_path='' as $$
declare v_branch uuid;
begin
  if new.method<>'cash' then return new; end if;
  select branch_id into v_branch from public.sales where id=new.sale_id and organization_id=new.organization_id;
  select id into new.cash_session_id from public.cash_sessions where organization_id=new.organization_id and branch_id=v_branch and opened_by=new.created_by and status='open' order by opened_at desc limit 1;
  if new.cash_session_id is null then raise exception 'Abre un turno de caja para registrar un pago en efectivo.'; end if;
  return new;
end $$;

create or replace function public.link_pos_sale_to_central_quote(p_sale uuid,p_quote uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_s public.sales%rowtype; v_q public.central_quotes%rowtype;
begin
 select * into v_s from public.sales where id=p_sale for update;
 select * into v_q from public.central_quotes where id=p_quote for update;
 if not found or v_s.id is null or v_q.organization_id<>v_s.organization_id or v_s.status<>'confirmed' then raise exception 'Venta o cotización no válida.'; end if;
 if not app_private.has_org_role(v_s.organization_id,v_s.branch_id,array['owner','admin','manager','advisor']) or (v_s.created_by<>auth.uid() and not app_private.has_org_role(v_s.organization_id,v_s.branch_id,array['owner','admin','manager'])) then raise exception 'No tienes permiso para vincular esta venta.'; end if;
 if v_q.status<>'accepted' or not v_q.price_confirmed or v_q.selected_total is null or v_s.total<>v_q.selected_total then raise exception 'La cotización debe estar aceptada, con precio confirmado y el total debe coincidir.'; end if;
 if v_s.central_quote_id is not null and v_s.central_quote_id<>p_quote then raise exception 'La venta ya está vinculada a otra cotización.'; end if;
 update public.sales set central_quote_id=p_quote where id=p_sale;
 insert into public.central_quote_events(organization_id,quote_id,from_status,to_status,note,created_by) values(v_q.organization_id,v_q.id,v_q.status,'converted','Venta '||coalesce(v_s.sale_code,v_s.id::text),auth.uid());
 update public.central_quotes set status='converted',updated_at=now() where id=p_quote;
end $$;
revoke all on function public.link_pos_sale_to_central_quote(uuid,uuid) from public,anon;
grant execute on function public.link_pos_sale_to_central_quote(uuid,uuid) to authenticated;
