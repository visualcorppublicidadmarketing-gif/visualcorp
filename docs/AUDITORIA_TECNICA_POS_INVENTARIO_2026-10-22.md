# POS e inventario conectados

**Fecha:** 22 de octubre de 2026  
**Proyecto:** `apps/visualcorp-suite`  
**Supabase:** VISUAL (`iomdmclkimfmvlzcrkyz`)  
**Alcance:** integración técnica de POS, clientes, pagos y existencias. No valida políticas contables, tributarias ni cantidades físicas.

## Decisiones confirmadas

- El artículo se reserva/descuenta al confirmar la orden, aunque quede saldo pendiente.
- Si falta stock, la asesora puede confirmar y debe quedar visible la compra urgente pendiente.
- Hasta cotejar productos y variantes, solo los vínculos configurados explícitamente entre catálogo, variante, sucursal y ubicación afectan stock. Los artículos no vinculados no alteran existencias.
- Las unidades fraccionadas se mantienen deshabilitadas en POS hasta comprobar conversiones por familia.

## Cambios aplicados

- `/operaciones/pos` usa la RPC transaccional `create_pos_sale_idempotent`; guarda orden, cliente, líneas, pagos iniciales y movimientos de salida en una única transacción.
- La clave idempotente permite reintentar sin duplicar una venta. El servidor bloquea la variante durante la validación de saldo para evitar consumir dos veces la última unidad.
- `catalog_inventory_links` permite configurar vínculos explícitos desde Inventario. No se generaron vínculos automáticos por nombre.
- Cuando el saldo físico es insuficiente, el servidor registra la cantidad atendida y el faltante como compra urgente. Las filas de importación no cotejadas no se promueven a saldo.
- POS asocia clientes existentes o crea nuevos al confirmar una orden. El teléfono se usa para buscar un cliente existente antes del alta.
- Los pagos iniciales se registran en `sale_payments`; se muestra abonado y saldo. `record_sale_payment` permite agregar abonos con clave de reintento y evita exceder el saldo.
- Los productos catalogados sin vínculo físico siguen siendo conceptos sin control de stock. El POS no emite comprobantes tributarios.
- Las migraciones `20261022172435`, `20261022172638`, `20261022173445` y `20261022173630` quedaron registradas en Supabase y archivadas con esos mismos nombres en el repositorio.

## Verificación remota

- Supabase confirma las migraciones de venta idempotente, índices y pagos posteriores.
- El asesor de seguridad señala RPC `SECURITY DEFINER` que pueden ejecutar usuarios autenticados. Las funciones incorporadas validan sesión y rol/sucursal dentro de la función; los avisos siguen visibles para revisión y no se deben confundir con una auditoría independiente de seguridad.
- El asesor de rendimiento no señala claves foráneas sin índice en la comprobación directa; mantiene recomendaciones informativas previas sobre otras tablas e índices no usados.
- No se crearon ventas, abonos, clientes ni vínculos de inventario durante esta implementación. Los datos operativos existentes no fueron convertidos.

## Pendientes operativos

1. Contar físicamente y conciliar las filas importadas por lote antes de considerar saldos disponibles.
2. Crear vínculos catálogo-variante únicamente con equivalencias verificadas, por sucursal y ubicación.
3. Revisar roles y probar acceso permitido/denegado con cuentas reales del equipo.
4. Acordar y luego implementar turnos/cierre de caja, devoluciones, anulaciones, órdenes de producción y transferencias con tránsito/recepción parcial.
5. Verificar unidades y conversiones para habilitar cantidades fraccionadas con precisión.
6. Conectar las cotizaciones internas al backend central; actualmente continúan en almacenamiento local.
7. Realizar un ensayo controlado con caja y bodega: stock suficiente, faltante, doble envío, interrupción, abono y dos ventas concurrentes.

## Estado de publicación

La compilación local de producción pasó. El commit `5a6cfef` está publicado en `main`; GitHub reportó que Vercel completó el despliegue. La ruta de POS en producción respondió con el acceso interno y el archivo JavaScript público contiene `record_sale_payment`, `catalog_inventory_links` y los mensajes de órdenes urgentes. La página interna requiere iniciar sesión con una cuenta autorizada para ver el panel.
