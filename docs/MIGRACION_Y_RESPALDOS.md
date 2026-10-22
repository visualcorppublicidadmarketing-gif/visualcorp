# Preparación para GitHub, Supabase y Vercel

## Estado actual

- Esta suite guarda su espacio de trabajo en `localStorage`, con la clave `visualcorp-suite-local-v1`. Cada navegador/perfil puede tener una copia diferente.
- La app todavía no lee ni escribe en Supabase. Las credenciales no se agregan al repositorio.
- Esta carpeta no tiene un proyecto Supabase vinculado ni una carpeta `supabase/migrations/`. No se ha ejecutado SQL remoto.
- El catálogo de 70 artículos sugeridos tiene saldo cero y `starterCatalog`; son datos de referencia, no prueba de compra o existencias.
- Hay un panel local de **Administración → Respaldo y migración** para exportar y combinar respaldos JSON. Al combinar, el dato local prevalece ante IDs repetidos.

## Reglas para no perder datos

1. Antes de cambiar el almacenamiento, abrir el panel de respaldo en cada navegador o equipo donde se hayan ingresado datos y exportar un archivo distinto con fecha.
2. Guardar los JSON en `backups/` dentro de esta carpeta. El contenido de esa carpeta está excluido de Git. No subir respaldos ni `.env` a GitHub.
3. Conservar los originales; no limpiar `localStorage`, no borrar tablas, no ejecutar `db reset --linked` ni `TRUNCATE` en un proyecto con datos.
4. Antes de crear migraciones, confirmar el proyecto Supabase (organización, referencia, región) y revisar si ya contiene tablas, políticas, usuarios o datos. No asumir que es una base vacía.
5. Hacer el primer despliegue de schema y carga en local o staging. Exportar/respaldar la base de destino antes de cada cambio en producción.
6. Mantener un manifiesto de la importación con nombre/hash del archivo, fecha, número de registros por colección, IDs creados/omitidos y errores. Las importaciones deben ser idempotentes: repetirlas no duplica filas.
7. Comparar filas y relaciones de origen con destino; solo entonces decidir la fecha de corte. Mantener copia local y respaldo remoto antes de activar lecturas/escrituras en la nube.

## Diseño de datos por confirmar contra el proyecto existente

Propuesta de dominios, no una migración aprobada todavía:

- `organizations`, `branches`, `profiles`, `memberships`, `roles` y `permissions` para Visual Corp, GigaPrint y accesos por persona.
- Catálogo maestro `inventory_items`, variantes (`item_variants`) y ubicaciones; mantener códigos legibles como `VC-INV-IMP-001` y guardar el ID de origen al migrar.
- Saldos por artículo, variante, sucursal y ubicación separados de `inventory_movements`. Los movimientos deben conservar actor, fecha, motivo, referencia, origen/destino y cantidad; correcciones por nuevos movimientos, no por borrar historial.
- `customers`, oportunidades/solicitudes, cotizaciones, ventas y líneas de venta conectadas mediante claves foráneas; la venta y su descuento de stock deben confirmarse en una transacción.
- `sales` y movimientos históricos con idempotency key/origin id para evitar doble carga. La carga inicial no convierte registros sugeridos o conteos pendientes en stock disponible.

## Seguridad y operación

- RLS activa en toda tabla expuesta. Cada política debe comprobar membresía, sucursal y permiso de la operación; “usuario autenticado” por sí solo no autoriza todas las filas.
- Costos y márgenes visibles únicamente con permisos comprobados en servidor/base; nunca confiar en ocultar controles en React.
- La clave secreta/service role nunca va al navegador ni a variables `VITE_*`. La app solo recibe publishable/anon key y las tablas protegen cada fila con RLS.
- Revisar políticas con cuentas de prueba de cada rol, incluyendo asesora, taller, administración, sucursal y acceso denegado.
- Usar migraciones versionadas en Git; revisar cada SQL y su efecto antes de desplegar. Probar la reconstrucción desde cero solo en la base local descartable. Una vuelta atrás en producción debe ser una nueva migración correctiva, con respaldo anterior disponible.
- Variables de producción se configuran en Vercel/Supabase fuera del código; separar local, staging y producción. No incluir tokens en commits ni capturas.

## Secuencia de trabajo al conectar

1. Confirmar el repositorio correcto y crear rama de trabajo; revisar `.gitignore`, `git status` y el contenido que se va a publicar.
2. Verificar proyecto/versión de Supabase CLI y documentación vigente; confirmar el estado del schema remoto y protegerlo con respaldo.
3. Preparar Supabase local y una primera migración solo después de conocer el estado real del proyecto. Crear las migraciones con la CLI, aplicar y revisar primero en local.
4. Definir Auth, roles y RLS; validar permisos con usuarios de prueba antes de cargar información real.
5. Implementar una capa de repositorio para que la app pueda cambiar entre persistencia local y Supabase sin duplicar reglas de negocio.
6. Importar respaldos en staging con vista previa, conteos, detección de duplicados y errores descargables. No sobrescribir stock verificado ni combinar variantes solo por similitud de nombre.
7. Comparar reportes de origen y destino, probar POS/CRM/inventario en staging y acordar la fecha de corte antes de producción.
8. Conectar Vercel con el repositorio y variables adecuadas, desplegar preview, validar recorrido completo y luego producción.

## Falta antes de escribir migraciones reales

- Referencia y estado actual del proyecto Supabase de destino.
- Exportar los datos locales de cada navegador/dispositivo que haya sido usado.
- Confirmar el modelo de roles y los responsables de aprobación de traspasos, ajustes y compras.
- Recibir y cotejar los archivos actualizados de inventario antes de migrar existencias.
- Confirmar si los registros locales de demostración deben conservarse, depurarse o marcarse como demostración.

No hay SQL listo para producción en esta etapa. El proyecto Supabase aún no está identificado y una migración escrita sin revisar su schema podría crear conflictos o alterar datos existentes.

## Fuentes oficiales consultadas

- [Migraciones de base de datos](https://supabase.com/docs/guides/local-development/database-migrations)
- [Flujo de desarrollo local](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Respaldos de base de datos](https://supabase.com/docs/guides/platform/backups)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
