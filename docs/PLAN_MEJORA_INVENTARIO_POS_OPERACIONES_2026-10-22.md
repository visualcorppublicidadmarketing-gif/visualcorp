# Plan integral de mejora operativa: inventario, POS y flujos conectados

**Fecha:** 22 de octubre de 2026
**Estado:** propuesta de trabajo basada en revisión del código local; pendiente de validación por las personas que operan caja, bodega, producción y administración.
**Aplicación:** `apps/visualcorp-suite`
**No incluye:** aprobar stock, costos, tarifas, impuestos, políticas de crédito ni reglas contables/tributarias.

## 1. Objetivo

Mejorar la confiabilidad diaria desde que se recibe o compra un artículo hasta que se reserva, consume, vende, transfiere o cuenta; reducir errores de caja y hacer que cada diferencia tenga una explicación y una persona responsable.

El flujo de referencia será:

**Recepción → existencia disponible → reserva o consumo → venta/orden → cierre y conciliación → reposición.**

La app ya cubre una parte del recorrido. El plan prioriza primero calidad de datos y controles transaccionales; luego rapidez, reportes y automatización.

## 2. Estado actual observado en el código

- `InventoryWorkspace.jsx` organiza existencias por sucursal y área, muestra ubicación, unidad, cantidad, mínimo, estado, procedencia y, según acceso, costo unitario. Permite entrada, consumo/salida/merma, transferencia, edición de costo y archivo conservando historial.
- La misma pantalla advierte que las filas importadas no son stock activo hasta cotejar cantidades y variantes; hoy muestra hasta 40 pendientes en una tabla. Hay oportunidad clara para un flujo de conciliación por lote.
- El POS contiene pestañas que incluyen inventario y un carrito en estado de interfaz. Antes de definir la contabilización completa, hay que mapear con precisión qué ruta guarda venta, qué ruta modifica stock y cómo se recupera una operación interrumpida.
- Existen áreas de inventario, clientes, CRM, cotizador y producción. No asumir que un producto del catálogo comercial equivale a un SKU físico ni que todo concepto vendido controla stock.
- El estado del repositorio cambia activamente. En cada fase se vuelve a revisar el código y las migraciones actuales, preservando modificaciones de otras personas.

## 3. Principios operativos

1. **Una acción confirmada, un registro auditable.** Cada efecto de stock o caja debe tener evento, actor, hora, motivo y referencia.
2. **No corregir historia borrando.** Reversar con un movimiento compensatorio enlazado al original; artículos archivados conservan su historial.
3. **Separar catálogo de producto, variante y existencia.** SKU/variante identifica qué se controla; la existencia vive en sucursal, área y ubicación.
4. **No confundir cero, desconocido y pendiente.** Una cantidad no cotejada o tarifa no aprobada conserva su estado explícito.
5. **Impedir sobreventa según regla aprobada.** Validar disponibilidad al confirmar, no solo al agregar al carrito.
6. **Acceso mínimo necesario.** Caja ve precio de venta permitido y stock útil; costos, ajustes, anulaciones y administración se habilitan por rol y sucursal.
7. **Operar con fallos visibles.** Sin conexión, conflicto o guardado incierto no se presenta un éxito falso.

## 4. Frentes de mejora

### A. Maestro de productos, variantes y ubicaciones

- Normalizar ficha con nombre operativo, familia, SKU/código de barras, unidad base, variantes, área responsable, sucursal, ubicación física, estado activo y nivel de control (stock, bajo pedido o servicio sin stock).
- Definir unidades y conversiones con precisión: unidad, paquete, metro, m², rollo, hoja, etc. Guardar la cantidad canónica y presentar la unidad de trabajo. No convertir medidas ambiguas de importación automáticamente.
- Permitir sinónimos de búsqueda, alias históricos y código escaneable sin duplicar el artículo.
- Validar SKU único en el alcance acordado (global o por sucursal); avisar coincidencias antes de crear registros.
- Separar costo, precio de venta y tarifa cotizada; cada dato tiene moneda, vigencia, fuente, quién confirmó y permisos propios.
- Mantener historial de cambios de ficha y archivar en vez de eliminar.

**Resultado esperado:** una búsqueda identifica el mismo artículo en POS, recepción, inventario y orden de producción.

### B. Conciliación de importaciones

Convertir las filas pendientes en un asistente por lote:

1. Revisar archivo, hoja, fila original y dato textual recibido.
2. Emparejar con artículo/variante o marcar como nuevo / no identificable / duplicado.
3. Elegir unidad, sucursal, área y ubicación con valores confirmados.
4. Registrar conteo físico inicial por persona responsable; mostrar cantidad importada y cantidad observada lado a lado.
5. Revisar diferencias y aprobar el saldo inicial con comentario.
6. Emitir lote de movimientos iniciales con origen, importación y aprobador; mantener las fuentes originales intactas.

No activar automáticamente cantidades de hojas antiguas. Cada lote ofrece avance, errores y reporte descargable; las filas rechazadas permanecen recuperables.

### C. Movimientos y ciclo de inventario

Estandarizar movimientos: recepción, devolución, consumo de producción, venta, merma, ajuste por conteo, transferencia enviada/recibida, reserva/liberación. Cada movimiento incluye cantidad positiva, tipo, unidad, origen/destino, actor, fecha, motivo, referencia (venta/orden/lote) y estado.

- Transferencia en dos pasos: salida de origen y recepción en destino; cantidad en tránsito claramente separada. Diferencias de recepción requieren motivo y resolución.
- Conteo físico cíclico por ubicación/categoría, captura esperada frente a observada y doble revisión para ajustes superiores al umbral que defina el negocio.
- Reservas para pedidos/órdenes aprobadas: disponible = existencia física − reservas − bloqueos. Liberar al cancelar o vencer según política confirmada.
- Alertas configurables por mínimo, sin stock, conteo vencido, lote detenido y recepción pendiente. Umbrales por artículo/sucursal con fuente y fecha de revisión.
- Para materiales por longitud/área: permitir decimales según unidad y conversión verificada; no redondear en cada movimiento.
- Búsqueda e historial desde una ficha con filtros por período, ubicación, clase, actor y documento relacionado.

### D. POS: recorrido de caja

Diseñar la venta alrededor de menos interrupciones:

1. Abrir caja/sesión con responsable y fondo inicial si el negocio confirma ese concepto.
2. Buscar/escáner de SKU, nombre o alias; mostrar variante, unidad, existencia disponible y precio autorizado.
3. Agregar cantidad, validar mínimo/decimales según el producto y advertir stock insuficiente.
4. Cliente opcional salvo cuando la regla aprobada lo requiera; evitar crear duplicados y recopilar datos innecesarios.
5. Revisar líneas, descuentos permitidos, subtotal, impuestos solo con regla confirmada, total y forma de pago.
6. Confirmar una vez; generar número de operación y recibo interno. Reintento no debe duplicar venta ni movimiento.
7. Mostrar resultado guardado, pendiente de sincronización o fallido; ofrecer reintento seguro y mantener carrito.

Funciones prioritarias: búsqueda veloz, favoritos recientes, carrito persistente ante navegación accidental, edición/eliminación de líneas antes del cobro, teclado/lector, confirmación previa a anulación, devolución enlazada a venta, impresión/descarga de comprobante interno y registro de pago dividido si se autoriza.

Separar “venta de artículo con stock”, “servicio/concepto sin inventario” y “pedido que se producirá después”. El POS no se declara facturador ni sistema contable; el comprobante y los estados deben indicar su alcance real.

### E. Caja y conciliación de pagos

Si existe caja física, incorporar sesiones por caja/turno: apertura, movimientos manuales autorizados, cobros, retiros con motivo, cierre esperado por forma de pago, monto contado, diferencia y revisión. No habilitar efectivo esperado ni cierre mientras no se confirme el proceso interno.

Pagos: guardar monto, moneda, método, referencia del proveedor cuando aplique, estado (pendiente/confirmado/rechazado/reembolsado) y actor. Evitar datos de tarjeta sensibles; procesar pagos con proveedor apropiado si se integra en otra fase.

### F. Puente POS, inventario y producción

- Definir cuándo una venta descuenta stock: al confirmar pago/venta o al reservar pedido. Elegir una regla por tipo de flujo, no inferirla en UI.
- Asociar consumo de materiales a orden de trabajo y etapa/responsable; comparar material estimado con consumo real si hay datos disponibles.
- Para producción bajo pedido, crear pedido/orden vinculada a cotización y cliente; el estado avanza sin convertirse automáticamente en venta cobrada.
- Devoluciones y cancelaciones usan eventos compensatorios y política de reposición (vendible, revisión, merma) pendiente de confirmar.
- Mostrar faltantes con sustitución o compra sugerida únicamente si existe equivalencia y proveedor aprobados.

### G. Reportes y control de gestión

Panel por permisos con fecha, alcance, filtros y explicación de cada indicador:

- Existencia disponible, reservada, en tránsito y pendiente de verificar.
- Valor de inventario solo para roles autorizados y solo cuando costo vigente esté validado; identificar faltantes de costo.
- Rotación, días sin movimiento, mínimos, mermas, ajustes, diferencias de conteo y exactitud de stock.
- Ventas por período/forma de pago/producto/sucursal, devoluciones, anulaciones, descuentos y diferencias de caja.
- Margen únicamente si costo/precio, vigencia, impuestos y costos asignados están confirmados; de lo contrario no estimar rentabilidad.
- Exportaciones con filtros aplicados, fecha, usuario y rótulo de datos pendientes. CSV/XLSX protegidos según roles.

No usar reportes como evidencia contable/tributaria sin validación profesional y fuente oficial.

### H. Acceso, trazabilidad y confiabilidad

- Revisar roles actuales y permisos de servidor/RLS: asesor/caja, bodega, producción, responsable de sucursal, administración y consulta. Separar permisos de lectura de costos y de movimiento de stock.
- Auditar en servidor acciones sensibles: ajuste, transferencia, cierre, anulación, devolución, costo, tarifas y cambios de permisos.
- Idempotencia para registrar venta/movimiento, transacción atómica entre venta y descuento de stock, bloqueo o control de concurrencia en existencias.
- Estado de sincronización visible, reintento con idempotency key, detección de conflictos y respaldo/restauración ensayados.
- Verificar aislamiento por sucursal/rol con casos de acceso permitido y denegado. Nunca confiar solo en ocultar botones.
- Retención y datos personales (teléfono, notas, correo) minimizados; documentar acceso y exportación.

## 5. Secuencia por fases

### Fase 0 — Mapa operativo y reglas

Entrevistas breves con caja, bodega, producción y administración; seguir una venta real de inicio a cierre, recepción, transferencia, conteo y devolución. Dibujar los flujos actuales, excepciones, documentos y responsables. Acordar vocabulario, unidades, tipos de artículo y estados. Sin reglas confirmadas, usar prototipos y marcar pendiente.

**Salida:** mapa de proceso, matriz de roles, glosario y decisiones abiertas priorizadas.

### Fase 1 — Datos y conciliación

Revisar artículos duplicados, unidades, sucursales, filas importadas y sus procedencias. Diseñar ficha maestra, estados de verificación y asistente de saldo inicial. Aprobar conteos físicos antes de abrir stock para venta.

**Salida:** catálogo normalizado revisable y lotes de apertura aprobados; fuentes originales conservadas.

### Fase 2 — Libro de movimientos fiable

Definir esquema y reglas de saldo; probar entradas, consumo, transferencia, recepción, ajuste y reverso. Añadir idempotencia, permisos, actor, razón y consulta de historial. Validar atomicidad cuando venta y stock interactúan.

**Salida:** cada saldo se reconstruye desde eventos trazables y conciliables.

### Fase 3 — POS de ventas

Crear flujo de búsqueda, carrito, confirmación y recibo; definir servicio vs inventario vs pedido. Añadir recuperación de carrito, acceso rápido y reintento seguro. Migrar primero a un grupo piloto/caja controlada.

**Salida:** recorridos de venta sin duplicados y con stock coherente en los casos aprobados.

### Fase 4 — Caja, devoluciones y producción

Solo tras aprobar políticas: sesiones, cierre, conciliación, devolución, reserva y consumo ligado a órdenes. Incorporar manejo de diferencias y revisión autorizada.

**Salida:** operación de punta a punta con responsables y estados definidos.

### Fase 5 — Reportes, adopción y mejora

Paneles, alertas configurables, reportes y exportaciones; capacitar por rol; registrar incidencias y mejorar con datos de uso reales. Expandir sucursal/área gradualmente y mantener soporte de reversión.

**Salida:** indicadores confiables, adopción registrada y backlog priorizado.

## 6. Prioridad sugerida

**P0 — antes de confiar en saldos/ventas:** cotejar importación; separar existencia confirmada de pendiente; identificador único; permisos por acción; trazabilidad de movimientos; confirmar disponibilidad justo al cobrar; impedir doble registro; relación venta-movimiento; recuperación de fallos.

**P1 — eficiencia cotidiana:** escaneo y alias; conteo cíclico; transferencia en tránsito; reservas; devolución enlazada; búsqueda/filtros; cierre de caja si aplica; vincular consumo con órdenes.

**P2 — análisis y automatización:** reposición sugerida; pronóstico/rotación; alertas avanzadas; integración de pagos, impresión o proveedores; analítica entre sucursales. Solo después de estabilizar datos y políticas.

## 7. Indicadores de resultado

Establecer línea base antes de fijar objetivos: exactitud de stock por conteo, tiempo medio de venta, ventas con intervención manual, operaciones duplicadas, movimientos sin motivo/referencia, diferencias de caja, merma, transferencias pendientes, filas importadas sin resolver y disponibilidad de datos sincronizados.

Tablero de seguimiento: valor inicial, objetivo acordado, período, fuente y responsable. Cada KPI debe poder explicarse y reproducirse; separar cero real de dato ausente.

## 8. Decisiones de negocio pendientes

- Unidades y conversiones válidas por familia; qué artículos llevan stock y cuáles son servicio/bajo pedido.
- Método de saldo inicial y aprobadores; umbral de doble revisión de ajustes.
- Cuándo se reserva/descuenta stock, política de stock negativo y tolerancia a fraccionamiento.
- Flujo y horarios de caja, fondo inicial, retiros, cierre, medios de pago, pagos parciales y diferencias.
- Política de devolución, reembolso, anulación, descuento y autorización.
- Sucursales activas, nombres oficiales de áreas y ubicaciones; asignación de roles por sucursal.
- Reglas de compra/reposición, proveedores y criterios; no inventar mínimos ni sugerir compra a proveedor sin dato confirmado.
- Requisitos de recibos y facturación; cualquier cumplimiento tributario necesita revisión específica.
- Plazos de conservación, exportación y acceso a información personal.

## 9. Revisión de aceptación antes de ampliar uso

Ensayar: venta con stock suficiente; stock insuficiente; artículo de servicio; venta interrumpida; doble clic/reintento; dos cajas intentando la última unidad; transferencia parcial; conteo con diferencia; devolución; tarifa/costo ausente; usuario sin permiso; pérdida de conexión y recuperación.

Para cada caso comprobar saldo, venta, actor, referencia, estado, mensajes y recuperación. No declarar listo un flujo solo porque el formulario se envía. Comparar el inventario en interfaz con los movimientos persistidos y la fuente autorizada.

## Continuidad

Objetivo: mejorar control de inventario, POS y operación conectada. Propuesta v01 basada en la estructura observada de `InventoryWorkspace.jsx`, `POSPage.jsx` y rutas de la suite. Fase vigente: plan. No se validaron políticas contables, reglas de operación ni cantidades importadas. Próximo paso: acordar procesos reales de caja y almacén, y luego priorizar P0 con el responsable de operación.
