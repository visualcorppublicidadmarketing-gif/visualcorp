# Trabajos por áreas · fases 1 a 7

Estado: publicado en producción mediante el PR #130, integrado en `main` como `748d2486b995dc8dfaa435a2f92483c07476b8a7`. La migración se validó localmente con Podman y se aplicó al proyecto Supabase de producción. El despliegue de Vercel para ese mismo commit quedó `READY` en `https://visualcorp-suite.vercel.app`.

Los perfiles de Asesoras, Coordinador de Taller, Coordinador de Ventas, Diseñador Gráfico, Impresor y Sublimación ya están activos. Pueden asignarse a varias cuentas por área cuando se conozcan sus correos o inicien sesión. Actualmente esas áreas no tienen miembros asignados; cada etapa admite un responsable a la vez y puede permanecer sin responsable. Administración puede consultar y coordinar todas las colas. La prueba del recorrido con esos perfiles reales y la revisión visual autenticada de la pantalla de Asesoría siguen pendientes; no deben confundirse con el despliegue completado.

## Recorrido implementado

1. El asesor confirma una venta en POS. Cada línea conserva una clave propia y una ficha con ruta, medidas, material e indicaciones.
2. La venta, los pagos, los datos de entrega y los trabajos se guardan en una sola transacción. Un error revierte toda la operación; la clave de idempotencia protege el reintento.
3. Cada artículo productivo crea un trabajo con etapas dependientes. La siguiente área se habilita al completar la anterior. La entrega directa no crea trabajo.
4. Asesoría ve los trabajos en **Mi semana**, puede añadir notas y ampliar la descripción. La ficha completa permite corregir medidas y otros datos, con versión e historial.
5. Diseño, Impresión, Sublimación, Corte láser y Taller tienen colas por área y una ficha compartida. El responsable puede tomar, iniciar, bloquear, reanudar y completar la etapa autorizada.
6. El rótulo con visita pasa primero por Taller para verificar medidas. La persona que toma esa visita puede registrar medidas y observaciones antes de enviarlo a Diseño.
7. Cuando un producto no tiene ruta configurada, la orden queda en Asesoría para definirla. Administración puede configurar una ruta predeterminada por producto; el POS deja ajustarla en cada venta.
8. Coordinación puede elegir cualquier etapa de una orden, asignarla a una persona activa y habilitada para esa área y fijar o quitar su fecha límite. La ficha registra el cambio en el historial y evita guardar sobre una versión que ya cambió.
9. La barra superior reúne avisos operativos: etapas asignadas listas o bloqueadas, vencimientos dentro de 48 horas, trabajos del asesor que necesitan revisión y etapas de producción listas sin responsable. Los avisos se calculan del estado actual, se actualizan al abrir el panel, al recuperar el foco y cada minuto mientras la pestaña está visible. No son mensajes enviados por correo, push ni un historial de notificaciones leídas.
10. El POS puede marcar que un trabajo necesita aprobación del arte. Diseño inicia su etapa, entrega un enlace HTTPS y una nota opcional, y la versión queda en el historial. Asesoría o coordinación aprueban o piden correcciones con motivo; una devolución reabre Diseño mientras no haya producción iniciada. El trabajo no pasa a impresión, sublimación, corte láser ni taller hasta que la versión entregada esté aprobada. Un cambio técnico posterior invalida esa aprobación y exige una nueva entrega y revisión. Si ya empezó la producción, el sistema detiene la devolución automática para que coordinación revise las etapas y el posible retrabajo.
11. Diseño también puede subir una prueba PNG, JPG, WebP o PDF de hasta 6 MB. La prueba se guarda en un depósito privado asociado a la organización y la orden; solo la persona asignada a Diseño puede cargarla. Asesoría y las áreas autorizadas la abren mediante un enlace temporal de cinco minutos. La ficha guarda una referencia privada estable y conserva las versiones en el historial. Los archivos de producción mayores pueden seguir entregándose por un enlace HTTPS externo.
12. Si cambia una especificación cuando la producción ya empezó, la ficha muestra a coordinación qué valores cambiaron desde la versión que estaba vigente antes de la revisión, junto con los motivos registrados. La decisión exige una nota y funciona aunque no haya una etapa pendiente bloqueada. Al aceptar se liberan únicamente las etapas retenidas por esa revisión; un bloqueo manual conserva su motivo. Asesoría aún puede corregir la ficha mientras la revisión está pendiente, y la comparación incorpora esas correcciones.
13. Coordinación también puede pedir una corrección de la ficha con una instrucción escrita. La orden permanece detenida, el mensaje se muestra a Asesoría y queda en el historial. Al recibir una nueva versión, la comparación se actualiza; coordinación decide entonces si acepta y reanuda.

## Plantillas iniciales

| Ruta | Etapas |
| --- | --- |
| Impresión | Asesoría → Diseño → Impresión |
| Corte láser | Asesoría → Diseño → Corte láser |
| Rótulo | Asesoría → Diseño → Impresión → Taller |
| Rótulo con medidas | Asesoría → Taller (visita) → Diseño → Impresión → Taller |
| Neón | Asesoría → Diseño → Corte láser → Taller |
| Sublimación | Asesoría → Diseño → Sublimación |

Las medidas, la dirección de instalación y el material se exigen según la plantilla antes de avanzar desde Asesoría. Un cambio técnico después de iniciar producción marca la ficha para revisión de coordinación. Aceptar el cambio no aprueba automáticamente un arte invalidado: Diseño debe entregar otra versión si la revisión de arte está activada. La aprobación del arte es opcional por artículo y se activa en POS. El anticipo sigue siendo una puerta opcional prevista en la base de datos y no se activa por defecto.

## Interfaz de las colas

La cola de cada área muestra un resumen de trabajos, etapas sin responsable, vencidos y bloqueados. Los filtros indican sus cantidades y permiten separar los vencidos; una búsqueda sin resultados ofrece volver a mostrar todos. Cada tarjeta con etapas configuradas muestra el avance del recorrido y la carga inicial presenta tarjetas de espera. Estos componentes leen los datos ya autorizados para la página y no cambian permisos, asignaciones ni estados.

Para esta interfaz se consultaron los catálogos oficiales de Magic UI, shadcn/ui y HeroUI. El patrón de selección única de [Toggle Group de shadcn/ui](https://ui.shadcn.com/docs/components/radix/toggle-group) orientó los filtros; el patrón de [ProgressBar de HeroUI](https://heroui.com/en/docs/react/components/progress-bar) orientó el avance, implementado con el elemento nativo `progress`. Se revisó [Number Ticker de Magic UI](https://magicui.design/docs/components/number-ticker), pero su animación no aporta información a esta cola operativa. Ningún paquete externo nuevo ni componente Pro se incorporó. Los MCP de esas tres plataformas y la guía compartida de Obsidian no estuvieron disponibles en esta sesión; se usaron las documentaciones públicas oficiales.

## Publicación y comprobaciones de esta fase

1. La migración `20261029041516_production_job_workflows.sql` pasó un `supabase db reset --local --yes` sin costo de rama: se aplicaron 108 migraciones válidas y quedó como última la versión `20261029041516`. El `.deferred` se omite deliberadamente. Después se confirmó el historial remoto y se aplicó la migración a producción. La base contiene siete tablas nuevas, ocho plantillas y 25 sugerencias de rutas, sin crear trabajos ficticios.
2. El frontend se publicó después de la migración. El despliegue de producción `dpl_7NFDu4y2VV8AvJzy3JGsMfnhK4ft` corresponde al commit integrado `748d2486b995dc8dfaa435a2f92483c07476b8a7`, con alias oficial activo.
3. Las rutas sugeridas por nombre de producto fueron aprobadas para esta publicación. Se excluyeron las tarifas de Sublimación A3/A4. La ruta se puede ajustar por artículo al confirmar una venta.
4. Queda probar con perfiles reales de asesor, diseño, impresión, taller y coordinación cuando se incorporen las personas: venta, reintento, visita, modificación de ficha, asignación, cambio de fecha, carga privada, entrega y aprobación del arte, devolución por correcciones, bloqueo y cierre de cada ruta. Confirmar que un perfil ajeno no pueda cargar ni abrir la prueba de otra orden, cambiar una etapa, aprobar un arte ni consultar candidatos de asignación.

Verificaciones locales realizadas: compilación TypeScript/Vite, prueba existente del control de acceso manual, análisis sintáctico del SQL, revisión de espacios en el diff y reset completo de Supabase local con Podman. La migración, el commit desplegado y el alias de producción se comprobaron por separado. Estas verificaciones no equivalen a una prueba del flujo con perfiles reales ni sustituyen la revisión visual autenticada.

## Siguientes partes

- Evaluar avisos persistentes con lectura individual y notificaciones externas si el equipo confirma que necesita entregas fuera de la aplicación.
- Evaluar la aprobación por el cliente si el equipo la necesita. La decisión actual es interna de Asesoría; los enlaces temporales de la prueba privada son para usuarios autorizados del sistema.
- Definir limpieza de cargas huérfanas si una subida termina correctamente pero falla la entrega de la versión a la orden. El formulario conserva la referencia para reintentar mientras la página permanezca abierta.
- Definir reglas comerciales de anticipo con el equipo.
- Incorporar responsables a los perfiles existentes cuando se confirmen sus cuentas y verificar los flujos completos con operaciones reales autorizadas.

## Continuación local — coordinación compartida y cantidades parciales

Implementación local sobre una rama nueva desde `origin/main`, con la automatización de pases, listas de control, recepción de etapa, retrabajo y calidad ya presente en el historial remoto de Supabase integrada sin aplicar cambios a producción.

- `/operaciones/coordinacion-trabajos` reúne trabajos de venta por artículo y órdenes internas heredadas mediante consulta paginada de servidor. La tarjeta comparte referencia, artículo, área, responsable asignado, fecha, bloqueos, arte, calidad y estado de entrega; no devuelve teléfono ni ficha comercial. La apertura de una ficha sigue dependiendo del acceso al área o de ser responsable.
- La ficha resume los datos que acompañan el pase a cada área y mantiene las señales de preparación de la etapa. Calidad y retrabajo por cantidades permiten registrar un tramo, dejando el saldo en su estado anterior; solo cantidades aprobadas pueden pasar a entrega. Cada movimiento guarda autor, hora, cantidad, unidad y motivo en el historial. La unidad física se ingresa manualmente y no se deduce del valor de facturación del POS.
- El flujo de artículo completo conserva la ruta existente. Los lotes son opcionales y se activan indicando cantidad física total y unidad antes de empezar; no cambian la facturación ni el inventario.
- Migración local: `20261030032812_production_coordination_and_quantity_lots.sql`. No está aplicada a Supabase de producción ni desplegada. La validación con `supabase db reset --local` quedó pendiente porque en este entorno no hay Docker ni Podman disponible. La revisión autenticada y el piloto por perfiles reales también siguen pendientes.
- Para la interfaz se reutilizaron la ficha `Sheet` y controles del proyecto. Se consultaron los catálogos shadcn/ui y HeroUI, y la lista animada de Magic UI se descartó para avisos y estados porque introduce demora; no se añadieron dependencias. Se mantiene el comportamiento actual adaptable y compatible con movimiento reducido.
