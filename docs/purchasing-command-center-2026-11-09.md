# Compras: centro de abastecimiento

**Fecha:** 9 de noviembre de 2026

**Estado:** interfaz integrada y esquema aplicado en el proyecto de Supabase el 9 de noviembre de 2026. La publicación de la interfaz y la revisión con perfiles autenticados reales siguen pendientes.

## Referentes revisados

- [Odoo Purchase Dashboard](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/advanced/purchase_dashboard.html): filtros de periodo y proveedor, valor de órdenes, tiempos de confirmación/recepción y entrega a tiempo.
- [ERPNext: Buying](https://docs.frappe.io/erpnext/buying) y [Supplier Quotation](https://docs.frappe.io/erpnext/supplier-quotation): secuencia solicitud → cotización → orden → recepción, con comparación por proveedor.
- [Precoro Dashboards](https://help.precoro.com/dashboards): ciclo de requisiciones, seguimiento de proveedores y separación entre compras, aprobaciones y pagos.
- [shadcn Charts](https://ui.shadcn.com/docs/components/aria/chart): composición con Recharts, contenedor adaptable y `accessibilityLayer`.
- [Recharts](https://github.com/recharts/recharts): biblioteca React para gráficos; licencia MIT ([licencia](https://github.com/recharts/recharts/blob/main/LICENSE)). Se añadió `recharts` 3.10.1 para dos gráficos de tamaño moderado.
- [Magic UI](https://github.com/magicuidesign/magicui): se conservaron los contadores animados ya instalados y el estilo de Visual Corp. Los brillos de seguimiento del puntero no aportaban información a esta pantalla.
- [HeroUI Table](https://heroui.com/docs/react/components/table): referencia de accesibilidad y desplazamiento tabular; no se instaló una segunda biblioteca de componentes.
- [Airbnb visx](https://github.com/airbnb/visx): alternativa MIT de bajo nivel, compatible con React 18/19. Se descartó para esta vista porque exige componer más piezas y el proyecto necesita solo una tendencia y una comparación de proveedores.
- [Motion: reduced motion](https://motion.dev/docs/react-use-reduced-motion): la animación del gráfico respeta la preferencia del sistema.

También se consultaron los catálogos MCP de Magic UI, shadcn y HeroUI. Se eligieron patrones de paneles compactos, estados semánticos, gráfico con capa accesible y tablas dentro de un contenedor de desplazamiento. No se añadieron shadcn, HeroUI ni Magic UI como sistemas visuales completos: el repositorio ya usa CSS propio, React, Lucide y Motion; `components.json` no está configurado y combinar más sistemas aumentaría peso y mantenimiento.

## Cambios de producto

1. **Panorama de abastecimiento:** periodo configurable (30, 90, 365 días o personalizado), sucursal permitida, tarjetas de compromisos, pagos documentados con permiso de Finanzas, pendientes, vencidas y puntualidad. Incluye tendencia mensual y proveedores principales; la tabla de datos conserva una alternativa legible sin depender del gráfico.
2. **Solicitudes desde producción y asesoría:** nueva ruta `/operaciones/solicitudes-compras`, accesible por permisos de taller, ventas o compras. Una persona puede asociar materiales a sucursal, área activa y etapa de un trabajo; la solicitud no reserva stock ni crea una compra.
3. **Revisión y ofertas:** aprobación/rechazo con nota, captura manual de ofertas reales recibidas, vigencia y fecha ofrecida, precio por línea, tabla comparativa y selección explícita. La selección crea una orden en borrador. Enviar la orden es un paso separado y conserva la autorización existente.
4. **Recepción con control de calidad:** por línea se separan unidades aceptadas y rechazadas. Solo las aceptadas actualizan inventario; las rechazadas quedan auditadas con motivo y siguen pendientes para reposición o resolución. La recepción mantiene la clave de idempotencia.
5. **Avance ponderado:** el progreso de órdenes considera el costo relativo de cada línea; si no hay costos informados, se muestra el promedio por artículo con esa base declarada.

## Definición de métricas

- **Valor ordenado:** cantidades de órdenes enviadas en el periodo × costo unitario registrado. Es compromiso de compra, no un pago.
- **Pagos documentados:** movimientos de pago ligados a órdenes y registrados en Finanzas durante el periodo; solo aparece con permiso `finance.view`.
- **Pendiente de recibir:** saldo de cantidades en órdenes abiertas × costo de orden. No estima factura, transporte ni impuestos.
- **Entregas vencidas:** órdenes abiertas con fecha prevista anterior al día local de Ecuador; se reporta cantidad y saldo estimado.
- **Entrega a tiempo:** órdenes completamente recibidas con fecha prevista entre las órdenes emitidas en el periodo, comparando la recepción final con la fecha prometida. Se acompaña del tamaño de muestra; sin muestra, se muestra “—”.
- **Recibido en la tendencia:** cantidades aceptadas acumuladas de órdenes emitidas en cada mes, valorizadas al costo registrado. No significa pagos del mes ni importe facturado.
- **Plazo mediano:** días entre envío de la orden y última recepción, para órdenes completas del periodo; incluye el tamaño de muestra.

Los cálculos los hace una función SQL con filtro por organización, sucursal y permiso por registro. Las cotizaciones solo están visibles para Compras; solicitantes de taller/asesoría ven sus solicitudes sin precios de proveedor. El permiso de aprobar solicitudes no habilita pagos ni envío automático.

## Estado y siguientes comprobaciones

- Supabase registró `20261109172959_purchasing_command_center_2026_11_09` y `20261109173159_purchasing_command_center_fk_indexes`. Las tablas nuevas de solicitudes/ofertas y las tablas de recepción conservan RLS y políticas; no se cargaron registros de ejemplo.
- Después de publicar la interfaz, revisar `/operaciones/solicitudes-compras` y el panel con perfiles de solicitante, Compras, aprobación y recepción, además de una cuenta con/sin `finance.view`.
- Confirmar que áreas, materiales y trabajos reales de Visual Corp estén activos y tengan sus permisos de acceso configurados. La migración no crea proveedores, cotizaciones, materiales ni métricas de ejemplo.

## Validación de esta versión

- La integración parte del commit local de Marketing `e31e6f2`, hijo de `origin/main` `beba0e4`; conserva la subpágina/calendario editorial que estaba en una rama remota sin PR abierto.
- `npm run build:checked`, `npm run test:marketing` (14/14), `npm run test:marketing:browser` (13 recorridos) y `git diff --check` pasan. Las pruebas automatizadas no recorren el flujo de Compras con sesiones autenticadas.
- Los asesores de Supabase no detectan claves foráneas nuevas sin índice, tablas RLS nuevas sin política ni advertencias de acceso anónimo relacionadas con Compras. Los índices nuevos aparecen como aún no usados porque no se insertaron registros; las advertencias globales restantes ya existían antes.
- La compilación conserva el aviso general de Vite por un paquete común de más de 500 KB; el panel de Compras queda en módulos de carga diferida y no aumenta la carga inicial.
- No se comprobó la interfaz con una sesión autenticada real; la revisión manual por perfiles sigue pendiente.
