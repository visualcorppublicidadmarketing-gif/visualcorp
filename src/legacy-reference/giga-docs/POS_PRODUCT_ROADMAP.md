# POS Gigaprint — Criterios de producto y hoja de ruta

## Implementado en esta etapa

- Búsqueda aproximada de clientes desde nombre, cédula/RUC o teléfono.
- Selección con teclado y vínculo estable entre la venta y el cliente del CRM.
- Alta automática de clientes nuevos al confirmar una venta, sin duplicar coincidencias exactas.
- Actualización de compras acumuladas y cantidad de órdenes del cliente.
- Dirección y enlace de Google Maps para instalaciones.
- Mapa incrustado y acceso a navegación desde la orden de trabajo.
- Índices PostgreSQL para búsqueda rápida por nombre, identificación y teléfono.

## Próximas mejoras estándar prioritarias

1. **Identidad única y deduplicación asistida.** Alertar posibles duplicados y permitir fusionarlos conservando órdenes, cartera y actividades.
2. **Fecha promesa calculada.** Proponer una fecha real según materiales disponibles, tiempos de cada operación y capacidad de máquinas/personas.
3. **Costeo por trabajo.** Separar ingreso, materiales, horas, tercerización, instalación y merma para mostrar margen previsto y real.
4. **Reserva de inventario.** Reservar sustratos al aprobar la orden y descontar existencias reales al terminar la operación.
5. **Aprobaciones y excepciones.** Solicitar autorización para descuentos, ventas bajo costo, crédito excedido o entrega con saldo pendiente.
6. **Cotización a venta sin recaptura.** Mantener cliente, versiones, precios, archivos, aprobación y trazabilidad al convertir una cotización.
7. **Auditoría de acciones.** Registrar quién cambió precios, fechas, responsables, pagos, descuentos y estados.
8. **Operación offline robusta.** Añadir idempotencia, control de versiones y resolución visible de conflictos al sincronizar.

## Ventajas diferenciales recomendadas

- **Recompra inteligente:** sugerir al asesor los productos, medidas y acabados frecuentes del cliente.
- **Motor de rutas productivas:** generar automáticamente operaciones, dependencias y responsables según el producto compuesto.
- **Instalaciones geográficas:** agrupar montajes cercanos, calcular tiempo de traslado y crear rutas diarias para cuadrillas.
- **Prueba de entrega:** fotos, firma, ubicación y hora asociadas a la orden antes de marcarla entregada.
- **Asistente de margen:** sugerir alternativas de material o acabado cuando una configuración no alcanza el margen mínimo.
- **QR viajero:** un código por orden o bulto para abrir checklist, archivos, estado y siguiente operación desde el taller.

## Regla arquitectónica

Supabase es la fuente global; el almacenamiento local mantiene continuidad operativa. Toda mutación debe ser idempotente, auditable y sincronizable. Los permisos deben validarse en interfaz y en RLS/RPC, nunca solo en botones.
