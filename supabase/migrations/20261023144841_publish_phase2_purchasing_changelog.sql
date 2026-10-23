insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
  'Compras conectadas con el inventario',
  'Se añadieron proveedores, órdenes de compra y recepción parcial con actualización auditada del stock.',
  'El panel de Operaciones > Compras administra proveedores, órdenes en borrador, envío, cancelación segura y recepciones parciales. Las recepciones registran usuario, fecha, referencia, ubicación y movimiento de inventario; las claves de idempotencia evitan repetir el mismo ingreso por reintentos. Las sugerencias se basan únicamente en saldos contados y mínimos definidos. No se crearon proveedores, pedidos, costos ni unidades ficticias. La información histórica importada continúa sujeta a revisión y conteo.',
  'operations','both','fase-2-compras','published',now()
from public.organizations o
where o.slug='visual-corp'
  and not exists (
    select 1 from public.internal_change_log c
    where c.organization_id=o.id and c.version_tag='fase-2-compras'
  );
