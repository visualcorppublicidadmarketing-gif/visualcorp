-- Migración pendiente: Sistema de Alertas y diálogo
-- Registra la publicación compartida en public.internal_change_log para Visual Corp Suite.

insert into public.internal_change_log
  (organization_id, title, summary, details, category, audience, version_tag, tags, status, published_at)
select
  o.id,
  'Sistema de Alertas y diálogo',
  'Diseño e implementación de Dialog y AlertDialog con estética Magic UI (BorderBeam, SpotlightLayer), accesibilidad WAI-ARIA APG y complementos para confirmaciones críticas, motivos de auditoría, candado por palabra clave, listas de garantías y paneles multipaso.',
  'Se incorpora src/components/ui/DialogSystem.tsx y dialog-system.css con portales a document.body, trampa de foco estable sin pérdida al escribir, bloqueo de clic exterior en AlertDialog y foco inicial seguro en Cancelar para acciones destructivas. Incluye DialogProvider global y los hooks useConfirm, useAlert y usePrompt con cola de ejecución, reemplazando window.confirm en Inventario, Ubicaciones, Equipo, Caja, Compras y POS, además de actualizar QuoteRequestDialog.',
  'operations',
  'both',
  'sistema-alertas-y-dialogo',
  array['interfaz', 'accesibilidad', 'dialog', 'alert-dialog', 'magic-ui', 'operaciones']::text[],
  'published',
  now()
from public.organizations o
where o.slug = 'visual-corp'
  and not exists (
    select 1
    from public.internal_change_log c
    where c.organization_id = o.id
      and (c.version_tag = 'sistema-alertas-y-dialogo' or c.title = 'Sistema de Alertas y diálogo')
  );
