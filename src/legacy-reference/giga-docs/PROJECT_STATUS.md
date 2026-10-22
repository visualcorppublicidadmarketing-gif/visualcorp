# Estado del proyecto Gigaprint

Última actualización: 2026-08-21

## Estado actual

El sitio está publicado en GitHub Pages y el build de producción funciona. La URL pública es:

https://gigaprint-ec.github.io/gigaprint-webpage/

El repositorio está en la rama `main`. GitHub Actions compila y publica automáticamente después de cada push.

El panel admin publicado está disponible en `https://gigaprint-ec.github.io/gigaprint-webpage/admin`. El acceso usa Supabase Auth cuando el build tiene configuradas las variables de Supabase; si se ejecuta sin esas variables, queda disponible únicamente el modo demo local para desarrollo.

## Funcionalidades terminadas

- Inicio comercial con hero, servicios, proceso, productos destacados y bloques editables.
- Página Gigaprint/nosotros.
- Promociones.
- Tienda filtrable por categoría.
- Detalle de productos con variantes, colores, tamaños y escalas.
- Cotizador inteligente para m², unidades, volumen y lotes.
- Carrito de cotizaciones.
- Formulario de contacto y solicitudes locales.
- Panel admin demo.
- Editor visual con Block Builder y bloques de texto, columnas, imágenes, galerías, video, banner, divisor, botones, redes, mapa, embed y formulario.
- Rich text editor TipTap con formato, enlaces, imágenes, color, resaltado, listas, citas, código y pantalla completa.
- Galerías mosaico, masonry, carrusel y lightbox.
- Calendario moderno.
- Formularios dinámicos, encuestas, opción única/múltiple, colores, fechas y archivos.
- Conversión de imágenes a WebP en el navegador.
- Buscador Ctrl/Cmd+K.
- Modo claro/oscuro.
- Menú contextual personalizado con clic derecho y pulsación larga en móvil.
- Temas `default`, `navidad`, `milagro`, `black-friday`, `independencia` y `verano`, aplicables desde `/admin/temas` con un botón. El naranja oficial de marca es `#ea580c`.
- Identidad instalada: `public/favicon.svg`, `public/manifest.webmanifest` y logotipo real en el panel admin.
- Animaciones premium en hero, navegación, secciones, tarjetas, botones, menú, footer y decoraciones.
- Soporte para `prefers-reduced-motion`.
- Biblioteca de marca optimizada desde `Recursos (no borrar)`: 55 copias web, WebP para raster y SVG conservados para logos.
- Biblioteca preparada para editor/admin en `src/data/resourceManifest.js`.

## Correcciones importantes de GitHub Pages

GitHub Pages publica el proyecto debajo de `/gigaprint-webpage/`. Para evitar enlaces e imágenes rotas:

- `vite.config.js` usa `base: '/gigaprint-webpage/'` únicamente dentro de GitHub Actions.
- `src/App.jsx` usa `BrowserRouter basename={import.meta.env.BASE_URL}`.
- `src/data/media.js` centraliza `assetPath()` para imágenes locales.
- `src/store.jsx` normaliza datos antiguos guardados con rutas `/images/...`.
- `BlockRenderer` adapta los botones internos a la base pública.
- Vite genera `dist/404.html` como fallback para rutas SPA.

## Catálogo y cotizador

`src/data/estebanCatalog.json` contiene el catálogo importado desde Esteban. `src/catalog.js` lo transforma en productos editables y conserva:

- `priceScales` para precios por volumen.
- `priceMatrix` para tarifas por medida/variante.
- `variantOptions` para materiales, acabados y configuraciones.
- `pricingMode` para unidad, m² o total por lote.
- `calcType` para cálculo por área o unidad.
- Para familias como `Campana Lonas`, los escalones se comparan contra el área total (m²), no contra la cantidad de piezas.
- Los precios escalonados aceptan `price`, `pvp`, `unitPrice` o `total`, para conservar datos importados sin perder precisión.

El catálogo local actual contiene 95 productos normalizados, incluyendo productos manuales y familias del catálogo importado.

## Persistencia y limitaciones actuales

El sitio funciona con datos demo locales para poder probarlo sin credenciales:

- `gigaprint-site-v1`
- `gigaprint-cart-v1`
- `gigaprint-theme`
- `gigaprint-admin`

Con Supabase configurado, la aplicación lee settings, servicios, productos, promociones y bloques publicados, guarda solicitudes en `inquiries` y sincroniza cambios del administrador con rol `admin`. Si Supabase no está configurado o la red falla, conserva una copia local para que el sitio siga siendo navegable.

Las migraciones `20260821010000_auth_storage_admin.sql`, `20260821020000_super_admin_roles.sql` y `20260821030000_quote_calculator_catalog.sql` ya están aplicadas. La última añade configuración del cotizador, IVA, diseño, ojales, instalación, variantes, imágenes y la tabla persistente `quote_requests`. El catálogo inicial ya está sembrado: 95 productos, 89 importados de Esteban, 4 servicios, 3 promociones y 3 bloques de inicio.

## Pendientes priorizados

### Prioridad alta

- Los usuarios `ecgigaprint@gmail.com` y `estebanico10@gmail.com` ya fueron creados en Supabase Auth y sus filas en `profiles` tienen rol `super_admin`.
- Mostrar las `quote_requests` en un tablero Kanban del panel admin.
- Subir la biblioteca optimizada a `gigaprint-media` desde el panel cuando el uploader se conecte a la UI de Storage.
- Reemplazar datos de contacto demo por datos reales.
- Rotar los secretos compartidos durante la configuración.

### Prioridad media

- Historial/versionado de páginas y bloques.
- Estados de producción para solicitudes.
- Analítica y eventos de conversión.
- Dominio propio y despliegue final en Vercel.

### Prioridad baja

- Mejorar imágenes del catálogo por producto.
- Integración real de mapa.
- Integración de correo/WhatsApp mediante Edge Function.
- Checkout o pagos, si el negocio lo requiere.
