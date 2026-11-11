insert into public.access_profile_permissions (profile_id, module_key, action_key, enabled, updated_at)
select ap.id, perm.module_key, perm.action_key, true, now()
from public.access_profiles ap
cross join (
  values
    ('cash', 'view'),
    ('cash', 'edit'),
    ('cash', 'manage_cash'),
    ('cash', 'delete_records'),
    ('sales', 'view'),
    ('sales', 'edit'),
    ('sales', 'settle_refund'),
    ('sales', 'delete_records'),
    ('quotes', 'delete_records')
) as perm(module_key, action_key)
where ap.profile_key in ('owner', 'admin', 'encargado_local', 'gerencia')
on conflict (profile_id, module_key, action_key)
do update set enabled = true, updated_at = now();

alter policy cash_registers_access_insert
  on public.cash_registers
  with check (
    (created_by = (select auth.uid()))
    and (
      (
        assigned_advisor_id = (select auth.uid())
        and app_private.has_org_role(organization_id, branch_id, array['advisor'])
        and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
      )
      or (
        app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
        and (
          app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
          or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
        )
      )
    )
  );

alter policy cash_register_weekly_goals_access_insert
  on public.cash_register_weekly_goals
  with check (
    created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and week_start >= (date_trunc('week', timezone('America/Guayaquil', now())))::date
    and exists (
      select 1
      from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and register.active
        and (
          (
            app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
            and (
              app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
              or app_private.has_visualcorp_access(register.organization_id, 'cash', 'manage_cash', register.branch_id)
            )
          )
          or (
            register.assigned_advisor_id = (select auth.uid())
            and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
            and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
          )
        )
    )
  );

alter policy cash_register_weekly_goals_access_update
  on public.cash_register_weekly_goals
  using (
    exists (
      select 1
      from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and (
          (
            app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
            and (
              app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
              or app_private.has_visualcorp_access(register.organization_id, 'cash', 'manage_cash', register.branch_id)
            )
          )
          or (
            register.assigned_advisor_id = (select auth.uid())
            and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
            and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
          )
        )
    )
  )
  with check (
    updated_by = (select auth.uid())
    and week_start >= (date_trunc('week', timezone('America/Guayaquil', now())))::date
    and exists (
      select 1
      from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and register.active
        and (
          (
            app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
            and (
              app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
              or app_private.has_visualcorp_access(register.organization_id, 'cash', 'manage_cash', register.branch_id)
            )
          )
          or (
            register.assigned_advisor_id = (select auth.uid())
            and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
            and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
          )
        )
    )
  );

create index if not exists admin_deletion_audits_org_idx
  on public.admin_deletion_audits(organization_id, created_at desc);

alter table public.admin_deletion_audits enable row level security;

create policy admin_deletion_audits_select
  on public.admin_deletion_audits
  for select
  to authenticated
  using (
    app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
    or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
  );

grant select on public.admin_deletion_audits to authenticated;

create or replace function public.list_visualcorp_cash_register_advisors(p_branch_id uuid)
returns table(user_id uuid, role text, full_name text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  select organization.id into v_org
  from public.organizations organization
  where organization.slug = 'visual-corp'
  limit 1;

  if v_org is null or auth.uid() is null
    or not (
      app_private.has_visualcorp_access(v_org, 'finance', 'manage_finance', p_branch_id)
      or app_private.has_visualcorp_access(v_org, 'cash', 'manage_cash', p_branch_id)
    ) then
    raise exception 'No tienes permiso para consultar las asesoras habilitadas para esta sucursal.' using errcode = '42501';
  end if;

  if p_branch_id is null or not exists (
    select 1 from public.branches branch
    where branch.id = p_branch_id and branch.organization_id = v_org and branch.active
  ) then
    raise exception 'La sucursal no existe o está inactiva.' using errcode = '22023';
  end if;

  return query
    select distinct on (membership.user_id)
      membership.user_id,
      membership.role,
      coalesce(nullif(trim(profile.full_name), ''), 'Usuario ' || left(membership.user_id::text, 8))
    from public.organization_memberships membership
    left join public.profiles profile on profile.user_id = membership.user_id
    where membership.organization_id = v_org
      and membership.active
      and membership.role in ('advisor', 'owner', 'admin', 'manager')
      and (membership.branch_id is null or membership.branch_id = p_branch_id)
      and exists (
        select 1
        from public.access_profiles access_profile
        where access_profile.id = coalesce(membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = membership.organization_id
            and legacy.profile_key = case membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else membership.role
            end
          limit 1
        ))
          and access_profile.organization_id = membership.organization_id
          and access_profile.active
      )
    order by membership.user_id, (membership.branch_id = p_branch_id) desc, membership.created_at desc;
end;
$$;

create or replace function app_private.recalculate_closed_cash_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_movements_in numeric(14,2) := 0;
  v_movements_out numeric(14,2) := 0;
  v_cash_sales numeric(14,2) := 0;
  v_expected numeric(14,2) := 0;
begin
  if p_session_id is null then
    return false;
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'closed' then
    return false;
  end if;

  select
    coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
  into v_movements_in, v_movements_out
  from public.cash_session_movements
  where session_id = v_session.id
    and not coalesce(voided, false);

  select coalesce(sum(amount), 0)
  into v_cash_sales
  from public.sale_payments
  where cash_session_id = v_session.id
    and method = 'cash';

  v_expected := round(v_session.opening_cash + (v_movements_in - v_movements_out) + v_cash_sales, 2);

  update public.cash_sessions
  set expected_cash = v_expected,
      difference = round(coalesce(counted_cash, 0) - v_expected, 2),
      updated_at = now()
  where id = v_session.id;

  return true;
end;
$$;

create or replace function public.update_cash_register_control(
  p_register_id uuid,
  p_name text,
  p_branch_id uuid,
  p_assigned_advisor_id uuid default null,
  p_active boolean default true,
  p_week_start date default null,
  p_goal_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_register public.cash_registers%rowtype;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_user is null then
    raise exception 'Inicia sesión para gestionar cajas registradoras.' using errcode = '42501';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_register_id
  for update;

  if not found then
    raise exception 'La caja registradora no existe.' using errcode = '22023';
  end if;

  if not (
    app_private.has_org_role(v_register.organization_id, v_register.branch_id, array['owner', 'admin', 'manager'])
    and (
      app_private.has_visualcorp_access(v_register.organization_id, 'cash', 'manage_cash', v_register.branch_id)
      or app_private.has_visualcorp_access(v_register.organization_id, 'finance', 'manage_finance', v_register.branch_id)
    )
  ) then
    raise exception 'No tienes permiso para editar esta caja registradora.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Ingresa un nombre válido para la caja.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.organization_id = v_register.organization_id and b.active
  ) then
    raise exception 'La sucursal seleccionada no existe o está inactiva.' using errcode = '22023';
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  update public.cash_registers
  set name = v_name,
      branch_id = p_branch_id,
      assigned_advisor_id = p_assigned_advisor_id,
      active = coalesce(p_active, true)
  where id = v_register.id
  returning * into v_register;

  if p_week_start is not null and p_goal_amount is not null then
    if p_goal_amount < 0 then
      raise exception 'La meta semanal no puede ser negativa.' using errcode = '22023';
    end if;
    insert into public.cash_register_weekly_goals (
      organization_id, cash_register_id, week_start, goal_amount, created_by, updated_by
    ) values (
      v_register.organization_id, v_register.id, p_week_start, round(p_goal_amount, 2), v_user, v_user
    )
    on conflict (organization_id, cash_register_id, week_start)
    do update set goal_amount = excluded.goal_amount, updated_by = v_user, updated_at = now();
  end if;

  return to_jsonb(v_register);
end;
$$;

create or replace function public.get_cash_monitor_session_detail(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_register_name text;
  v_branch_name text;
  v_movements_in numeric(14,2) := 0;
  v_movements_out numeric(14,2) := 0;
  v_cash_sales numeric(14,2) := 0;
  v_transfer_sales numeric(14,2) := 0;
  v_card_sales numeric(14,2) := 0;
  v_other_sales numeric(14,2) := 0;
  v_sales_count integer := 0;
  v_expected numeric(14,2) := 0;
  v_movements jsonb;
  v_sales jsonb;
  v_audits jsonb;
begin
  if v_user is null then
    raise exception 'Inicia sesión para inspeccionar el turno de caja.' using errcode = '42501';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session_id;

  if not found then
    raise exception 'La sesión de caja no existe.' using errcode = '22023';
  end if;

  if not (
    app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'view', v_session.branch_id)
    or app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
    or (v_session.opened_by = v_user and app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'view', v_session.branch_id))
  ) then
    raise exception 'No tienes permiso para inspeccionar este turno de caja.' using errcode = '42501';
  end if;

  select b.name into v_branch_name from public.branches b where b.id = v_session.branch_id;
  if v_session.cash_register_id is not null then
    select cr.name into v_register_name from public.cash_registers cr where cr.id = v_session.cash_register_id;
  end if;

  select
    coalesce(sum(case when direction = 'in' and not coalesce(voided, false) then amount else 0 end), 0),
    coalesce(sum(case when direction = 'out' and not coalesce(voided, false) then amount else 0 end), 0)
  into v_movements_in, v_movements_out
  from public.cash_session_movements
  where session_id = v_session.id;

  select
    coalesce(sum(case when sp.method = 'cash' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method = 'transfer' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method = 'card' then sp.amount else 0 end), 0),
    coalesce(sum(case when sp.method not in ('cash', 'transfer', 'card') then sp.amount else 0 end), 0),
    count(distinct sp.sale_id)
  into v_cash_sales, v_transfer_sales, v_card_sales, v_other_sales, v_sales_count
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id and s.organization_id = sp.organization_id
  where sp.organization_id = v_session.organization_id
    and s.branch_id = v_session.branch_id
    and (
      sp.cash_session_id = v_session.id
      or (
        sp.cash_session_id is null
        and sp.method <> 'cash'
        and sp.created_by = v_session.opened_by
        and sp.created_at >= v_session.opened_at
        and sp.created_at <= coalesce(v_session.closed_at, now())
      )
    );

  select round(
    v_session.opening_cash
    + (v_movements_in - v_movements_out)
    + coalesce((
      select sum(sp.amount)
      from public.sale_payments sp
      where sp.cash_session_id = v_session.id and sp.method = 'cash'
    ), 0),
    2
  ) into v_expected;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_movements
  from (
    select
      m.id, m.direction, m.amount, m.reason, m.voided, m.void_reason,
      m.created_by, m.created_at, m.voided_by, m.voided_at,
      coalesce(nullif(trim(p.full_name), ''), 'Usuario') as created_by_name
    from public.cash_session_movements m
    left join public.profiles p on p.user_id = m.created_by
    where m.session_id = v_session.id
  ) row_data;

  select coalesce(jsonb_agg(sale_row order by created_at desc), '[]'::jsonb)
  into v_sales
  from (
    select
      s.id,
      s.sale_code,
      s.status,
      s.total,
      s.subtotal,
      s.discount_total,
      s.tax_amount,
      s.payment_method,
      s.note,
      s.advisor_id,
      s.created_by,
      s.created_at,
      coalesce(c.full_name, 'Consumidor final') as customer_name,
      coalesce(adv.full_name, cr.full_name, 'Equipo') as advisor_name,
      coalesce((select sum(sp2.amount) from public.sale_payments sp2 where sp2.sale_id = s.id and sp2.cash_session_id = v_session.id and sp2.method = 'cash'), 0) as cash_in_session,
      coalesce((select sum(sp2.amount) from public.sale_payments sp2 where sp2.sale_id = s.id and sp2.method <> 'cash'), 0) as non_cash_total,
      coalesce((select jsonb_agg(distinct sp2.method) from public.sale_payments sp2 where sp2.sale_id = s.id), '[]'::jsonb) as payment_methods
    from public.sales s
    left join public.customers c on c.id = s.customer_id
    left join public.profiles adv on adv.user_id = s.advisor_id
    left join public.profiles cr on cr.user_id = s.created_by
    where s.organization_id = v_session.organization_id
      and s.branch_id = v_session.branch_id
      and exists (
        select 1
        from public.sale_payments sp
        where sp.sale_id = s.id
          and (
            sp.cash_session_id = v_session.id
            or (
              sp.cash_session_id is null
              and sp.method <> 'cash'
              and sp.created_by = v_session.opened_by
              and sp.created_at >= v_session.opened_at
              and sp.created_at <= coalesce(v_session.closed_at, now())
            )
          )
      )
  ) sale_row;

  select coalesce(jsonb_agg(audit_row order by created_at desc), '[]'::jsonb)
  into v_audits
  from (
    select
      a.id, a.action, a.reason, a.previous_state, a.new_state, a.created_by, a.created_at,
      coalesce(nullif(trim(p.full_name), ''), 'Sistema') as created_by_name
    from public.cash_session_audits a
    left join public.profiles p on p.user_id = a.created_by
    where a.session_id = v_session.id
  ) audit_row;

  return jsonb_build_object(
    'session', to_jsonb(v_session) || jsonb_build_object(
      'branch_name', coalesce(v_branch_name, ''),
      'register_name', coalesce(v_register_name, '')
    ),
    'live_totals', jsonb_build_object(
      'opening_cash', round(v_session.opening_cash, 2),
      'movements_in', round(v_movements_in, 2),
      'movements_out', round(v_movements_out, 2),
      'cash_sales_total', round((select coalesce(sum(sp.amount), 0) from public.sale_payments sp where sp.cash_session_id = v_session.id and sp.method = 'cash'), 2),
      'transfer_sales_total', round(v_transfer_sales, 2),
      'card_sales_total', round(v_card_sales, 2),
      'other_sales_total', round(v_other_sales, 2),
      'sales_count', v_sales_count,
      'expected_cash', v_expected
    ),
    'movements', v_movements,
    'linked_sales', v_sales,
    'audits', v_audits
  );
end;
$$;

revoke all on function app_private.recalculate_closed_cash_session(uuid) from public, anon, authenticated;
revoke all on function public.update_cash_register_control(uuid, text, uuid, uuid, boolean, date, numeric) from public, anon;
grant execute on function public.update_cash_register_control(uuid, text, uuid, uuid, boolean, date, numeric) to authenticated;
revoke all on function public.get_cash_monitor_session_detail(uuid) from public, anon;
grant execute on function public.get_cash_monitor_session_detail(uuid) to authenticated;
