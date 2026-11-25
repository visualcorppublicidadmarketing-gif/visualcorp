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

## Protección del despliegue automático

- `vercel.json` fija `git.deploymentEnabled: true`; el workflow de GitHub falla si este valor deja de estar activo.
- En Vercel, el proyecto `visualcorp-suite` del equipo `visual19` debe conservar GitHub conectado al repositorio `visualcorppublicidadmarketing-gif/visualcorp`, la rama de producción `main` y la opción de crear despliegues desde Git habilitada. El ajuste remoto de creación de despliegues no se controla desde el repositorio.
- Antes de publicar desde CLI, confirmar el equipo/proyecto enlazado y la rama/estado local. La CLI puede publicar cambios locales sin commit o desde otra rama; se reserva para una publicación de emergencia y no sustituye integrar los cambios en `main`.

## Cambios de base de datos

- Crear una migración nueva, pequeña y con timestamp único en `supabase/migrations/`; no editar una migración ya aplicada.
- Validar primero en una base local o rama de Supabase aislada. Revisar el SQL y las políticas RLS; nunca incluir contraseñas ni claves de servicio en el navegador o en Git.
- Antes de tocar producción, ejecutar `supabase migration list --remote` y comparar versiones locales/remotas. Solo una persona opera `db push` a la vez, después de integrar el lote.
- Aplicar únicamente migraciones pendientes con Supabase CLI después de confirmar el proyecto y destino remotos; conservar la confirmación interactiva de `--remote` (no añadir `--yes` al procedimiento manual), guardar el resultado y verificar el estado remoto.
- No hacer que el despliegue de Vercel aplique SQL. Código web y esquema tienen pasos separados para que la vista previa no altere producción.
- Una corrección de producción se entrega como una migración nueva. No fingir reversión eliminando del historial una migración aplicada.

## Reconciliación del historial remoto (2026-11-25)

El historial de `visualcorp-suite` se reconcilió contra `supabase_migrations.schema_migrations`, usando las versiones y el SQL aplicado almacenado en `statements`. Supabase reportó 191 migraciones aplicadas. Se restauraron en `supabase/migrations/` las 26 versiones que faltaban localmente, con su timestamp, nombre y SQL remoto. Las 22 versiones locales cuyo timestamp no corresponde al aplicado se conservaron intactas en `supabase/migration-archive/before-remote-history-sync-2026-11-25/`; el directorio de archivo queda fuera de la ruta que procesa la CLI.

La comparación posterior confirma que los 191 timestamps remotos están presentes localmente, sin duplicados. La única versión local pendiente es la migración de la entrega activa, `20261125193000_admin_suggestions`. No se ejecutó `migration repair` ni se volvió a aplicar SQL histórico. Las migraciones que ya tenían el mismo timestamp se dejaron intactas.

La CLI de Supabase no estaba instalada en el entorno de esta reconciliación. La comparación se hizo mediante consultas de solo lectura a la conexión del proyecto Visual Corp y se verificó por separado que el conjunto de versiones locales coincide con el remoto, salvo la migración nueva pendiente.

Para futuras publicaciones, repetir `supabase migration list --remote` y confirmar que la única diferencia local sea la migración nueva de la entrega. No volver a incorporar al directorio activo los archivos archivados. Los scripts `scripts/migrate-supabase.mjs`, `scripts/apply-one-migration.mjs` y `scripts/apply-supabase-sql.mjs` conservan referencias o comprobaciones históricas y no forman parte del flujo recomendado hasta su reemplazo y validación.

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
supabase migration list --remote
```

`supabase db push --remote` se ejecuta manualmente y solo cuando la lista está alineada, el destino fue comprobado y el SQL de la entrega fue revisado. El CLI solicita confirmación antes de modificar la base remota. No uses `--yes` para omitir esa revisión manual.

## Estado de controles remotos

- GitHub tiene activo el ruleset `Protect main before production` para la rama `main`: requiere pull request, bloquea force-push y borrado, sin bypass configurado y sin exigir aprobaciones para que el proceso no dependa de otro revisor. `Production build` corre en los pull requests; la protección de rama no lo exige todavía como check obligatorio.
- Vercel confirma que el repositorio `visualcorppublicidadmarketing-gif/visualcorp` está conectado, que Production sigue `main`, que existe el entorno Preview y que el último despliegue de `main` quedó `Ready`. No se cambiaron valores de entornos ni variables.
- Elegir si usar Supabase Branching para PRs. Puede tener costo y requiere revisar disponibilidad del plan; mientras tanto, usar solo una instancia local aislada para validar SQL.

El workflow verifica la compilación de producción en cada pull request. Mantener el despliegue web separado de las migraciones de base de datos y comprobar el preview antes de integrar.


## Código TypeScript

El sitio, la administración y las pantallas POS usan módulos `.ts` y `.tsx`. Los componentes compartidos se ubican en `src/app/layout.tsx` y `src/components/`; las páginas de administración se separan en `src/pages/admin/` y las pantallas POS en `src/pages/pos/`. El workflow de GitHub instala las dependencias con `npm ci`, ejecuta `npm run typecheck` y construye la aplicación en cada PR y push a `main`.
