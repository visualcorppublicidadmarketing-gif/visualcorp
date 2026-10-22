insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
       'Novedades compartidas para el equipo',
       'Administración ya puede redactar, publicar y archivar cambios; las publicaciones aparecen también en operaciones.',
       'El registro compartido se actualiza en ambos paneles en tiempo real. Las personas autorizadas consultan publicaciones; administración puede gestionar borradores y publicaciones. Se cargó un resumen de las mejoras recientes de inventario, POS y operaciones.',
       'general','both','2026-10','published',now()
from public.organizations o
where o.slug='visual-corp'
  and not exists (
    select 1 from public.internal_change_log c
    where c.organization_id=o.id and c.title='Novedades compartidas para el equipo'
  );
