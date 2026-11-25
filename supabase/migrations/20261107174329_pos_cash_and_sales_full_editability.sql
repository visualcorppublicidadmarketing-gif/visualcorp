-- POS Cash & Sales Full Editability Migration
-- Provides 1-click cash session opening, flexible register assignment,
-- voidable/editable cash movements, shift audits & reopening,
-- and full post-sale amendments with automated inventory reversal.

-- ============================================================================
-- 1. COLUMNAS Y TABLAS DE AUDITORÍA
-- ============================================================================

-- Nuevas columnas en public.cash_sessions
alter table public.cash_sessions
  add column if not exists closing_denominations jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Nuevas columnas en public.cash_session_movements
alter table public.cash_session_movements
  add column if not exists voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists cash_session_movements_active_idx
  on public.cash_session_movements (session_id)
  where not voided;

-- Tabla de auditoría de turnos de caja
create table if not exists public.cash_session_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  action text not null,
  reason text not null default '',
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists cash_session_audits_session_idx
  on public.cash_session_audits (organization_id, session_id, created_at desc);

alter table public.cash_session_audits enable row level security;

drop policy if exists cash_session_audits_select on public.cash_session_audits;
create policy cash_session_audits_select on public.cash_session_audits
  for select to authenticated
  using (
    exists (
      select 1 from public.cash_sessions s
      where s.id = cash_session_audits.session_id
        and s.organization_id = cash_session_audits.organization_id
        and (
          app_private.has_visualcorp_access(s.organization_id, 'cash', 'view', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'cash', 'manage_cash', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'sales', 'edit', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
        )
    )
  );

grant select on public.cash_session_audits to authenticated;
grant all on public.cash_session_audits to service_role;
revoke all on public.cash_session_audits from anon;

-- Tabla de auditoría de enmiendas de venta POS
create table if not exists public.sale_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  reason text not null default '',
  previous_snapshot jsonb not null default '{}'::jsonb,
  new_snapshot jsonb not null default '{}'::jsonb,
  financial_delta numeric(14,2) not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists sale_amendments_sale_idx
  on public.sale_amendments (organization_id, sale_id, created_at desc);

alter table public.sale_amendments enable row level security;

drop policy if exists sale_amendments_select on public.sale_amendments;
create policy sale_amendments_select on public.sale_amendments
  for select to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_amendments.sale_id
        and s.organization_id = sale_amendments.organization_id
        and (
          app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'sales', 'edit', s.branch_id)
        )
    )
  );

grant select on public.sale_amendments to authenticated;
grant all on public.sale_amendments to service_role;
revoke all on public.sale_amendments from anon;

-- Integridad referencial con borrado en cascada para líneas de producción y devoluciones vinculadas a sale_lines
alter table public.production_jobs
  drop constraint if exists production_jobs_sale_line_id_organization_id_fkey;
alter table public.production_jobs
  add constraint production_jobs_sale_line_id_organization_id_fkey
  foreign key (sale_line_id, organization_id)
  references public.sale_lines(id, organization_id)
  on delete cascade;

-- ============================================================================
-- 2. FLEXIBILIZACIÓN DE POLÍTICAS RLS Y PROTECCIÓN DE REGISTROS
-- ============================================================================

-- Reemplazar políticas restrictivas e inserciones bloqueantes en cash_sessions
drop policy if exists cash_sessions_register_assignment on public.cash_sessions;
drop policy if exists cash_sessions_access_insert on public.cash_sessions;
drop policy if exists cash_sessions_assigned_register_insert on public.cash_sessions;

create policy cash_sessions_open_insert on public.cash_sessions
  for insert to authenticated
  with check (
    opened_by = (select auth.uid())
    and status = 'open'
    and (
      app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
      or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
    )
    and (
      cash_register_id is null
      or exists (
        select 1 from public.cash_registers register
        where register.id = cash_sessions.cash_register_id
          and register.organization_id = cash_sessions.organization_id
          and register.branch_id = cash_sessions.branch_id
          and register.active
      )
    )
  );

-- Ajustar funciones de protección de cajas para permitir edición a administradores y encargados
create or replace function app_private.protect_cash_register_advisor_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_manager boolean;
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by then
    raise exception 'La organización y la autoría de la caja no se pueden modificar.' using errcode = '42501';
  end if;

  v_is_manager := (
    app_private.has_org_role(old.organization_id, old.branch_id, array['owner', 'admin', 'manager'])
    or app_private.has_visualcorp_access(old.organization_id, 'finance', 'manage_finance', old.branch_id)
    or app_private.has_visualcorp_access(old.organization_id, 'cash', 'manage_cash', old.branch_id)
  );

  if new.assigned_advisor_id is distinct from old.assigned_advisor_id and not v_is_manager then
    raise exception 'Solo un encargado o administrador puede reasignar el asesor de una caja.' using errcode = '42501';
  end if;

  if new.branch_id is distinct from old.branch_id and not v_is_manager then
    raise exception 'Solo un encargado o administrador puede cambiar la sucursal asignada a una caja.' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function app_private.protect_cash_register_advisor_assignment() from public, anon, authenticated;

create or replace function app_private.protect_cash_register_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_manager boolean;
begin
  if exists (
    select 1 from public.cash_sessions session
    where session.organization_id = old.organization_id
      and session.cash_register_id = old.id
      and session.status = 'open'
  ) and not new.active then
    raise exception 'Cierra el turno de esta caja antes de desactivarla.';
  end if;

  v_is_manager := (
    app_private.has_org_role(old.organization_id, old.branch_id, array['owner', 'admin', 'manager'])
    or app_private.has_visualcorp_access(old.organization_id, 'finance', 'manage_finance', old.branch_id)
    or app_private.has_visualcorp_access(old.organization_id, 'cash', 'manage_cash', old.branch_id)
  );

  if not v_is_manager then
    if (
      new.branch_id is distinct from old.branch_id
      or new.assigned_advisor_id is distinct from old.assigned_advisor_id
    ) and (
      exists (
        select 1 from public.cash_sessions session
        where session.organization_id = old.organization_id
          and session.cash_register_id = old.id
      )
      or exists (
        select 1 from public.cash_register_weekly_goals goal
        where goal.organization_id = old.organization_id
          and goal.cash_register_id = old.id
      )
    ) then
      raise exception 'Esta caja ya tiene turnos o metas históricas. Desactívala y crea otra asignación para conservar los registros.';
    end if;

    if new.name is distinct from old.name and exists (
      select 1 from public.cash_sessions session
      where session.organization_id = old.organization_id
        and session.cash_register_id = old.id
    ) then
      raise exception 'Esta caja ya tiene turnos registrados. Desactívala y crea otra asignación para conservar los registros.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.protect_cash_register_history() from public, anon, authenticated;

create or replace function app_private.validate_cash_register_advisor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.user_id = new.assigned_advisor_id
      and membership.active
      and (
        membership.role in ('advisor', 'owner', 'admin', 'manager')
        or app_private.has_visualcorp_access(new.organization_id, 'sales', 'edit', new.branch_id)
        or app_private.has_visualcorp_access(new.organization_id, 'cash', 'manage_cash', new.branch_id)
      )
      and (membership.branch_id is null or membership.branch_id = new.branch_id)
  ) then
    raise exception 'Selecciona un usuario activo asignado a esta sucursal con permisos comerciales o de caja.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_cash_register_advisor() from public, anon, authenticated;

-- Permisos de actualización en columnas de cash_registers
grant update (branch_id, name, active, assigned_advisor_id) on public.cash_registers to authenticated;

drop policy if exists cash_registers_access_update on public.cash_registers;
create policy cash_registers_access_update on public.cash_registers
  for update to authenticated
  using (
    (
      app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
      and (
        app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
        or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
      )
    )
    or (
      assigned_advisor_id = (select auth.uid())
      and app_private.has_org_role(organization_id, branch_id, array['advisor'])
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  )
  with check (
    (
      app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
      and (
        app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
        or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
      )
    )
    or (
      assigned_advisor_id = (select auth.uid())
      and app_private.has_org_role(organization_id, branch_id, array['advisor'])
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  );

-- Ajuste en visualcorp_guard_write para no bloquear movimientos y turnos de titulares con sales.edit
create or replace function app_private.visualcorp_guard_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_module text;
  v_action text := 'edit';
  v_branch uuid;
  v_old_status text;
  v_new_status text;
  v_old_refund_status text;
  v_new_refund_status text;
begin
  if current_setting('app.pos_rpc_bypass', true) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'public_requests' then
    select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  else
    v_org := nullif(case when tg_op = 'DELETE' then to_jsonb(old)->>'organization_id' else to_jsonb(new)->>'organization_id' end, '')::uuid;
  end if;

  -- Casos especiales de turnos y movimientos de caja
  if tg_table_name = 'cash_sessions' then
    v_branch := nullif(case when tg_op = 'DELETE' then to_jsonb(old)->>'branch_id' else to_jsonb(new)->>'branch_id' end, '')::uuid;
    if not (
      app_private.has_visualcorp_access(v_org, 'cash', 'manage_cash', v_branch)
      or app_private.has_visualcorp_access(v_org, 'sales', 'edit', v_branch)
    ) then
      raise exception 'Tu perfil no permite operaciones sobre turnos de caja en esta sucursal.' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'cash_session_movements' then
    select cs.branch_id into v_branch
    from public.cash_sessions cs
    where cs.id = nullif(case when tg_op = 'DELETE' then to_jsonb(old)->>'session_id' else to_jsonb(new)->>'session_id' end, '')::uuid;

    if not (
      app_private.has_visualcorp_access(v_org, 'cash', 'manage_cash', v_branch)
      or (
        exists (
          select 1 from public.cash_sessions cs
          where cs.id = nullif(case when tg_op = 'DELETE' then to_jsonb(old)->>'session_id' else to_jsonb(new)->>'session_id' end, '')::uuid
            and cs.opened_by = (select auth.uid())
            and cs.status = 'open'
        )
        and app_private.has_visualcorp_access(v_org, 'sales', 'edit', v_branch)
      )
    ) then
      raise exception 'Tu perfil no permite operaciones sobre movimientos de caja.' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_module := app_private.visualcorp_module_for_table(tg_table_name);
  if v_module is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_table_name = 'public_requests' and tg_op = 'INSERT' and (select auth.uid()) is null then return new; end if;
  if tg_op = 'DELETE' then v_action := 'delete_records'; end if;
  if tg_table_name in ('purchase_receipts', 'purchase_receipt_lines') and tg_op <> 'DELETE' then v_action := 'receive_purchase'; end if;
  v_branch := nullif(case when tg_op = 'DELETE' then to_jsonb(old)->>'branch_id' else to_jsonb(new)->>'branch_id' end, '')::uuid;

  if not app_private.has_visualcorp_access(v_org, v_module, v_action, v_branch) then
    raise exception 'Tu perfil no permite esta operación en %.', v_module using errcode = '42501';
  end if;

  if tg_table_name in ('inventory_item_costs', 'inventory_item_cost_history')
     and not app_private.has_visualcorp_access(v_org, 'inventory_costs', 'edit_costs', v_branch) then
    raise exception 'Editar o eliminar costos de inventario requiere autorización.' using errcode = '42501';
  end if;

  if tg_table_name in ('catalog_products', 'website_product_overrides', 'calculator_settings') and tg_op = 'UPDATE'
     and exists (select 1 from jsonb_each(to_jsonb(new)) n(key, value)
       where n.key ~* '(price|tarifa|cost|costo|margin|margen|discount|descuento|rate|iva)'
         and n.value is distinct from (to_jsonb(old)->n.key))
     and not app_private.has_visualcorp_access(v_org, 'catalog_admin', 'edit_prices', v_branch) then
    raise exception 'Cambiar tarifas requiere el permiso de edición de precios.' using errcode = '42501';
  end if;

  if tg_table_name = 'purchase_orders' and tg_op = 'UPDATE' and to_jsonb(old)->>'status' is distinct from to_jsonb(new)->>'status' then
    v_new_status := to_jsonb(new)->>'status';
    if v_new_status = 'ordered' and not app_private.has_visualcorp_access(v_org, 'purchases', 'approve_purchase', v_branch) then
      raise exception 'Enviar una orden de compra requiere autorización.' using errcode = '42501';
    end if;
    if v_new_status = 'cancelled' and not app_private.has_visualcorp_access(v_org, 'purchases', 'cancel_purchase', v_branch) then
      raise exception 'Cancelar una orden de compra requiere autorización.' using errcode = '42501';
    end if;
    if v_new_status in ('partially_received', 'received') and not app_private.has_visualcorp_access(v_org, 'purchases', 'receive_purchase', v_branch) then
      raise exception 'Recibir una compra requiere autorización.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name in ('pages', 'site_articles', 'services', 'promotions', 'catalog_products') and tg_op in ('INSERT', 'UPDATE')
     and (to_jsonb(new)->>'is_published') = 'true'
     and (tg_op = 'INSERT' or (to_jsonb(old)->>'is_published') is distinct from 'true')
     and not app_private.has_visualcorp_access(v_org, 'website', 'publish_content', v_branch) then
    raise exception 'Publicar contenido requiere un permiso específico.' using errcode = '42501';
  end if;

  if tg_table_name = 'sale_returns' and tg_op = 'UPDATE' and to_jsonb(old)->>'refund_status' is distinct from to_jsonb(new)->>'refund_status'
     and (to_jsonb(new)->>'refund_status') = 'completed' and not app_private.has_visualcorp_access(v_org, 'sales', 'settle_refund', v_branch) then
    raise exception 'Completar un reembolso requiere autorización.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.visualcorp_guard_write() from public, anon, authenticated;

-- Modificación en attach_open_cash_session para respetar cash_session_id previo
create or replace function app_private.attach_open_cash_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.method <> 'cash' then
    new.cash_session_id := null;
    return new;
  end if;

  -- Si el pago ya tiene un cash_session_id válido asignado (ej. preservado al editar una venta histórica),
  -- lo respeta sin exigir abrir una caja nueva
  if new.cash_session_id is not null then
    if exists (
      select 1 from public.cash_sessions cs
      where cs.id = new.cash_session_id
        and cs.organization_id = new.organization_id
    ) then
      return new;
    end if;
  end if;

  select cs.id
    into new.cash_session_id
    from public.cash_sessions as cs
   where cs.organization_id = new.organization_id
     and cs.branch_id = (
       select s.branch_id
         from public.sales as s
        where s.id = new.sale_id
          and s.organization_id = new.organization_id
     )
     and cs.opened_by = new.created_by
     and cs.status = 'open'
   for update;

  if new.cash_session_id is null then
    raise exception 'No hay una caja abierta para este pago. Actualiza la pantalla y abre un nuevo turno antes de registrar efectivo.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;
revoke all on function app_private.attach_open_cash_session() from public, anon, authenticated;

-- Modificación en capture_pos_commercial_discount_reason para aceptar motivo directo
create or replace function app_private.capture_pos_commercial_discount_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match text[];
begin
  if new.idempotency_key is null then
    return new;
  end if;

  if coalesce(new.discount_total, 0) <= 0 then
    new.discount_reason := '';
    return new;
  end if;

  if coalesce(new.subtotal, 0) <= 0
    or new.discount_total > round(new.subtotal * 0.40, 2) then
    raise exception 'El descuento comercial no puede superar el 40%% del subtotal.'
      using errcode = '22023';
  end if;

  if char_length(trim(coalesce(new.discount_reason, ''))) > 0 then
    new.discount_reason := left(trim(new.discount_reason), 300);
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.discount_total = new.discount_total
    and char_length(coalesce(old.discount_reason, '')) > 0 then
    new.discount_reason := old.discount_reason;
    return new;
  end if;

  v_match := regexp_match(
    coalesce(new.note, ''),
    E'^Descuento comercial \\([0-9]{1,2}%\\): ([^\\n]{1,300})'
  );
  if v_match is not null and char_length(trim(v_match[1])) > 0 then
    new.discount_reason := trim(v_match[1]);
    return new;
  end if;

  new.discount_reason := 'Descuento comercial autorizado en POS';
  return new;
end;
$$;
revoke all on function app_private.capture_pos_commercial_discount_reason() from public, anon, authenticated;

-- ============================================================================
-- 3. RPC 1: APERTURA DE CAJA EN 1 CLIC (open_pos_cash_session)
-- ============================================================================

create or replace function public.open_pos_cash_session(
  p_branch_id uuid,
  p_opening_cash numeric default 0,
  p_register_name text default null,
  p_cash_register_id uuid default null,
  p_opened_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_branch public.branches%rowtype;
  v_target_user uuid;
  v_existing_session public.cash_sessions%rowtype;
  v_register_id uuid;
  v_reg_name text;
  v_session public.cash_sessions%rowtype;
begin
  if v_caller is null then
    raise exception 'Inicia sesión para abrir turno de caja.' using errcode = '42501';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id and active = true;

  if not found then
    raise exception 'La sucursal seleccionada no existe o no está activa.' using errcode = '22023';
  end if;

  v_target_user := coalesce(p_opened_by, v_caller);

  if v_target_user <> v_caller then
    if not app_private.has_visualcorp_access(v_branch.organization_id, 'cash', 'manage_cash', v_branch.id) then
      raise exception 'Abrir turnos para otros usuarios requiere autorización administrativa de caja.' using errcode = '42501';
    end if;
  else
    if not (
      app_private.has_visualcorp_access(v_branch.organization_id, 'sales', 'edit', v_branch.id)
      or app_private.has_visualcorp_access(v_branch.organization_id, 'cash', 'manage_cash', v_branch.id)
    ) then
      raise exception 'No tienes permiso para abrir turno de caja en esta sucursal.' using errcode = '42501';
    end if;
  end if;

  -- Bloqueo transaccional por usuario en la sucursal para evitar sesiones duplicadas concurrentes
  perform set_config('app.pos_rpc_bypass', 'true', true);
  perform pg_advisory_xact_lock(hashtextextended(v_branch.organization_id::text || ':open_cash:' || v_target_user::text, 0));

  select * into v_existing_session
  from public.cash_sessions
  where organization_id = v_branch.organization_id
    and branch_id = v_branch.id
    and opened_by = v_target_user
    and status = 'open'
  for update;

  if found then
    if p_opening_cash is not null and round(greatest(p_opening_cash, 0), 2) is distinct from v_existing_session.opening_cash then
      update public.cash_sessions
      set opening_cash = round(greatest(p_opening_cash, 0), 2),
          updated_at = now()
      where id = v_existing_session.id
      returning * into v_existing_session;
    end if;

    return jsonb_build_object(
      'session_id', v_existing_session.id,
      'branch_id', v_existing_session.branch_id,
      'cash_register_id', v_existing_session.cash_register_id,
      'opening_cash', v_existing_session.opening_cash,
      'opened_by', v_existing_session.opened_by,
      'opened_at', v_existing_session.opened_at,
      'already_open', true
    );
  end if;

  v_register_id := p_cash_register_id;

  if v_register_id is not null then
    if exists (
      select 1 from public.cash_registers
      where id = v_register_id and organization_id = v_branch.organization_id and branch_id = v_branch.id
    ) then
      update public.cash_registers set active = true where id = v_register_id and not active;
    else
      v_register_id := null;
    end if;
  end if;

  if v_register_id is null then
    select id into v_register_id
    from public.cash_registers
    where organization_id = v_branch.organization_id
      and branch_id = v_branch.id
      and assigned_advisor_id = v_target_user
    order by active desc, created_at desc
    limit 1;

    if v_register_id is not null then
      update public.cash_registers set active = true where id = v_register_id and not active;
    else
      v_reg_name := coalesce(nullif(trim(p_register_name), ''), 'Caja ' || v_branch.name);
      if exists (
        select 1 from public.cash_registers
        where organization_id = v_branch.organization_id
          and branch_id = v_branch.id
          and lower(name) = lower(v_reg_name)
          and active
      ) then
        v_reg_name := v_reg_name || ' ' || left(replace(v_target_user::text, '-', ''), 4);
      end if;

      insert into public.cash_registers (
        organization_id, branch_id, name, assigned_advisor_id, active, created_by
      ) values (
        v_branch.organization_id, v_branch.id, v_reg_name, v_target_user, true, v_caller
      ) returning id into v_register_id;
    end if;
  end if;

  if v_register_id is not null and exists (
    select 1 from public.cash_sessions
    where organization_id = v_branch.organization_id
      and cash_register_id = v_register_id
      and status = 'open'
  ) then
    v_register_id := null;
  end if;

  insert into public.cash_sessions (
    organization_id, branch_id, cash_register_id, opened_by,
    opening_cash, status, opened_at, closing_denominations
  ) values (
    v_branch.organization_id,
    v_branch.id,
    v_register_id,
    v_target_user,
    round(greatest(coalesce(p_opening_cash, 0), 0), 2),
    'open',
    now(),
    '{}'::jsonb
  ) returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'branch_id', v_session.branch_id,
    'cash_register_id', v_session.cash_register_id,
    'opening_cash', v_session.opening_cash,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'already_open', false
  );
end;
$$;
revoke all on function public.open_pos_cash_session(uuid, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.open_pos_cash_session(uuid, numeric, text, uuid, uuid) to authenticated;

-- ============================================================================
-- 4. RPC 2: MOVIMIENTOS DE CAJA CORREGIDOS Y EDITABLES
-- ============================================================================

-- Reemplazar record_cash_session_movement
create or replace function public.record_cash_session_movement(
  p_session uuid,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_s public.cash_sessions%rowtype;
  v_id uuid;
  v_user uuid := (select auth.uid());
begin
  if v_user is null or p_direction not in ('in', 'out') or p_amount is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) < 3 or length(trim(coalesce(p_key, ''))) < 12 then
    raise exception 'Revisa tipo, monto, motivo y clave.' using errcode = '22023';
  end if;

  select * into v_s from public.cash_sessions where id = p_session for update;
  if not found or v_s.status <> 'open' then
    raise exception 'La caja ya está cerrada o no existe.' using errcode = '22023';
  end if;

  if v_s.opened_by = v_user then
    if not (
      app_private.has_visualcorp_access(v_s.organization_id, 'sales', 'edit', v_s.branch_id)
      or app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id)
    ) then
      raise exception 'No tienes permiso para registrar movimientos en esta caja.' using errcode = '42501';
    end if;
  else
    if not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
      raise exception 'Los movimientos manuales en turnos de otros usuarios requieren autorización administrativa.' using errcode = '42501';
    end if;
  end if;

  insert into public.cash_session_movements (
    organization_id, session_id, direction, amount, reason, idempotency_key, created_by
  ) values (
    v_s.organization_id, v_s.id, p_direction, round(p_amount, 2), left(trim(p_reason), 500), trim(p_key), v_user
  )
  on conflict (organization_id, idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_cash_session_movement(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.record_cash_session_movement(uuid, text, numeric, text, text) to authenticated;

-- Edición de movimiento de caja
create or replace function public.update_cash_session_movement(
  p_movement_id uuid,
  p_direction text,
  p_amount numeric,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_m public.cash_session_movements%rowtype;
  v_s public.cash_sessions%rowtype;
  v_prev_state jsonb;
  v_expected numeric(14,2);
  v_movements_in numeric(14,2);
  v_movements_out numeric(14,2);
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_direction not in ('in', 'out') or p_amount is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Revisa tipo (in/out), monto (>0) y motivo (mínimo 3 caracteres).' using errcode = '22023';
  end if;

  select * into v_m from public.cash_session_movements where id = p_movement_id for update;
  if not found then
    raise exception 'El movimiento no existe.' using errcode = '22023';
  end if;
  if coalesce(v_m.voided, false) then
    raise exception 'No se puede editar un movimiento anulado.' using errcode = '22023';
  end if;

  select * into v_s from public.cash_sessions where id = v_m.session_id for update;
  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if v_s.status = 'open' then
    if v_s.opened_by = v_user then
      if not (
        app_private.has_visualcorp_access(v_s.organization_id, 'sales', 'edit', v_s.branch_id)
        or app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id)
      ) then
        raise exception 'No tienes permiso para editar movimientos en esta caja.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
        raise exception 'Modificar movimientos de otros usuarios requiere autorización administrativa.' using errcode = '42501';
      end if;
    end if;
  else
    if not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
      raise exception 'Modificar movimientos de un turno cerrado requiere autorización administrativa.' using errcode = '42501';
    end if;
  end if;

  v_prev_state := to_jsonb(v_m);

  update public.cash_session_movements
  set direction = p_direction,
      amount = round(p_amount, 2),
      reason = left(trim(p_reason), 500),
      updated_at = now()
  where id = v_m.id
  returning * into v_m;

  insert into public.cash_session_audits (
    organization_id,
    session_id,
    action,
    reason,
    previous_state,
    new_state,
    created_by
  ) values (
    v_s.organization_id,
    v_s.id,
    'update_movement',
    'Edición de movimiento: ' || left(trim(p_reason), 200),
    v_prev_state,
    to_jsonb(v_m),
    v_user
  );

  if v_s.status = 'closed' then
    select
      coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
      coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    into v_movements_in, v_movements_out
    from public.cash_session_movements
    where session_id = v_s.id and not coalesce(voided, false);

    select v_s.opening_cash
      + (v_movements_in - v_movements_out)
      + coalesce((
        select sum(amount)
        from public.sale_payments
        where cash_session_id = v_s.id and method = 'cash'
      ), 0)
    into v_expected;

    update public.cash_sessions
    set expected_cash = round(v_expected, 2),
        difference = round(counted_cash - v_expected, 2),
        updated_at = now()
    where id = v_s.id
    returning * into v_s;
  end if;

  return jsonb_build_object(
    'movement_id', v_m.id,
    'session_id', v_s.id,
    'direction', v_m.direction,
    'amount', v_m.amount,
    'reason', v_m.reason,
    'session_status', v_s.status,
    'expected_cash', v_s.expected_cash,
    'difference', v_s.difference
  );
end;
$$;
revoke all on function public.update_cash_session_movement(uuid, text, numeric, text) from public, anon;
grant execute on function public.update_cash_session_movement(uuid, text, numeric, text) to authenticated;

-- Anulación de movimiento de caja
create or replace function public.void_cash_session_movement(
  p_movement_id uuid,
  p_reason text default 'Anulado por usuario'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_m public.cash_session_movements%rowtype;
  v_s public.cash_sessions%rowtype;
  v_prev_state jsonb;
  v_expected numeric(14,2);
  v_movements_in numeric(14,2);
  v_movements_out numeric(14,2);
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_m from public.cash_session_movements where id = p_movement_id for update;
  if not found then
    raise exception 'El movimiento no existe.' using errcode = '22023';
  end if;
  if coalesce(v_m.voided, false) then
    raise exception 'El movimiento ya está anulado.' using errcode = '22023';
  end if;

  select * into v_s from public.cash_sessions where id = v_m.session_id for update;
  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if v_s.status = 'open' then
    if v_s.opened_by = v_user then
      if not (
        app_private.has_visualcorp_access(v_s.organization_id, 'sales', 'edit', v_s.branch_id)
        or app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id)
      ) then
        raise exception 'No tienes permiso para anular movimientos en esta caja.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
        raise exception 'Anular movimientos de otros usuarios requiere autorización administrativa.' using errcode = '42501';
      end if;
    end if;
  else
    if not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
      raise exception 'Anular movimientos de un turno cerrado requiere autorización administrativa.' using errcode = '42501';
    end if;
  end if;

  v_prev_state := to_jsonb(v_m);

  update public.cash_session_movements
  set voided = true,
      voided_at = now(),
      voided_by = v_user,
      void_reason = coalesce(nullif(trim(p_reason), ''), 'Anulado por usuario'),
      updated_at = now()
  where id = v_m.id
  returning * into v_m;

  insert into public.cash_session_audits (
    organization_id,
    session_id,
    action,
    reason,
    previous_state,
    new_state,
    created_by
  ) values (
    v_s.organization_id,
    v_s.id,
    'void_movement',
    coalesce(nullif(trim(p_reason), ''), 'Anulado por usuario'),
    v_prev_state,
    to_jsonb(v_m),
    v_user
  );

  if v_s.status = 'closed' then
    select
      coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
      coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    into v_movements_in, v_movements_out
    from public.cash_session_movements
    where session_id = v_s.id and not coalesce(voided, false);

    select v_s.opening_cash
      + (v_movements_in - v_movements_out)
      + coalesce((
        select sum(amount)
        from public.sale_payments
        where cash_session_id = v_s.id and method = 'cash'
      ), 0)
    into v_expected;

    update public.cash_sessions
    set expected_cash = round(v_expected, 2),
        difference = round(counted_cash - v_expected, 2),
        updated_at = now()
    where id = v_s.id
    returning * into v_s;
  end if;

  return jsonb_build_object(
    'movement_id', v_m.id,
    'session_id', v_s.id,
    'voided', true,
    'void_reason', v_m.void_reason,
    'session_status', v_s.status,
    'expected_cash', v_s.expected_cash,
    'difference', v_s.difference
  );
end;
$$;
revoke all on function public.void_cash_session_movement(uuid, text) from public, anon;
grant execute on function public.void_cash_session_movement(uuid, text) to authenticated;

-- ============================================================================
-- 5. RPC 3: CIERRE MEJORADO, EDICIÓN DE TURNO Y REAPERTURA
-- ============================================================================

-- Eliminar firmas anteriores de close_cash_session para evitar ambigüedades
drop function if exists public.close_cash_session(uuid, numeric, text);
drop function if exists public.close_cash_session(uuid, numeric, text, jsonb);

create or replace function public.close_cash_session(
  p_session uuid,
  p_counted_cash numeric,
  p_note text default '',
  p_denominations jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_expected numeric(14,2);
  v_user uuid := (select auth.uid());
  v_movements_in numeric(14,2) := 0;
  v_movements_out numeric(14,2) := 0;
  v_cash_sales numeric(14,2) := 0;
  v_transfer_sales numeric(14,2) := 0;
  v_card_sales numeric(14,2) := 0;
  v_other_sales numeric(14,2) := 0;
begin
  if v_user is null or (p_counted_cash is not null and p_counted_cash < 0) then
    raise exception 'Revisa sesión y efectivo contado.' using errcode = '22023';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session
  for update;

  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if p_counted_cash is null then
    if not (
      (v_session.opened_by = v_user and app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id))
      or app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
      or app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'view', v_session.branch_id)
    ) then
      raise exception 'No tienes permiso para consultar el balance de esta caja.' using errcode = '42501';
    end if;
  else
    if v_session.status <> 'open' then
      raise exception 'La caja ya está cerrada o no existe.' using errcode = '22023';
    end if;
    if not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
      and (
        v_session.opened_by <> v_user
        or not app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id)
      ) then
      raise exception 'No tienes permiso para cerrar esta caja.' using errcode = '42501';
    end if;
  end if;

  -- Sumar únicamente movimientos activos no anulados
  select
    coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
  into v_movements_in, v_movements_out
  from public.cash_session_movements
  where session_id = v_session.id
    and not coalesce(voided, false);

  select v_session.opening_cash
    + (v_movements_in - v_movements_out)
    + coalesce((
      select sum(amount)
      from public.sale_payments
      where cash_session_id = v_session.id and method = 'cash'
    ), 0)
  into v_expected;

  -- Desglose financiero de ventas para el turno
  select
    coalesce(sum(case when sp.method = 'cash' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method = 'transfer' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method = 'card' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method not in ('cash', 'transfer', 'card') then sp.amount else 0 end), 0)
  into v_cash_sales, v_transfer_sales, v_card_sales, v_other_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id and s.organization_id = sp.organization_id
  where sp.organization_id = v_session.organization_id
    and s.branch_id = v_session.branch_id
    and (
      sp.cash_session_id = v_session.id
      or (
        sp.created_by = v_session.opened_by
        and sp.created_at >= v_session.opened_at
        and sp.created_at <= coalesce(v_session.closed_at, now())
      )
    );

  if p_counted_cash is null then
    return jsonb_build_object(
      'session_id', v_session.id,
      'expected_cash', round(v_expected, 2),
      'counted_cash', v_session.counted_cash,
      'difference', v_session.difference,
      'preview', true,
      'opening_cash', round(v_session.opening_cash, 2),
      'movements_in', round(v_movements_in, 2),
      'movements_out', round(v_movements_out, 2),
      'cash_sales_total', round(v_cash_sales, 2),
      'transfer_sales_total', round(v_transfer_sales, 2),
      'card_sales_total', round(v_card_sales, 2),
      'other_sales_total', round(v_other_sales, 2),
      'closing_denominations', v_session.closing_denominations
    );
  end if;

  update public.cash_sessions
  set status = 'closed',
      closed_by = v_user,
      closed_at = now(),
      counted_cash = round(p_counted_cash, 2),
      expected_cash = round(v_expected, 2),
      difference = round(p_counted_cash - v_expected, 2),
      closing_note = left(coalesce(p_note, ''), 1000),
      closing_denominations = coalesce(p_denominations, '{}'::jsonb),
      updated_at = now()
  where id = v_session.id;

  insert into public.cash_session_audits (
    organization_id,
    session_id,
    action,
    reason,
    previous_state,
    new_state,
    created_by
  ) values (
    v_session.organization_id,
    v_session.id,
    'close_session',
    coalesce(nullif(trim(p_note), ''), 'Cierre de caja'),
    to_jsonb(v_session),
    jsonb_build_object(
      'counted_cash', round(p_counted_cash, 2),
      'expected_cash', round(v_expected, 2),
      'difference', round(p_counted_cash - v_expected, 2),
      'denominations', coalesce(p_denominations, '{}'::jsonb)
    ),
    v_user
  );

  return jsonb_build_object(
    'session_id', v_session.id,
    'expected_cash', round(v_expected, 2),
    'counted_cash', round(p_counted_cash, 2),
    'difference', round(p_counted_cash - v_expected, 2),
    'opening_cash', round(v_session.opening_cash, 2),
    'movements_in', round(v_movements_in, 2),
    'movements_out', round(v_movements_out, 2),
    'cash_sales_total', round(v_cash_sales, 2),
    'transfer_sales_total', round(v_transfer_sales, 2),
    'card_sales_total', round(v_card_sales, 2),
    'other_sales_total', round(v_other_sales, 2)
  );
end;
$$;
revoke all on function public.close_cash_session(uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, text, jsonb) to authenticated;

-- Edición de datos del turno de caja
create or replace function public.update_cash_session_details(
  p_session uuid,
  p_opening_cash numeric default null,
  p_cash_register_id uuid default null,
  p_opened_by uuid default null,
  p_counted_cash numeric default null,
  p_closing_note text default null,
  p_reason text default 'Ajuste de caja'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_prev_state jsonb;
  v_expected numeric(14,2);
  v_movements_in numeric(14,2);
  v_movements_out numeric(14,2);
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session
  for update;

  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id) then
    if not (
      v_session.status = 'open'
      and v_session.opened_by = v_user
      and app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id)
    ) then
      raise exception 'No tienes permiso para modificar los datos de esta caja.' using errcode = '42501';
    end if;
  end if;

  v_prev_state := to_jsonb(v_session);

  if p_opening_cash is not null then
    v_session.opening_cash := round(greatest(p_opening_cash, 0), 2);
  end if;

  if p_cash_register_id is not null then
    if not exists (
      select 1 from public.cash_registers
      where id = p_cash_register_id
        and organization_id = v_session.organization_id
        and branch_id = v_session.branch_id
    ) then
      raise exception 'La caja registradora no pertenece a esta sucursal o no existe.' using errcode = '22023';
    end if;
    v_session.cash_register_id := p_cash_register_id;
  end if;

  if p_opened_by is not null and p_opened_by <> v_session.opened_by then
    if not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id) then
      raise exception 'Transferir la autoría del turno requiere autorización administrativa.' using errcode = '42501';
    end if;
    v_session.opened_by := p_opened_by;
  end if;

  if v_session.status = 'closed' then
    if p_counted_cash is not null then
      if p_counted_cash < 0 then
        raise exception 'El efectivo contado no puede ser negativo.' using errcode = '22023';
      end if;
      v_session.counted_cash := round(p_counted_cash, 2);
    end if;

    if p_closing_note is not null then
      v_session.closing_note := left(trim(p_closing_note), 1000);
    end if;

    select
      coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
      coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    into v_movements_in, v_movements_out
    from public.cash_session_movements
    where session_id = v_session.id and not coalesce(voided, false);

    select v_session.opening_cash
      + (v_movements_in - v_movements_out)
      + coalesce((
        select sum(amount)
        from public.sale_payments
        where cash_session_id = v_session.id and method = 'cash'
      ), 0)
    into v_expected;

    v_session.expected_cash := round(v_expected, 2);
    v_session.difference := round(v_session.counted_cash - v_expected, 2);
  end if;

  update public.cash_sessions
  set opening_cash = v_session.opening_cash,
      cash_register_id = v_session.cash_register_id,
      opened_by = v_session.opened_by,
      counted_cash = v_session.counted_cash,
      expected_cash = v_session.expected_cash,
      difference = v_session.difference,
      closing_note = v_session.closing_note,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.cash_session_audits (
    organization_id,
    session_id,
    action,
    reason,
    previous_state,
    new_state,
    created_by
  ) values (
    v_session.organization_id,
    v_session.id,
    'update_details',
    coalesce(nullif(trim(p_reason), ''), 'Ajuste de caja'),
    v_prev_state,
    to_jsonb(v_session),
    v_user
  );

  return jsonb_build_object(
    'session_id', v_session.id,
    'branch_id', v_session.branch_id,
    'cash_register_id', v_session.cash_register_id,
    'status', v_session.status,
    'opening_cash', v_session.opening_cash,
    'opened_by', v_session.opened_by,
    'counted_cash', v_session.counted_cash,
    'expected_cash', v_session.expected_cash,
    'difference', v_session.difference,
    'closing_note', v_session.closing_note,
    'updated_at', v_session.updated_at
  );
end;
$$;
revoke all on function public.update_cash_session_details(uuid, numeric, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.update_cash_session_details(uuid, numeric, uuid, uuid, numeric, text, text) to authenticated;

-- Reapertura de turno de caja cerrado
create or replace function public.reopen_cash_session(
  p_session uuid,
  p_reason text default 'Reapertura de turno'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_prev_state jsonb;
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session
  for update;

  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if v_session.status <> 'closed' then
    raise exception 'Solo se pueden reabrir turnos cerrados.' using errcode = '22023';
  end if;

  if not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
    and (
      v_session.opened_by <> v_user
      or not app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id)
    ) then
    raise exception 'No tienes permiso para reabrir esta caja.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cash_sessions
    where organization_id = v_session.organization_id
      and branch_id = v_session.branch_id
      and opened_by = v_session.opened_by
      and status = 'open'
      and id <> v_session.id
  ) then
    raise exception 'El usuario ya tiene otro turno abierto en esta sucursal. Ciérralo antes de reabrir este.' using errcode = '55000';
  end if;

  if v_session.cash_register_id is not null and exists (
    select 1 from public.cash_sessions
    where organization_id = v_session.organization_id
      and cash_register_id = v_session.cash_register_id
      and status = 'open'
      and id <> v_session.id
  ) then
    raise exception 'La caja registradora ya tiene otro turno abierto actualmente.' using errcode = '55000';
  end if;

  v_prev_state := to_jsonb(v_session);

  update public.cash_sessions
  set status = 'open',
      closed_at = null,
      closed_by = null,
      counted_cash = null,
      expected_cash = null,
      difference = null,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.cash_session_audits (
    organization_id,
    session_id,
    action,
    reason,
    previous_state,
    new_state,
    created_by
  ) values (
    v_session.organization_id,
    v_session.id,
    'reopen_session',
    coalesce(nullif(trim(p_reason), ''), 'Reapertura de turno'),
    v_prev_state,
    to_jsonb(v_session),
    v_user
  );

  return jsonb_build_object(
    'session_id', v_session.id,
    'branch_id', v_session.branch_id,
    'cash_register_id', v_session.cash_register_id,
    'status', v_session.status,
    'opening_cash', v_session.opening_cash,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'reopened', true
  );
end;
$$;
revoke all on function public.reopen_cash_session(uuid, text) from public, anon;
grant execute on function public.reopen_cash_session(uuid, text) to authenticated;

-- ============================================================================
-- 6. RPC 4: EDICIÓN TOTAL POST-VENTA (amend_confirmed_pos_sale)
-- ============================================================================

create or replace function public.amend_confirmed_pos_sale(
  p_sale_id uuid,
  p_customer_id uuid default null,
  p_customer_data jsonb default null,
  p_discount numeric default 0,
  p_discount_reason text default '',
  p_note text default '',
  p_lines jsonb default '[]'::jsonb,
  p_payments jsonb default null,
  p_amendment_reason text default 'Edición de orden POS'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_customer uuid;
  v_cust_name text;
  v_cust_phone text;
  v_cust_email text;
  v_cust_doc text;
  v_cust_notes text;
  v_new_status text;
  v_prev_snapshot jsonb;
  v_new_snapshot jsonb;
  v_financial_delta numeric(14,2);
  v_old_line record;
  v_line jsonb;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_disc_reason text;
  v_tax_rate numeric(7,4);
  v_tax_amount numeric(14,2) := 0;
  v_shipping numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_backorder_total numeric(14,3) := 0;
  v_variant uuid;
  v_product text;
  v_location text;
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_payment jsonb;
  v_p_amount numeric(14,2);
  v_p_method text;
  v_p_session uuid;
  v_prev_cash_session uuid;
  v_current_open_session uuid;
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La orden POS no existe.' using errcode = '22023';
  end if;

  if not (
    app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit', v_sale.branch_id)
    or app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit')
  ) then
    raise exception 'No tienes permiso para editar ventas en esta sucursal.' using errcode = '42501';
  end if;

  -- Capturar snapshot previo
  perform set_config('app.pos_rpc_bypass', 'true', true);
  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id
    ), '[]'::jsonb)
  ) into v_prev_snapshot;

  -- Manejo del cliente
  v_customer := coalesce(p_customer_id, v_sale.customer_id);

  if p_customer_data is not null and jsonb_typeof(p_customer_data) = 'object' then
    v_cust_name := nullif(trim(p_customer_data->>'full_name'), '');
    if v_cust_name is not null then
      v_cust_phone := coalesce(trim(p_customer_data->>'phone'), '');
      v_cust_email := coalesce(trim(p_customer_data->>'email'), '');
      v_cust_doc := coalesce(trim(p_customer_data->>'document_reference'), '');
      v_cust_notes := coalesce(trim(p_customer_data->>'notes'), '');

      if v_customer is not null and exists (
        select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
      ) then
        update public.customers
        set full_name = v_cust_name,
            phone = case when v_cust_phone <> '' then v_cust_phone else phone end,
            email = case when v_cust_email <> '' then v_cust_email else email end,
            document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
            notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
            updated_at = now()
        where id = v_customer and organization_id = v_sale.organization_id;
      else
        if v_cust_phone <> '' then
          select id into v_customer
          from public.customers
          where organization_id = v_sale.organization_id and phone = v_cust_phone
          limit 1;
        end if;
        if v_customer is null then
          insert into public.customers (
            organization_id, full_name, phone, email, document_reference, notes, created_by
          ) values (
            v_sale.organization_id, v_cust_name, v_cust_phone, v_cust_email, v_cust_doc, v_cust_notes, v_user
          ) returning id into v_customer;
        else
          update public.customers
          set full_name = v_cust_name,
              email = case when v_cust_email <> '' then v_cust_email else email end,
              document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
              notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
              updated_at = now()
          where id = v_customer and organization_id = v_sale.organization_id;
        end if;
      end if;
    end if;
  end if;

  if v_customer is not null and not exists (
    select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
  ) then
    raise exception 'El cliente seleccionado no pertenece a Visual Corp.' using errcode = '22023';
  end if;

  -- Reactivar venta si estaba cancelada
  v_new_status := case when v_sale.status = 'cancelled' then 'confirmed' else v_sale.status end;

  -- Reemplazo de líneas y reversión de inventario
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    -- Revertir stock de líneas anteriores
    for v_old_line in
      select * from public.sale_lines where sale_id = v_sale.id
    loop
      if v_old_line.variant_id is not null and v_old_line.fulfilled_quantity > 0 then
        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_old_line.variant_id,
          v_sale.branch_id,
          'MAIN',
          'adjustment',
          v_old_line.fulfilled_quantity,
          'Reversión por edición POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          'sale',
          v_sale.id,
          v_user
        );
      end if;
    end loop;

    -- Eliminar líneas antiguas (las tablas dependientes tienen ON DELETE CASCADE)
    delete from public.production_jobs where sale_id = v_sale.id;
    delete from public.sale_lines where sale_id = v_sale.id;

    -- Calcular subtotales de las nuevas líneas
    v_subtotal := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      if v_quantity is null or v_quantity <= 0 or v_price is null or v_price < 0 then
        raise exception 'Cantidad o precio inválido en artículo o servicio.' using errcode = '22023';
      end if;
      v_subtotal := v_subtotal + round(v_quantity * v_price, 2);
    end loop;

    v_discount := round(coalesce(p_discount, 0), 2);
    if v_discount < 0 then
      raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
    end if;
    if v_discount > v_subtotal then
      raise exception 'El descuento supera el subtotal.' using errcode = '22023';
    end if;

    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);

    v_backorder_total := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      v_product := nullif(trim(v_line->>'catalog_product_id'), '');
      v_variant := nullif(trim(v_line->>'variant_id'), '')::uuid;
      v_location := coalesce(nullif(trim(v_line->>'location_code'), ''), 'MAIN');

      if v_variant is null and v_product is not null then
        select l.inventory_variant_id, l.location_code into v_variant, v_location
        from public.catalog_inventory_links l
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active;
        if not found then v_variant := null; v_location := 'MAIN'; end if;
      end if;

      v_fulfilled := v_quantity;
      v_backordered := 0;

      if v_variant is not null then
        perform 1 from public.inventory_variants where id = v_variant and organization_id = v_sale.organization_id for update;
        select coalesce(sum(quantity), 0) into v_available
        from public.inventory_stock
        where organization_id = v_sale.organization_id
          and variant_id = v_variant
          and branch_id = v_sale.branch_id
          and location_code = v_location;

        if v_available < v_quantity then
          v_fulfilled := greatest(v_available, 0);
          v_backordered := v_quantity - v_fulfilled;
          v_backorder_total := v_backorder_total + v_backordered;
        end if;
      end if;

      insert into public.sale_lines (
        organization_id, sale_id, variant_id, catalog_product_id, client_line_key,
        sku_snapshot, description_snapshot, quantity, fulfilled_quantity, backordered_quantity,
        unit_price, line_total
      ) values (
        v_sale.organization_id,
        v_sale.id,
        v_variant,
        v_product,
        nullif(trim(v_line->>'line_key'), ''),
        coalesce(v_line->>'sku', ''),
        coalesce(nullif(trim(v_line->>'description'), ''), 'Orden POS'),
        v_quantity,
        v_fulfilled,
        v_backordered,
        v_price,
        round(v_quantity * v_price, 2)
      );

      if v_variant is not null and v_fulfilled > 0 then
        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_variant,
          v_sale.branch_id,
          v_location,
          'sale',
          -v_fulfilled,
          'Orden POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          'sale',
          v_sale.id,
          v_user
        );
      end if;
    end loop;
  else
    v_subtotal := v_sale.subtotal;
    v_discount := round(coalesce(p_discount, v_sale.discount_total), 2);
    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);
    v_backorder_total := case when v_sale.urgent_backorder then 1 else 0 end;
  end if;

  -- Reemplazo de pagos
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    select cash_session_id into v_prev_cash_session
    from public.sale_payments
    where sale_id = v_sale.id and method = 'cash' and cash_session_id is not null
    order by created_at asc
    limit 1;

    select id into v_current_open_session
    from public.cash_sessions
    where organization_id = v_sale.organization_id
      and branch_id = v_sale.branch_id
      and opened_by = v_user
      and status = 'open'
    order by opened_at desc
    limit 1;

    delete from public.sale_payments where sale_id = v_sale.id;

    for v_payment in select value from jsonb_array_elements(p_payments) loop
      v_p_amount := round(coalesce(nullif(v_payment->>'amount', '')::numeric, 0), 2);
      if v_p_amount > 0 then
        v_p_method := coalesce(v_payment->>'method', 'other');
        if v_p_method not in ('cash', 'transfer', 'card', 'other') then
          v_p_method := 'other';
        end if;
        v_p_session := null;
        if v_p_method = 'cash' then
          v_p_session := nullif(trim(v_payment->>'cash_session_id'), '')::uuid;
          if v_p_session is null then
            v_p_session := v_current_open_session;
          end if;
          if v_p_session is null then
            v_p_session := v_prev_cash_session;
          end if;
        end if;

        insert into public.sale_payments (
          organization_id, sale_id, method, amount, reference, note, created_by, cash_session_id
        ) values (
          v_sale.organization_id,
          v_sale.id,
          v_p_method,
          v_p_amount,
          coalesce(v_payment->>'reference', ''),
          coalesce(v_payment->>'note', ''),
          v_user,
          v_p_session
        );
      end if;
    end loop;
  end if;

  v_financial_delta := v_total - v_sale.total;

  v_disc_reason := trim(coalesce(p_discount_reason, ''));
  if v_disc_reason = '' then
    v_disc_reason := v_sale.discount_reason;
  end if;
  if v_discount > 0 and v_disc_reason = '' then
    v_disc_reason := 'Descuento autorizado en POS';
  end if;

  update public.sales
  set customer_id = v_customer,
      status = v_new_status,
      subtotal = v_subtotal,
      discount_total = v_discount,
      discount_reason = left(v_disc_reason, 300),
      tax_amount = v_tax_amount,
      total = v_total,
      note = coalesce(nullif(trim(p_note), ''), note),
      payment_method = coalesce((select min(method) from public.sale_payments where sale_id = v_sale.id), payment_method),
      urgent_backorder = (v_backorder_total > 0),
      updated_at = now()
  where id = v_sale.id
  returning * into v_sale;

  -- Capturar nuevo snapshot
  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id
    ), '[]'::jsonb)
  ) into v_new_snapshot;

  insert into public.sale_amendments (
    organization_id, sale_id, reason, previous_snapshot, new_snapshot,
    financial_delta, created_by
  ) values (
    v_sale.organization_id,
    v_sale.id,
    coalesce(nullif(trim(p_amendment_reason), ''), 'Edición de orden POS'),
    v_prev_snapshot,
    v_new_snapshot,
    v_financial_delta,
    v_user
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_code', v_sale.sale_code,
    'status', v_sale.status,
    'customer_id', v_sale.customer_id,
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount_total,
    'discount_reason', v_sale.discount_reason,
    'tax_rate', v_sale.tax_rate,
    'tax_amount', v_sale.tax_amount,
    'total', v_sale.total,
    'financial_delta', v_financial_delta,
    'updated_at', v_sale.updated_at
  );
end;
$$;
revoke all on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) to authenticated;
