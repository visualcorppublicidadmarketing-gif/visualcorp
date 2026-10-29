# Trabajos por áreas · fases 1 a 7

Estado: implementación en el PR #130 (borrador), rama `codex/production-workflows-e-drive-20261029`. La vista previa del commit `7fe3f1c` está lista. La migración se aplicó en Supabase local con Podman; no se ha aplicado a la base de producción ni se ha habilitado el flujo.

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

## Despliegue seguro de esta fase

1. La migración `20261029041516_production_job_workflows.sql` pasó un `supabase db reset --local --yes` sin costo de rama: se aplicaron 108 migraciones válidas y quedó como última la versión `20261029041516`. El `.deferred` se omite deliberadamente. Antes de producción, confirmar el historial remoto y aplicar la migración mediante el proceso de release.
2. Probar con perfiles reales de asesor, diseño, impresión, taller y coordinación: venta, reintento, visita, modificación de ficha, asignación, cambio de fecha, carga privada, entrega y aprobación del arte, devolución por correcciones, bloqueo y cierre de cada ruta. Confirmar que un perfil ajeno no pueda cargar ni abrir la prueba de otra orden, cambiar una etapa, aprobar un arte ni consultar candidatos de asignación.
3. Revisar las rutas sugeridas por nombres de producto. Se excluyeron de las sugerencias las tarifas de Sublimación A3/A4; las demás son sugerencias iniciales y no se consideran una clasificación comercial aprobada.
4. Publicar el frontend después de la migración. Antes de ella, el POS detiene la confirmación porque no puede verificar las rutas.

Verificaciones locales realizadas: compilación TypeScript/Vite, prueba existente del control de acceso manual, análisis sintáctico del SQL, revisión de espacios en el diff y reset completo de Supabase local con Podman. No equivalen a una prueba del flujo con perfiles reales ni sustituyen la revisión visual autenticada.

## Siguientes partes

- Evaluar avisos persistentes con lectura individual y notificaciones externas si el equipo confirma que necesita entregas fuera de la aplicación.
- Evaluar la aprobación por el cliente si el equipo la necesita. La decisión actual es interna de Asesoría; los enlaces temporales de la prueba privada son para usuarios autorizados del sistema.
- Definir limpieza de cargas huérfanas si una subida termina correctamente pero falla la entrega de la versión a la orden. El formulario conserva la referencia para reintentar mientras la página permanezca abierta.
- Definir reglas comerciales de anticipo con el equipo.
- Verificar flujos completos con datos de prueba, ajustar perfiles y preparar el lanzamiento gradual.
