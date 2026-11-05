-- Migration: 20261105125000_inventory_live_inks_monitor.sql
-- Tablero en vivo de Tintas en máquinas de taller (CMYK)
-- Monitoreo de porcentaje restante en tiempo real, recargas rápidas y consumo automático de existencias.

create table if not exists public.inventory_active_inks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  variant_id uuid references public.inventory_variants(id) on delete set null,
  location_code text not null default 'MAIN',
  machine_name text not null default '',
  color_code text not null check (color_code in ('C', 'M', 'Y', 'K', 'LC', 'LM', 'W', 'V', 'FL', 'OTRO')),
  color_name text not null default '',
  color_hex text not null default '#00AEEF',
  ink_type text not null default 'ecosolvente' check (ink_type in ('ecosolvente', 'solvente', 'sublimacion', 'uv', 'dtf', 'acuosa', 'otro')),
  tank_capacity_ml numeric(10,2) not null default 1000.00 check (tank_capacity_ml > 0),
  remaining_percent numeric(5,2) not null default 100.00 check (remaining_percent >= 0 and remaining_percent <= 100.00),
  status text not null default 'en_uso' check (status in ('en_uso', 'bajo', 'critico', 'agotado')),
  operator_name text not null default '',
  notes text not null default '',
  last_measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_active_inks_org_machine_idx
  on public.inventory_active_inks(organization_id, machine_name, branch_id);

create index if not exists inventory_active_inks_status_idx
  on public.inventory_active_inks(remaining_percent, status);

create index if not exists inventory_active_inks_variant_idx
  on public.inventory_active_inks(variant_id);

create table if not exists public.inventory_ink_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ink_id uuid not null references public.inventory_active_inks(id) on delete cascade,
  color_code text not null default '',
  previous_percent numeric(5,2) not null,
  new_percent numeric(5,2) not null,
  operator_name text not null default '',
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists inventory_ink_logs_ink_idx
  on public.inventory_ink_logs(ink_id, recorded_at desc);

-- RLS
alter table public.inventory_active_inks enable row level security;
alter table public.inventory_ink_logs enable row level security;

create policy inventory_active_inks_select on public.inventory_active_inks
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'view', branch_id));

create policy inventory_active_inks_all on public.inventory_active_inks
  for all to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit', branch_id))
  with check (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit', branch_id));

create policy inventory_ink_logs_select on public.inventory_ink_logs
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'view'));

create policy inventory_ink_logs_insert on public.inventory_ink_logs
  for insert to authenticated
  with check (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit'));

grant select, insert, update, delete on public.inventory_active_inks to authenticated;
grant select, insert on public.inventory_ink_logs to authenticated;

-- RPC: Actualizar porcentaje de tinta en máquina
create or replace function public.record_ink_daily_percent(
  p_ink_id uuid,
  p_percent numeric,
  p_operator text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ink record;
  v_old_percent numeric(5,2);
  v_new_percent numeric(5,2);
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para registrar el porcentaje de tinta.';
  end if;

  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0%% y 100%%.';
  end if;

  select * into v_ink
  from public.inventory_active_inks
  where id = p_ink_id
  for update;

  if not found then
    raise exception 'No se encontró el registro de tinta especificado.';
  end if;

  if not app_private.has_visualcorp_access(v_ink.organization_id, 'inventory', 'edit', v_ink.branch_id) then
    raise exception 'No tienes permisos para actualizar tintas en esta sucursal.';
  end if;

  v_old_percent := v_ink.remaining_percent;
  v_new_percent := round(p_percent::numeric, 2);
  v_status := case
    when v_new_percent = 0 then 'agotado'
    when v_new_percent <= 15 then 'critico'
    when v_new_percent <= 30 then 'bajo'
    else 'en_uso'
  end;

  update public.inventory_active_inks
  set
    remaining_percent = v_new_percent,
    status = v_status,
    operator_name = coalesce(nullif(trim(p_operator), ''), v_ink.operator_name),
    notes = coalesce(nullif(trim(p_notes), ''), v_ink.notes),
    last_measured_at = now(),
    updated_at = now()
  where id = p_ink_id;

  insert into public.inventory_ink_logs (
    organization_id, ink_id, color_code, previous_percent, new_percent,
    operator_name, notes, recorded_at, created_by
  ) values (
    v_ink.organization_id, p_ink_id, v_ink.color_code, v_old_percent, v_new_percent,
    coalesce(trim(p_operator), ''), coalesce(trim(p_notes), ''), now(), (select auth.uid())
  );

  return jsonb_build_object(
    'success', true,
    'ink_id', p_ink_id,
    'previous_percent', v_old_percent,
    'remaining_percent', v_new_percent,
    'status', v_status
  );
end;
$$;

-- RPC: Rellenar tanque de tinta al 100% (opcionalmente descontando 1 botella de bodega)
create or replace function public.refill_active_ink(
  p_ink_id uuid,
  p_consume_warehouse_bottle boolean default true,
  p_operator text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ink record;
  v_warehouse_after numeric(14,3) := null;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para rellenar tinta.';
  end if;

  select * into v_ink
  from public.inventory_active_inks
  where id = p_ink_id
  for update;

  if not found then
    raise exception 'No se encontró el registro de tinta especificado.';
  end if;

  if not app_private.has_visualcorp_access(v_ink.organization_id, 'inventory', 'edit', v_ink.branch_id) then
    raise exception 'No tienes permisos para gestionar tintas en esta sucursal.';
  end if;

  -- Si se solicita descontar 1 botella cerrada de bodega y hay variante vinculada
  if coalesce(p_consume_warehouse_bottle, false) and v_ink.variant_id is not null then
    v_warehouse_after := public.record_inventory_movement(
      p_variant_id => v_ink.variant_id,
      p_branch_id => v_ink.branch_id,
      p_movement_type => 'consumption',
      p_quantity => 1,
      p_reason => 'Recarga de tanque de tinta en máquina: ' || v_ink.machine_name || ' (' || v_ink.color_name || ' ' || v_ink.color_code || ')',
      p_location_code => v_ink.location_code
    );
  end if;

  -- Actualizar tanque al 100%
  update public.inventory_active_inks
  set
    remaining_percent = 100.00,
    status = 'en_uso',
    operator_name = coalesce(nullif(trim(p_operator), ''), v_ink.operator_name),
    notes = coalesce(nullif(trim(p_notes), ''), 'Tanque rellenado al 100%'),
    last_measured_at = now(),
    updated_at = now()
  where id = p_ink_id;

  insert into public.inventory_ink_logs (
    organization_id, ink_id, color_code, previous_percent, new_percent,
    operator_name, notes, recorded_at, created_by
  ) values (
    v_ink.organization_id, p_ink_id, v_ink.color_code, v_ink.remaining_percent, 100.00,
    coalesce(trim(p_operator), ''),
    'Tanque rellenado al 100%' || case when p_consume_warehouse_bottle and v_ink.variant_id is not null then ' (1 botella descontada de bodega)' else '' end,
    now(),
    (select auth.uid())
  );

  return jsonb_build_object(
    'success', true,
    'ink_id', p_ink_id,
    'remaining_percent', 100.00,
    'consumed_warehouse_bottle', p_consume_warehouse_bottle,
    'warehouse_after', v_warehouse_after
  );
end;
$$;

-- RPC: Actualización rápida por lote de canales CMYK de una máquina
create or replace function public.batch_record_machine_inks(
  p_updates jsonb,
  p_operator text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item jsonb;
  v_ink_id uuid;
  v_pct numeric;
  v_updated_count int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para actualizar las tintas.';
  end if;

  for v_item in select * from jsonb_array_elements(p_updates)
  loop
    v_ink_id := (v_item->>'id')::uuid;
    v_pct := (v_item->>'percent')::numeric;
    if v_ink_id is not null and v_pct is not null then
      perform public.record_ink_daily_percent(
        v_ink_id,
        v_pct,
        p_operator,
        coalesce(p_notes, 'Ajuste lote en máquina')
      );
      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
end;
$$;

grant execute on function public.record_ink_daily_percent(uuid, numeric, text, text) to authenticated;
grant execute on function public.refill_active_ink(uuid, boolean, text, text) to authenticated;
grant execute on function public.batch_record_machine_inks(jsonb, text, text) to authenticated;

-- Sembrar configuración inicial de los 4 plotters principales con sus 4 canales CMYK cada uno
insert into public.inventory_active_inks (
  organization_id, branch_id, variant_id, machine_name, color_code, color_name, color_hex, ink_type, tank_capacity_ml, remaining_percent, status, notes
)
select
  '57b8e2ab-9dd3-491b-9402-7176da9ba98c'::uuid,
  'f499caf7-6286-4c6e-abd7-d79fa58c27d0'::uuid,
  v.id,
  m.machine_name,
  c.color_code,
  c.color_name,
  c.color_hex,
  m.ink_type,
  m.capacity,
  c.initial_pct,
  case when c.initial_pct <= 15 then 'critico' when c.initial_pct <= 30 then 'bajo' else 'en_uso' end,
  'Configuración inicial de taller'
from (
  values
    ('Plotter Gran Formato 3.20m', 'ecosolvente', 1000.0),
    ('Plotter Impresión y Corte', 'ecosolvente', 1000.0),
    ('Plotter Roland 1.60m', 'ecosolvente', 500.0),
    ('Plotter Sublimación / Calandra', 'sublimacion', 1000.0)
) as m(machine_name, ink_type, capacity)
cross join (
  values
    ('C', 'Cyan', '#00AEEF', 65.0),
    ('M', 'Magenta', '#EC008C', 45.0),
    ('Y', 'Amarillo', '#FACC15', 18.0),
    ('K', 'Negro', '#18181B', 80.0)
) as c(color_code, color_name, color_hex, initial_pct)
left join lateral (
  select id from public.inventory_variants
  where (
    (m.ink_type = 'ecosolvente' and sku like 'VC-INK-GALAXY-TEE-' || upper(case when c.color_code = 'K' then 'BLACK' when c.color_code = 'C' then 'CYAN' when c.color_code = 'M' then 'MAGENTA' when c.color_code = 'Y' then 'YELLOW' else '' end))
    or
    (m.ink_type = 'sublimacion' and sku like 'VC-INK-FUSION-SUB-' || upper(case when c.color_code = 'K' then 'BLACK' when c.color_code = 'C' then 'CYAN' when c.color_code = 'M' then 'MAGENTA' when c.color_code = 'Y' then 'YELLOW' else '' end))
  )
  limit 1
) v on true
on conflict do nothing;
