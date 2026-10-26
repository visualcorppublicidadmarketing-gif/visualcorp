# Inventario: benchmark y criterios de diseño

**Fecha de consulta:** 26 de octubre de 2026
**Alcance:** patrones de producto y criterios aplicados al inventario de Visual Corp Suite. La documentación consultada orienta la interfaz; no confirma políticas comerciales ni sustituye la conciliación física.

## Referencias revisadas

- [Square: transferir stock entre ubicaciones](https://squareup.com/help/us/en/article/8254-transfer-stock-between-locations-with-square-for-retail): origen y destino explícitos, cantidad, permiso para operar y consulta posterior del historial.
- [Zoho Inventory: operaciones entre bodegas](https://www.zoho.com/us/inventory/help/warehouses/warehouse-operations.html): saldo por bodega y órdenes de transferencia.
- [Zoho Inventory: crear una transferencia](https://www.zoho.com/us/inventory/kb/warehouses/transfer-order-create.html): SKU/artículos, origen, destino, cantidad, motivo y diferencia entre movimiento inmediato y mercancía en tránsito.
- [Zoho Inventory: conteos físicos](https://www.zoho.com/inventory/help/items/stock-counting.html): conteos por ubicación, asignación de persona y revisión de diferencias.
- [Odoo: reglas de reposición](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html): mínimos y máximos separados de las decisiones de compra.
- Referencias visuales encontradas: [lista de inventario de LAMA ERP](https://lama-erp.com/assets/img/screen-stock.png), [resumen de existencias de Cleverence](https://kb.cleverence.com/assets/images/stock-overview-8ebf9b2323dc7a8f2e8b092747a60296.png), [lista multi-bodega mostrada en resultados visuales](https://softwarehouseworld.com/products/zoho-pos) y [panel multi-almacén de WareView](https://www.kinimatic.com/platform). Se usan como referencias de composición, no para copiar su identidad visual.

## Qué debería mostrar y controlar

1. **Identidad:** artículo, SKU/código único, variante, categoría, unidad de medida e imagen de referencia cuando aporte reconocimiento.
2. **Dónde está:** marca/inventario, sucursal, bodega o ubicación y área. El total general debe sumar ubicaciones sin perder el detalle de dónde está cada saldo.
3. **Cuánto hay:** cantidad física, reservada y disponible, con sus definiciones; mínimo configurado; estado legible y fecha del último movimiento. Un artículo sin conteo debe permanecer como pendiente, no convertirse silenciosamente en cero.
4. **Trazabilidad:** entradas, consumo/salidas, ajustes justificados y transferencias con origen, destino, cantidad, responsable, motivo, fecha y referencia. Corregir mediante movimientos compensatorios; conservar el historial.
5. **Calidad operativa:** permisos de edición, errores visibles, validación de saldo en servidor, reintentos idempotentes, unidades decimales según producto y filtros que distingan sucursal, categoría y estado.
6. **Trabajo físico:** conteo por ubicación, revisión de diferencias y registro de quién contó. Para artículos con lote, serie o vencimiento, capturar esos datos solo cuando el material realmente lo requiera.
7. **Reposición:** alertas basadas en mínimos configurados. No generar compras automáticas sin consumo fiable, plazos confirmados y reglas aprobadas.

## Recomendaciones aplicadas a esta mejora

- Mostrar **General**, **Visual** y **Giga** como vistas relacionadas: General agrega; Visual y Giga separan los artículos. El inventario existente se considera Visual por defecto; Giga parte vacío hasta ingresar sus artículos.
- Mantener artículo, variante y saldo como conceptos separados. Cambiar de sucursal mueve saldo y deja historial; no duplica el artículo ni cambia su marca.
- Usar una búsqueda única y filtros por sucursal, categoría, área, tipo, etiqueta y estado. Sugerir categorías ya usadas al ingresar y permitir escribir otra cuando sea necesaria.
- Hacer visible el control para mover entre sucursales y conservar la validación transaccional ya existente para disponibilidad, sucursal y auditoría.
- Mantener conteo pendiente y filas fuente importadas fuera del stock activo hasta conciliación; una imagen de catálogo solo sirve de referencia visual.

## Riesgos que el código debe seguir evitando

- Confundir cantidad física con disponible cuando hay reservas.
- Permitir saldos negativos por concurrencia o duplicar movimientos por reintento.
- Tratar movimiento entre sucursales como cambio de texto de ubicación, sin salida y entrada auditables.
- Suponer conversiones entre unidades, lotes o largos de rollo que no se han confirmado.
- Convertir automáticamente datos importados, mínimos o sugerencias en órdenes de compra.
- Ocultar filtros activos o presentar totales de una sola ubicación como saldo general.
