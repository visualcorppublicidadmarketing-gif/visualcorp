# Monogramas 2D/3D — implementación local V1

**Fecha:** 2026-11-25
**Estado:** V1 implementada en Suite; consulta la nota canónica de continuidad para el estado de publicación.
**Ruta interna:** `/operaciones/herramientas/monogramas`.

## Alcance implementado

- Módulo separado en `src/features/tools/monogram-generator/`; no cambia el modelo específico de cajas.
- Modelo versionado `schemaVersion: 1`, geometría y medidas canónicas en milímetros y elementos de texto con ID estable dentro de `elements[]`.
- La UI permite elegir mm o cm en monogramas; los campos admiten pasos de 0,1 mm o 0,01 cm. El JSON v1 conserva `unit: "mm"` y magnitudes en mm; `displayUnit` es una preferencia opcional compatible con archivos anteriores.
- Presets Inicial y Nombre + inicial. Se pueden añadir, duplicar, seleccionar, mover con arrastre o flechas, editar y quitar capas.
- DM Sans se convierte localmente en contornos SVG usando `opentype.js` 2.0.0. La fuente ya existía en `public/public-site/fonts/DMSans-Regular.ttf`; su licencia OFL fue copiada junto a los archivos tipográficos.
- La vista 2D y la extrusión Three.js se generan desde los mismos contornos. El visor conserva renderer y controles durante los cambios de texto, y libera las geometrías y materiales sustituidos o desmontados. Las capas se apilan en Z por su profundidad configurada.
- Guarda parámetros en `localStorage`, permite guardar y abrir un `.vcmg.json`, y exporta un SVG con trazados vectoriales.
- La UI usa controles internos, grid adaptable por container query, campos decimales editables, movimiento por teclado y estilos de movimiento reducido.
- Caja admite mm, cm y pulgadas en sus medidas y en las dimensiones de la plancha; QR permite definir el ancho impreso en mm o cm. Las tres interfaces convierten solo para mostrar/editar: las geometrías, salidas SVG/DXF y el ancho físico QR se normalizan o exportan en mm.

## Límites actuales de fabricación

- Cada texto se extruye como capa independiente. Las letras y capas superpuestas **no se unen** mediante una operación booleana.
- El SVG no compensa kerf, no conecta islas, no añade puentes y no anida piezas en una plancha; es un contorno para revisar y seguir desarrollando, no una promesa de archivo listo para máquina.
- La vista 3D es una previsualización de extrusión. No se exportan STL/3MF ni se valida que la malla sea estanca.
- Solo se habilita DM Sans. La importación de fuentes y las licencias de otras tipografías quedan pendientes.
- Los límites del artboard se comparan con los contornos tipográficos medidos; esa comprobación no evalúa resistencia, ancho mínimo ni capacidad de fabricación.

## Dependencias y criterio de interfaz

- Three.js 0.187.0 ya era dependencia de la Suite. La página y el visor 3D se cargan bajo demanda; el motor 3D solo se solicita al cambiar a esa vista. El generador conserva su propio ciclo de vida; todavía no existe un visor reutilizable global.
- Se añadió `opentype.js` 2.0.0 (MIT) para extraer contornos locales y `@types/opentype.js` 1.3.10 para TypeScript. Fuente técnica: [repositorio oficial de OpenType.js](https://github.com/opentypejs/opentype.js) y [paquete publicado](https://www.npmjs.com/package/opentype.js).
- DM Sans está bajo SIL Open Font License 1.1; se conserva `OFL.txt` junto a la fuente. Fuente: [licencia oficial en Google Fonts](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt).
- Se revisaron shadcn, Magic UI y HeroUI. Ningún patrón visual aportaba una mejora al editor; la Suite ya tiene controles propios. Se usaron esos controles y estilos locales, sin sumar una biblioteca UI.

## Siguiente cola de desarrollo

1. Revisar el editor en navegador, resoluciones intermedias y teclado con la sesión interna habilitada.
2. Elegir un motor 2D de unión vectorial para exportar geometría combinada y estudiar detección de islas/puentes antes de anunciar corte láser soldado.
3. Definir un validador de mallas cerradas y un formato de impresión 3D antes de habilitar STL/3MF.
4. Añadir importación de fuentes solo después de acordar formatos, cobertura de caracteres, almacenamiento local y política de licencias.
5. Evaluar un visor común cuando varias herramientas especializadas compartan requisitos reales. Mantener por separado el modelo geométrico de cada producto.
6. Como siguientes generadores posibles, priorizar entre rótulos/placas paramétricas, accesorios 3D personalizados y estructuras modulares de muebles usando la evidencia del catálogo; son candidatos, no herramientas aprobadas todavía.

## Evidencia y referencias

- Investigación de la interfaz de referencia: [ANALISIS_MONOGRAMAS.md](ANALISIS_MONOGRAMAS.md).
- Arquitectura verificada de un generador paramétrico de referencia: [ANALISIS_ARQUITECTURA_GENERADORES.md](../BurroCreativo-2026-11-25/ANALISIS_ARQUITECTURA_GENERADORES.md).
- Verificación en rama limpia: `npm run typecheck`, `npm run build` y `git diff --check` pasaron. Vite advierte sobre chunks mayores de 500 kB; el chunk de la página de monogramas mide 261,94 kB. CI/Preview debe completar el flujo de publicación; no se ha probado fabricación física.

## Evolución V2 — estudio paramétrico y presentación

**Fecha:** 2026-11-27
**Registro de trabajo:** evolución desarrollada inicialmente en la rama aislada `codex/monogram-studio-20261127`; el estado final de publicación está en la nota canónica de continuidad del proyecto.

- El esquema JSON pasa a `schemaVersion: 2`. El importador sigue aceptando v1 y migra sus capas de texto al modelo nuevo, asignando valores visuales predeterminados sin cambiar medidas físicas.
- Se añadieron capas paramétricas de corazón, estrella, círculo y diamante. Cada adorno comparte el mismo contorno vectorial entre la vista 2D, la extrusión 3D y SVG. Los adornos se pueden seleccionar, mover, rotar, dimensionar, duplicar, colorear y guardar.
- El visor 3D ahora ofrece materiales mate, satín y metálico, bisel suave opcional, separación animada entre capas, giro automático voluntario y restablecimiento de cámara. El giro respeta `prefers-reduced-motion`; el renderer conserva canal alfa y se combina con los fondos de la interfaz.
- Los fondos disponibles son transparencia ajedrezada, blanco, estudio 3D, degradado de dos colores con ángulo editable, papel y mármol generados localmente. Son fondos de presentación; no se descargan imágenes ni se incorporan a los contornos SVG.
- Los colores por capa, los materiales, el bisel, el giro y los fondos solo afectan la previsualización. El SVG mantiene relleno neutro y no convierte las capas independientes en una malla soldada.
- No se añadieron dependencias UI/3D: la implementación conserva React 19 y el visor imperativo con Three.js 0.187.0. No se adoptó React Three Fiber porque el módulo existente no usa R3F.
- Los catálogos consultados para esta iteración fueron Magic UI, shadcn y HeroUI. Magic UI mostró patrones animados de fondo que no encajaban con el editor; el registro shadcn del proyecto no tenía catálogos disponibles; HeroUI ofrece controles de color, pero introducir `@heroui/react` para este editor habría añadido una dependencia nueva. Se conservaron los controles nativos, el CSS y el sistema existente.
- Esta evolución no implementa booleans, soldadura de contornos, validación de sólidos, ni exportación STL/3MF. Se mantiene la advertencia de revisión de fabricación.
