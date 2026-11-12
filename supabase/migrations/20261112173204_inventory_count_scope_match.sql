create or replace function public.begin_inventory_count_session(
  p_branch_id uuid,
  p_lines jsonb,
  p_idempotency_key uuid,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_session uuid;
  v_reused boolean := false;
  v_scope_matches boolean := true;
  v_requested_scope text[];
  v_open_scope text[];
  v_line jsonb;
  v_input record;
  v_variant uuid;
  v_location text;
  v_ordinal integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para abrir un conteo.'; end if;
  if p_idempotency_key is null then raise exception 'Falta la clave de la sesión de conteo.'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Selecciona al menos un artículo para contar.';
  end if;

  select organization_id into v_org from public.branches where id=p_branch_id;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para contar en esta sucursal.';
  end if;

  select id into v_session
    from public.inventory_count_sessions
    where organization_id=v_org and branch_id=p_branch_id and created_by=(select auth.uid()) and status='open'
    order by opened_at desc limit 1 for update;
  if v_session is not null then
    v_reused := true;
  else
    insert into public.inventory_count_sessions(organization_id,branch_id,idempotency_key,note,created_by)
    values(v_org,p_branch_id,p_idempotency_key,left(coalesce(p_note,''),1000),(select auth.uid()))
    on conflict(organization_id,created_by,idempotency_key) do nothing returning id into v_session;
    if v_session is null then
      select id into v_session from public.inventory_count_sessions where organization_id=v_org and created_by=(select auth.uid()) and idempotency_key=p_idempotency_key;
      v_reused := true;
    end if;
  end if;

  if v_reused then
    select coalesce(array_agg(scope_key order by scope_key),'{}'::text[])
      into v_requested_scope
      from (
        select distinct format(
          '%s|%s',
          nullif(value->>'variant_id','')::uuid,
          coalesce(nullif(trim(value->>'location_code'),''),'MAIN')
        ) as scope_key
        from jsonb_array_elements(p_lines)
      ) requested;
    select coalesce(array_agg(format('%s|%s',line.variant_id,line.location_code) order by line.variant_id,line.location_code),'{}'::text[])
      into v_open_scope
      from public.inventory_count_session_lines line
      where line.session_id=v_session;
    v_scope_matches := v_requested_scope=v_open_scope;
  end if;

  if not v_reused then
    for v_input in
      select value,ordinality::integer as ordinal from jsonb_array_elements(p_lines) with ordinality as input(value,ordinality)
    loop
      v_line := v_input.value;
      v_ordinal := v_input.ordinal;
      v_variant := nullif(v_line->>'variant_id','')::uuid;
      v_location := coalesce(nullif(trim(v_line->>'location_code'),''),'MAIN');
      if v_variant is null or not exists(
        select 1 from public.inventory_variants where id=v_variant and organization_id=v_org and active
      ) then raise exception 'Una de las variantes ya no está activa en esta organización.'; end if;
      insert into public.inventory_count_session_lines(
        organization_id,session_id,sequence_no,variant_id,branch_id,location_code,expected_quantity
      ) values(
        v_org,v_session,v_ordinal,v_variant,p_branch_id,v_location,
        coalesce((select quantity from public.inventory_stock where organization_id=v_org and variant_id=v_variant and branch_id=p_branch_id and location_code=v_location),0)
      ) on conflict(session_id,variant_id,location_code) do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'session_id',v_session,
    'reused',v_reused,
    'scope_matches',v_scope_matches,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',line.id,'variant_id',line.variant_id,'branch_id',line.branch_id,'location_code',line.location_code,
      'expected_quantity',line.expected_quantity,'counted_quantity',line.counted_quantity,'status',line.status,'note',line.note
    ) order by line.sequence_no),'[]'::jsonb) from public.inventory_count_session_lines line where line.session_id=v_session)
  );
end;
$$;

revoke all on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) to authenticated;
