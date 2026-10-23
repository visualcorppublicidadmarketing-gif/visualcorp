# Sistema visual compartido de Visual Corp Suite

## Estado de la aplicación

La entrada `src/main.jsx` importa `src/app.css`. `src/App.jsx` importa `src/app.css`, `src/public-site/deployment.css` y `src/design-system.css`. `src/public-site/PublicSite.jsx` importa `src/public-site/public-site.css`. Por tanto, las reglas compartidas nuevas viven en `design-system.css`, que forma parte del build actual. `src/theme.css`, `src/styles.css`, `src/smart.css` y `src/pos.css` no se importan desde las rutas activas; editarlos no cambiaría esta interfaz.

## Alcance de esta revisión

- Tokens `--vc-*` para tinta, líneas, acento, foco, radios y sombra.
- Foco de teclado visible, controles táctiles de al menos 44 px y texto de formularios más legible.
- Ajustes comunes de navegación, tarjetas, tablas y estados vacíos en los espacios de administración y operaciones.
- Mejoras de lectura en el formulario público y en la pantalla compartida de acceso.

El sitio público conserva sus composiciones y los módulos de POS, inventario, CRM y contenido conservan sus flujos. Los estilos generales de `.work-app` pueden afectar la altura de algunos campos y filas de tabla; revisar esos puntos al integrar cambios de otros chats.

## Verificación y continuidad

El 22 de octubre de 2026 se revisaron en el navegador Inicio y Contacto en escritorio, Contacto y el acceso a Administración en una vista móvil de 390 × 844 px. No se observaron recortes horizontales en esas vistas. La sesión de navegador dejó de estar disponible antes de revisar Operaciones y el último ajuste del botón de acceso; esas vistas quedan por inspeccionar visualmente al integrar. La compilación de Vite pasó después de los cambios de estilo.

Esta es una mejora técnica lista para revisión visual. No representa aprobación estética ni publicación.
