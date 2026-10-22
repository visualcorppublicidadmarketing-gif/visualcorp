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
