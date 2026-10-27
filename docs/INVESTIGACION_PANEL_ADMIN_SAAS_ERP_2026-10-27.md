# Investigación: panel unificado, SaaS y ERP

**Fecha:** 2026-10-27
**Estado:** criterio de producto y arquitectura para trabajo local por fases; no publicado ni aplicado a Supabase.

## Hallazgo ejecutivo

Visual Corp Suite ya tiene un primer panel común en `/panel`, catálogo central de navegación y permisos por organización, sucursal, módulo y acción. Eso reduce la confusión entre Admin y Operaciones. El estado actual todavía corresponde a una operación de una sola empresa: hay rutas y datos que siguen ligados a `visual-corp`, una bandeja de solicitudes públicas sin tenant confiable, RPC con autorizaciones heredadas por rol y un historial de migraciones remoto/local que diverge. Por ello, el trabajo debe consolidar primero consistencia funcional y seguridad antes de presentarlo como ERP multiempresa o SaaS listo para clientes.

## Qué caracteriza un buen panel administrativo y ERP

1. **Entrada orientada al trabajo:** una sola navegación y un inicio que prioriza tareas pendientes, alertas que requieren acción y accesos recientes del perfil. Las métricas deben llevar al registro que las explica; evitar indicadores decorativos sin una decisión asociada.
2. **Espacios por responsabilidad:** Admin, caja, inventario, ventas, producción, compras y finanzas deben compartir lenguaje, jerarquía, búsqueda y estados; cada perfil ve el trabajo de su función. El punto de partida se personaliza por perfil y sucursal sin crear aplicaciones separadas.
3. **Patrones según el trabajo:** tablero para señales/acciones; lista para localizar y filtrar muchos registros; ficha para comprender y editar un registro; asistente solo para procesos largos o poco frecuentes. Las acciones deben estar cerca del objeto y declarar su alcance, estado final y consecuencias.
4. **Procesos con trazabilidad:** estados explícitos, responsable, sucursal, tiempos, notas de excepción e historial auditable. Una transición importante debe ser validada por el servidor y no depender de que el botón esté oculto.
5. **Datos confiables:** diferenciar cero real, sin resultados, carga, error y dato desactualizado. Indicadores con origen/periodo y una ruta de desglose. Los CSV/exportaciones deben respetar filtros, permisos y alcance visibles.
6. **Seguridad por capas:** identidad, función del usuario, permiso granular y alcance de fila/sucursal son controles distintos. La interfaz ayuda a descubrir funciones; RPC, RLS y grants hacen cumplir la decisión. Separar funciones incompatibles como solicitar, aprobar, despachar, recibir, ajustar costos y administrar accesos.
7. **Diseño utilizable en turno:** búsqueda y filtros claros, tablas legibles, formularios con validación y estados recuperables; en móvil, priorizar tareas y campos esenciales. Mantener foco, teclado, contraste, etiquetas accesibles y movimiento reducido.

Estas pautas sintetizan los floorplans y patrones oficiales de SAP Fiori y la seguridad de Microsoft Dynamics 365. SAP distingue páginas de resumen, listas de trabajo y fichas de objeto; las listas filtran y llevan a la ficha, y las acciones se ubican según sean globales, de selección, de fila o de cierre. Microsoft organiza permisos en roles, deberes y privilegios, además de permitir límites sobre filas/datos. No implica adoptar esos frameworks: son referencias de interacción y autorización.

## Qué hace que el producto sea SaaS

- **Tenant establecido y verificable:** cada solicitud debe operar con organización resuelta desde una membresía/contexto de servidor, nunca desde texto libre o un `organization_id` confiado al navegador.
- **Aislamiento probado de extremo a extremo:** RLS, RPC, vistas, Storage, realtime, búsqueda, exportación y enlaces deben conservar tenant y sucursal. Autenticación y permiso de rol no sustituyen el aislamiento entre organizaciones.
- **Plano de control y experiencia del cliente:** alta, configuración, dominios, sucursales, usuarios, soporte, límites y estado del servicio se administran por un flujo repetible; no mediante cambios manuales distintos por cliente.
- **Operación compartida:** monitoreo y soporte deben permitir investigar por tenant sin revelar datos de otros; registrar consumo, fallos, tareas, importaciones y operaciones críticas.
- **Ciclo de vida del dato:** definir importación, exportación, retención, respaldo, restauración, cierre de cuenta y borrado antes de ofrecer onboarding comercial.
- **Escala proporcional:** medir uso/carga por tenant y detectar el impacto de un cliente sobre los demás; decidir límites o aislamiento dedicado solo con evidencia y requisitos confirmados.

AWS SaaS Lens diferencia autenticación/autorización de aislamiento de tenant y recomienda operar onboarding, administración y soporte desde una experiencia unificada. La guía no obliga a dividir Visual Corp Suite en microservicios: el aislamiento y un proceso de operación coherente son requisitos del producto; el patrón técnico debe seguir la escala y el equipo reales.

## Comparación con lo que existe en el repositorio

| Área | Evidencia local/remota ya documentada | Lectura y decisión |
|---|---|---|
| Navegación | `/panel` unifica Admin/Operaciones; alias antiguos redirigen; `src/app/navigation.ts` es la fuente común | Mantener una sola estructura y adaptar inicio, secciones y acciones por perfil/sucursal |
| Permisos | `src/auth/accessCatalog.ts`, perfiles configurables y varias migraciones locales para POS, caja, finanzas y compras | Completar la paridad entre controles de UI, RPC y RLS; no marcar un permiso como implementado por esconder un botón |
| Tenant | `AuthProvider` conserva una organización, con acoplamiento histórico a `visual-corp`; bandeja pública sin tenant confiable | No habilitar multiempresa hasta diseñar resolución de tenant para app privada y sitio público por separado |
| Migraciones | Auditoría local reporta diferencias de timestamps entre historial remoto y SQL local; varias propuestas pendientes | No hacer `db push`; primero recuperar/conciliar la historia y aplicar en una base aislada reproducible |
| Operaciones | Inventario, conteos, compras, POS/caja, producción y finanzas ya tienen flujos y permisos distintos | Cerrar seguridad y trazabilidad por flujo; definir métricas desde procesos reales, no datos sintéticos |
| Datos de inventario | El baseline anterior encontró cero saldos/movimientos/métricas en la consulta registrada | El sistema puede mejorar el control y la captura, pero no calibrar rotación o reposición predictiva sin movimientos reales |

## Fases recomendadas y criterios de salida

### Fase 1 — Coherencia de permisos y datos

Completar los controles servidor de POS, Caja, Finanzas, Compras, conteos y traspasos; revisar permisos de costos y perfiles por sucursal. Reconciliar migraciones en una base de desarrollo separada y probar perfiles mínimos/administrativos. **Salida:** cada acción de UI tiene prueba de autorización/denegación en RPC y RLS; la línea SQL se puede reproducir desde una base limpia sin tocar producción.

### Fase 2 — Consolidar el panel operativo único

Revisar la taxonomía de módulos, etiquetas, duplicados, accesos por perfil y jerarquía de `/panel`. Definir inicio por tarea prioritaria, bandejas con vistas guardables y fichas con historial/acciones próximas. **Salida:** recorrido validado con perfiles reales y sin rutas duplicadas o accesos engañosos.

### Fase 3 — ERP de una empresa, sólido

Estabilizar datos maestros (productos/variantes, sucursales, ubicaciones, clientes y proveedores), documentos de origen y libro de movimientos; distinguir existencia, reserva, tránsito, costo y disponible. Completar compras→recepción→inventario→costo, venta/POS→caja→finanzas y orden de producción→consumo→entrega con auditoría. **Salida:** conciliaciones explicables y operaciones reversibles/ajustables con permisos y motivo, sin alterar arqueo ciego.

### Fase 4 — Fundamento SaaS

Diseñar organización/sucursal activa y resolución confiable de tenant; separar dominio del sitio público y sesión ERP. Definir onboarding, dominios, invitaciones, planes/límites solo cuando Visual Corp confirme modelo comercial. **Salida:** pruebas negativas de dos tenants ficticios para lecturas, RPC, RLS, Storage, realtime y exportaciones; ninguna consulta usa empresa por slug fijo salvo contenido público configurado.

### Fase 5 — Operación del servicio y crecimiento

Crear controles de salud, tareas fallidas, backups/restauración, exportación/cierre, soporte, consumo por tenant y observabilidad con acceso restringido. Definir indicadores de producto desde uso real; medir problemas de rendimiento antes de separar servicios o crear cuotas. **Salida:** proceso repetible de alta/soporte/recuperación y límites de datos/servicio aprobados.

## Indicadores para evaluar el panel

- Tiempo y pasos para completar tareas frecuentes por perfil.
- Porcentaje de operaciones que fallan o se reintentan; errores por permisos y sucursal.
- Registros pendientes/vencidos y edad de datos por bandeja.
- Diferencia entre saldo físico, reservas, tránsito y costo, con causa rastreable.
- Acciones críticas con actor, fecha, estado anterior/nuevo, sucursal y motivo.
- Resultado de pruebas de aislamiento entre tenants y denegación por permiso.
- Accesibilidad y lectura en 320, 390, 768 y 1440 px; teclado/foco y movimiento reducido.

No hay todavía datos de uso suficientes en este informe para fijar metas numéricas; primero hay que instrumentar y confirmar una línea base.

## Fuentes consultadas

- SAP Help Portal, [SAP Fiori Concept and Design](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/22bbe89ef68b4d0e98e26cf4cac4430f8/85f167b1da3d46d98e26cf4cac4430f8.html), versión indicada por el portal: SAP S/4HANA 2025 FPS01, feb. 2026; consultado 2026-10-27.
- SAP Fiori for Web Design Guidelines, [When to Use Which Floorplan](https://experience.sap.com/fiori-design-web/when-to-use-which-floorplan/) y [Best Practices for Designing SAP Fiori Apps](https://experience.sap.com/fiori-design-web/best-practices-for-designing-sap-fiori-apps/); consultado 2026-10-27.
- Microsoft Learn, [Security capabilities for finance and operations apps](https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-oa); consultado 2026-10-27.
- Microsoft Learn, [Change basic settings in Business Central](https://learn.microsoft.com/en-us/dynamics365/business-central/ui-change-basic-settings) y [Customizing Business Central](https://learn.microsoft.com/en-us/dynamics365/business-central/ui-customizing-overview); consultado 2026-10-27.
- AWS Well-Architected, [Tenant isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html), [General design principles](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/general-design-principles.html) y [Full stack isolation](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/full-stack-isolation.html); consultado 2026-10-27.
- Contexto del producto: `docs/UNIFICACION_PANEL_ADMIN_OPERACIONES_2026-10-26.md`, `docs/AUDITORIA_SAAS_SEGURIDAD_Y_MIGRACIONES_2026-10-26.md`, código local y consultas de solo lectura al proyecto Supabase, 2026-10-26/27.

## Límite de la investigación

Este documento es una recomendación de producto/arquitectura a partir de patrones públicos y del estado inspeccionado del repositorio. No certifica controles, cumplimiento legal, factibilidad comercial, precios ni estado de producción. Los cambios de permisos enumerados en archivos de migración locales siguen sin aplicar; este informe no es autorización para publicar ni modificar Supabase.
