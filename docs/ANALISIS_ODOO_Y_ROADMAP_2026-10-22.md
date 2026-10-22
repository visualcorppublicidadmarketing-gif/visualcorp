# Revisión de Odoo y ruta de evolución de Visual Corp

**Fecha:** 22 de octubre de 2026  
**Alcance:** comparación del POS minorista de Odoo y sus flujos de inventario con la versión activa de Visual Corp Suite. Las capturas enviadas se usan como referencias de funciones, no como especificación de interfaz.

## Qué destaca Odoo

El POS de Odoo se presenta como una pantalla de caja para distintos dispositivos, con varios cajeros, filtros de producto, varias opciones de pago, operación sin conexión, fidelización, facturación flexible y conexión con inventario y comercio electrónico. Sus guías describen clientes/cuentas de cliente, métodos de pago, descuentos y programas de lealtad. Inventario añade trazabilidad por lote o serie y escaneo de códigos de barras. Estas funciones muestran el valor de unir la caja con los procesos posteriores a la venta, no solo con una pantalla de cobro.

Fuentes oficiales:

- [Punto de venta para tiendas minoristas](https://www.odoo.com/es_ES/app/point-of-sale-shop)
- [Flujo de trabajo del Punto de venta](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html)
- [Métodos de pago del Punto de venta](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/payment_methods.html)
- [Programas de descuentos y fidelización](https://www.odoo.com/documentation/19.0/applications/sales/sales/products_prices/loyalty_discount.html)
- [Seguimiento por lotes y series](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/management/lots_serial_numbers.html)
- [Códigos de barras para lotes y series](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/barcode/setup/serial_numbers_lots.html)

## Lo que Visual Corp ya tiene

La versión activa ya integra el sitio público y su administración, catálogo/cotizador, CRM y clientes, POS transaccional, inventario por artículo/variante/sucursal, costos con permisos, movimientos y reservas, transferencias entre Visual Corp y Gigaprint, caja, devoluciones, órdenes de producción, cotizaciones centrales y novedades internas. Las ventas confirmadas actualizan stock solo para las variantes vinculadas; los datos de existencias que aún requieren conteo se conservan como pendientes.

El POS actual guarda ventas, clientes, abonos y saldos; puede convertir cotizaciones aceptadas. Es un flujo inicial de registro de venta. Aún no equivale a una caja de mostrador con carrito visual multiartículo, lectura de código de barras, turno de cajero o pago dividido. En compras, el costo puede guardar el nombre de un proveedor, pero la aplicación activa no tiene una base central de proveedores ni órdenes de compra conectadas a recepciones. El módulo de compras visto en archivos heredados de GigaPrint no está conectado a las rutas ni a las tablas de Visual Corp, por lo que no se debe presentar como función activa.

## Prioridades recomendadas

| Fase | Crear o mejorar | Resultado comprobable |
|---|---|---|
| 0. Responsive y navegación | Menú móvil accesible para Admin Web y Operaciones, con panel lateral, foco táctil y estado claro. Adaptar tablas a tarjetas o desplazamiento contenido. | Operable sin zoom en teléfono, tableta y escritorio. El menú móvil queda implementado en esta entrega. |
| 1. Compras y proveedores | Registro de proveedores; solicitudes de reposición desde faltantes/minimos; órdenes con líneas, fecha esperada, costo, estados y recepción parcial; cada recepción genera movimientos auditados de inventario. | Una compra de lona/tazas u otro material puede seguirse de solicitud a recepción; el stock cambia solo por unidades realmente recibidas. |
| 2. Caja de mostrador | Carrito multiartículo con fotos/categorías y búsqueda rápida; selección/alta de cliente; cajero identificado; pagos combinados y abonos; guardar venta en espera y recuperarla. | Asesora termina una venta cotidiana desde móvil/tableta o computadora y el registro queda enlazado a cliente, caja e inventario. |
| 3. Escaneo y preparación | Lector USB/cámara para SKU o código; ubicaciones; conteos y recepciones guiados; preparación y entrega de pedidos; lotes/series solo donde el tipo de artículo lo necesite. | Escaneo reduce digitación y cada salida/recepción conserva actor, artículo, cantidad y ubicación. |
| 4. Confiabilidad sin conexión | Cola local idempotente con indicador de pendiente/sincronizado, reintentos y resolución visible de conflictos. | Una desconexión temporal no pierde ventas; la aplicación no declara stock sincronizado hasta confirmación. |
| 5. Producción y calidad | Recetas/listas de materiales versionadas, consumos reales, asignación a área/responsable, control de calidad y retrabajo. | Una orden de venta dirige materiales y estados sin descontar cantidades estimadas como si fueran consumo real. |
| 6. Contabilidad e informes | Conciliar caja, pagos, cuentas por cobrar, costos y márgenes; separar esta fase de facturación tributaria. | Reportes trazables y revisados por responsables contables. Integración con SRI queda pendiente de requisitos y proveedor autorizado. |
| 7. Fidelización y canales | Descuentos autorizados, saldo/beneficios del cliente y pedido/recogida desde la web, respetando precios e inventario compartidos. | La misma condición comercial y estado del pedido se entienden en web y sucursal. |

## Criterios de responsive para cada fase

- Revisar como mínimo 360 × 800, 768 × 1024 y 1440 × 900 píxeles.
- Caja y formularios deben conservar acciones principales visibles, controles táctiles cómodos y teclado móvil adecuado al dato.
- Las tablas deben convertirse en tarjetas cuando la comparación no requiera columnas simultáneas; si requieren columnas, el desplazamiento horizontal debe quedar dentro de la tabla y no ensanchar toda la página.
- Probar cargas lentas, listas vacías, errores de red y permisos insuficientes en cada pantalla.
- No convertir capturas o importaciones ambiguas en stock confirmado ni usar precios no validados para promesas comerciales.

## Hecho en esta revisión

La navegación interna en teléfono ahora abre un panel lateral con botón accesible y fondo de cierre; al elegir una sección el panel se cierra y el área principal ocupa todo el ancho. La página pública y el resto de los estilos ya tenían breakpoints para móvil. La fase funcional recomendada para implementar a continuación es **Compras y proveedores**, porque conecta directamente alertas de faltantes con una recepción auditable y stock real.
