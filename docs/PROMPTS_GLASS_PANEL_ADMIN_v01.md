# Prompts para llevar el glassmorphism al panel Admin · Visual Corp Suite

Usa el **prompt base**, añade **un prompt de alcance** por iteración y termina con el **prompt de revisión**. El panel administrativo ya tiene una capa glass activa: estos prompts piden evolucionarla con los tokens y componentes del proyecto, no montar un sistema paralelo. No autorizan publicación ni despliegue.

## 1. Prompt base · dirección visual y límites funcionales

```text
Trabaja en E:\VISUAL CORP\apps\visualcorp-suite como diseñador de producto y desarrollador frontend senior. Primero inspecciona las rutas, layout autenticado, permisos, navegación, componentes, estados, dependencias y cadena CSS realmente activa para la pantalla solicitada. Revisa docs/SISTEMA_VISUAL_COMPARTIDO.md, src/app/design-tokens.css, src/app/admin-glass-theme.css, src/app/admin-dark-theme.css, src/app/admin-dark-refinements.css, src/design-system.css y los archivos de la pantalla; confirma los imports reales antes de editar.

Propón una evolución glass de Visual Corp sobre la base existente. Reutiliza --vc-*, --admin-glass-* y los componentes presentes; extiende sus valores o clases cuando baste. Conserva los temas claro y oscuro. Usa el degradado corporativo cian/azul, violeta, magenta y naranja como luz ambiental moderada en el fondo o como acento; deja superficies de lectura sobrias. Aplica blur y transparencia donde ayuden a separar capas, con un fallback opaco legible cuando backdrop-filter no esté disponible o el usuario reduzca transparencia. No conviertas todas las tarjetas, tablas, inputs y menús en vidrio ni uses saturación, brillos o movimiento como decoración permanente.

El panel es una suite operativa. Conserva contenido, datos, rutas, navegación, permisos, roles, filtros, búsqueda, favoritos, formularios, validaciones, estados, cálculos, transacciones, consultas, persistencia, exportaciones y acciones actuales. No inventes indicadores, registros, alertas, clientes, cifras, condiciones ni resultados; no ocultes datos con transparencias ni reemplaces datos reales con ejemplos ficticios. Mantén Visualito y el logotipo auténticos solo donde ya aparecen: no los regeneres ni los agregues a widgets operativos.

Reutiliza Motion y la tecnología instalada. No instales bibliotecas completas ni agregues dependencias salvo que una necesidad concreta no se resuelva con el código existente y quede justificada. Para cualquier patrón externo que propongas, busca y abre su documentación o código exactos en Magic UI, shadcn y HeroUI; comprueba versión, licencia, dependencias, accesibilidad, responsive, movimiento reducido y mantenimiento. Si no encaja con el stack o el panel, descártalo y explica por qué.

Mantén jerarquía clara, texto y controles con contraste suficiente, estados distinguibles además del color, foco visible y lectura predecible. Toda interfaz debe responder desde 320 px hasta pantallas anchas, incluyendo laptop de 1280–1366 px con sidebar abierto y unos 950 px útiles. Usa min-width: 0, max-width: 100%, box-sizing: border-box; adapta rejillas; permite que grupos de controles se envuelvan; conserva tablas dentro de .table-wrap con scroll horizontal interno. La página no debe provocar overflow horizontal.

Trabaja solo en el alcance pedido. Explica antes cualquier efecto compartido que vaya a cambiar. Al terminar, resume archivos y comportamiento preservado, y reporta la verificación solicitada. No publiques, despliegues, envíes comunicaciones ni cambies datos reales.
```

## 2. Prompt de alcance · marco autenticado, navegación y sidebar

```text
Aplica el prompt base solo al marco autenticado compartido: src/app/layout.tsx, src/app/Sidebar.tsx, src/app/sidebar.css y los estilos existentes de topbar, usuario y selector de tema. Inspecciona primero cómo conviven AppFrame, la navegación de src/app/navigation.ts, los permisos, el sidebar abierto/compacto y el menú móvil.

Refina fondo, sidebar, barra superior, separadores, estados activo/hover/focus, menús y transiciones para que el glass conecte el marco completo con el gradiente de marca a baja intensidad. Prioriza lectura y orientación de navegación sobre efectos. Conserva grupos, nombres, orden, destinos, permisos, badges, iconos, controles de colapso, estado de sesión y acciones existentes. No cambies la definición de rutas o roles ni crees otro menú.

Revisa sidebar expandido, compacto, drawer móvil y el espacio del contenido en 320, 390, 768, 950, 1280, 1366 y 1920 px, en ambos temas. Evita que flyouts o menús queden cortados; el teclado debe abrir, cerrar y recorrer controles en un orden lógico. Respeta Escape, foco visible, etiquetas accesibles, reduced motion y reduced transparency. Comprueba que los cambios de marco no alteren las vistas hijas.
```

## 3. Prompt de alcance · inicio único `/panel`

```text
Aplica el prompt base solo a la página de inicio autenticada `/panel` y sus estilos directos: src/pages/admin/DashboardPages.tsx y src/pages/admin/unified-home.css, además de los componentes que realmente use. `/admin` y `/operaciones` son alias que redirigen a `/panel`: conserva ese comportamiento.

Mejora la jerarquía entre bienvenida, contexto, búsqueda, filtros, áreas, favoritos y módulos. Conserva los grupos y módulos actuales y el filtrado según permisos del usuario. Mantén búsqueda, filtros por área, favoritos guardados en el navegador, indicadores y su actualización, avisos de antigüedad/error, estados vacíos y accesos actuales. No agregues tarjetas métricas, actividad, alertas o módulos con datos inventados.

Usa una superficie glass focal para la bienvenida o agrupadores, según la composición actual. Mantén tarjetas accionables distinguibles y fáciles de escanear; no asignes brillos animados a cada tarjeta. Asegura nombres accesibles y destinos correctos. Prueba coincidencias y ausencia de resultados, favoritos y áreas, estados de carga/error, permisos distintos cuando el entorno permita comprobarlos, tema claro/oscuro, teclado y tamaños desde móvil a escritorio sin overflow.
```

## 4. Prompt de alcance · una familia de módulos operativos por iteración

```text
Aplica el prompt base a una sola página o familia por iteración. Antes de editar, identifica su ruta, permisos, componentes, estilos, datos y acciones. Elige el ámbito concreto entre Comercial (CRM, cotizador/ventas, POS), Producción y abastecimiento (órdenes, inventario, compras), Marketing, Sitio y contenido, Equipo y sistema, u otra ruta existente. No refactorices toda la suite en una sola pasada.

Usa superficies glass para enmarcar navegación local, filtros, resumen contextual o herramientas secundarias. Conserva contenido, densidad útil, nombres de campos, etiquetas de estado y controles de acción. Deja las tablas y datos de alta densidad sobre superficies sólidas o casi opacas; el vidrio nunca debe reducir legibilidad, ocultar líneas, afectar selección de texto o impedir distinguir filas. Reutiliza el patrón .table-wrap para tablas anchas. Las tarjetas no deben cambiar el orden lógico de lectura ni hacer que información relevante dependa de hover.

No modifiques reglas del negocio, datos persistidos, llamadas, queries, validaciones, totales, permisos, transiciones de estado, límites ni destinos. Revisa las acciones existentes antes/después a nivel de código y verifica que conservan su efecto. Incluye escritorio con sidebar en ambos estados, tablet y móvil; cambia columnas con el ancho, permite scroll interno solo en tablas o regiones que ya lo requieren y evita overflow de página.
```

## 5. Prompt de alcance · formularios, diálogos y estados

```text
Aplica el prompt base a los formularios, diálogos, popovers, selectores y menús de la ruta indicada. Inspecciona primero el formulario real y conserva sus campos, defaults, validaciones, mensajes, permisos, envío, confirmación y estados de carga/error/éxito. No lo envíes durante la revisión ni alteres su integración.

Mejora la jerarquía de etiquetas, ayudas, grupos, errores y acciones. Usa vidrio solo como contenedor exterior si aporta separación; conserva inputs y áreas de lectura suficientemente opacos para escribir y distinguir valores. Los estados de error, advertencia, éxito, deshabilitado y seleccionado deben seguir siendo reconocibles por texto/icono además del color. Mantén el contenido y el foco cuando se abre o se cierra un diálogo; usa Escape según el comportamiento existente y devuelve el foco al control que lo abrió.

Comprueba teclado completo, foco visible, etiquetas asociadas, anuncios de error/estado, zoom, texto largo y navegación táctil. En móvil evita diálogos más anchos que la ventana, botones inaccesibles, teclado virtual que tape acciones y scroll horizontal exterior. Respeta prefers-reduced-motion y prefers-reduced-transparency.
```

## 6. Prompt de revisión · composición, responsive y accesibilidad

```text
Revisa la mejora Glass del alcance indicado. No amplíes el alcance ni cambies funciones para resolver solo problemas visuales.

Valida tema claro y oscuro, fallback sin backdrop-filter y prefers-reduced-transparency: reduce. Revisa contraste de texto, controles, bordes, estados, foco y datos sobre cada fondo; zoom; texto largo; carga, error, vacío y deshabilitado. Recorre Tab, Shift+Tab, Enter, Espacio y Escape donde corresponda; verifica que hover no sea requisito para leer u operar. Con prefers-reduced-motion: reduce elimina desplazamiento/parallax y animaciones decorativas, evita ciclos infinitos y muestra el contenido directamente sin depender de una entrada animada. Mantén las transiciones funcionales breves y discretas.

Comprueba al menos 320, 390, 600, 768, 950, 1280, 1366 y 1920 px; con sidebar expandido, compacto y drawer móvil según aplique. Verifica document.documentElement.scrollWidth <= window.innerWidth y que toda tabla ancha use scroll dentro de .table-wrap, no en el documento. Confirma que los enlaces, rutas, permisos, valores, filtros, formularios, acciones y persistencia coinciden con el comportamiento previo. No envíes formularios, no ejecutes transacciones reales y no publiques ni despliegues. Reporta hallazgos bloqueantes separados de mejoras opcionales.
```

## Patrones consultados para estos prompts

- **Magic UI · Magic Card:** se abrió el registro y su código. Usa `motion/react` y un foco de luz que sigue el puntero; ese brillo puede distraer durante trabajo prolongado y no hace falta en la base actual.
- **Magic UI · Border Beam:** se abrió el registro y su código de animación infinita alrededor del borde. No ofrece una variante reducida en el código consultado; por eso los prompts lo excluyen de adornos persistentes. Magic UI publica licencia MIT ([licencia](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md)).
- **shadcn · Sidebar y Card:** la búsqueda MCP no pudo consultar registros porque el proyecto MCP no tiene registros configurados. Como fallback se revisaron las páginas oficiales de [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) y [Card](https://ui.shadcn.com/docs/components/base/card). Su composición de sidebar (grupos, trigger y drawer) sirve como referencia, pero la aplicación ya posee navegación, permisos y shell propios; no se recomienda sustituirlos.
- **HeroUI · Card, Table y Sheet:** se abrió la documentación del MCP HeroUI React v3.2.7. Card emplea composición por partes; la integración React se apoya en React Aria y Tailwind CSS v4 según la guía MCP. No hace falta añadir otro sistema de componentes: adaptar las superficies actuales mantiene menos dependencias y evita mezclar estilos.

Los catálogos se usaron para comparar patrones, no para justificar una instalación. El panel ya cuenta con `admin-glass-theme.css`, tokens claro/oscuro, blur y fallbacks; la propuesta es continuar esa capa y conservar tablas y controles orientados a operación.
