drop policy cash_movement_staff_read on public.cash_session_movements;
create policy cash_movement_staff_read on public.cash_session_movements for select to authenticated using(
 exists(select 1 from public.cash_sessions s where s.id=cash_session_movements.session_id and s.organization_id=cash_session_movements.organization_id
   and app_private.has_org_role(s.organization_id,s.branch_id,array['owner','admin','manager','advisor']))
);

create or replace function public.create_stock_transfer_request(
 p_from_branch uuid,p_to_branch uuid,p_variant uuid,p_quantity numeric,p_note text default '',
 p_from_location text default 'MAIN',p_to_location text default 'MAIN'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_code text; v_transfer uuid;
begin
 if auth.uid() is null or p_from_branch=p_to_branch or p_quantity is null or p_quantity<=0 then raise exception 'Revisa sucursales y cantidad solicitada.'; end if;
 select organization_id into v_org from public.organizations where slug='visual-corp';
 if not exists(select 1 from public.branches where id=p_from_branch and organization_id=v_org and active)
    or not exists(select 1 from public.branches where id=p_to_branch and organization_id=v_org and active)
    or not exists(select 1 from public.inventory_variants where id=p_variant and organization_id=v_org and active) then raise exception 'Sucursal o variante no válida.'; end if;
 if not app_private.has_org_role(v_org,p_from_branch,array['owner','admin','manager','warehouse','advisor']) then raise exception 'No puedes solicitar traslados desde esa sucursal.'; end if;
 v_code:='TR-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.stock_transfers(organization_id,transfer_code,from_branch_id,to_branch_id,status,note,requested_by)
 values(v_org,v_code,p_from_branch,p_to_branch,'requested',left(coalesce(p_note,''),1000),auth.uid()) returning id into v_transfer;
 insert into public.stock_transfer_lines(organization_id,transfer_id,variant_id,requested_quantity,from_location_code,to_location_code)
 values(v_org,v_transfer,p_variant,p_quantity,coalesce(nullif(trim(p_from_location),''),'MAIN'),coalesce(nullif(trim(p_to_location),''),'MAIN'));
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by)
 values(v_org,v_transfer,'requested',jsonb_build_object('variant_id',p_variant,'quantity',p_quantity),auth.uid());
 return jsonb_build_object('transfer_id',v_transfer,'transfer_code',v_code,'status','requested');
end $$;
revoke all on function public.create_stock_transfer_request(uuid,uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.create_stock_transfer_request(uuid,uuid,uuid,numeric,text,text,text) to authenticated;

create or replace function app_private.match_customer_for_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare v_phone text;
begin
 if new.customer_id is null and nullif(trim(new.customer_phone),'') is not null then
  v_phone:=regexp_replace(new.customer_phone,'[^0-9]','','g');
  if v_phone<>'' then
   select c.id into new.customer_id from public.customers c where c.organization_id=new.organization_id
    and regexp_replace(c.phone,'[^0-9]','','g')=v_phone order by c.created_at limit 1;
  end if;
 end if;
 return new;
end $$;
create trigger central_quotes_match_customer before insert on public.central_quotes for each row execute function app_private.match_customer_for_quote();
