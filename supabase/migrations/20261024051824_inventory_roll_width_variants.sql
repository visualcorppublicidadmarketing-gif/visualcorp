-- Add the confirmed roll widths as physical inventory variants.
-- These are catalog options only; no stock is created or counted here.
with org as (
  select id from public.organizations where slug = 'visual-corp'
), roll_items as (
  select i.id, i.organization_id, i.sku, i.name, v.attributes as source_attributes
  from public.inventory_items i
  join org on org.id = i.organization_id
  join public.inventory_variants v on v.item_id = i.id and v.organization_id = i.organization_id
  where i.active
    and i.base_unit = 'metro'
    and i.sku like 'VC-INV-%'
    and (i.name ilike 'vinil %' or i.name ilike 'lona %')
    and v.attributes ->> 'source_status' = 'catalog_suggestion'
), widths(width_cm) as (
  values (107), (127), (310)
)
insert into public.inventory_variants (organization_id, item_id, sku, label, attributes, active)
select r.organization_id,
       r.id,
       r.sku || '-' || w.width_cm || 'CM',
       'Ancho ' || w.width_cm || ' cm · Existencia física por contar',
       r.source_attributes || jsonb_build_object(
         'source_status', 'catalog_suggestion',
         'stock_count_required', true,
         'width_cm', w.width_cm,
         'width_unit', 'cm'
       ),
       true
from roll_items r
cross join widths w
on conflict (organization_id, sku) do nothing;

-- Retire only the ambiguous seeded placeholder when it has no physical or
-- operational references. Keep it active if any real records depend on it.
with org as (
  select id from public.organizations where slug = 'visual-corp'
), roll_items as (
  select i.id, i.organization_id
  from public.inventory_items i
  join org on org.id = i.organization_id
  where i.active
    and i.base_unit = 'metro'
    and i.sku like 'VC-INV-%'
    and (i.name ilike 'vinil %' or i.name ilike 'lona %')
)
update public.inventory_variants v
set active = false
from roll_items r
where v.item_id = r.id
  and v.organization_id = r.organization_id
  and v.attributes ->> 'source_status' = 'catalog_suggestion'
  and v.label ilike '%por confirmar%'
  and not exists (select 1 from public.inventory_stock s where s.variant_id = v.id)
  and not exists (select 1 from public.inventory_movements m where m.variant_id = v.id)
  and not exists (select 1 from public.catalog_inventory_links l where l.inventory_variant_id = v.id)
  and not exists (select 1 from public.sale_lines sl where sl.variant_id = v.id)
  and not exists (select 1 from public.purchase_order_lines pl where pl.variant_id = v.id)
  and not exists (select 1 from public.production_material_targets pt where pt.variant_id = v.id)
  and not exists (select 1 from public.stock_transfer_lines tl where tl.variant_id = v.id)
  and not exists (select 1 from public.inventory_item_costs c where c.variant_id = v.id)
  and not exists (select 1 from public.inventory_item_cost_history h where h.variant_id = v.id);
