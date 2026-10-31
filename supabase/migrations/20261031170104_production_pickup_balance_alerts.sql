create or replace function app_private.list_production_job_balance_flags(p_organization_id uuid,p_job_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Inicia sesión para consultar saldos de producción.' using errcode='42501'; end if;
  if p_job_ids is null or cardinality(p_job_ids)>100 then raise exception 'La lista de trabajos no es válida.' using errcode='22023'; end if;
  if not app_private.has_visualcorp_access(p_organization_id,'sales','view')
    and not app_private.has_visualcorp_access(p_organization_id,'workshop','view') then
    raise exception 'No tienes acceso a coordinación de trabajos.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('job_id',j.id,'balance_due',coalesce(s.total,0)>
    coalesce((select sum(sp.amount) from public.sale_payments sp where sp.organization_id=j.organization_id and sp.sale_id=j.sale_id),0)+0.009)),'[]'::jsonb)
  into v_result
  from public.production_jobs j
  left join public.sales s on s.id=j.sale_id and s.organization_id=j.organization_id
  where j.organization_id=p_organization_id and j.id=any(p_job_ids)
    and (app_private.has_visualcorp_access(j.organization_id,'sales','view',j.branch_id)
      or app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id));
  return v_result;
end;
$$;
revoke all on function app_private.list_production_job_balance_flags(uuid,uuid[]) from public,anon,authenticated;
grant execute on function app_private.list_production_job_balance_flags(uuid,uuid[]) to authenticated;
create or replace function public.list_production_job_balance_flags(p_organization_id uuid,p_job_ids uuid[])
returns jsonb language sql security invoker set search_path='' as $$
  select app_private.list_production_job_balance_flags($1,$2);
$$;
revoke all on function public.list_production_job_balance_flags(uuid,uuid[]) from public,anon;
grant execute on function public.list_production_job_balance_flags(uuid,uuid[]) to authenticated;

create or replace function app_private.production_job_completion_ready_for_quality()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event bigint; v_direct boolean; v_print_only boolean;
begin
  if new.status='completed' and old.status is distinct from new.status and new.fulfillment_status='not_ready' then
    v_direct:=new.workflow_code='none';
    v_print_only:=new.workflow_code='print';
    update public.production_jobs
      set fulfillment_status=case when v_direct then 'ready_for_delivery' else 'quality_check' end,updated_at=now()
      where id=new.id;
    insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
    values(new.organization_id,new.id,case when v_direct then 'fulfillment_direct_ready' else 'quality_check_ready' end,
      jsonb_build_object('message',case when v_direct then 'Ruta directa; trabajo listo para coordinar la entrega.'
        when v_print_only then 'Impresión terminada; verifica el acabado y avisa al cliente para coordinar el retiro.'
        else 'Producción terminada; falta control de calidad.' end,'workflow_code',new.workflow_code),
      coalesce((select auth.uid()),new.created_by)) returning id into v_event;
    if new.advisor_id is not null then
      insert into public.production_notifications(organization_id,branch_id,job_id,event_id,recipient_user_id,notification_type,title,message)
      values(new.organization_id,new.branch_id,new.id,v_event,new.advisor_id,
        case when v_direct then 'fulfillment_changed' else 'quality_ready' end,
        case when v_direct then 'Entrega directa lista: '||new.title
          when v_print_only then 'Impresión terminada: '||new.title else 'Control de calidad pendiente: '||new.title end,
        case when v_direct then 'La ruta no requiere producción. Coordina la fecha y forma de entrega.'
          when v_print_only then 'El impresor marcó el trabajo como terminado. Revisa el acabado, avisa al cliente y coordina el retiro. La entrega se registra desde la ficha.'
          else 'La producción terminó. Revisa el acabado antes de programar la entrega.' end)
      on conflict(event_id,recipient_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.production_job_completion_ready_for_quality() from public,anon,authenticated;
