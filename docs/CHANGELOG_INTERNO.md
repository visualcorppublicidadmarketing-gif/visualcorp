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

## 2026-11-04 — Campañas, actividades y calendario de Marketing

**Etiquetas:** `marketing`, `campañas`, `calendario`, `actividades`, `accesibilidad`

- Una campaña puede agrupar publicaciones sociales y actividades no sociales, con objetivo, periodo y responsable. Las actividades contemplan decoración o ambientación, diseño interno de campaña, material promocional o recuerdos y un tipo personalizado.
- Las publicaciones mantienen su flujo y métricas. Las actividades tienen brief, fechas, horas opcionales, responsable, prioridad, etapa, siguiente paso y referencia visual; se guardan fuera de las órdenes de producción.
- El calendario permite arrastrar varios días en Mes, seleccionar rangos horarios en Semana y usar Día actual con intervalos de 30 minutos. Las actividades conservan su plazo cuando vencen; el proceso automático de reprogramación sigue limitado a publicaciones.
- La migración `supabase/migrations/20261104183131_marketing_campaign_planning.sql` quedó aplicada en Supabase; agrega tablas con alcance por organización, RLS, historial y vínculo opcional de campaña en publicaciones, sin convertir ni modificar registros importados.

## 2026-11-04 — Mejora integral de la interfaz pública y orientador interactivo de proyecto

**Etiquetas:** `sitio público`, `interfaz`, `competencia`, `diseño gráfico`, `publicidad`, `marketing`, `dialog`

- Se realizó la investigación competitiva local (Milagro), regional (Guayaquil / Guayas con sitio web propio) y de patrones internacionales de estudios creativos y de producción gráfica (`00_Guia_y_contexto/ANALISIS_COMPETITIVO_Y_WEB_2026-11-04.md`).
- Se renovó la portada pública (`src/public-site/HomePage.tsx`, `src/public-site/home-page.css`, `src/public-site/content.ts`) con:
  - **Hero de agencia + taller:** píldoras de disciplina (*Diseño Gráfico · Publicidad & Gran Formato · Rótulos & Fachadas · Marketing & Promocionales*), nota interactiva en el escenario de Visualito y barra de objetivos rápidos (*«¿Qué necesita tu marca hoy?»*).
  - **Ecosistema Creativo 360° (`CreativeStudioSection`):** selector interactivo de los 3 pilares de Visual Corp (**01. Diseño Gráfico & Marca**, **02. Publicidad Exterior & Espacios**, **03. Marketing Promocional & Eventos**) con alcance real, etiquetas de entregables, `SpotlightLayer` y `BorderBeam`.
  - **Bento Grid de Servicios enriquecido (`#servicios` y `/servicios`):** chips de piezas frecuentes por cada una de las 6 familias habilitadas, `BorderBeam` en tarjetas destacadas y botón de **Vista rápida** que abre un `Dialog` con situaciones frecuentes, checklist de preparación y enlace directo al cotizador sin perder la posición de lectura.
  - **Orientador Rápido de Proyecto (`Dialog`):** guía interactiva por objetivo del cliente que recomienda la especialidad principal y complementaria, muestra qué datos compartir y enlaza a `/cotizador?servicio=...`.
  - **Paridad de Modo Claro (`html[data-public-theme="light"]`):** corrección de selectores de tema en `home-page.css` y `BrandLink` en `PublicSite.tsx` para contraste completo en tema claro y oscuro.


## 2026-11-04 — Nuevas subpáginas `/soluciones`, matriz de branding por espacios, tiras panorámicas y galería filtrable

**Etiquetas:** `sitio público`, `subpáginas`, `soluciones`, `branding`, `portafolio`, `catálogo visual`

- Se diseñó y construyó el ecosistema visual de subpáginas con la biblioteca de referencias disponible localmente (`/inventory-reference-library/images/01..44-visual-corp.webp`, `01..44-marcas.webp`, `/images/catalog-real/*.webp`, `/images/catalog-products/*.webp` y `/inventory/VC-INV-*.webp`). Las fichas se presentan como referencias orientativas; por sí solas no confirman procedencia, disponibilidad ni especificaciones.
- **Nuevos módulos y archivos creados:**
  - `src/public-site/solutionsCatalog.ts`: catálogo estructurado con 8 categorías, fichas ilustrativas con varias series visuales, 4 ambientes, 4 temas estratégicos y 3 tiras panorámicas de 6 paneles; técnicas, materiales y disponibilidad se confirman al cotizar.
  - `src/public-site/SolutionsComponents.tsx` y `src/public-site/solutions-showcase.css`: componentes reutilizables (`EnvironmentBrandingMatrix`, `StrategicBenefitsGrid`, `PanoramicCategoryStrips`, `InteractiveCatalogGallery`, `ServiceVisualShowcase`, `SolutionsHubPage`) con Lightbox & Cotización Rápida en `Dialog`, búsqueda en vivo, conmutador de modo visual y soporte completo para tema oscuro/claro (`html[data-public-theme="light"]`) y `prefers-reduced-motion`.
- **Nuevas rutas y subpáginas mejoradas:**
  - `/soluciones` y `/soluciones/:categoria`: nuevo hub de soluciones visuales y branding por espacios, conectado en la barra superior (`SiteHeader`), mega-menú de servicios y pie de página (`SiteFooter`).
  - `/servicios` (`ServicesIndexPage`): incorpora la matriz de Branding por Espacios (`EnvironmentBrandingMatrix`), los 4 beneficios estratégicos (`StrategicBenefitsGrid`) y las tiras panorámicas interactivas (`PanoramicCategoryStrips`).
  - `/servicios/:slug` (`ServiceDetailPage`): cada una de las 6 especialidades (`impresion`, `gran-formato`, `rotulos`, `textil`, `corte`, `eventos`) muestra ahora su propia vitrina visual (`ServiceVisualShowcase`) con tarjetas de doble imagen, modal de inspección técnica, ambiente destacado y beneficios clave.
  - `/portafolio` (`ShowcasePage`): integra la galería interactiva filtrable (`InteractiveCatalogGallery`), las tiras panorámicas y la matriz de espacios junto a las publicaciones del estudio.
  - `/nosotros` (`AboutPage`), `/como-trabajamos` (`ProcessPage`) e Inicio (`/`): conectan los beneficios estratégicos, la matriz de branding por espacios y las tiras panorámicas interactivas.
