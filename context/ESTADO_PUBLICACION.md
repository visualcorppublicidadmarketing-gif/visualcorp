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
- Ficha ampliada de inventario: tipo, tags, URL de imagen de referencia y objeto JSON editable para campos futuros; tabla/tarjetas/métricas y filtros por sucursal, área, tipo, estado y tag.
- Abastecimiento y uso: última compra derivada del último movimiento de recepción; días desde la entrada, consumos a 30 días e históricos salen del libro de movimientos. Sin registro significa dato desconocido, no cero.
- Reservas: unidades reservadas y disponibilidad (stock menos reserva) por variante, sucursal y ubicación; RPC auditada y rol restringido. La RPC de POS utiliza el saldo disponible al decidir si la venta requiere compra urgente.
- Costos: se guarda historial de los cambios posteriores a esta migración, con proveedor y actor; no se reconstruyen precios históricos anteriores.
- Migraciones de ampliación `20261022174504_inventory_catalog_metrics` y `20261022180025_inventory_metrics_fk_indexes` aplicadas en Supabase. Al aplicar: 70 artículos en catálogo, 0 saldos físicos contados; las 749 filas de fuente siguen pendientes de conciliación.

## Accesos internos

- `/admin`: administración de la página pública, protegida por el rol `website_admin`.
- `/operaciones`: POS y gestión interna, protegidos por roles de operación.
- `/operaciones/equipo`: propietario/admin puede asignar roles tras el primer inicio de sesión de cada cuenta.
- El acceso conserva enlace de un solo uso por correo y añade Google OAuth. Las identidades principales están sujetas a los roles definidos por la migración `20261022165634_bootstrap_primary_admins`; cada cuenta necesita iniciar sesión una vez para que Auth cree su perfil y se aplique el rol inicial. El propietario puede asignar después los perfiles internos restantes.
- Los costos de inventario siguen protegidos por permisos de base de datos. No hay contraseñas ni claves privadas guardadas en el repositorio.

## Publicación y límites actuales

- Las migraciones de POS/inventario recién aplicadas se guardan localmente con sus versiones remotas `20261022172435`, `20261022172638`, `20261022173445`, `20261022173630`, `20261022174504` y `20261022180025`.
- La compilación de producción de Vite pasó después de conectar Auth, catálogo, solicitudes públicas, clientes, POS y movimientos transaccionales. Vite muestra una advertencia de paquete principal mayor a 500 kB.
- El asesor de seguridad marca RPC `SECURITY DEFINER` accesibles a usuarios autenticados; las funciones de operación validan sesión y rol/sucursal dentro de la función. La RPC de reservas es solo para `authenticated`, valida permisos y no se ejecuta como `anon`. El asesor de rendimiento mantiene recomendaciones informativas de índices y políticas.
- El commit `dd9e3fb858cc60dc2129466a99ad41e648e24cba` se publicó en `main`. La compilación local de producción pasó; Vite advierte que el paquete principal supera 500 kB. Se comprobó en el navegador que `https://visualcorp-suite.vercel.app/admin` entrega la versión actual y muestra el acceso con Google y el enlace por correo. La API de gestión de Vercel no permitió consultar el detalle del despliegue en esta sesión.
- La fase POS/inventario se publicó en `main` con el commit `5a6cfef`. GitHub reportó el estado de Vercel como exitoso. La ruta de acceso interno `https://visualcorp-suite.vercel.app/operaciones/pos` respondió y el paquete público incluye el registro de abonos y los vínculos de inventario.
- El catálogo avanzado de inventario, la auditoría de reservas/costos y sus métricas se publicaron en `main` con el commit `483136c7d380eeb8a0532b6ef05f575d35658a81`. GitHub reportó Vercel exitoso; `/operaciones/inventario` respondió HTTP 200 y el paquete público incluye los tres modos, la interfaz de reserva y las métricas.
- El panel web, solicitudes públicas, catálogo, movimientos del inventario, clientes, ventas, pagos y cotizaciones centrales usan Supabase. No hay vínculos producto-variante preasignados: el equipo autorizado debe configurarlos tras cotejar existencia física y variante. Las filas importadas siguen pendientes de conciliación y no se deben usar para prometer stock.
- Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` aparecen configuradas en Vercel. El propietario y el administrador deben completar su primer inicio de sesión para crear y activar sus perfiles.

## Fases operativas conectadas — 22 de octubre de 2026

- La ruta `/operaciones/flujos` incorpora caja y cierres, devoluciones/anulaciones, transferencias con recepción parcial, órdenes de producción y cotizaciones centrales enlazables al POS.
- Migraciones Supabase aplicadas: `20261022182015_pos_operations_lifecycle`, `20261022182145_quote_sale_links_and_cash_guard`, `20261022182319_atomic_transfer_request_customer_match`, `20261022182606_operations_lifecycle_fk_indexes`, `20261022182650_sale_refund_settlement` y `20261022183221_lifecycle_fk_indexes`.
- Sin operaciones ficticias. Se mantiene pendiente el ensayo controlado con usuarios reales. No se procesa dinero de reembolso externamente ni se factura tributariamente. La producción registra consumos explícitos, no recetas automáticas.
- Evidencia y límites: [`../docs/FASES_OPERATIVAS_COMPLETADAS_2026-10-22.md`](../docs/FASES_OPERATIVAS_COMPLETADAS_2026-10-22.md).
- Publicación: commit `3365e65c4e20ac3f22a08d1f17e44668130c51e9`; Vercel reportó producción `READY` con alias `visualcorp-suite.vercel.app`. La ruta `/operaciones/flujos` respondió HTTP 200 con la app SPA; el panel requiere una sesión y rol interno autorizado.

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

## Novedades internas — 22 de octubre de 2026

- Se agregó un changelog común en Supabase, administrable desde `/admin/cambios` y consultable desde `/operaciones/cambios`. El resumen de publicaciones también aparece en los paneles principales y se actualiza en tiempo real.
- Las entradas admiten borrador, publicación, edición, archivo, categoría, etiqueta de versión y audiencia (ambos paneles, solo administración o solo operaciones). RLS limita lectura por audiencia/rol y gestión a perfiles administrativos autorizados.
- Se publicaron entradas iniciales para inventario, POS y flujos operativos conectados, junto con la propia función del changelog.
- Migraciones aplicadas: `20261022184130_internal_change_log` y `20261022184223_publish_changelog_feature`.
- Guía de uso y límites: [`../docs/CHANGELOG_INTERNO.md`](../docs/CHANGELOG_INTERNO.md).

## Comparación Odoo y responsive — 22 de octubre de 2026

- Análisis y plan maestro por fases 0–9 en [`../docs/ANALISIS_ODOO_Y_ROADMAP_2026-10-22.md`](../docs/ANALISIS_ODOO_Y_ROADMAP_2026-10-22.md), con dependencias y criterios de cierre por fase.
- Odoo destaca POS multidevice, cajeros, pagos, modo sin conexión, fidelización y conexión con inventario/comercio electrónico. Visual Corp ya integra ventas, clientes, inventario, cotizaciones, CRM, caja, devoluciones, transferencias y producción; compras/proveedores, caja multiartículo, escaneo, offline robusto, trazabilidad por lote y contabilidad son brechas priorizadas.
- Mejora inicial de interfaz: menú accesible para teléfono y tabletas de hasta 1100 px, con cierre por Escape; capa visual compartida para Admin Web, Operaciones y POS con tarjetas modulares, controles táctiles y foco visible. La novedad se publicó en el changelog compartido. Siguiente secuencia: validación visual en dispositivos y conciliación de inventario antes de activar compras/proveedores.
