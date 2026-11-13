create or replace function public.review_inventory_import_row(
  p_row_id uuid,
  p_decision text,
  p_variant_id uuid default null,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.inventory_import_rows%rowtype;
  v_item_id uuid;
  v_target_custom_fields jsonb;
  v_source_branch_name text;
  v_source_scope text;
  v_target_scope text;
  v_new_status text;
  v_note text := coalesce(trim(p_note), '');
begin
  if v_user is null then raise exception 'Inicia sesión para revisar una fila importada.'; end if;
  if p_decision not in ('mapped','ignored') then raise exception 'La decisión no es válida.'; end if;
  if char_length(v_note) > 1000 then raise exception 'La nota no puede superar 1000 caracteres.'; end if;

  select * into v_row
  from public.inventory_import_rows
  where id = p_row_id
  for update;
  if not found then raise exception 'No encontramos la fila de inventario seleccionada.'; end if;
  if not app_private.has_org_role(v_row.organization_id, null, array['owner','admin','manager','warehouse']) then
    raise exception 'No tienes permiso para revisar la cola de inventario.';
  end if;
  if v_row.mapping_status in ('imported','ignored') then
    raise exception 'Esta fila ya fue cerrada; conserva su estado e historial.';
  end if;

  if p_decision = 'mapped' then
    if p_variant_id is null then raise exception 'Selecciona la variante correcta antes de vincular.'; end if;
    select item_id into v_item_id
    from public.inventory_variants
    where id = p_variant_id and organization_id = v_row.organization_id and active;
    if v_item_id is null then raise exception 'La variante no existe o está archivada.'; end if;

    select lower(coalesce(branch.name,''))
    into v_source_branch_name
    from public.inventory_import_batches batch
    join public.branches branch
      on branch.id = batch.branch_id
     and branch.organization_id = batch.organization_id
    where batch.id = v_row.batch_id
      and batch.organization_id = v_row.organization_id;

    v_source_scope := case
      when v_source_branch_name like '%giga%' then 'giga'
      when v_source_branch_name like '%visual%' then 'visual'
      else null
    end;

    select item.custom_fields
    into v_target_custom_fields
    from public.inventory_items item
    where item.id = v_item_id
      and item.organization_id = v_row.organization_id;

    v_target_scope := case
      when lower(coalesce(v_target_custom_fields->>'brand_scope','visual')) = 'giga' then 'giga'
      else 'visual'
    end;

    if v_source_scope is not null and v_source_scope <> v_target_scope then
      raise exception 'La marca de la fuente no coincide con la del artículo. Vincula una variante del mismo alcance (Visual o Giga).'
        using errcode = '23514';
    end if;
    v_new_status := 'mapped';
  else
    if p_variant_id is not null then raise exception 'Una fila ignorada no puede quedar vinculada a una variante.'; end if;
    if v_note = '' then raise exception 'Indica por qué se excluye esta fila.'; end if;
    v_new_status := 'ignored';
    v_item_id := null;
  end if;

  update public.inventory_import_rows
  set mapping_status = v_new_status,
      normalized_item_id = v_item_id,
      normalized_variant_id = case when p_decision = 'mapped' then p_variant_id else null end,
      review_note = v_note
  where id = v_row.id;

  insert into public.inventory_import_review_events (
    organization_id, import_row_id, previous_status, new_status,
    previous_item_id, new_item_id, previous_variant_id, new_variant_id,
    note, reviewed_by
  ) values (
    v_row.organization_id, v_row.id, v_row.mapping_status, v_new_status,
    v_row.normalized_item_id, v_item_id, v_row.normalized_variant_id,
    case when p_decision = 'mapped' then p_variant_id else null end,
    v_note, v_user
  );

  return jsonb_build_object(
    'row_id', v_row.id,
    'status', v_new_status,
    'normalized_item_id', v_item_id,
    'normalized_variant_id', case when p_decision = 'mapped' then p_variant_id else null end
  );
end;
$$;

revoke all on function public.review_inventory_import_row(uuid,text,uuid,text) from public, anon;
grant execute on function public.review_inventory_import_row(uuid,text,uuid,text) to authenticated;
