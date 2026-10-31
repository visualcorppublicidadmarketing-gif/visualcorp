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

Migración: `supabase/migrations/20261031154030_marketing_editorial_workflow.sql`.

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

Estado: implementación local para revisión, con pruebas automatizadas y capturas de datos ficticios. Siguiente paso: revisión del cambio y preparación de la activación conjunta de migración y web; ninguna aprobación estética, publicación externa o despliegue se infiere de estas pruebas.
