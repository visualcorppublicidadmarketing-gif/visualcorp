-- Catalog Family Workflow Routes & Baseline Templates
-- Allows setting default production workflow routes at the category/family level
-- so products inherit their workshop route automatically without per-product setup.

create table if not exists public.catalog_family_workflow_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  family_name text not null check (length(trim(family_name)) between 1 and 140),
  workflow_code text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, family_name),
  foreign key (organization_id, workflow_code) references public.production_workflow_templates(organization_id, code) on delete restrict
);

create index if not exists catalog_family_workflow_routes_active_idx
  on public.catalog_family_workflow_routes (organization_id, active, family_name);

alter table public.catalog_family_workflow_routes enable row level security;

revoke all on public.catalog_family_workflow_routes from public, anon;
grant select, insert, update on public.catalog_family_workflow_routes to authenticated;
grant all on public.catalog_family_workflow_routes to service_role;

do $migration$
begin
  create policy catalog_family_routes_read
    on public.catalog_family_workflow_routes
    for select
    to authenticated
    using (
      app_private.has_visualcorp_access(organization_id, 'sales', 'view')
      or app_private.has_visualcorp_access(organization_id, 'workshop', 'view')
    );
exception
  when duplicate_object then null;
end
$migration$;

do $migration$
begin
  create policy catalog_family_routes_manage
    on public.catalog_family_workflow_routes
    for all
    to authenticated
    using (
      app_private.has_visualcorp_access(organization_id, 'sales', 'edit')
      and app_private.has_visualcorp_access(organization_id, 'workshop', 'edit')
    )
    with check (
      app_private.has_visualcorp_access(organization_id, 'sales', 'edit')
      and app_private.has_visualcorp_access(organization_id, 'workshop', 'edit')
    );
exception
  when duplicate_object then null;
end
$migration$;

-- Add complementary baseline workflow templates for Visual Corp operations
insert into public.production_workflow_templates
  (organization_id, code, name, required_fields, steps)
select o.id, v.code, v.name, v.required_fields, v.steps::jsonb
from public.organizations o
cross join (values
  (
    'design_only',
    'Solo diseño gráfico',
    '{}'::text[],
    '[{"key":"intake","area":"ASE","title":"Confirmar brief y requerimientos","depends_on":[],"requirements":{"before_start":[],"before_complete":["intake_complete"]}},{"key":"design","area":"DIS","title":"Elaborar propuesta y entregar arte","depends_on":["intake"],"requirements":{"before_start":[],"before_complete":[]}}]'
  ),
  (
    'printing_press',
    'Imprenta y papelería',
    '{}'::text[],
    '[{"key":"intake","area":"ASE","title":"Verificar tiraje, papel y medidas","depends_on":[],"requirements":{"before_start":[],"before_complete":["intake_complete"]}},{"key":"design","area":"DIS","title":"Preparar montaje e imposición","depends_on":["intake"],"requirements":{"before_start":[],"before_complete":[]}},{"key":"print","area":"IMP","title":"Imprimir y refilar papelería","depends_on":["design"],"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}}]'
  ),
  (
    'laser_cut_finish',
    'Corte láser y armado',
    array['width_cm','height_cm'],
    '[{"key":"intake","area":"ASE","title":"Verificar ficha, espesor y medidas","depends_on":[],"requirements":{"before_start":[],"before_complete":["intake_complete"]}},{"key":"design","area":"DIS","title":"Preparar archivo vectorial de corte","depends_on":["intake"],"requirements":{"before_start":[],"before_complete":[]}},{"key":"laser","area":"LAS","title":"Cortar y grabar en láser","depends_on":["design"],"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}},{"key":"workshop","area":"TAL","title":"Armar, pegar y alistar entrega","depends_on":["laser"],"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}}]'
  ),
  (
    'troquelado',
    'Impresión y troquelado',
    array['width_cm','height_cm'],
    '[{"key":"intake","area":"ASE","title":"Verificar ficha, medidas y contorno","depends_on":[],"requirements":{"before_start":[],"before_complete":["intake_complete"]}},{"key":"design","area":"DIS","title":"Preparar arte y líneas de troquel","depends_on":["intake"],"requirements":{"before_start":[],"before_complete":[]}},{"key":"print","area":"IMP","title":"Imprimir material base","depends_on":["design"],"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}},{"key":"troquelado","area":"TRO","title":"Troquelar y depilar piezas","depends_on":["print"],"requirements":{"before_start":["deposit_paid","artwork_approved"],"before_complete":[]}}]'
  )
) as v(code, name, required_fields, steps)
where o.slug = 'visual-corp'
on conflict (organization_id, code) do nothing;
