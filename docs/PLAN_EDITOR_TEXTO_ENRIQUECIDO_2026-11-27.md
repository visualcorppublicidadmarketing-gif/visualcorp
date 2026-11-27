# Plan del editor de texto enriquecido

**Fecha:** 27 de noviembre de 2026
**Estado al redactar:** primera fase implementada en el componente compartido; integración y despliegue aún por completar.
**Alcance:** `RichTextEditor` y sus consumidores en VisualCorp Suite.

## Objetivo

Mantener una sola implementación de edición enriquecida para que las mejoras se reflejen en cada pantalla que la importa. El editor debe ofrecer las acciones frecuentes de forma visible, reservar las opciones menos usadas para un panel secundario y conservar el contrato HTML existente.

## Hallazgos de la investigación

- La guía de accesibilidad de Tiptap recomienda nombres accesibles, navegación por teclado y gestión explícita del foco en las barras de herramientas. La barra de este proyecto sigue el patrón de una sola parada de tabulación y navegación con flechas; el panel avanzado y la barra contextual conservan su propio orden de tabulación. [Tiptap: Accessibility](https://tiptap.dev/docs/guides/accessibility)
- Para tablas, Tiptap ofrece TableKit y comandos de estructura para filas y columnas. Se eligió ese conjunto, con scroll dentro de la tabla en pantallas estrechas. [Tiptap: TableKit](https://tiptap.dev/docs/editor/extensions/functionality/table-kit)
- El menú contextual de Tiptap aparece junto a una selección de texto y evita llenar la barra principal con acciones que solo tienen sentido al seleccionar. [Tiptap: BubbleMenu](https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu)
- El patrón de barra de herramientas de WAI-ARIA aporta la base de teclado y semántica. Se mantienen etiquetas visibles para los grupos y nombres accesibles específicos en cada control. [WAI-ARIA APG: Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)
- Se revisaron los catálogos de shadcn, HeroUI y Magic UI. Sus grupos de botones y controles alternables sirven como referencias, pero ninguno ofrece una pieza de editor que encaje directamente con Tiptap, el CSS existente y los temas de VisualCorp. Por eso se conservaron los controles del proyecto y se adaptó el patrón de interacción.

## Decisiones de diseño

1. **Acciones frecuentes primero:** deshacer/rehacer, formato básico, listas y enlaces/imágenes están en la barra compacta.
2. **Progresión gradual:** alineación, tipografía, tamaño, colores, citas, código y tablas se agrupan en “Más formato”.
3. **Formato contextual:** la selección de texto muestra Negrita, Cursiva, Subrayado y Enlace en un menú flotante.
4. **Edición accesible:** controles con etiquetas, estados activos comunicados, navegación por flechas, acceso con `Alt+F10`, foco inicial en el campo de inserción, diálogo ampliado cerrable con `Esc` y retorno del foco al control de apertura.
5. **Contenido reutilizable y seguro:** extensiones, sanitización y estilos de lectura compartidos. Se permite HTML de formato conocido y se eliminan scripts, atributos de evento, protocolos inseguros y etiquetas activas como `iframe`.
6. **Temas y pantallas:** variables para modo claro/oscuro, controles táctiles y grupos adaptables. Las tablas y el código pueden desplazarse dentro de su propia región para evitar desbordar la página.
7. **Sin subida remota por defecto:** las imágenes se insertan desde una URL pública. La carga de archivos solo se muestra si un consumidor proporciona una función de carga; los consumidores actuales no la conectan.

## Fases

### Fase 1 — Editor compartido y base segura

**Estado: implementada en esta rama.**

- Unificar extensiones Tiptap para editor, lectura comercial y bloques del sitio.
- Mantener el HTML como contrato de intercambio.
- Añadir enlaces, imágenes con texto alternativo, tablas, formato avanzado, selección contextual y pantalla completa.
- Sanear contenido inicial, pegado y renderizado de bloques; conservar tablas en los lectores.
- Revisar accesibilidad de teclado y foco, tema claro/oscuro, diseño adaptable y usos del componente.

### Fase 2 — Verificación de regresiones

**Estado: validación manual realizada; automatización pendiente.**

- Añadir cobertura automatizada del saneador: etiquetas prohibidas, eventos, URLs `javascript:`, imágenes y HTML válido.
- Añadir pruebas de tablas para insertar, añadir/eliminar fila o columna y eliminar una tabla, incluyendo varias acciones consecutivas.
- Añadir una comprobación de consumidores que confirme que todos importan el mismo editor y el mismo lector.
- Registrar comprobaciones visuales en 390, 950, 1280, 1366 y 1600 px para ambos temas; la validación manual actual no encontró scroll horizontal.

### Fase 3 — Funciones posteriores con criterios de entrada

- Evaluar atajos de edición y una ayuda breve de teclado si las sesiones reales muestran fricción.
- Revisar semántica de encabezados de tabla, navegación entre celdas y experiencia móvil antes de ampliar sus comandos.
- Considerar selector de activos o carga de imágenes solo cuando haya destino persistente, permisos y cuota aprobados; mantener la inserción por URL mientras tanto.
- Admitir proveedores de contenido incrustado únicamente con una lista explícita de hosts y una representación aislada segura; el saneador actual elimina `iframe`.

## Criterios de aceptación

- Los lugares que usan `RichTextEditor` comparten comportamiento y extensiones.
- La lectura pública conserva el mismo contenido estructurado sin permitir ejecución de HTML activo.
- El teclado alcanza las acciones de la barra principal, opciones avanzadas, menú contextual y diálogo.
- Insertar una imagen informativa exige texto alternativo; una imagen decorativa puede llevar `alt=""`.
- No aparece desbordamiento horizontal en la página en modo claro ni oscuro en anchos móviles, de laptop y amplios.
- La publicación incluye los checks de compilación y el despliegue queda verificado.
