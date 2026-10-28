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
- POS: cobro dividido entre efectivo, transferencia, tarjeta u otro; saldo pendiente visible y posibilidad explícita de dejar la orden a crédito. Cobros en efectivo requieren turno de caja abierto (`Fase 3 parcial`, 2026-10-23).

Las futuras publicaciones las redacta el equipo desde el panel; la lista no se rellena automáticamente a partir de commits para evitar publicar cambios sin revisar su alcance o impacto.

## 2026-10-24 — Imágenes de referencia de catálogo e inventario

- Se asignaron referencias visuales a los 70 SKU activos del inventario, combinando muestras reales de materiales de Visual Corp con referencias generadas etiquetadas claramente.
- La biblioteca de inventario pasó a 114 familias y 158 imágenes, y las altas/ediciones de ficha requieren una imagen.
- La app prioriza fotos internas en 18 familias del catálogo de productos y usa la biblioteca local cuando reconoce un mockup de producto.
- Auditoría remota de solo lectura: 247 productos del cotizador y 247 del catálogo web ya tenían una imagen cada uno; actualmente el inventario conserva 70 imágenes vacías en Supabase.
- La migración de datos está preparada y no aplicada. No se publicó esta versión.
- Detalle y procedencia: `docs/REFERENCIAS_VISUALES_CATALOGO_E_INVENTARIO_2026-10-24.md`.

## 2026-10-24 — Ubicaciones activas en traslados y consumo productivo

- Los formularios de traslado y consumo de materiales muestran únicamente ubicaciones activas de la sucursal elegida y exigen una selección explícita antes de registrar movimientos.
- No se agregó esquema ni se ejecutó una migración; se usa la tabla de ubicaciones ya desplegada.

## 2026-10-28 — Navegación móvil, inventario y registro con etiquetas

**Etiquetas:** `sitio público`, `móvil`, `inventario`, `catálogo`, `changelog`, `admin`

- En celular, el sitio público usa una barra inferior con cinco accesos. Servicios, Empresa y Explorar agrupan las rutas relacionadas en hojas compactas; cada familia de servicio y página pública sigue disponible.
- El catálogo de tarifas deja de repetir los nombres de las tres modalidades en el encabezado de cada familia. Cada precio conserva su propio rótulo junto al campo.
- Las tarjetas de inventario ordenan estado, selección, métricas y acciones en una jerarquía uniforme; las acciones siguen disponibles según los permisos existentes.
- El registro interno acepta hasta ocho etiquetas por novedad, las muestra en cada entrada, permite buscarlas y añade un filtro por etiqueta. La columna `tags` se añadió a `public.internal_change_log` con límite de ocho elementos y validación de valores no nulos.
- Se mantiene el trabajo acumulado del panel administrativo y el footer: partículas visibles en ambos temas y contraste de texto reforzado en modo claro.
- Migración `20261028122806_changelog_tags` aplicada en Supabase `iomdmclkimfmvlzcrkyz`; el esquema quedó verificado. La creación de una entrada compartida desde el conector fue bloqueada por `visualcorp_guard_write()` debido a los permisos del perfil conectado; no se cambió ni se intentó eludir esa protección.
- Verificación local: `npm run build:checked`; navegación móvil revisada a 320 y 390 px y en tema claro, sin desbordamiento horizontal ni errores de consola. La compilación de producción pasó en GitHub y el módulo de navegación agrupada quedó verificado en `https://visualcorp-suite.vercel.app`.
- Publicación: PR #115 integrado el 2026-10-28 en `main` (commit `77e35ce83b50e7cce635756051d65e0a08ce673e`).
