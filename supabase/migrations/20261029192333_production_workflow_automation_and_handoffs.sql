-- Editable production decisions, auditable area handoffs, checklists and final fulfillment.

alter table public.production_job_steps
  add column estimated_minutes integer not null default 60 check (estimated_minutes between 1 and 10080),
  add column requirements jsonb not null default '{"before_start":[],"before_complete":[]}'::jsonb
    check (jsonb_typeof(requirements)='object'),
  add column readiness_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(readiness_reasons)='array'),
  add column handoff_status text not null default 'not_required'
    check (handoff_status in ('not_required','pending','accepted')),
  add column received_by uuid references auth.users(id) on delete set null,
  add column received_at timestamptz,
  add column due_at_is_manual boolean not null default false;

alter table public.production_jobs
  add column fulfillment_status text not null default 'not_ready'
    check (fulfillment_status in ('not_ready','quality_check','ready_for_delivery','scheduled','delivered','installed')),
  add column fulfillment_due_at timestamptz,
  add column fulfillment_note text not null default '' check (length(fulfillment_note)<=2000),
  add column fulfillment_by uuid references auth.users(id) on delete set null,
  add column fulfillment_at timestamptz,
  add column quality_checked_by uuid references auth.users(id) on delete set null,
  add column quality_checked_at timestamptz;

create table public.production_job_step_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  step_id uuid not null,
  check_key text not null check (check_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text not null check (length(trim(title)) between 2 and 200),
  required boolean not null default true,
  requires_evidence boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  evidence_url text not null default '' check (length(evidence_url)<=1000),
  note text not null default '' check (length(note)<=1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (step_id,check_key),
  unique (id,organization_id),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (step_id,job_id,organization_id) references public.production_job_steps(id,job_id,organization_id) on delete cascade
);
create index production_job_step_checks_step_idx
  on public.production_job_step_checks(step_id,required,completed_at);
alter table public.production_job_step_checks enable row level security;
revoke all on public.production_job_step_checks from public,anon,authenticated;
grant select on public.production_job_step_checks to authenticated;
create policy production_job_step_checks_read on public.production_job_step_checks for select to authenticated
using (exists (
  select 1 from public.production_jobs j where j.id=production_job_step_checks.job_id
    and j.organization_id=production_job_step_checks.organization_id
    and (app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id)
      or (j.advisor_id=(select auth.uid()) and app_private.has_visualcorp_access(j.organization_id,'sales','view',j.branch_id)))
));

create table public.production_notifications (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  job_id uuid not null,
  step_id uuid,
  event_id bigint not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('step_ready','step_assigned','step_blocked','rework_requested','quality_ready','fulfillment_changed')),
  title text not null check (length(title) between 2 and 160),
  message text not null check (length(message)<=500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id,recipient_user_id),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (step_id,organization_id) references public.production_job_steps(id,organization_id),
  foreign key (event_id) references public.production_job_events(id) on delete cascade
);
create index production_notifications_inbox_idx
  on public.production_notifications(recipient_user_id,created_at desc,id desc);
alter table public.production_notifications enable row level security;
revoke all on public.production_notifications from public,anon,authenticated;
grant select on public.production_notifications to authenticated;
create policy production_notifications_read_own on public.production_notifications for select to authenticated
using (recipient_user_id=(select auth.uid()));

do $publication$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='production_notifications') then
    alter publication supabase_realtime add table public.production_notifications;
  end if;
end
$publication$;

update public.production_jobs
set fulfillment_status='quality_check'
where status='completed' and fulfillment_status='not_ready' and workflow_code<>'none';

create or replace function app_private.production_job_completion_ready_for_quality()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event bigint;
begin
  if new.status='completed' and old.status is distinct from new.status
     and new.fulfillment_status='not_ready' then
    update public.production_jobs set fulfillment_status='quality_check',updated_at=now() where id=new.id;
    insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
    values(new.organization_id,new.id,'quality_check_ready',jsonb_build_object('message','Producción terminada; falta control de calidad.'),coalesce((select auth.uid()),new.created_by))
    returning id into v_event;
    insert into public.production_notifications(organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message)
    values(new.organization_id,new.branch_id,new.id,v_event,new.advisor_id,'quality_ready','Control de calidad pendiente: '||new.title,
      'La producción terminó. Revisa el acabado antes de programar la entrega.');
  end if;
  return new;
end;
$$;
revoke all on function app_private.production_job_completion_ready_for_quality() from public,anon,authenticated;
create trigger production_job_quality_check_ready after update of status on public.production_jobs
for each row execute function app_private.production_job_completion_ready_for_quality();

create or replace function app_private.production_event_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_step public.production_job_steps%rowtype;
  v_recipient uuid; v_type text; v_title text; v_message text;
begin
  if new.event_type not in ('step_ready','step_block','step_coordinated','artwork_changes_requested') then return new; end if;
  select * into v_job from public.production_jobs where id=new.job_id;
  if new.step_id is not null then select * into v_step from public.production_job_steps where id=new.step_id; end if;
  if new.event_type='step_ready' then
    v_type:='step_ready'; v_title:='Etapa lista: '||v_step.title;
    v_message:='Las etapas previas terminaron. Revisa requisitos y recibe el trabajo.';
    if v_step.assigned_to is not null then
      insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,notification_type,title,message)
      values(v_job.organization_id,v_job.branch_id,v_job.id,v_step.id,new.id,v_step.assigned_to,v_type,left(v_title,160),left(v_message,500))
      on conflict(event_id,recipient_user_id) do nothing;
    else
      insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,notification_type,title,message)
      select v_job.organization_id,v_job.branch_id,v_job.id,v_step.id,new.id,m.user_id,v_type,left(v_title,160),left(v_message,500)
      from public.organization_memberships m where m.organization_id=v_job.organization_id and m.active
        and (m.branch_id is null or m.branch_id=v_job.branch_id)
        and app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,
          (select a.code from public.areas a where a.id=v_step.area_id),m.user_id)
      on conflict(event_id,recipient_user_id) do nothing;
      insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,notification_type,title,message)
      values(v_job.organization_id,v_job.branch_id,v_job.id,v_step.id,new.id,v_job.advisor_id,v_type,left(v_title,160),left(v_message,500))
      on conflict(event_id,recipient_user_id) do nothing;
    end if;
    return new;
  elsif new.event_type='step_block' then
    v_type:='step_blocked'; v_recipient:=v_job.advisor_id;
    v_title:='Etapa bloqueada: '||coalesce(v_step.title,v_job.title);
    v_message:=coalesce(nullif(new.details->>'note',''),'Coordinación debe revisar el motivo del bloqueo.');
  elsif new.event_type='step_coordinated' then
    v_recipient:=nullif(new.details->>'assigned_to','')::uuid;
    if v_recipient is null or v_recipient=(nullif(new.details->>'previous_assignee','')::uuid) then return new; end if;
    v_type:='step_assigned'; v_title:='Etapa asignada: '||coalesce(v_step.title,v_job.title);
    v_message:='Coordinación te asignó una tarea. Revisa su fecha y las indicaciones.';
  else
    select assigned_to into v_recipient from public.production_job_steps where job_id=new.job_id and step_key='design';
    v_type:='step_blocked'; v_recipient:=coalesce(v_recipient,v_job.advisor_id);
    v_title:='Correcciones de arte: '||v_job.title; v_message:=coalesce(nullif(new.details->>'note',''),'Asesoría solicitó cambios antes de producir.');
  end if;
  if v_recipient is not null then
    insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,notification_type,title,message)
    values(v_job.organization_id,v_job.branch_id,v_job.id,new.step_id,new.id,v_recipient,v_type,left(v_title,160),left(v_message,500))
    on conflict(event_id,recipient_user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.production_event_notifications() from public,anon,authenticated;
create trigger production_event_notify_recipient after insert on public.production_job_events
for each row execute function app_private.production_event_notifications();

update public.production_job_steps s
set estimated_minutes=60,
    requirements=case
      when s.step_key='intake' then '{"before_start":[],"before_complete":["intake_complete"]}'::jsonb
      when s.step_key='review' then '{"before_start":[],"before_complete":[]}'::jsonb
      when s.step_key='site_visit' then '{"before_start":[],"before_complete":["measurements_recorded"]}'::jsonb
      when s.step_key='design' then '{"before_start":[],"before_complete":[]}'::jsonb
      when s.step_key in ('print','laser','sublimation','workshop') then '{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}'::jsonb
      else '{"before_start":[],"before_complete":[]}'::jsonb
    end,
    handoff_status=case
      when s.status in ('in_progress','completed') then 'accepted'
      when s.status='ready' and exists(select 1 from public.production_job_step_dependencies d where d.step_id=s.id) then 'pending'
      else 'not_required'
    end,
    received_by=case when s.status in ('in_progress','completed') then s.assigned_to else null end,
    received_at=case when s.status in ('in_progress','completed') then coalesce(s.started_at,s.completed_at) else null end;

update public.production_workflow_templates t
set steps=(
  select coalesce(jsonb_agg(
    case
      when value->>'key'='intake' then value || '{"requirements":{"before_start":[],"before_complete":["intake_complete"]}}'::jsonb
      when value->>'key'='review' then value || '{"requirements":{"before_start":[],"before_complete":[]}}'::jsonb
      when value->>'key'='site_visit' then value || '{"requirements":{"before_start":[],"before_complete":["measurements_recorded"]}}'::jsonb
      when value->>'key'='design' then value || '{"requirements":{"before_start":[],"before_complete":[]}}'::jsonb
      when value->>'key' in ('print','laser','sublimation','workshop') then value || '{"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}}'::jsonb
      else value
    end order by ordinality
  ),'[]'::jsonb)
  from jsonb_array_elements(t.steps) with ordinality
)
where exists (select 1 from jsonb_array_elements(t.steps) s
  where s->>'key' in ('intake','review','site_visit','design','print','laser','sublimation','workshop'));

-- Named workflow rules fail closed and can return plain-language reasons to the UI.
create or replace function app_private.production_step_rule_satisfied(p_step uuid,p_rule text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype; v_paid numeric;
  v_width text; v_height text;
begin
  select * into v_step from public.production_job_steps where id=p_step;
  if not found then return false; end if;
  select * into v_job from public.production_jobs where id=v_step.job_id;
  if not found then return false; end if;
  case p_rule
    when 'deposit_paid' then
      if v_job.deposit_required<=0 then return true; end if;
      select coalesce(sum(amount),0) into v_paid from public.sale_payments where sale_id=v_job.sale_id;
      return v_paid>=v_job.deposit_required;
    when 'artwork_approved' then return not v_job.approval_required or v_job.artwork_review_status='approved';
    when 'intake_complete' then return app_private.production_job_intake_complete(v_job.id);
    when 'route_selected' then return v_job.workflow_code<>'review';
    when 'measurements_recorded' then
      v_width:=coalesce(v_job.specifications->>'width_cm',''); v_height:=coalesce(v_job.specifications->>'height_cm','');
      return v_width ~ '^[0-9]+([.][0-9]+)?$' and v_height ~ '^[0-9]+([.][0-9]+)?$'
        and v_width::numeric>0 and v_height::numeric>0;
    when 'artwork_submitted' then return v_job.artwork_revision>0 and v_job.artwork_reference<>'';
    when 'installation_address' then return nullif(trim(v_job.specifications->>'installation_address'),'') is not null;
    else return false;
  end case;
end;
$$;
revoke all on function app_private.production_step_rule_satisfied(uuid,text) from public,anon,authenticated;

create or replace function app_private.production_step_rule_label(p_rule text)
returns text language sql immutable set search_path='' as $$
  select case p_rule
    when 'deposit_paid' then 'anticipo completo registrado'
    when 'artwork_approved' then 'arte aprobado por asesoría'
    when 'intake_complete' then 'datos técnicos obligatorios completos'
    when 'route_selected' then 'ruta de producción definida'
    when 'measurements_recorded' then 'medidas mayores a cero registradas'
    when 'artwork_submitted' then 'arte entregado para revisión'
    when 'installation_address' then 'dirección de instalación registrada'
    else 'regla no reconocida: '||coalesce(p_rule,'(vacía)') end;
$$;
revoke all on function app_private.production_step_rule_label(text) from public,anon,authenticated;

create or replace function app_private.production_step_gate_reasons(p_step uuid,p_phase text default 'before_start')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_rule text; v_reasons jsonb:='[]'::jsonb; v_rules jsonb;
begin
  if p_phase not in ('before_start','before_complete') then raise exception 'Fase de decisión inválida.'; end if;
  select * into v_step from public.production_job_steps where id=p_step;
  if not found then return '[{"code":"step_missing","message":"Etapa no encontrada."}]'::jsonb; end if;
  select * into v_job from public.production_jobs where id=v_step.job_id;
  if not found or v_job.status<>'open' then
    return '[{"code":"job_closed","message":"El trabajo está cerrado o requiere revisión."}]'::jsonb;
  end if;
  if p_phase='before_start' and exists (
    select 1 from public.production_job_step_dependencies d
    join public.production_job_steps prior on prior.id=d.prerequisite_step_id
    where d.step_id=p_step and prior.status<>'completed'
  ) then v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('code','dependencies','message','Termina las etapas anteriores.')); end if;
  v_rules:=coalesce(v_step.requirements->p_phase,'[]'::jsonb);
  if jsonb_typeof(v_rules)<>'array' then
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('code','invalid_rules','message','La plantilla de esta etapa tiene reglas inválidas.'));
  else
    for v_rule in select value from jsonb_array_elements_text(v_rules) loop
      if not app_private.production_step_rule_satisfied(p_step,v_rule) then
        v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('code',v_rule,'message','Requiere '||app_private.production_step_rule_label(v_rule)||'.'));
      end if;
    end loop;
  end if;
  if p_phase='before_complete' and exists (
    select 1 from public.production_job_step_checks c where c.step_id=p_step and c.required and c.completed_at is null
  ) then v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('code','checklist','message','Completa la lista de control de esta etapa.')); end if;
  return v_reasons;
end;
$$;
revoke all on function app_private.production_step_gate_reasons(uuid,text) from public,anon,authenticated;

create or replace function app_private.production_step_gate_open(p_step uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select jsonb_array_length(app_private.production_step_gate_reasons(p_step,'before_start'))=0;
$$;
revoke all on function app_private.production_step_gate_open(uuid) from public,anon,authenticated;

create or replace function app_private.refresh_production_job_readiness(p_job uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_step record; v_job public.production_jobs%rowtype; v_reasons jsonb; v_event bigint;
begin
  select * into v_job from public.production_jobs where id=p_job;
  if not found then return; end if;
  for v_step in select * from public.production_job_steps where job_id=p_job and status in ('waiting','ready') order by step_order loop
    v_reasons:=app_private.production_step_gate_reasons(v_step.id,'before_start');
    if jsonb_array_length(v_reasons)=0 then
      update public.production_job_steps set status='ready',readiness_reasons='[]'::jsonb,
        handoff_status=case when exists(select 1 from public.production_job_step_dependencies d where d.step_id=v_step.id)
          then case when handoff_status='accepted' then 'accepted' else 'pending' end else 'not_required' end,
        updated_at=case when status<>'ready' or readiness_reasons<>'[]'::jsonb then now() else updated_at end
      where id=v_step.id;
      if v_step.status='waiting' then
        insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
        values(v_job.organization_id,v_job.id,v_step.id,'step_ready',jsonb_build_object('area_id',v_step.area_id,
          'handoff_required',exists(select 1 from public.production_job_step_dependencies d where d.step_id=v_step.id)),
          coalesce((select auth.uid()),v_job.created_by)) returning id into v_event;
        insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,
          notification_type,title,message)
        values(v_job.organization_id,v_job.branch_id,v_job.id,v_step.id,v_event,coalesce(v_step.assigned_to,v_job.advisor_id),
          'step_ready','Etapa lista: '||v_step.title,
          case when v_step.assigned_to is null then 'Una etapa quedó disponible y necesita responsable.'
            else 'Las etapas anteriores terminaron. Revisa los requisitos y recibe el trabajo.' end)
        on conflict(event_id,recipient_user_id) do nothing;
      end if;
    else
      update public.production_job_steps set status='waiting',readiness_reasons=v_reasons,updated_at=now()
        where id=v_step.id and (status<>'waiting' or readiness_reasons is distinct from v_reasons);
    end if;
  end loop;
end;
$$;
revoke all on function app_private.refresh_production_job_readiness(uuid) from public,anon,authenticated;

create or replace function app_private.receive_production_job_step(p_step_id uuid,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype; v_area text;
  v_user uuid:=(select auth.uid()); v_coordinator boolean;
begin
  if v_user is null then raise exception 'Inicia sesión para recibir esta etapa.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select * into v_step from public.production_job_steps where id=p_step_id for update;
  if not found then raise exception 'Etapa no encontrada.' using errcode='P0002'; end if;
  select * into v_job from public.production_jobs where id=v_step.job_id for update;
  select code into v_area from public.areas where id=v_step.area_id and organization_id=v_job.organization_id;
  v_coordinator:=app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user);
  if not v_coordinator and not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area,v_user) then raise exception 'Esta etapa corresponde a otra área.' using errcode='42501'; end if;
  if v_step.status<>'ready' or not app_private.production_step_gate_open(v_step.id) then raise exception 'La etapa todavía no cumple las condiciones para recibirse.' using errcode='55000'; end if;
  if v_step.handoff_status<>'pending' then raise exception 'Esta etapa no requiere una nueva recepción.' using errcode='55000'; end if;
  if v_step.assigned_to is not null and v_step.assigned_to<>v_user and not v_coordinator then raise exception 'La etapa está asignada a otra persona.' using errcode='42501'; end if;
  update public.production_job_steps set handoff_status='accepted',received_by=v_user,received_at=now(),assigned_to=coalesce(assigned_to,v_user),updated_at=now() where id=v_step.id;
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_step.id,'step_received',jsonb_build_object('note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('step_id',v_step.id,'handoff_status','accepted','received_by',v_user);
end;
$$;
revoke all on function app_private.receive_production_job_step(uuid,text) from public,anon,authenticated;
grant execute on function app_private.receive_production_job_step(uuid,text) to authenticated;
create or replace function public.receive_production_job_step(p_step_id uuid,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.receive_production_job_step($1,$2); $$;
revoke all on function public.receive_production_job_step(uuid,text) from public,anon;
grant execute on function public.receive_production_job_step(uuid,text) to authenticated;

create or replace function app_private.guard_production_step_update()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_reasons jsonb;
begin
  if new.status='in_progress' and old.handoff_status='pending' then raise exception 'Recibe formalmente la etapa antes de empezar.' using errcode='55000'; end if;
  if new.status='completed' and old.status<>'completed' then
    if old.handoff_status='pending' then raise exception 'Recibe formalmente la etapa antes de cerrarla.' using errcode='55000'; end if;
    v_reasons:=app_private.production_step_gate_reasons(new.id,'before_complete');
    if jsonb_array_length(v_reasons)>0 then raise exception '%',coalesce(v_reasons->0->>'message','Completa los requisitos antes de cerrar la etapa.') using errcode='55000'; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_production_step_update() from public,anon,authenticated;
create trigger production_step_handoff_and_completion_guard before update of status on public.production_job_steps
for each row execute function app_private.guard_production_step_update();

create or replace function app_private.set_production_step_check(p_check_id uuid,p_completed boolean,p_evidence_url text default '',p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_check public.production_job_step_checks%rowtype; v_step public.production_job_steps%rowtype;
  v_job public.production_jobs%rowtype; v_area text; v_user uuid:=(select auth.uid());
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar la lista.' using errcode='42501'; end if;
  if length(coalesce(p_evidence_url,''))>1000 or length(coalesce(p_note,''))>1000 then raise exception 'La evidencia o nota supera el límite.'; end if;
  if p_evidence_url<>'' and p_evidence_url !~* '^https://[^[:space:]]+$' then raise exception 'La evidencia debe ser un enlace HTTPS.' using errcode='22023'; end if;
  select * into v_check from public.production_job_step_checks where id=p_check_id for update;
  if not found then raise exception 'Punto de control no encontrado.' using errcode='P0002'; end if;
  select * into v_step from public.production_job_steps where id=v_check.step_id for update;
  select * into v_job from public.production_jobs where id=v_step.job_id for update;
  select code into v_area from public.areas where id=v_step.area_id;
  if not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area,v_user)
     and not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user) then raise exception 'No tienes permiso para esta etapa.' using errcode='42501'; end if;
  if v_step.status not in ('ready','in_progress') or v_job.status<>'open' then raise exception 'La etapa no está activa.' using errcode='55000'; end if;
  if v_step.handoff_status='pending' then raise exception 'Recibe formalmente la etapa antes de actualizar sus controles.' using errcode='55000'; end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
     and (v_step.assigned_to is null or v_step.assigned_to<>v_user) then raise exception 'Toma o recibe la etapa antes de actualizar sus controles.' using errcode='42501'; end if;
  if p_completed and v_check.requires_evidence and coalesce(nullif(trim(p_evidence_url),''),v_check.evidence_url,'')='' then raise exception 'Añade evidencia HTTPS antes de completar este control.' using errcode='22023'; end if;
  update public.production_job_step_checks set completed_at=case when p_completed then now() else null end,
    completed_by=case when p_completed then v_user else null end,
    evidence_url=case when p_completed then coalesce(nullif(trim(p_evidence_url),''),evidence_url) else '' end,
    note=left(coalesce(p_note,note,''),1000),updated_at=now() where id=v_check.id;
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_step.id,'step_check_updated',jsonb_build_object('check_id',v_check.id,
    'check_key',v_check.check_key,'title',v_check.title,'completed',p_completed,
    'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('check_id',v_check.id,'completed',p_completed);
end;
$$;
revoke all on function app_private.set_production_step_check(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function app_private.set_production_step_check(uuid,boolean,text,text) to authenticated;
create or replace function public.set_production_step_check(p_check_id uuid,p_completed boolean,p_evidence_url text default '',p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.set_production_step_check($1,$2,$3,$4); $$;
revoke all on function public.set_production_step_check(uuid,boolean,text,text) from public,anon;
grant execute on function public.set_production_step_check(uuid,boolean,text,text) to authenticated;

create or replace function app_private.mark_production_notification_read(p_notification_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para ver los avisos.' using errcode='42501'; end if;
  update public.production_notifications set read_at=now() where id=p_notification_id and recipient_user_id=(select auth.uid()) and read_at is null;
end;
$$;
revoke all on function app_private.mark_production_notification_read(bigint) from public,anon,authenticated;
grant execute on function app_private.mark_production_notification_read(bigint) to authenticated;
create or replace function public.mark_production_notification_read(p_notification_id bigint)
returns void language sql security invoker set search_path='' as $$ select app_private.mark_production_notification_read($1); $$;
revoke all on function public.mark_production_notification_read(bigint) from public,anon;
grant execute on function public.mark_production_notification_read(bigint) to authenticated;

create or replace function app_private.production_payments_refresh_jobs()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_sale uuid;
begin
  if tg_op='DELETE' then v_sale:=old.sale_id; else v_sale:=new.sale_id; end if;
  perform app_private.refresh_production_job_readiness(j.id) from public.production_jobs j where j.sale_id=v_sale and j.status='open';
  if tg_op='UPDATE' and old.sale_id is distinct from new.sale_id then
    perform app_private.refresh_production_job_readiness(j.id) from public.production_jobs j where j.sale_id=old.sale_id and j.status='open';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function app_private.production_payments_refresh_jobs() from public,anon,authenticated;
create trigger production_payments_refresh_readiness after insert or update or delete on public.sale_payments
for each row execute function app_private.production_payments_refresh_jobs();

-- New jobs inherit a transparent reverse schedule: each predecessor is due
-- before the next dependent stage by its own estimated production duration.
create or replace function app_private.create_production_job_steps(p_job uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_template public.production_workflow_templates%rowtype;
  v_step record; v_item jsonb; v_dependency text; v_step_id uuid; v_prerequisite_id uuid;
  v_prerequisite_order integer; v_base integer; v_area_id uuid; v_key text; v_minutes integer; v_index integer;
begin
  select * into v_job from public.production_jobs where id=p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  select * into v_template from public.production_workflow_templates
    where organization_id=v_job.organization_id and code=v_job.workflow_code and active;
  if not found then raise exception 'La plantilla de producción no está activa.'; end if;
  if jsonb_typeof(v_template.steps)<>'array' or jsonb_array_length(v_template.steps)>16 then raise exception 'La plantilla supera 16 etapas o no es válida.'; end if;
  select coalesce(max(step_order),0) into v_base from public.production_job_steps where job_id=p_job;
  for v_step in select value,ordinality::integer as sequence from jsonb_array_elements(v_template.steps) with ordinality loop
    if jsonb_typeof(v_step.value)<>'object' or jsonb_typeof(v_step.value->'depends_on')<>'array' then raise exception 'La plantilla % contiene un paso inválido.',v_template.code; end if;
    v_key:=v_step.value->>'key';
    select id into v_area_id from public.areas where organization_id=v_job.organization_id and code=v_step.value->>'area' and active;
    if v_area_id is null then raise exception 'Área no disponible en la plantilla %.',v_template.code; end if;
    v_minutes:=case when coalesce(v_step.value->>'estimated_minutes','') ~ '^[0-9]{1,5}$'
      then greatest(1,least(10080,(v_step.value->>'estimated_minutes')::integer)) else 60 end;
    insert into public.production_job_steps(organization_id,job_id,step_key,step_order,area_id,title,status,
      assigned_to,due_at,completed_at,estimated_minutes,requirements)
    values(v_job.organization_id,p_job,v_key,v_base+v_step.sequence,v_area_id,v_step.value->>'title',
      case when v_key='intake' and app_private.production_job_intake_complete(p_job) then 'completed'
        when v_key in ('intake','review') then 'ready' else 'waiting' end,
      case when v_key in ('intake','review') then v_job.advisor_id else null end,v_job.due_at,
      case when v_key='intake' and app_private.production_job_intake_complete(p_job) then now() else null end,
      v_minutes,case when jsonb_typeof(v_step.value->'requirements')='object' then v_step.value->'requirements'
        else '{"before_start":[],"before_complete":[]}'::jsonb end);
  end loop;
  for v_step in select value,ordinality::integer as sequence from jsonb_array_elements(v_template.steps) with ordinality loop
    select id into v_step_id from public.production_job_steps where job_id=p_job and step_key=v_step.value->>'key';
    for v_dependency in select value from jsonb_array_elements_text(v_step.value->'depends_on') loop
      select id,step_order into v_prerequisite_id,v_prerequisite_order from public.production_job_steps where job_id=p_job and step_key=v_dependency;
      if v_prerequisite_id is null or v_prerequisite_order>=v_base+v_step.sequence then raise exception 'Dependencia inválida en la plantilla %.',v_template.code; end if;
      insert into public.production_job_step_dependencies(organization_id,job_id,step_id,prerequisite_step_id)
      values(v_job.organization_id,p_job,v_step_id,v_prerequisite_id);
    end loop;
    if jsonb_typeof(v_step.value->'checklist')='array' then
      if jsonb_array_length(v_step.value->'checklist')>20 then raise exception 'Cada etapa admite hasta 20 puntos de control.'; end if;
      v_index:=0;
      for v_item in select value from jsonb_array_elements(v_step.value->'checklist') loop
        v_index:=v_index+1;
        insert into public.production_job_step_checks(organization_id,job_id,step_id,check_key,title,required,requires_evidence)
        values(v_job.organization_id,p_job,v_step_id,
          case when coalesce(v_item->>'key','') ~ '^[a-z][a-z0-9_]{1,63}$' then v_item->>'key' else 'check_'||v_index end,
          coalesce(nullif(trim(v_item->>'title'),''),'Verificación '||v_index),
          coalesce((v_item->>'required')::boolean,true),coalesce((v_item->>'requires_evidence')::boolean,false));
      end loop;
    end if;
  end loop;
  if v_job.due_at is not null then
    for v_step in select s.id,s.estimated_minutes from public.production_job_steps s where s.job_id=p_job order by s.step_order desc loop
      update public.production_job_steps s set due_at=(
        select coalesce(min(next_step.due_at),v_job.due_at)-make_interval(mins=>v_step.estimated_minutes)
        from public.production_job_step_dependencies d join public.production_job_steps next_step on next_step.id=d.step_id
        where d.prerequisite_step_id=v_step.id)
      where s.id=v_step.id and not s.due_at_is_manual;
    end loop;
  end if;
  perform app_private.refresh_production_job_readiness(p_job);
end;
$$;
revoke all on function app_private.create_production_job_steps(uuid) from public,anon,authenticated;

-- Existing coordinator dates are preserved; only newly generated routes use auto scheduling.
update public.production_job_steps set due_at_is_manual=true where due_at is not null;

create or replace function app_private.coordinate_production_job_step(
  p_step_id uuid,p_expected_updated_at timestamptz,p_assigned_to uuid,p_due_at timestamptz,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype; v_area text;
  v_user uuid:=(select auth.uid()); v_job_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para coordinar esta tarea.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select job_id into v_job_id from public.production_job_steps where id=p_step_id;
  if not found then raise exception 'Tarea no encontrada.' using errcode='P0002'; end if;
  select * into v_job from public.production_jobs where id=v_job_id for update;
  select * into v_step from public.production_job_steps where id=p_step_id for update;
  if v_job.status in ('completed','cancelled') or v_step.status in ('completed','cancelled') then raise exception 'Esta etapa ya está cerrada.' using errcode='55000'; end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user) then raise exception 'Solo coordinación puede asignar y programar etapas.' using errcode='42501'; end if;
  if p_expected_updated_at is distinct from v_step.updated_at then raise exception 'La etapa cambió. Actualiza la ficha antes de guardar.' using errcode='40001'; end if;
  select code into v_area from public.areas where id=v_step.area_id and organization_id=v_job.organization_id;
  if p_assigned_to is not null and not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area,p_assigned_to) then raise exception 'La persona no tiene acceso activo a esta área.' using errcode='42501'; end if;
  if v_step.assigned_to is not distinct from p_assigned_to and v_step.due_at is not distinct from p_due_at then raise exception 'Cambia el responsable o la fecha antes de guardar.' using errcode='22023'; end if;
  update public.production_job_steps set assigned_to=p_assigned_to,due_at=p_due_at,
    due_at_is_manual=(p_due_at is not null),updated_at=now() where id=p_step_id;
  update public.production_jobs set updated_at=now() where id=v_job.id;
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_step.id,'step_coordinated',jsonb_build_object(
    'previous_assignee',v_step.assigned_to,'assigned_to',p_assigned_to,
    'previous_due_at',v_step.due_at,'due_at',p_due_at,'manual_due_at',p_due_at is not null,
    'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('step_id',v_step.id,'job_id',v_job.id,'assigned_to',p_assigned_to,'due_at',p_due_at);
end;
$$;
revoke all on function app_private.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function app_private.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) to authenticated;
create or replace function public.coordinate_production_job_step(p_step_id uuid,p_expected_updated_at timestamptz,p_assigned_to uuid,p_due_at timestamptz,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.coordinate_production_job_step($1,$2,$3,$4,$5); $$;
revoke all on function public.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) from public,anon;
grant execute on function public.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) to authenticated;

create or replace function app_private.request_production_job_rework(p_report_step uuid,p_target_step uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_report public.production_job_steps%rowtype; v_target public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_user uuid:=(select auth.uid()); v_area text; v_coordinator boolean; v_affected uuid[]; v_checks jsonb; v_event bigint;
begin
  if v_user is null then raise exception 'Inicia sesión para solicitar retrabajo.' using errcode='42501'; end if;
  if length(trim(coalesce(p_note,'')))<3 or length(p_note)>1000 then raise exception 'Explica el retrabajo solicitado (3 a 1000 caracteres).' using errcode='22023'; end if;
  select * into v_report from public.production_job_steps where id=p_report_step for update;
  select * into v_target from public.production_job_steps where id=p_target_step for update;
  if not found or v_report.job_id<>v_target.job_id or v_report.status<>'completed' or v_target.status<>'completed' then raise exception 'Elige etapas terminadas del mismo trabajo.' using errcode='55000'; end if;
  select * into v_job from public.production_jobs where id=v_report.job_id for update;
  select code into v_area from public.areas where id=v_report.area_id;
  v_coordinator:=app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user);
  if not v_coordinator and not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area,v_user) then raise exception 'No tienes permiso para solicitar cambios desde esta área.' using errcode='42501'; end if;
  if not exists(with recursive ancestors(id) as (
    select p_report_step union select d.prerequisite_step_id from public.production_job_step_dependencies d join ancestors a on d.step_id=a.id
  ) select 1 from ancestors where id=p_target_step) then raise exception 'El retrabajo debe apuntar a una etapa anterior del recorrido.' using errcode='22023'; end if;
  with recursive descendants(id) as (
    select p_target_step union select d.step_id from public.production_job_step_dependencies d join descendants x on d.prerequisite_step_id=x.id
  ) select array_agg(id) into v_affected from descendants;
  select coalesce(jsonb_agg(jsonb_build_object('step_id',c.step_id,'check_key',c.check_key,'completed_at',c.completed_at,'evidence_url',c.evidence_url)),'[]'::jsonb)
    into v_checks from public.production_job_step_checks c where c.step_id=any(v_affected) and c.completed_at is not null;
  update public.production_job_steps set status='waiting',started_at=null,completed_at=null,
    handoff_status=case when exists(select 1 from public.production_job_step_dependencies d where d.step_id=production_job_steps.id) then 'pending' else 'not_required' end,
    received_by=null,received_at=null,updated_at=now()
  where id=any(v_affected) and status in ('ready','in_progress','completed');
  update public.production_job_step_checks set completed_at=null,completed_by=null,evidence_url='',updated_at=now()
    where step_id=any(v_affected) and completed_at is not null;
  update public.production_jobs set status='open',fulfillment_status='not_ready',fulfillment_due_at=null,
    fulfillment_note='',fulfillment_by=null,fulfillment_at=null,quality_checked_by=null,quality_checked_at=null,updated_at=now()
    where id=v_job.id;
  perform app_private.refresh_production_job_readiness(v_job.id);
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_target.id,'rework_requested',jsonb_build_object(
    'report_step_id',v_report.id,'report_step_title',v_report.title,'target_step_id',v_target.id,
    'target_step_title',v_target.title,'affected_step_ids',to_jsonb(v_affected),'reset_checks',v_checks,'note',left(trim(p_note),1000)),v_user)
  returning id into v_event;
  insert into public.production_notifications(organization_id,branch_id,job_id,step_id,event_id,recipient_user_id,notification_type,title,message)
  values(v_job.organization_id,v_job.branch_id,v_job.id,v_target.id,v_event,coalesce(v_target.assigned_to,v_job.advisor_id),
    'rework_requested','Retrabajo solicitado: '||v_target.title,left(trim(p_note),500));
  return jsonb_build_object('job_id',v_job.id,'reopened_steps',to_jsonb(v_affected));
end;
$$;
revoke all on function app_private.request_production_job_rework(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app_private.request_production_job_rework(uuid,uuid,text) to authenticated;
create or replace function public.request_production_job_rework(p_report_step uuid,p_target_step uuid,p_note text)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.request_production_job_rework($1,$2,$3); $$;
revoke all on function public.request_production_job_rework(uuid,uuid,text) from public,anon;
grant execute on function public.request_production_job_rework(uuid,uuid,text) to authenticated;

create or replace function app_private.transition_production_job_fulfillment(
  p_job_id uuid,p_action text,p_due_at timestamptz default null,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid()); v_next text; v_event bigint;
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar la entrega.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status='cancelled' then raise exception 'Trabajo no disponible.' using errcode='55000'; end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
     and not (v_job.advisor_id=v_user and app_private.has_visualcorp_access(v_job.organization_id,'sales','edit',v_job.branch_id)) then
    raise exception 'Solo coordinación o asesoría responsable puede gestionar calidad y entrega.' using errcode='42501'; end if;
  if p_action='quality_pass' then
    if v_job.status<>'completed' or v_job.fulfillment_status<>'quality_check' then raise exception 'La producción debe estar terminada y pendiente de control de calidad.' using errcode='55000'; end if;
    v_next:='ready_for_delivery';
    update public.production_jobs set fulfillment_status=v_next,quality_checked_by=v_user,quality_checked_at=now(),fulfillment_by=v_user,fulfillment_at=now(),fulfillment_note=left(p_note,2000),updated_at=now() where id=v_job.id;
  elsif p_action='schedule_delivery' then
    if v_job.status<>'completed' or v_job.fulfillment_status not in ('ready_for_delivery','scheduled') or p_due_at is null or p_due_at<now() then raise exception 'Aprueba calidad y selecciona una fecha de entrega futura.' using errcode='55000'; end if;
    v_next:='scheduled';
    update public.production_jobs set fulfillment_status=v_next,fulfillment_due_at=p_due_at,fulfillment_by=v_user,fulfillment_at=now(),fulfillment_note=left(p_note,2000),updated_at=now() where id=v_job.id;
  elsif p_action='deliver' then
    if v_job.fulfillment_status not in ('ready_for_delivery','scheduled') then raise exception 'Primero aprueba calidad y prepara la entrega.' using errcode='55000'; end if;
    v_next:='delivered';
    update public.production_jobs set fulfillment_status=v_next,fulfillment_by=v_user,fulfillment_at=now(),fulfillment_note=left(p_note,2000),updated_at=now() where id=v_job.id;
  elsif p_action='install' then
    if v_job.fulfillment_status<>'delivered' then raise exception 'Registra la entrega antes de confirmar la instalación.' using errcode='55000'; end if;
    v_next:='installed';
    update public.production_jobs set fulfillment_status=v_next,fulfillment_by=v_user,fulfillment_at=now(),fulfillment_note=left(p_note,2000),updated_at=now() where id=v_job.id;
  else raise exception 'Acción de entrega desconocida.' using errcode='22023'; end if;
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,'fulfillment_'||p_action,jsonb_build_object('from_status',v_job.fulfillment_status,
    'to_status',v_next,'due_at',case when p_action='schedule_delivery' then p_due_at else v_job.fulfillment_due_at end,'note',left(p_note,1000)),v_user)
  returning id into v_event;
  insert into public.production_notifications(organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message)
  values(v_job.organization_id,v_job.branch_id,v_job.id,v_event,v_job.advisor_id,'fulfillment_changed',
    'Entrega actualizada: '||v_job.title,'Estado de entrega: '||replace(v_next,'_',' ')) on conflict(event_id,recipient_user_id) do nothing;
  return jsonb_build_object('job_id',v_job.id,'fulfillment_status',v_next,'fulfillment_due_at',p_due_at);
end;
$$;
revoke all on function app_private.transition_production_job_fulfillment(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function app_private.transition_production_job_fulfillment(uuid,text,timestamptz,text) to authenticated;
create or replace function public.transition_production_job_fulfillment(p_job_id uuid,p_action text,p_due_at timestamptz default null,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.transition_production_job_fulfillment($1,$2,$3,$4); $$;
revoke all on function public.transition_production_job_fulfillment(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.transition_production_job_fulfillment(uuid,text,timestamptz,text) to authenticated;
