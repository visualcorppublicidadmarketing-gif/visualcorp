-- LOCAL ONLY: durable commercial attachment intent and request-to-sale traceability.
alter table public.sales
  add column expected_asset_manifest jsonb not null default '[]',
  add column expected_assets_count integer not null default 0,
  add column asset_sync_status text not null default 'not_applicable'
    check (asset_sync_status in ('not_applicable','pending_upload','partial','synced','repair_required'));
alter table public.central_quotes
  add column expected_asset_manifest jsonb not null default '[]',
  add column expected_assets_count integer not null default 0,
  add column asset_sync_status text not null default 'not_applicable'
    check (asset_sync_status in ('not_applicable','pending_upload','partial','synced','repair_required')),
  add column parent_quote_id uuid references public.central_quotes(id),
  add column save_operation_key text;
create unique index central_quotes_save_operation_key on public.central_quotes(organization_id,created_by,save_operation_key) where save_operation_key is not null;
alter table public.commercial_document_assets add column asset_client_id text;
update public.commercial_document_assets set asset_client_id=id::text where asset_client_id is null;
alter table public.commercial_document_assets alter column asset_client_id set not null;
alter table public.commercial_document_assets alter column asset_client_id set default gen_random_uuid()::text;
alter table public.commercial_document_assets drop constraint commercial_document_assets_path_unique;
create unique index commercial_assets_client_identity on public.commercial_document_assets(document_kind,document_id,asset_client_id);
create index commercial_assets_storage_path on public.commercial_document_assets(storage_path);

create or replace function app_private.commercial_document_access(p_kind text,p_document uuid,p_action text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_branch uuid;
begin
  if p_kind='quote' then select organization_id into v_org from public.central_quotes where id=p_document;
  elsif p_kind='sale' then select organization_id,branch_id into v_org,v_branch from public.sales where id=p_document;
  end if;
  if auth.uid() is null or v_org is null or not app_private.has_visualcorp_access(v_org,case when p_kind='quote' then 'quotes' else 'sales' end,p_action,v_branch) then
    raise exception 'Documento no encontrado o sin permiso.' using errcode='42501';
  end if;
  return v_org;
end $$;
revoke all on function app_private.commercial_document_access(text,uuid,text) from public,anon,authenticated;

create or replace function app_private.refresh_commercial_asset_state(p_kind text,p_document uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_manifest jsonb; v_count integer; v_actual integer; v_status text;
begin
  if p_kind='quote' then select expected_asset_manifest into v_manifest from public.central_quotes where id=p_document for update;
  else select expected_asset_manifest into v_manifest from public.sales where id=p_document for update; end if;
  v_count:=jsonb_array_length(coalesce(v_manifest,'[]'));
  select count(*) into v_actual from jsonb_array_elements(coalesce(v_manifest,'[]')) e
    where exists(select 1 from public.commercial_document_assets a where a.document_kind=p_kind and a.document_id=p_document and a.asset_client_id=e->>'asset_client_id');
  v_status:=case when v_count=0 then 'not_applicable' when v_actual=v_count then 'synced' when v_actual=0 then 'pending_upload' else 'partial' end;
  if p_kind='quote' then update public.central_quotes set expected_assets_count=v_count,asset_sync_status=v_status where id=p_document;
  else update public.sales set expected_assets_count=v_count,asset_sync_status=v_status where id=p_document; end if;
end $$;
revoke all on function app_private.refresh_commercial_asset_state(text,uuid) from public,anon,authenticated;

create or replace function public.register_commercial_asset_intent(p_kind text,p_document uuid,p_manifest jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_existing jsonb; v_merged jsonb;
begin
  v_org:=app_private.commercial_document_access(p_kind,p_document,'edit');
  if jsonb_typeof(p_manifest) is distinct from 'array' or jsonb_array_length(p_manifest)>40 or octet_length(p_manifest::text)>50000 then
    raise exception 'Manifiesto de adjuntos inválido.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_manifest) e where coalesce(e->>'asset_client_id','') !~ '^[a-zA-Z0-9_-]{1,100}$'
    or coalesce(e->>'kind','') not in ('image','link') or length(coalesce(e->>'title',''))>160 or length(coalesce(e->>'description',''))>500)
    or (select count(*) from jsonb_array_elements(p_manifest))<>(select count(distinct e->>'asset_client_id') from jsonb_array_elements(p_manifest) e) then
    raise exception 'Identidad de adjunto inválida o duplicada.' using errcode='22023'; end if;
  if p_kind='quote' then select expected_asset_manifest into v_existing from public.central_quotes where id=p_document for update;
  else select expected_asset_manifest into v_existing from public.sales where id=p_document for update; end if;
  -- Existing intentions are immutable. A retry cannot silently replace a file or erase a missing one.
  if exists(select 1 from jsonb_array_elements(v_existing) old join jsonb_array_elements(p_manifest) fresh on old->>'asset_client_id'=fresh->>'asset_client_id' where old<>fresh) then
    raise exception 'El adjunto cambió; conserva el original o usa una nueva identidad.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(e),'[]') into v_merged from (
    select e from jsonb_array_elements(v_existing) e union select e from jsonb_array_elements(p_manifest) e
  ) merged;
  if jsonb_array_length(v_merged)>40 then raise exception 'Máximo 40 adjuntos por documento.' using errcode='22023'; end if;
  if p_kind='quote' then update public.central_quotes set expected_asset_manifest=v_merged where id=p_document;
  else update public.sales set expected_asset_manifest=v_merged where id=p_document; end if;
  perform app_private.refresh_commercial_asset_state(p_kind,p_document);
end $$;
revoke all on function public.register_commercial_asset_intent(text,uuid,jsonb) from public,anon;
grant execute on function public.register_commercial_asset_intent(text,uuid,jsonb) to authenticated;

create or replace function public.get_commercial_asset_sync(p_kind text,p_document uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_manifest jsonb; v_status text; v_actual jsonb;
begin
  v_org:=app_private.commercial_document_access(p_kind,p_document,'view');
  if p_kind='quote' then select expected_asset_manifest,asset_sync_status into v_manifest,v_status from public.central_quotes where id=p_document;
  else select expected_asset_manifest,asset_sync_status into v_manifest,v_status from public.sales where id=p_document; end if;
  select coalesce(jsonb_agg(a.asset_client_id),'[]') into v_actual from public.commercial_document_assets a where a.document_kind=p_kind and a.document_id=p_document and a.organization_id=v_org;
  return jsonb_build_object('manifest',v_manifest,'status',v_status,'uploaded_ids',v_actual);
end $$;
revoke all on function public.get_commercial_asset_sync(text,uuid) from public,anon;
grant execute on function public.get_commercial_asset_sync(text,uuid) to authenticated;

create or replace function public.finalize_commercial_asset(p_kind text,p_document uuid,p_asset_client_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_manifest jsonb; v_entry jsonb; v_path text;
begin
  v_org:=app_private.commercial_document_access(p_kind,p_document,'edit');
  if p_kind='quote' then select expected_asset_manifest into v_manifest from public.central_quotes where id=p_document for update;
  else select expected_asset_manifest into v_manifest from public.sales where id=p_document for update; end if;
  select e into v_entry from jsonb_array_elements(v_manifest) e where e->>'asset_client_id'=p_asset_client_id;
  if v_entry is null then raise exception 'Adjunto no declarado en el documento.' using errcode='22023'; end if;
  if v_entry->>'kind'='image' then
    v_path:=v_org::text||'/'||p_kind||'/'||p_document::text||'/'||p_asset_client_id;
    if not exists(select 1 from storage.objects where bucket_id='commercial-document-assets' and name=v_path
      and (metadata->>'size')::bigint=(v_entry->>'file_size')::bigint and metadata->>'mimetype'=v_entry->>'mime_type') then
      raise exception 'El archivo aún no se ha subido completo.' using errcode='22023'; end if;
  end if;
  insert into public.commercial_document_assets(organization_id,document_kind,document_id,asset_client_id,asset_type,title,description,external_url,storage_path,mime_type,file_size,sort_order)
    values(v_org,p_kind,p_document,p_asset_client_id,v_entry->>'kind',coalesce(v_entry->>'title',''),coalesce(v_entry->>'description',''),
      case when v_entry->>'kind'='link' then v_entry->>'url' end,v_path,
      case when v_path is not null then v_entry->>'mime_type' end,case when v_path is not null then (v_entry->>'file_size')::bigint end,0)
    on conflict(document_kind,document_id,asset_client_id) do nothing;
  perform app_private.refresh_commercial_asset_state(p_kind,p_document);
end $$;
revoke all on function public.finalize_commercial_asset(text,uuid,text) from public,anon;
grant execute on function public.finalize_commercial_asset(text,uuid,text) to authenticated;

create or replace function public.mark_commercial_assets_repair_required(p_kind text,p_document uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform app_private.commercial_document_access(p_kind,p_document,'edit');
  perform app_private.refresh_commercial_asset_state(p_kind,p_document);
  if p_kind='quote' then update public.central_quotes set asset_sync_status='repair_required' where id=p_document and asset_sync_status in ('pending_upload','partial');
  else update public.sales set asset_sync_status='repair_required' where id=p_document and asset_sync_status in ('pending_upload','partial'); end if;
end $$;
revoke all on function public.mark_commercial_assets_repair_required(text,uuid) from public,anon;
grant execute on function public.mark_commercial_assets_repair_required(text,uuid) to authenticated;

-- A quote and its resulting sale may reference the same immutable object.
-- Removing one link must never delete another document's binary evidence.
drop policy if exists commercial_document_assets_storage_delete on storage.objects;
create policy commercial_document_assets_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='commercial-document-assets' and not exists(select 1 from public.commercial_document_assets a where a.storage_path=name)
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and app_private.has_visualcorp_access(((storage.foldername(name))[1])::uuid,'sales','delete_records')
);

create or replace function app_private.commercial_assets_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then perform app_private.refresh_commercial_asset_state(old.document_kind,old.document_id); return old; end if;
  perform app_private.refresh_commercial_asset_state(new.document_kind,new.document_id); return new;
end $$;
create trigger commercial_assets_sync_state after insert or delete on public.commercial_document_assets for each row execute function app_private.commercial_assets_changed();
revoke all on function app_private.commercial_assets_changed() from public,anon,authenticated;

create or replace function app_private.sync_quote_request_traceability()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_customer uuid;
begin
  if new.public_request_id is not null then
    select customer_id into v_customer from public.public_requests where id=new.public_request_id for update;
    if new.customer_id is null then new.customer_id:=v_customer; end if;
    if new.customer_id is not null and not exists(select 1 from public.customers where id=new.customer_id and organization_id=new.organization_id) then
      raise exception 'Cliente de solicitud no pertenece a la organización.' using errcode='42501'; end if;
    update public.public_requests set customer_id=coalesce(new.customer_id,customer_id),
      status=case when new.status='converted' then 'won' when status in ('new','contacted','quoted') then 'quoted' else status end,updated_at=now()
      where id=new.public_request_id;
  end if;
  return new;
end $$;
create trigger quote_request_traceability before insert or update of public_request_id,customer_id,status on public.central_quotes for each row execute function app_private.sync_quote_request_traceability();
revoke all on function app_private.sync_quote_request_traceability() from public,anon,authenticated;

create or replace function public.create_commercial_quote_durable(p_payload jsonb,p_operation_key text,p_manifest jsonb,p_source_quote_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_quote public.central_quotes%rowtype; v_source public.central_quotes%rowtype; v_result jsonb; v_request uuid; v_customer uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if auth.uid() is null or not app_private.has_visualcorp_access(v_org,'quotes','edit') then raise exception 'Sin permiso para crear cotizaciones.' using errcode='42501'; end if;
  if p_operation_key is null or length(p_operation_key) not between 1 and 150 then raise exception 'Clave de operación inválida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||auth.uid()::text||p_operation_key,0));
  select * into v_quote from public.central_quotes where organization_id=v_org and created_by=auth.uid() and save_operation_key=p_operation_key;
  if found then return jsonb_build_object('id',v_quote.id,'quote_code',v_quote.quote_code,'status',v_quote.status); end if;
  v_request:=nullif(p_payload->>'p_public_request_id','')::uuid; v_customer:=nullif(p_payload->>'p_customer_id','')::uuid;
  if p_source_quote_id is not null then
    perform app_private.commercial_document_access('quote',p_source_quote_id,'view');
    select * into v_source from public.central_quotes where id=p_source_quote_id and organization_id=v_org;
    if not found then raise exception 'Cotización origen no válida.' using errcode='42501'; end if;
    v_request:=coalesce(v_request,v_source.public_request_id); v_customer:=coalesce(v_customer,v_source.customer_id);
  end if;
  v_result:=public.create_central_quote_from_request(v_customer,p_payload->>'p_customer_name',p_payload->>'p_customer_phone',p_payload->'p_items',
    (p_payload->>'p_normal')::numeric,(p_payload->>'p_installation')::numeric,(p_payload->>'p_corporate')::numeric,p_payload->>'p_chosen',
    (p_payload->>'p_selected')::numeric,(p_payload->>'p_confirmed')::boolean,p_payload->>'p_notes',p_payload->>'p_client_brief_html',v_request);
  update public.central_quotes set save_operation_key=p_operation_key,parent_quote_id=p_source_quote_id where id=(v_result->>'id')::uuid;
  perform public.register_commercial_asset_intent('quote',(v_result->>'id')::uuid,p_manifest);
  return v_result;
end $$;
revoke all on function public.create_commercial_quote_durable(jsonb,text,jsonb,uuid) from public,anon;
grant execute on function public.create_commercial_quote_durable(jsonb,text,jsonb,uuid) to authenticated;

create or replace function public.confirm_pos_sale_with_assets(
  p_idempotency_key text,p_branch_code text,p_customer_id uuid,p_customer_data jsonb,p_discount numeric,p_note text,p_allow_backorder boolean,
  p_lines jsonb,p_payments jsonb,p_fulfillment jsonb,p_production_jobs jsonb,p_client_brief_html text,p_parked_order uuid,p_expected_assets_manifest jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_sale public.sales%rowtype; v_quote public.central_quotes%rowtype;
begin
  v_result:=public.confirm_pos_sale_with_workflows(p_idempotency_key,p_branch_code,p_customer_id,p_customer_data,p_discount,p_note,p_allow_backorder,p_lines,p_payments,p_fulfillment,p_production_jobs,p_client_brief_html,p_parked_order);
  select * into v_sale from public.sales where id=(v_result->>'sale_id')::uuid for update;
  if v_sale.central_quote_id is not null then
    select * into v_quote from public.central_quotes where id=v_sale.central_quote_id and organization_id=v_sale.organization_id for update;
    update public.central_quotes set customer_id=coalesce(v_sale.customer_id,customer_id) where id=v_quote.id;
    perform public.register_commercial_asset_intent('sale',v_sale.id,v_quote.expected_asset_manifest);
    insert into public.commercial_document_assets(organization_id,document_kind,document_id,asset_client_id,asset_type,title,description,external_url,storage_path,mime_type,file_size,sort_order)
      select organization_id,'sale',v_sale.id,asset_client_id,asset_type,title,description,external_url,storage_path,mime_type,file_size,sort_order
      from public.commercial_document_assets where document_kind='quote' and document_id=v_quote.id and organization_id=v_sale.organization_id
      on conflict(document_kind,document_id,asset_client_id) do nothing;
  end if;
  perform public.register_commercial_asset_intent('sale',v_sale.id,p_expected_assets_manifest);
  return v_result;
end $$;
revoke all on function public.confirm_pos_sale_with_assets(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb,text,uuid,jsonb) from public,anon;
grant execute on function public.confirm_pos_sale_with_assets(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb,text,uuid,jsonb) to authenticated;

-- Batch balances use the authoritative return/refund calculation already used by POS.
create or replace function public.get_commercial_sale_balances(p_sale_ids uuid[])
returns table(id uuid,adjusted_total numeric,paid_total numeric,balance_due numeric,refunded numeric,customer_credit numeric)
language sql stable security definer set search_path='' as $$
  select s.id,b.adjusted_total,b.collected,b.balance,b.settled_refund,b.customer_credit
  from public.sales s cross join lateral app_private.visualcorp_sale_balance(s.organization_id,s.id) b
  where auth.uid() is not null and s.id=any(p_sale_ids) and cardinality(p_sale_ids)<=1000
    and app_private.has_visualcorp_access(s.organization_id,'sales','view',s.branch_id);
$$;
revoke all on function public.get_commercial_sale_balances(uuid[]) from public,anon;
grant execute on function public.get_commercial_sale_balances(uuid[]) to authenticated;
