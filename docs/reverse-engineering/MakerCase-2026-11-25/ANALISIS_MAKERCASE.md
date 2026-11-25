# Ingeniería inversa: MakerCase, BurroNieve y generador de cajas interno

**Fecha:** 2026-11-25
**Estado del documento:** análisis del estado actual y sus límites técnicos. El estado vigente de publicación se mantiene en la continuidad del proyecto en Obsidian.
**Fuentes principales:** experiencia pública de [MakerCase](https://www.makercase.com/) y su editor [Basic Box](https://www.makercase.com/basicBox); página pública [Caja muñeco de nieve a medida de Burro Creativo](https://burrocreativo.com/g/caja-muneco-nieve); texto e imágenes de referencia adjuntos por el usuario en `references/`.

**Ampliación CAD/CAM:** la segunda tanda de investigación aportada por el usuario (encastres, grosores mixtos, inclinaciones, nesting, costes, presets, selección, AR y fabricación) está organizada y revisada en [HOJA_DE_RUTA_CAD_CAM.md](HOJA_DE_RUTA_CAD_CAM.md). Sus ejemplos son material de diseño; el documento marca los que están incompletos o requieren mediciones de taller.

## Solicitud y tratamiento de los adjuntos

La solicitud del usuario es crear dentro del admin una categoría **Herramientas**, empezar con un generador interno de cajas y estructurarlo como componentes compartidos, de modo que un cambio al componente se refleje en todos sus usos. También solicita guardar la investigación en Visual Corp y en Obsidian.

Las capturas y el texto técnico adjuntos son material de referencia, no instrucciones de implementación. Se separaron los datos observados en MakerCase de las afirmaciones técnicas aportadas por el usuario:

- La experiencia de MakerCase muestra una selección de plantillas, un editor Basic Box con parámetros y un modelo 3D, y opciones de exportación SVG/DXF.
- Las afirmaciones adjuntas sobre Three.js r171, `camera-controls`, Manifold/WASM, Clipper2/WASM, Redux/Zustand, `SvgExportRenderer`, y los flujos internos de textura/unfolding no se verificaron independientemente. No se presentan como hechos sobre MakerCase.
- La página de herramientas de Burro Creativo describe generadores paramétricos con dimensiones, grosor, texto, previsualización y descarga SVG; también menciona vistas 3D y distribución por hojas para algunos productos ([catálogo público](https://burrocreativo.com/herramientas)). Esto describe la oferta del sitio, no confirma cómo está construido el motor de cada generador.
- El bundle público de la página BurroNieve confirmó que el contenedor incrusta `/generadores/burronieve.html?v=120` en un `iframe` y coordina altura, viewport y navegación con mensajes de mismo origen. La solicitud directa del HTML devuelve 404 sin el encabezado `Referer` del contenedor; con el contexto del padre se pudieron leer el HTML y módulos frontend.
- Se revisaron en modo de solo lectura `app.mjs`, `config.mjs`, `montaje.mjs`, `visor.mjs`, `visor-ligero.mjs` y el vendor Three.js. Esos módulos verifican varios detalles que antes eran hipótesis del usuario (descritos abajo). La respuesta del servidor de descargas y el backend no se inspeccionaron.
- Las imágenes originales adjuntas se conservaron como referencias de interfaz; no son planos técnicos ni especificaciones de fabricación.

## Segundo caso observado: BurroNieve de Burro Creativo

La página [Caja muñeco de nieve a medida](https://burrocreativo.com/g/caja-muneco-nieve) fue examinada en el navegador y sus módulos frontend públicos se inspeccionaron estáticamente. Los hallazgos siguientes describen ese generador específico; no se extrapolan a MakerCase ni a todos los productos de Burro Creativo.

- **Estructura observada:** `app.mjs` importa `config.mjs`, `montaje.mjs`, `visor.mjs` y una vista alternativa `visor-ligero.mjs`. El visor principal importa el vendor local Three.js `0.160.1`; si inicializar WebGL falla, usa la alternativa Canvas 2D. En los archivos inspeccionados no aparecen imports de Manifold/WASM ni Clipper2/WASM. Es una búsqueda acotada a esos módulos, no a servicios/backend.
- **Geometría:** el frontend crea geometría paramétrica con `Shape` y `ExtrudeGeometry` a partir de coordenadas y reconstruye grupos cuando cambia la configuración. El código comenta que las curvas originales y la descomposición para fabricación viven en el servidor; no se inspeccionó ni se verificó el motor servidor.
- **Materiales:** el frontend cambia visualmente MDF/contrachapado usando materiales `MeshStandardMaterial`, colores, rugosidad y material lateral marrón; también usa sombras y materiales con transparencia para arte. No se encontraron mapas escaneados de veta de madera en los módulos examinados.
- **Animación:** `montaje.mjs` define offsets por pieza y una secuencia suavizada de armado de 2140 ms, transiciones de vista de 480 ms y respeta `prefers-reduced-motion`. En la página se observaron modos Armada y Ver piezas, además de repetir el armado; la vista explotada funcionó y se restauró a Armada sin cambiar las dimensiones visibles.
- **Imagen raster:** se encontraron cuatro PNG (respaldo, muñeco, regalos y saludo). Tres usan `edgeStrip()` para obtener la silueta desde el alfa (umbral >=128, canvas de 180 px) y construir quads laterales en `BufferGeometry`, además de mostrar la imagen texturizada; el saludo se representa como plano texturizado. Es una extrusión de silueta alfa, no un sólido de cada píxel de color.
- **Controles/exportación descritos en la interfaz:** dimensiones, grosor y materiales, controles de cama de corte, rotación/zoom/vista frontal y reversa, vista armada/explotada y medidas derivadas. La interfaz describe SVG/DXF por hoja, inventario y mapa PDF numerado para siete piezas, con descarga Premium. `app.mjs` muestra que la descarga envía un POST a `/api/burronieve/descarga`; no se pulsó descargar, no se envió la petición y no se examinó la respuesta del backend.
- **Estado visto, no valor por defecto:** el navegador mostraba 34.5 × 18 × 12.8 cm, MDF, material de 0.3 cm y 33.9 × 17.4 × 12.5 cm de espacio interior útil. `config.mjs` define otros valores iniciales: 15 × 9 × 3.8 cm. La diferencia indica que la página abierta tenía una personalización activa; no usar el estado del navegador como predeterminado del producto.

## Investigación técnica aportada por el usuario: hipótesis y backlog

Los puntos de esta sección conservan la investigación adjunta para retomarla en siguientes etapas. Son afirmaciones o propuestas del usuario, no hallazgos comprobados sobre el código de MakerCase:

- **Pila propuesta para inspeccionar:** Three.js (el adjunto indica r171), `camera-controls`, Manifold compilado a WASM para geometría/booleanos, Clipper2/WASM para clipping/offset 2D y un renderer de exportación SVG/DXF. El texto también atribuye a MakerCase módulos con nombres `CameraController` y `SvgExportRenderer`, sin evidencia del código fuente.
- **Actualización paramétrica:** un estado único para medidas y opciones; recalcular y reemplazar mallas cuando cambian las medidas; desechar buffers/materiales anteriores; usar WASM/worker si el coste geométrico lo justifica. Redux/Zustand y la construcción con Manifold aparecen como posibilidades en el adjunto, no como detección confirmada.
- **Desarrollo futuro del motor:** evaluar Three.js WebGPU, React Three Fiber, OpenCascade.js y JSCAD solo si el perfil y las funciones CAD requeridas lo ameritan. Leva/Tweakpane se mencionan como alternativas de panel de control. No se añadió ninguna de estas herramientas.
- **Fabricación 2D:** desplegar paneles, reservar separación de anidado, estudiar compensación de kerf/holguras, mantener capas diferenciadas para corte y grabado, y evaluar SVG, DXF, PDF/EPS y metadatos de hoja. El flujo sugerido por el usuario genera SVG y deriva otros formatos en el cliente. Aún falta validación de unidades/capas/importación en software real.
- **Diseño gráfico sobre caras:** en una futura etapa, guardar imágenes y texto por cara dentro del mismo proyecto; mapear coordenadas 2D a UV para el modelo, evaluar `CanvasTexture` o decals para la previsualización y exportar las capas de arte junto con el contorno de corte. Fabric.js/Konva aparecen como opciones de editor 2D; no se incorporaron.
- **Sincronización y componentes:** 2D, 3D y exportadores deben observar el mismo proyecto serializable; toda nueva superficie importa el mismo editor compartido, con props pequeñas para ruta/contexto. La versión actual usa los mismos contornos para exportación y 3D, pero aún requiere comprobación física de encastres.
- **Animación de armado/despiece:** el texto recibido propone offsets por panel, etapas con retardos e interpolación de las piezas desde/hacia la posición armada. Se debe construir sobre transformaciones de ensamblaje verificadas y ofrecer pausa/reducción de movimiento; no tratar la animación como prueba de encastre o resistencia.
- **Materiales e imágenes:** el texto propone presets MDF/contrachapado, materiales PBR, mapas de roughness/normales y mapas de entorno HDRI; también carga local SVG/PNG por cara, `CanvasTexture`, anclajes magnéticos y calcomanías. Son propuestas visuales; separar color de render de especificaciones reales de material y mantener los archivos importados dentro del proyecto del usuario.
- **Capacidades avanzadas:** `InstancedMesh` solo tendría sentido con muchos objetos repetidos; las sombras horneadas dependen de disponer de mapas licenciados y de medir rendimiento. `TransformControls` podría complementar las medidas numéricas, pero no debe sustituir valores paramétricos ni restricciones.
- **Aprendizaje del agente:** estas notas documentan el contexto disponible para futuras tareas; no se entrenaron ni modificaron pesos de un modelo de IA.

### Backlog priorizado

1. **P0 — Geometría única para fabricación y 3D:** definir para cada panel el contorno, grosor, cara y transformación de ensamblaje; hacer que el plano, el visor y los exportadores consuman esa misma representación. Validar cajas abiertas/cerradas, medidas interiores/exteriores y juntas planas/de dedos. “Coincide” significará coherencia digital del modelo, no garantía de ajuste físico.
2. **P1 — Fabricación:** separar kerf y holgura de junta, incorporar perfiles solo tras medir máquinas/materiales reales y avanzar desde la distribución por rectángulos envolventes hacia un nesting que considere orientación, veta y formas irregulares. La nueva distribución por hojas no es un optimizador poligonal.
3. **P2 — Arte por cara:** un proyecto puede guardar texto e imágenes con transformaciones en coordenadas 2D por panel; mapear esas mismas capas a la cara correcta del 3D y exportar por operación de corte/marcado/grabado. Antes, definir tipos y límites de archivo, zonas seguras y prueba en software destino.
4. **P2 — Armado y explosión:** animar posiciones/giros a partir de transformaciones ya verificadas; soportar reproducción, pausa, reinicio y `prefers-reduced-motion`.
5. **P3 — Acabados del visor:** considerar presets PBR/HDRI con recursos alojados localmente, licencia clara y medición en dispositivos modestos. Son visualización; no representan por sí solos material, color o brillo reales.
6. **P4 — AR:** evaluar WebXR con detección de capacidad y alternativa 3D. Requiere HTTPS y la disponibilidad depende del dispositivo/navegador; Three.js ofrece `ARButton`, pero eso no garantiza que funcione en los equipos de Visual Corp ([Three.js ARButton](https://threejs.org/docs/pages/ARButton.html), [MDN: `requestSession`](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession)).

### Bibliotecas a evaluar cuando exista una necesidad concreta

- **Maker.js:** ofrece trazos/modelos 2D y exportación SVG, DXF, PDF y JSCAD; sus helpers de filas y cuadrículas no prueban que resuelva nesting irregular. Repo bajo Apache-2.0 ([docs de exportación](https://maker.js.org/docs/exporting/), [licencia](https://github.com/Microsoft/maker.js/blob/master/LICENSE)).
- **JSCAD/OpenJSCAD:** conjunto modular para diseño paramétrico 2D/3D; evaluar solo si los sólidos/booleanos superan lo que requiere la caja básica. El repositorio principal declara MIT ([proyecto y licencia](https://github.com/jscad/OpenJSCAD.org)).
- **Clipper2:** candidato para offsets, booleanos y clipping de polígonos 2D; no es motor de ensamble 3D ni optimizador de nesting. El upstream en C++ tiene licencia Boost Software License; los ports TypeScript y WASM son paquetes distintos que deben revisarse por precisión, mantenimiento, licencia y tamaño de bundle antes de elegir ([Clipper2](https://github.com/AngusJohnson/Clipper2), [port TypeScript](https://github.com/countertype/clipper2-ts), [port WASM](https://github.com/ErikSom/Clipper2-WASM)).

No se añadieron Maker.js, JSCAD, Clipper, Babylon.js, Verb.js, OpenJSCAD, WebGPU, WebXR ni librerías de interacción al proyecto por esta investigación.

## Hallazgos de la experiencia observada

La página principal ofrece clonar un archivo y varias plantillas, entre ellas Basic Box, Laser Hinge Box, divisores, cajones, tapa deslizante, contenedor apilable, caja poligonal, caja curva y variantes para impresión 3D. El editor Basic Box presenta:

- ancho, alto, fondo, grosor del material y unidad pulgadas/milímetros;
- dimensión interior o exterior, caja abierta/cerrada y uniones plana, finger y T-slot;
- control del ancho de los dedos y una previsualización 3D interactiva;
- opciones de salida SVG/DXF y ajustes de formato de línea, compensación de corte, composición y máquina.

La [página Basic Box de MakerCase](https://www.makercase.com/basicBox) confirma públicamente dimensiones, grosor, finger joints y salida SVG/DXF. No se infirió de esa página una garantía de precisión ni compatibilidad con una máquina específica.

## Implementación en Visual Corp Suite

Se añadió la sección **Herramientas** a la navegación de Operaciones. La categoría y la página del generador requieren el permiso de taller ya existente (`workshop`); no se añadió una clave de permiso ni se alteraron perfiles o datos de Supabase.

La interfaz vive en el módulo reutilizable `src/features/tools/box-generator/`. La ruta `/operaciones/herramientas/generador-cajas` es solo una envoltura que importa `BoxGenerator`; una futura ubicación debe importar el mismo componente, sin copiar el editor. **Compartir este módulo significa compartir código:** el estado `project` se crea dentro de cada instancia, de modo que dos instancias no comparten cambios entre sí. El archivo versionado `.vcbox.json` se descarga/abre en el navegador; aún no hay persistencia en servidor, historial compartido ni sincronización entre dispositivos. La lógica geométrica y las exportaciones viven en `boxModel.ts`.

La primera versión incluye:

- caja básica abierta o cerrada, medidas interiores/exteriores, unidades mm/in, grosor, junta plana o por dedos, ancho de dedos, espacio entre piezas y color de previsualización;
- previsualizaciones 3D y de plano 2D que responden al mismo estado de proyecto; el visor ahora extruye los contornos que usa el archivo de corte;
- archivos de proyecto JSON versionados `.vcbox.json`, abiertos/guardados localmente desde el navegador;
- descarga local de SVG y DXF en milímetros;
- límites de grosor dependientes de las medidas para evitar dimensiones base inviables y un layout SVG calculado desde los contornos efectivos, incluidas las pestañas.
- liberación explícita de geometrías y materiales Three.js cuando se reconstruye la vista 3D, para evitar acumular recursos GPU al cambiar parámetros.
- despiece 3D controlado por slider que mueve grupos de paneles sin reconstruir mallas;
- plancha configurable con margen/separación, distribución por cajas envolventes sin solape, rechazo de piezas demasiado grandes, área/perímetro y exportación SVG/DXF de la hoja visible. La configuración de plancha se guarda como campo opcional compatible con `.vcbox.json` v1.


La vista 3D usa paneles extruidos desde los contornos SVG/DXF. Se corrigieron longitudes y fases de aristas para alinear digitalmente base, paredes y tapa; eso no certifica ajuste físico. SVG y DXF siguen siendo archivos preliminares. No hay compensación de kerf, perfil de máquina, certificación de tolerancias, texto vectorizado ni prueba con el software de una máquina de corte. La distribución por hojas no rota piezas ni optimiza polígonos. Las imágenes sobre caras, texturas, plantillas adicionales y almacenamiento multiusuario en servidor quedan fuera de esta entrega.

## Tecnología y componentes de interfaz

El repositorio usa React 19 y CSS propio del sistema visual. Se consultaron catálogos de forma dirigida para un configurador con campos numéricos, controles segmentados y área de vista previa:

- **Magic UI MCP:** el candidato más cercano era un patrón decorativo de cuadrícula; no aporta configuración geométrica ni un visor 3D, así que no se incorporó.
- **shadcn MCP:** no tenía registros disponibles para consultar. Se usó la documentación oficial de [Input](https://ui.shadcn.com/docs/components/input) y [Slider](https://ui.shadcn.com/docs/components/slider) solo como referencia; no se añadieron componentes shadcn.
- **HeroUI React MCP:** se revisaron `NumberField`, `Slider`, `Tabs` y `ButtonGroup` (documentación MCP reportó v3.2.8). El repositorio solo tiene `@heroui/styles`, sin `@heroui/react`; se mantuvieron controles nativos y estilos del sistema existente para evitar sumar otra capa de UI.

En la ampliación para planchas se volvieron a consultar los tres catálogos: HeroUI para `Tabs`/`NumberField`, shadcn para `Tabs`/`Input` y Magic UI para patrones de plancha/métricas. Se conservaron controles nativos y CSS compartido por ajuste al sistema existente. HeroUI v3 usa Apache-2.0, shadcn y Magic UI MIT ([HeroUI](https://github.com/heroui-inc/heroui/blob/v3/LICENSE), [shadcn](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [Magic UI](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md)). La guía de interfaz mencionada en Obsidian no apareció en la bóveda local de esta sesión.

Para el visor se incorporó **Three.js 0.187.0** y `@types/three` 0.187.0; el paquete Three.js declara licencia MIT ([repositorio y licencia](https://github.com/mrdoob/three.js/blob/dev/LICENSE)). Se usa `OrbitControls` oficial para girar, desplazar y acercar; respeta la preferencia de movimiento reducido, limita el pixel ratio y no anima continuamente ([documentación de OrbitControls](https://threejs.org/docs/pages/OrbitControls)). La geometría del plano y los archivos exportados se generan en TypeScript, sin Manifold/WASM ni Clipper2.

## Referencias visuales

Las capturas adjuntas y su procedencia están documentadas en [references/README.md](references/README.md). No modificar las fuentes originales de Temp; las copias dentro de este proyecto son evidencia de referencia.

## Próximos pasos antes de uso productivo

1. Abrir la ruta con una sesión interna autorizada y revisar controles, layout responsive y previsualizaciones.
2. Revisar visualmente el ensamblaje y validar con probetas que los pares de aristas corregidos encajan con el material real.
3. Abrir SVG/DXF en el software de destino y comprobar escala/unidades; validar juntas y kerf con probetas de material real.
4. Confirmar dimensiones útiles, márgenes, veta y reglas de rotación de la máquina antes de convertir la distribución básica en un optimizador de nesting.
5. Diseñar el esquema de capas por cara, animación, materiales o almacenamiento servidor cuando se confirmen los casos de uso.

## Verificación de esta entrega

- `npm run build:checked` completó TypeScript y el build de Vite.
- Vite emitió su aviso de tamaño para chunks mayores a 500 KB; el chunk de la página del generador pesa 621.91 KB sin comprimir y 157.85 KB gzip. La página se carga de forma diferida junto con las demás rutas protegidas.
- La revisión geométrica con el módulo real cubrió cajas abiertas/cerradas con uniones planas/de dedos: cinco o seis contornos según tapa, sin cruces propios estrictos. No equivale a comprobar el archivo en software de corte ni a una probeta física.
- En una comprobación acotada del distribuidor, la caja abierta inicial ocupó tres hojas de 150 × 150 mm con margen/separación de 5 mm; ninguna caja envolvente salió del área útil ni solapó otra, y una hoja imposible de 50 × 50 mm fue rechazada. Esto verifica ese escenario, no todos los tamaños o máquinas.
- La inspección visual manual llegó a la pantalla de acceso interno porque la ruta requiere sesión. No se inició sesión ni se solicitó un enlace por correo; por ello, la revisión en navegador de los controles y breakpoints queda pendiente.
- Se revisaron digitalmente los contornos de cajas abiertas/cerradas con juntas planas/de dedos. No se hizo una prueba física, una revisión visual autenticada ni se desplegó la aplicación.

## Fuentes

- [MakerCase — página principal](https://www.makercase.com/)
- [MakerCase — Basic Box](https://www.makercase.com/basicBox)
- [Three.js — OrbitControls](https://threejs.org/docs/pages/OrbitControls)
- [Three.js — licencia MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE)
- [shadcn/ui — Input](https://ui.shadcn.com/docs/components/input) y [Slider](https://ui.shadcn.com/docs/components/slider)
- [Burro Creativo — catálogo de herramientas](https://burrocreativo.com/herramientas)
- [Burro Creativo — Caja muñeco de nieve](https://burrocreativo.com/g/caja-muneco-nieve)
- BurroNieve frontend: [app.mjs](https://burrocreativo.com/generadores/burronieve/app.mjs?v=120), [config.mjs](https://burrocreativo.com/generadores/burronieve/config.mjs?v=120), [montaje.mjs](https://burrocreativo.com/generadores/burronieve/montaje.mjs?v=120), [visor.mjs](https://burrocreativo.com/generadores/burronieve/visor.mjs?v=120), [visor-ligero.mjs](https://burrocreativo.com/generadores/burronieve/visor-ligero.mjs?v=120) y [Three.js vendor 0.160.1](https://burrocreativo.com/generadores/burronieve/vendor/three-0.160.1.module.min.js). Módulos frontend únicamente; no backend ni endpoint de descarga.
- [Maker.js — exportaciones](https://maker.js.org/docs/exporting/) y [Apache-2.0](https://github.com/Microsoft/maker.js/blob/master/LICENSE)
- [JSCAD/OpenJSCAD — proyecto y licencia](https://github.com/jscad/OpenJSCAD.org)
- [Clipper2 — upstream](https://github.com/AngusJohnson/Clipper2), [port TS](https://github.com/countertype/clipper2-ts) y [port WASM](https://github.com/ErikSom/Clipper2-WASM)
- [Three.js — ARButton](https://threejs.org/docs/pages/ARButton.html) y [MDN — WebXR](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession)
