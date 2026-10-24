-- Convert each confirmed recurring due date into one payable finance expense.
-- No payment is made automatically; payment remains an explicit finance action.
alter table public.finance_recurring_templates
  add column cadence_anchor_day smallint not null default 1,
  add column branch_id uuid,
  add column supplier_id uuid,
  add constraint finance_recurring_templates_anchor_day_check check (cadence_anchor_day between 1 and 31),
  add constraint finance_recurring_templates_id_org_key unique (id, organization_id),
  add constraint finance_recurring_templates_branch_org_fkey foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete restrict,
  add constraint finance_recurring_templates_supplier_org_fkey foreign key (supplier_id, organization_id)
    references public.suppliers(id, organization_id) on delete restrict;

update public.finance_recurring_templates
set cadence_anchor_day = extract(day from next_due_date)::smallint;

create table public.finance_recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  expense_id uuid not null,
  due_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (template_id, due_date),
  unique (expense_id),
  foreign key (template_id, organization_id)
    references public.finance_recurring_templates(id, organization_id) on delete restrict,
  foreign key (expense_id, organization_id)
    references public.finance_expenses(id, organization_id) on delete restrict
);
create index finance_recurring_occurrences_org_due_idx
  on public.finance_recurring_occurrences(organization_id, due_date desc);
alter table public.finance_recurring_occurrences enable row level security;
grant select on public.finance_recurring_occurrences to authenticated;
create policy finance_recurring_occurrences_admin_read
  on public.finance_recurring_occurrences for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));

create or replace function public.record_finance_recurring_expense(
  p_template_id uuid,
  p_due_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_org uuid;
  v_template public.finance_recurring_templates%rowtype;
  v_expense_id uuid;
  v_existing_expense uuid;
  v_months integer;
  v_next_month date;
  v_next_due date;
  v_month_last_day integer;
begin
  if auth.uid() is null or p_due_date is null then
    raise exception 'Inicia sesión y revisa la fecha del vencimiento.' using errcode='42501';
  end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org, null, array['owner','admin','manager']) then
    raise exception 'No tienes permiso para generar cuentas por pagar.' using errcode='42501';
  end if;

  select * into v_template
  from public.finance_recurring_templates
  where id=p_template_id and organization_id=v_org
  for update;
  if not found then raise exception 'No encontramos el recordatorio financiero.'; end if;

  -- A retry for a date already processed returns its original expense.
  select expense_id into v_existing_expense
  from public.finance_recurring_occurrences
  where template_id=v_template.id and due_date=p_due_date;
  if v_existing_expense is not null then
    return jsonb_build_object('expense_id',v_existing_expense,'due_date',p_due_date,'already_created',true);
  end if;
  if not v_template.active then raise exception 'Este recordatorio está pausado.'; end if;
  if v_template.next_due_date<>p_due_date then
    raise exception 'El vencimiento cambió. Actualiza la lista e inténtalo nuevamente.' using errcode='40001';
  end if;

  insert into public.finance_expenses(
    organization_id,branch_id,supplier_id,description,category,status,due_date,total,paid_total,note,created_by
  ) values (
    v_org,v_template.branch_id,v_template.supplier_id,trim(v_template.description),trim(v_template.category),
    'payable',v_template.next_due_date,v_template.expected_amount,0,
    left('Generado desde pago periódico. '||coalesce(v_template.note,''),1000),auth.uid()
  ) returning id into v_expense_id;

  insert into public.finance_recurring_occurrences(organization_id,template_id,expense_id,due_date,created_by)
  values(v_org,v_template.id,v_expense_id,p_due_date,auth.uid());

  v_months:=case v_template.cadence when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  v_next_month:=(date_trunc('month',p_due_date)::date+make_interval(months=>v_months))::date;
  v_month_last_day:=extract(day from (v_next_month+interval '1 month - 1 day'))::integer;
  v_next_due:=v_next_month+least(v_template.cadence_anchor_day,v_month_last_day)-1;
  update public.finance_recurring_templates
  set next_due_date=v_next_due
  where id=v_template.id and organization_id=v_org;

  return jsonb_build_object('expense_id',v_expense_id,'due_date',p_due_date,'next_due_date',v_next_due,'already_created',false);
end;
$$;
revoke all on function public.record_finance_recurring_expense(uuid,date) from public,anon;
grant execute on function public.record_finance_recurring_expense(uuid,date) to authenticated;
