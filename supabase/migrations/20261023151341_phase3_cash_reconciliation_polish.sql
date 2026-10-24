insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
  'Arqueo de caja más claro para cada turno',
  'Caja muestra el efectivo esperado, el conteo declarado y la diferencia antes del cierre, con entradas y retiros auditados.',
  'El resumen del turno calcula fondo inicial, pagos en efectivo y movimientos manuales del turno. El formulario de entrada o retiro solicita monto y motivo sin depender de ventanas emergentes; el historial deja visible el efectivo esperado y la diferencia registrada. El cierre vuelve a calcular y guardar la conciliación en el servidor.',
  'operations','both','phase3-cash-reconciliation','published',now()
from public.organizations o
where o.slug='visual-corp'
  and not exists (select 1 from public.internal_change_log c where c.organization_id=o.id and c.version_tag='phase3-cash-reconciliation');
