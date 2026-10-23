insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
  'Lectura rápida de artículos por SKU',
  'El POS reconoce el SKU exacto de una variante enlazada al catálogo al presionar Enter o usar un lector USB.',
  'La búsqueda muestra SKU asociados a la sucursal activa. Al escanear, el sistema exige un vínculo explícito de catálogo e inventario, permite revisar cantidad y precio antes de agregar el artículo y no altera existencias. No se asignaron códigos ni se activó lectura por cámara.',
  'sales','both','phase4-pos-sku-scanner','published',now()
from public.organizations o where o.slug='visual-corp'
on conflict do nothing;
