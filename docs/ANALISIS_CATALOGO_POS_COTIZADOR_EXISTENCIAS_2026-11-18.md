# Catálogo y existencias para POS, cotizador y tienda

**Fecha:** 18 de noviembre de 2026  
**Alcance:** auditar los flujos actuales y hacer visible el catálogo de venta en el inventario existente.  
**Estado:** panel de integración, variantes por producto y selección de variante en POS implementados localmente. Tres migraciones quedaron aplicadas en Supabase; los conteos físicos reales siguen pendientes y no se cargaron saldos nuevos.

## Prompts de auditoría ejecutados

### 1. POS y catálogo

> Audita en `apps/visualcorp-suite` cómo los productos del catálogo se usan en el POS: origen del catálogo, selección y carrito, persistencia de líneas, descuento de existencias, permisos y archivos relevantes. Explica qué tendría que pasar para sumar existencias solo a productos cuantificables. No edites archivos ni bases de datos.

### 2. Cotizador y tienda

> Audita en `apps/visualcorp-suite` cómo viven los productos en el cotizador interno, el cotizador público y la tienda: fuentes de catálogo, SKU, cantidades o rangos, tablas de Supabase y recorrido de pedido/cotización. Sugiere cómo compartir identidades con inventario sin duplicar productos, precios ni saldos; distingue artículos por unidad de lonas por m². No edites archivos ni bases de datos.

### 3. Modelo de inventario

> Inspecciona el inventario existente en `apps/visualcorp-suite`: artículos, variantes, saldos por sucursal/ubicación, movimientos, interfaz y migraciones. Compara reutilizarlo con crear un inventario paralelo para POS, cotizador y tienda. Enfócate en roll ups, banners X, gorras, tazas y camisas por unidad, y deja las lonas por m² fuera del conteo unitario. No edites archivos ni bases de datos.

### 4. Ejecución de la propuesta

> Implementa la opción recomendada reutilizando Inventario como fuente única. Muestra todos los productos del catálogo, permite vincular varias variantes físicas confirmadas por producto y sucursal y crear variantes con atributos como talla, color, acabado, capacidad y modelo, sin inventar existencias. En POS y conversión de cotizaciones aprobadas, obliga a elegir una variante cuando existan varias y conserva ese ID en la venta. En cotizaciones, muestra saldos agregados sin reservarlos. Mantén servicios y venta por m² fuera del stock unitario, preserva historiales, prepara la migración SQL local sin aplicarla y deja los conteos en blanco. Revisa build y compatibilidad responsive; no publiques.

El alcance inicial excluía aplicar migraciones y publicar. Después, el usuario autorizó ejecutar las recomendaciones; se aplicaron solo las migraciones de esquema indicadas abajo. La interfaz sigue local, sin publicación.

## Hallazgos

- `catalog_products` es la identidad comercial compartida. POS y cotizador interno leen el catálogo cargado por el Workspace; cotizador público y tienda consultan vistas de catálogo y conservan producto/SKU al crear la solicitud. Una cotización no descuenta stock.
- POS ya consulta `catalog_inventory_links` por producto y sucursal. Al confirmar la venta, `confirm_pos_sale_with_workflows` usa el vínculo activo para registrar los movimientos correspondientes. El vínculo no se infiere por nombre.
- El inventario existente ya conserva artículo, variante, unidad, sucursal, ubicación, saldo y movimientos. `catalog_inventory_links` conecta producto del catálogo con una variante física. Es el modelo adecuado; no hace falta un segundo inventario ni borrar el catálogo.
- En la consulta de solo lectura a Supabase del 18 de noviembre de 2026, `catalog_products` tenía 249 filas y 248 publicadas. Las 248 publicadas se dividen por tipo de catálogo en 29 `physical` (17 `scale` y 12 `unit`) y 219 `service` (181 `scale`, 37 `m2` y un servicio adicional). Por eso el modo `scale` por sí solo no significa que un producto esté listo para salir de stock: muchos son servicios/personalizaciones bajo pedido. `catalog_inventory_links` tenía cero registros; Inventario mostraba 170 artículos activos y 44 saldos.
- El catálogo publicado contiene dos Banner X y cuatro Roll Up físicos con tamaño/configuración explícitos, además de una ficha genérica Roll Up clasificada como servicio. Hay gorras, jarros y camisetas tanto en fichas `physical` como en presentaciones `service`/personalizadas. El tipo y SKU deben distinguirlas; el modo `scale` no basta para decidir si son stock terminado.
- Inventario ya tiene fichas de taza blanca, mágica, metalizada y camiseta para sublimación. La camiseta no tiene sucursal ni saldo y la talla/color sigue por confirmar. La taza blanca muestra 72 en Visual Corp · MAIN y tiene una auditoría de conteo “Cuadre de inventario” del 16 de noviembre; sus metadatos conservan `catalog_suggestion` y `stock_count_required`, así que el origen debe revisarse, pero existe registro de auditoría del conteo. Los jarros y camisetas comerciales podrían corresponder a esas fichas, pero nombres, SKU y opciones no prueban equivalencia; confirma la variante comercial y su conteo vigente antes de vincular.
- La hoja local `Administración/Inventario/VisualCorp Inventario Actualizado.xlsx` fue modificada el 27 de julio de 2026 y contiene saldos históricos, no una toma vigente. Su fila `Tza. Blanca` conserva saldo 1, mientras Supabase tiene una auditoría posterior de 72 (16 de noviembre); no se copió ninguno de esos valores como conteo nuevo. Roll Up y Banner X tampoco tienen cantidades físicas documentadas en esa hoja.
- Revalidación de continuidad: Supabase sigue con 29 productos publicados como `physical`, cero vínculos activos o inactivos y ninguna auditoría más reciente que las 72 tazas blancas del 16 de noviembre. No aparecieron fichas de Roll Up, Banner X, gorras ni tomatodos; las coincidencias de tazas/camisetas siguen sin equivalencia física exacta.
- `calc_type=scale` es el modo de precio por cantidad del catálogo, no una unidad física ni una superficie. El código convierte a control por área solo `m2`; los SKU físicos `scale` pueden llevar existencias enteras por unidad igual que los físicos `unit`.

## Decisión

Usar Inventario como la única fuente de existencias. Mantener el catálogo para identidad, SKU y condiciones comerciales, y vincular manualmente los productos que se entregan desde stock físico. El POS descuenta al confirmar una venta; cotizar o solicitar cotización desde la tienda no reserva ni descuenta existencias. La tienda pública no muestra los saldos internos.

Las ventas por m² y los servicios conservan sus flujos separados. Para las lonas, el consumo de material debe configurarse en Recetas con material, unidad, ancho y conversión confirmados; no se presentan como piezas contables.

## Cambio implementado

En Inventario → **POS y producción**, el bloque de integración presenta todo el catálogo con estado por sucursal y distingue productos físicos por unidad, productos por m², servicios/bajo pedido y tipos sin confirmar. Solo los SKU físicos pueden vincularse directamente. **Vincular existente** reutiliza una ficha física activa y no vinculada; **Crear y vincular** prepara una ficha si no existe equivalencia confirmada. Después se pueden agregar varias variantes al mismo artículo con talla, color, acabado, material, capacidad, modelo y otros atributos escalares. Cada variante nueva queda marcada como pendiente de conteo; la cantidad se registra luego por el flujo habitual, sin inventar ni copiar saldos.

La selección de POS y de la conversión de una cotización aprobada permite elegir la talla/color que se vende. Un vínculo único se elige automáticamente; con varias variantes el POS exige selección explícita y la RPC valida ese vínculo. `variant_id` queda guardado en la línea y en una descripción legible. El cotizador interno muestra el saldo confirmado agregado e indica cuántas variantes siguen sin conteo; la cotización no reserva. La tienda y el cotizador públicos mantienen catálogo y solicitudes, sin exponer stock interno.

Los vínculos nuevos usan `MAIN` por sucursal: la edición y devolución de ventas POS actuales revierten movimientos a esa ubicación y las líneas históricas no guardan ubicación de salida. Las RPC rechazan vínculos activos cuyo producto no esté publicado, cuya ficha/variante esté inactiva o cuya ubicación sea distinta de `MAIN`. Los vínculos directos aceptan unidades individuales (`unidad`/`pieza`) que coincidan con la unidad vendida; no se vincula una venta por pieza a una caja, paquete, rollo o set sin conversión explícita. Los saldos se buscan por variante, sucursal y ubicación exactas. Las tres migraciones aplicadas son `20261118191907_enforce_integer_physical_catalog_sales.sql`, `20261118191916_pos_inventory_variants.sql` y `20261118193302_catalog_physical_integer_stock_guard.sql`. La última impone enteros en cantidades y reservas de variantes vinculadas a productos físicos por unidad, y valida publicación, ficha activa, unidad individual, `MAIN` y saldos enteros antes de activar un vínculo. Productos por m² y materiales medidos mantienen fracciones. La función de POS conserva los controles remotos de impuestos, cotizaciones, descuentos, pagos y `line_key`, además de validar la variante elegida. La verificación confirmó los tres cambios de esquema, cero vínculos activos y cero filas en `catalog_inventory_links`; no se modificaron existencias.

Se conserva la plantilla de conteo inicial y sus versiones previas. La versión `v03` deja los SKU prioritarios y físicos disponibles para capturar, separa conteo único de conteo por variantes, bloquea mezclar ambos métodos para el mismo producto y mantiene cantidades vacías hasta que exista un conteo real. Servicios y lonas por m² quedan fuera de las piezas. El estado vacío no muestra ceros ni presenta filas en blanco como disponibles.

## Revisión técnica

- Se usaron revisiones delegadas para auditar POS, cotizaciones, variantes de inventario, SKU `scale`, candidatos de stock, migraciones, RPC de conteo y posibilidades de carga masiva. Se inspeccionaron tablas, RPC e historial remoto antes de aplicar las tres migraciones; el historial registra `20261118191907`, `20261118191916` y `20261118193302`.
- El editor de ventas POS ahora fuerza cantidad entera solo para productos físicos por unidad; los servicios mantienen su modalidad y los productos por m² usan su flujo de área. Esto corrige una edición que podía tratar como enteras algunas líneas de servicio.
- `npm run build:checked`: TypeScript y build de producción pasaron tras la integración de variantes. Vite conserva el aviso de chunks mayores a 500 kB.
- No se ingresaron conteos ni se modificaron existencias. La interfaz y el código siguen sin publicar en Vercel.
- En investigación de UI se consultaron Magic UI (sin patrón pertinente), el conector shadcn (sin registros configurados para el proyecto y con documentación oficial revisada) y documentación HeroUI 3.2.7. Se conservaron la tabla y controles existentes porque cubren el flujo sin añadir dependencias.
