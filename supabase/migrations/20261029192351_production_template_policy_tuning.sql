-- Keep one SELECT policy for routes and limit management rules to writes.
drop policy if exists production_templates_manage on public.production_workflow_templates;
drop policy if exists production_templates_insert on public.production_workflow_templates;
drop policy if exists production_templates_update on public.production_workflow_templates;

create policy production_templates_insert on public.production_workflow_templates
for insert to authenticated
with check (app_private.has_visualcorp_access(organization_id,'sales','edit')
  and app_private.has_visualcorp_access(organization_id,'workshop','edit'));

create policy production_templates_update on public.production_workflow_templates
for update to authenticated
using (app_private.has_visualcorp_access(organization_id,'sales','edit')
  and app_private.has_visualcorp_access(organization_id,'workshop','edit'))
with check (app_private.has_visualcorp_access(organization_id,'sales','edit')
  and app_private.has_visualcorp_access(organization_id,'workshop','edit'));
