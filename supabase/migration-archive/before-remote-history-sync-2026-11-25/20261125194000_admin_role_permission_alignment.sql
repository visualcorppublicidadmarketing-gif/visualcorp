-- Add a narrow permission for the new admin suggestions workflow and align
-- built-in profiles with the recently added Personal and publishing pages.
do $permission_catalog_migration$
declare
  v_check text;
  v_definition text;
  v_marker text := $marker$or coalesce(item->>'action_key','') not in ($marker$;
  v_prerequisite_marker text := $prerequisite$raise exception 'No repitas permisos en la matriz.';$prerequisite$;
  v_prerequisite text := $validation$
    if exists (
      select 1 from jsonb_to_recordset(p_permissions) as permission(module_key text,action_key text,enabled boolean)
      where permission.module_key='team' and permission.action_key='manage_suggestions' and permission.enabled
    ) and not exists (
      select 1 from jsonb_to_recordset(p_permissions) as permission(module_key text,action_key text,enabled boolean)
      where permission.module_key='team' and permission.action_key='view' and permission.enabled
    ) then raise exception 'Gestionar sugerencias requiere acceso de lectura a Equipo.'; end if;
  $validation$;
begin
  select pg_catalog.pg_get_constraintdef(oid) into v_check
  from pg_catalog.pg_constraint
  where conrelid='public.access_profile_permissions'::regclass
    and conname='access_profile_permissions_action_key_check'
    and contype='c';

  if v_check is null or pg_catalog.strpos(v_check,'ARRAY[')=0 then
    raise exception 'Revisa el catálogo de acciones antes de habilitar la gestión de sugerencias.';
  end if;
  if pg_catalog.strpos(v_check,'''manage_suggestions''')=0 then
    alter table public.access_profile_permissions drop constraint access_profile_permissions_action_key_check;
    execute 'alter table public.access_profile_permissions add constraint access_profile_permissions_action_key_check '
      || pg_catalog.replace(v_check,'ARRAY[',$array$ARRAY['manage_suggestions'::text, $array$);
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.save_visualcorp_access_profile(uuid,text,text,text,jsonb)'::regprocedure);
  if pg_catalog.strpos(v_definition,'''manage_suggestions''')=0 then
    if pg_catalog.strpos(v_definition,v_marker)=0 then
      raise exception 'La función de perfiles cambió; revisa su lista de acciones antes de habilitar sugerencias.';
    end if;
    v_definition := pg_catalog.replace(v_definition,v_marker,v_marker || '''manage_suggestions'',');
  end if;
  if pg_catalog.strpos(v_definition,'Gestionar sugerencias requiere acceso de lectura a Equipo.')=0 then
    if pg_catalog.strpos(v_definition,v_prerequisite_marker)=0 then
      raise exception 'La función de perfiles cambió; revisa la validación de dependencias antes de habilitar sugerencias.';
    end if;
    v_definition := pg_catalog.replace(v_definition,v_prerequisite_marker,v_prerequisite || v_prerequisite_marker);
  end if;
  execute v_definition;
end;
$permission_catalog_migration$;

insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select profile.id, permission.module_key, permission.action_key, true
from public.access_profiles profile
join public.organizations organization on organization.id=profile.organization_id
cross join (values
  ('personnel','view'),
  ('personnel','edit'),
  ('team','manage_suggestions')
) as permission(module_key,action_key)
where organization.slug='visual-corp'
  and profile.is_system
  and profile.profile_key='admin'
on conflict(profile_id,module_key,action_key) do update
set enabled=true, updated_at=now();

insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select profile.id, 'team', 'manage_suggestions', true
from public.access_profiles profile
join public.organizations organization on organization.id=profile.organization_id
where organization.slug='visual-corp'
  and profile.is_system
  and profile.profile_key='gerencia'
on conflict(profile_id,module_key,action_key) do update
set enabled=true, updated_at=now();

insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select profile.id, 'website', 'publish_content', true
from public.access_profiles profile
join public.organizations organization on organization.id=profile.organization_id
where organization.slug='visual-corp'
  and profile.is_system
  and profile.profile_key='website_admin'
on conflict(profile_id,module_key,action_key) do update
set enabled=true, updated_at=now();
