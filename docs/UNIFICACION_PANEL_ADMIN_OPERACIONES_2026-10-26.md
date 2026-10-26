# Unificación del panel Admin y Operaciones

**Estado:** implementado localmente, pendiente de revisión con una sesión autenticada. No publicado.

## Resultado

- `/panel` es la página de inicio única. `/admin` y `/operaciones` conservan compatibilidad y redirigen a `/panel`.
- `src/app/navigation.ts` es el índice común para los grupos del menú, búsqueda rápida, inicio y permisos de visibilidad.
- Las secciones se organizan por tarea: Comercial, Producción y abastecimiento, Marketing, Sitio y contenido, Equipo y sistema.
- Solicitudes CRM, Marketing y Novedades tienen una sola entrada visible. Las rutas anteriores continúan como alias.
- Flujos aparece cuando la persona puede consultar al menos uno de sus módulos compatibles, igual que el control de la ruta.
- `src/auth/accessCatalog.ts` comparte nombres de módulos, acciones especiales y nombres de roles heredados con la matriz de perfiles en Equipo.

## Datos y permisos

Los identificadores de módulos, acciones, perfiles y roles de Supabase se mantienen. No se cambiaron membresías, perfiles asignados, permisos efectivos ni políticas RLS, y no se creó ni aplicó una migración: esta versión reorganiza el índice visual y el enrutamiento sin añadir claves de permisos. Supabase sigue siendo la autoridad para los accesos.

Antes de cambiar claves o permisos persistidos, preparar una equivalencia revisable de permisos efectivos por perfil y validar esa propuesta con el propietario. No se debe inferir una autorización por la visibilidad del menú.

## Verificación local

- `npm run build:checked`: correcto (TypeScript y Vite).
- `git diff --check`: correcto.
- Playwright confirmó `/admin` → `/panel` y `/admin/marketing` → `/operaciones/marketing`.
- La sesión de Playwright no estaba autenticada; no se comprobó el panel con perfiles reales ni se cambiaron datos remotos.
- Los cambios están en una copia de trabajo con modificaciones de inventario preexistentes preservadas. No se publicó.

## Revisión pendiente antes de integrar

Comprobar con cuentas autorizadas que cada perfil ve sus módulos, que el acceso directo a rutas sigue aplicando la regla del servidor, que las URL heredadas conservan destino y que el menú se entiende en móvil. Cualquier cambio de permisos debe pasar por revisión de alcance y no debe venir implícito por la unificación visual.
