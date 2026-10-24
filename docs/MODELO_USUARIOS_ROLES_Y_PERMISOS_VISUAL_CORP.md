# Perfiles, roles y permisos de Visual Corp

## Propósito

Visual Corp Suite usa perfiles editables por organización. Cada persona inicia sesión con su cuenta de Google o correo y recibe los permisos del perfil asignado. La identidad de acceso no determina por sí sola el permiso.

Los permisos se conceden por módulo y acción. `Ver` permite consultar información; `Editar` permite crear y cambiar registros. Algunas operaciones sensibles tienen permisos separados, como ver y cambiar costos, modificar tarifas, aprobar compras, recibir compras, cerrar reembolsos, publicar contenido, administrar caja y configurar el equipo.

## Perfiles iniciales

| Perfil | Acceso inicial previsto |
| --- | --- |
| Admin | Administración del equipo y acceso amplio a módulos internos, tarifas, costos, caja y configuración. La asignación del perfil administrativo queda reservada al propietario. |
| Gerencia | Supervisión de ventas, clientes, cotizaciones, inventario, compras, taller, marketing y caja. Puede consultar y editar según sus permisos iniciales. |
| Coordinador de Ventas | Clientes, solicitudes, ventas, cotizaciones, inventario en consulta, compras en consulta y campañas en consulta. |
| Asesoras | Seguimiento de clientes, registro de ventas y cotizaciones, consulta de inventario. |
| Coordinador de Taller | Órdenes y tareas de taller, inventario, consulta de compras y seguimiento operativo. |
| Personal de Taller | Consulta de materiales y actualización de órdenes y tareas de producción. |
| Diseñador Gráfico | Consulta del sitio y cotizaciones; preparación de contenido de marketing y trabajo de taller. |
| Impresor | Consulta de materiales y actualización de tareas de producción. |
| Sublimación | Consulta de materiales y actualización de tareas de producción. |
| Encargado del Local | Ventas, clientes, cotizaciones, inventario, compras y caja del local. |
| Inventario | Control de inventario y recepción de compras, con consulta de taller. |
| Admin página web | Edición del sitio público y consulta de catálogo y marketing. La asignación queda reservada al propietario. |
| Marketing | Gestión de campañas, consulta de cotizaciones y CRM. |

Los permisos iniciales son una propuesta conservadora y editable, no una descripción de funciones contractuales. Admin puede revisar y ajustar permisos desde **Operaciones → Equipo y permisos**; la empresa puede conceder la misma capacidad a otros perfiles desde esa matriz.

## Configuración y seguridad

- Los perfiles tienen nombre, descripción, permisos por módulo y estado activo/inactivo.
- El administrador del equipo asigna un perfil a una cuenta por correo. Una persona puede recibir varios perfiles cuando el trabajo lo requiera.
- La configuración de perfiles y la asignación de personas son permisos distintos.
- Los cambios de perfiles y accesos quedan registrados en la auditoría interna.
- No se puede desactivar el único acceso administrativo activo. El perfil de propietario no se puede editar ni asignar desde la interfaz.
- La aplicación oculta controles sin permiso y Supabase vuelve a comprobar el acceso en cada lectura o escritura protegida.
- Los cambios de perfil se vuelven a consultar al iniciar sesión, recuperar el foco de la página y periódicamente durante la sesión.

## Estado y uso verificado — 24 de octubre de 2026

La gestión de perfiles, la asignación por correo y las políticas de acceso están aplicadas en el proyecto Supabase conectado. La migración `20261023215919_visualcorp_editable_access_profiles` y el listado de equipo están presentes en el historial remoto. La asignación usa `assign_visualcorp_profile`; la autorización se comprueba de nuevo con `get_my_visualcorp_access`, RLS y las reglas de escritura. No depende únicamente de ocultar controles en la interfaz.

Para asignar un perfil, la cuenta debe existir en Supabase Auth. Si todavía no aparece en **Cuentas sin perfil**, la persona debe iniciar sesión una vez mediante Google o correo y luego se puede escribir su correo directamente en **Operaciones → Equipo y permisos**. Una persona puede recibir varios perfiles; sus permisos activos se combinan. El perfil Propietario está protegido y los perfiles administrativos tienen restricciones adicionales.

Comprobación de base del 24 de octubre de 2026: perfiles activos, permisos iniciales de Marketing presentes y RPC de asignación ejecutable solo por usuarios autenticados. No había cuentas pendientes sin asignación para hacer una prueba de asignación real sin modificar el acceso de una persona existente. La vista de gestión requiere una sesión autorizada; el navegador automatizado rechazó el inicio de Google, así que no se confirmó allí el recorrido autenticado. La funcionalidad web y sus controles están en el checkout local; no se publicó esta versión.
