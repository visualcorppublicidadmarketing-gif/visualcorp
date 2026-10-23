# Visual Corp — suite web local

Prototipo funcional local de tres experiencias: sitio público, administración web y herramientas de operación. Se ejecutan bajo una misma aplicación y comparten datos en el navegador para validar los flujos antes de conectar servicios externos.

## Abrir

Requiere Node.js y npm instalados.

También puedes abrir `Iniciar Visual Corp Suite.bat`; si `node_modules` no existe, instalará las dependencias con `npm install` y luego iniciará el servidor local.

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Vite muestra la dirección local al iniciar. Abre estas rutas:

- `/` — inicio público de Visual Corp.
- `/servicios` y `/servicios/:familia` — índice y subpáginas de familias de trabajo.
- `/nosotros` y `/como-trabajamos` — páginas institucionales y del proceso de atención.
- `/contacto` — canales directos y formulario conectado al CRM local.
- `/cotizador` — solicitud pública de cotización, con selección inicial desde cada subpágina de servicio.
- `/admin` — resumen administrativo.
- `/admin/sitio` — textos y servicios de la página pública.
- `/admin/solicitudes` — CRM y propuestas.
- `/admin/catalogo` — catálogo Visual Corp y confirmación de tarifas.
- `/admin/marketing` — borradores de campaña.
- `/admin/respaldo` — exportación y combinación segura de datos locales, además de la secuencia de migración.
- `/operaciones` — centro de operaciones.
- `/operaciones/pos` — registro local de ventas.
- `/operaciones/cotizador` — propuestas con tarifas que sigan pendientes de confirmar.
- `/operaciones/inventario` — existencias por sucursal, área, variante y ubicación; movimientos con responsable, conteo físico, alertas y transferencias.
- `/operaciones/clientes` — directorio local de clientes, también disponible al registrar ventas.
- `/operaciones/crm` y `/operaciones/marketing` — módulos compartidos con administración.

## Organización

- `src/public-site/`: experiencia pública independiente de los espacios admin y operaciones, con navegación agrupada y páginas por ruta.
- `src/app/workspace.jsx`: datos compartidos y persistencia local.
- `src/App.jsx`: rutas y páginas de las tres experiencias.
- `src/app.css`: sistema visual y componentes responsive.
- `src/design-system.css`: ajustes visuales compartidos de las vistas activas; [alcance y verificación](docs/SISTEMA_VISUAL_COMPARTIDO.md).
- `src/data/visualcorpCatalog.json`: copia de trabajo del catálogo del cotizador de Visual Corp, conservando su estado de tarifa pendiente.
- `public/brand/`: logotipo y símbolo de Visual Corp.
- `public/fonts/`: tipografía Bebas Kai para titulares.
- Flujo de trabajo en paralelo, pull requests, vistas previas y migraciones: `docs/FLUJO_TRABAJO_EN_PARALELO_Y_PUBLICACION.md`.

El repositorio origen fue `E:\CODE\Giga`. Se copió su código React/Vite como base, y el contenido activo de esta versión parte de una interfaz de Visual Corp. Sus pantallas anteriores permanecen fuera de las rutas activas. Se excluyeron `.env.local`, `.env`, Git, dependencias instaladas, compilaciones, configuración de GitHub y carpetas privadas de recursos. El material de referencia de Giga conservado en `src/legacy-reference/` no se importa en la app; no uses sus migraciones, datos, logotipos, fotos ni valores de demostración en Visual Corp. El CRM de Iglesia Jerusalén solo aportó patrones de organización por dominio; no se importaron sus datos ni políticas de permisos.

## Estado de datos y límites actuales

- Los cambios se guardan en `localStorage` de este navegador. No se comparten entre equipos; las pestañas abiertas en el mismo origen reciben cambios.
- Antes de conectar Supabase, exporta cada navegador desde `/admin/respaldo`. Los archivos JSON se guardan en `backups/`, carpeta excluida de Git. La guía de conexión está en `docs/MIGRACION_Y_RESPALDOS.md`.
- Los formularios del sitio alimentan el CRM local. Crear una cotización con contacto genera también una oportunidad ligada. El POS permite seleccionar un cliente guardado o crear uno nuevo, asociar artículo/variante/sucursal y cantidad; descuenta solo unidades disponibles y registra faltantes urgentes por separado.
- El inventario incluye 70 artículos sugeridos para Impresión, Sublimación, Troquelado, Láser, Taller, Neones y Bodega general. Son una guía para completar el catálogo, con cantidad cero, ID `VC-INV-<AREA>-<NÚMERO>` y estado “existencia por verificar”; no confirman compra, especificación ni stock físico. El diagnóstico y el estado de las fuentes están en `docs/inventario/`.
- Los artículos que se agreguen desde la pantalla reciben un ID legible consecutivo por área. No se asignan costos ni precios de compra.
- Las 252 filas del catálogo quedan inicialmente sin precio confirmado. Se pueden revisar y confirmar a mano desde Catálogo; usa esa acción solo tras cotejar la tarifa vigente.
- La navegación pública organiza las familias con páginas de detalle. Desde cada una se puede abrir el cotizador con la familia preseleccionada; las solicitudes quedan en el mismo CRM local.
- El sitio usa la dirección, ciudad, redes y teléfono confirmados en el contexto de Visual Corp. Horarios, precios, impuestos, plazos y garantías no se inventan.
- La instancia no tiene autenticación, roles, base compartida, copias de seguridad, facturación electrónica ni emisión de comprobantes. Admin y Operaciones son pantallas locales de preparación; no exponer esta instancia a internet hasta implementar acceso y permisos.
- Campañas, aprobaciones y ventas son registros internos. No se publica contenido ni se envían mensajes a clientes.
- El POS es un control operativo local, no un sistema contable ni tributario.

## Siguiente fase de conexión

La aplicación no contiene URL, proyecto ni credenciales de Supabase, GitHub o Vercel. Antes de conectarlos: separar dominios de acceso público, administración y operación; implementar autenticación y permisos mínimos; crear un esquema Supabase de Visual Corp con políticas RLS por rol; mover persistencia de leads/cotizaciones/inventario/ventas a repositorios remotos; definir respaldos y bitácora; revisar los campos sensibles; y configurar los tres despliegues en Vercel. El documento `docs/ARQUITECTURA_Y_FASES.md` detalla la propuesta.
