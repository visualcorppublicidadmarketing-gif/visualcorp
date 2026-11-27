-- Priority 3. Local migration only: coordination metadata and private production files.
create or replace function app_private.can_coordinate_production(
  p_organization_id uuid,p_branch_id uuid,p_user_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id=(select auth.uid())
    and app_private.has_visualcorp_access(p_organization_id,'workshop','edit',p_branch_id)
    and exists (
      select 1 from public.organization_memberships m
      left join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id and p.active
      where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
        and (m.branch_id is null or m.branch_id=p_branch_id)
        and (m.role in ('owner','admin') or p.profile_key in ('admin','gerencia','coordinador_taller','encargado_local'))
    );
$$;
revoke all on function app_private.can_coordinate_production(uuid,uuid,uuid) from public,anon,authenticated;

-- A converted request remains open until the purchase order is received or closed.
-- Consumption is scoped to the exact sale line, not every job on the sale.
create or replace function app_private.production_job_material_blocked(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.production_jobs j
    where j.id=p_job_id and (
      exists(select 1 from public.sale_material_consumptions c
        where c.organization_id=j.organization_id and c.sale_line_id=j.sale_line_id
          and c.backordered_quantity>0 and c.status<>'released')
      or exists(select 1 from public.purchase_requests r
        left join public.purchase_orders o on o.id=r.purchase_order_id and o.organization_id=r.organization_id
        where r.organization_id=j.organization_id and r.production_job_id=j.id
          and (r.status in ('submitted','approved')
            or (r.status='converted' and coalesce(o.status,'requested') not in ('received','rejected','cancelled','closed_partial'))))
    )
  );
$$;
revoke all on function app_private.production_job_material_blocked(uuid) from public,anon,authenticated;

-- Batch metadata for area queues, calendar and attention; authorization is checked per job.
create or replace function public.production_coordination_metadata(p_organization_id uuid,p_job_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  if coalesce(cardinality(p_job_ids),0)>1000 then raise exception 'Demasiados trabajos.' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',j.id,'material_blocked',app_private.production_job_material_blocked(j.id),
    'advisor_name',(select nullif(trim(p.full_name),'') from public.profiles p where p.user_id=j.advisor_id),
    'steps',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'assigned_name',p.full_name))
      from public.production_job_steps s left join public.profiles p on p.user_id=s.assigned_to
      where s.job_id=j.id and s.organization_id=j.organization_id),'[]'::jsonb)
  )) from public.production_jobs j
    where j.organization_id=p_organization_id and j.id=any(p_job_ids)
      and (app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id)
        or (app_private.has_visualcorp_access(j.organization_id,'sales','view',j.branch_id)
          and (j.advisor_id=(select auth.uid()) or exists(select 1 from public.production_job_steps s
            where s.job_id=j.id and s.assigned_to=(select auth.uid())))))), '[]'::jsonb);
end;
$$;
revoke all on function public.production_coordination_metadata(uuid,uuid[]) from public,anon;
grant execute on function public.production_coordination_metadata(uuid,uuid[]) to authenticated;

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
        'organization_id',j.organization_id,'branch_id',j.branch_id,'customer_name',j.customer_name,
        'advisor_id',j.advisor_id,'specifications',j.specifications,'material_blocked',app_private.production_job_material_blocked(j.id),
        'artwork_reference',j.artwork_reference,'created_at',j.created_at,'id',j.id,'sale_id',j.sale_id,'sale_code',j.sale_code,'title',j.title,'workflow_code',j.workflow_code,'status',j.status,
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
        'assigned_to',s.assigned_to,'assigned_name',(select nullif(trim(p.full_name),'') from public.profiles p where p.user_id=s.assigned_to),
        'notes',s.notes,'step_key',s.step_key,'created_at',s.created_at,'updated_at',s.updated_at,'assigned',s.assigned_to is not null,'handoff_status',s.handoff_status,'area_id',s.area_id,'area_code',a.code,'area_name',a.name,
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
        'due_at',o.due_at,'status',o.status,'assigned_to',o.assigned_to,
        'assigned_name',(select nullif(trim(p.full_name),'') from public.profiles p where p.user_id=o.assigned_to),'assigned',o.assigned_to is not null,
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
        'organization_id',j.organization_id,'branch_id',j.branch_id,'customer_name',j.customer_name,
        'advisor_id',j.advisor_id,'specifications',j.specifications,'material_blocked',app_private.production_job_material_blocked(j.id),
        'artwork_reference',j.artwork_reference,'created_at',j.created_at,'id',j.id,'sale_id',j.sale_id,'sale_code',j.sale_code,'title',j.title,'workflow_code',j.workflow_code,'status',j.status,
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
        'assigned_to',s.assigned_to,'assigned_name',(select nullif(trim(p.full_name),'') from public.profiles p where p.user_id=s.assigned_to),
        'notes',s.notes,'step_key',s.step_key,'created_at',s.created_at,'updated_at',s.updated_at,'assigned',s.assigned_to is not null,'handoff_status',s.handoff_status,'area_id',s.area_id,'area_code',a.code,'area_name',a.name,
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
        'due_at',o.due_at,'status',o.status,'assigned_to',o.assigned_to,
        'assigned_name',(select nullif(trim(p.full_name),'') from public.profiles p where p.user_id=o.assigned_to),'assigned',o.assigned_to is not null,
        'area_id',a.id,'area_code',a.code,'area_name',a.name,
        'can_open_detail',app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id)))
    from public.production_orders o left join public.areas a on a.id=o.area_id and a.organization_id=o.organization_id
    where o.organization_id=p_organization_id and o.status not in ('completed','cancelled')
      and (app_private.has_visualcorp_access(o.organization_id,'sales','view',o.branch_id)
        or app_private.has_visualcorp_access(o.organization_id,'workshop','view',o.branch_id))
  ) select coalesce(jsonb_agg(
    case
      when source='job' and coalesce((payload->'job'->>'can_open_detail')::boolean,false)=false then
        jsonb_build_object('source','job','job',jsonb_build_object(
          'id',payload->'job'->'id','title','Trabajo restringido','status',payload->'job'->'status',
          'due_at',payload->'job'->'due_at','can_open_detail',false),'steps','[]'::jsonb)
      when source='legacy' and coalesce((payload->'order'->>'can_open_detail')::boolean,false)=false then
        jsonb_build_object('source','legacy','order',jsonb_build_object(
          'id',payload->'order'->'id','title','Orden restringida','status',payload->'order'->'status',
          'due_at',payload->'order'->'due_at','assigned',false,'can_open_detail',false))
      else payload
    end order by sort_due nulls last,sort_updated desc,source), '[]'::jsonb) into v_items
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


-- Object keys: organization UUID / branch UUID / uploader UUID / random UUID-filename.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('production-vault','production-vault',false,52428800,array[
  'image/png','image/jpeg','image/webp','image/svg+xml','application/pdf',
  'application/postscript','image/vnd.adobe.photoshop','application/x-photoshop',
  'application/vnd.corel-draw','application/x-coreldraw','application/dxf','image/vnd.dxf',
  'application/octet-stream'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.can_access_production_vault(p_name text,p_action text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(p_name,'/'); org uuid; branch uuid;
begin
  if (select auth.uid()) is null or cardinality(parts)<>4 or p_action not in ('view','edit') then return false; end if;
  begin org:=parts[1]::uuid; branch:=parts[2]::uuid;
    perform parts[3]::uuid;
  exception when invalid_text_representation then return false; end;
  if not exists(select 1 from public.branches b where b.id=branch and b.organization_id=org) then return false; end if;
  return app_private.has_visualcorp_access(org,'workshop',p_action,branch);
end;
$$;
revoke all on function app_private.can_access_production_vault(text,text) from public,anon;
grant execute on function app_private.can_access_production_vault(text,text) to authenticated;
create policy production_vault_read on storage.objects for select to authenticated
  using(bucket_id='production-vault' and app_private.can_access_production_vault(name,'view'));
create policy production_vault_insert on storage.objects for insert to authenticated
  with check(bucket_id='production-vault' and app_private.can_access_production_vault(name,'edit')
    and split_part(name,'/',3)=(select auth.uid())::text);
create policy production_vault_delete on storage.objects for delete to authenticated
  using(bucket_id='production-vault' and app_private.can_access_production_vault(name,'edit'));
