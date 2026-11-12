-- Add identity and home location details to staff records, and preserve each
-- employment period so a return never overwrites a previous departure.
alter table public.personnel_records
  add column document_reference text not null default '' check (length(document_reference) <= 40),
  add column home_address text not null default '' check (length(home_address) <= 300),
  add column home_city text not null default '' check (length(home_city) <= 120),
  add column home_maps_url text not null default '' check (length(home_maps_url) <= 800),
  add column home_latitude numeric(9,6),
  add column home_longitude numeric(9,6),
  add constraint personnel_records_home_latitude_check check (home_latitude is null or home_latitude between -90 and 90),
  add constraint personnel_records_home_longitude_check check (home_longitude is null or home_longitude between -180 and 180);

-- The existing audit records field names only; it never copies identity or
-- address values into the readable event summary.
create or replace function app_private.log_personnel_record_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[] := '{}';
  v_actor_label text;
begin
  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema')
    into v_actor_label from public.profiles p where p.user_id=(select auth.uid());
  if tg_op='UPDATE' then
    if new.full_name is distinct from old.full_name then v_fields:=array_append(v_fields,'full_name'); end if;
    if new.email is distinct from old.email then v_fields:=array_append(v_fields,'email'); end if;
    if new.phone is distinct from old.phone then v_fields:=array_append(v_fields,'phone'); end if;
    if new.document_reference is distinct from old.document_reference then v_fields:=array_append(v_fields,'document_reference'); end if;
    if new.home_address is distinct from old.home_address then v_fields:=array_append(v_fields,'home_address'); end if;
    if new.home_city is distinct from old.home_city then v_fields:=array_append(v_fields,'home_city'); end if;
    if new.home_maps_url is distinct from old.home_maps_url then v_fields:=array_append(v_fields,'home_maps_url'); end if;
    if new.home_latitude is distinct from old.home_latitude then v_fields:=array_append(v_fields,'home_latitude'); end if;
    if new.home_longitude is distinct from old.home_longitude then v_fields:=array_append(v_fields,'home_longitude'); end if;
    if new.department is distinct from old.department then v_fields:=array_append(v_fields,'department'); end if;
    if new.job_title is distinct from old.job_title then v_fields:=array_append(v_fields,'job_title'); end if;
    if new.status is distinct from old.status then v_fields:=array_append(v_fields,'status'); end if;
    if new.start_date is distinct from old.start_date then v_fields:=array_append(v_fields,'start_date'); end if;
    if new.end_date is distinct from old.end_date then v_fields:=array_append(v_fields,'end_date'); end if;
    if cardinality(v_fields)=0 then return new; end if;
  else
    v_fields:=array['full_name','email','phone','department','job_title','status','document_reference','home_address','home_city','home_maps_url','home_latitude','home_longitude'];
  end if;
  insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,actor_user_id,actor_label)
  values(new.organization_id,new.id,case when tg_op='INSERT' then 'record_created' else 'record_updated' end,
    case when tg_op='INSERT' then 'Ficha de personal creada' else 'Ficha de personal actualizada' end,
    v_fields,(select auth.uid()),coalesce(v_actor_label,'Usuario del sistema'));
  return new;
end;
$$;
revoke all on function app_private.log_personnel_record_change() from public,anon,authenticated;

create table public.personnel_employment_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  personnel_id uuid not null,
  start_date date,
  end_date date,
  exit_type text check (exit_type in ('resignation','dismissal','contract_end','mutual_agreement','abandonment','other','legacy')),
  exit_reason text not null default '' check (length(exit_reason) <= 1000),
  compensation_status text not null default 'not_applicable'
    check (compensation_status in ('pending','with_compensation','without_compensation','not_applicable')),
  exit_notes text not null default '' check (length(exit_notes) <= 2000),
  source text not null default 'manual' check (source in ('manual','legacy')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (personnel_id,organization_id) references public.personnel_records(id,organization_id) on delete restrict,
  unique (id,organization_id),
  check (exit_type is null or length(trim(exit_reason)) between 2 and 1000),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index personnel_employment_periods_personnel_idx
  on public.personnel_employment_periods (organization_id,personnel_id,start_date desc,created_at desc);
create unique index personnel_employment_periods_one_open_idx
  on public.personnel_employment_periods (organization_id,personnel_id)
  where end_date is null and exit_type is null;

-- Preserve the single period currently represented by the legacy staff row.
-- Unknown dates and reasons remain unknown instead of being inferred.
insert into public.personnel_employment_periods (
  organization_id,personnel_id,start_date,end_date,exit_type,exit_reason,
  compensation_status,exit_notes,source,created_by,created_at
)
select
  organization_id,id,start_date,end_date,
  case when status='active' and end_date is null then null else 'legacy' end,
  case when status='active' and end_date is null then '' else 'Motivo de salida no registrado en la ficha anterior.' end,
  case when status='active' and end_date is null then 'not_applicable' else 'pending' end,
  case when status='active' and end_date is null then '' else 'Período migrado; la causa y fecha de salida no constaban en la ficha anterior.' end,
  'legacy',created_by,created_at
from public.personnel_records;

-- Some older forms allowed an active status and an end date at the same time.
-- Preserve that dated legacy row and add a separate current period with an
-- unknown start instead of guessing whether the date was a past departure.
insert into public.personnel_employment_periods (
  organization_id,personnel_id,start_date,end_date,exit_type,exit_reason,
  compensation_status,exit_notes,source,created_by,created_at
)
select
  organization_id,id,null,null,null,'','not_applicable',
  'Período vigente migrado; la fecha de ingreso actual no constaba de forma inequívoca.',
  'legacy',created_by,created_at
from public.personnel_records
  where status='active' and end_date is not null;

-- Compensation outcomes use the existing restricted compensation permission.
-- They are separate from general employment history so personnel.view cannot
-- read them by querying the period table directly.
create table public.personnel_employment_compensation (
  period_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  compensation_status text not null default 'pending'
    check (compensation_status in ('pending','with_compensation','without_compensation','not_applicable')),
  exit_notes text not null default '' check (length(exit_notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (period_id,organization_id)
    references public.personnel_employment_periods(id,organization_id) on delete restrict
);

insert into public.personnel_employment_compensation(period_id,organization_id,compensation_status,exit_notes)
select id,organization_id,compensation_status,exit_notes
from public.personnel_employment_periods
where exit_type is not null;

alter table public.personnel_employment_periods drop column compensation_status;
alter table public.personnel_employment_periods drop column exit_notes;

alter table public.personnel_employment_periods enable row level security;
grant select,insert on public.personnel_employment_periods to authenticated;
revoke all on public.personnel_employment_periods from public,anon;
revoke delete on public.personnel_employment_periods from authenticated;

alter table public.personnel_employment_compensation enable row level security;
grant select on public.personnel_employment_compensation to authenticated;
revoke all on public.personnel_employment_compensation from public,anon;
revoke insert,update,delete on public.personnel_employment_compensation from authenticated;

create policy personnel_employment_periods_read on public.personnel_employment_periods
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'personnel','view')
    or app_private.has_visualcorp_access(organization_id,'personnel','edit'));
create policy personnel_employment_periods_add on public.personnel_employment_periods
  for insert to authenticated
  with check (app_private.has_visualcorp_access(organization_id,'personnel','edit') and created_by=(select auth.uid()));
create policy personnel_employment_compensation_read on public.personnel_employment_compensation
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'personnel','view')
    and app_private.has_visualcorp_access(organization_id,'personnel','view_compensation'));

create or replace function app_private.guard_personnel_employment_period()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_last_end_date date;
begin
  if tg_op='DELETE' then
    raise exception 'Los períodos laborales no se eliminan; conserva el historial de la ficha.';
  end if;
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar períodos laborales.' using errcode='42501';
  end if;

  if tg_op='INSERT' then
    if new.start_date is null then
      raise exception 'Registra la fecha de ingreso del período laboral.';
    end if;
    if new.end_date is not null or new.exit_type is not null or new.source <> 'manual' then
      raise exception 'Solo se pueden abrir nuevos períodos laborales desde la ficha.';
    end if;
    perform 1 from public.personnel_records
      where id=new.personnel_id and organization_id=new.organization_id
      for update;
    if not found then raise exception 'La ficha de personal no existe.'; end if;
    select max(end_date) into v_last_end_date
      from public.personnel_employment_periods
      where organization_id=new.organization_id and personnel_id=new.personnel_id and exit_type is not null;
    if v_last_end_date is not null and new.start_date <= v_last_end_date then
      raise exception 'El reingreso debe ser posterior a la última fecha de salida registrada.';
    end if;
    new.created_by := (select auth.uid());
    new.source := 'manual';
    new.created_at := now();
    return new;
  end if;

  if old.end_date is not null or old.exit_type is not null then
    raise exception 'Un período cerrado no se modifica; registra una nota de corrección con respaldo.';
  end if;
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.personnel_id is distinct from old.personnel_id
    or new.start_date is distinct from old.start_date
    or new.source is distinct from old.source
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'La identidad y fecha inicial de un período no se pueden cambiar.';
  end if;
  if new.end_date is null or new.exit_type is null then
    raise exception 'Para cerrar un período registra fecha y tipo de salida.';
  end if;
  if new.exit_type not in ('resignation','dismissal','contract_end','mutual_agreement','abandonment','other','legacy') then
    raise exception 'El tipo de salida no es válido.';
  end if;
  if length(trim(new.exit_reason)) < 2 then
    raise exception 'Registra el motivo de salida o selecciona "No informado".';
  end if;
  if new.start_date is not null and new.end_date < new.start_date then
    raise exception 'La salida no puede ser anterior al ingreso.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_personnel_employment_period() from public,anon,authenticated;
create trigger personnel_employment_period_guard
  before insert or update or delete on public.personnel_employment_periods
  for each row execute function app_private.guard_personnel_employment_period();

create or replace function app_private.sync_personnel_employment_period()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    update public.personnel_records
      set status='active',start_date=coalesce(new.start_date,start_date),end_date=null
      where id=new.personnel_id and organization_id=new.organization_id;
  else
    update public.personnel_records
      set status='inactive',end_date=new.end_date
      where id=new.personnel_id and organization_id=new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function app_private.sync_personnel_employment_period() from public,anon,authenticated;
create trigger personnel_employment_period_sync_record
  after insert or update on public.personnel_employment_periods
  for each row execute function app_private.sync_personnel_employment_period();

-- New staff get their first open period in the same database transaction as
-- their profile creation. Rehires create another period in the UI.
create or replace function app_private.create_initial_personnel_employment_period()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='active' then
    insert into public.personnel_employment_periods (organization_id,personnel_id,start_date)
    values (new.organization_id,new.id,coalesce(new.start_date,current_date));
  end if;
  return new;
end;
$$;
revoke all on function app_private.create_initial_personnel_employment_period() from public,anon,authenticated;
create trigger personnel_records_initial_employment_period
  after insert on public.personnel_records
  for each row execute function app_private.create_initial_personnel_employment_period();

-- Keep the general personnel timeline in sync without copying address,
-- identity numbers, compensation values, or exit explanations into summaries.
create or replace function app_private.log_personnel_employment_period_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor_label text;
  v_event_key text;
  v_summary text;
begin
  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema')
    into v_actor_label from public.profiles p where p.user_id=(select auth.uid());
  if tg_op='INSERT' then
    v_event_key := 'employment_period_started';
    v_summary := 'Período laboral iniciado';
  else
    v_event_key := 'employment_period_closed';
    v_summary := 'Período laboral cerrado · ' || case new.exit_type
      when 'resignation' then 'Renuncia'
      when 'dismissal' then 'Despido'
      when 'contract_end' then 'Fin de contrato'
      when 'mutual_agreement' then 'Mutuo acuerdo'
      when 'abandonment' then 'Abandono'
      else 'Otro motivo' end;
  end if;
  insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,salary_sensitive,actor_user_id,actor_label)
  values(new.organization_id,new.personnel_id,v_event_key,v_summary,
    case when tg_op='INSERT' then array['employment_start_date'] else array['employment_end_date','employment_exit_type'] end,
    false,(select auth.uid()),coalesce(v_actor_label,'Usuario del sistema'));
  return new;
end;
$$;
revoke all on function app_private.log_personnel_employment_period_event() from public,anon,authenticated;

alter table public.personnel_events drop constraint if exists personnel_events_event_key_check;
alter table public.personnel_events add constraint personnel_events_event_key_check
  check (event_key in ('record_created','record_updated','compensation_changed','account_linked','account_unlinked','employment_period_started','employment_period_closed'));
create trigger personnel_employment_period_event_log
  after insert or update on public.personnel_employment_periods
  for each row execute function app_private.log_personnel_employment_period_event();

create or replace function app_private.ensure_personnel_employment_compensation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.exit_type is null and new.exit_type is not null then
    insert into public.personnel_employment_compensation(period_id,organization_id,compensation_status)
    values(new.id,new.organization_id,'pending')
    on conflict (period_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.ensure_personnel_employment_compensation() from public,anon,authenticated;
create trigger personnel_employment_compensation_default
  after update on public.personnel_employment_periods
  for each row execute function app_private.ensure_personnel_employment_compensation();

create or replace function public.close_visualcorp_personnel_employment_period(
  p_period_id uuid,
  p_end_date date,
  p_exit_type text,
  p_exit_reason text,
  p_compensation_status text default null,
  p_exit_notes text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_personnel_id uuid;
  v_start_date date;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para registrar la salida.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_visualcorp_access(v_org,'personnel','edit') then
    raise exception 'No tienes permiso para registrar salidas laborales.' using errcode='42501';
  end if;
  if (p_compensation_status is not null or p_exit_notes is not null)
    and (not app_private.has_visualcorp_access(v_org,'personnel','edit_compensation')
      or not app_private.has_visualcorp_access(v_org,'personnel','view_compensation')) then
    raise exception 'No tienes permiso para registrar la información de liquidación.' using errcode='42501';
  end if;
  if p_compensation_status is not null
    and p_compensation_status not in ('pending','with_compensation','without_compensation','not_applicable') then
    raise exception 'La situación de liquidación no es válida.';
  end if;
  if p_exit_type not in ('resignation','dismissal','contract_end','mutual_agreement','abandonment','other') then
    raise exception 'El tipo de salida no es válido.';
  end if;
  if nullif(trim(p_exit_reason),'') is null or length(trim(p_exit_reason)) < 2 then
    raise exception 'Registra el motivo de salida.';
  end if;
  select personnel_id into v_personnel_id from public.personnel_employment_periods
    where id=p_period_id and organization_id=v_org and end_date is null and exit_type is null;
  if not found then raise exception 'El período vigente no existe o ya fue cerrado.'; end if;
  perform 1 from public.personnel_records where id=v_personnel_id and organization_id=v_org for update;
  select start_date into v_start_date from public.personnel_employment_periods
    where id=p_period_id and organization_id=v_org and end_date is null and exit_type is null
    for update;
  if not found then raise exception 'El período vigente no existe o ya fue cerrado.'; end if;
  if p_end_date is null or (v_start_date is not null and p_end_date < v_start_date) then
    raise exception 'La fecha de salida no puede ser anterior al ingreso.';
  end if;
  update public.personnel_employment_periods
    set end_date=p_end_date,exit_type=p_exit_type,exit_reason=trim(p_exit_reason)
    where id=p_period_id and organization_id=v_org;
  if p_compensation_status is not null or p_exit_notes is not null then
    update public.personnel_employment_compensation
      set compensation_status=coalesce(p_compensation_status,compensation_status),
          exit_notes=coalesce(p_exit_notes,exit_notes)
      where period_id=p_period_id and organization_id=v_org;
  end if;
end;
$$;
revoke all on function public.close_visualcorp_personnel_employment_period(uuid,date,text,text,text,text) from public,anon;
grant execute on function public.close_visualcorp_personnel_employment_period(uuid,date,text,text,text,text) to authenticated;
