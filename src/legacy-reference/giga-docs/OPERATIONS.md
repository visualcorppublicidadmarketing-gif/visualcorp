# Operaciones, despliegue y Supabase

## Enlaces

- Repositorio: https://github.com/gigaprint-ec/gigaprint-webpage
- GitHub Pages: https://gigaprint-ec.github.io/gigaprint-webpage/
- El repositorio `gigaprint-ec/gigaprint-webpage` está sincronizado con `main`; GitHub Actions publica automáticamente cada push.
- Panel admin demo: https://gigaprint-ec.github.io/gigaprint-webpage/admin
- Supabase project ref: `ihifnhibzlgxotywbeji`
- Supabase URL: `https://ihifnhibzlgxotywbeji.supabase.co`

## Acceso admin actual

- Producción: Supabase Auth con correo y contraseña.
- Los usuarios de producción `ecgigaprint@gmail.com` y `estebanico10@gmail.com` ya existen y tienen `profiles.role = 'super_admin'`. Para nuevos usuarios, créalos en Supabase Dashboard → Authentication → Users y luego promueve su perfil con `update public.profiles set role = 'admin' where id = '<UUID>';`.
- El modo demo `gigaprint` solo existe cuando faltan las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; no debe usarse en producción.

## Variables esperadas

Copia `.env.example` a `.env.local` para desarrollo. Nunca commitees `.env.local`.

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_SITE_URL=http://localhost:5173
VITE_WHATSAPP_NUMBER=593999999999
```

La publishable/anon key puede llegar al navegador; nunca pongas una `service_role` key en `VITE_*`.

## GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml`.

Flujo automático:

1. Push a `main`.
2. `npm ci`.
3. `npm run build`.
4. Vite crea `dist/` con base `/gigaprint-webpage/`.
5. Se copia `index.html` a `404.html` para las rutas SPA.
6. GitHub Pages publica el artifact.

## Migración Supabase aplicada

Fuente: `supabase/schema.sql`.

La migración fue ejecutada contra el proyecto remoto usando el pooler IPv4 de Supabase. Verificación realizada:

- 14 tablas públicas creadas, incluyendo `calculator_settings` y `quote_requests`.
- 28 políticas RLS visibles en el esquema público, incluyendo escritura de administrador.
- `site_settings.theme_preset` creado.
- `site_settings.theme_presets` creado.
- Esquema aplicado sin dejar cambios locales pendientes.

Tablas:

`site_settings`, `services`, `products`, `promotions`, `inquiries`, `pages`, `page_blocks`, `media_assets`, `service_questions`, `form_submissions`, `design_tokens`, `profiles`, `calculator_settings`, `quote_requests`.

Storage: `gigaprint-media` es público para recursos web; `gigaprint-private` es privado para archivos de clientes.

## Cómo verificar sin exponer secretos

Usa una variable temporal local, nunca un string con contraseña en un commit:

```powershell
$env:GIGA_PG_URI = "postgresql://postgres:<PASSWORD>@<POOLER_HOST>:6543/postgres"
# Ejecutar una consulta de verificación con la herramienta de Supabase o un cliente PostgreSQL.
Remove-Item Env:GIGA_PG_URI
```

No pongas la contraseña real en este archivo. Si la conexión directa `db.<project>.supabase.co:5432` no funciona por IPv6/red, usa el pooler IPv4 indicado en el panel Connect de Supabase.

## Estado de la integración

La aplicación ya usa `src/lib/siteRepository.js` y `src/lib/supabase.js`. El seed se puede repetir con `scripts/seed-supabase.mjs`; la verificación de conteos se ejecuta con `scripts/check-supabase.mjs`. El cotizador usa el catálogo normalizado de Esteban, aplica el escalón correcto por m²/unidad/lote, calcula IVA y guarda la solicitud completa en `quote_requests` cuando el cliente envía el formulario de contacto con artículos en el carrito.

La preparación de recursos se repite con `node scripts/optimize-resources.mjs`. Los originales de `Recursos (no borrar)` están excluidos de Git; las copias optimizadas sí se publican.

## Antes de producción

- Revocar y regenerar el token de GitHub compartido durante la configuración.
- Cambiar la contraseña de la base de datos compartida durante la configuración.
- Quitar la contraseña admin demo.
- Configurar Supabase Auth, RLS y Storage.
- Configurar variables de entorno en Vercel, no en el repositorio.
