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

La versión activa integra el sitio público y su administración, catálogo/cotizador, CRM y clientes, POS transaccional, inventario por artículo/variante/sucursal, costos con permisos, movimientos y reservas, transferencias entre Visual Corp y Gigaprint, caja, devoluciones, órdenes de producción, cotizaciones centrales y novedades internas. La Fase 2 incorpora el directorio de proveedores, órdenes de compra con estados y recepciones parciales conectadas al ledger. Las ventas confirmadas actualizan stock solo para las variantes vinculadas; los datos de existencias que aún requieren conteo se conservan como pendientes.

El POS actual guarda ventas, clientes, abonos y saldos; puede convertir cotizaciones aceptadas. Es un flujo inicial de registro de venta. Aún no equivale a una caja de mostrador con carrito visual multiartículo, lectura de código de barras, turno de cajero o pago dividido. Compras ahora cuenta con tablas, permisos y flujo propios en Visual Corp Suite; el módulo legado de GigaPrint sigue separado y no se presenta como conectado.

## Roadmap por fases

El detalle, criterios de cierre y estado se mantienen en la sección **Plan integral de mejora operativa** al final de este documento (Fases 0–9). Esa secuencia reemplaza la lista inicial de prioridades y se actualiza con cada entrega. La siguiente fase funcional después de Compras es el POS de mostrador (Fase 3).

## Criterios de responsive para cada fase

- Revisar como mínimo 360 × 800, 768 × 1024 y 1440 × 900 píxeles.
- Caja y formularios deben conservar acciones principales visibles, controles táctiles cómodos y teclado móvil adecuado al dato.
- Las tablas deben convertirse en tarjetas cuando la comparación no requiera columnas simultáneas; si requieren columnas, el desplazamiento horizontal debe quedar dentro de la tabla y no ensanchar toda la página.
- Probar cargas lentas, listas vacías, errores de red y permisos insuficientes en cada pantalla.
- No convertir capturas o importaciones ambiguas en stock confirmado ni usar precios no validados para promesas comerciales.

## Hecho en esta revisión

La navegación interna en teléfono y tableta ahora abre un panel lateral con botón accesible, fondo de cierre y tecla Escape; al elegir una sección el panel se cierra y el área principal ocupa todo el ancho. Se añadió una capa visual compartida para Admin Web, Operaciones y POS: superficies modulares, jerarquía tipográfica, controles táctiles y foco visible. En inventario, la cola de importación ahora pagina por hoja, permite vincular una fila con una variante existente o excluirla con motivo, y guarda cada decisión junto al actor en una bitácora protegida. El vínculo nunca crea stock. Al crear un artículo, dejar vacío el conteo significa “sin conteo”; cero requiere ingresarse explícitamente.

En esta iteración de la Fase 0, el resumen del POS se ajusta para mostrar sus tres métricas en una sola fila en pantallas medianas, pasar a tarjetas legibles en móvil y presentar las órdenes recientes como módulos independientes. También inicia la Fase 3 con un carrito multiartículo conectado al registro transaccional existente: conserva cotizaciones aceptadas y sus líneas, distingue precios confirmados de valores acordados manualmente, y mantiene vínculos de inventario para reserva al confirmar. La versión queda en rama de revisión hasta validar el despliegue; no se modificaron ventas, pagos ni existencias reales durante el desarrollo.

En la continuación de la Fase 1, el área de inventario incorpora un recorrido guiado de conteo físico para variantes y sucursales sin saldo confirmado. Cada registro requiere una cantidad observada y un responsable, se guarda mediante la función auditada existente, admite omisiones sin asignarles cantidad y muestra el avance. El panel se adapta a pantallas estrechas; esta mejora está en la rama de trabajo y todavía no significa que se hayan contado o conciliado las existencias reales.

## Plan maestro de implementación por fases

El orden prioriza primero la confiabilidad de los datos y luego automatiza los movimientos que dependen de ellos. Cada fase se publica como una entrega pequeña, documentada en el changelog, migrada de forma compatible y verificada en la app desplegada. No se declara disponible una función solo por existir su pantalla: debe completar el flujo y dejar evidencia en la base central.

### Fase 0 — Base segura, responsive y operación observable

**Estado:** iniciada. El menú lateral móvil y la primera capa compartida ya se publicaron; la comprobación integral de todas las rutas y tamaños sigue pendiente.

- Revisar página pública, Admin Web, Operaciones, POS, CRM, Clientes, Inventario, Cotizador y flujos en 360 × 800, 768 × 1024 y 1440 × 900.
- Asegurar controles táctiles cómodos, formularios utilizables con teclado móvil, estados de carga/vacío/error y que ninguna tabla ensanche la página.
- Revisar perfiles y permisos para propietario, administración web, administración POS, asesoría, bodega y producción; conceder solo los accesos necesarios.
- Mantener respaldo previo, migraciones versionadas, claves fuera del repositorio, changelog por entrega y forma de reversión.

**Cierre:** las rutas funcionan en los tres tamaños; cada rol ve y modifica solo lo autorizado; una migración puede aplicarse desde una base respaldada; el changelog y el despliegue reflejan la versión activa.

### Fase 1 — Inventario confiable y catálogo operativo

**Estado:** parcial. La revisión de procedencia tiene decisiones auditadas y esta iteración añade un recorrido guiado para confirmar conteos físicos. Aún no se ha conciliado físicamente ninguna fila fuente; los conteos deben ingresarlos responsables que observen las existencias reales.

- Separar consumibles, materia prima, producto para reventa, herramientas y servicios; definir unidad de medida, variantes, área, sucursal y ubicación cuando se confirme esa información.
- Añadir flujo guiado de conteo físico, conciliación contra las 749 filas fuente pendientes, aprobación y saldo inicial con actor, fecha y procedencia.
- Completar mínimos/máximos y reglas de reposición por artículo solo cuando el responsable los confirme; mostrar “sin conteo” como desconocido, nunca como cero.
- Normalizar SKU/códigos, fotos de referencia, proveedor preferido y etiquetas sin reemplazar originales ni inventar precios o cantidades.

**Cierre:** cada saldo activo proviene de conteo o movimiento registrado; se puede rastrear quién, cuándo y por qué lo cambió; filtros y métricas distinguen dato confirmado de dato pendiente.

### Fase 2 — Proveedores, compras y reposición

**Estado:** implementada en código y migrada a Supabase. Se publicaron tablas protegidas por RLS para proveedores, órdenes, líneas, recepciones y líneas recibidas; RPC transaccionales para borradores, envío, cancelación sin recepciones y recepción parcial/final; la recepción idempotente genera movimientos auditados y actualiza el costo solo al recibir. Operaciones tiene un panel responsive, reposición sugerida desde saldos contados y mínimos confirmados, y proveedores archivables. Se publicó una novedad compartida para Admin y Operaciones. Vercel generó el preview `visualcorp-suite-git-feature-inventory-import-review-visual19.vercel.app` y figura **Ready**. La validación visual con sesión está pendiente porque OAuth redirige al host del preview, y solo está autorizada la URL temporal anterior; Producción no se ha actualizado con esta entrega.

- Crear la base central de proveedores y sus contactos comerciales confirmados.
- Generar solicitudes de reposición desde mínimos, agotados y compra urgente del POS; permitir revisión y consolidación por proveedor.
- Crear órdenes con líneas, unidades, costo confirmado, fecha prevista, notas y estados de borrador, aprobación, envío, recepción parcial y cierre/cancelación.
- Recibir cantidades parciales y registrar automáticamente movimientos auditados; la orden conserva saldo por recibir y diferencia entre pedido y recibido.
- Incorporar historial por proveedor, artículo, última compra y variación de costo sin cambiar el costo vigente hasta confirmar la recepción.

**Cierre:** un pedido puede seguirse desde faltante hasta recepción parcial/final, cada unidad recibida actualiza el saldo una sola vez y un reintento no duplica stock.

### Fase 3 — POS de mostrador y experiencia de asesoría

**Estado:** parcial, en curso. Ya existe carrito multiartículo con búsqueda por nombre, filtro por familia, imágenes de catálogo, cantidad, precio unitario explícito y total en vivo; se registra en una sola operación idempotente, con cliente y abono, y conserva los artículos trazables de cotizaciones aceptadas. También permite dividir el cobro entre varios métodos o registrar la venta con saldo pendiente; el efectivo requiere turno abierto. Ahora el POS muestra el cajero autenticado y el estado de su caja, y permite guardar borradores recuperables en Supabase para retomarlos en cualquier dispositivo autorizado de la sucursal. El borrador conserva el cliente, carrito o cotización y total; no cobra ni aparta existencias, y queda cerrado solo al enlazarlo con su venta confirmada. Los cambios quedaron migrados y publicados en Novedades. Siguen pendientes revisión visual autenticada del preview y validar con el equipo el ciclo completo de turnos/cierres.

- Reemplazar la captura de una sola línea por catálogo visual con búsqueda, categorías, imágenes, variantes, cantidades, descuentos autorizados y carrito multiartículo.
- Agilizar selección o alta de cliente, atribuir cada venta a la cuenta cajera autenticada y a su turno/sucursal, y mostrar disponibilidad reservable antes de confirmar.
- Añadir pagos combinados y abonos, cálculo visible del saldo, borradores persistentes en espera y recuperación idempotente de una orden abierta.
- Crear turnos de caja: apertura con fondo, ingresos/retiros autorizados, cierre, conteo declarado, diferencia y revisión de responsable.
- Conectar devoluciones, anulaciones y notas de crédito operativas con su venta original; registrar motivo, aprobación y restablecimiento de stock cuando corresponda.
- Mantener separado el recibo interno del comprobante tributario. La emisión fiscal requiere alcance y proveedor de Ecuador confirmados.

**Cierre:** una asesora completa una venta con varios productos, cliente y uno o varios pagos; caja, saldo de cliente y stock quedan consistentes aunque haya reintentos; los borradores se recuperan entre dispositivos y no alteran stock; una devolución no borra la venta original.

### Fase 4 — Escaneo, ubicaciones y preparación de pedidos

- Añadir SKU/código de barras o QR; priorizar lector USB como teclado y habilitar cámara solo con permiso y compatibilidad confirmada.
- Registrar ubicaciones de bodega y guiar recepción, traslado, conteo, picking, empaque y entrega.
- Añadir lotes o series únicamente a los artículos que realmente los requieran, con reglas de captura por tipo.
- Permitir preparación individual, por varias órdenes o por lotes; reservar cantidades y registrar sustituciones/faltantes con autorización.

**Cierre:** el escaneo identifica el artículo correcto; cada movimiento registra origen/destino, actor, cantidad y documento relacionado; una orden no se marca entregada si quedan líneas pendientes.

### Fase 5 — CRM, clientes y cotizaciones conectadas

- Unificar cliente, solicitud pública, oportunidad, cotización, venta y seguimiento en una ficha con historial y permisos.
- Definir etapas y responsables, recordatorios y motivos de pérdida; evitar duplicados con reglas revisables.
- Convertir una cotización aceptada en orden sin volver a digitar cliente ni artículos; conservar versiones, vencimiento y aprobación de descuentos.
- Mostrar actividad y métricas por fuente, estado y responsable; limitar datos personales a quienes los necesitan.

**Cierre:** una solicitud puede recorrerse hasta cotización y venta con un mismo identificador y sin registros duplicados; las métricas coinciden con los documentos fuente.

### Fase 6 — Producción, calidad y mantenimiento

- Definir listas de materiales/recetas versionadas por producto o tipo de trabajo, con consumos planificados separados de consumos reales.
- Enlazar ventas aprobadas con órdenes de producción, áreas, responsables, fechas, entregas parciales y tiempos.
- Añadir puntos de control de calidad, rechazo/retrabajo y motivo; solo consumos reales aprobados descuentan inventario.
- Mantener equipos, mantenimiento preventivo y registro de fallas si el equipo confirma responsables y frecuencias.

**Cierre:** cada trabajo deja trazabilidad de insumos planificados/usados, responsables, calidad y entregas; cambios de receta no alteran órdenes ya iniciadas.

### Fase 7 — Caja, contabilidad gerencial e indicadores

- Conciliar ventas, pagos por método, abonos, saldos por cobrar, devoluciones, caja y depósitos.
- Construir reportes de ventas, margen, rotación, consumo, quiebres, reposición, tiempos de producción y desempeño comercial con definiciones visibles.
- Incorporar costos históricos y costos de producción confirmados; permitir filtros por fecha, sucursal, familia, asesor y canal.
- Validar con el responsable contable políticas de impuestos, documentos, cierres y exportaciones antes de usarlos para decisiones contables oficiales.

**Cierre:** totales de los paneles se reconcilian con ventas, movimientos y pagos fuente; las métricas indican periodo, moneda, fórmula y calidad del dato.

### Fase 8 — Fidelización y pedidos desde la web

- Definir con el negocio reglas de puntos, descuentos, cupones, vigencia, acumulación y autorización; no activar beneficios con condiciones supuestas.
- Publicar catálogo con disponibilidad y precios aprobados, solicitud/pedido, retiro o entrega según operación confirmada.
- Sincronizar estado de pedido, cliente y pagos con POS, CRM e inventario; impedir vender cantidades que no pueden reservarse.

**Cierre:** un pedido iniciado en web se sigue desde operaciones hasta entrega y se refleja igual en cliente, venta, cobro y stock; reglas promocionales tienen vigencia y registro de aprobación.

### Fase 9 — Modo sin conexión y endurecimiento

- Después de estabilizar los flujos en línea, diseñar una cola local cifrada o protegida, con identificador idempotente, orden de operaciones, reintentos y estado visible.
- Definir qué acciones pueden operar desconectadas y cuáles deben bloquearse (por ejemplo, disponibilidad en tiempo real o pagos externos no confirmados).
- Simular desconexiones, duplicados, sesión vencida, conflicto de stock y recuperación; no presentar datos locales como sincronizados.
- Revisar alertas de errores, latencia, permisos, respaldos y recuperación antes de habilitar a todo el equipo.

**Cierre:** ninguna operación se pierde o duplica; el usuario ve pendiente, sincronizado o requiere revisión; las decisiones con conflicto quedan auditadas y no cambian stock silenciosamente.

## Reglas de salida de cada entrega

1. Acordar la regla de negocio y los campos antes de migrar; valores desconocidos siguen marcados como pendientes.
2. Implementar migración compatible y segura, protegerla con permisos/RLS y mantener secretos fuera del repositorio.
3. Terminar la interfaz de escritorio y móvil en la misma fase, incluidos carga, vacío, error y permisos insuficientes.
4. Comprobar el flujo de extremo a extremo con datos de prueba identificables; no introducir ventas, saldos o clientes ficticios en producción.
5. Actualizar guía de operación, changelog, contexto del proyecto y estado del despliegue; revisar el resultado en Vercel.

## Secuencia inmediata recomendada

1. Completar Fase 0 con revisión real en teléfono, tableta y escritorio.
2. Continuar Fase 1: revisar las filas importadas, confirmar variantes y completar conteos físicos aprobados. En la base siguen pendientes las 749 filas fuente y las existencias activas no tienen saldo contado.
3. Revisar esta Fase 2 con una cuenta autorizada y verificar el flujo completo de borrador, envío y recepción parcial/final sin crear compras reales.
4. Continuar con el POS de mostrador de la Fase 3: cajero, ventas en espera y recuperación, usando la compra/inventario conectados.

La duración y las fechas de cada fase quedan sin fijar hasta definir quién aprobará conteos, compras, reglas de caja y criterios contables; el alcance técnico y los cierres sí quedan establecidos aquí.
