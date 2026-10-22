# Carga de contexto y accesos — Visual Corp Suite

## Repositorios y servicios

- Proyecto local: `E:\VISUAL CORP\apps\visualcorp-suite`
- GitHub: `https://github.com/visualcorppublicidadmarketing-gif/visualcorp` (repositorio público; no subir datos internos ni secretos)
- Supabase destino: cuenta VISUAL, proyecto `visualcorp-suite`, región sa-east-1
- Vercel: proyecto `visualcorp-suite`, equipo `visual19`; conexión GitHub a `visualcorp` vista en el panel
- Variables de compilación permitidas: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (la app también acepta `VITE_SUPABASE_ANON_KEY`). Nunca usar `service_role` en el navegador.

## Áreas

- Sitio público: `/`, `/servicios` y páginas de cada familia, `/nosotros`, `/como-trabajamos`, `/contacto`, `/cotizador`.
- Administración web: `/admin` y subrutas, rol `website_admin`.
- POS y administración interna: `/operaciones`, POS, cotizador, inventario, CRM, clientes, campañas y equipo.
- Roles centrales: `owner`, `website_admin`, `admin`, `manager`, `advisor`, `warehouse`, `production`, `marketing`. `owner` puede acceder a ambas administraciones. `website_admin` administra contenido; `admin` administra la operación interna.

## Datos cargados

Las migraciones aplicadas están versionadas bajo `supabase/migrations/`. La última carga creó 70 códigos únicos de artículos sugeridos sin saldo; los 749 registros fuente de Visual Corp y Gigaprint siguen marcados para revisar. El catálogo de cotización tiene 247 registros copiados con imágenes y reglas de precio. La base de clientes existe y no contiene registros iniciales.

## Pasos para activar cuentas

1. Confirmar en GitHub/Vercel que el despliegue del último commit terminó y que `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` estén definidas para producción.
2. El propietario debe iniciar sesión usando enlace de correo en `/operaciones`; el primer correo confirmado asigna `owner`.
3. Cada integrante inicia sesión una vez con su correo; luego el propietario usa `/operaciones/equipo` para asignar `website_admin`, `admin` POS u otro perfil.
4. Confirmar cada saldo con conteo físico antes de registrar movimientos/ventas. Conservar procedencia de archivos y filas fuente.

## Migraciones versionadas

- `20261022161906_catalog_site_content_and_inventory_import.sql`
- `20261022162602_public_catalog_and_site_seed.sql`
- `20261022162803_team_role_assignment.sql`
- `20261022162916_seed_suggested_inventory_catalog.sql`
- `20261022163021_public_catalog_invoker_security.sql`
- `20261022163625_atomic_inventory_pos.sql`

No se guardan tokens, claves, contraseñas ni códigos de acceso aquí. Revocar el token GitHub compartido previamente en el chat.
