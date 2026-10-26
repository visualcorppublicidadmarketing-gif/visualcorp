create index equipment_assets_area_org_fk_idx on public.equipment_assets (area_id, organization_id);
create index equipment_assets_branch_org_fk_idx on public.equipment_assets (branch_id, organization_id);
create index equipment_assets_created_by_idx on public.equipment_assets (created_by);
