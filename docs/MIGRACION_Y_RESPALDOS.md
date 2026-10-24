# Datos, migraciones y respaldos

## Estado de la aplicación

- La suite usa React y TypeScript. Su compilación no aplica cambios a la base de datos.
- La aplicación ya integra Supabase Auth y consultas para módulos de sitio, cotizaciones e inventario. Parte del espacio de trabajo todavía puede funcionar con `localStorage`; esos datos locales no se sincronizan automáticamente entre dispositivos.
- Las variables de conexión se configuran fuera del repositorio. Consulta `.env.example`; no guardes secretos en Git ni uses una clave `service_role` en el navegador.
- Las migraciones SQL versionadas están en `supabase/migrations/`. El historial local y el remoto deben cotejarse antes de aplicar una nueva migración.
- El catálogo sugerido de inventario no certifica compras ni existencias físicas. Mantén pendientes las especificaciones y cantidades no verificadas.

## Flujo seguro para cambios de base de datos

1. Actualiza la rama desde `main` y confirma que estás en el repositorio y proyecto Supabase correctos.
2. Ejecuta `supabase migration list --linked` y compara todas las versiones locales con las remotas. Revisa también el esquema y las políticas RLS de las tablas afectadas.
3. Si hay una diferencia de versión o nombre, detente y coteja el SQL y el historial antes de corregirlo. No ejecutes `migration repair`, no renombres archivos aplicados y no borres filas del historial para forzar una coincidencia.
4. Crea una migración nueva, pequeña y con marca de tiempo única. No edites una migración que ya se aplicó.
5. Valida el SQL en una base local descartable o una rama aislada. Revisa el plan de cambios, las claves, restricciones e índices y prueba RLS con roles permitidos y denegados.
6. Respaldar el destino y aplicar la migración pendiente solo después de revisar y confirmar el proyecto enlazado. Una sola persona debe ejecutar `supabase db push --linked` a la vez.
7. Comprueba el historial remoto y el comportamiento de la aplicación después del cambio. Registra la migración y su resultado en el pull request.

Vercel despliega el código web; no debe ejecutar SQL automáticamente. Publicación web y cambio de esquema son pasos separados para que una vista previa o un build no alteren datos de producción.

## Respaldos de datos locales

Antes de cambiar una función que use `localStorage`, exporta un respaldo desde cada navegador o dispositivo que contenga registros. Conserva cada archivo original con fecha y no lo subas al repositorio. Antes de importar, compara conteos, relaciones e IDs; la importación debe poder repetirse sin duplicar registros.

No borres el almacenamiento local para resolver una diferencia. Conserva una copia de origen y documenta registros omitidos, duplicados o con errores. No conviertas filas sugeridas ni cantidades pendientes de conteo en stock disponible.

## Configuración local

```powershell
Copy-Item .env.example .env.local
# Completa las variables con credenciales públicas del proyecto correcto.
npm install
npm run typecheck
npm run build
```

Para inspeccionar migraciones sin aplicarlas, usa `supabase migration list --linked` después de enlazar explícitamente el proyecto. Revisa la guía `docs/FLUJO_TRABAJO_EN_PARALELO_Y_PUBLICACION.md` antes de desplegar.

## Diferencias de historial observadas anteriormente

El registro de trabajo de octubre de 2026 reportó dos versiones cuya marca de tiempo local no coincidía con la que devolvió Supabase:

| Nombre | Archivo local observado | Versión remota reportada entonces |
|---|---:|---:|
| `inventory_catalog_metrics` | `20261022174504` | `20261022175320` |
| `inventory_metrics_fk_indexes` | `20261022180025` | `20261022180053` |

Es una observación histórica, no una comprobación del estado remoto actual. Antes de cualquier `db push`, vuelve a consultar el historial y coteja el SQL aplicado. Los scripts históricos `scripts/migrate-supabase.mjs`, `scripts/apply-one-migration.mjs` y `scripts/apply-supabase-sql.mjs` no sustituyen este procedimiento.
