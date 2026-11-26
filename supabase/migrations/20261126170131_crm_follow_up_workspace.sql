-- Shared CRM follow-up fields, audit history, and permission-checked inbox APIs.
alter table public.public_requests
  add column if not exists source text not null default 'Sitio web',
  add column if not exists company text not null default '',
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_action text not null default '',
  add column if not exists lost_reason text not null default '';

create table if not exists public.public_request_activity (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.public_requests(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('created','stage','assignment','follow_up','note','contact','customer')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists public_request_activity_timeline_idx
  on public.public_request_activity(request_id, created_at desc);
alter table public.public_request_activity enable row level security;
revoke all on public.public_request_activity from anon, authenticated;

alter table public.central_quotes add column if not exists public_request_id uuid
  references public.public_requests(id) on delete set null;
create index if not exists central_quotes_public_request_idx
  on public.central_quotes(public_request_id, created_at desc) where public_request_id is not null;

create or replace function public.get_visualcorp_crm_inbox(
  p_view text default 'all', p_search text default '', p_stage text default 'all',
  p_source text default 'all', p_assignee text default 'all', p_from date default null,
  p_to date default null, p_period text default '30d', p_page integer default 1,
  p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_total bigint; v_new bigint; v_unassigned bigint; v_overdue bigint;
  v_today bigint; v_won bigint; v_received bigint; v_period_start timestamptz;
  v_today_start timestamptz; v_today_end timestamptz; v_items jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar el CRM.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','view') then raise exception 'No tienes permiso para consultar el CRM.' using errcode='42501'; end if;
  if p_view not in ('mine','unassigned','overdue','all','today') or p_stage not in ('all','new','contacted','quoted','won','lost','closed') then raise exception 'Filtro inválido.' using errcode='22023'; end if;
  v_today_start := date_trunc('day', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil';
  v_today_end := v_today_start + interval '1 day';
  v_period_start := case p_period when '7d' then now()-interval '7 days' when '90d' then now()-interval '90 days' when 'all' then '-infinity'::timestamptz else now()-interval '30 days' end;
  select count(*) filter (where status='new'), count(*) filter (where assigned_to is null and status not in ('won','lost','closed')),
    count(*) filter (where follow_up_at < v_today_start and status not in ('won','lost','closed')),
    count(*) filter (where follow_up_at >= v_today_start and follow_up_at < v_today_end and status not in ('won','lost','closed'))
  into v_new,v_unassigned,v_overdue,v_today from public.public_requests;
  select count(*), count(*) filter (where status='won') into v_received,v_won from public.public_requests where created_at >= v_period_start;
  select count(*) into v_total from public.public_requests r
    where (p_stage='all' or r.status=p_stage)
      and (p_source='all' or r.source=p_source or (p_source='Cotizador público' and r.request_type='quote' and r.source='Sitio web'))
      and (p_assignee='all' or (p_assignee='unassigned' and r.assigned_to is null) or r.assigned_to::text=p_assignee)
      and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'America/Guayaquil'))
      and (p_to is null or r.created_at < ((p_to+1)::timestamp at time zone 'America/Guayaquil'))
      and (nullif(trim(p_search),'') is null or concat_ws(' ',r.name,r.company,r.phone,r.email,r.service,r.message) ilike '%'||trim(p_search)||'%')
      and (p_view='all' or (p_view='mine' and r.assigned_to=auth.uid() and r.status not in ('won','lost','closed')) or (p_view='unassigned' and r.assigned_to is null and r.status not in ('won','lost','closed')) or (p_view='overdue' and r.follow_up_at < v_today_start and r.status not in ('won','lost','closed')) or (p_view='today' and r.follow_up_at >= v_today_start and r.follow_up_at < v_today_end and r.status not in ('won','lost','closed')));
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.priority,
    case when page_row.priority=0 then page_row.sort_at end asc nulls last,
    case when page_row.priority>0 then page_row.sort_at end desc nulls last,page_row.id desc), '[]'::jsonb) into v_items
  from (
    select r.id,r.request_type,r.name,r.company,r.phone,r.email,r.service,r.message,r.quote_data,r.status,r.source,
      r.assigned_to,r.follow_up_at,r.follow_up_action,r.lost_reason,r.customer_id,r.created_at,r.updated_at,
      coalesce(nullif(p.full_name,''),p.email,'') as assigned_name,
      case when r.follow_up_at < v_today_start and r.status not in ('won','lost','closed') then 0 when r.status='new' then 1 else 2 end as priority,
      coalesce(r.follow_up_at,r.created_at) as sort_at
    from public.public_requests r left join public.profiles p on p.user_id=r.assigned_to
    where (p_stage='all' or r.status=p_stage)
      and (p_source='all' or r.source=p_source or (p_source='Cotizador público' and r.request_type='quote' and r.source='Sitio web'))
      and (p_assignee='all' or (p_assignee='unassigned' and r.assigned_to is null) or r.assigned_to::text=p_assignee)
      and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'America/Guayaquil'))
      and (p_to is null or r.created_at < ((p_to+1)::timestamp at time zone 'America/Guayaquil'))
      and (nullif(trim(p_search),'') is null or concat_ws(' ',r.name,r.company,r.phone,r.email,r.service,r.message) ilike '%'||trim(p_search)||'%')
      and (p_view='all' or (p_view='mine' and r.assigned_to=auth.uid() and r.status not in ('won','lost','closed')) or (p_view='unassigned' and r.assigned_to is null and r.status not in ('won','lost','closed')) or (p_view='overdue' and r.follow_up_at < v_today_start and r.status not in ('won','lost','closed')) or (p_view='today' and r.follow_up_at >= v_today_start and r.follow_up_at < v_today_end and r.status not in ('won','lost','closed')))
    order by case when r.follow_up_at < v_today_start and r.status not in ('won','lost','closed') then 0 when r.status='new' then 1 else 2 end,
      case when r.follow_up_at < v_today_start and r.status not in ('won','lost','closed') then coalesce(r.follow_up_at,r.created_at) end asc nulls last,
      case when not (r.follow_up_at < v_today_start and r.status not in ('won','lost','closed')) then coalesce(r.follow_up_at,r.created_at) end desc nulls last,r.id desc
    limit least(greatest(p_page_size,1),100) offset (greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)
  ) page_row;
  return jsonb_build_object('items',v_items,'total',v_total,'page',greatest(p_page,1),'page_size',least(greatest(p_page_size,1),100),
    'metrics',jsonb_build_object('new',v_new,'unassigned',v_unassigned,'overdue',v_overdue,'today',v_today,'won',v_won,'received',v_received),
    'assignees',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(pr.full_name,''),pr.email,'Equipo')) order by coalesce(nullif(pr.full_name,''),pr.email)), '[]'::jsonb)
      from (select distinct user_id from public.organization_memberships where organization_id=v_org and active and role in ('owner','admin','manager','advisor')) m left join public.profiles pr on pr.user_id=m.user_id));
end $$;

create or replace function public.create_visualcorp_manual_request(
  p_name text,p_phone text,p_email text,p_company text,p_service text,p_message text,p_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then raise exception 'No tienes permiso para registrar solicitudes.' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(coalesce(p_phone,''))>50 or length(coalesce(p_email,''))>254 or length(coalesce(p_company,''))>160 or length(coalesce(p_service,''))>160 or length(coalesce(p_message,''))>4000 or p_source not in ('WhatsApp','Teléfono','Local') then raise exception 'Revisa los datos de contacto y el origen.' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_email,'')),'') is not null and trim(p_email) !~* '^[A-Z0-9.!#$%&''*+/=?^_{|}~-]+@[A-Z0-9-]+([.][A-Z0-9-]+)+$' then raise exception 'El correo no tiene un formato válido.' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_phone,'')),'') is not null and length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 15 then raise exception 'El teléfono debe contener entre 7 y 15 dígitos.' using errcode='22023'; end if;
  insert into public.public_requests(request_type,name,phone,email,company,service,message,source,status,created_by)
  values('contact',trim(p_name),trim(coalesce(p_phone,'')),trim(coalesce(p_email,'')),trim(coalesce(p_company,'')),trim(coalesce(p_service,'')),trim(coalesce(p_message,'')),p_source,'new',auth.uid()) returning id into v_id;
  insert into public.public_request_activity(request_id,actor_id,kind,details) values(v_id,auth.uid(),'created',jsonb_build_object('source',p_source,'manual',true));
  return v_id;
end $$;

drop function if exists public.update_visualcorp_request(uuid,text,boolean,uuid,boolean,timestamptz,text,text);
create or replace function public.update_visualcorp_request(
  p_request_id uuid,p_status text default null,p_update_assignment boolean default false,p_assigned_to uuid default null,
  p_update_follow_up boolean default false,p_follow_up_at timestamptz default null,p_note text default '',p_lost_reason text default '',p_follow_up_action text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_old public.public_requests%rowtype; v_new public.public_requests%rowtype;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then raise exception 'No tienes permiso para actualizar el CRM.' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('new','contacted','quoted','won','lost','closed') then raise exception 'Etapa inválida.' using errcode='22023'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_lost_reason,''))>500 or length(coalesce(p_follow_up_action,''))>180 then raise exception 'El texto supera el límite permitido.' using errcode='22023'; end if;
  if p_update_follow_up and ((p_follow_up_at is null and length(trim(coalesce(p_follow_up_action,'')))>0) or (p_follow_up_at is not null and length(trim(coalesce(p_follow_up_action,'')))=0)) then raise exception 'Completa la próxima acción y su fecha, o retira ambas.' using errcode='22023'; end if;
  select * into v_old from public.public_requests where id=p_request_id for update;
  if not found then raise exception 'No se encontró la solicitud.' using errcode='P0002'; end if;
  if p_update_assignment and p_assigned_to is not null and not exists(select 1 from public.organization_memberships where organization_id=v_org and user_id=p_assigned_to and active) then raise exception 'La persona asignada no pertenece al equipo activo.' using errcode='22023'; end if;
  if p_status='lost' and length(trim(coalesce(p_lost_reason,'')))=0 and length(trim(v_old.lost_reason))=0 then raise exception 'Indica el motivo de pérdida.' using errcode='22023'; end if;
  update public.public_requests set status=coalesce(p_status,status),
    assigned_to=case when p_update_assignment then p_assigned_to else assigned_to end,
    follow_up_at=case when p_update_follow_up then p_follow_up_at else follow_up_at end,
    follow_up_action=case when p_update_follow_up then left(trim(coalesce(p_follow_up_action,'')),180) else follow_up_action end,
    lost_reason=case when p_status='lost' then left(trim(coalesce(p_lost_reason,v_old.lost_reason)),500) when p_status is not null and p_status<>'lost' then '' else lost_reason end,
    updated_at=now() where id=p_request_id returning * into v_new;
  if v_old.status is distinct from v_new.status then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'stage',jsonb_build_object('from',v_old.status,'to',v_new.status,'reason',v_new.lost_reason)); end if;
  if v_old.assigned_to is distinct from v_new.assigned_to then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'assignment',jsonb_build_object('from',v_old.assigned_to,'to',v_new.assigned_to,'from_name',(select coalesce(nullif(full_name,''),email,'Sin asignar') from public.profiles where user_id=v_old.assigned_to),'to_name',(select coalesce(nullif(full_name,''),email,'Sin asignar') from public.profiles where user_id=v_new.assigned_to))); end if;
  if v_old.follow_up_at is distinct from v_new.follow_up_at or v_old.follow_up_action is distinct from v_new.follow_up_action then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'follow_up',jsonb_build_object('at',v_new.follow_up_at,'action',v_new.follow_up_action)); end if;
  if length(trim(coalesce(p_note,'')))>0 then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'note',jsonb_build_object('text',trim(p_note))); end if;
end $$;

create or replace function public.log_visualcorp_request_contact(p_request_id uuid,p_method text,p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then raise exception 'No tienes permiso para registrar contacto.' using errcode='42501'; end if;
  if p_method not in ('WhatsApp','Teléfono','Correo','Presencial') or length(coalesce(p_note,''))>1000 then raise exception 'Datos de contacto inválidos.' using errcode='22023'; end if;
  if not exists(select 1 from public.public_requests where id=p_request_id) then raise exception 'No se encontró la solicitud.' using errcode='P0002'; end if;
  insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'contact',jsonb_build_object('method',p_method,'note',trim(coalesce(p_note,''))));
end $$;

create or replace function public.get_visualcorp_request_detail(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','view') then raise exception 'No tienes permiso para consultar el CRM.' using errcode='42501'; end if;
  select to_jsonb(r)||jsonb_build_object('assigned_name',coalesce(nullif(p.full_name,''),p.email,''),
    'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'details',a.details,'created_at',a.created_at,'actor',coalesce(nullif(ap.full_name,''),ap.email,'Equipo')) order by a.created_at desc),'[]'::jsonb) from public.public_request_activity a left join public.profiles ap on ap.user_id=a.actor_id where a.request_id=r.id),
    'quotes',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'quote_code',q.quote_code,'status',q.status,'created_at',q.created_at) order by q.created_at desc),'[]'::jsonb) from public.central_quotes q where q.public_request_id=r.id),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'phone',c.phone,'email',c.email) order by c.full_name),'[]'::jsonb) from public.customers c where c.organization_id=v_org and ((length(regexp_replace(coalesce(r.phone,''),'\D','','g'))>=8 and regexp_replace(coalesce(c.phone,''),'\D','','g')=regexp_replace(coalesce(r.phone,''),'\D','','g')) or (length(trim(coalesce(r.email,'')))>3 and lower(trim(c.email))=lower(trim(r.email)))) limit 10))
  into v_result from public.public_requests r left join public.profiles p on p.user_id=r.assigned_to where r.id=p_request_id;
  if v_result is null then raise exception 'No se encontró la solicitud.' using errcode='P0002'; end if;
  return v_result;
end $$;

create or replace function public.link_visualcorp_request_customer(p_request_id uuid,p_customer_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_customer uuid; v_old_status text;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then raise exception 'No tienes permiso para vincular clientes.' using errcode='42501'; end if;
  select id into v_customer from public.customers where id=p_customer_id and organization_id=v_org;
  if v_customer is null then raise exception 'Cliente no encontrado en el directorio.' using errcode='P0002'; end if;
  select status into v_old_status from public.public_requests where id=p_request_id for update;
  if not found then raise exception 'No se encontró la solicitud.' using errcode='P0002'; end if;
  update public.public_requests set customer_id=v_customer,status='won',lost_reason='',updated_at=now() where id=p_request_id;
  insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'customer',jsonb_build_object('customer_id',v_customer,'customer_name',(select full_name from public.customers where id=v_customer)));
  if v_old_status is distinct from 'won' then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,auth.uid(),'stage',jsonb_build_object('from',v_old_status,'to','won')); end if;
  return v_customer;
end $$;

create or replace function public.convert_visualcorp_request_to_customer(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_user uuid:=auth.uid(); v_req public.public_requests%rowtype; v_customer uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then raise exception 'No tienes permiso para convertir solicitudes.' using errcode='42501'; end if;
  select * into v_req from public.public_requests where id=p_request_id for update;
  if not found then raise exception 'No se encontró la solicitud.' using errcode='P0002'; end if;
  if v_req.customer_id is not null then return v_req.customer_id; end if;
  select c.id into v_customer from public.customers c where c.organization_id=v_org and (
    (length(regexp_replace(coalesce(v_req.phone,''),'\D','','g'))>=8 and regexp_replace(coalesce(c.phone,''),'\D','','g')=regexp_replace(coalesce(v_req.phone,''),'\D','','g')) or
    (length(trim(coalesce(v_req.email,'')))>3 and lower(trim(c.email))=lower(trim(v_req.email)))) order by c.created_at limit 1;
  if v_customer is null then
    insert into public.customers(organization_id,full_name,phone,email,notes,preferences,tags,created_by)
    values(v_org,v_req.name,v_req.phone,v_req.email,concat_ws(E'\n',nullif(v_req.service,''),nullif(v_req.message,'')),jsonb_build_object('interests',coalesce(v_req.service,''),'source',v_req.source),array['solicitud CRM'],v_user) returning id into v_customer;
  end if;
  update public.public_requests set customer_id=v_customer,status='won',lost_reason='',updated_at=now() where id=p_request_id;
  insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,v_user,'customer',jsonb_build_object('customer_id',v_customer,'customer_name',(select full_name from public.customers where id=v_customer),'created_or_matched',true));
  if v_req.status is distinct from 'won' then insert into public.public_request_activity(request_id,actor_id,kind,details) values(p_request_id,v_user,'stage',jsonb_build_object('from',v_req.status,'to','won')); end if;
  return v_customer;
end $$;

-- Keep the existing quote contract under the current permission catalog.
create or replace function public.create_central_quote(
  p_customer_id uuid,p_customer_name text,p_customer_phone text,p_items jsonb,p_normal numeric,p_installation numeric,p_corporate numeric,
  p_chosen text,p_selected numeric,p_confirmed boolean,p_notes text,p_client_brief_html text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_code text; v_id uuid; v_user uuid:=auth.uid();
begin
  if v_user is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or octet_length(p_items::text)>50000
    or p_chosen not in ('normal','installation','corporate') or octet_length(coalesce(p_client_brief_html,''))>30000 then
    raise exception 'Datos de cotización inválidos.' using errcode='22023';
  end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'quotes','edit') then raise exception 'No tienes permiso para cotizar.' using errcode='42501'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'Cliente no pertenece a Visual Corp.' using errcode='42501'; end if;
  if p_selected is not null and p_selected<0 then raise exception 'Total inválido.' using errcode='22023'; end if;
  v_code:='COT-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.central_quotes(organization_id,quote_code,customer_id,customer_name,customer_phone,items,total_normal,total_installation,total_corporate,chosen_tier,selected_total,price_confirmed,notes,client_brief_html,created_by)
  values(v_org,v_code,p_customer_id,left(trim(coalesce(p_customer_name,'')),200),left(trim(coalesce(p_customer_phone,'')),60),p_items,p_normal,p_installation,p_corporate,p_chosen,p_selected,coalesce(p_confirmed,false),left(coalesce(p_notes,''),2000),coalesce(p_client_brief_html,''),v_user)
  returning id into v_id;
  insert into public.central_quote_events(organization_id,quote_id,to_status,created_by) values(v_org,v_id,'draft',v_user);
  return jsonb_build_object('id',v_id,'quote_code',v_code,'status','draft');
end $$;
revoke all on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text) from public,anon;
grant execute on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text) to authenticated;

-- Keep request linkage atomic with the existing quote creation contract.
create or replace function public.create_central_quote_from_request(
  p_customer_id uuid,p_customer_name text,p_customer_phone text,p_items jsonb,p_normal numeric,p_installation numeric,p_corporate numeric,
  p_chosen text,p_selected numeric,p_confirmed boolean,p_notes text,p_client_brief_html text,p_public_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb; v_quote uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'quotes','edit') then raise exception 'Sin permiso para crear cotizaciones.' using errcode='42501'; end if;
  if p_public_request_id is not null then
    if not app_private.has_visualcorp_access(v_org,'crm','view') or not exists(select 1 from public.public_requests where id=p_public_request_id) then raise exception 'Solicitud no encontrada o sin permiso para vincular.' using errcode='42501'; end if;
  end if;
  v_result := public.create_central_quote(p_customer_id,p_customer_name,p_customer_phone,p_items,p_normal,p_installation,p_corporate,p_chosen,p_selected,p_confirmed,p_notes,p_client_brief_html);
  v_quote := (v_result->>'id')::uuid;
  if p_public_request_id is not null then update public.central_quotes set public_request_id=p_public_request_id where id=v_quote and organization_id=v_org; end if;
  return v_result;
end $$;

drop policy if exists public_requests_staff_read on public.public_requests;
drop policy if exists public_requests_staff_update on public.public_requests;
create policy public_requests_staff_read on public.public_requests for select to authenticated
  using(app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','view'));
create policy public_requests_staff_update on public.public_requests for update to authenticated
  using(app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','edit'))
  with check(app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','edit'));

revoke all on function public.get_visualcorp_crm_inbox(text,text,text,text,text,date,date,text,integer,integer) from public,anon;
revoke all on function public.create_visualcorp_manual_request(text,text,text,text,text,text,text) from public,anon;
revoke all on function public.update_visualcorp_request(uuid,text,boolean,uuid,boolean,timestamptz,text,text,text) from public,anon;
revoke all on function public.log_visualcorp_request_contact(uuid,text,text) from public,anon;
revoke all on function public.get_visualcorp_request_detail(uuid) from public,anon;
revoke all on function public.link_visualcorp_request_customer(uuid,uuid) from public,anon;
revoke all on function public.convert_visualcorp_request_to_customer(uuid) from public,anon;
revoke all on function public.create_central_quote_from_request(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text,uuid) from public,anon;
grant execute on function public.get_visualcorp_crm_inbox(text,text,text,text,text,date,date,text,integer,integer) to authenticated;
grant execute on function public.create_visualcorp_manual_request(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.update_visualcorp_request(uuid,text,boolean,uuid,boolean,timestamptz,text,text,text) to authenticated;
grant execute on function public.log_visualcorp_request_contact(uuid,text,text) to authenticated;
grant execute on function public.get_visualcorp_request_detail(uuid) to authenticated;
grant execute on function public.link_visualcorp_request_customer(uuid,uuid) to authenticated;
grant execute on function public.convert_visualcorp_request_to_customer(uuid) to authenticated;
grant execute on function public.create_central_quote_from_request(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,text,uuid) to authenticated;
