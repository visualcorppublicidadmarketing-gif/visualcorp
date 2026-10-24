# Inventario y consumo automático desde el POS

## Qué se registra

- Un producto vendido descuenta existencias cuando tiene un vínculo explícito en `Productos de venta vinculados a stock`.
- Los ojales pequeño y grande del catálogo se preparan como existencias por unidad en la sucursal Visual Corp y quedan vinculados a su variante de inventario. La migración no crea saldo físico: el conteo guiado debe confirmar cuánto hay.
- El POS informa en cada línea si se descontará stock, si falta el vínculo o si el conteo sigue pendiente. Los artículos sin conteo o con saldo insuficiente solicitan confirmación y el faltante se marca como compra urgente.
- Si se intenta vender un ojal sin vínculo de inventario en la sucursal elegida, el POS bloquea la confirmación para evitar una venta que no pueda actualizar su existencia.
- Una receta vincula un producto a uno o más materiales. `Por unidad facturada` multiplica la cantidad de la línea por el factor configurado. `Área a metros lineales` convierte los m² facturados según el ancho de la variante del rollo y aplica únicamente el desperdicio configurado.
- Los movimientos confirmados quedan en el kardex con referencia a la venta. Si falta material y POS permite continuar, la parte disponible se descuenta y el faltante queda como compra urgente.
- Guardar una orden en espera no reserva ni descuenta inventario. Confirmar la venta sí activa los vínculos y recetas.
- Si se cancela la venta o la orden de producción, las reservas y los faltantes pendientes se liberan; lo que ya se consumió en producción queda registrado como consumo real.

## Preparación requerida

1. Integrar el cambio de aplicación y cotejar las migraciones pendientes del proyecto Supabase.
2. Aplicar la migración de variantes de rollo de 107, 127 y 310 cm antes de configurar recetas para área; aplicar después `inventory_pos_material_consumption`.
3. Confirmar físicamente ojales, viniles y lonas por variante, sucursal y ubicación desde el recorrido de conteo. Sin ese paso no se debe tratar un saldo como disponible.
4. En `Operaciones → Inventario`, revisar los vínculos automáticos de ojales y crear los que falten para los otros productos vendibles. Configurar solo factores de consumo conocidos. El desperdicio queda en cero mientras no haya una cifra confirmada.
5. Hacer una venta controlada después de aplicar el esquema y comprobar en el kardex el descuento, la referencia de venta y cualquier faltante.

## Límite de los acabados variables

Los ojales agregados como línea de producto con una cantidad elegida por la asesora usan el vínculo directo y se descuentan como unidades. Escribir “con ojales” en una nota o elegir una opción que solo cambia el precio no genera por sí solo una cantidad de material. Para automatizar un acabado incluido dentro de una lona, el POS debe capturar la cantidad de ojales —o calcularla desde las medidas y la separación acordada— como dato explícito de la línea.

## Límite de la imagen

La imagen de ojales es una referencia generada para identificar el artículo. No confirma material, tamaño físico, acabado, marca ni existencia real.

## Estado

Preparado localmente el 24 de octubre de 2026. La interfaz y la migración aún requieren integración/aplicación antes de operar en producción. No se crearon conteos físicos ni ventas de prueba.
