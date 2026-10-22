# Visual Corp Suite — estado de publicación

Fecha de revisión: 2026-10-22
Proyecto local: `E:\VISUAL CORP\apps\visualcorp-suite`

## Objetivo

Mantener en un solo repositorio las tres áreas que comparten componentes y dominio:

- Sitio público: presentación institucional, servicios/subpáginas, contacto y cotizador.
- Administración web: contenido del sitio, solicitudes, catálogo, marketing y respaldos.
- Operaciones: POS, CRM, clientes e inventario por áreas y sucursales.

Esta estructura puede desplegarse como una aplicación integrada. Los accesos internos deben quedar protegidos por autenticación y autorización antes de habilitarse en internet.

## Estado local comprobado

- Aplicación React/Vite modular; la compilación de producción pasó el 22 de octubre de 2026. Vite advierte que el paquete principal supera 500 kB; conviene dividirlo cuando se retome rendimiento.
- Repositorio Git local `visualcorp-suite`, rama `main`, todavía sin commits ni remoto.
- Supabase CLI inicializado en `supabase/`; hay tres migraciones SQL versionadas y aplicadas al proyecto remoto. No hay credenciales de servicio guardadas en el proyecto.
- El estado operativo de este perfil del navegador continúa en `localStorage` bajo `visualcorp-suite-local-v1`.
- `/admin/respaldo` mostró 323 registros en este perfil, incluidos 70 artículos sugeridos con cantidades cero. No son existencias físicas verificadas y no se han importado al proyecto remoto.
- No se verificó un archivo JSON exportado en `backups/`; no borrar ni migrar los datos de `localStorage` hasta guardar y verificar una exportación real.
- `backups/*.json` está excluido de Git porque puede contener datos personales/comerciales.
- Admin y Operaciones no tienen todavía autenticación conectada a Supabase. El build de producción mantiene esas rutas cerradas con un mensaje informativo; no habilitarlas hasta implementar y verificar Auth, permisos y sincronización.
- El formulario público escribe solicitudes en `public.public_requests` cuando Vercel construye con las variables públicas de Supabase; en producción no guarda la solicitud localmente si la conexión falta.

## Estado de las conexiones y servicios «VISUAL»

- Supabase: proyecto `visualcorp-suite`, referencia `iomdmclkimfmvlzcrkyz`, región `sa-east-1`, estado saludable. Se crearon las tablas para organizaciones, sucursales/áreas, membresías, inventario y variantes, existencias/movimientos, costos, transferencias, clientes, ventas y solicitudes públicas. Hay RLS en las 17 tablas públicas.
- Tres migraciones remotas confirmadas: `20261022154601_visualcorp_core_inventory_sales`, `20261022154710_inventory_indexes_and_policy_tuning`, `20261022154835_public_request_company_field`. El asesor de seguridad no reporta hallazgos. El asesor de rendimiento muestra índices sin uso en la base vacía; aún no hay carga de trabajo ni existencias.
- Supabase solo tiene estructura y datos iniciales de la organización Visual Corp, sucursales y siete áreas; no contiene las 323 entradas locales ni inventario físico.
- Vercel: proyecto `visualcorp-suite` creado en la cuenta/equipo Visual, framework Vite. Se configuraron `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en desarrollo, preview y producción. Son valores de cliente; nunca añadir una clave `service_role` a `VITE_*`.
- La compilación estática de producción se generó con la conexión de Supabase. El despliegue directo fue rechazado por Vercel con 403: la conexión necesita autorizar el acceso de despliegue al equipo `visual19`. Aún no hay URL pública ni dominio verificados.
- La protección SSO del proyecto Vercel sigue activa para todos los dominios salvo dominios personalizados. Revisar el acceso del dominio público después de conseguir que la autorización de despliegue funcione.
- GitHub: la conexión VISUAL identifica el perfil Visual Corp, pero el conector disponible no incluye una operación para crear repositorios. El repositorio local no tiene commits ni remoto. No se reutilizó el token que la persona escribió en el chat; quedó expuesto y debe revocarse en GitHub antes de crear un token nuevo de mínimo alcance, sin pegarlo en el chat.
- No usar los proyectos existentes de otras cuentas, incluyendo `iglesia-jerusalen`, ni el Supabase de `estebanico.com` para Visual Corp.

## Próximas acciones

1. Autorizar en la conexión Vercel el acceso de despliegue al equipo `visual19`; el intento actual no dejó URL pública. Después, repetir el despliegue y comprobar el formulario y las rutas públicas.
2. En GitHub, revocar el token compartido en el chat. Crear `visualcorp-suite` en la cuenta VISUAL cuando la sesión autenticada esté disponible; hacer el primer commit desde el repositorio local, sin subir `.env`, `node_modules`, `dist` ni respaldos.
3. Confirmar exportación JSON verificable del almacenamiento local antes de migrar datos. Preservar IDs y reconciliar conteos; no cargar cantidades como existencias físicas sin conteo confirmado.
4. Conectar Auth a la aplicación e implementar permisos por rol en Supabase/RLS. Dar visibilidad de costos solo a roles autorizados. Diseñar el acceso semanal de asesoras como mecanismo de acceso limitado, no como reemplazo de Auth/RLS.
5. Sincronizar POS, CRM, catálogo, ventas e inventario y probar el recorrido de venta, bajo stock y traspaso entre Visual Corp y Gigaprint desde perfiles de permisos distintos.
6. Habilitar las rutas internas solo después de superar esas verificaciones.

## Secretos y credenciales

No guardar contraseñas, tokens, claves de Supabase, códigos de recuperación ni credenciales de GitHub/Vercel en este directorio o en el repositorio. Usar variables protegidas del proveedor y nunca exponer claves `service_role` con prefijo `VITE_`.

