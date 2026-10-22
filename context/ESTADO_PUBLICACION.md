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
- Base de clientes: tabla `customers` de Supabase; al confirmar una orden, el POS asocia un cliente existente o crea uno y busca evitar duplicados por teléfono.
- Inventario: las RPC centrales de conteo, movimiento, transferencia y `create_pos_sale` están aplicadas. En la revisión del 22 de octubre, los 70 artículos y 70 variantes no tenían filas de saldo en `inventory_stock`; eso sigue siendo pendiente de conteo, no stock físico confirmado.
- POS: `/operaciones/pos` guarda órdenes y pagos en Supabase mediante una RPC transaccional, con clave de reintento, bloqueo de variante y salida de stock dentro de la misma transacción. Los abonos conservan saldo pendiente y admiten pagos posteriores idempotentes. Solo las variantes vinculadas explícitamente en Inventario reducen stock; los faltantes se marcan como compra urgente pendiente. El POS no emite comprobantes tributarios.
- Costos privados: lectura/edición disponible en inventario solo para propietario, admin POS y gerencia; RLS en Supabase limita el acceso.

## Accesos internos

- `/admin`: administración de la página pública, protegida por el rol `website_admin`.
- `/operaciones`: POS y gestión interna, protegidos por roles de operación.
- `/operaciones/equipo`: propietario/admin puede asignar roles tras el primer inicio de sesión de cada cuenta.
- El acceso conserva enlace de un solo uso por correo y añade Google OAuth. Las identidades principales están sujetas a los roles definidos por la migración `20261022165634_bootstrap_primary_admins`; cada cuenta necesita iniciar sesión una vez para que Auth cree su perfil y se aplique el rol inicial. El propietario puede asignar después los perfiles internos restantes.
- Los costos de inventario siguen protegidos por permisos de base de datos. No hay contraseñas ni claves privadas guardadas en el repositorio.

## Publicación y límites actuales

- Las migraciones de POS/inventario recién aplicadas se guardan localmente con sus versiones remotas `20261022172435`, `20261022172638`, `20261022173445` y `20261022173630`.
- La compilación de producción de Vite pasó después de conectar Auth, catálogo, solicitudes públicas, clientes, POS y movimientos transaccionales. Vite muestra una advertencia de paquete principal mayor a 500 kB.
- El asesor de seguridad no reporta errores; sí marca 4 funciones `SECURITY DEFINER` como advertencia porque son RPC autenticadas y con validación de rol/sucursal dentro de la función. El asesor de rendimiento muestra recomendaciones informativas de índices y políticas permisivas.
- El commit `dd9e3fb858cc60dc2129466a99ad41e648e24cba` se publicó en `main`. La compilación local de producción pasó; Vite advierte que el paquete principal supera 500 kB. Se comprobó en el navegador que `https://visualcorp-suite.vercel.app/admin` entrega la versión actual y muestra el acceso con Google y el enlace por correo. La API de gestión de Vercel no permitió consultar el detalle del despliegue en esta sesión.
- El panel web, solicitudes públicas, catálogo, movimientos del inventario, clientes, ventas y pagos usan Supabase. No hay vínculos producto-variante preasignados: el equipo autorizado debe configurarlos tras cotejar existencia física y variante. Las filas importadas siguen pendientes de conciliación y no se deben usar para prometer stock. Las cotizaciones internas continúan en almacenamiento local y su integración compartida queda para una fase posterior.
- Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` aparecen configuradas en Vercel. El propietario y el administrador deben completar su primer inicio de sesión para crear y activar sus perfiles.

## Inicio de sesión con Google — 22 de octubre de 2026

- Se creó en la cuenta Visual Corp el proyecto Google Cloud `Visual Corp`, ID `eighth-anvil-512416-t7`.
- Se creó el cliente OAuth web `Visual Corp Web y POS` con ID público `128536253381-ki7t4nmod9qk1tee35bj8mif190p186j.apps.googleusercontent.com`. El secreto se guarda únicamente en el proveedor Google de Supabase Auth; no se incluye en el repositorio, Vercel ni este documento.
- Google Auth está habilitado en Supabase. La interfaz permite iniciar con Google y conserva el enlace de acceso por correo.
- El dominio de producción confirmado en Vercel es `https://visualcorp-suite.vercel.app`; Vercel muestra las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` ya creadas. No se revelaron sus valores.
- Callback registrado en Google: `https://iomdmclkimfmvlzcrkyz.supabase.co/auth/v1/callback`.
- Orígenes registrados en el cliente web de Google: `https://visualcorp-suite.vercel.app` y `http://127.0.0.1:5173` para desarrollo local.
- Consentimiento aceptado por el propietario. La app permanece en estado «Prueba» y las dos cuentas principales ya se agregaron como usuarios de prueba.
- Supabase Auth tiene como Site URL `https://visualcorp-suite.vercel.app` y permite `https://visualcorp-suite.vercel.app/**` y `http://127.0.0.1:5173/**`. El cliente de Google conserva el callback `https://iomdmclkimfmvlzcrkyz.supabase.co/auth/v1/callback`.
- La app Google sigue en estado «Prueba» y permite iniciar sesión solo a las dos cuentas de prueba registradas. Para incorporar más cuentas, agregarlas en Usuarios de prueba de Google Cloud.
- La migración `20261022165634_bootstrap_primary_admins` ya está aplicada y asigna roles solo a identidades con correo confirmado: `visualcorp.publicidad.marketing@gmail.com` recibe `owner`; `estebanico10@gmail.com` recibe `admin` y `website_admin`. Supabase reportaba cero perfiles antes de activarla, por lo que cada cuenta debe iniciar sesión una vez para que se cree su perfil.
- La dirección visual del Plan v02 está presentada como prototipo revisable en `docs/design-v02/`; no cambia la aplicación ni se publica como parte de la interfaz del producto.

## Auditoría del flujo POS e inventario — 22 de octubre de 2026

- Diagnóstico local en `docs/AUDITORIA_TECNICA_POS_INVENTARIO_2026-10-22.md`; contrastado con las tablas y funciones del proyecto Supabase VISUAL.
- Decisión confirmada por el usuario: reservar/descontar el artículo físico al confirmar la orden, incluso si queda saldo pendiente.
- Clasificación de productos/variantes pendiente; criterio seguro de trabajo mientras tanto: solo una variante asignada explícitamente al inventario puede generar un movimiento de stock.
- Fase técnica aplicada: venta y salida de stock atómicas, reintento seguro, vínculo explícito del catálogo con variante/sucursal, alta de cliente desde POS, registro inicial y posterior de abonos. La cantidad POS se limita a unidades enteras hasta verificar conversiones por familia.
- Pendiente antes del uso amplio: crear vínculos después del conteo físico, validar roles/sucursales, y ensayar caja y bodega con usuarios. Turnos de caja, devoluciones, unidades fraccionadas, producción y cierre requieren reglas operativas aprobadas.

## Seguridad y procedencia

- El repositorio es público. No subir `.env`, claves de servicio, contraseñas, exportaciones locales de clientes ni archivos brutos de inventario.
- Un token de GitHub fue pegado anteriormente en el chat: revocarlo en GitHub y no reutilizarlo.
- No publicar stock confirmado hasta completar conteo. Mantener los libros y capturas originales; la cola conserva los datos leídos para conciliación.
- El catálogo se copió solamente desde `public.quote_calculator_products` de `estebanico.com`; tablas académicas, credenciales y datos ajenos a Visual Corp se excluyeron.
