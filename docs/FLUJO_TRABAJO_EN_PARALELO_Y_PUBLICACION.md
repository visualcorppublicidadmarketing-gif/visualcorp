# Flujo de trabajo en paralelo y publicación

## Objetivo

Permitir varios frentes de trabajo sin sobrescribir archivos y agrupar cambios para revisarlos antes de publicar. `main` sigue siendo la rama de producción conectada a Vercel.

## Trabajo en varios chats

1. Mantener un frente coordinador que reparta tareas por áreas concretas (por ejemplo: sitio público, POS, inventario, migraciones).
2. Abrir cada frente de código en una copia de trabajo aislada basada en el `main` actualizado. En Codex, usar un worktree distinto por chat; no editar el mismo checkout desde varios chats a la vez.
3. Delimitar archivos y objetivo de cada frente. Si dos tareas necesitan los mismos archivos o esquema, hacerlas en secuencia o acordar primero una interfaz compartida.
4. Cada frente termina con una rama descriptiva y un pull request hacia `main`; integrar los pull requests en lotes coherentes, no mediante pushes de cada chat a `main`.
5. Confirmar que los checks automáticos del pull request estén en verde. Vercel usa Preview para ramas que no son de producción y Production para `main`.
6. Integrar el lote aprobado en `main`. El despliegue de producción ocurre desde esa rama; verificar el commit, el estado de Vercel y las rutas modificadas.

## Cambios de base de datos

- Crear una migración nueva, pequeña y con timestamp único en `supabase/migrations/`; no editar una migración ya aplicada.
- Validar primero en una base local o rama de Supabase aislada. Revisar el SQL y las políticas RLS; nunca incluir contraseñas ni claves de servicio en el navegador o en Git.
- Antes de tocar producción, ejecutar `supabase migration list` y comparar versiones locales/remotas. Solo una persona opera `db push` a la vez, después de integrar el lote.
- Aplicar únicamente migraciones pendientes con Supabase CLI después de confirmar el proyecto ligado; guardar el resultado y verificar el estado remoto.
- No hacer que el despliegue de Vercel aplique SQL. Código web y esquema tienen pasos separados para que la vista previa no altere producción.
- Una corrección de producción se entrega como una migración nueva. No fingir reversión eliminando del historial una migración aplicada.

## Estado que bloquea nuevas migraciones remotas

Al cotejar `supabase/migrations/` con el historial remoto de `visualcorp-suite` el 22 de octubre de 2026, encontré dos versiones con el mismo nombre pero distinto timestamp:

| Nombre | Archivo local | Versión reportada por Supabase |
|---|---:|---:|
| `inventory_catalog_metrics` | `20261022174504` | `20261022175320` |
| `inventory_metrics_fk_indexes` | `20261022180025` | `20261022180053` |

No renombrar archivos ni ejecutar `migration repair` a ciegas. Primero confirmar que el SQL local coincide con lo que realmente se aplicó y determinar si el registro remoto se corrigió intencionalmente. Mientras ese cotejo no esté resuelto, no ejecutar `supabase db push` ni los scripts históricos de aplicación directa.

Los scripts `scripts/migrate-supabase.mjs`, `scripts/apply-one-migration.mjs` y `scripts/apply-supabase-sql.mjs` conservan referencias o comprobaciones históricas y no forman parte del flujo recomendado para el proyecto Visual Corp hasta su reemplazo y validación.

## Verificación local

Desde esta carpeta:

```text
npm install
npm run typecheck
npm run build
```

Para estado de migraciones, una vez enlazado explícitamente el proyecto Visual Corp:

```text
supabase migration list --linked
```

`supabase db push --linked` se ejecuta manualmente y solo cuando la lista está alineada, el destino fue comprobado y el SQL de la entrega fue revisado.

## Estado de controles remotos

- GitHub tiene activo el ruleset `Protect main before production` para la rama `main`: requiere pull request, bloquea force-push y borrado, sin bypass configurado y sin exigir aprobaciones para que el proceso no dependa de otro revisor. El check `Production build` aún no está configurado como requisito porque el workflow local debe integrarse primero para que GitHub publique ese contexto.
- Vercel confirma que el repositorio `visualcorppublicidadmarketing-gif/visualcorp` está conectado, que Production sigue `main`, que existe el entorno Preview y que el último despliegue de `main` quedó `Ready`. No se cambiaron valores de entornos ni variables.
- Elegir si usar Supabase Branching para PRs. Puede tener costo y requiere revisar disponibilidad del plan; mientras tanto, usar solo una instancia local aislada para validar SQL.

El workflow y la guía están en el checkout local y deben integrarse mediante pull request. No se hizo push de cambios desde esta sesión.


## Código TypeScript

El sitio, la administración y las pantallas POS usan módulos `.ts` y `.tsx`. Los componentes compartidos se ubican en `src/app/layout.tsx` y `src/components/`; las páginas de administración se separan en `src/pages/admin/` y las pantallas POS en `src/pages/pos/`. El workflow de GitHub instala las dependencias, ejecuta `npm run typecheck` y construye la aplicación antes de integrar cambios.
