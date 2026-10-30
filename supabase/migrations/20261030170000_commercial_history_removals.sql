-- Keep accounting and inventory source records intact while allowing authorized
-- users to remove an entry from the Cotizador's shared history.
create table public.commercial_history_exclusions (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_kind text not null check (document_kind in ('quote','sale')),
  document_id uuid not null,
  branch_id uuid,
  removed_by uuid not null references auth.users(id) on delete restrict,
  removed_at timestamptz not null default now(),
  primary key (organization_id, document_kind, document_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);

create index commercial_history_exclusions_org_idx
  on public.commercial_history_exclusions (organization_id, document_kind, removed_at desc);

alter table public.commercial_history_exclusions enable row level security;
revoke all on public.commercial_history_exclusions from public, anon, authenticated;
grant select on public.commercial_history_exclusions to authenticated;

create policy commercial_history_exclusions_read
  on public.commercial_history_exclusions for select to authenticated
  using (
    (document_kind = 'quote' and app_private.has_visualcorp_access(organization_id, 'quotes', 'view', null))
    or (document_kind = 'sale' and app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id))
  );

create or replace function public.remove_commercial_history_entry(
  p_kind text,
  p_document_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_branch uuid;
  v_status text;
begin
  if v_user is null or p_kind is null or p_kind not in ('quote','sale') or p_document_id is null then
    raise exception 'Documento o sesión inválidos.' using errcode = '22023';
  end if;

  if p_kind = 'quote' then
    select organization_id into v_org
      from public.central_quotes where id = p_document_id;
    if v_org is null or not app_private.has_visualcorp_access(v_org, 'quotes', 'delete_records', null) then
      raise exception 'Cotización no encontrada o no tienes permiso para quitarla del historial.' using errcode = '42501';
    end if;
  else
    select organization_id, branch_id, status into v_org, v_branch, v_status
      from public.sales where id = p_document_id;
    if v_org is null or v_status <> 'confirmed'
      or not app_private.has_visualcorp_access(v_org, 'sales', 'delete_records', v_branch) then
      raise exception 'Venta realizada no encontrada o no tienes permiso para quitarla del historial.' using errcode = '42501';
    end if;
  end if;

  insert into public.commercial_history_exclusions (
    organization_id, document_kind, document_id, branch_id, removed_by
  ) values (
    v_org, p_kind, p_document_id, case when p_kind = 'sale' then v_branch else null end, v_user
  ) on conflict (organization_id, document_kind, document_id) do nothing;

  return jsonb_build_object('removed', true, 'kind', p_kind, 'document_id', p_document_id);
end;
$$;

revoke all on function public.remove_commercial_history_entry(text, uuid) from public, anon;
grant execute on function public.remove_commercial_history_entry(text, uuid) to authenticated;
