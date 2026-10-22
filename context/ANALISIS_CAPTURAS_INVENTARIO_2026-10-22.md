# Análisis de capturas del inventario actualizado

Fecha de revisión: 22 de octubre de 2026
Fuente: `E:\VISUAL CORP\PRECIOS\Inventario\`
Alcance: 67 capturas PNG: 33 de `Area Sublimación` y 34 de `Area Taller`.

## Lectura de la fuente

- Las capturas muestran tablas de Excel filtradas por tipo. Al recorrer sus filas se observan **83 renglones de Sublimación** y **120 de Taller** (203 renglones visibles en total). El conteo describe lo que muestran las capturas; no certifica un conteo físico independiente.
- El encabezado de Sublimación contiene tipo, color, talla y stock. Taller contiene número de ítem, tipo, detalle, características, medida/despacho y stock disponible.
- Las capturas están fechadas el 22 de octubre de 2026. Se toman como una fotografía de ese momento, no como sincronización automática con la app.
- Los números de ítem de Excel se repiten entre categorías y algunas filas no tienen número. No deben usarse como ID global de Visual Corp.
- Los nombres y las cantidades se conservan como aparecen, incluidos errores tipográficos evidentes, hasta que el responsable confirme una normalización.

## Familias visibles

**Sublimación:** acetato para fotocopias; agendas de Giga y Visual; anillos de anillar; camisetas cuello O y V; copas; hojas A4 para notas y blancas; jarrón Mazón; llaveros metálicos; mameluco; mason con tapa de diseño de fruta; papel couché y papel de sublimación A3; pines; platos; plumas; polos; porta taza; protector de hoja A4; sobres Manila grande/pequeño, oficio y blancos; tazas blanca, mágica, metalizada y pequeña; tomatodo de vidrio; tríptico de Visual; uniforme.

**Taller:** ácidos, AKFIX, alucobond, amarras, brillos, cables, cadenas, cauchos, cintas, diluyente, discos para metal, enchufes, estaño, EVANS, garruchas, grapas, LED, lonas, material para taller, neones, pasta, pegamentos, perno decorativo, pinturas, potencias, regulador, silicona, sintras, soportes, tintas, tornillos, tubos para estructuras, utensilios de corte y viniles.

## Excepciones que debe respetar una importación

- En Taller hay cantidades cualitativas como `POCO` (pinturas y brillos), cantidades compuestas como `2 ROLLOS + 1/2`, y un stock en blanco para el regulador. No se deben convertir silenciosamente en cantidades numéricas. La app debe guardar el texto original y marcar esos conteos para verificación.
- Las cantidades numéricas `0` sí aparecen explícitamente y deben conservarse como cero; no son equivalentes a un campo en blanco.
- En Sublimación se repiten combinaciones de color/talla en camisetas cuello O y plumas naranjas en más de una fila. Antes de fusionarlas, conservar la suma y las filas de origen para evitar pérdida de trazabilidad.
- La camiseta azul marino talla 35 aparece con 35 unidades y talla 36 con 36 unidades. Se transcribieron literalmente; son valores inusuales que conviene cotejar en el conteo físico.
- Aparecen grafías que podrían requerir corrección (`JARRON MAZON`, `BIZON`, `FUCCIA`, entre otras); conservar el original y normalizar en un campo aparte.
- Estas capturas no muestran costos de compra, proveedores, mínimos de reposición, ubicaciones físicas, responsables del último movimiento ni stock de Gigaprint. Esos datos siguen pendientes.

## Aplicación e importación

- La base Supabase de Visual Corp ya contiene 70 artículos sugeridos con IDs únicos, categorías jerárquicas y áreas para impresión, sublimación, troquelado, láser, taller, neones y bodega general. No se registraron saldos para estos artículos: requieren conteo físico.
- Se cargaron 749 filas brutas de los libros de inventario de Visual Corp y Gigaprint en lotes separados con hoja, fila y datos originales. El estado de todas las filas importadas permanece pendiente de revisión; no son existencias disponibles para vender ni consumir.
- La app tiene un panel de revisión que muestra filas de origen. El módulo operativo mantiene movimientos locales hasta completar la sincronización transaccional con Supabase.
- Los archivos y las capturas originales permanecen en su ubicación de origen. No se asignó stock a Gigaprint fuera de lo que indiquen y confirmen sus propios registros.

## Uso recomendado

Usar estas capturas como fuente de una importación inicial fechada, no como una lista de compras ni como confirmación de costos. Mantenerlas intactas en la carpeta original. Tras la importación, hacer un conteo de confirmación y registrar responsable, ubicación, unidad base y mínimos por artículo.
