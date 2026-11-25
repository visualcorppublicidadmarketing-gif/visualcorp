# Archivo de historial de migraciones

## Reconciliación del 25 de noviembre de 2026

Los archivos dentro de `before-remote-history-sync-2026-11-25/` son las versiones locales anteriores de 22 migraciones cuyos timestamps no aparecen en el historial aplicado de Supabase. Se movieron aquí sin modificar su contenido para conservar la procedencia y evitar que una operación futura las ejecute como pendientes.

Las versiones realmente aplicadas se restauraron en `../migrations/` desde las sentencias guardadas en `supabase_migrations.schema_migrations`. El archivo histórico no se debe copiar de nuevo a `migrations/` ni ejecutar directamente. Las nuevas migraciones se agregan con un timestamp único a `supabase/migrations/`.
