-- Auditable triage for imported inventory source rows. Reviewing a match never
-- changes physical stock; only a later, verified count may create stock.
alter table public.inventory_import_rows
  add column if not exists normalized_variant_id uuid;

alter table public.inventory_import_rows
  add constraint inventory_import_rows_normalized_variant_fk
  foreign key (normalized_variant_id, organization_id)
  references public.inventory_variants (id, organization_id)
  on delete set null (normalized_variant_id);

create index if not exists inventory_import_rows_variant_idx
  on public.inventory_import_rows (organization_id, normalized_variant_id)
  where normalized_variant_id is not null;

create table public.inventory_import_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  import_row_id uuid not null references public.inventory_import_rows(id) on delete restrict,
  previous_status text not null,
  new_status text not null check (new_status in ('mapped','ignored')),
  previous_item_id uuid references public.inventory_items(id) on delete set null,
  new_item_id uuid references public.inventory_items(id) on delete set null,
  previous_variant_id uuid references public.inventory_variants(id) on delete set null,
  new_variant_id uuid references public.inventory_variants(id) on delete set null,
  note text not null default '' check (char_length(note) <= 1000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index inventory_import_review_events_row_idx
  on public.inventory_import_review_events (organization_id, import_row_id, created_at desc);
alter table public.inventory_import_review_events enable row level security;
revoke all on public.inventory_import_review_events from public, anon;
grant select on public.inventory_import_review_events to authenticated;
create policy inventory_import_review_events_staff_read
  on public.inventory_import_review_events for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse']));

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
    v_new_status := 'mapped';
  else
    if p_variant_id is not null then raise exception 'Una fila ignorada no puede quedar vinculada a una variante.'; end if;
    if v_note = '' then raise exception 'Indica por qué se excluye esta fila.'; end if;
    v_new_status := 'ignored';
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

  return jsonb_build_object('row_id', v_row.id, 'status', v_new_status,
    'normalized_item_id', v_item_id,
    'normalized_variant_id', case when p_decision = 'mapped' then p_variant_id else null end);
end;
$$;

revoke all on function public.review_inventory_import_row(uuid,text,uuid,text) from public, anon;
grant execute on function public.review_inventory_import_row(uuid,text,uuid,text) to authenticated;
