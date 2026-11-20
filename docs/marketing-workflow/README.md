# Marketing: pendientes, responsables y revisión

Implementación del plan confirmado el 31 de octubre de 2026. Rama `codex/marketing-workflow-20261031`, creada desde `origin/main` (`ca0109a`) en un checkout aislado. Los cambios sin guardar del checkout original no se incorporaron ni modificaron.

## Comportamiento entregado

- Resumen y Calendario comparten clasificación, bandejas y orden de pendientes: Hoy, Esta semana, Vencidas, Sin responsable, En revisión, Mis publicaciones y Sin fecha.
- Publicaciones con título, planes mensuales y espacios por definir se muestran separadamente. Los planes y los espacios sin título quedan fuera de los indicadores de publicaciones. Los planes no ofrecen aprobación de piezas.
- Una cuenta responsable por pieza, selección de miembros activos, asignación en lote y resultados por ficha. Los nombres históricos se conservan hasta una vinculación explícita.
- Checklist editable con Sí, No, No aplica y Por confirmar. El avance excluye los entregables que no aplican. Las marcas rápidas de arte/video se sincronizan con ese checklist.
- Motivo de bloqueo, próximo paso y fechas visibles en tarjetas. Diferencia entre producción vencida y publicación pendiente de confirmar.
- Panel de revisión con material, mensaje, CTA, entregables, historial y decisiones. Las rutas locales se identifican como referencias sin acceso desde el navegador; no equivalen a una vista previa ni a material verificado.
- Aprobación y solicitud de cambios reservadas a perfiles con `marketing.approve_content`, además de ver y editar Marketing. El permiso se configura en Equipo y accesos. La migración lo activa inicialmente en los perfiles de sistema owner, admin y gerencia.
- Una decisión conserva actor, fecha, revisión de contenido y una copia de los campos/materiales revisados. Los cambios de contenido o enlaces de archivos incrementan la revisión; cambios administrativos conservan la aprobación de contenido. Las versiones históricas sin decisión no se presentan como aprobadas.
- Programar o registrar publicación con faltantes exige una advertencia y confirmación, pero se permite continuar. Ninguno de estos botones envía contenido a redes.
- Propuestas de fechas con comparación y confirmación humana. Fines de semana y días sin producción se omiten en las propuestas. La selección manual permite programar contenido en días de cierre.
- Días sin producción configurables por organización. Se incluyen el 2 y 3 de noviembre de 2026 únicamente para Visual Corp, conforme al cierre confirmado.
- Detección de modificaciones concurrentes y conservación del formulario al fallar. Las nuevas fichas usan una referencia de creación estable para recuperar un intento sin duplicarlo si se pierde la respuesta.

## Cambios de base de datos y permisos

Migración: `supabase/migrations/20261031162423_marketing_editorial_workflow.sql`.

Añade `record_kind`, `owner_user_id`, `blocked_reason`, `content_revision` y `row_version` a `marketing_posts`; crea `marketing_reviews` y `marketing_nonproduction_days` con RLS. Conserva IDs, textos, fechas, estados y enlaces anteriores. Clasifica las fichas `PLAN MENSUAL` como planes, sin marcarlas aprobadas o publicadas.

Operaciones:

- `list_marketing_assignees(organization_id)`: devuelve solo identificador y nombre de miembros activos de la misma organización.
- `save_marketing_post(organization_id, post_id, expected_version, patch, creation_key)`: lista de campos permitidos, comprobación de permisos, bloqueo de fila y concurrencia. La referencia de creación es opcional a nivel SQL; la nueva interfaz la mantiene estable durante los reintentos de una ficha nueva.
- `review_marketing_post(organization_id, post_id, expected_version, decision, feedback)`: valida permiso explícito y versión; solicitar cambios exige comentario.
- `set_marketing_nonproduction_day(organization_id, day, reason, remove)`: configuración autorizada de cierres.

La función de guardado y la de revisión son `SECURITY DEFINER` con `search_path` vacío, autenticación y comprobaciones de organización/permisos. Las funciones de trigger no son ejecutables por clientes. Las decisiones son de lectura para usuarios de la API; se crean exclusivamente desde la operación de revisión.

El trigger de escrituras directas es deliberadamente `SECURITY INVOKER`: las solicitudes de navegador ejecutadas como `authenticated` reciben una indicación para actualizar la página, mientras las operaciones controladas se ejecutan como su propietario de base de datos. No se utiliza una bandera manipulable desde el cliente. RLS continúa vigente. El proceso diario de vencimientos se desprograma y su antigua función queda sin efectos; la interfaz deja de reprogramar al abrirse.

## Verificación reproducible y límites

```powershell
npm ci --no-audit --no-fund
npm run test:marketing
npm run test:marketing:browser
npm run build:checked
git diff --check
```

Las herramientas de pruebas son dependencias de desarrollo fijadas: PGlite 0.5.14 y Playwright 1.64.1. No se incorporaron bibliotecas de interfaz nuevas ni servicios de pago.

La prueba SQL utiliza PostgreSQL local embebido con las migraciones reales de Marketing, la función real de acceso por perfiles, roles SQL y políticas RLS. Cubre permisos, separación entre organizaciones, concurrencia, revisión, cambios de contenido/material, aprobación por designación, fechas, historia y creación recuperable.

La prueba de navegador abre la ruta real de la aplicación con Chrome, sesiones sintéticas de editor/gerencia/consulta y un adaptador HTTP local que ejecuta esas funciones SQL. Comprueba guardado y recarga, checklist, fallo y reintento, asignación parcial, aprobación, programación con advertencias, propuestas de fechas, ausencia de cambios al abrir el calendario, móvil, teclado y errores de JavaScript.

Las capturas en `verification/` contienen exclusivamente datos ficticios. No son evidencia de sesiones reales de Supabase ni de una revisión en producción. El adaptador de pruebas escucha solo en 127.0.0.1 y sus sesiones ficticias no conceden acceso a la plataforma real. No se usa en la build de producción.

Resultado del 31 de octubre: instalación reproducible con `npm ci` correcta; 14 pruebas de reglas/PostgreSQL y 13 escenarios de navegador correctos; typecheck y build correctos; revisión de diferencias sin errores. La build conserva el aviso general de tamaño de chunks del proyecto. Se inspeccionaron las capturas de escritorio y celular; se corrigió el ajuste de las etiquetas de etapa en tarjetas con selección.

## Preparación para publicar esta versión

La migración y la web deben activarse de forma coordinada: el nuevo cliente necesita las nuevas operaciones y el cliente antiguo queda impedido de escribir directamente después de aplicar la migración. Durante el cambio se debe solicitar recargar las sesiones abiertas. Revisar primero la migración y la build en un entorno de prueba; después aplicar la migración, activar la web correspondiente y hacer la revisión autenticada con cuentas reales de los tres perfiles.

Para revertir la interfaz tras activar la migración, no volver a un cliente que escriba directamente: mantener una versión compatible con las operaciones controladas. Conservar las tablas e historial. La implementación no reprograma retroactivamente ni restaura fechas que ya hubiera movido el proceso anterior.

Esta entrega prepara código y migración en la rama local. No aplica cambios a la base remota, no despliega a Vercel y no publica contenido en redes. La validación del proyecto Supabase alojado, Storage real y cuentas reales queda para la activación coordinada.

## Componentes y continuidad

Se conservaron React/Vite, la identidad y las vistas existentes. Se consultaron shadcn Sheet/Data Table (MIT), HeroUI v3.2.7 Drawer/AlertDialog/ProgressBar (Apache 2.0) y Magic UI Animated List (MIT). Se adaptó el patrón de panel accesible mediante diálogo nativo y se conservó la animación existente con movimiento reducido y sin entrada escalonada de los pendientes. No se incorporaron esas bibliotecas. Obsidian no tenía conexión operativa disponible en esta sesión.

Referencias: [Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Data Table](https://ui.shadcn.com/docs/components/base/data-table), [licencia shadcn](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [licencia HeroUI v3](https://raw.githubusercontent.com/heroui-inc/heroui/v3/LICENSE), [licencia Magic UI](https://raw.githubusercontent.com/magicuidesign/magicui/main/LICENSE.md), [funciones de base de datos](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Ajustes responsive y accesibilidad · 20 de noviembre de 2026

- En anchos de hasta 900 px, el calendario mensual se presenta como una agenda por día con nombre del día, mejor espacio para títulos y controles más cómodos; al expandir un día aparecen publicaciones y actividades.
- La navegación, filtros y grupos de acciones se reorganizan para pantallas estrechas; métricas pasan de cuatro columnas a dos y luego a una. Tablas y líneas de tiempo mantienen el desplazamiento dentro de su propio contenedor.
- Se añadieron límites de ancho y `min-width: 0` en los contenedores principales, estados de foco visibles y ajustes para movimiento reducido y modo oscuro.
- Revisión visual local en 390, 768 y 1280 px. No se cambiaron registros ni se publicó la app.
- Catálogos considerados: Magic UI (sin patrón de calendario editorial adecuado), shadcn Calendar y HeroUI Calendar/Tabs/Toolbar. Se conservaron los componentes y dependencias existentes porque sus calendarios son selectores de fecha y no sustituyen el calendario editorial con estados, actividades y programación.
- La build quedó pendiente: `vite` no está disponible en la instalación local y `npm ci` no pudo reemplazar un binario bloqueado por otro proceso. No se ejecutaron pruebas automatizadas.

Estado: implementación local para revisión, con pruebas automatizadas y capturas de datos ficticios. Siguiente paso: revisión del cambio y preparación de la activación conjunta de migración y web; ninguna aprobación estética, publicación externa o despliegue se infiere de estas pruebas.

## Vistas responsive de Marketing · 20 de noviembre de 2026

- En móvil, semana y día se muestran como una agenda vertical; el selector indica cuántos elementos tiene cada fecha y ofrece accesos directos para crear publicaciones y actividades.
- El calendario mensual permite abrir la agenda completa de una fecha. Kanban ofrece navegación rápida entre etapas; la tabla de publicaciones se reorganiza como tarjetas con sus rótulos y acciones.
- Se conservaron los componentes de React/CSS existentes. Se revisaron patrones de Buffer, Outlook, Google Calendar, shadcn, HeroUI y Magic UI; no se añadió una dependencia porque ninguno reemplaza el flujo editorial propio con estados, actividades y programación.
- Typecheck y build completaron correctamente. La vista previa de Vercel quedó lista. La revisión autenticada con datos de la aplicación no estuvo disponible en esta sesión; no se registraron cambios en datos ni se publicaron contenidos en redes.

Referencias: [Buffer móvil](https://support.buffer.com/en-us/articles/using-the-calendar-feature-on-the-buffer-mobile-app-YxB7DmpyJI), [Outlook móvil](https://support.microsoft.com/en-us/outlook/how-do-i-switch-to-month-view), [Google Calendar móvil](https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DAndroid&hl=en-7), [shadcn Calendar](https://ui.shadcn.com/docs/components/base/calendar), [HeroUI Calendar](https://heroui.com/docs/react/components/calendar).
## Refinamiento de vistas estrechas · 20 de noviembre de 2026

- Semana y día usan en móvil una agenda vertical con selector táctil de fechas, cantidades por día, tarjetas legibles y accesos directos para crear publicaciones o actividades. La semana abre en hoy cuando esa fecha pertenece al rango; si no, abre el primer día visible.
- Kanban se apila por etapas y ofrece saltos rápidos con el total de fichas. La vista de tabla conserva sus datos y acciones como tarjetas rotuladas en pantallas pequeñas; en escritorio mantiene la tabla.
- La decisión sigue el patrón de Buffer de navegar por semana y abrir el día seleccionado, junto a las vistas Agenda/Día/3 días de Outlook y la lista Schedule de Google Calendar. Esas opciones conservan contexto de fecha sin comprimir siete columnas en un teléfono.
- Se conservaron React, CSS y los componentes propios. Magic UI no arrojó patrones pertinentes para calendario editorial o Kanban; el MCP de shadcn no encontró registros configurados, por lo que se revisó su documentación oficial. Sus componentes Calendar y Table son bases de calendario/tabulación, no resuelven por sí solos el flujo editorial. HeroUI Calendar y su fuente documentan un selector de fecha construido con React Aria; HeroUI v3 requiere React 19+ y Tailwind CSS v4. No se añadió dependencia ni se reemplazó el calendario especializado del producto.
- Las vistas mantienen etiquetas accesibles, foco visible, áreas táctiles y respeto por movimiento reducido y modo oscuro.

Referencias de benchmark: [Buffer en móvil](https://support.buffer.com/en-us/articles/using-the-calendar-feature-on-the-buffer-mobile-app-YxB7DmpyJI), [Outlook móvil: Agenda, Día, 3 días y Mes](https://support.microsoft.com/en-us/outlook/how-do-i-switch-to-month-view), [Google Calendar móvil: Schedule y Month](https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DAndroid&hl=en-7). Documentación consultada: [shadcn Calendar](https://ui.shadcn.com/docs/components/base/calendar), [shadcn Table](https://ui.shadcn.com/docs/components/base/table), [HeroUI Calendar](https://heroui.com/docs/react/components/calendar) y [requisitos de HeroUI v3](https://heroui.com/docs/react/getting-started/quick-start).
