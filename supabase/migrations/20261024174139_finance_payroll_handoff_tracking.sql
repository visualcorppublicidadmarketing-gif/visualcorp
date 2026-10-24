-- Track handoff to external payroll separately from authorization and application.
alter table public.finance_payroll_deductions
  add column payroll_handoff_reference text not null default '',
  add column payroll_handed_at timestamptz,
  add column payroll_handed_by uuid references auth.users(id) on delete restrict;

alter table public.finance_payroll_deductions
  drop constraint finance_payroll_deductions_status_check,
  add constraint finance_payroll_deductions_status_check
    check (status in ('pending_authorization','authorized','sent_to_payroll','applied_externally','cancelled')),
  add constraint finance_payroll_deductions_handoff_reference_check
    check (length(trim(payroll_handoff_reference)) <= 240),
  add constraint finance_payroll_deductions_handoff_state_check
    check (status <> 'sent_to_payroll' or (length(trim(payroll_handoff_reference)) > 0 and payroll_handed_at is not null and payroll_handed_by is not null));

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
    if new.payroll_handoff_reference is distinct from old.payroll_handoff_reference
      or new.payroll_handed_at is distinct from old.payroll_handed_at
      or new.payroll_handed_by is distinct from old.payroll_handed_by then
      raise exception 'La entrega a nómina solo se registra después de autorizar.';
    end if;
  elsif old.status = 'authorized' and new.status = 'sent_to_payroll' then
    if length(trim(new.payroll_handoff_reference)) = 0 then
      raise exception 'Registra la referencia de entrega a nómina.';
    end if;
    new.payroll_handed_at := now();
    new.payroll_handed_by := auth.uid();
  elsif old.status = 'sent_to_payroll' and new.status = 'applied_externally' then
    if new.authorization_reference is distinct from old.authorization_reference
      or new.evidence_reference is distinct from old.evidence_reference
      or new.payroll_handoff_reference is distinct from old.payroll_handoff_reference
      or new.payroll_handed_at is distinct from old.payroll_handed_at
      or new.payroll_handed_by is distinct from old.payroll_handed_by then
      raise exception 'Conserva las referencias de autorización y entrega a nómina.';
    end if;
  elsif old.status in ('pending_authorization','authorized') and new.status = 'cancelled' then
    if new.payroll_handoff_reference is distinct from old.payroll_handoff_reference
      or new.payroll_handed_at is distinct from old.payroll_handed_at
      or new.payroll_handed_by is distinct from old.payroll_handed_by then
      raise exception 'No se puede registrar una entrega a nómina al cancelar.';
    end if;
  else
    raise exception 'La transición de estado no está permitida.';
  end if;

  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;
