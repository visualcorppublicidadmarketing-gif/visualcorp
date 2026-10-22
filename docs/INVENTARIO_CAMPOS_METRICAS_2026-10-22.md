# Ampliación del inventario: ficha, reservas y métricas

**Fecha:** 22 de octubre de 2026
**Proyecto:** `apps/visualcorp-suite`
**Supabase:** VISUAL (`iomdmclkimfmvlzcrkyz`)
**Migraciones:** `20261022174504_inventory_catalog_metrics.sql`, `20261022180025_inventory_metrics_fk_indexes.sql`

## Campos y vistas

- **Tipo, tags, imagen de referencia y datos adicionales:** se guardan por artículo en `inventory_items`. El campo `custom_fields` acepta un objeto JSON para atributos futuros sin alterar el esquema por cada nueva métrica. La ficha se edita desde la tabla o desde tarjetas.
- **Fecha de abastecimiento:** se obtiene del último movimiento `receipt`; no se copia una fecha inventada desde la hoja ni se usa una fecha de conteo como fecha de compra. Los días se calculan con esa última entrada y se muestran como “Sin registro” cuando no existe.
- **Estado:** `Sin conteo` si aún no existe saldo físico; `Agotado` cuando el conteo registrado es cero; `Reponer` cuando el saldo positivo está en o debajo del mínimo; `En stock` cuando supera el mínimo.
- **Uso y artículos más utilizados:** el panel muestra consumo de 30 días e histórico, sumando salidas por consumo, venta y merma. El origen son movimientos registrados; el dashboard no transforma las 749 filas pendientes de conciliación en usos.
- **Reservas:** `inventory_stock.reserved_quantity` guarda unidades reservadas por variante, sucursal y ubicación. Una RPC valida permiso y saldo, conserva auditoría y no permite reservar más que el stock contado. La disponibilidad es stock físico menos reserva; el POS utiliza esa disponibilidad para confirmar o generar un faltante urgente.
- **Precios:** se conserva el costo unitario privado actual con proveedor opcional. Los cambios se guardan en `inventory_item_cost_history`; solo propietario, administración y gerencia pueden consultar los importes e historial.
- **Filtros y modos:** tabla, tarjetas y métricas; búsqueda por artículo, código o tag; filtros por sucursal, área, tipo, estado y tag.

## Estado de los datos al aplicar la migración

- La tabla contiene 70 artículos sugeridos con sus identificadores. En la consulta de aplicación había **0 filas de stock físico**; por eso el estado es pendiente de conteo, no cero unidades disponibles ni agotado.
- Las 749 filas importadas permanecen en revisión. No se asignaron cantidades, fechas de compra, proveedores, fotos ni precios a partir de celdas ambiguas.
- La fecha de última compra, el uso, la reserva y el valor de stock aparecen cuando existan movimientos, conteos, reservas o costos confirmados.
- La imagen es opcional y se captura como referencia pública; el sistema no asigna automáticamente imágenes del catálogo a artículos por similitud de nombre.

## Seguridad y límites

- Las tablas de auditoría tienen RLS. La vista `inventory_stock_metrics` usa `security_invoker` para respetar las políticas de las tablas base.
- Se añadieron índices de las claves foráneas nuevas y de las bitácoras/importaciones de inventario que el asesor de rendimiento señaló.
- La función `set_inventory_reservation` requiere sesión y valida rol, organización, sucursal, existencia contada y cantidad máxima.
- El asesor de Supabase puede marcar esta RPC como `SECURITY DEFINER` accesible a autenticados; su ejecución se limita a `authenticated`, no a `anon`, y valida permisos dentro de la función.
- El historial de costos registra cambios futuros; no reconstruye precios anteriores a la migración.

## Publicación

Commit `483136c7d380eeb8a0532b6ef05f575d35658a81` publicado en `main`; GitHub reportó el despliegue Vercel exitoso. `/operaciones/inventario` respondió HTTP 200 y el paquete servido contiene el catálogo de inventario, las reservas y las métricas.
