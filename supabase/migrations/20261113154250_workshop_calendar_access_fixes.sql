drop policy if exists sale_fulfillment_details_branch_members_read on public.sale_fulfillment_details;
create policy sale_fulfillment_details_branch_members_read
  on public.sale_fulfillment_details for select to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_fulfillment_details.sale_id
        and s.organization_id = sale_fulfillment_details.organization_id
        and app_private.has_org_role(s.organization_id, s.branch_id)
    )
    or exists (
      select 1
      from public.production_jobs j
      where j.sale_id = sale_fulfillment_details.sale_id
        and j.organization_id = sale_fulfillment_details.organization_id
        and (
          (j.advisor_id = (select auth.uid())
            and app_private.has_visualcorp_access(j.organization_id, 'sales', 'view', j.branch_id))
          or app_private.has_visualcorp_access(j.organization_id, 'workshop', 'view', j.branch_id)
        )
    )
  );

-- Keep each child row bound to the same organization as its visible parent job.
drop policy if exists production_steps_read on public.production_job_steps;
create policy production_steps_read
  on public.production_job_steps for select to authenticated
  using (
    exists (
      select 1 from public.production_jobs j
      where j.id = production_job_steps.job_id
        and j.organization_id = production_job_steps.organization_id
    )
  );

drop policy if exists production_job_versions_read on public.production_job_spec_versions;
create policy production_job_versions_read
  on public.production_job_spec_versions for select to authenticated
  using (
    exists (
      select 1 from public.production_jobs j
      where j.id = production_job_spec_versions.job_id
        and j.organization_id = production_job_spec_versions.organization_id
    )
  );

drop policy if exists production_dependencies_read on public.production_job_step_dependencies;
create policy production_dependencies_read
  on public.production_job_step_dependencies for select to authenticated
  using (
    exists (
      select 1 from public.production_jobs j
      where j.id = production_job_step_dependencies.job_id
        and j.organization_id = production_job_step_dependencies.organization_id
    )
  );

drop policy if exists production_events_read on public.production_job_events;
create policy production_events_read
  on public.production_job_events for select to authenticated
  using (
    exists (
      select 1 from public.production_jobs j
      where j.id = production_job_events.job_id
        and j.organization_id = production_job_events.organization_id
    )
  );

create or replace function app_private.update_workshop_installation_location(
  p_job_id uuid,
  p_address text,
  p_maps_url text,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.production_jobs%rowtype;
  v_user uuid := (select auth.uid());
  v_installation_required boolean;
  v_maps_url text;
begin
  if v_user is null then
    raise exception 'Inicia sesión para actualizar la ubicación.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_address, '')), '') is null or length(btrim(p_address)) > 500 then
    raise exception 'Ingresa una dirección de hasta 500 caracteres.' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180
    or (p_latitude = 0 and p_longitude = 0) then
    raise exception 'Elige coordenadas válidas antes de guardar.' using errcode = '22023';
  end if;
  if p_maps_url is not null and length(p_maps_url) > 2048 then
    raise exception 'El enlace de Google Maps es demasiado largo.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_maps_url, '')), '') is not null
    and btrim(p_maps_url) !~* '^https://(www[.])?google[.]com/maps/|^https://maps[.]app[.]goo[.]gl/|^https://goo[.]gl/maps/' then
    raise exception 'El enlace debe ser una dirección HTTPS de Google Maps.' using errcode = '22023';
  end if;

  select j.* into v_job
  from public.production_jobs j
  where j.id = p_job_id
  for update;
  if not found then
    raise exception 'No se encontró el trabajo solicitado.' using errcode = 'P0002';
  end if;
  if not app_private.has_visualcorp_access(v_job.organization_id, 'workshop', 'edit', v_job.branch_id) then
    raise exception 'No tienes permiso para editar ubicaciones de taller en esta sucursal.' using errcode = '42501';
  end if;
  if v_job.status = 'cancelled' then
    raise exception 'No se puede cambiar la ubicación de un trabajo cancelado.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.sales s
    where s.id = v_job.sale_id and s.organization_id = v_job.organization_id
  ) then
    raise exception 'La venta vinculada no pertenece a la organización del trabajo.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.sale_fulfillment_details d
    where d.sale_id = v_job.sale_id and d.organization_id <> v_job.organization_id
  ) then
    raise exception 'Los datos de entrega de esta venta requieren revisión antes de actualizarse.' using errcode = '23514';
  end if;

  select coalesce((
      select d.installation_required
      from public.sale_fulfillment_details d
      where d.sale_id = v_job.sale_id and d.organization_id = v_job.organization_id
    ), false)
      or (v_job.specifications -> 'installation_required') = 'true'::jsonb
      or (v_job.specifications -> 'requires_installation') = 'true'::jsonb
    into v_installation_required;
  if not coalesce(v_installation_required, false) then
    raise exception 'Este trabajo no tiene una instalación registrada.' using errcode = '55000';
  end if;

  v_maps_url := nullif(btrim(coalesce(p_maps_url, '')), '');
  if v_maps_url is null then
    v_maps_url := 'https://www.google.com/maps/search/?api=1&query='
      || p_latitude::text || '%2C' || p_longitude::text;
  end if;

  insert into public.sale_fulfillment_details (
    sale_id, organization_id, installation_required, installation_address,
    installation_maps_url, installation_latitude, installation_longitude, updated_by, updated_at
  ) values (
    v_job.sale_id, v_job.organization_id, true, btrim(p_address),
    v_maps_url, p_latitude, p_longitude, v_user, now()
  )
  on conflict (sale_id) do update
    set installation_required = true,
        installation_address = excluded.installation_address,
        installation_maps_url = excluded.installation_maps_url,
        installation_latitude = excluded.installation_latitude,
        installation_longitude = excluded.installation_longitude,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.production_job_events (organization_id, job_id, event_type, details, created_by)
  values (
    v_job.organization_id,
    v_job.id,
    'installation_location_updated',
    jsonb_build_object('address', btrim(p_address), 'latitude', p_latitude, 'longitude', p_longitude, 'maps_url', v_maps_url),
    v_user
  );

  return jsonb_build_object('job_id', v_job.id, 'sale_id', v_job.sale_id, 'updated', true);
end;
$function$;

revoke all on function app_private.update_workshop_installation_location(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function app_private.update_workshop_installation_location(uuid, text, text, numeric, numeric) to authenticated;

create or replace function public.update_workshop_installation_location(
  p_job_id uuid,
  p_address text,
  p_maps_url text,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.update_workshop_installation_location($1, $2, $3, $4, $5);
$function$;

revoke all on function public.update_workshop_installation_location(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.update_workshop_installation_location(uuid, text, text, numeric, numeric) to authenticated;
