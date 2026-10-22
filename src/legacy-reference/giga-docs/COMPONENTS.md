# Inventario de componentes

## Componentes compartidos

Archivo: `src/components.jsx`

- `Brand`: identidad Gigaprint.
- `Button`: CTA consistente con icono y variantes.
- `Header` / `Footer`: navegación pública y contacto.
- `PageShell`: tema, menú contextual, animaciones, header, footer y toast.
- `AdminShell` / `AdminNav` / `AdminHeader`: estructura del panel privado.
- `ServiceCard` y `ProductCard`: tarjetas data-driven.
- `CartSummary`: resumen y edición del carrito.
- `GlobalContextMenu`: menú público/admin para clic derecho y pulsación larga.

## Studio reutilizable

Directorio: `src/components/studio/`

- `BlockBuilder.jsx`: crear, seleccionar, ocultar, duplicar, mover y eliminar bloques.
- `BlockRenderer.jsx`: render público de bloques.
- `blocks.js`: catálogo y valores iniciales de bloques.
- `RichTextEditor.jsx`: TipTap enriquecido y pantalla completa.
- `MediaUploader.jsx`: drag & drop, múltiples archivos y WebP.
- `MediaGallery.jsx`: grid, masonry, carrusel y lightbox.
- `Calendar.jsx`: calendario de agenda.
- `FieldRenderer.jsx`: campos dinámicos y formularios.
- `ColorPicker.jsx` / `color.js`: HEX, RGB, HSB y CMYK.
- `Pickers.jsx`: iconos, SVG, logos y emojis.
- `Chrome.jsx`: tema, diálogo, toast, buscador, contexto, motion observer y decoraciones estacionales.

## Bloques disponibles

`text`, `columns`, `image`, `gallery`, `media-text`, `banner`, `video`, `divider`, `button`, `social`, `map`, `embed`, `form`.

Todos los bloques deben mantener IDs estables, aceptar edición desde el admin y evitar rutas absolutas no adaptadas a `import.meta.env.BASE_URL`.

## Sistema de temas

Los presets viven en `src/data.js` como `themePresets`. El estado activo se guarda en `data.settings.themePreset` y se modifica con `setSiteTheme()` en `src/store.jsx`.

Variables principales:

- `--brand-orange`: naranja permanente del logo.
- `--orange`: color activo de temporada.
- `--orange-dark`: acento oscuro.
- `--orange-soft`: fondo suave.
- `--theme-secondary`: color secundario.

## Reglas para nuevos componentes

- Usar datos configurables y no cantidades hardcodeadas.
- Añadir estados vacío, carga, error y éxito cuando aplique.
- Mantener navegación compatible con `BrowserRouter basename`.
- Usar `assetPath()` para imágenes locales.
- Respetar modo oscuro, responsive y `prefers-reduced-motion`.
- No introducir dependencias grandes sin justificar el impacto en el bundle.
