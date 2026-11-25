# Monogramas 2D/3D — implementación local V1

**Fecha:** 2026-11-25  
**Estado:** código local integrado en el centro de herramientas; no desplegado ni comprobado en navegador.  
**Ruta interna:** `/operaciones/herramientas/monogramas`.

## Alcance implementado

- Módulo separado en `src/features/tools/monogram-generator/`; no cambia el modelo específico de cajas.
- Modelo versionado `schemaVersion: 1`, coordenadas y medidas en milímetros y elementos de texto con ID estable dentro de `elements[]`.
- Presets Inicial y Nombre + inicial. Se pueden añadir, duplicar, seleccionar, mover con arrastre o flechas, editar y quitar capas.
- DM Sans se convierte localmente en contornos SVG usando `opentype.js` 2.0.0. La fuente ya existía en `public/public-site/fonts/DMSans-Regular.ttf`; su licencia OFL fue copiada junto a los archivos tipográficos.
- La vista 2D y la extrusión Three.js se generan desde los mismos contornos. El visor conserva renderer y controles durante los cambios de texto, y libera las geometrías y materiales sustituidos o desmontados. Las capas se apilan en Z por su profundidad configurada.
- Guarda parámetros en `localStorage`, permite guardar y abrir un `.vcmg.json`, y exporta un SVG con trazados vectoriales.
- La UI usa controles internos, grid adaptable por container query, campos editables, movimiento por teclado y estilos de movimiento reducido.

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

1. Revisar la primera versión en navegador, resoluciones intermedias y teclado; aún no se ha ejecutado build, typecheck ni prueba visual en esta tarea.
2. Elegir un motor 2D de unión vectorial para exportar geometría combinada y estudiar detección de islas/puentes antes de anunciar corte láser soldado.
3. Definir un validador de mallas cerradas y un formato de impresión 3D antes de habilitar STL/3MF.
4. Añadir importación de fuentes solo después de acordar formatos, cobertura de caracteres, almacenamiento local y política de licencias.
5. Evaluar un visor común cuando varias herramientas especializadas compartan requisitos reales. Mantener por separado el modelo geométrico de cada producto.
6. Como siguientes generadores posibles, priorizar entre rótulos/placas paramétricas, accesorios 3D personalizados y estructuras modulares de muebles usando la evidencia del catálogo; son candidatos, no herramientas aprobadas todavía.

## Evidencia y referencias

- Investigación de la interfaz de referencia: [ANALISIS_MONOGRAMAS.md](ANALISIS_MONOGRAMAS.md).
- Arquitectura verificada de un generador paramétrico de referencia: [ANALISIS_ARQUITECTURA_GENERADORES.md](../BurroCreativo-2026-11-25/ANALISIS_ARQUITECTURA_GENERADORES.md).
- Verificación de este cambio: `npm run typecheck` y `npm run build` completaron correctamente. Build advierte que otros bundles de la aplicación superan 500 kB; hay un reporte de build, pero no se inspeccionó la pantalla en navegador ni se probó fabricación.
