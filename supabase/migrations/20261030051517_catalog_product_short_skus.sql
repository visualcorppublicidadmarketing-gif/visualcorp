-- Replace the internal ID-derived SKU with a short, stable code for staff and POS.
-- catalog_products.id remains unchanged so every existing foreign key stays valid.
alter table public.catalog_products
  alter column sku drop expression;

alter table public.catalog_products
  alter column sku set not null;

create table if not exists app_private.catalog_product_sku_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z]{2}$'),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (organization_id, prefix)
);

alter table app_private.catalog_product_sku_counters enable row level security;
revoke all on table app_private.catalog_product_sku_counters from public, anon, authenticated;

create or replace function app_private.catalog_product_sku_prefix(
  p_product_kind text,
  p_product_type text,
  p_subcategory_id text,
  p_subcategory text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_product_kind, '')) = 'standard_custom' then 'PS'
    when coalesce(p_subcategory_id, '') = 'sub-displays'
      or lower(btrim(coalesce(p_subcategory, ''))) = 'displays importados' then 'PI'
    when lower(coalesce(p_product_type, '')) = 'physical' then 'PF'
    when lower(coalesce(p_product_type, '')) = 'service' then 'SV'
    else 'PC'
  end;
$$;

create or replace function app_private.next_catalog_product_sku(
  p_organization_id uuid,
  p_prefix text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  v_digits text;
begin
  if p_organization_id is null or p_prefix !~ '^[A-Z]{2}$' then
    raise exception 'No se pudo generar el código del producto.' using errcode = '22023';
  end if;

  insert into app_private.catalog_product_sku_counters (organization_id, prefix, last_value)
  values (p_organization_id, p_prefix, 1)
  on conflict (organization_id, prefix)
  do update set last_value = app_private.catalog_product_sku_counters.last_value + 1
  returning last_value into v_number;

  v_digits := case when v_number < 1000 then lpad(v_number::text, 3, '0') else v_number::text end;
  return p_prefix || v_digits;
end;
$$;

create or replace function app_private.assign_catalog_product_sku_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
begin
  v_prefix := app_private.catalog_product_sku_prefix(
    new.product_kind,
    new.product_type,
    new.subcategory_id,
    new.subcategory
  );
  new.sku := app_private.next_catalog_product_sku(new.organization_id, v_prefix);
  return new;
end;
$$;

revoke all on function app_private.catalog_product_sku_prefix(text, text, text, text) from public, anon, authenticated;
revoke all on function app_private.next_catalog_product_sku(uuid, text) from public, anon, authenticated;
revoke all on function app_private.assign_catalog_product_sku_on_insert() from public, anon, authenticated;

drop trigger if exists catalog_product_sku_assign on public.catalog_products;
create trigger catalog_product_sku_assign
before insert on public.catalog_products
for each row execute function app_private.assign_catalog_product_sku_on_insert();

-- Start each counter after the existing rows. A one-time authorized backfill below
-- assigns PI001 to the requested Roll Up, then numbers the remaining legacy rows.
insert into app_private.catalog_product_sku_counters (organization_id, prefix, last_value)
select p.organization_id,
  app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory),
  count(*)::integer
from public.catalog_products p
group by p.organization_id,
  app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory)
on conflict (organization_id, prefix)
do update set last_value = greatest(
  app_private.catalog_product_sku_counters.last_value,
  excluded.last_value
);

create unique index if not exists catalog_products_organization_sku_uidx
  on public.catalog_products (organization_id, sku);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.catalog_products'::regclass
      and conname = 'catalog_products_sku_format_check'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_sku_format_check
      check (sku = id or sku ~ '^[A-Z]{2}[0-9]{3,}$') not valid;
  end if;
end;
$$;

comment on column public.catalog_products.sku is
  'Stable staff-facing code shared by the catalog, website, quotes, POS and product records. Internal catalog_products.id remains the immutable relational ID.';
comment on table app_private.catalog_product_sku_counters is
  'Private, concurrency-safe counters for short Visual Corp catalog SKUs. Updated only by the SKU trigger.';

create or replace function public.assign_catalog_product_skus()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_changed integer := 0;
begin
  select o.id into v_organization_id
  from public.organizations o
  where o.slug = 'visual-corp'
  limit 1;

  if v_organization_id is null then
    raise exception 'No se encontró la organización Visual Corp.' using errcode = 'P0002';
  end if;
  if not app_private.has_visualcorp_access(v_organization_id, 'catalog_admin', 'edit', null) then
    raise exception 'Necesitas permiso para editar productos del catálogo.' using errcode = '42501';
  end if;

  with pending as (
    select p.id,
      app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory) as prefix,
      row_number() over (
        partition by app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory)
        order by (p.id = 'rollup_80x200_premium') desc, p.sort_order nulls last, p.name collate "C", p.id
      ) as position
    from public.catalog_products p
    where p.organization_id = v_organization_id
      and p.sku = p.id
  ), updated as (
    update public.catalog_products p
    set sku = pending.prefix || case
      when pending.position < 1000 then lpad(pending.position::text, 3, '0')
      else pending.position::text
    end
    from pending
    where p.organization_id = v_organization_id
      and p.id = pending.id
      and p.sku = p.id
    returning p.id
  )
  select count(*)::integer into v_changed from updated;

  return v_changed;
end;
$$;

revoke all on function public.assign_catalog_product_skus() from public, anon, authenticated;
grant execute on function public.assign_catalog_product_skus() to authenticated;

