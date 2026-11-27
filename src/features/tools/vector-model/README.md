# Modelo vectorial Visual Corp · V1

`visualcorp.vector-model` es un documento editable e independiente de la escena Three.js. La extensión de intercambio es `.vcvector.json`; su estructura está definida en `vector-model.schema.json` (JSON Schema Draft 2020-12).

El esquema expresa los campos y restricciones que caben en JSON Schema. El parser del navegador también aplica límites en bytes y complejidad, sanea el SVG incluido, valida rangos y valores de controles, sincroniza los controles vinculados con sus propiedades y comprueba referencias entre piezas, controles, diagnósticos y rutas. JSON Schema no compara de forma portable el valor de un campo con sus opciones o límites hermanos; el parser completa esas comprobaciones.

## Coordenadas y unidades

- Mano derecha, plano XY, origen inferior izquierdo, extrusión +Z.
- Longitudes internas en milímetros; rotaciones en grados.
- El orden de las piezas determina su apilado de extrusión sobre +Z. El grosor y los biseles permanecen en milímetros, aunque el SVG use otra escala.
- `source.viewBox` y `source.svgText` conservan la referencia vectorial saneada. `mmPerSourceUnit` transforma el espacio del SVG a milímetros.
- `scaleConfirmed: false` significa que el SVG no declaró medidas físicas; la escala inicial 1:1 es provisional y requiere calibración antes de tratarla como medida real.
- Cada capa guarda un índice de ruta estable dentro de la fuente para poder regenerar las curvas; su ID de documento es único y no depende del orden visual.

## Controles

Las propiedades comunes son ancho/alto del modelo y por pieza, posición, giro, escala, espesor, color y grosor del trazo, colores HEX de pieza y sobrescrituras opcionales para frente, dorso y lateral. El color de relleno original queda como color 3D inicial cuando no hay una sobrescritura. Los trazos se muestran/configuran en 2D; para extruirlos hay que convertirlos a contornos. `controls[]` permite agregar campos numéricos, longitud, color, selector, interruptor o texto. El destino usa una lista permitida de propiedades del modelo; los parámetros personalizados adicionales se guardan en `controlValues` como datos para el consumidor futuro, sin ejecutar JavaScript ni expresiones. Una función geométrica nueva requiere un adaptador de código.

## Importación y límites

- El archivo permanece en el navegador. El límite de entrada SVG es 8 MiB y el JSON exportado puede ocupar hasta 32 MiB; se aplican máximos de 600 piezas geométricas, 30 000 nodos, 64 niveles de anidación y 250 000 tokens de geometría.
- Se eliminan scripts, animaciones SMIL, medios, hojas de estilo, instancias `<use>`, manejadores de eventos y referencias URL externas antes de analizar o guardar la fuente. Vuelve a exportar estilos como atributos SVG en línea cuando cambien el aspecto de los contornos.
- El analizador reconoce las rutas y formas habituales admitidas por `SVGLoader`. Filtros, máscaras, recortes, patrones, contenido de texto vivo, imágenes, referencias y otros elementos SVG pueden omitirse o reducirse; la herramienta añade diagnósticos.
- Para extruir se requiere un contorno cerrado con relleno. Los trazos abiertos se conservan como información 2D y se reportan. El visor 2D conserva `fill-rule: evenodd`; esas formas se limitan a 2D hasta que se implemente un resolvedor de topología compatible.
- La malla es para visualización/configuración. No certifica topología, tolerancias, CAM, impresión ni fabricación.
- AI y EPS no se importan directamente en esta versión. Exporta el arte como SVG desde Illustrator; convierte el texto a contornos y revisa que los trazos que deban extruirse estén cerrados.

Al añadir un nuevo consumidor, validar el esquema y regenerar la geometría desde el documento; no guardar `Object3D.toJSON()` como sustituto del contrato configurable.
