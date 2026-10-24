-- Configurable material recipes for POS catalog lines.
-- A recipe is opt-in and does not create stock or assume a physical count.
create unique index if not exists catalog_products_id_organization_uq
  on public.catalog_products (id,organization_id);

create table public.catalog_material_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_product_id text not null references public.catalog_products(id) on delete restrict,
  inventory_variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  calculation_mode text not null check (calculation_mode in ('per_billed_unit','area_to_linear')),
  fulfillment_stage text not null default 'sale' check (fulfillment_stage in ('sale','production')),
  quantity_per_basis numeric(14,6) not null check (quantity_per_basis > 0),
  waste_percent numeric(6,3) not null default 0 check (waste_percent >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,catalog_product_id,inventory_variant_id,branch_id),
  foreign key (inventory_variant_id,organization_id) references public.inventory_variants(id,organization_id) on delete restrict,
  foreign key (branch_id,organization_id) references public.branches(id,organization_id) on delete restrict
);
create index catalog_material_recipes_product_idx
  on public.catalog_material_recipes (organization_id,catalog_product_id,branch_id) where active;
alter table public.catalog_material_recipes enable row level security;
create policy catalog_material_recipes_staff_read on public.catalog_material_recipes
  for select to authenticated using (app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','advisor','warehouse','production']));
create policy catalog_material_recipes_admin_write on public.catalog_material_recipes
  for all to authenticated
  using (app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','warehouse']))
  with check (app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','warehouse']));
grant select,insert,update on public.catalog_material_recipes to authenticated;

create table public.sale_material_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  sale_line_id uuid not null,
  recipe_id uuid references public.catalog_material_recipes(id) on delete set null,
  variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  calculation_mode text not null check (calculation_mode in ('per_billed_unit','area_to_linear')),
  fulfillment_stage text not null check (fulfillment_stage in ('sale','production')),
  quantity numeric(14,3) not null check (quantity > 0),
  fulfilled_quantity numeric(14,3) not null default 0 check (fulfilled_quantity >= 0),
  reserved_quantity numeric(14,3) not null default 0 check (reserved_quantity >= 0),
  backordered_quantity numeric(14,3) not null default 0 check (backordered_quantity >= 0),
  released_quantity numeric(14,3) not null default 0 check (released_quantity >= 0),
  status text not null check (status in ('reserved','consumed','backordered','released')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (fulfilled_quantity + reserved_quantity + backordered_quantity + released_quantity = quantity),
  unique (sale_line_id,recipe_id),
  foreign key (sale_id,organization_id) references public.sales(id,organization_id) on delete cascade,
  foreign key (sale_line_id,organization_id) references public.sale_lines(id,organization_id) on delete cascade,
  foreign key (variant_id,organization_id) references public.inventory_variants(id,organization_id) on delete restrict,
  foreign key (branch_id,organization_id) references public.branches(id,organization_id) on delete restrict
);
create index sale_material_consumptions_sale_idx
  on public.sale_material_consumptions (organization_id,sale_id,created_at);
alter table public.sale_material_consumptions enable row level security;
create policy sale_material_consumptions_staff_read on public.sale_material_consumptions
  for select to authenticated using (app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','advisor','warehouse','production']));
grant select on public.sale_material_consumptions to authenticated;

create or replace function app_private.consume_catalog_recipe_materials()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := new.organization_id;
  v_sale public.sales%rowtype;
  v_recipe record;
  v_location text;
  v_width_cm numeric;
  v_required numeric(14,3);
  v_available numeric(14,3);
  v_fulfilled numeric(14,3);
  v_reserved numeric(14,3);
  v_reserved_before numeric(14,3);
  v_backordered numeric(14,3);
  v_unit text;
begin
  if new.catalog_product_id is null then return new; end if;
  select * into v_sale from public.sales where id=new.sale_id and organization_id=v_org;
  if not found then raise exception 'No encontramos la venta vinculada al consumo.'; end if;

  for v_recipe in
    select r.id,r.inventory_variant_id,r.branch_id,r.location_code,r.calculation_mode,
           r.quantity_per_basis,r.waste_percent,r.fulfillment_stage,iv.attributes,i.base_unit
    from public.catalog_material_recipes r
    join public.inventory_variants iv on iv.id=r.inventory_variant_id and iv.organization_id=r.organization_id and iv.active
    join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id and i.active
    where r.organization_id=v_org and r.catalog_product_id=new.catalog_product_id
      and r.branch_id=v_sale.branch_id and r.active
    order by r.id
  loop
    if new.variant_id is not null and new.variant_id=v_recipe.inventory_variant_id then
      raise exception 'El mismo artículo está vinculado como producto vendido y material consumido. Revisa el vínculo de inventario.';
    end if;
    if v_recipe.calculation_mode='per_billed_unit' then
      v_required := ceil((new.quantity*v_recipe.quantity_per_basis)*1000)/1000;
    else
      v_width_cm := nullif(v_recipe.attributes->>'width_cm','')::numeric;
      if v_width_cm is null or v_width_cm<=0 then
        raise exception 'La receta por área necesita una variante de rollo con ancho confirmado.';
      end if;
      if lower(v_recipe.base_unit) not in ('metro','metros','m','m lineal','metro lineal') then
        raise exception 'La salida de una receta por área requiere un material contado en metros lineales.';
      end if;
      v_required := ceil((new.quantity/(v_width_cm/100)*v_recipe.quantity_per_basis*(1+v_recipe.waste_percent/100))*1000)/1000;
    end if;
    if v_required<=0 then continue; end if;
    v_location := coalesce(nullif(v_recipe.location_code,''),'MAIN');
    perform 1 from public.inventory_variants where id=v_recipe.inventory_variant_id and organization_id=v_org for update;
    select coalesce(sum(s.quantity-s.reserved_quantity),0) into v_available
      from public.inventory_stock s where s.organization_id=v_org and s.variant_id=v_recipe.inventory_variant_id
        and s.branch_id=v_recipe.branch_id and s.location_code=v_location;
    v_fulfilled := case when v_recipe.fulfillment_stage='sale' then least(v_required,greatest(v_available,0)) else 0 end;
    v_reserved := case when v_recipe.fulfillment_stage='production' then least(v_required,greatest(v_available,0)) else 0 end;
    v_backordered := v_required-v_fulfilled-v_reserved;
    if v_reserved>0 then
      select coalesce(sum(s.reserved_quantity),0) into v_reserved_before
        from public.inventory_stock s where s.organization_id=v_org and s.variant_id=v_recipe.inventory_variant_id
          and s.branch_id=v_recipe.branch_id and s.location_code=v_location;
      update public.inventory_stock s set reserved_quantity=s.reserved_quantity+v_reserved,updated_at=now()
      where s.organization_id=v_org and s.variant_id=v_recipe.inventory_variant_id
        and s.branch_id=v_recipe.branch_id and s.location_code=v_location;
      insert into public.inventory_reservation_audits
        (organization_id,variant_id,branch_id,location_code,previous_quantity,reserved_quantity,note,changed_by)
      values (v_org,v_recipe.inventory_variant_id,v_recipe.branch_id,v_location,v_reserved_before,
        (select reserved_quantity from public.inventory_stock s where s.organization_id=v_org and s.variant_id=v_recipe.inventory_variant_id and s.branch_id=v_recipe.branch_id and s.location_code=v_location),
        'Reserva automática para orden POS '||coalesce(v_sale.sale_code,''),(select auth.uid()));
    end if;
    insert into public.sale_material_consumptions
      (organization_id,sale_id,sale_line_id,recipe_id,variant_id,branch_id,location_code,calculation_mode,fulfillment_stage,quantity,fulfilled_quantity,reserved_quantity,backordered_quantity,released_quantity,status,created_by)
    values (v_org,new.sale_id,new.id,v_recipe.id,v_recipe.inventory_variant_id,v_recipe.branch_id,v_location,
      v_recipe.calculation_mode,v_recipe.fulfillment_stage,v_required,v_fulfilled,v_reserved,v_backordered,0,
      case when v_reserved>0 and v_backordered=0 then 'reserved' when v_fulfilled>0 and v_backordered=0 then 'consumed' else 'backordered' end,v_user);
    if v_fulfilled>0 then
      insert into public.inventory_movements
        (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values (v_org,v_recipe.inventory_variant_id,v_recipe.branch_id,v_location,'consumption',-v_fulfilled,
        'Consumo de materiales de la orden POS','sale',new.sale_id,v_user);
    end if;
  end loop;
  return new;
end;
$function$;
revoke all on function app_private.consume_catalog_recipe_materials() from public,anon,authenticated;
create trigger sale_line_consumes_recipe_materials
  after insert on public.sale_lines
  for each row execute function app_private.consume_catalog_recipe_materials();

create or replace function app_private.preserve_recipe_backorder_flag()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not new.urgent_backorder and exists (
    select 1 from public.sale_material_consumptions c
    where c.organization_id=new.organization_id and c.sale_id=new.id and c.backordered_quantity>0
  ) then
    update public.sales set urgent_backorder=true where id=new.id and organization_id=new.organization_id;
  end if;
  return new;
end;
$function$;
revoke all on function app_private.preserve_recipe_backorder_flag() from public,anon,authenticated;
create trigger sale_recipe_backorder_flag
  after update of urgent_backorder on public.sales
  for each row execute function app_private.preserve_recipe_backorder_flag();

create or replace function app_private.release_cancelled_sale_materials()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_component public.sale_material_consumptions%rowtype;
  v_reserved_before numeric(14,3);
begin
  if new.status<>'cancelled' or old.status='cancelled' then return new; end if;
  for v_component in select * from public.sale_material_consumptions c
    where c.organization_id=new.organization_id and c.sale_id=new.id
      and (c.reserved_quantity>0 or c.backordered_quantity>0)
    for update
  loop
    if v_component.reserved_quantity>0 then
      select s.reserved_quantity into v_reserved_before from public.inventory_stock s
        where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id
          and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code
        for update;
      update public.inventory_stock s set reserved_quantity=s.reserved_quantity-v_component.reserved_quantity,updated_at=now()
        where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id
          and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code
          and s.reserved_quantity>=v_component.reserved_quantity;
      if not found then raise exception 'No se pudo liberar la reserva de la venta cancelada.'; end if;
      insert into public.inventory_reservation_audits
        (organization_id,variant_id,branch_id,location_code,previous_quantity,reserved_quantity,note,changed_by)
      values (v_component.organization_id,v_component.variant_id,v_component.branch_id,v_component.location_code,
        v_reserved_before,(select s.reserved_quantity from public.inventory_stock s where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code),
        'Liberación por cancelación de venta '||new.id,v_user);
    end if;
    update public.sale_material_consumptions c set
      released_quantity=c.released_quantity+c.reserved_quantity+c.backordered_quantity,
      reserved_quantity=0,backordered_quantity=0,status='released'
    where c.id=v_component.id;
  end loop;
  return new;
end;
$function$;
revoke all on function app_private.release_cancelled_sale_materials() from public,anon,authenticated;
create trigger cancelled_sale_releases_materials
  after update of status on public.sales
  for each row execute function app_private.release_cancelled_sale_materials();

create or replace function app_private.settle_sale_material_reservations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_component public.sale_material_consumptions%rowtype;
  v_previous_reserved numeric(14,3);
begin
  if new.sale_id is null or old.status is not distinct from new.status then return new; end if;
  if new.status in ('in_progress','quality_review','ready','completed')
     and old.status not in ('in_progress','quality_review','ready','completed') then
    for v_component in select * from public.sale_material_consumptions c
      where c.organization_id=new.organization_id and c.sale_id=new.sale_id and c.reserved_quantity>0
      for update
    loop
      v_previous_reserved := v_component.reserved_quantity;
      update public.inventory_stock s set reserved_quantity=s.reserved_quantity-v_previous_reserved,updated_at=now()
        where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id
          and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code
          and s.reserved_quantity>=v_previous_reserved;
      if not found then raise exception 'No se pudo liberar la reserva del material de producción.'; end if;
      insert into public.inventory_reservation_audits
        (organization_id,variant_id,branch_id,location_code,previous_quantity,reserved_quantity,note,changed_by)
      values (v_component.organization_id,v_component.variant_id,v_component.branch_id,v_component.location_code,
        v_previous_reserved,(select s.reserved_quantity from public.inventory_stock s where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code),
        'Consumo al iniciar producción '||new.order_code,v_user);
      insert into public.inventory_movements
        (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values (v_component.organization_id,v_component.variant_id,v_component.branch_id,v_component.location_code,'consumption',-v_previous_reserved,
        'Consumo reservado de orden de producción '||new.order_code,'sale',new.sale_id,v_user);
      update public.sale_material_consumptions c set
        fulfilled_quantity=c.fulfilled_quantity+v_previous_reserved,
        reserved_quantity=0,
        status=case when c.backordered_quantity>0 then 'backordered' else 'consumed' end
      where c.id=v_component.id;
    end loop;
  elsif new.status='cancelled' and old.status not in ('completed','cancelled') then
    for v_component in select * from public.sale_material_consumptions c
      where c.organization_id=new.organization_id and c.sale_id=new.sale_id
        and (c.reserved_quantity>0 or c.backordered_quantity>0)
      for update
    loop
      v_previous_reserved := v_component.reserved_quantity;
      if v_previous_reserved>0 then
        update public.inventory_stock s set reserved_quantity=s.reserved_quantity-v_previous_reserved,updated_at=now()
          where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id
            and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code
            and s.reserved_quantity>=v_previous_reserved;
        if not found then raise exception 'No se pudo liberar la reserva de la orden cancelada.'; end if;
        insert into public.inventory_reservation_audits
          (organization_id,variant_id,branch_id,location_code,previous_quantity,reserved_quantity,note,changed_by)
        values (v_component.organization_id,v_component.variant_id,v_component.branch_id,v_component.location_code,
          v_previous_reserved,(select s.reserved_quantity from public.inventory_stock s where s.organization_id=v_component.organization_id and s.variant_id=v_component.variant_id and s.branch_id=v_component.branch_id and s.location_code=v_component.location_code),
          'Liberación por cancelación de producción '||new.order_code,v_user);
      end if;
      update public.sale_material_consumptions c set
        released_quantity=c.released_quantity+c.reserved_quantity+c.backordered_quantity,
        reserved_quantity=0,backordered_quantity=0,status='released'
      where c.id=v_component.id;
    end loop;
  end if;
  return new;
end;
$function$;
revoke all on function app_private.settle_sale_material_reservations() from public,anon,authenticated;
create trigger production_order_settle_materials
  after update of status on public.production_orders
  for each row execute function app_private.settle_sale_material_reservations();

-- Initial stock rows and catalog links are configured by an authenticated
-- inventory administrator in the inventory workspace. Physical counts must
-- be recorded separately before the POS can fulfill these materials.

