# Contrato inicial de datos — Visual Corp

Estado: diseño de referencia; no es una migración aplicada ni una fuente de existencias vigentes.

## Dominios que deben compartir identidad y auditoría

- Empresa/espacio Visual Corp, sucursales y ubicaciones de almacenamiento.
- Usuarios autenticados, roles y permisos asignados a sucursal/área.
- Catálogo de insumos y productos terminados, categorías jerárquicas, variantes, unidades y SKU.
- Saldos de stock por artículo, variante, sucursal y ubicación; niveles mínimos/alertas.
- Libro inmutable de movimientos: recepción, ajuste/conteo, consumo, reserva, devolución, merma, venta, transferencia y recepción de transferencia.
- Solicitudes de transferencia entre Visual Corp y Gigaprint, con estados, responsables y cantidades despachadas/recibidas.
- Clientes y sus contactos, separados de la información pública.
- Ventas/POS, líneas de venta, estado, pago registrado y vínculo al cliente; toda salida de stock debe ser atómica y trazable.
- Cotizaciones públicas e internas con snapshot de precio y vigencia para conservar lo cotizado.
- Bitácora de cambios y metadatos de importación con origen, lote, fecha y resultado de conciliación.

## Reglas de integridad que debe cubrir la primera migración

- No editar saldos directamente: calcularlos desde movimientos o actualizarse con transacciones protegidas.
- Impedir stock negativo en una venta normal; permitir registrar una venta urgente pendiente de abastecimiento, sin inventarla como existencia.
- Reservar y descontar stock con una transacción/función del servidor para evitar sobreventa concurrente.
- Confirmar recepción de una transferencia por la sucursal destino y guardar diferencias entre enviado y recibido.
- Proteger costos y precios de compra mediante roles en servidor/RLS, no ocultándolos solo en la interfaz.
- RLS en todas las tablas expuestas; la web pública solo puede crear solicitudes/cotizaciones con validación y acceso de escritura limitado.
- IDs de origen estables para una migración idempotente; conservar los respaldos originales.
- Cantidades cero o especificaciones pendientes se conservan como pendientes de verificación, nunca como existencia confirmada.

## Antes de escribir SQL

Revisar con el perfil Supabase `VISUAL` el proyecto exacto, región, estado, tablas y migraciones. Hacer un respaldo de cualquier base existente. Resolver primero nombres/IDs de sucursales y áreas reales; no copiar datos de Iglesia Jerusalén o GigaPrint como si fueran datos de Visual Corp. Crear migración versionada en `supabase/migrations/`, revisar políticas y probar en un proyecto de desarrollo antes de aplicar a producción.
