-- A sale that creates an urgent backorder also creates a purchase obligation.
-- Enforce the existing purchase-edit permission in PostgreSQL, including when
-- the POS RPC is called directly or from a second client.
create or replace function app_private.guard_sales_urgent_backorder_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.urgent_backorder,false)
     and (select auth.uid()) is not null
     and not coalesce(app_private.has_visualcorp_access(new.organization_id,'purchases','edit',new.branch_id),false) then
    raise exception 'Se requiere permiso de edición de compras para confirmar órdenes con faltantes.' using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function app_private.guard_sales_urgent_backorder_permission() from public, anon, authenticated;

drop trigger if exists sales_urgent_backorder_permission_guard on public.sales;
create trigger sales_urgent_backorder_permission_guard
before insert or update of urgent_backorder on public.sales
for each row execute function app_private.guard_sales_urgent_backorder_permission();

comment on function app_private.guard_sales_urgent_backorder_permission() is
  'Requires purchases.edit at the selected branch before a confirmed sale may be marked with an urgent inventory backorder.';
