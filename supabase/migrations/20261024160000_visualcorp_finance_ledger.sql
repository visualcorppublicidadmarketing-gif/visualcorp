-- Operational finance ledger. Bills and payments are separate so partial
-- settlement does not duplicate cash flow. Payroll deductions stay restricted.
create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  supplier_id uuid,
  purchase_order_id uuid,
  description text not null check (length(trim(description)) between 1 and 240),
  category text not null,
  status text not null default 'payable' check (status in ('payable','paid','void')),
  document_date date not null default current_date,
  due_date date,
  total numeric(14,2) not null check (total > 0),
  paid_total numeric(14,2) not null default 0 check (paid_total >= 0 and paid_total <= total),
  reference text not null default '',
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(branch_id,organization_id) references public.branches(id,organization_id) on delete restrict,
  foreign key(supplier_id,organization_id) references public.suppliers(id,organization_id) on delete restrict,
  foreign key(purchase_order_id,organization_id) references public.purchase_orders(id,organization_id) on delete restrict
);
create index finance_expenses_org_date_idx on public.finance_expenses(organization_id,document_date desc);
create index finance_expenses_org_due_idx on public.finance_expenses(organization_id,due_date) where status='payable';

create table public.finance_expense_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','transfer','card','cheque','other')),
  paid_at timestamptz not null default now(),
  reference text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(expense_id,organization_id) references public.finance_expenses(id,organization_id) on delete restrict
);
create index finance_expense_payments_org_date_idx on public.finance_expense_payments(organization_id,paid_at desc);

create table public.finance_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 240),
  category text not null,
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  cadence text not null default 'monthly' check (cadence in ('monthly','quarterly','annual')),
  next_due_date date not null,
  active boolean not null default true,
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.finance_payroll_deductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete restrict,
  description text not null check (length(trim(description)) between 1 and 240),
  amount numeric(14,2) not null check (amount > 0),
  payroll_period date not null,
  status text not null default 'pending_authorization' check (status in ('pending_authorization','authorized','applied_externally','cancelled')),
  authorization_reference text not null default '',
  evidence_reference text not null default '',
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create index finance_payroll_deductions_org_period_idx on public.finance_payroll_deductions(organization_id,payroll_period desc);

alter table public.finance_expenses enable row level security;
alter table public.finance_expense_payments enable row level security;
alter table public.finance_recurring_templates enable row level security;
alter table public.finance_payroll_deductions enable row level security;
grant select on public.finance_expenses,public.finance_expense_payments to authenticated;
grant select,insert,update on public.finance_recurring_templates to authenticated;
grant select,insert,update on public.finance_payroll_deductions to authenticated;

create policy finance_expenses_admin_read on public.finance_expenses for select to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_expenses_admin_insert on public.finance_expenses for insert to authenticated with check (created_by=(select auth.uid()) and app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_expenses_admin_update on public.finance_expenses for update to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_expense_payments_admin_read on public.finance_expense_payments for select to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_expense_payments_admin_insert on public.finance_expense_payments for insert to authenticated with check (created_by=(select auth.uid()) and app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_recurring_admin_all on public.finance_recurring_templates for all to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy finance_deductions_owner_read on public.finance_payroll_deductions for select to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin']));
create policy finance_deductions_owner_insert on public.finance_payroll_deductions for insert to authenticated with check (created_by=(select auth.uid()) and status='pending_authorization' and app_private.has_org_role(organization_id,null,array['owner','admin']) and exists(select 1 from public.organization_memberships m where m.organization_id=finance_payroll_deductions.organization_id and m.user_id=finance_payroll_deductions.employee_user_id and m.active));
create policy finance_deductions_owner_update on public.finance_payroll_deductions for update to authenticated using (app_private.has_org_role(organization_id,null,array['owner','admin'])) with check (app_private.has_org_role(organization_id,null,array['owner','admin']));

create or replace function app_private.guard_finance_payroll_deduction() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.employee_user_id<>old.employee_user_id or new.amount<>old.amount or new.payroll_period<>old.payroll_period or new.description<>old.description then raise exception 'Los datos de una solicitud guardada son inmutables.'; end if;
    if old.status='pending_authorization' and new.status='authorized' then
      if length(trim(new.authorization_reference))=0 or length(trim(new.evidence_reference))=0 then raise exception 'Para autorizar se requieren la autorización expresa y la referencia de evidencia.'; end if;
    elsif old.status='authorized' and new.status='applied_externally' then
      if new.authorization_reference is distinct from old.authorization_reference or new.evidence_reference is distinct from old.evidence_reference then raise exception 'Conserva las referencias de autorización y evidencia.'; end if;
    elsif not (old.status in ('pending_authorization','authorized') and new.status='cancelled') then
      raise exception 'La transición de estado no está permitida.';
    end if;
    new.reviewed_by:=auth.uid(); new.reviewed_at:=now();
  end if;
  return new;
end; $$;
create trigger finance_payroll_deduction_guard before update on public.finance_payroll_deductions for each row execute function app_private.guard_finance_payroll_deduction();

create or replace function public.record_finance_expense_payment(
  p_expense_id uuid,p_amount numeric,p_method text,p_reference text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_expense public.finance_expenses%rowtype; v_amount numeric(14,2):=round(coalesce(p_amount,0),2); v_payment uuid; v_session uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org,null,array['owner','admin','manager']) then raise exception 'No tienes permiso para registrar pagos de gastos.' using errcode='42501'; end if;
  if p_method not in ('cash','transfer','card','cheque','other') or v_amount<=0 then raise exception 'Revisa el monto y el medio de pago.'; end if;
  select * into v_expense from public.finance_expenses where id=p_expense_id and organization_id=v_org for update;
  if not found or v_expense.status='void' then raise exception 'No encontramos un compromiso de pago activo.'; end if;
  if v_expense.paid_total+v_amount>v_expense.total then raise exception 'El pago supera el saldo pendiente.'; end if;
  if p_method='cash' then
    select cs.id into v_session from public.cash_sessions cs where cs.organization_id=v_org and cs.status='open' and cs.opened_by=auth.uid() and (v_expense.branch_id is null or cs.branch_id=v_expense.branch_id) order by cs.opened_at desc limit 1 for update;
    if v_session is null then raise exception 'Abre el turno de caja correspondiente antes de registrar un pago en efectivo.'; end if;
  end if;
  insert into public.finance_expense_payments(organization_id,expense_id,amount,method,reference,created_by) values(v_org,p_expense_id,v_amount,p_method,left(coalesce(p_reference,''),200),auth.uid()) returning id into v_payment;
  if p_method='cash' then
    insert into public.cash_session_movements(organization_id,session_id,direction,amount,reason,idempotency_key,created_by)
    values(v_org,v_session,'out',v_amount,'Pago de gasto: '||left(v_expense.description,180),'finance-expense:'||v_payment::text,auth.uid());
  end if;
  update public.finance_expenses set paid_total=paid_total+v_amount,status=case when paid_total+v_amount>=total then 'paid' else 'payable' end,updated_at=now() where id=p_expense_id;
  return jsonb_build_object('payment_id',v_payment,'paid_total',v_expense.paid_total+v_amount,'balance',v_expense.total-v_expense.paid_total-v_amount);
end; $$;
revoke all on function public.record_finance_expense_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.record_finance_expense_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.record_finance_expense(
  p_description text,p_category text,p_total numeric,p_due_date date,p_branch_id uuid default null,
  p_supplier_id uuid default null,p_purchase_order_id uuid default null,p_paid_now numeric default 0,
  p_method text default 'transfer',p_reference text default '',p_note text default '',p_document_reference text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid; v_total numeric(14,2):=round(coalesce(p_total,0),2); v_paid numeric(14,2):=round(coalesce(p_paid_now,0),2); v_session uuid; v_payment uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager']) then raise exception 'No tienes permiso para registrar egresos.' using errcode='42501'; end if;
  if length(trim(coalesce(p_description,''))) not between 1 and 240 or length(trim(coalesce(p_category,''))) not between 1 and 80 or v_total<=0 or v_paid<0 or v_paid>v_total then raise exception 'Revisa descripción, categoría y montos.'; end if;
  if p_method not in ('cash','transfer','card','cheque','other') then raise exception 'Selecciona un medio de pago válido.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org) then raise exception 'Sucursal inválida.'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and organization_id=v_org and active) then raise exception 'Proveedor inválido o inactivo.'; end if;
  if p_purchase_order_id is not null and not exists(select 1 from public.purchase_orders po where po.id=p_purchase_order_id and po.organization_id=v_org and po.supplier_id=p_supplier_id) then raise exception 'La orden de compra no corresponde al proveedor seleccionado.'; end if;
  insert into public.finance_expenses(organization_id,branch_id,supplier_id,purchase_order_id,description,category,status,due_date,total,paid_total,reference,note,created_by)
    values(v_org,p_branch_id,p_supplier_id,p_purchase_order_id,trim(p_description),trim(p_category),case when v_paid=v_total then 'paid' else 'payable' end,p_due_date,v_total,v_paid,left(coalesce(p_document_reference,''),200),left(coalesce(p_note,''),1000),auth.uid()) returning id into v_id;
  if v_paid>0 then
    if p_method='cash' then
      select id into v_session from public.cash_sessions where organization_id=v_org and branch_id=p_branch_id and opened_by=auth.uid() and status='open' order by opened_at desc limit 1 for update;
      if v_session is null then raise exception 'Abre tu turno de caja antes de registrar un egreso en efectivo.'; end if;
    end if;
    insert into public.finance_expense_payments(organization_id,expense_id,amount,method,reference,created_by) values(v_org,v_id,v_paid,p_method,left(coalesce(p_reference,''),200),auth.uid()) returning id into v_payment;
    if p_method='cash' then
      insert into public.cash_session_movements(organization_id,session_id,direction,amount,reason,idempotency_key,created_by)
        values(v_org,v_session,'out',v_paid,'Pago de gasto: '||left(trim(p_description),180),'finance-expense:'||v_payment::text,auth.uid());
    end if;
  end if;
  return v_id;
end; $$;
revoke all on function public.record_finance_expense(text,text,numeric,date,uuid,uuid,uuid,numeric,text,text,text,text) from public,anon;
grant execute on function public.record_finance_expense(text,text,numeric,date,uuid,uuid,uuid,numeric,text,text,text,text) to authenticated;
