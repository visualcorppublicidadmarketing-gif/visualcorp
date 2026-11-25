-- Migration: 20261105093000_inventory_live_rolls_and_fast_ops.sql
-- Tablero en vivo de rollos y bobinas montadas en máquina (Lonas, Viniles, Papeles)
-- y operaciones rápidas de inventario en taller / bodega.

create table if not exists public.inventory_active_rolls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  variant_id uuid not null references public.inventory_variants(id) on delete cascade,
  location_code text not null default 'MAIN',
  machine_name text not null default '',
  material_name text not null,
  material_family text not null default 'lona' check (material_family in ('lona', 'vinil', 'papel', 'otro')),
  roll_tag text not null default '',
  standard_length_m numeric(10,2) not null default 50.00 check (standard_length_m > 0),
  remaining_percent numeric(5,2) not null default 100.00 check (remaining_percent >= 0 and remaining_percent <= 100.00),
  status text not null default 'en_uso' check (status in ('en_uso', 'en_espera', 'agotado')),
  operator_name text not null default '',
  notes text not null default '',
  last_measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_active_rolls_org_status_idx
  on public.inventory_active_rolls(organization_id, status, branch_id);

create index if not exists inventory_active_rolls_variant_idx
  on public.inventory_active_rolls(variant_id);

create table if not exists public.inventory_roll_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roll_id uuid not null references public.inventory_active_rolls(id) on delete cascade,
  previous_percent numeric(5,2) not null,
  new_percent numeric(5,2) not null,
  operator_name text not null default '',
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists inventory_roll_logs_roll_idx
  on public.inventory_roll_logs(roll_id, recorded_at desc);

-- RLS
alter table public.inventory_active_rolls enable row level security;
alter table public.inventory_roll_logs enable row level security;

create policy inventory_active_rolls_select on public.inventory_active_rolls
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'view', branch_id));

create policy inventory_active_rolls_all on public.inventory_active_rolls
  for all to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit', branch_id))
  with check (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit', branch_id));

create policy inventory_roll_logs_select on public.inventory_roll_logs
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'inventory', 'view'));

create policy inventory_roll_logs_insert on public.inventory_roll_logs
  for insert to authenticated
  with check (app_private.has_visualcorp_access(organization_id, 'inventory', 'edit'));

grant select, insert, update, delete on public.inventory_active_rolls to authenticated;
grant select, insert on public.inventory_roll_logs to authenticated;

-- RPC: Actualizar porcentaje de rollo en máquina
create or replace function public.record_roll_daily_percent(
  p_roll_id uuid,
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
  v_roll record;
  v_old_percent numeric(5,2);
  v_new_percent numeric(5,2);
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para registrar el porcentaje de uso.';
  end if;

  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0%% y 100%%.';
  end if;

  select * into v_roll
  from public.inventory_active_rolls
  where id = p_roll_id
  for update;

  if not found then
    raise exception 'No se encontró el rollo especificado.';
  end if;

  if not app_private.has_visualcorp_access(v_roll.organization_id, 'inventory', 'edit', v_roll.branch_id) then
    raise exception 'No tienes permisos para actualizar rollos en esta sucursal.';
  end if;

  v_old_percent := v_roll.remaining_percent;
  v_new_percent := round(p_percent::numeric, 2);
  v_status := case when v_new_percent = 0 then 'agotado' else 'en_uso' end;

  update public.inventory_active_rolls
  set
    remaining_percent = v_new_percent,
    status = v_status,
    operator_name = coalesce(nullif(trim(p_operator), ''), v_roll.operator_name),
    notes = coalesce(nullif(trim(p_notes), ''), v_roll.notes),
    last_measured_at = now(),
    updated_at = now()
  where id = p_roll_id;

  insert into public.inventory_roll_logs (
    organization_id, roll_id, previous_percent, new_percent,
    operator_name, notes, recorded_at, created_by
  ) values (
    v_roll.organization_id, p_roll_id, v_old_percent, v_new_percent,
    coalesce(trim(p_operator), ''), coalesce(trim(p_notes), ''), now(), (select auth.uid())
  );

  return jsonb_build_object(
    'success', true,
    'roll_id', p_roll_id,
    'previous_percent', v_old_percent,
    'remaining_percent', v_new_percent,
    'status', v_status
  );
end;
$$;

-- RPC: Reemplazar o cargar un rollo en máquina (opcionalmente descontando de bodega)
create or replace function public.replace_active_roll(
  p_roll_id uuid,
  p_consume_warehouse_roll boolean default true,
  p_new_tag text default '',
  p_operator text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_roll record;
  v_warehouse_after numeric(14,3) := null;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para cambiar el rollo.';
  end if;

  select * into v_roll
  from public.inventory_active_rolls
  where id = p_roll_id
  for update;

  if not found then
    raise exception 'No se encontró el rollo especificado.';
  end if;

  if not app_private.has_visualcorp_access(v_roll.organization_id, 'inventory', 'edit', v_roll.branch_id) then
    raise exception 'No tienes permisos para gestionar rollos en esta sucursal.';
  end if;

  -- Si se solicita descontar 1 rollo entero de bodega
  if coalesce(p_consume_warehouse_roll, false) then
    v_warehouse_after := public.record_inventory_movement(
      p_variant_id => v_roll.variant_id,
      p_branch_id => v_roll.branch_id,
      p_movement_type => 'consumption',
      p_quantity => 1,
      p_reason => 'Apertura de nuevo rollo en máquina: ' || v_roll.material_name,
      p_location_code => v_roll.location_code
    );
  end if;

  -- Actualizar el rollo activo al 100%
  update public.inventory_active_rolls
  set
    remaining_percent = 100.00,
    status = 'en_uso',
    roll_tag = coalesce(nullif(trim(p_new_tag), ''), v_roll.roll_tag),
    operator_name = coalesce(nullif(trim(p_operator), ''), v_roll.operator_name),
    notes = coalesce(nullif(trim(p_notes), ''), 'Rollo nuevo montado en máquina'),
    last_measured_at = now(),
    updated_at = now()
  where id = p_roll_id;

  insert into public.inventory_roll_logs (
    organization_id, roll_id, previous_percent, new_percent,
    operator_name, notes, recorded_at, created_by
  ) values (
    v_roll.organization_id, p_roll_id, v_roll.remaining_percent, 100.00,
    coalesce(trim(p_operator), ''),
    'Nuevo rollo montado al 100%' || case when p_consume_warehouse_roll then ' (1 rollo descontado de bodega)' else '' end,
    now(),
    (select auth.uid())
  );

  return jsonb_build_object(
    'success', true,
    'roll_id', p_roll_id,
    'remaining_percent', 100.00,
    'consumed_warehouse_roll', p_consume_warehouse_roll,
    'warehouse_after', v_warehouse_after
  );
end;
$$;

grant execute on function public.record_roll_daily_percent(uuid, numeric, text, text) to authenticated;
grant execute on function public.replace_active_roll(uuid, boolean, text, text, text) to authenticated;
