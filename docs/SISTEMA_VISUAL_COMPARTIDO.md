# Sistema visual compartido de Visual Corp Suite

## Estado actual de la aplicación

La entrada activa es `src/main.tsx`: monta `src/App.tsx` e importa `src/app.css` y `src/components/ui/magic-components.css`. `src/App.tsx` importa además `src/public-site/deployment.css` y `src/design-system.css`; sus rutas públicas cargan `src/public-site/PublicSite.tsx`.

`PublicSite.tsx` carga `public-site-v2.css`, `glass-system.css`, `public-navigation.css`, `public-footer.css`, `contact-page.css`, `home-hero.css`, `public-theme.css`, `service-detail.css`, `mobile-bottom-navigation.css` y `navigation-refinement.css`. `HomePage.tsx` añade `home-page.css`; `quote/QuoteConfigurator.tsx` añade `quote/quote-calculator.css`. `public-site.css` pertenece al módulo de referencia de migración y no está en la cadena activa del sitio.

El sistema público usa `--site-*` en `glass-system.css`, `--home-*` en `home-page.css` y `--quote-*` en el cotizador. `public-site-v2.css` carga DM Sans desde `public/public-site/fonts/`; Bebas Kai se carga en `glass-system.css` y `app.css`. Las variantes de tema viven en `public-theme.css`, `home-page.css` y `quote-calculator.css`. Al cambiar una pantalla, confirma primero su cadena de imports; los nombres de archivo por sí solos no indican que una hoja CSS esté activa.

Las reglas compartidas de administración y operaciones viven en `design-system.css`, dentro del build actual. `src/theme.css`, `src/styles.css`, `src/smart.css` y `src/pos.css` no se importan desde las rutas activas; editarlos no cambiaría esta interfaz.

## Alcance de esta revisión

- La capa compartida de administración y operaciones usa tokens `--vc-*` para tinta, líneas, acento, foco, radios y sombra, con foco visible y texto de formularios legible.
- La capa `src/app/admin-glass-theme.css` da continuidad de vidrio a la navegación autenticada y a superficies comunes del panel: degradados estáticos y discretos detrás del contenido, vidrio en paneles/tarjetas y fondos sólidos en controles y tablas. Respeta los temas claro/oscuro y las preferencias de movimiento y transparencia reducidos; no requiere una biblioteca adicional.
- En el sitio público, la continuidad v11 reordena la entrada a servicios, el detalle y el cotizador con hojas y componentes existentes; añade una ruta para el destino `/soluciones` ya usado por la navegación. En Inicio, Visualito se mantiene junto al titular en escritorio y aparece después de las acciones principales en móvil. La intervención no cambia precios, cálculos, campos de envío ni datos de oferta.

Los módulos de POS, inventario, CRM y contenido conservan sus flujos. Los estilos generales de `.work-app` pueden afectar la altura de algunos campos y filas de tabla; revisar esos puntos al integrar cambios de otros chats.

## Verificación y continuidad

El 22 de octubre de 2026 se revisaron en el navegador Inicio y Contacto en escritorio, Contacto y el acceso a Administración en una vista móvil de 390 × 844 px. No se observaron recortes horizontales en esas vistas. La sesión de navegador dejó de estar disponible antes de revisar Operaciones y el último ajuste del botón de acceso; esas vistas quedan por inspeccionar visualmente al integrar. La compilación de Vite pasó después de los cambios de estilo.

El 18 de noviembre de 2026 la capa glass del espacio autenticado se revisó en un fixture aislado de 32 combinaciones: ocho anchos entre 320 y 1920 px, temas claro/oscuro y sidebar expandido/compacto. También se revisaron foco y preferencias de movimiento/transparencia reducidos. El build pasó. El acceso local a `/panel` pidió inicio de sesión, así que la visualización no incluyó una cuenta real.

Esta es una mejora técnica lista para revisión visual. No representa aprobación estética ni publicación.
