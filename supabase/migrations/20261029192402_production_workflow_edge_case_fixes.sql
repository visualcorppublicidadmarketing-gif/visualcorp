-- The initial review step is an internal checkpoint used by the route-selection RPC.
-- It must be closable before the RPC writes the selected workflow code.
update public.production_job_steps s
set requirements=jsonb_set(coalesce(s.requirements,'{}'::jsonb),'{before_complete}','[]'::jsonb,true)
where s.step_key='review'
  and s.requirements->'before_complete' @> '["route_selected"]'::jsonb
  and exists (
    select 1 from public.production_jobs j
    where j.id=s.job_id and j.workflow_code='review'
  );

update public.production_workflow_templates t
set steps=(
  select coalesce(jsonb_agg(
    case when value->>'key'='review'
      then jsonb_set(value,'{requirements,before_complete}','[]'::jsonb,true)
      else value
    end order by ordinality
  ),'[]'::jsonb)
  from jsonb_array_elements(t.steps) with ordinality
)
where t.code='review'
  and exists (
    select 1 from jsonb_array_elements(t.steps) s
    where s->>'key'='review' and s#>'{requirements,before_complete}' @> '["route_selected"]'::jsonb
  );

-- Orders without a production route go straight to delivery coordination.
create or replace function app_private.production_job_completion_ready_for_quality()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_event bigint;
  v_direct boolean;
begin
  if new.status='completed' and old.status is distinct from new.status
     and new.fulfillment_status='not_ready' then
    v_direct:=new.workflow_code='none';
    update public.production_jobs
      set fulfillment_status=case when v_direct then 'ready_for_delivery' else 'quality_check' end,
          updated_at=now()
      where id=new.id;
    insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
    values(
      new.organization_id,new.id,
      case when v_direct then 'fulfillment_direct_ready' else 'quality_check_ready' end,
      jsonb_build_object(
        'message',case when v_direct
          then 'Ruta directa; trabajo listo para coordinar la entrega.'
          else 'Producción terminada; falta control de calidad.' end,
        'workflow_code',new.workflow_code
      ),
      coalesce((select auth.uid()),new.created_by)
    ) returning id into v_event;
    if new.advisor_id is not null then
      insert into public.production_notifications(
        organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message
      ) values(
        new.organization_id,new.branch_id,new.id,v_event,new.advisor_id,
        case when v_direct then 'fulfillment_changed' else 'quality_ready' end,
        case when v_direct then 'Entrega directa lista: '||new.title else 'Control de calidad pendiente: '||new.title end,
        case when v_direct
          then 'La ruta no requiere producción. Coordina la fecha y forma de entrega.'
          else 'La producción terminó. Revisa el acabado antes de programar la entrega.' end
      ) on conflict(event_id,recipient_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.production_job_completion_ready_for_quality() from public,anon,authenticated;

-- Correct completed direct-delivery jobs created before this distinction existed.
with adjusted as (
  update public.production_jobs
  set fulfillment_status='ready_for_delivery',
      fulfillment_at=coalesce(fulfillment_at,now()),
      updated_at=now()
  where status='completed' and workflow_code='none'
    and fulfillment_status in ('not_ready','quality_check')
    and quality_checked_at is null
  returning id,organization_id,branch_id,advisor_id,created_by,title
), recorded as (
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
  select organization_id,id,'fulfillment_direct_ready',
    jsonb_build_object('message','Ruta directa; trabajo listo para coordinar la entrega.','workflow_code','none'),created_by
  from adjusted
  returning id,job_id
)
insert into public.production_notifications(
  organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message
)
select a.organization_id,a.branch_id,a.id,r.id,a.advisor_id,'fulfillment_changed',
  'Entrega directa lista: '||a.title,
  'La ruta no requiere producción. Coordina la fecha y forma de entrega.'
from adjusted a
join recorded r on r.job_id=a.id
where a.advisor_id is not null
on conflict(event_id,recipient_user_id) do nothing;
