alter table public.central_quotes add column if not exists client_brief_html text not null default '';
alter table public.sales add column if not exists client_brief_html text not null default '';

create table public.commercial_document_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_kind text not null check (document_kind in ('quote','sale')),
  document_id uuid not null,
  asset_type text not null check (asset_type in ('image','link')),
  title text not null default '',
  description text not null default '',
  external_url text,
  storage_path text,
  mime_type text,
  file_size bigint,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint commercial_document_assets_text_limits check (length(title) <= 160 and length(description) <= 500),
  constraint commercial_document_assets_payload_check check (
    (asset_type = 'image' and storage_path is not null and external_url is null and mime_type is not null and mime_type in ('image/jpeg','image/png','image/webp') and file_size is not null and file_size between 1 and 10485760)
    or (asset_type = 'link' and external_url is not null and external_url like 'https://%' and storage_path is null and mime_type is null and file_size is null)
  ),
  constraint commercial_document_assets_path_unique unique (storage_path)
);

create index commercial_document_assets_document_idx on public.commercial_document_assets (organization_id, document_kind, document_id, sort_order, created_at);
alter table public.commercial_document_assets enable row level security;
revoke all on public.commercial_document_assets from public, anon, authenticated;
grant select, insert, delete on public.commercial_document_assets to authenticated;

create policy commercial_document_assets_select on public.commercial_document_assets for select to authenticated using (
  (document_kind = 'quote' and exists (select 1 from public.central_quotes q where q.id = commercial_document_assets.document_id and q.organization_id = commercial_document_assets.organization_id)
   and app_private.has_visualcorp_access(organization_id, 'quotes', 'view', null))
  or
  (document_kind = 'sale' and exists (select 1 from public.sales s where s.id = commercial_document_assets.document_id and s.organization_id = commercial_document_assets.organization_id)
   and app_private.has_visualcorp_access(commercial_document_assets.organization_id, 'sales', 'view', (select s.branch_id from public.sales s where s.id = commercial_document_assets.document_id and s.organization_id = commercial_document_assets.organization_id)))
);

create policy commercial_document_assets_insert on public.commercial_document_assets for insert to authenticated with check (
  created_by = (select auth.uid()) and
  ((document_kind = 'quote' and exists (select 1 from public.central_quotes q where q.id = commercial_document_assets.document_id and q.organization_id = commercial_document_assets.organization_id)
    and app_private.has_visualcorp_access(organization_id, 'quotes', 'edit', null))
   or
   (document_kind = 'sale' and exists (select 1 from public.sales s where s.id = commercial_document_assets.document_id and s.organization_id = commercial_document_assets.organization_id)
    and app_private.has_visualcorp_access(commercial_document_assets.organization_id, 'sales', 'edit', (select s.branch_id from public.sales s where s.id = commercial_document_assets.document_id and s.organization_id = commercial_document_assets.organization_id))))
);

create policy commercial_document_assets_delete on public.commercial_document_assets for delete to authenticated using (
  (document_kind = 'quote' and app_private.has_visualcorp_access(organization_id, 'quotes', 'delete_records', null))
  or
  (document_kind = 'sale' and app_private.has_visualcorp_access(commercial_document_assets.organization_id, 'sales', 'edit', (select s.branch_id from public.sales s where s.id = commercial_document_assets.document_id and s.organization_id = commercial_document_assets.organization_id)))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('commercial-document-assets', 'commercial-document-assets', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create policy commercial_document_assets_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'commercial-document-assets' and exists (
    select 1 from public.commercial_document_assets a where a.storage_path = name and a.organization_id::text = (storage.foldername(name))[1]
      and ((a.document_kind = 'quote' and app_private.has_visualcorp_access(a.organization_id, 'quotes', 'view', null))
        or (a.document_kind = 'sale' and app_private.has_visualcorp_access(a.organization_id, 'sales', 'view', (select s.branch_id from public.sales s where s.id = a.document_id and s.organization_id = a.organization_id))))
  )
);
create policy commercial_document_assets_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'commercial-document-assets' and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and ((storage.foldername(name))[2] = 'quote' and app_private.has_visualcorp_access(((storage.foldername(name))[1])::uuid, 'quotes', 'edit', null)
    or (storage.foldername(name))[2] = 'sale' and app_private.has_visualcorp_access(((storage.foldername(name))[1])::uuid, 'sales', 'edit'))
);
create policy commercial_document_assets_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'commercial-document-assets' and (
    exists (select 1 from public.commercial_document_assets a where a.storage_path = name
      and ((a.document_kind = 'quote' and app_private.has_visualcorp_access(a.organization_id, 'quotes', 'delete_records', null))
        or (a.document_kind = 'sale' and app_private.has_visualcorp_access(a.organization_id, 'sales', 'edit', (select s.branch_id from public.sales s where s.id = a.document_id and s.organization_id = a.organization_id)))))
    or (not exists (select 1 from public.commercial_document_assets a where a.storage_path = name)
      and case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2] = 'quote' and app_private.has_visualcorp_access(((storage.foldername(name))[1])::uuid, 'quotes', 'edit', null))
          or ((storage.foldername(name))[2] = 'sale' and app_private.has_visualcorp_access(((storage.foldername(name))[1])::uuid, 'sales', 'edit', (select s.branch_id from public.sales s where s.id = ((storage.foldername(name))[3])::uuid and s.organization_id = ((storage.foldername(name))[1])::uuid)))
        else false
      end)
  )
);

-- Keep the old quote RPC available to deployed clients. The new signature is used
-- by the updated Cotizador and stores the rich client brief in its own column.
create or replace function public.create_central_quote(
  p_customer_id uuid, p_customer_name text, p_customer_phone text, p_items jsonb,
  p_normal numeric, p_installation numeric, p_corporate numeric, p_chosen text,
  p_selected numeric, p_confirmed boolean, p_notes text, p_client_brief_html text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_code text; v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
    or octet_length(p_items::text) > 50000 or p_chosen not in ('normal','installation','corporate')
    or octet_length(coalesce(p_client_brief_html,'')) > 30000 then
    raise exception 'Datos de cotización inválidos.' using errcode = '22023';
  end if;
  select id into v_org from public.organizations where slug = 'visual-corp';
  if not app_private.has_org_role(v_org, null, array['owner','admin','manager','advisor','marketing']) then raise exception 'No tienes permiso para cotizar.' using errcode = '42501'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and organization_id = v_org) then raise exception 'Cliente no pertenece a Visual Corp.' using errcode = '42501'; end if;
  if p_selected is not null and p_selected < 0 then raise exception 'Total inválido.' using errcode = '22023'; end if;
  v_code := 'COT-' || to_char(now() at time zone 'UTC','YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.central_quotes (organization_id,quote_code,customer_id,customer_name,customer_phone,items,total_normal,total_installation,total_corporate,chosen_tier,selected_total,price_confirmed,notes,client_brief_html,created_by)
  values (v_org,v_code,p_customer_id,left(trim(coalesce(p_customer_name,'')),200),left(trim(coalesce(p_customer_phone,'')),60),p_items,p_normal,p_installation,p_corporate,p_chosen,p_selected,coalesce(p_confirmed,false),left(coalesce(p_notes,''),2000),coalesce(p_client_brief_html,''),v_user)
  returning id into v_id;
  insert into public.central_quote_events (organization_id,quote_id,to_status,created_by) values (v_org,v_id,'draft',v_user);
  return jsonb_build_object('id',v_id,'quote_code',v_code,'status','draft');
end $$;
revoke all on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text) from public, anon;
grant execute on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text) to authenticated;

create or replace function public.save_pos_sale_client_brief(p_sale uuid, p_brief_html text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_branch uuid;
begin
  if auth.uid() is null or octet_length(coalesce(p_brief_html,'')) > 30000 then raise exception 'Descripción inválida.' using errcode = '22023'; end if;
  select organization_id, branch_id into v_org, v_branch from public.sales where id = p_sale and status = 'confirmed';
  if v_org is null or not app_private.has_visualcorp_access(v_org, 'sales', 'edit', v_branch) then raise exception 'Venta no encontrada o sin permiso.' using errcode = '42501'; end if;
  update public.sales set client_brief_html = coalesce(p_brief_html,''), updated_at = now() where id = p_sale;
end $$;
revoke all on function public.save_pos_sale_client_brief(uuid,text) from public, anon;
grant execute on function public.save_pos_sale_client_brief(uuid,text) to authenticated;
