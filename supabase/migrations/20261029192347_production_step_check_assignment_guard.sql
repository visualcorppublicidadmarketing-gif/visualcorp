-- Close the last authorization gap at the row boundary as well as inside RPCs.
create or replace function app_private.guard_production_job_step_check_update()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_area text; v_user uuid:=(select auth.uid()); v_coordinator boolean;
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar la lista.' using errcode='42501'; end if;
  select * into v_step from public.production_job_steps where id=new.step_id;
  select * into v_job from public.production_jobs where id=v_step.job_id;
  if not found or v_job.status<>'open' or v_step.status not in ('ready','in_progress') then
    raise exception 'La etapa no está activa.' using errcode='55000';
  end if;
  select code into v_area from public.areas where id=v_step.area_id and organization_id=v_job.organization_id;
  v_coordinator:=app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user);
  if not v_coordinator and not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area,v_user) then
    raise exception 'No tienes permiso para esta etapa.' using errcode='42501';
  end if;
  if v_step.handoff_status='pending' then raise exception 'Recibe formalmente la etapa antes de actualizar sus controles.' using errcode='55000'; end if;
  if not v_coordinator and (v_step.assigned_to is null or v_step.assigned_to<>v_user) then
    raise exception 'Toma o recibe la etapa antes de actualizar sus controles.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_production_job_step_check_update() from public,anon,authenticated;
create trigger production_step_check_assignment_guard before update on public.production_job_step_checks
for each row execute function app_private.guard_production_job_step_check_update();

-- Recompute explanations after activating the rules so waiting cards tell staff why they cannot start.
do $refresh$
declare v_job uuid;
begin
  for v_job in select id from public.production_jobs where status='open' loop
    perform app_private.refresh_production_job_readiness(v_job);
  end loop;
end
$refresh$;
