# Visual Corp Suite

Aplicación web de Visual Corp para su sitio público y herramientas internas de administración y operaciones. Comparte una base de componentes y estilos; las páginas activas están organizadas en módulos React con TypeScript.

## Requisitos

- Node.js 22 o superior.
- npm, incluido con la instalación oficial de Node.js.

## Desarrollo local

En esta carpeta, instala las dependencias y arranca Vite:

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Para validar los tipos y generar la compilación de producción:

```powershell
npm run typecheck
npm run build
```

La compilación de producción se puede previsualizar con `npm run preview`. El comando `npm run build:checked` ejecuta la comprobación de tipos antes de compilar.

## Configuración de Supabase

Crea `.env.local` a partir de `.env.example` y configura `VITE_SUPABASE_URL` junto con `VITE_SUPABASE_PUBLISHABLE_KEY`. También se acepta `VITE_SUPABASE_ANON_KEY` para proyectos existentes. Estas variables públicas no sustituyen las políticas de acceso: activa y valida RLS en Supabase. Nunca pongas una clave `service_role` en el navegador ni en variables `VITE_*`.

La aplicación admite un modo local para los datos del espacio de trabajo cuando no hay variables de Supabase; se conservan en `localStorage` del navegador. Los paneles privados requieren Supabase Auth y los roles correspondientes. Con Supabase configurado, la aplicación consulta o guarda datos remotos según cada módulo; los datos guardados localmente no se sincronizan automáticamente entre dispositivos.

Las migraciones versionadas están en `supabase/migrations/`. Revisa el estado local y remoto antes de aplicar cambios. El despliegue web de Vercel no ejecuta migraciones: sigue el procedimiento de `docs/FLUJO_TRABAJO_EN_PARALELO_Y_PUBLICACION.md` y la guía de datos en `docs/MIGRACION_Y_RESPALDOS.md`.

## Rutas principales

- Sitio público: `/`, `/servicios`, `/nosotros`, `/como-trabajamos`, `/contacto`, `/cotizador`, `/tienda`, `/portafolio`, `/blog` y `/publicaciones`.
- Administración: `/admin`, `/admin/sitio`, `/admin/contenido` y `/admin/solicitudes`.
- Operaciones: /operaciones, /operaciones/pos, /operaciones/cotizador, /operaciones/inventario, /operaciones/compras, /operaciones/clientes y /operaciones/marketing.

Los perfiles configurables y la matriz de permisos ya están aplicados en Supabase con validación de servidor y RLS. Consulta [docs/MODELO_USUARIOS_ROLES_Y_PERMISOS_VISUAL_CORP.md](docs/MODELO_USUARIOS_ROLES_Y_PERMISOS_VISUAL_CORP.md) para el flujo de asignación, los límites de cuentas y el estado de verificación. Una cuenta nueva debe iniciar sesión una vez antes de que se le pueda asignar un perfil.

Las páginas privadas requieren una sesión válida y el rol correspondiente cuando Supabase está configurado.

## Estructura del código

- `src/App.tsx`: rutas y composición de la aplicación.
- `src/app/`: contexto de datos compartidos y estructura visual.
- `src/components/`: componentes reutilizables de administración y operaciones.
- `src/pages/admin/` y `src/pages/pos/`: páginas y flujos internos.
- `src/public-site/`: páginas públicas, componentes del sitio y cotizador.
- `src/lib/`, `src/data/` y archivos `.ts`: reglas de negocio, acceso a datos, modelos y contenido que no son componentes visuales.
- `src/legacy-reference/`: código antiguo conservado como referencia; no forma parte de las rutas activas.

Los componentes visuales usan `.tsx`; los módulos de lógica, datos y estilos mantienen la extensión que corresponde a su contenido (`.ts`, `.json` o `.css`). No conviertas un archivo de lógica a `.tsx` si no contiene JSX.

## Flujo de cambios y publicación

GitHub Actions instala las dependencias con `npm ci --no-audit --no-fund` y ejecuta `npm run build` en cada pull request y actualización de `main`. Vercel está vinculado al repositorio `visualcorppublicidadmarketing-gif/visualcorp`, usa `main` como rama de producción y despliega los cambios de GitHub automáticamente. `vercel.json` declara `git.deploymentEnabled: true` y el workflow lo verifica para evitar que una modificación del repositorio apague los despliegues sin detectarlo. La opción de crear despliegues desde Git también debe permanecer habilitada en Vercel. La publicación de cambios de base de datos se revisa y ejecuta por separado; no se incluye en el build de Vercel.

Consulta `docs/FLUJO_TRABAJO_EN_PARALELO_Y_PUBLICACION.md` para el flujo detallado y `docs/SISTEMA_VISUAL_COMPARTIDO.md` para los estilos compartidos.

## Referencias conservadas

La carpeta `src/legacy-reference/` contiene material de referencia. No importes sus datos, tarifas, migraciones ni activos en Visual Corp sin cotejar su procedencia y vigencia. Los precios y especificaciones comerciales deben permanecer pendientes hasta confirmarlos con una fuente vigente.

## Continuidad del trabajo

- **Diseño de Marketing (30 de octubre de 2026):** rama `codex/marketing-interface-20261030` sobre `origin/main`. Se pulieron filtros y navegación semanal, tarjetas, estados semánticos, tabla y ficha de publicación; se reorganizó el bloque de imagen y se añadió señalización accesible de datos faltantes al marcar una ficha como publicada. `npm run build:checked` y `git diff --check` pasan. Pendiente revisar en sesión autenticada e integrar mediante PR; sin publicación en producción.

- **Acceso al manual (26 de octubre de 2026):** PR #96 integró la biblioteca y sus 43 recursos estáticos. Esta corrección valida en Vercel los roles internos antes de servir `/manual-aprendizaje/fuente/*` y marca la respuesta como privada, sin caché. El contenido quedó en el historial de dos repositorios públicos; bloquear el acceso web no sanea las copias de GitHub. Seguimiento en [docs/manual-aprendizaje/README.md](docs/manual-aprendizaje/README.md).

- **Inicio y componentes (26 de octubre de 2026):** en la rama local `codex/home-components-20261026`, los seis servicios activos adoptan una composición tipo Bento adaptable. El bloque de contenido de Inicio prioriza casos de portafolio ya publicados con portada; actualmente Supabase no tiene artículos publicados, por lo que no muestra fotografías ni casos inventados. Typecheck, build, revisión responsive y navegación de una tarjeta correctos. Detalle y siguiente paso en [docs/home-components-20261026/README.md](docs/home-components-20261026/README.md). Sin publicación.

- **Caja y POS (26 de octubre de 2026):** el trigger que vincula pagos en efectivo bloquea el mismo turno que usa el cierre para calcular el esperado. Así, el pago confirma antes del arqueo o se rechaza si el turno ya se cerró; no puede quedar aplicado después con un cierre incompleto. La migración `20261026140939_cash_payment_close_lock.sql` ya está aplicada y verificada en Supabase.

- **Objetivo vigente:** mantener el sitio público, la administración y las herramientas POS en TypeScript, con componentes `.tsx` reutilizables y un sistema visual compartido. El cotizador debe mostrar precios en tiempo real para las opciones normal, con instalación y corporativo, y admitir cálculos por medidas o por cantidad.
- **Estado del código:** las páginas activas usan TSX; los `.jsx` restantes son referencias antiguas. Hay componentes y rutas compartidas, pero algunas pantallas POS siguen siendo archivos grandes y pueden dividirse por etapas.
- **Verificación del lote integrado (23 de octubre de 2026):** `npm ci --no-audit --no-fund`, `npm run build` y `git diff --check` pasan desde la combinación con el `main` actualizado. `npm run typecheck` aún reporta errores en módulos TypeScript existentes y no se presenta como verificación aprobada; el flujo de CI mantiene la compilación de producción como check hasta corregir esa deuda.
- **Corrección de tipos (23 de octubre de 2026):** `npm run typecheck` ahora pasa tras corregir estados de formularios, tipos de consultas y callbacks, referencias del inventario y atributos numéricos JSX. GitHub Actions ejecuta el chequeo de tipos y la compilación de producción en cada PR y push a `main`. Esta corrección está local y pendiente de integrar; no cambia la publicación existente.
- **Producción (23 de octubre de 2026):** Vercel CLI quedó vinculado al equipo `visual19` y al proyecto `visualcorp-suite` (`prj_pWnjaQchg77ZPR9nNAlUucVvAVJh`). Se publicó el bundle del sitio, junto con la corrección responsive del bloque «Cajero registrado» en POS. Las rutas públicas y de operaciones respondieron HTTP 200; Cotizador y POS cargaron con sesión autenticada y Supabase conectado. No se registraron ventas ni se aplicaron migraciones.
- **Integración del código:** el lote se reconstruyó sobre el `main` vigente para conservar las mejoras remotas de perfiles, CRM y compras; el public site y los flujos POS locales se reaplicaron encima. El flujo de GitHub Actions usa instalación reproducible con npm y build de producción; las migraciones de Supabase siguen separadas del despliegue web.
- **Revisión de dependencias pendientes (23 de octubre de 2026):** el diff del checkout cambia etiquetas `latest` por rangos concretos para React, Vite, React Router, Lucide y el plugin de React; el lockfile resuelve 29 actualizaciones transitivas y añade registros de dependencias opcionales del CLI de Supabase. El análisis encontró usos directos de React, React Router, Lucide, Supabase JS, Tiptap, jsPDF, `sharp` y el CLI de Supabase. Conviene conservar las dependencias usadas y revisar el manifiesto junto con su lockfile antes de integrar. Las otras copias de trabajo consultadas tienen manifiestos más antiguos; no mezclar sus lockfiles a ciegas. Las capturas mencionadas no estuvieron disponibles en el lector de archivos, así que este análisis se basó en el diff y los imports del repositorio.
- **Punto de venta (24 de octubre de 2026):** se reorganizó localmente la pantalla de caja para priorizar el formulario de venta y mostrar órdenes en espera y recientes en una columna lateral, con adaptación a móvil. Se añadieron estados vacíos para el catálogo, una alternativa a imágenes de producto rotas y mensajes que explican por qué no se puede confirmar una venta, incluido el turno de caja. Typecheck, build y `git diff --check` pasan; el cambio no está publicado.
- **Navegación del panel (24 de octubre de 2026):** se agruparon los accesos laterales por tarea, con iconos, conteos de páginas, despliegue accesible y apertura automática del grupo de la ruta activa. Los accesos y conteos se construyen después de aplicar los permisos del usuario. Escritorio y menú móvil usan el mismo agrupamiento. `npm run typecheck`, `npm run build` y `git diff --check` pasan; cambio local, sin publicar.
- **Navegación pública (24 de octubre de 2026):** se renovó localmente el menú del sitio en `src/public-site/PublicSite.tsx` y `src/public-site/public-navigation.css`: superficies oscuras opacas con contraste legible, estados activos/hover/foco, cotización destacada, paneles de Servicios y Empresa, enlace de Publicaciones en escritorio y cierre coherente al cambiar de tamaño. Se verificó en navegador a 1440×900 y 390×844; Escape cierra el panel y devuelve el foco. `npm run build:checked` pasa. Cambio local, pendiente de integrar/publicar.
- **Footer público (24 de octubre de 2026):** se rediseñó `src/public-site/PublicSite.tsx` con estilos específicos en `src/public-site/public-footer.css`: enlaces agrupados, canales directos y un único CTA de cotización, con superficies animadas y respeto por `prefers-reduced-motion`. Se tomó como referencia el brillo de Magic UI y se implementó sin añadir dependencias. Verificado a 320, 390, 768 y 1440 px sin desbordamiento horizontal; `npm run build:checked` pasa. Cambio local, pendiente de integrar/publicar.
- **Inventario y anchos de rollo (24 de octubre de 2026):** se corrigió la creación de filas sin stock que repetía variantes en todas las sucursales. Las fichas pendientes aparecen una vez con sucursal por asignar; el equipo puede asignarla antes del conteo o de registrar movimientos. La vista agrupa nombres coincidentes sin fusionar fichas, áreas, variantes ni saldos. Se preparó `supabase/migrations/20261024060604_inventory_roll_width_variants.sql` con opciones de 107, 127 y 310 cm para rollos de vinil y lona; no crea stock ni se aplicó a producción. Los placeholders solo se desactivan si no hay referencias operativas, incluido historial de costos. Cambio local, pendiente de integrar y de aplicar la migración por separado.
- **Siguiente paso:** integrar y publicar esta corrección cuando se solicite. Mantener las migraciones de Supabase como paso manual y separado.
- **Componentes visuales y paneles (24 de octubre de 2026):** se añadieron componentes reutilizables inspirados en Magic UI con Motion: transición entre rutas, progreso de lectura, spotlight, listas escalonadas, contadores y BorderBeam. Se integraron en páginas públicas, tarjetas de servicio y contenido, métricas de administración, accesos operativos e insights del inventario. El movimiento respeta `prefers-reduced-motion`; los valores monetarios no se animan. Se corrigió el filtrado de accesos y datos por permisos, el destino del acceso al catálogo y las descripciones de los módulos. `npm run build:checked` y `git diff --check` pasan. Verificado en móvil de 390 px, sin desbordamiento en Inicio, Servicios y Cómo trabajamos; movimiento reducido activado y sin errores de consola. Cambio local, no publicado.
- **Integración del Tracking de Marketing (24 de octubre de 2026):** se revisó `apps/tracking-contenido` y su SQLite local (64 publicaciones, biblioteca de artes vinculados, checklist, perfiles y resultados). Las rutas `/admin/marketing` y `/operaciones/marketing` presentan el Tracking como fuente de publicaciones, detectan si responde en este equipo y abren el calendario original en otra pestaña, manteniendo su sesión y permisos. La planificación general de la suite se conserva aparte para evitar duplicar cada publicación. Es una integración local, sin copia de la base ni sincronización con Vercel. Typecheck, compilación y `git diff --check` pasan. La pantalla final quedó tras autenticación y no se pudo revisar visualmente sin iniciar sesión. Cambio local, no publicado.

- Migración e integración de Tracking (24 de octubre de 2026): se copiaron a Supabase las publicaciones, 1.900 metadatos de biblioteca, relaciones, FODA, resumen agregado de ventas y tareas con historial; conteos y llaves foráneas se verificaron. La Suite tiene pestañas para resumen, calendario, biblioteca, estrategia, operación y resultados; permite crear y editar publicaciones según permiso, con bitácora de cambios. No se copiaron cuentas/sesiones ni archivos binarios; la SQLite original queda intacta y no hay sincronización posterior. npm run build:checked pasó. Google rechazó el inicio de sesión en esta sesión automatizada, así que el navegador no llegó a mostrar registros autenticados. Cambio local, sin publicar.

### Seguimiento operativo y traspasos de producción — 2026-10-26

- **Implementado localmente** en `codex/operations-flows-next-20261024`: la orden de producción puede vincularse a una venta confirmada y muestra el acceso a su ficha CRM; al crearla admite instrucción, área, prioridad, fecha prevista, persona responsable y siguiente paso.
- **Traspasos:** edición de responsable/área/plazo/instrucción/siguiente paso mediante una RPC atómica que valida acceso activo del responsable a la sucursal y deja evento con actor y nota. La migración `20261026140932_production_handoffs.sql` añade `next_step` y valida también asignaciones al crear órdenes. Los cambios de estado a bloqueada, calidad, lista, completada o cancelada exigen nota; el historial de estados y traspasos queda visible en cada orden.
- **Bandeja de Operaciones:** filtros Todos/Hoy/Atrasados/Bloqueados y sucursal, búsqueda sin tildes y por varios términos, carga gradual de pendientes, más prioridad para producción bloqueada y referencias del responsable y siguiente paso.
- **Caja:** arqueo ciego en la pantalla del cajero: ya no consulta ni muestra importes de pagos y movimientos para construir el esperado antes del conteo. El servidor revela esperado y diferencia al cerrar. El historial de cierres y las vistas de Finanzas conservan sus permisos actuales.
- **Verificación local:** `npm run build:checked` (TypeScript y Vite) y `git diff --check` correctos. Las migraciones `20261026140932_production_handoffs.sql` y `20261026140939_cash_payment_close_lock.sql` están aplicadas y verificadas en Supabase. No se ejecutaron RPC, escrituras de caja/producción ni conteos reales.
- **Pendiente operativo:** aceptar el nuevo recorrido con el equipo y validar permisos con una sesión real; los registros de demostración no representarían ventas ni producción reales.

### Caja: señales de estado y arqueo — 2026-10-26

- Rediseño de Flujos → Caja con estado de turno, secuencia Abrir → Contar → Conciliar, importe contado destacado, ayuda para el cierre e historial con etiquetas de cuadre. Mantiene el arqueo ciego y la interfaz responsive.
- POS incorpora acceso directo a abrir o cerrar el turno desde la pantalla de caja. La sucursal y el usuario siguen asociados al turno.
- `npm run build:checked` y `git diff --check` correctos. No se ejecutaron pagos ni cierres reales durante la verificación.
