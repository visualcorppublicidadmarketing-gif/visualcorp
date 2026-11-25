# Reverse engineering del Estudio de Diseño de Productos

**Fecha:** 2026-11-23
**Estado:** investigación aplicada a guardar y reabrir proyectos; extensiones siguientes pendientes.
**Alcance:** revisión de documentación oficial y repositorios públicos; captura controlada de la versión publicada de Visual Corp Suite. No se crearon cuentas de prueba, no se copiaron implementaciones de terceros y no se enviaron datos de Visual Corp a generadores externos.

## Hallazgos comparativos

| Referencia | Patrón observado en su documentación/código público | Aplicación posible en Visual Corp |
| --- | --- | --- |
| [Printful Design Maker](https://help.printful.com/hc/en-us/articles/50264179910673-How-does-the-Design-Maker-work) | Capas y colocaciones del arte en varias partes del producto; el usuario conserva una plantilla, ajusta el diseño y obtiene mockups/archivos. | Guardar y abrir la composición y, más adelante, asociar salidas distintas a cada colocación confirmada. |
| [Customily: bases con varias áreas](https://help.customily.com/articles/6273634935-how-to-create-a-pod-product-base-with-multiple-print-areas) | Cada área de impresión produce su archivo; frente, espalda y otras caras se preparan como colocaciones separadas. En ciertas configuraciones conviene ofrecer bases distintas para seleccionar una o varias caras. | Modelar caras y áreas como datos independientes; evitar fingir una cara posterior usando la fotografía frontal actual. |
| [Customily: áreas dentro de una base](https://help.customily.com/articles/5065686359-adding-multiple-print-areas-to-your-product-base) | Admite zonas editables independientes en la misma página o en páginas/archivos separados. | Una taza o pieza con dos áreas necesitará dos zonas reales y reglas explícitas de exportación. |
| [Zakeke: conexión de producto](https://docs.zakeke.com/docs/API/Integration/Connecting-Product/Intro-connecting-products) | Jerarquía producto → lado → área imprimible; un producto puede tener varios lados y producir archivos por área. | Buena forma de ampliar el modelo de producto cuando existan referencias frontales, posteriores y medidas aprobadas. |
| [open-product-designer](https://github.com/OdiriTeddie/open-product-designer) | Editor 2D abierto con persistencia JSON, cargar/guardar y exportar; licencia declarada MIT. | Patrón para separar un documento editable portable de los formatos finales de producción. No se reutilizó código. |
| [CustomForge](https://github.com/songshanliu/CustomForge) | Separa edición Fabric 2D de la visualización Three.js y conecta arte con texturas UV; licencia declarada Apache-2.0. El ejemplo de taza tiene atribución/licencia independiente CC BY 4.0. | Mantener separadas las funciones del lienzo 2D y de la vista 3D; exigir modelos UV licenciados por separado si se amplían las vistas reales. No se reutilizó código ni modelos. |
| [product-customizer](https://github.com/stevebrainng/product-customizer) | Ejemplo React/Konva con capas, estado de editor y exportación; el repositorio consultado no declara licencia utilizable. | Útil solo como referencia conceptual; no se incorporó ni se copió código. |

## Captura del artefacto publicado (REA)

- Operación REA: `capture_browser_scenario`, evidencia `ev_a7f4eb2bd396f0bb4be447f1aa7f327562c56940ef67dc7e633665ea12fd2190`.
- Fuente observada: `https://visualcorp-suite.vercel.app/herramientas`; Chromium 157 en perfil aislado administrado por REA.
- Resultado: inicio, activación de “Vista 3D” y espera del lienzo completados; se retuvieron capturas de accesibilidad y pantalla. Archivo de evidencia completo: `E:\VISUAL CORP\work\product-design-rea-2026-11-23\published-studio-3d-evidence.json`.
- Captura local de la nueva barra en 390 × 844: evidencia `ev_99ab16447bc24f2e5c6a5112f89e13d87178be40ac212664765fcaff9fad0094`; se llegó al toolbar, se mostró Guardar/Abrir junto con las herramientas y el escenario terminó completo. El único evento de consola fue el aviso del modo de movimiento reducido; no se registraron errores de página. Archivo: `E:\VISUAL CORP\work\product-design-rea-2026-11-23\local-editor-mobile-toolbar-evidence.json`.
- Límite: las capturas cubren una interacción propia del editor; no demuestran persistencia en servidor, rutas privadas ni tráfico de red. En la captura local se retuvieron eventos debug/info y un aviso de movimiento reducido, sin errores de página; la captura publicada no retuvo eventos. Ninguna captura incluyó cuerpos de red. La investigación de productos comparables se basó en sus documentos públicos y repositorios abiertos, no en acceso a sus cuentas o código privado.

## Decisión implementada

- Añadir “Guardar proyecto” y “Abrir proyecto” al editor compartido en lugar de cambiar de framework o instalar otro paquete.
- El archivo `.vcdesign.json` usa formato/versionado explícito, incluye capas y recursos locales, conserva la base y zona imprimible, y limita tamaño/cantidad de recursos. La apertura valida esquema, referencias, imágenes, campos numéricos, tipografías y colores antes de actualizar el lienzo; después de validar, confirma antes de reemplazar el diseño actual.
- El serializador queda separado en `src/public-site/tools/product-design/project-file.ts`; la interfaz permanece en `ProductDesignStudio.tsx`, que se importa en `/herramientas` y `/operaciones/marketing/editor`.
- Catálogos consultados: Magic UI File Tree (registry copy/paste, documentación/source y repo MIT; no publica un semver independiente por componente), shadcn/ui CLI 4.23.0 (MIT; sin `components.json` o registry configurado en el proyecto) y HeroUI Toolbar (doc React Aria, versión de docs 3.x). El toolbar de HeroUI puede aportar navegación por flechas, pero los metadatos npm de `@heroui/react@3.2.8` declaran Apache-2.0 mientras que el `package.json` de source v3.2.6 declara MIT; esta diferencia requiere aclaración antes de adoptarlo. El proyecto ya tiene `@heroui/styles` y Tailwind CSS v4, pero no `@heroui/react`. File Tree solo muestra jerarquías, y shadcn no devolvió un patrón de proyecto/canvas en el registry vacío. Se conserva el toolbar nativo, CSS y comportamiento existentes: no se añade dependencia y se mantiene ajuste en móvil.

## Próximas oportunidades y datos pendientes

1. **Caras y colocaciones múltiples.** Añadir frente/espalda, mangas, lados de taza o zonas separadas solo con imágenes de referencia adecuadas y datos por producto confirmados. Cada cara debe indicar si genera archivo aparte.
2. **Modelos 3D con UV aprobados.** Sustituir o complementar los modelos esquemáticos únicamente con modelos con procedencia/licencia y mapeo UV comprobables. La vista actual es referencial.
3. **Reutilización de composición por producto/variante.** Tras definir zonas reales, permitir aplicar una capa o variante a productos compatibles y mostrar explícitamente qué áreas quedaron cubiertas.
4. **Preparación de imprenta.** No atribuir resolución, sangrado, técnicas, dimensiones o colores de producción a una zona de maqueta sin sus especificaciones confirmadas por cotización/producción.

## Verificación local de esta iteración

- `npm run build:checked` y `npm run validate:admin-routes` pasaron.
- Flujo manual en Chrome: base propia, texto, capas de imagen, descarga del proyecto, confirmación cancelada (el diseño actual permanece), confirmación aceptada y reapertura con las tres capas/recursos; el proyecto reabierto se guardó de nuevo con referencias de activo válidas y sin duplicar bytes; archivo inválido rechazado sin cambiar el diseño.
- Viewport público: 390, 950 y 1366 px con `documentElement.scrollWidth === innerWidth` y `body.scrollWidth === innerWidth`; sin errores de página.
