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

La sección Marketing (`/operaciones/marketing` o `/admin/marketing`) presenta Resumen, Calendario, Biblioteca, Estrategia, Operación y Resultados. Los perfiles con permiso de edición pueden crear publicaciones y ajustar título, canal, formato, fecha, responsable, estado, copy y siguiente paso. Los cambios de estado, calendario y responsable se anotan en `marketing_post_events`.

La planificación general de campañas se conserva como concepto de campaña; cada publicación sigue siendo una ficha independiente. Preparar o cambiar una ficha no publica contenido en redes.

## Reimportación

La migración de esquema está en `supabase/migrations/20261024055010_tracking_content_workspace.sql`. Los datos iniciales se importaron con una exportación local en bloques mediante el conector Supabase, sin instalar credenciales en el código. `source_system` y `source_id` sirven para identificar registros de origen. La importación inserta registros nuevos y omite las claves existentes para respetar cambios posteriores realizados en la suite.

