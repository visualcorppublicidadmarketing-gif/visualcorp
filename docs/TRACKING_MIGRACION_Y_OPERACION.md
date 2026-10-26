# Migración de Tracking a Visual Corp Suite

**Fecha de copia:** 24 de octubre de 2026
**Origen:** `apps/tracking-contenido/data/tracking.sqlite`
**Proyecto de destino:** Supabase `visualcorp-suite`, organización Visual Corp
**SHA-256 de los datos operativos exportados:** `350ee8b1755a97fb05eb0863988e5eab46876623b8aceb0a578f279be04ae9fc`

## Resultado de la importación

| Tabla de origen | Registros |
| --- | ---: |
| `posts` | 64 |
| `assets` | 1.900 |
| `post_assets` | 22 |
| `lead_tracking` | 0 |
| `sales_snapshots` | 1 |
| `strategy_items` | 9 |
| `work_items` | 3 |
| `work_item_history` | 11 |

La verificación en Supabase confirmó los mismos conteos, un lote de importación y cero relaciones de piezas huérfanas. Las claves originales se guardan como `source_id` bajo `source_system = tracking-contenido`; repetir la importación no duplica ni sobrescribe fichas que luego se editen en la suite.

## Alcance y procedencia

- Los registros operativos y sus relaciones se copiaron a tablas `marketing_*`, dentro de la organización Visual Corp y protegidas por RLS y permisos del módulo Marketing.
- No se copiaron `users`, hashes de contraseñas ni `sessions`. La suite usa Supabase Auth y sus propios perfiles de acceso.
- Los nombres de usuario conservados en asignaciones e historial son texto histórico del registro local; no otorgan acceso ni se enlazan automáticamente con cuentas de la suite.
- Los 1.900 archivos no se subieron a Storage. Se copiaron sus metadatos y rutas de origen; la biblioteca de la suite los presenta como recursos locales o referencias. Los 22 enlaces de publicación se conservaron.
- El único resumen de ventas contiene 300 operaciones agregadas de una copia semanal de agosto de 2026. No incluye un campo fiable de cliente ni costos y no atribuye ventas a publicaciones.
- La base SQLite original permanece intacta. La copia inicial no mantiene sincronización bidireccional: los cambios nuevos deben hacerse en Visual Corp Suite para que queden en la base central.

## Operación en la suite

La sección Marketing (`/operaciones/marketing` o `/admin/marketing`) presenta Resumen, Calendario, Biblioteca, Estrategia, Operación y Resultados. Los perfiles con permiso de edición pueden crear publicaciones desde una ficha organizada en Plan, Mensaje y Producción. El brief conserva objetivo, audiencia, oferta/tema, frase de entrada (`call_in`), beneficio o respaldo (`callout`), caption, CTA, destino del CTA, enlace confirmado, hashtags y notas visuales, además de canal, formato, fecha, responsable, estado y siguiente paso. Los datos estructurados de copy se guardan en columnas propias de `marketing_posts`; los registros anteriores reciben campos vacíos y no pierden contenido. La migración `20261026154428_marketing_publication_copy_fields.sql` está aplicada a Supabase. `external_url` sigue siendo el enlace de destino. La ficha muestra una vista de estructura Entrada → Beneficio/Respaldo → Acción, que no publica ni genera copy automáticamente. Los cambios de estado, calendario y responsable se anotan en `marketing_post_events`.

La planificación general de campañas se conserva como concepto de campaña; cada publicación sigue siendo una ficha independiente. Preparar o cambiar una ficha no publica contenido en redes.

### Añadir recursos a la biblioteca

En Marketing → Biblioteca, los perfiles con permiso de edición pueden pegar imágenes con `Ctrl+V`, arrastrar o seleccionar archivos. Cada archivo se guarda en el bucket privado `marketing-assets`, bajo la carpeta de su organización, y se indexa en `marketing_assets` con nombre, sección, carpeta, extensión, tamaño y dimensiones disponibles. Las vistas previas crean un enlace temporal privado de cinco minutos. El límite del bucket es 50 MB por archivo; sus políticas reutilizan los permisos de Marketing para ver, editar y eliminar.

Si el original ya vive dentro de `E:\VISUAL CORP`, pega o registra su ruta relativa (por ejemplo `06_Marketing_digital/Campanas_y_publicaciones/2026/...`). Esto solo registra la referencia para búsqueda; no mueve, duplica ni verifica el archivo, porque el navegador no puede inspeccionar carpetas del equipo. La migración `20261026145402_marketing_assets_private_storage.sql` crea el bucket y sus políticas y ya está aplicada al proyecto Supabase.

Al subir una imagen también se puede vincular una publicación y habilitar la eliminación automática al mes, a los dos meses o en un plazo personalizado de 1 a 120 meses desde `scheduled_date`. El barrido diario elimina el objeto solo del bucket privado si todas sus publicaciones vinculadas tienen fecha válida y ya venció el plazo. Conserva la ficha de índice con el estado `retention_deleted`; no procesa referencias locales, archivos importados ni cargas sin publicación. Para ejecutar el barrido en Supabase hacen falta la migración `20261026180000_marketing_asset_retention.sql`, la Edge Function `marketing-asset-retention` y los secretos `project_url` y `publishable_key` en Vault. Esta política se configura por cada carga nueva y no activa borrados retroactivos para archivos existentes.

## Reimportación

La migración de esquema está en `supabase/migrations/20261024055010_tracking_content_workspace.sql`. Los datos iniciales se importaron con una exportación local en bloques mediante el conector Supabase, sin instalar credenciales en el código. `source_system` y `source_id` sirven para identificar registros de origen. La importación inserta registros nuevos y omite las claves existentes para respetar cambios posteriores realizados en la suite.

