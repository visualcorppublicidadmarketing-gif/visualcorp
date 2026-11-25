# Generadores paramétricos de Burro Creativo: catálogo, presets y caja flexible

**Fecha:** 2026-11-25  
**Estado:** diez capturas archivadas y una inspección estática REA de Caja flexible; algunas afirmaciones del usuario quedan sin verificar o corregidas.  
**Objetivo:** preservar contexto reutilizable para el catálogo de herramientas paramétricas de Visual Corp Suite y relacionarlo con la futura herramienta de monogramas.

## Procedencia y cómo leer esta nota

El usuario proporcionó diez capturas de páginas públicas de Burro Creativo y un resumen técnico sobre scripts generadores, un visor compartido, presets, almacenamiento local y normalización. Las capturas se copiaron sin alterar desde `C:\Users\PERSONAL\AppData\Local\Temp` a [`references/`](references/); los originales siguen en su ubicación de origen. Las rutas originales y los destinos nuevos constan en `00_Guia_y_contexto/Inventarios/MAPA_DE_ARCHIVOS.csv`.

Las capturas constituyen evidencia visual de la interfaz y de los valores mostrados en ese momento. Los detalles sobre nombres de archivos JS, funciones, claves de `localStorage` y lógica interna se conservan como investigación aportada por el usuario, no como instrucciones para ejecutar o modificar código y no como hechos probados por las imágenes.

Fuente de la herramienta examinada: [Caja flexible con cierre — Burro Creativo](https://burrocreativo.com/g/caja-flexible-con-cierre). Las páginas de catálogo también muestran las categorías públicas de corte láser, impresión 3D, texto y planos de muebles.

## Lo que muestran las capturas

| Captura archivada | Observación visual |
|---|---|
| [Catálogo de planos de muebles](references/codex-clipboard-e4349f6e-d7a1-4af9-9639-b1b09d199b14.png) | Categoría con tarjetas para planos paramétricos, entre ellos paneles de TV y repisa zigzag. La captura muestra 45 modelos. |
| [Herramientas de texto](references/codex-clipboard-71a03ad7-7dc3-4187-bfcc-f2c13fa4d100.png) | Tarjetas para monogramas láser, iniciales, texto soldado y formas/letras decorativas. Muestra seis herramientas. |
| [Impresión 3D](references/codex-clipboard-53c7efd3-143f-423c-954f-a8e287da8ac6.png) | Catálogo de generadores de productos imprimibles; la captura muestra 18 herramientas. |
| [Corte láser](references/codex-clipboard-1c6cbf7c-fa7c-40ce-9b43-775eb4be30f7.png) | Catálogo de plantillas láser, incluidas cajas y artículos personalizados. La captura muestra 167 herramientas. |
| [Caja flexible: preset y vista 3D](references/codex-clipboard-5d2a51db-49e1-418e-813e-3120ab04a107.png) | Editor con presets Original, Joyero, Caja pequeña y Botella; dimensiones interiores, grosor, redondeo, visor 3D y resumen de corte. |
| [Caja flexible: abierta](references/codex-clipboard-841662fc-7ae9-4e64-9be7-5e236ab230fd.png) | Misma herramienta con la caja abierta en el visor 3D. |
| [Caja flexible: Caja pequeña](references/codex-clipboard-3919f3a1-1d61-44b9-8ce8-a2611a339e2c.png) | Selección visible de 100 × 80 × 42 mm; cambian el tamaño 3D y el resumen. |
| [Tapa, construcción y medidas](references/codex-clipboard-27e06eb1-f993-4be7-9493-3f7b401cb38c.png) | Secciones adicionales de construcción y tapa permanecen integradas al mismo editor. |
| [Texto y cama de corte](references/codex-clipboard-aced28db-35cf-4e7d-a7ae-0a1dc04d2d35.png) | Campos de texto personal, dimensiones de cama, cantidad y ajustes; se alcanza a leer el estado de guardado en el navegador. |
| [Información y preguntas frecuentes](references/codex-clipboard-c4a0196b-fde9-49f9-8332-28fc8740aa2e.png) | Explicación pública del producto y preguntas frecuentes al pie de la página. |

Los conteos son los que aparecían en las imágenes recibidas, no un inventario actual de la web. Los presets visibles presentan, entre otros, estos valores en sus tarjetas: Original 130 × 124 × 52 mm; Joyero 260 × 110 × 50 mm; Caja pequeña 100 × 80 × 42 mm; Botella 110 × 110 × 300 mm. La interfaz solicita medidas interiores y grosor real de tablero, muestra modos de armado/apertura/despiece, y resume piezas, hojas y longitud estimada de corte. Al cambiar a Caja pequeña se ve otro tamaño y se actualiza ese resumen.

El botón de descarga visible en las capturas indica Premium. No se pulsó ni se inspeccionó ningún archivo descargado; las imágenes no certifican la validez del plano ni su importación en una máquina.

## Inspección estática de Caja flexible con cierre

El 25 de noviembre se capturó pasivamente la página pública y los módulos frontend solicitados por ella, sin ejecutar descarga Premium. Evidencia REA: `ev_a4670b0e57e870d9925ddbe45a2f5233d9ad12186a836e98e26448e442fd672d`. Esto se refiere únicamente a Caja flexible con cierre.

- La página anfitriona carga un iframe `/generadores/caja-flexible-con-cierre/index.html?v=1.1.0`. Desde la herramienta se solicitaron por separado `kernel.js`, `geometria.js`, `corte.js`, `zip.js`, `manual.js`, `app.js` y `visor.js`.
- **Generación paramétrica:** `geometria.js` exporta `construir`, `normalizar`, `PRESETS` y `DEFAULTS`; `construir(font, input)` calcula los parámetros/piezas. No se cargó un STL/OBJ para mostrar la caja en el visor examinado.
- **Operaciones 2D:** `kernel.js` expone operaciones geométricas tipo unión, diferencia, intersección, offset, texto, redondeo y conexión. En la versión observada, no es donde se definen `PRESETS` ni `normalizar`.
- **Visor 3D:** `visor.js` importa Three.js local `0.160.1`, crea escena y renderer WebGL y extruye piezas con `THREE.ExtrudeGeometry`. `app.js` importa el visor de forma dinámica dentro de `show3D()`.
- **Una entrada para 3D y SVG:** `generate()` obtiene `r=G.construir(...)`, guarda el resultado y calcula `plan=packing(r)`; el visor recibe `setModel(r)`, y la exportación usa `cutFiles(r, plan)`. Esto verifica que esta herramienta usa el mismo resultado paramétrico para la vista y sus SVG/plan. No demuestra que todas las herramientas hagan lo mismo.
- **Persistencia:** `app.js` usa la clave `bc-caja-flexible-con-cierre-v1`, lee con `localStorage.getItem(KEY)` y `persist()` escribe JSON mediante `localStorage.setItem`. No se leyeron valores ya guardados en el navegador.
- **Salidas descritas:** la página anfitriona enumera SVG por hoja/material, inventario CSV, guía HTML y JSON editable. La descarga sigue marcada Premium y no se solicitó; la inspección confirma el flujo de código y el texto de la página, no que el ZIP final se haya abierto o fabricado correctamente.

### Presets y reglas geométricas verificadas en geometria.js

Los presets pertenecen a la versión `v=1.1.0` de Caja flexible. Medidas en mm:

| Preset | Ancho × fondo × alto | T | Radio | Bandas | Variación adicional |
|---|---:|---:|---:|---|---|
| Original | 130 × 124 × 52 | 4 | 20 | enteras | — |
| Joyero | 260 × 110 × 50 | 4 | 20 | enteras | 4 columnas |
| Botella | 110 × 110 × 300 | 4 | 20 | compactas | — |
| Regalo | 180 × 150 × 70 | 3 | 18 | enteras | — |
| Compacta | 130 × 124 × 52 | 4 | 20 | compactas | — |
| Organizador | 240 × 180 × 80 | 4 | 24 | compactas | 3 columnas, 2 filas |
| Detalles | 310 × 240 × 100 | 4 | 20 | compactas | 2 filas, divisiones medidas, `fondosDiv=100; 0` |
| Pequeña | 100 × 80 × 42 | 4 | 20 | enteras | — |

El estado común de divisiones parte de una columna y fila, modo `iguales`, listas vacías, alto y holgura cero; algunos presets cambian filas/columnas. Los valores globales incluyen cierre de madera, perfil original, texto vacío, texto en modo grabado, holgura 0.15, kerf/ranura/puente 0 y cama 600 × 400 mm con margen 5 mm, separación 3 mm y una copia. Un preset puede omitir propiedades y heredarlas del estado por defecto.

`normalizar(input)` combina input con `DEFAULTS`, valida números finitos y rangos, exige enteros para filas/columnas/copias, recorta listas y textos, y limita dimensiones mínimas respecto al grosor. Entre sus límites: ancho 60–500, fondo 55–500, alto 16–500, grosor 2–6, radio 0–100, juego 0–0.4, kerf 0–0.3, ranura 0–1.5, puente 0–4 mm; cama 100–2400 mm por eje, margen 3–30, separación 1–15, copias 1–20, filas/columnas 1–8. También limita listas a 200 caracteres y título/frase/frente a 50/80/45. Los rangos son de esta herramienta observada, no parámetros confirmados para Visual Corp.

La restricción del radio respecto al fondo está en `construir()`, no como regla literal `radio ≤ fondo` dentro de `normalizar()`: calcula `maxR = min(alto/2, (W-12*T)/2, fondo-6*T, 80)`, reduce el radio solicitado y emite aviso; rechaza el resultado si el radio útil queda bajo `3*T`. La ranura flexible se deriva de `ranura` o `.2*T` y se limita según kerf/grosor; el puente se deriva de `puente` o `.45*T` y se valida también. Las reglas están repartidas entre normalización y construcción.

### Alcance y correcciones a la investigación compartida

- Para Caja flexible sí se comprobó una implementación procedural modular, una carga diferida del visor 3D y la reutilización del resultado geométrico en visor y SVG.
- El ejemplo `zigzag62-core.js` no se inspeccionó. Una sola herramienta no prueba que cada ficha del catálogo tenga ese patrón de archivos ni que la página del catálogo cargue solo imágenes/metadatos.
- El Viewer observado es un módulo `visor.js` propio de esta herramienta. No se comprobó que un único Viewer se comparta entre Caja flexible, muebles, monogramas y los demás productos.
- La existencia de `PRESETS` y `normalizar` se verificó en `geometria.js`, no en `kernel.js`; la captura no muestra un objeto `A.PRESETS`. Los nombres y medidas de los ocho presets sí se cotejaron con el código.
- La corrección por radio/tapa sí existe, pero no con la regla literal ni en la función que el usuario describió: las condiciones exactas constan arriba.
- Los scripts de exportación incluyen SVG/plan, manifiesto y guía/JSON según el flujo observado. No se comprobó generación de PDF.

La evidencia está limitada a una página de Caja flexible y a los módulos propios relevantes retenidos durante esa captura. El vendor Three.js y otros recursos grandes no quedaron archivados como cuerpos fuente; no se inspeccionaron backend ni una descarga Premium.

## Principios reutilizables para Visual Corp Suite

1. **Catálogo liviano y módulos bajo demanda.** Caja flexible sí carga su visor con importación dinámica; verificar aparte cómo se resuelven las tarjetas y scripts de otros generadores. Medir el bundle real antes de decidir la estrategia de carga.
2. **Contrato común para generadores.** Cada herramienta puede normalizar parámetros, validar límites y devolver un proyecto serializable con piezas identificables. Un visor compartido es una propuesta para Suite; la referencia examinada solo demuestra un visor modular en esa herramienta.
3. **Presets como datos.** Un preset debe asignar un conjunto explícito y versionable de parámetros al mismo modelo, sincronizar la UI y regenerar derivados. No hace falta mantener un mesh independiente por cada tarjeta.
4. **Normalizar antes de guardar y construir.** Validar rangos, unidades y relaciones geométricas antes de renderizar; explicar correcciones o límites en la interfaz. No introducir umbrales de fabricación no medidos.
5. **Una fuente para geometría y salidas.** Derivar vista, métricas, plano y exportadores de una representación compartida para evitar diferencias. Distinguir el render ilustrativo de una salida verificada para producción.
6. **Estado durable y local primero.** Un proyecto versionado puede guardar parámetros, preset, elementos y unidades sin serializar mallas. La sincronización remota requiere una decisión explícita; no es inferible de una etiqueta de guardado local.

## Aplicación a la multiherramienta 3D

El prototipo actual de Visual Corp Suite en `src/features/tools/box-generator/` ya comparte contornos de caja entre SVG y el visor Three.js, pero aún no ofrece un contrato común entre familias de generadores. Esta referencia sugiere evolucionar gradualmente hacia un catálogo de herramientas y un visor reutilizable, manteniendo separadas las definiciones de caja, monograma y muebles.

Para el monograma, la estructura dinámica `elements[]` descrita en [el análisis de monogramas](../Monogramas-2026-11-25/ANALISIS_MONOGRAMAS.md) encaja como un generador propio que devuelve capas/contornos. El mismo Viewer podría mostrar esas piezas en 3D, mientras los exportadores específicos determinan la salida para láser o impresión 3D. La lógica no debe asumir que un flujo de muebles, cajas, monogramas y textos comparten las mismas restricciones de fabricación.

## Siguientes verificaciones útiles

Inspeccionar un generador de muebles y otro producto para determinar si comparten visor/contrato, y verificar la carga del catálogo. La Caja flexible ya tiene evidencia estática suficiente para los hallazgos anteriores. Conservar los límites de captura, no usar descarga Premium y adaptar solo los principios que encajen con React/Three.js actuales de Visual Corp Suite.
