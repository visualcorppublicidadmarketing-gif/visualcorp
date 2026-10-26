# Fases operativas conectadas

**Fecha:** 22 de octubre de 2026  
**Proyecto:** Visual Corp Suite  
**Ruta interna:** `/operaciones/flujos`

**Publicación comprobada:** commit `3365e65c4e20ac3f22a08d1f17e44668130c51e9`; Vercel producción `READY`; la ruta devolvió HTTP 200. El contenido operativo requiere iniciar sesión.

Se completó la primera implementación integrada de los cinco flujos que estaban pendientes. Los cambios quedaron en migraciones de Supabase y en la app web; las operaciones conservan actor, fecha, sucursal y referencia. No se generaron operaciones de prueba ni se alteraron saldos físicos.

## Caja y cierres

- Apertura de turno por usuario y sucursal, con fondo inicial.
- Los pagos en efectivo de POS quedan vinculados al turno abierto de quien cobra.
- Entradas y retiros manuales requieren permisos administrativos y motivo.
- El cierre calcula efectivo esperado, contado y diferencia; conserva actor, hora y nota.
- Un usuario puede cerrar su propio turno; administración puede cerrar turnos de otros.

## Devoluciones y anulaciones

- Devoluciones parciales se enlazan a la venta y a sus líneas; el servidor impide devolver más unidades de las atendidas.
- Se elige el destino: reintegrar como vendible, separar para revisión o registrar como merma. Solo el primer destino aumenta stock.
- La anulación completa registra las unidades aún atendidas y no devueltas como reintegro; marca la venta como cancelada.
- El importe y método de reembolso se registran aparte. Un responsable marca el reembolso como completado luego de verificar el pago real; no hay integración bancaria ni movimiento automático de dinero.

## Transferencias entre sucursales

- Solicitud atómica entre sucursales, artículo/variante y ubicaciones de origen y destino.
- Roles autorizados pueden aprobar/rechazar y bodega/administración puede despachar y recibir.
- El despacho reduce stock de origen. La recepción añade solo la cantidad efectivamente recibida.
- Acepta recepciones parciales; el saldo enviado que falta permanece en tránsito hasta completar su recepción.
- Eventos y notas guardan el historial. La recepción no supera el despacho y el despacho no supera lo solicitado ni la existencia de origen.

## Órdenes de producción

- Orden con sucursal, área, prioridad, fecha prevista, estado y responsable que la crea.
- Estados: cola, en proceso, bloqueada, control de calidad, lista, completada o cancelada.
- Consumo de insumos se registra por material, cantidad y orden, y descuenta del inventario solo cuando se confirma el consumo real.
- No hay lista de materiales ni consumo automático: requiere definir recetas y cantidades por producto antes de automatizarlo.

## Cotizaciones centrales y POS

- El cotizador interno escribe en `central_quotes` y muestra un historial compartido con estados e imágenes de referencia.
- Conserva las tres alternativas de precio, opción seleccionada, artículos, cantidades, cliente, confirmación y notas.
- Una cotización aceptada, con tarifa confirmada, puede seleccionarse en POS; la conversión exige que total y precio coincidan y queda enlazada a la venta.
- El teléfono normalizado puede asociar la propuesta a un cliente existente; no se crean clientes solo por cotizar.

## Seguridad, límites y verificación

- Las RPC validan autenticación, rol y alcance de sucursal dentro de la base; las tablas nuevas tienen RLS.
- Supabase sigue mostrando avisos para funciones `SECURITY DEFINER` ejecutables por usuarios autenticados. Es el patrón usado para estas RPC: las funciones validan internamente permisos y sucursal. No equivale a auditoría de penetración.
- El asesor de rendimiento informó inicialmente claves foráneas sin índice por orden de columnas; se añadió la migración `20261022183221_lifecycle_fk_indexes`. Persisten hallazgos informativos en tablas existentes y advertencias de políticas RLS permisivas que requieren revisión aparte.
- Compilación de producción de Vite: correcta. Tamaño del JS principal: 618 kB minificado, con advertencia de paquete mayor a 500 kB.
- No se generaron ventas, cierres, devoluciones, transferencias, órdenes ni cotizaciones ficticias en producción. Las pruebas de aceptación con cuentas reales y cantidades verificadas quedan para el equipo.
- No emite comprobantes tributarios ni ejecuta reembolsos externos. Las reglas contables, tolerancias de caja y consumos estándar de materiales necesitan confirmación de la empresa.

## Seguimiento de producción y arqueo ciego — 26 de octubre de 2026

Estado: mejora implementada en `codex/operations-flows-next-20261024`; sus migraciones quedaron aplicadas en Supabase el 26 de octubre de 2026. Las órdenes ahora aceptan instrucciones, asignación, fecha, prioridad y próximo paso; la edición del traspaso registra un evento atómico, controla membresía activa de la sucursal y conserva actor/nota. La venta vinculada expone el acceso a la ficha CRM. El tablero filtra por estado operativo, fecha y sucursal; el estado crítico requiere nota. La pantalla de caja oculta el efectivo esperado antes del recuento y deja que el servidor calcule el cierre. El código queda listo para publicación tras integrar la rama actualizada.

La migración `20261026140932_production_handoffs.sql` incorpora `next_step`, auditoría y validación de responsables; se verificó en el historial de Supabase. POS y Finanzas ya cuentan con recorridos y reportes conectados; en este hito se protegió el conteo ciego y se añadió su priorización de operaciones, sin alterar políticas contables, ventas o datos.

## Concurrencia de pago y cierre de caja — 26 de octubre de 2026

Se actualizó `app_private.attach_open_cash_session()` para bloquear la fila de la caja abierta al asociar un pago en efectivo. `close_cash_session` ya bloquea esa misma fila antes de calcular el esperado: si el pago obtiene el bloqueo primero, queda incluido en el cierre; si el cierre lo obtiene primero, el pago espera y luego se rechaza con una indicación para actualizar y abrir otro turno. Los pagos no efectivos limpian cualquier asociación a caja. La migración `20261026140939_cash_payment_close_lock.sql` quedó aplicada y verificada; no se modificaron ventas, cierres ni saldos reales.

## Acceso y guía de cierre de caja en Flujos y POS — 26 de octubre de 2026

Flujos → Caja incorpora una guía desplegable en tres pasos, un enlace al campo de recuento y validación de montos no negativos para apertura y cierre. POS presenta un acceso directo a Caja para abrir el turno o cerrarlo cuando ya está abierto. La guía toma como referencia Collapsible y Alert de shadcn/ui; la entrada breve se inspira en Blur Fade de Magic UI, implementada con CSS y respeto a `prefers-reduced-motion`. `npm run build:checked` y `git diff --check` pasan. El enlace productivo solicitado pidió acceso con Google, así que la vista autenticada no se pudo comprobar; el cambio permanece local y no se publicó.

### Caja: señales de estado y arqueo — 2026-10-26

- La vista de Caja ahora comunica el estado del turno con texto, icono y distintivo; presenta el recorrido Abrir → Contar → Conciliar; da prioridad al importe contado y al control de cierre; y separa la apertura, los movimientos de gestión y el historial. El historial diferencia un cuadre exacto de una diferencia con etiquetas legibles. Se conserva la guía desplegable y el arqueo ciego.
- Interfaz responsive con animación breve existente y soporte para `prefers-reduced-motion`. Los cambios son locales en `src/pages/operations/OperationsLifecycle.tsx` y `src/pages/operations/operations-lifecycle.css`.
- Verificación local: `npm run build:checked` y `git diff --check` correctos. La vista autenticada no quedó disponible en el servidor local durante esta revisión. No se ejecutaron pagos ni cierres reales.
