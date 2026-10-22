# Registro interno de novedades

La aplicación mantiene un registro de cambios del equipo en Supabase (`public.internal_change_log`). Sus publicaciones aparecen en los paneles de administración y operaciones y se actualizan en tiempo real.

## Uso

- Administración: abrir `/admin/cambios`, redactar título, resumen y detalle, elegir categoría y audiencia; guardar como borrador o publicar.
- Operaciones: abrir `/operaciones/cambios` para consultar las entradas destinadas a operaciones o a todo el equipo.
- Los paneles `/admin` y `/operaciones` muestran un resumen de las últimas entradas.
- Administración puede editar, volver a publicar y archivar entradas. Los borradores y archivos solo se muestran a quienes tienen permisos de administración.

## Acceso y persistencia

La tabla tiene políticas RLS por organización, audiencia y rol. Usuarios internos autorizados leen solo publicaciones vigentes para su espacio. `owner`, `admin`, `manager` y `website_admin` pueden gestionar el registro. Los cambios se transmiten con Supabase Realtime. La migración base es `20261022184130_internal_change_log`; el registro inicial de la función y las mejoras recientes se carga con `20261022184223_publish_changelog_feature`.

## Entradas iniciales

- Inventario avanzado y trazable (`483136c`).
- POS conectado con clientes e inventario (`5a6cfef`).
- Caja, devoluciones, transferencias y producción (`95126df`).
- Novedades compartidas para el equipo (`2026-10`).
- POS: carrito de varios artículos con búsqueda y filtros, imágenes de catálogo, total en vivo, selección de cliente y cotización aprobada; publicación en Supabase pendiente de acceso autenticado (`Fase 3 parcial`, 2026-10-22).

Las futuras publicaciones las redacta el equipo desde el panel; la lista no se rellena automáticamente a partir de commits para evitar publicar cambios sin revisar su alcance o impacto.
