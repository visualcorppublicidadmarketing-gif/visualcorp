insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
       'Navegación móvil y mejoras priorizadas',
       'El panel interno ahora adapta su navegación a pantallas pequeñas; se documentó la ruta para ampliar POS, compras y trazabilidad.',
       'En teléfonos y tabletas, el menú lateral se abre como panel, se cierra al elegir una sección y permite cerrar tocando el fondo. La revisión comparativa con Odoo prioriza compras/proveedores y recepción parcial, terminal de caja multiartículo, escaneo, operación offline confiable, calidad y trazabilidad; el informe distingue lo que ya existe de lo que sigue pendiente.',
       'general','both','2026-10','published',now()
from public.organizations o
where o.slug='visual-corp'
  and not exists (
    select 1 from public.internal_change_log c
    where c.organization_id=o.id and c.title='Navegación móvil y mejoras priorizadas'
  );
