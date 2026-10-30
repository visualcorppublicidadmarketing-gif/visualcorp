create table public.production_job_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  parent_lot_id uuid,
  label text not null default 'Lote inicial' check (length(trim(label)) between 2 and 120),
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 24),
  status text not null check (status in ('in_production','quality_check','ready_for_delivery','scheduled','delivered','installed','cancelled')),
  due_at timestamptz,
  notes text not null default '' check (length(notes)<=1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  produced_by uuid references auth.users(id) on delete set null,
  produced_at timestamptz,
  quality_by uuid references auth.users(id) on delete set null,
  quality_at timestamptz,
  delivered_by uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,job_id,organization_id),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (parent_lot_id,job_id,organization_id) references public.production_job_lots(id,job_id,organization_id) on delete restrict
);
create unique index production_job_lots_one_root_idx on public.production_job_lots(job_id) where parent_lot_id is null;
create index production_job_lots_queue_idx on public.production_job_lots(organization_id,status,due_at,job_id);
alter table public.production_job_lots enable row level security;
revoke all on public.production_job_lots from public,anon,authenticated;
grant select on public.production_job_lots to authenticated;
create policy production_job_lots_read on public.production_job_lots for select to authenticated
using (exists(select 1 from public.production_jobs j where j.id=job_id and j.organization_id=organization_id));

create or replace function app_private.configure_production_job_quantity(
  p_job_id uuid,p_quantity numeric,p_unit text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid()); v_lot uuid; v_unit text:=left(trim(coalesce(p_unit,'')),24);
begin
  if v_user is null then raise exception 'Inicia sesión para configurar cantidades.' using errcode='42501'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity>1000000 or v_unit='' then raise exception 'Indica una cantidad física y su unidad.' using errcode='22023'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status='cancelled' then raise exception 'Trabajo no disponible.' using errcode='55000'; end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
    and not (app_private.has_visualcorp_access(v_job.organization_id,'sales','edit',v_job.branch_id)
      and (v_job.advisor_id=v_user or exists(
        select 1 from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id
        where s.job_id=v_job.id and a.code='ASE' and s.assigned_to=v_user
      ))) then raise exception 'Solo coordinación o asesoría responsable puede configurar cantidades.' using errcode='42501'; end if;
  if exists(select 1 from public.production_job_lots l where l.job_id=v_job.id) then raise exception 'La cantidad física ya está configurada para este trabajo.' using errcode='23505'; end if;
  insert into public.production_job_lots(organization_id,job_id,label,quantity,unit,status,created_by)
  values(v_job.organization_id,v_job.id,'Lote inicial',p_quantity,v_unit,'in_production',v_user) returning id into v_lot;
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,'quantity_tracking_enabled',jsonb_build_object('quantity',p_quantity,'unit',v_unit,'lot_id',v_lot),v_user);
  return jsonb_build_object('job_id',v_job.id,'lot_id',v_lot,'quantity',p_quantity,'unit',v_unit,'status','in_production');
end;
$$;
revoke all on function app_private.configure_production_job_quantity(uuid,numeric,text) from public,anon,authenticated;
grant execute on function app_private.configure_production_job_quantity(uuid,numeric,text) to authenticated;
create or replace function public.configure_production_job_quantity(p_job_id uuid,p_quantity numeric,p_unit text)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.configure_production_job_quantity($1,$2,$3); $$;
revoke all on function public.configure_production_job_quantity(uuid,numeric,text) from public,anon;
grant execute on function public.configure_production_job_quantity(uuid,numeric,text) to authenticated;

create or replace function app_private.transition_production_job_lot(
  p_lot_id uuid,p_action text,p_quantity numeric default null,p_due_at timestamptz default null,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_lot public.production_job_lots%rowtype; v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid());
  v_next text; v_quantity numeric; v_remainder numeric; v_child uuid; v_event bigint; v_can_manage boolean; v_can_submit boolean;
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar el lote.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select * into v_lot from public.production_job_lots where id=p_lot_id for update;
  if not found then raise exception 'Lote no disponible.' using errcode='55000'; end if;
  select * into v_job from public.production_jobs where id=v_lot.job_id for update;
  if not found or v_job.status='cancelled' then raise exception 'Trabajo no disponible.' using errcode='55000'; end if;
  v_can_manage:=app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
    or (app_private.has_visualcorp_access(v_job.organization_id,'sales','edit',v_job.branch_id)
      and (v_job.advisor_id=v_user or exists(
        select 1 from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id
        where s.job_id=v_job.id and a.code='ASE' and s.assigned_to=v_user
      )));
  v_can_submit:=v_can_manage or exists(
    select 1 from public.production_job_steps s where s.job_id=v_job.id and s.assigned_to=v_user and s.status='in_progress'
  );
  if p_action='submit_quality' then
    if not v_can_submit then raise exception 'La producción asignada o coordinación puede enviar cantidades a control de calidad.' using errcode='42501'; end if;
    if v_lot.status<>'in_production' then raise exception 'El lote debe estar en producción para enviarlo a calidad.' using errcode='55000'; end if;
    v_next:='quality_check';
  elsif p_action='approve_quality' then
    if not v_can_manage then raise exception 'Solo coordinación o asesoría responsable puede aprobar calidad.' using errcode='42501'; end if;
    if v_lot.status<>'quality_check' then raise exception 'El lote no está pendiente de calidad.' using errcode='55000'; end if;
    v_next:='ready_for_delivery';
  elsif p_action='request_rework' then
    if not v_can_manage then raise exception 'Solo coordinación o asesoría responsable puede solicitar retrabajo.' using errcode='42501'; end if;
    if v_lot.status not in ('quality_check','ready_for_delivery','scheduled') then raise exception 'Este lote no puede volver a producción desde su estado actual.' using errcode='55000'; end if;
    if length(trim(coalesce(p_note,'')))<3 then raise exception 'Explica el motivo del retrabajo.' using errcode='22023'; end if;
    v_next:='in_production';
  elsif p_action='schedule_delivery' then
    if not v_can_manage then raise exception 'Solo coordinación o asesoría responsable puede programar la entrega.' using errcode='42501'; end if;
    if v_lot.status not in ('ready_for_delivery','scheduled') or p_due_at is null or p_due_at<now() then raise exception 'Aprueba calidad y selecciona una fecha futura.' using errcode='55000'; end if;
    v_next:='scheduled';
  elsif p_action='deliver' then
    if not v_can_manage then raise exception 'Solo coordinación o asesoría responsable puede registrar la entrega.' using errcode='42501'; end if;
    if v_lot.status not in ('ready_for_delivery','scheduled') then raise exception 'Solo se puede entregar una cantidad aprobada por calidad.' using errcode='55000'; end if;
    v_next:='delivered';
  elsif p_action='install' then
    if not v_can_manage then raise exception 'Solo coordinación o asesoría responsable puede confirmar la instalación.' using errcode='42501'; end if;
    if v_lot.status<>'delivered' then raise exception 'Registra la entrega antes de confirmar la instalación.' using errcode='55000'; end if;
    v_next:='installed';
  else raise exception 'Acción de lote desconocida.' using errcode='22023'; end if;

  v_quantity:=coalesce(p_quantity,v_lot.quantity);
  if v_quantity<=0 or v_quantity>v_lot.quantity then raise exception 'La cantidad debe ser mayor a cero y no superar el saldo de este lote (% %).',v_lot.quantity,v_lot.unit using errcode='22023'; end if;
  if p_action='schedule_delivery' and v_quantity<>v_lot.quantity then raise exception 'Programa el lote completo o divídelo antes de asignar fechas distintas.' using errcode='22023'; end if;
  v_remainder:=v_lot.quantity-v_quantity;
  if v_remainder=0 then
    update public.production_job_lots set status=v_next,due_at=case when p_action='schedule_delivery' then p_due_at else due_at end,
      notes=case when trim(coalesce(p_note,''))='' then notes else left(trim(p_note),1000) end,
      produced_by=case when p_action='submit_quality' then v_user else produced_by end,
      produced_at=case when p_action='submit_quality' then now() else produced_at end,
      quality_by=case when p_action='approve_quality' then v_user else quality_by end,
      quality_at=case when p_action='approve_quality' then now() else quality_at end,
      delivered_by=case when p_action='deliver' then v_user else delivered_by end,
      delivered_at=case when p_action='deliver' then now() else delivered_at end,
      installed_by=case when p_action='install' then v_user else installed_by end,
      installed_at=case when p_action='install' then now() else installed_at end,
      updated_at=now() where id=v_lot.id;
    v_child:=v_lot.id;
  else
    update public.production_job_lots set quantity=v_remainder,updated_at=now() where id=v_lot.id;
    insert into public.production_job_lots(organization_id,job_id,parent_lot_id,label,quantity,unit,status,due_at,notes,created_by,
      produced_by,produced_at,quality_by,quality_at,delivered_by,delivered_at,installed_by,installed_at)
    values(v_lot.organization_id,v_lot.job_id,v_lot.id,left(v_lot.label||' · parte',120),v_quantity,v_lot.unit,v_next,
      case when p_action='schedule_delivery' then p_due_at else null end,left(trim(coalesce(p_note,'')),1000),v_user,
      case when p_action='submit_quality' then v_user else null end,case when p_action='submit_quality' then now() else null end,
      case when p_action='approve_quality' then v_user else null end,case when p_action='approve_quality' then now() else null end,
      case when p_action='deliver' then v_user else null end,case when p_action='deliver' then now() else null end,
      case when p_action='install' then v_user else null end,case when p_action='install' then now() else null end)
    returning id into v_child;
  end if;
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
  values(v_lot.organization_id,v_lot.job_id,'lot_'||p_action,jsonb_build_object(
    'source_lot_id',v_lot.id,'result_lot_id',v_child,'quantity',v_quantity,'remaining_quantity',v_remainder,'unit',v_lot.unit,
    'from_status',v_lot.status,'to_status',v_next,'due_at',case when p_action='schedule_delivery' then p_due_at else null end,
    'note',left(trim(coalesce(p_note,'')),1000)),v_user) returning id into v_event;
  if p_action in ('approve_quality','schedule_delivery','deliver','install','request_rework') then
    insert into public.production_notifications(organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message)
    values(v_job.organization_id,v_job.branch_id,v_job.id,v_event,v_job.advisor_id,'fulfillment_changed',
      'Actualización de lote: '||v_job.title,trim(to_char(v_quantity,'FM999999990D9999'))||' '||v_lot.unit||' · '||replace(v_next,'_',' '))
    on conflict(event_id,recipient_user_id) do nothing;
  end if;
  return jsonb_build_object('job_id',v_job.id,'source_lot_id',v_lot.id,'result_lot_id',v_child,'quantity',v_quantity,
    'remaining_quantity',v_remainder,'unit',v_lot.unit,'status',v_next,'event_id',v_event);
end;
$$;
revoke all on function app_private.transition_production_job_lot(uuid,text,numeric,timestamptz,text) from public,anon,authenticated;
grant execute on function app_private.transition_production_job_lot(uuid,text,numeric,timestamptz,text) to authenticated;
create or replace function public.transition_production_job_lot(p_lot_id uuid,p_action text,p_quantity numeric default null,p_due_at timestamptz default null,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.transition_production_job_lot($1,$2,$3,$4,$5); $$;
revoke all on function public.transition_production_job_lot(uuid,text,numeric,timestamptz,text) from public,anon;
grant execute on function public.transition_production_job_lot(uuid,text,numeric,timestamptz,text) to authenticated;

create or replace function app_private.list_production_coordination_jobs(p_organization_id uuid,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_count bigint; v_items jsonb;
begin
  if v_user is null then raise exception 'Inicia sesión para consultar coordinación.' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 then raise exception 'Paginación no válida.' using errcode='22023'; end if;
  if not app_private.has_visualcorp_access(p_organization_id,'sales','view')
    and not app_private.has_visualcorp_access(p_organization_id,'workshop','view') then raise exception 'No tienes acceso a coordinación de trabajos.' using errcode='42501'; end if;
  with candidates as (
    select j.due_at sort_due,j.updated_at sort_updated,'job'::text source,
      jsonb_build_object('source','job','job',jsonb_build_object(
        'id',j.id,'sale_id',j.sale_id,'sale_code',j.sale_code,'title',j.title,'workflow_code',j.workflow_code,'status',j.status,
        'due_at',j.due_at,'updated_at',j.updated_at,'fulfillment_status',j.fulfillment_status,'fulfillment_due_at',j.fulfillment_due_at,
        'approval_required',j.approval_required,'artwork_review_status',j.artwork_review_status,
        'lot_summary',(select case when count(*)=0 then null else jsonb_build_object('unit',max(l.unit),'total',sum(l.quantity),
          'in_production',sum(l.quantity) filter(where l.status='in_production'),
          'quality_check',sum(l.quantity) filter(where l.status='quality_check'),
          'ready_for_delivery',sum(l.quantity) filter(where l.status='ready_for_delivery'),
          'scheduled',sum(l.quantity) filter(where l.status='scheduled'),
          'delivered',sum(l.quantity) filter(where l.status='delivered'),
          'installed',sum(l.quantity) filter(where l.status='installed')) end from public.production_job_lots l where l.job_id=j.id),
        'can_open_detail',app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id)
          or j.advisor_id=v_user or exists(select 1 from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id where s.job_id=j.id and a.code='ASE' and s.assigned_to=v_user)
      ),'steps',coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'job_id',s.job_id,'step_order',s.step_order,'title',s.title,'status',s.status,'due_at',s.due_at,
        'assigned',s.assigned_to is not null,'handoff_status',s.handoff_status,'area_id',s.area_id,'area_code',a.code,'area_name',a.name,
        'readiness_reasons',s.readiness_reasons) order by s.step_order)
        from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id where s.job_id=j.id),'[]'::jsonb)) payload
    from public.production_jobs j
    where j.organization_id=p_organization_id
      and (j.status not in ('completed','cancelled') or exists(select 1 from public.production_job_lots l where l.job_id=j.id and l.status in ('in_production','quality_check','ready_for_delivery','scheduled')))
      and (app_private.has_visualcorp_access(j.organization_id,'sales','view',j.branch_id)
        or app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id))
    union all
    select o.due_at,o.created_at,'legacy'::text,
      jsonb_build_object('source','legacy','order',jsonb_build_object(
        'id',o.id,'order_code',o.order_code,'title',o.title,'next_step',o.next_step,'priority',o.priority,
        'due_at',o.due_at,'status',o.status,'assigned',o.assigned_to is not null,
        'area_id',a.id,'area_code',a.code,'area_name',a.name,
        'can_open_detail',app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id)))
    from public.production_orders o left join public.areas a on a.id=o.area_id and a.organization_id=o.organization_id
    where o.organization_id=p_organization_id and o.status not in ('completed','cancelled')
      and (app_private.has_visualcorp_access(o.organization_id,'sales','view',o.branch_id)
        or app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id))
  ) select count(*) into v_count from candidates;
  with candidates as (
    select j.due_at sort_due,j.updated_at sort_updated,'job'::text source,
      jsonb_build_object('source','job','job',jsonb_build_object(
        'id',j.id,'sale_id',j.sale_id,'sale_code',j.sale_code,'title',j.title,'workflow_code',j.workflow_code,'status',j.status,
        'due_at',j.due_at,'updated_at',j.updated_at,'fulfillment_status',j.fulfillment_status,'fulfillment_due_at',j.fulfillment_due_at,
        'approval_required',j.approval_required,'artwork_review_status',j.artwork_review_status,
        'lot_summary',(select case when count(*)=0 then null else jsonb_build_object('unit',max(l.unit),'total',sum(l.quantity),
          'in_production',sum(l.quantity) filter(where l.status='in_production'),
          'quality_check',sum(l.quantity) filter(where l.status='quality_check'),
          'ready_for_delivery',sum(l.quantity) filter(where l.status='ready_for_delivery'),
          'scheduled',sum(l.quantity) filter(where l.status='scheduled'),
          'delivered',sum(l.quantity) filter(where l.status='delivered'),
          'installed',sum(l.quantity) filter(where l.status='installed')) end from public.production_job_lots l where l.job_id=j.id),
        'can_open_detail',app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id)
          or j.advisor_id=v_user or exists(select 1 from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id where s.job_id=j.id and a.code='ASE' and s.assigned_to=v_user)
      ),'steps',coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'job_id',s.job_id,'step_order',s.step_order,'title',s.title,'status',s.status,'due_at',s.due_at,
        'assigned',s.assigned_to is not null,'handoff_status',s.handoff_status,'area_id',s.area_id,'area_code',a.code,'area_name',a.name,
        'readiness_reasons',s.readiness_reasons) order by s.step_order)
        from public.production_job_steps s join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id where s.job_id=j.id),'[]'::jsonb)) payload
    from public.production_jobs j
    where j.organization_id=p_organization_id
      and (j.status not in ('completed','cancelled') or exists(select 1 from public.production_job_lots l where l.job_id=j.id and l.status in ('in_production','quality_check','ready_for_delivery','scheduled')))
      and (app_private.has_visualcorp_access(j.organization_id,'sales','view',j.branch_id)
        or app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id))
    union all
    select o.due_at,o.created_at,'legacy'::text,
      jsonb_build_object('source','legacy','order',jsonb_build_object(
        'id',o.id,'order_code',o.order_code,'title',o.title,'next_step',o.next_step,'priority',o.priority,
        'due_at',o.due_at,'status',o.status,'assigned',o.assigned_to is not null,
        'area_id',a.id,'area_code',a.code,'area_name',a.name,
        'can_open_detail',app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id)))
    from public.production_orders o left join public.areas a on a.id=o.area_id and a.organization_id=o.organization_id
    where o.organization_id=p_organization_id and o.status not in ('completed','cancelled')
      and (app_private.has_visualcorp_access(o.organization_id,'sales','view',o.branch_id)
        or app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id))
  ) select coalesce(jsonb_agg(payload order by sort_due nulls last,sort_updated desc,source), '[]'::jsonb) into v_items
    from (select payload,sort_due,sort_updated,source from candidates order by sort_due nulls last,sort_updated desc,source limit p_limit offset p_offset) page;
  return jsonb_build_object('total',v_count,'items',v_items);
end;
$$;
revoke all on function app_private.list_production_coordination_jobs(uuid,integer,integer) from public,anon,authenticated;
grant execute on function app_private.list_production_coordination_jobs(uuid,integer,integer) to authenticated;
create or replace function public.list_production_coordination_jobs(p_organization_id uuid,p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.list_production_coordination_jobs($1,$2,$3); $$;
revoke all on function public.list_production_coordination_jobs(uuid,integer,integer) from public,anon;
grant execute on function public.list_production_coordination_jobs(uuid,integer,integer) to authenticated;

create or replace function app_private.preserve_production_lot_delivery_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.fulfillment_status='not_ready' and old.fulfillment_status is distinct from new.fulfillment_status
    and exists(select 1 from public.production_job_lots l where l.job_id=old.id and l.status in ('delivered','installed')) then
    new.fulfillment_status:=old.fulfillment_status;
    new.fulfillment_due_at:=old.fulfillment_due_at;
    new.fulfillment_note:=old.fulfillment_note;
    new.fulfillment_by:=old.fulfillment_by;
    new.fulfillment_at:=old.fulfillment_at;
    new.quality_checked_by:=old.quality_checked_by;
    new.quality_checked_at:=old.quality_checked_at;
  end if;
  return new;
end;
$$;
revoke all on function app_private.preserve_production_lot_delivery_history() from public,anon,authenticated;
create trigger production_job_lot_preserve_delivery_history
before update of fulfillment_status,fulfillment_due_at,fulfillment_note,fulfillment_by,fulfillment_at,quality_checked_by,quality_checked_at
on public.production_jobs for each row execute function app_private.preserve_production_lot_delivery_history();
