# Variantes de papel, vinil y lona

Estado: catálogo cargado y flujo de corte preparado el 26 de octubre de 2026. Hay 8 artículos maestros y 43 variantes visibles (38 variantes nuevas y 5 sugerencias previas conservadas). Las cantidades físicas siguen pendientes de conteo; esta configuración no registra compras, costos ni existencias.

## Especificaciones confirmadas por Visual Corp

- Papel bond: formatos A5, A4, A3 y A2. La unidad base queda en hojas; la presentación de compra (resma, paquete u otra) y su equivalencia se deben completar cuando se confirme.
- Vinil: anchos de 107 y 127 cm. Se prepararon acabados brillante, mate, arenado/esmerilado, dorado, transparente y transferencia. Para brillante y mate se agregaron variantes negro, amarillo, azul, verde y rojo, con ambos anchos. El selector de especificaciones permite registrar más colores y acabados.
- Lona estándar: variantes de origen 310, 107 y 207 cm, y variante de 203 cm para el resultado del corte interno. El perfil de corte de 310 cm es 107 + 203 cm. Los 107 cm pueden provenir de compra directa o del corte interno; 207 cm se marca como compra directa.
- La longitud de 25 m se almacena como referencia habitual para los viniles, no como longitud garantizada. En cada recepción se registran los metros reales y la referencia de proveedor/lote en el movimiento.

## Uso del catálogo

Los artículos maestros agrupan variantes/SKU. Los atributos `width_cm`, `paper_size`, `finish` y `color` definen cada opción; cada fila de stock usa la unidad base del artículo. Las variantes nuevas se crean sin fila de stock, por lo que aparecen pendientes de conteo físico y no como existencia cero disponible.

La recepción de un rollo se ingresa como metros lineales medidos, no como “1 rollo”. Anota proveedor, lote o etiqueta en referencia/documento. El campo habitual de 25 m no rellena ni calcula la cantidad recibida.

En Inventario → Integraciones, “Cortar lona de 310 cm” requiere un conteo disponible del rollo de origen, sucursal, ubicación y metros medidos. El backend valida que origen y salidas pertenecen al mismo artículo y que sus anchos son exactamente 310 → 107 + 203 cm. Una única operación auditable descuenta el origen y registra ambas salidas; si falla la validación o el saldo no alcanza, no se aplica parcialmente.

## Referencias visuales

Las ilustraciones SVG bajo `public/inventory/catalog-materials/` son referencias generadas para identificar familias y medidas. No prueban marca, lote, composición, acabado exacto ni existencia física.

## Pendientes para completar con recepción real

- Proveedor, SKU de proveedor, empaque y equivalencia de compra del papel bond.
- Longitud exacta por rollo y etiqueta/lote de cada compra de vinil y lona.
- Colores/acabados adicionales realmente disponibles por proveedor.
- Confirmar si se requiere trazabilidad por cada rollo físico individual además de registrar metros por recepción y referencia de movimiento.

No activar vínculos POS ni recetas de consumo basados únicamente en estas ilustraciones o en el catálogo sugerido. Primero asignar sucursal/ubicación y confirmar los saldos mediante conteo físico.
