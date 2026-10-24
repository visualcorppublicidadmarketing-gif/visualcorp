-- Tie payroll deduction requests to the labor record, not only to an app login.
-- Payroll remains externally processed; this migration adds traceability and
-- scoped visibility without calculating or automatically applying deductions.

alter table public.finance_payroll_deductions
  alter column employee_user_id drop not null,
  add column personnel_id uuid;

alter table public.finance_payroll_deductions
  add constraint finance_payroll_deductions_personnel_fk
  foreign key (personnel_id, organization_id)
  references public.personnel_records(id, organization_id)
  on delete restrict;

create index finance_payroll_deductions_personnel_period_idx
  on public.finance_payroll_deductions(organization_id, personnel_id, payroll_period desc)
  where personnel_id is not null;

-- Backfill historical entries only when a personnel/account link is present.
update public.finance_payroll_deductions d
set personnel_id = l.personnel_id
from public.personnel_account_links l
where d.personnel_id is null
  and d.organization_id = l.organization_id
  and d.employee_user_id = l.user_id;

drop policy if exists finance_deductions_owner_insert on public.finance_payroll_deductions;
create policy finance_deductions_owner_insert
  on public.finance_payroll_deductions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'pending_authorization'
    and personnel_id is not null
    and app_private.has_org_role(organization_id, null, array['owner','admin'])
    and (
      employee_user_id is null
      or exists (
        select 1 from public.organization_memberships m
        where m.organization_id = finance_payroll_deductions.organization_id
          and m.user_id = finance_payroll_deductions.employee_user_id
          and m.active
      )
    )
  );

-- Personnel compensation viewers can see this person-specific history in the
-- Personnel page. Finance mutations stay restricted to owner/admin.
create policy finance_deductions_compensation_read
  on public.finance_payroll_deductions for select to authenticated
  using (
    personnel_id is not null
    and app_private.has_visualcorp_access(organization_id, 'personnel', 'view_compensation')
  );

create or replace function app_private.guard_finance_payroll_deduction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Inicia sesión para registrar una solicitud de deducción.' using errcode = '42501';
    end if;
    if new.personnel_id is null or not exists (
      select 1 from public.personnel_records p
      where p.id = new.personnel_id
        and p.organization_id = new.organization_id
        and p.status = 'active'
    ) then
      raise exception 'Selecciona una ficha activa de Personal.';
    end if;
    select l.user_id into v_user_id
    from public.personnel_account_links l
    join public.organization_memberships m
      on m.organization_id = l.organization_id and m.user_id = l.user_id and m.active
    where l.organization_id = new.organization_id and l.personnel_id = new.personnel_id;
    new.employee_user_id := v_user_id;
    return new;
  end if;

  if new.organization_id <> old.organization_id
    or new.employee_user_id is distinct from old.employee_user_id
    or new.personnel_id is distinct from old.personnel_id
    or new.amount <> old.amount
    or new.payroll_period <> old.payroll_period
    or new.description <> old.description then
    raise exception 'Los datos de una solicitud guardada son inmutables.';
  end if;

  if old.status = 'pending_authorization' and new.status = 'authorized' then
    if length(trim(new.authorization_reference)) = 0 or length(trim(new.evidence_reference)) = 0 then
      raise exception 'Para autorizar se requieren la autorización expresa y la referencia de evidencia.';
    end if;
  elsif old.status = 'authorized' and new.status = 'applied_externally' then
    if new.authorization_reference is distinct from old.authorization_reference
      or new.evidence_reference is distinct from old.evidence_reference then
      raise exception 'Conserva las referencias de autorización y evidencia.';
    end if;
  elsif not (old.status in ('pending_authorization','authorized') and new.status = 'cancelled') then
    raise exception 'La transición de estado no está permitida.';
  end if;

  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;

create or replace function app_private.list_finance_personnel_options()
returns table(personnel_id uuid, full_name text, department text, job_title text)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select o.id into v_org from public.organizations o where o.slug = 'visual-corp' limit 1;
  if auth.uid() is null or v_org is null
    or not app_private.has_org_role(v_org, null, array['owner','admin']) then
    raise exception 'No tienes permiso para consultar las fichas de Personal para Finanzas.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.department, p.job_title
    from public.personnel_records p
    where p.organization_id = v_org and p.status = 'active'
    order by p.full_name;
end;
$$;
revoke all on function app_private.list_finance_personnel_options() from public, anon, authenticated;
grant execute on function app_private.list_finance_personnel_options() to authenticated;

create or replace function public.list_visualcorp_finance_personnel_options()
returns table(personnel_id uuid, full_name text, department text, job_title text)
language sql
security invoker
set search_path = ''
as $$
  select * from app_private.list_finance_personnel_options();
$$;
revoke all on function public.list_visualcorp_finance_personnel_options() from public, anon;
grant execute on function public.list_visualcorp_finance_personnel_options() to authenticated;
