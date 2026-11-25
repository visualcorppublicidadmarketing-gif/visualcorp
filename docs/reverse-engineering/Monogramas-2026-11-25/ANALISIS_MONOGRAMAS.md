# Herramienta de monogramas 2D/3D y personalización por capas

**Fecha:** 2026-11-25
**Estado:** investigación concluida; implementación local de primera versión iniciada el 25 de noviembre de 2026. Ver [estado y límites de la implementación](IMPLEMENTACION_V1.md).
**Objetivo:** incorporar a Herramientas de Visual Corp Suite una experiencia para diseñar monogramas compuestos por varias piezas editables, verlos en 2D y 3D y preparar archivos según el proceso de fabricación que se defina.

## Resumen de decisiones para retomar

- El enlace principal del usuario corresponde a **monogramas por capas para corte láser**. La interfaz observada permite combinar una inicial, un nombre y adornos; incluye composición 2D, vista 3D y preparación de hojas.
- La multiherramienta 3D actual de Visual Corp Suite es todavía un generador local de cajas. Es preferible añadir un módulo propio de monogramas dentro de `src/features/tools/`, sin introducir su modelo de datos en el generador de cajas.
- La petición de varios nombres o piezas independientes requiere un arreglo dinámico de elementos y capas. No basta con duplicar campos `nombre-2`, `nombre-3`.
- La página de corte láser y otra referencia pública de impresión 3D son experiencias distintas. Mantener separados los modos de fabricación y sus salidas hasta decidir el alcance de la primera versión.
- Los motores, booleanos, fuentes externas, Web Workers, IA y formatos de exportación deben evaluarse antes de agregarse. El texto compartido por el usuario es una propuesta técnica, no prueba de la arquitectura del sitio de referencia.

## Referencia principal: monogramas por capas para láser

Fuente pública: [Monogramas por capas para corte láser — Burro Creativo](https://burrocreativo.com/g/monogramas-laser). Inspección visual y de accesibilidad en navegador el 25 de noviembre de 2026. La página contiene un `iframe` cuyo recurso visible incluye `monogramas.html?v=1.3.1`; el contenido interno se observó desde la página anfitriona. No se descargó el paquete ni se inspeccionó su código fuente.

### Diseño y personalización visibles

- La herramienta organiza el recorrido en tres vistas: **Diseño**, **Editor y 3D** y **Fabricar**. En el ancho observado, la navegación aparece en una barra inferior.
- Ofrece estilos iniciales como nombre con mariposas, boda con corazones, inicial con flores, nombre sencillo y personalizado.
- La composición de ejemplo tiene una inicial grande, un nombre/mensaje y hasta dos adornos. Permite seleccionar fuentes distintas para inicial y nombre, elegir una fuente del catálogo o una propia TTF/OTF, y cambiar escala y colores.
- Los adornos incluyen mariposa calada, corazón y flores. Su posición puede ser automática buscando apoyo o manual. La interfaz advierte que puntos, tildes y letras deben conectarse con puentes para sostenerse al cortar.
- La altura, grosor de base y grosor de detalle se editan por separado. También se ofrecen marcas opcionales para pegar, argollas para colgar y controles asociados. El texto de la página advierte sobre equilibrio, pared de material y resistencia.

### Edición, visor y preparación

- El editor de posición muestra controles para seleccionar el nombre y los adornos y permite arrastrarlos; el texto visible también describe movimiento con flechas de teclado. La interfaz no mostró una lista general que permitiera crear un número arbitrario de capas de texto.
- La vista 3D presenta modos **Armado**, **Frente** y **Capas**, controles para girar/centrar, una guía de pegado y una acción para repetir el armado. La página muestra las dimensiones ensambladas, el número de piezas y una advertencia cuando un adorno tiene poca superficie de apoyo.
- La preparación de corte ofrece cama/tamaño de hoja, margen, separación, copias, ancho de corte y ajuste de altura. Las piezas se agrupan por grosor y se distribuyen en hojas.
- El botón visible anuncia una descarga Premium y la interfaz describe SVG por hoja/grosor, marcas, plantilla 1:1, lista de piezas, proyecto editable y guía. **No se inició la descarga**: esos formatos y el contenido final no se comprobaron abriendo archivos.
- La página indica guardado automático en el navegador y ofrece abrir/guardar proyecto. No se verificó sincronización remota ni persistencia entre dispositivos.
- El contenedor declara un `iframe` de ancho completo con altura fija de 844 px en la captura REA. Eso no demuestra que el interior se adapte correctamente a cualquier ancho. La observación visual tampoco certifica accesibilidad completa ni ausencia de desbordamiento en todos los tamaños.
- El texto de fabricación pide validar una primera unidad; no se hizo corte, montaje ni prueba física.

## Referencia relacionada: impresión 3D

La inspección REA de la ruta a la que apunta el `iframe` terminó en otra URL: [Generador de monogramas 3D — Burro Creativo](https://burrocreativo.com/g/monogramas). Esa página se describe como impresión 3D y menciona piezas con cambios de color, capas pegadas o nombre encastrado, descarga STL, medidas, proyecto y guía. Se registró por separado: la redirección y el texto de esa página **no prueban** que esas funciones pertenezcan al generador láser `/g/monogramas-laser`.

Esta diferencia orienta el diseño propio: corte láser por capas necesita contornos 2D, separación por material/grosor y advertencias de islas/puentes; impresión 3D necesita geometría imprimible y validación distinta. Puede compartirse el proyecto visual, pero cada proceso debe declarar sus salidas y restricciones.

## Contexto complementario: generadores paramétricos

El usuario aportó capturas del catálogo de Burro Creativo y de su generador de Caja flexible, junto con hipótesis sobre scripts por producto, visor compartido, presets, almacenamiento local y normalización. Las capturas y el análisis separado están archivados en [Arquitectura de generadores paramétricos](../BurroCreativo-2026-11-25/ANALISIS_ARQUITECTURA_GENERADORES.md). Las afirmaciones internas de código se conservan como pendientes de verificación; no se atribuyen al generador de monogramas ni al código de la Suite.

## Auditoría del punto de partida en Visual Corp Suite

Revisión local de solo lectura el 25 de noviembre de 2026:

- **Ruta de herramientas:** `src/App.tsx` contiene `/operaciones/herramientas` y `/operaciones/herramientas/generador-cajas`. La página de caja monta un componente de `src/features/tools/box-generator/`.
- **Modelo actual:** `boxModel.ts` define datos/versionado específicos para cajas y genera contornos. `BoxCutPreview.tsx` y `BoxGenerator3D.tsx` consumen esos contornos para las vistas SVG y extruida. Es un patrón útil de geometría compartida, pero todavía no existe un núcleo geométrico genérico para todas las herramientas.
- **Funciones existentes:** editor local con vistas 2D/3D/plancha, exportación SVG/DXF y archivo local `.vcbox.json`. La distribución por hojas y su geometría tienen límites documentados en [MakerCase y CAD/CAM](../MakerCase-2026-11-25/ANALISIS_MAKERCASE.md) y [hoja de ruta CAD/CAM](../MakerCase-2026-11-25/HOJA_DE_RUTA_CAD_CAM.md).
- **Tecnología:** el proyecto usa React 19, TypeScript y Three.js `0.187.0`. En las dependencias revisadas no aparecen `opentype.js`, `three-bvh-csg` ni Manifold. La página de referencia no se usó para confirmar que esas bibliotecas existan allí.
- **Estado del checkout:** `codex/admin-glass-polish` tiene numerosos cambios locales pendientes, incluidos los archivos del generador de cajas. Esta investigación no los modificó; una implementación futura debe conservar ese trabajo y confirmar su base antes de editar código.

## Propuesta técnica para la herramienta nueva

### Modelo dinámico de proyecto

Separar el diseño del motor y de las salidas. Como propuesta inicial, un proyecto versionado podría contener `elements[]`, donde cada elemento tenga ID estable, tipo (`text`, `ornament`, `shape`), contenido/recurso, posición, escala, rotación, orden/capa, visibilidad, bloqueo, color y grosor. Los elementos de texto añadirían familia/fuente, tamaño y alineación. Seleccionar por ID, no por un índice ligado a campos fijos.

La primera iteración puede cubrir varios textos, iniciales y adornos independientes. Duplicar, reordenar, ocultar, bloquear y eliminar elementos debe cambiar el mismo estado serializable que leen el editor 2D, el visor 3D y los exportadores. No hace falta copiar el editor para una segunda superficie: la ruta debe montar el mismo componente compartido con props pequeñas de contexto.

### Geometría y fabricación

1. Mantener un único proyecto geométrico en unidades explícitas y convertir textos/ornamentos en contornos vectoriales con dimensiones reproducibles.
2. Distinguir **capas independientes** de **silueta unificada**. Una unión booleana solo es necesaria para operaciones concretas; no debe eliminar la identidad de las piezas que deben cortarse por separado o pegarse con distinto grosor/color.
3. Detectar contornos abiertos, huecos, detalles demasiado finos y componentes/islas sin apoyo. Mostrar avisos explicables y permitir una base o puentes cuando el usuario los elija. Los límites de puente y grosor quedan pendientes de medición por material/proceso.
4. Hacer que el plano 2D, la vista extruida y cada salida de fabricación consuman la misma geometría validada. No tratar el render 3D ni una animación de armado como certificación de ajuste.
5. Para modo láser, empezar por separar las hojas/capas por grosor y producir SVG; añadir DXF tras comprobar su importación y escala en el software destino. Para modo impresión 3D, STL es solo candidato hasta comprobar sólidos cerrados y abrir el archivo en un slicer.

### Interfaz y rendimiento

- Integrar como módulo React con CSS acotado al editor. La propuesta de envolver toda la interfaz en Shadow DOM no se adopta automáticamente: requiere comprobar compatibilidad con React, controles, estilos y tema de la Suite.
- Usar contenedores adaptables y proporciones fluidas para el escenario; respetar `box-sizing`, `min-width: 0`, `max-width: 100%`, controles que envuelven y cero desbordamiento horizontal. El editor debe caber en portátiles con barra lateral, tableta y móvil.
- El canvas 3D debe ajustarse al tamaño de su contenedor y admitir controles táctiles y de teclado. Respetar `prefers-reduced-motion` en animaciones de armado/despiece.
- No mover el trabajo a Web Worker sin medir el costo del cálculo real. Si se vuelve necesario por booleanos/contornos complejos, definir primero el mensaje serializable, cancelación y manejo de errores.
- Mantener las fuentes locales o importadas por el usuario en el flujo inicial. Catálogo remoto/API de Google Fonts y subida a servicios externos quedan sin elegir; revisar licencias y privacidad antes de esa integración.
- Materiales PBR, HDRI y texturas son mejora visual posterior, independiente de las especificaciones reales de fabricación. La IA generativa o asistente de composición también queda como idea, sin proveedor/modelo acordado ni transferencia de diseños autorizada.

## Secuencia sugerida

1. **Definir la primera salida:** recomendación provisional, por relación con el enlace elegido, iniciar con monograma para corte láser por capas y vista 3D; mantener impresión 3D como modo aparte. Confirmar alcance, formatos y software de destino antes de cerrar la especificación.
2. **Crear el esquema versionado y el editor 2D:** múltiples textos y adornos, capas, selección por ID y transformación con teclado/puntero.
3. **Añadir contornos y avisos geométricos:** fuentes licenciadas, agujeros, islas, puentes, anchos mínimos y medidas en mm; no inventar umbrales de fabricación.
4. **Construir el visor 3D desde el mismo modelo:** grosores/colores por pieza, armado y capas, con reinicio y movimiento reducido.
5. **Exportar y conservar el proyecto:** SVG por capa/material primero; validar DXF/STL solo según el modo elegido. Crear formato local `.vcmonogram.json` versionado como propuesta; no asumir sincronización remota.
6. **Revisar la interfaz y fabricación:** cero overflow en anchos requeridos; teclado, foco, etiquetas y errores claros; abrir exportaciones en software real y preparar probetas antes de afirmar que un archivo está listo para máquina.

## Decisiones pendientes

- ¿La primera versión será corte láser por capas, impresión 3D o ambas como modos separados? La recomendación de empezar con láser es propuesta, no decisión confirmada.
- ¿Se necesita base o respaldo común, piezas sueltas, inicial con nombre encastrado o todas esas composiciones?
- ¿Qué formatos y software de destino son prioritarios? ¿SVG basta para la primera versión?
- ¿Qué catálogo de fuentes locales se permite y qué licencias deben acompañar las fuentes propias?
- ¿Qué materiales, espesores, kerf, puente mínimo y reglas de colgado se usarán? Todos requieren datos medidos o confirmados.
- ¿El proyecto se guarda solo en el navegador/archivo o debe sincronizarse entre dispositivos? El almacenamiento remoto no se decidió.
- ¿“IA” significa sugerencias de diseño, creación por prompt u otra cosa? No se definió proveedor ni flujo de datos.

## Procedencia y límites

- Investigación y código de ejemplo enviados por el usuario el 25 de noviembre de 2026. Las medidas fijas, clases como `MonogramEngine`, hipótesis de Manifold/Three/CSG, Shadow DOM, Workers, Google Fonts y demás inferencias del texto no se verificaron en el código de Burro Creativo.
- Inspección visual de la URL pública principal y dos revisiones de solo lectura del repositorio local y de rutas relacionadas de Burro Creativo, en esta fecha.
- No se modificó código de producto, dependencias, datos de Supabase ni configuración. No se descargó un archivo Premium, no se ejecutó un corte y no se hicieron pruebas físicas.
- **Siguiente paso recomendado:** decidir el modo de fabricación y los formatos prioritarios; después implementar el módulo independiente sobre el estado vigente del checkout.
