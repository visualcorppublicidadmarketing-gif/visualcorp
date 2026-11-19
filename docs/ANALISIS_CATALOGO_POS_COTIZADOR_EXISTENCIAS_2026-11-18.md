# Catálogo y existencias para POS, cotizador y tienda

**Fecha:** 18 de noviembre de 2026  
**Actualización:** 19 de noviembre de 2026
**Alcance:** auditar los flujos actuales y hacer visible el catálogo de venta en el inventario existente.  
**Estado:** panel de integración, variantes, selección de existencias y filtro POS por m² están publicados en Vercel Production (SHA `f4888148707aaef482e7661839bb4a2c30eaada0`, PR #322). Los 29 productos físicos publicados están vinculados a una variante `General` con saldo inicial intencional de 5 en Visual Corp · MAIN. La auditoría identifica ese saldo como intencional y aclara que no es un conteo físico; los conteos reales siguen pendientes. Los 37 productos por m² permanecen fuera del stock unitario.

## Prompts de auditoría ejecutados

### 1. POS y catálogo

> Audita en `apps/visualcorp-suite` cómo los productos del catálogo se usan en el POS: origen del catálogo, selección y carrito, persistencia de líneas, descuento de existencias, permisos y archivos relevantes. Explica qué tendría que pasar para sumar existencias solo a productos cuantificables. No edites archivos ni bases de datos.

### 2. Cotizador y tienda

> Audita en `apps/visualcorp-suite` cómo viven los productos en el cotizador interno, el cotizador público y la tienda: fuentes de catálogo, SKU, cantidades o rangos, tablas de Supabase y recorrido de pedido/cotización. Sugiere cómo compartir identidades con inventario sin duplicar productos, precios ni saldos; distingue artículos por unidad de lonas por m². No edites archivos ni bases de datos.

### 3. Modelo de inventario

> Inspecciona el inventario existente en `apps/visualcorp-suite`: artículos, variantes, saldos por sucursal/ubicación, movimientos, interfaz y migraciones. Compara reutilizarlo con crear un inventario paralelo para POS, cotizador y tienda. Enfócate en roll ups, banners X, gorras, tazas y camisas por unidad, y deja las lonas por m² fuera del conteo unitario. No edites archivos ni bases de datos.

### 4. Ejecución de la propuesta

> Implementa la opción recomendada reutilizando Inventario como fuente única. Muestra todos los productos del catálogo, permite vincular varias variantes físicas confirmadas por producto y sucursal y crear variantes con atributos como talla, color, acabado, capacidad y modelo, sin inventar existencias. En POS y conversión de cotizaciones aprobadas, obliga a elegir una variante cuando existan varias y conserva ese ID en la venta. En cotizaciones, muestra saldos agregados sin reservarlos. Mantén servicios y venta por m² fuera del stock unitario, preserva historiales, prepara la migración SQL local sin aplicarla y deja los conteos en blanco. Revisa build y compatibilidad responsive; no publiques.

El prompt inicial excluía aplicar migraciones y publicar. Después, el usuario autorizó preparar una versión aislada de inventario. La corrección se publicó mediante el PR #322, que solo cambió `src/components/InventoryWorkspace.tsx` y `src/pages/pos/CheckoutWorkspace.tsx`; el commit `f4888148707aaef482e7661839bb4a2c30eaada0` quedó `READY` en Production. No se añadieron ni aplicaron migraciones en esta continuación.

## Hallazgos

- `catalog_products` es la identidad comercial compartida. POS y cotizador interno leen el catálogo cargado por el Workspace; cotizador público y tienda consultan vistas de catálogo y conservan producto/SKU al crear la solicitud. Una cotización no descuenta stock.
- POS ya consulta `catalog_inventory_links` por producto y sucursal. Al confirmar la venta, `confirm_pos_sale_with_workflows` usa el vínculo activo para registrar los movimientos correspondientes. El vínculo no se infiere por nombre.
- El inventario existente ya conserva artículo, variante, unidad, sucursal, ubicación, saldo y movimientos. `catalog_inventory_links` conecta producto del catálogo con una variante física. Es el modelo adecuado; no hace falta un segundo inventario ni borrar el catálogo.
- En la consulta de solo lectura a Supabase del 18 de noviembre de 2026, `catalog_products` tenía 249 filas y 248 publicadas. Las 248 publicadas se dividen por tipo de catálogo en 29 `physical` (17 `scale` y 12 `unit`) y 219 `service` (181 `scale`, 37 `m2` y un servicio adicional). Por eso el modo `scale` por sí solo no significa que un producto esté listo para salir de stock: muchos son servicios/personalizaciones bajo pedido. En esa revisión inicial `catalog_inventory_links` tenía cero registros; Inventario mostraba 170 artículos activos y 44 saldos.
- El catálogo publicado contiene dos Banner X y cuatro Roll Up físicos con tamaño/configuración explícitos, además de una ficha genérica Roll Up clasificada como servicio. Hay gorras, jarros y camisetas tanto en fichas `physical` como en presentaciones `service`/personalizadas. El tipo y SKU deben distinguirlas; el modo `scale` no basta para decidir si son stock terminado.
- Inventario ya tiene fichas de taza blanca, mágica, metalizada y camiseta para sublimación. La camiseta no tiene sucursal ni saldo y la talla/color sigue por confirmar. La taza blanca muestra 72 en Visual Corp · MAIN y tiene una auditoría de conteo “Cuadre de inventario” del 16 de noviembre; sus metadatos conservan `catalog_suggestion` y `stock_count_required`, así que el origen debe revisarse, pero existe registro de auditoría del conteo. Los jarros y camisetas comerciales podrían corresponder a esas fichas, pero nombres, SKU y opciones no prueban equivalencia; confirma la variante comercial y su conteo vigente antes de vincular.
- La hoja local `Administración/Inventario/VisualCorp Inventario Actualizado.xlsx` fue modificada el 27 de julio de 2026 y contiene saldos históricos, no una toma vigente. Su fila `Tza. Blanca` conserva saldo 1, mientras Supabase tiene una auditoría posterior de 72 (16 de noviembre); no se copió ninguno de esos valores como conteo nuevo. Roll Up y Banner X tampoco tienen cantidades físicas documentadas en esa hoja.
- Revalidación histórica del 18 de noviembre: Supabase tenía 29 productos publicados como `physical`, cero vínculos activos o inactivos y ninguna auditoría más reciente que las 72 tazas blancas del 16 de noviembre. No aparecieron fichas de Roll Up, Banner X, gorras ni tomatodos; las coincidencias de tazas/camisetas seguían sin equivalencia física exacta.
- `calc_type=scale` es el modo de precio por cantidad del catálogo, no una unidad física ni una superficie. El código convierte a control por área solo `m2`; los SKU físicos `scale` pueden llevar existencias enteras por unidad igual que los físicos `unit`.

## Decisión

Usar Inventario como la única fuente de existencias. Mantener el catálogo para identidad, SKU y condiciones comerciales, y vincular manualmente los productos que se entregan desde stock físico. El POS descuenta al confirmar una venta; cotizar o solicitar cotización desde la tienda no reserva ni descuenta existencias. La tienda pública no muestra los saldos internos.

Las ventas por m² y los servicios conservan sus flujos separados. Para las lonas, el consumo de material debe configurarse en Recetas con material, unidad, ancho y conversión confirmados; no se presentan como piezas contables.

## Cambio implementado

En Inventario → **POS y producción**, el bloque de integración presenta todo el catálogo con estado por sucursal y distingue productos físicos por unidad, productos por m², servicios/bajo pedido y tipos sin confirmar. Solo los SKU físicos pueden vincularse directamente. **Vincular existente** reutiliza una ficha física activa y no vinculada; **Crear y vincular** prepara una ficha si no existe equivalencia confirmada. Después se pueden agregar varias variantes al mismo artículo con talla, color, acabado, material, capacidad, modelo y otros atributos escalares. Las variantes nuevas quedan pendientes de conteo, salvo el saldo inicial intencional descrito abajo, que no se declara como conteo físico.

La selección de POS y de la conversión de una cotización aprobada permite elegir la talla/color que se vende. Un vínculo único se elige automáticamente; con varias variantes el POS exige selección explícita y la RPC valida ese vínculo. `variant_id` queda guardado en la línea y en una descripción legible. El cotizador interno muestra el saldo confirmado agregado e indica cuántas variantes siguen sin conteo; la cotización no reserva. La tienda y el cotizador públicos mantienen catálogo y solicitudes, sin exponer stock interno.

Los vínculos nuevos usan `MAIN` por sucursal: la edición y devolución de ventas POS actuales revierten movimientos a esa ubicación y las líneas históricas no guardan ubicación de salida. Las RPC rechazan vínculos activos cuyo producto no esté publicado, cuya ficha/variante esté inactiva o cuya ubicación sea distinta de `MAIN`. Los vínculos directos aceptan unidades individuales (`unidad`/`pieza`) que coincidan con la unidad vendida; no se vincula una venta por pieza a una caja, paquete, rollo o set sin conversión explícita. Los saldos se buscan por variante, sucursal y ubicación exactas. Las tres migraciones aplicadas son `20261118191907_enforce_integer_physical_catalog_sales.sql`, `20261118191916_pos_inventory_variants.sql` y `20261118193302_catalog_physical_integer_stock_guard.sql`. La última impone enteros en cantidades y reservas de variantes vinculadas a productos físicos por unidad, y valida publicación, ficha activa, unidad individual, `MAIN` y saldos enteros antes de activar un vínculo. Productos por m² y materiales medidos mantienen fracciones. La función de POS conserva los controles remotos de impuestos, cotizaciones, descuentos, pagos y `line_key`, además de validar la variante elegida. La revisión del 18 de noviembre confirmó los tres cambios de esquema, cero vínculos y ningún cambio a saldos; la carga inicial intencional del 19 de noviembre se detalla a continuación.

### Filtro m² del POS

La captura del POS mostraba 29 productos por cantidad, cero por m² y 219 servicios. La causa era que el selector de modalidad solo aparecía en la pestaña de productos; al entrar en Servicios, el POS forzaba cantidad y ocultaba los 37 productos con `calc_type=m2`. La corrección muestra los botones por cantidad y m² en ambas pestañas y calcula los conteos dentro del tipo seleccionado: productos físicos, 29 por cantidad/0 por área; servicios, 182 por cantidad/37 por área. Los servicios por unidad y la venta por m² no descuentan stock unitario.

En la interfaz publicada se seleccionó `Lona Campaña brillante 9oz (tejido 300x500)`: el POS mostró ancho y alto en centímetros, piezas, área calculada y tarifa por m². El cotizador interno ya mostraba correctamente esos campos al seleccionar una lona; no requirió cambios.

Para evitar que el conteo `m² (0)` de Productos y artículos oculte las lonas clasificadas como servicios, pulsar ese filtro cambia a Servicios cuando allí están las opciones por área. En el selector del cotizador se añadieron filtros `Todo`, `Por unidad` y `Por medidas m²`; el buscador también encuentra `m²`, medidas, área y unidades aunque esos términos no estén en el nombre del producto.

### Saldos iniciales intencionales

El usuario autorizó asignar 5 solo a los productos físicos del catálogo POS y crear/vincular una variante general cuando faltara. Se crearon 29 fichas con variante `General`, unidad `unidad`, sucursal Visual Corp y ubicación `MAIN`; cada una tiene saldo 5, para un total inicial intencional de 145 unidades. La auditoría de cada variante tiene `source_status='opening_balance_intentional'` y la nota `Saldo inicial intencional de 5 por instrucción del usuario; no representa conteo físico.` No se registró `physical_count_confirmed_at` ni `physical_count_confirmed_by`.

La consulta final a Supabase confirmó 29/29 vínculos activos, saldo 5 en cada variante, 29 auditorías con la nota indicada y cero reservas. Los 37 productos por m² conservan cero vínculos. No se reutilizaron fichas cuya coincidencia comercial no estaba confirmada: la taza blanca con SKU `VC-INV-SUB-001` mantiene sus 72 unidades y dos auditorías, sin vincularse al SKU `PF003`; el jarro del catálogo tiene su propia ficha General con 5 intencionales. Las futuras tallas, colores y opciones deben añadirse como variantes y recibir su conteo físico cuando esté disponible.

Se conserva la plantilla de conteo inicial y sus versiones previas. La versión `v03` deja los SKU prioritarios y físicos disponibles para capturar, separa conteo único de conteo por variantes, bloquea mezclar ambos métodos para el mismo producto y mantiene cantidades vacías hasta que exista un conteo real. Servicios y lonas por m² quedan fuera de las piezas. El estado vacío no muestra ceros ni presenta filas en blanco como disponibles.

## Revisión técnica

- Se usaron revisiones delegadas para auditar POS, cotizaciones, variantes de inventario, SKU `scale`, candidatos de stock, migraciones, RPC de conteo y posibilidades de carga masiva. Se inspeccionaron tablas, RPC e historial remoto antes de aplicar las tres migraciones; el historial registra `20261118191907`, `20261118191916` y `20261118193302`.
- El editor de ventas POS ahora fuerza cantidad entera solo para productos físicos por unidad; los servicios mantienen su modalidad y los productos por m² usan su flujo de área. Esto corrige una edición que podía tratar como enteras algunas líneas de servicio.
- `npm run build:checked`: TypeScript y build de producción pasaron tras la corrección del POS y la trazabilidad del saldo intencional. Vite conserva el aviso de chunks mayores a 500 kB.
- PR #322 se integró con build de GitHub y preview Vercel aprobados; Production quedó `READY` desde `f4888148707aaef482e7661839bb4a2c30eaada0`.
- Se cargaron 145 unidades de saldo inicial intencional, documentadas como no físicas. Los conteos físicos vigentes permanecen pendientes.
- En investigación de UI se consultaron Magic UI (sin patrón pertinente), el conector shadcn (sin registros configurados para el proyecto y con documentación oficial revisada) y documentación HeroUI 3.2.7. Se conservaron la tabla y controles existentes porque cubren el flujo sin añadir dependencias.
