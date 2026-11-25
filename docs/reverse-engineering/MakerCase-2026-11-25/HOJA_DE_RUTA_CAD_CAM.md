# Evolución del generador de cajas: geometría, CAM e interacción

**Fecha:** 2026-11-25  
**Estado:** investigación y propuesta técnica; funciones descritas aquí pendientes salvo las marcadas como existentes.  
**Origen:** investigación y ejemplos enviados por el usuario en el chat del 25 de noviembre de 2026; revisión del código local por dos subagentes. Los fragmentos recibidos son ejemplos, no especificaciones validadas ni instrucciones de ejecución.  
**Base:** [análisis MakerCase/BurroNieve](ANALISIS_MAKERCASE.md), `src/features/tools/box-generator/boxModel.ts` y `BoxGenerator3D.tsx`.

## Punto de partida comprobado

- `boxModel.ts` ya crea contornos 2D paramétricos de juntas `tab`/`slot` con fase alterna, y usa esos puntos para SVG y DXF. El número de segmentos actual es par. Hay validación dimensional básica y etiquetas opcionales en el SVG; las etiquetas se ubican dentro de las piezas.
- `BoxGenerator3D.tsx` ahora extruye los contornos usados por SVG/DXF y ofrece un slider de despiece; la coincidencia digital no certifica ajuste físico.
- El plano libre coloca hasta seis paneles en cuadrícula fija 3 × 2. La vista Plancha acepta ancho, alto, margen y separación, distribuye en varias hojas sin solapar cajas envolventes y exporta la hoja visible. No rota piezas ni optimiza formas irregulares.
- No existen perfiles calibrados de kerf/holgura, grosores por cara, costes, tiempos CAM, selección de panel en 3D, animación secuencial de armado, decoraciones por cara ni WebXR.

## Propuestas del usuario conservadas para diseño

| Área | Idea recibida | Estado/condición para implementarla |
|---|---|---|
| Encastres | Dividir las aristas en tramos alternos de diente y hueco; reconstruir al cambiar medidas o grosor. | Los mismos perfiles alimentan 2D/3D y se corrigieron longitudes/fases digitales. Falta un descriptor explícito de pares de aristas y validación física. El conteo impar no es regla universal. |
| Perímetro | Caminar las cuatro aristas de cada panel y unir los puntos para SVG y `THREE.Shape`/`ExtrudeGeometry`. | Ya se usa un contorno por panel en exportación y visor. El `generarLado` aportado está incompleto y devuelve un array vacío. |
| Encastres con espesores mixtos | Dar a cada panel su grosor y consultar la pieza vecina para calcular la unión. | Modelar pares de aristas y superficies de contacto antes de generalizar; la profundidad depende de la geometría real de montaje y de la máquina. |
| Laterales inclinados | Definir trapecios por cuatro vértices y generar dientes sobre la arista inclinada. | Evaluar normales, ángulo diedro, posibles biseles y capacidad de corte. Cuatro puntos no resuelven solos la unión física de la tapa. |
| Vista 3D | Extruir los mismos contornos 2D y posicionar cada panel como objeto independiente. | Implementado para la caja básica con longitudes/fases digitales corregidas; falta validación de fabricación. Evitar `eval` y expresiones de cadena del ejemplo recibido. |
| Montaje/despiece | Slider de explosión, orden secuencial, interpolación, repetir y modo de movimiento reducido. | Slider de separación implementado sin regenerar mallas; secuencia, pausa y guía de montaje quedan pendientes. La vista no demuestra encastre viable. |
| Etiquetas | Nombre de pieza automático en planos y mapa de montaje. | Ya hay etiquetas SVG opcionales dentro de las piezas; evaluar etiquetas fuera del corte, en capa separada, para no convertirlas en grabado accidental. |
| Nesting | Cama configurable, orientación, márgenes, varias planchas y previsualización del plano de corte. | Implementada la distribución básica por cajas envolventes y varias hojas; faltan rotación, veta, perfiles de máquina y optimización poligonal. |
| Métricas | Perímetro de corte y área mediante distancias y fórmula del polígono; eficiencia de plancha. | Área/perímetro/uso por hoja implementados para contornos simples sin agujeros. Faltan agujeros, tiempos de máquina y costes. |
| Costes y tiempos | Materiales, velocidades/potencias/pasadas, tiempo de máquina, merma y presupuesto en vivo. | Precios y recetas del mensaje son ejemplos no confirmados. Requiere datos autorizados y mediciones; longitud/velocidad omite perforación, aceleración, esquinas, desplazamientos y grabados. |
| Perfil CAM | Presets de máquina/material y botón de optimización. | La receta debe estar asociada a máquina, material, lote, espesor y revisión. Sugerencias como micro-uniones requieren validación por operario y equipo. |
| Exportación | SVG/DXF por operación, grupos de pieza, capas para corte/marcado/grabado, ordenar interiores antes del exterior. | Los colores rojo/azul/negro son ejemplos, no un estándar universal. Verificar importación, capas y orden en el software destino; el orden XML no garantiza orden de ejecución. |
| Líneas compartidas | Detectar cortes duplicados cuando piezas coinciden en un borde. | Solo aplicar corte común si se permite el contacto y la geometría/kerf de ambos contornos son compatibles; hoy hay espacio entre piezas. |
| Selección 3D | Clic para seleccionar panel, modo de superficie para color/arte, resaltado de bordes. | Usar identificadores semánticos de panel/superficie y mapeo UV; `faceIndex` es índice de triángulo generado y no identidad estable de una cara. |
| Arte y materiales | Logo PNG/SVG por cara, decals, MDF/acrílico, favoritos y distintos materiales por panel. | Definir capas 2D por cara y reflejarlas en 3D/exportación. Material visual y receta de fabricación deben ser datos distintos. Cuidar límites de archivos y licencias. |
| Escenarios | Fondos de panadería/bar/mesa, luces coherentes, HDRI/PBR, sombra de contacto y objeto de escala. | Presets visuales opcionales con recursos licenciados/locales y presupuesto de rendimiento. No alterar dimensiones de fabricación. |
| Realidad aumentada | Vista a escala física en WebXR. | Three.js no impone que 1 unidad sea 1 metro; convertir mm a metros en una escena AR, comprobar dispositivo/HTTPS y ofrecer alternativa 3D. |
| Recalculo reactivo | Actualizar proyecto y reconstruir paneles; mostrar errores de colisión o parámetros inviables. | Mantener un estado de proyecto por instancia; validar restricciones antes de generar y distinguir conflicto geométrico de simple superposición visual. Un `Proxy` no es necesario para el estado React actual. |

## Correcciones técnicas antes de reutilizar los ejemplos

1. **Kerf y holgura son variables distintas.** Un ajuste fijo de `x ± 0,1 mm` no compensa el ancho real del corte. La compensación es un offset del contorno con signo según pieza interior/exterior, operación y ajuste buscado. Registrar pruebas por máquina/material/espesor; no fijar 0,1 mm como valor oficial.
2. **Los códigos de perímetro y ensamblaje son bocetos.** `generarLado` no añade puntos; el ejemplo de seis caras usa `eval` y expresiones como `'fondo'/2`, que no producen las posiciones deseadas. No se deben copiar al proyecto.
3. **La fórmula del área es válida con límites.** La fórmula de Gauss calcula el área de un polígono simple; requiere tratamiento de agujeros y contornos múltiples. Un área en mm² se divide por 1.000.000 antes de multiplicar por una tarifa por m². La compra de planchas puede diferir del área neta de piezas.
4. **El ejemplo de Shelf Packing no es nesting listo para producción.** No rechaza piezas mayores que la cama y no reinicia correctamente `xActual`/altura de fila al abrir plancha; puede desbordar o solapar piezas. El uso de cajas envolventes deja desperdicio con formas irregulares y no implica una rotación óptima.
5. **Los resultados físicos requieren probetas.** Reutilizar el mismo contorno en SVG y 3D asegura coherencia digital, pero no garantiza ajuste real, rigidez ni capacidad de corte en ángulo.
6. **La API de Three.js debe seguir la versión instalada.** El ejemplo `renderer.outputEncoding` corresponde a una API anterior; el repositorio usa `outputColorSpace` con `SRGBColorSpace`. Escala WebXR, `faceIndex`, mapas de entorno y animación deben adaptarse a la arquitectura y versión presentes.
7. **Presets comerciales y de máquina siguen pendientes.** Los precios, velocidades, potencias, colores de operación, porcentaje de merma y parámetros de grabado del mensaje no están confirmados como datos de Visual Corp ni como reglas de una máquina concreta.

## Secuencia de implementación propuesta

1. **P0 — Núcleo geométrico.** Definir paneles con ID, contorno 2D, grosor, cara útil, aristas emparejadas y transformación de montaje. Hacer que visor 3D, plano y SVG/DXF consuman los mismos contornos. Verificar digitalmente caja abierta/cerrada y esquinas antes de sumar variantes.
2. **P1 — Fabricación básica.** Medir kerf/holgura por máquina y material, agregar perfil versionado y reglas de cama (dimensión útil, márgenes, separación, giro/veta). Incorporar operaciones/capas configurables y comprobar archivos en software de corte con probetas.
3. **P2 — Plancha y métricas.** Distribuidor rectangular y exportación de la hoja visible implementados; siguiente paso: validar con formatos de máquina reales, añadir agujeros/orientación/veta y medir eficiencia contra planchas ocupadas. Un optimizador poligonal puede llegar después.
4. **P3 — Costes y personalización.** Añadir estimaciones solo con precios, tiempos y recetas autorizadas; luego arte por cara, selección semántica, materiales visuales y animación de armado.
5. **P4 — Presentación inmersiva.** Incorporar entornos HDRI, referencias de escala y WebXR cuando se validen dispositivos, recursos y rendimiento.

**Datos pendientes para producción:** máquina/software de corte, dimensiones útiles de cama, materiales y espesores reales, kerf/holgura medidos, reglas de capas/colores, tiempos de operación y precios aprobados. Ningún valor ilustrativo del mensaje se registra como tarifa o receta de Visual Corp.
