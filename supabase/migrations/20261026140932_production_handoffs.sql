-- Add explicit next-step tracking and an atomic, auditable production handoff.
alter table public.production_orders
  add column if not exists next_step text not null default ''
  check (length(next_step) <= 500);

create or replace function app_private.validate_production_order_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = new.organization_id
      and m.user_id = new.assigned_to
      and m.active
      and (m.branch_id is null or m.branch_id = new.branch_id)
  ) then
    raise exception 'El responsable debe tener acceso activo a la sucursal de la orden.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_production_order_assignee() from public, anon, authenticated;
drop trigger if exists production_order_assignee_membership on public.production_orders;
create trigger production_order_assignee_membership
before insert or update of assigned_to, branch_id, organization_id on public.production_orders
for each row execute function app_private.validate_production_order_assignee();

create or replace function app_private.record_production_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.production_order_events(
    organization_id, order_id, from_status, to_status, note, created_by
  ) values (
    new.organization_id, new.id, null, new.status, 'Orden de trabajo creada.', new.created_by
  );
  return new;
end;
$$;

revoke all on function app_private.record_production_order_created() from public, anon, authenticated;
drop trigger if exists production_order_created_event on public.production_orders;
create trigger production_order_created_event
after insert on public.production_orders
for each row execute function app_private.record_production_order_created();

create or replace function public.update_production_status(
  p_order uuid,
  p_status text,
  p_note text default ''
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.production_orders%rowtype;
begin
  if p_status not in ('queued','in_progress','blocked','quality_review','ready','completed','cancelled') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;

  if p_status in ('blocked','quality_review','ready','completed','cancelled')
    and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Añade una nota de al menos 5 caracteres para este cambio.' using errcode = '22023';
  end if;

  select * into v_order
  from public.production_orders
  where id = p_order
  for update;

  if not found
    or not app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager','production']) then
    raise exception 'Orden no encontrada o acceso denegado.' using errcode = '42501';
  end if;

  if v_order.status in ('completed','cancelled') then
    raise exception 'Una orden finalizada no puede reabrirse desde esta acción.' using errcode = '55000';
  end if;

  insert into public.production_order_events(
    organization_id, order_id, from_status, to_status, note, created_by
  ) values (
    v_order.organization_id, v_order.id, v_order.status, p_status, left(coalesce(p_note, ''), 1000), auth.uid()
  );

  update public.production_orders
  set status = p_status, updated_at = now()
  where id = p_order;
end;
$$;

revoke all on function public.update_production_status(uuid, text, text) from public, anon;
grant execute on function public.update_production_status(uuid, text, text) to authenticated;

create or replace function public.update_production_order_handoff(
  p_order uuid,
  p_assigned_to uuid,
  p_area_id uuid,
  p_due_at timestamptz,
  p_description text,
  p_next_step text,
  p_note text default ''
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.production_orders%rowtype;
  v_note text;
  v_old_owner text;
  v_new_owner text;
  v_area_name text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para actualizar la orden.' using errcode = '42501';
  end if;

  select * into v_order
  from public.production_orders
  where id = p_order
  for update;

  if not found
    or v_order.status in ('completed', 'cancelled')
    or not app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager','production']) then
    raise exception 'Orden cerrada o sin permiso para actualizarla.' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_order.organization_id
      and m.user_id = p_assigned_to
      and m.active
      and (m.branch_id is null or m.branch_id = v_order.branch_id)
  ) then
    raise exception 'El responsable debe tener acceso activo a la sucursal de la orden.' using errcode = '23514';
  end if;

  if p_area_id is not null and not exists (
    select 1 from public.areas a
    where a.id = p_area_id and a.organization_id = v_order.organization_id and a.active
  ) then
    raise exception 'Selecciona un área activa de la organización.' using errcode = '23514';
  end if;

  if length(coalesce(p_description, '')) > 4000
    or length(coalesce(p_next_step, '')) > 500
    or length(coalesce(p_note, '')) > 1000 then
    raise exception 'Uno de los campos supera el límite permitido.' using errcode = '22001';
  end if;

  select nullif(trim(p.full_name), '') into v_old_owner
  from public.profiles p where p.user_id = v_order.assigned_to;
  select nullif(trim(p.full_name), '') into v_new_owner
  from public.profiles p where p.user_id = p_assigned_to;
  select nullif(trim(a.name), '') into v_area_name
  from public.areas a where a.id = p_area_id and a.organization_id = v_order.organization_id;

  update public.production_orders
  set assigned_to = p_assigned_to,
      area_id = p_area_id,
      due_at = p_due_at,
      description = coalesce(p_description, ''),
      next_step = coalesce(p_next_step, ''),
      updated_at = now()
  where id = p_order;

  v_note := left(concat_ws(E'\n',
    nullif(trim(p_note), ''),
    'Responsable: ' || coalesce(v_old_owner, 'Sin asignar') || ' → ' || coalesce(v_new_owner, 'Sin asignar'),
    'Área: ' || coalesce(v_area_name, 'Sin área'),
    'Próximo paso: ' || coalesce(nullif(trim(p_next_step), ''), 'Pendiente de definir')
  ), 1000);

  insert into public.production_order_events(
    organization_id, order_id, from_status, to_status, note, created_by
  ) values (
    v_order.organization_id, v_order.id, v_order.status, v_order.status, v_note, auth.uid()
  );
end;
$$;

revoke all on function public.update_production_order_handoff(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.update_production_order_handoff(uuid, uuid, uuid, timestamptz, text, text, text) to authenticated;
