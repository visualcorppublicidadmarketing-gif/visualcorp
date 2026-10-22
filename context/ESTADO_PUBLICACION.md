# Estado de publicación — Visual Corp Suite

Fecha de revisión: 22 de octubre de 2026
Proyecto: `E:\VISUAL CORP\apps\visualcorp-suite`
Repositorio: `visualcorppublicidadmarketing-gif/visualcorp` (público)
Proyecto Supabase VISUAL: `visualcorp-suite` (`iomdmclkimfmvlzcrkyz`)
Proyecto Vercel: `visualcorp-suite`, equipo `visual19`

## Cargado en Supabase

- Catálogo de cotización: 247 productos publicados con sus precios, escalas, opciones, rutas de imagen, descripción y fecha de origen. Los cambios se limitan al proyecto Visual Corp; no se copió el resto de datos del proyecto `estebanico.com`.
- Se copiaron al repositorio los cuatro archivos de imagen locales que referenciaba el catálogo. Las demás imágenes conservan sus rutas públicas de Supabase o de sus fuentes externas.
- Vista pública de catálogo con precio para el cotizador público; catálogo de presentación público sin campos internos de margen/costo.
- Páginas iniciales para Inicio y seis familias de servicios, más configuración confirmada de Visual Corp. No se inventaron artículos ni publicaciones editoriales.
- Inventario sugerido: 70 artículos con códigos `VC-INV-*`, categorías y áreas de Impresión, Sublimación, Troquelado, Láser, Taller, Neones y Bodega general. No se crearon saldos para esos artículos: todos requieren conteo físico.
- Inventarios fuente: 749 filas de los libros de Visual Corp y Gigaprint en una cola de importación con lotes, sucursal, hoja, fila, datos originales y estado pendiente de revisión. No se convirtieron textos ambiguos en stock.
- Base de clientes: tabla de Supabase lista y formulario del POS conectado. Empieza vacía; no se importaron datos personales de clientes.
- Operaciones de inventario y POS: conteo auditado, entradas/salidas, traspasos entre sucursales y ventas se registran mediante RPC transaccionales en Supabase. Las ventas urgentes permiten dejar la parte no disponible como pendiente de compra.
- Costos privados: lectura/edición disponible en inventario solo para propietario, admin POS y gerencia; RLS en Supabase limita el acceso.

## Accesos internos

- `/admin`: administración de la página pública, protegida por el rol `website_admin`.
- `/operaciones`: POS y gestión interna, protegidos por roles de operación.
- `/operaciones/equipo`: propietario/admin puede asignar roles tras el primer inicio de sesión de cada cuenta.
- El acceso usa enlace de un solo uso por correo de Supabase Auth. El primer inicio de sesión confirmado del correo de Visual Corp asigna el rol `owner` mediante trigger; después el propietario puede asignar `website_admin`, `admin` (POS), gerencia, asesoras, bodega, producción y marketing.
- Los costos de inventario siguen protegidos por permisos de base de datos. No hay contraseñas ni claves privadas guardadas en el repositorio.

## Publicación y límites actuales

- Las migraciones `20261022210000`, `20261022223000`, `20261022230000`, `20261022233000`, `20261022234000` y `20261022240000` están aplicadas en Supabase VISUAL y versionadas en `supabase/migrations/`.
- La compilación de producción de Vite pasó después de conectar Auth, catálogo, solicitudes públicas, clientes, POS y movimientos transaccionales. Vite muestra una advertencia de paquete principal mayor a 500 kB.
- El asesor de seguridad no reporta errores; sí marca 4 funciones `SECURITY DEFINER` como advertencia porque son RPC autenticadas y con validación de rol/sucursal dentro de la función. El asesor de rendimiento muestra recomendaciones informativas de índices y políticas permisivas.
- El commit `450247802dd52b8735fdb279f1ff59435db8377f` se subió a GitHub y el estado de Vercel reportó `success`. La API de Vercel devolvió 403 al leer el detalle/dominio del despliegue para el equipo `visual19`, por lo que el dominio público final no se pudo confirmar desde esta conexión.
- El panel web, solicitudes públicas, lista de clientes, catálogo, inventario y ventas usan Supabase. Las cotizaciones internas siguen guardándose localmente y deben conectarse a una tabla remota en una fase posterior. El inventario fuente está disponible para revisar; no se deben usar sus filas pendientes para prometer stock.
- El propietario aún debe iniciar sesión para que el trigger cree su membresía. El correo de acceso, las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (o `VITE_SUPABASE_ANON_KEY`) deben estar configurados en Vercel antes de habilitar el panel.

## Seguridad y procedencia

- El repositorio es público. No subir `.env`, claves de servicio, contraseñas, exportaciones locales de clientes ni archivos brutos de inventario.
- Un token de GitHub fue pegado anteriormente en el chat: revocarlo en GitHub y no reutilizarlo.
- No publicar stock confirmado hasta completar conteo. Mantener los libros y capturas originales; la cola conserva los datos leídos para conciliación.
- El catálogo se copió solamente desde `public.quote_calculator_products` de `estebanico.com`; tablas académicas, credenciales y datos ajenos a Visual Corp se excluyeron.
