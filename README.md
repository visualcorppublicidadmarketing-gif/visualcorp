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
- Operaciones: `/operaciones`, `/operaciones/pos`, `/operaciones/cotizador`, `/operaciones/inventario`, `/operaciones/compras` y `/operaciones/clientes`.

El modelo adaptado de usuarios, perfiles y permisos —incluidas las plantillas propuestas y los pasos pendientes para aplicarlas con RLS— está en [docs/MODELO_USUARIOS_ROLES_Y_PERMISOS_VISUAL_CORP.md](docs/MODELO_USUARIOS_ROLES_Y_PERMISOS_VISUAL_CORP.md). La matriz documentada no se activa hasta implementar y aplicar sus controles de servidor/base de datos.

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

GitHub Actions instala las dependencias con `npm ci --no-audit --no-fund` y ejecuta `npm run build` en cada pull request y actualización de `main`. Vercel está configurado para instalar el proyecto con npm y desplegar la aplicación desde GitHub. La publicación de cambios de base de datos se revisa y ejecuta por separado; no se incluye en el build de Vercel.

Consulta `docs/FLUJO_TRABAJO_EN_PARALELO_Y_PUBLICACION.md` para el flujo detallado y `docs/SISTEMA_VISUAL_COMPARTIDO.md` para los estilos compartidos.

## Referencias conservadas

La carpeta `src/legacy-reference/` contiene material de referencia. No importes sus datos, tarifas, migraciones ni activos en Visual Corp sin cotejar su procedencia y vigencia. Los precios y especificaciones comerciales deben permanecer pendientes hasta confirmarlos con una fuente vigente.

## Continuidad del trabajo

- **Objetivo vigente:** mantener el sitio público, la administración y las herramientas POS en TypeScript, con componentes `.tsx` reutilizables y un sistema visual compartido. El cotizador debe mostrar precios en tiempo real para las opciones normal, con instalación y corporativo, y admitir cálculos por medidas o por cantidad.
- **Estado del código:** las páginas activas usan TSX; los `.jsx` restantes son referencias antiguas. Hay componentes y rutas compartidas, pero algunas pantallas POS siguen siendo archivos grandes y pueden dividirse por etapas.
- **Verificación del lote integrado (23 de octubre de 2026):** `npm ci --no-audit --no-fund`, `npm run build` y `git diff --check` pasan desde la combinación con el `main` actualizado. `npm run typecheck` aún reporta errores en módulos TypeScript existentes y no se presenta como verificación aprobada; el flujo de CI mantiene la compilación de producción como check hasta corregir esa deuda.
- **Producción (23 de octubre de 2026):** Vercel CLI quedó vinculado al equipo `visual19` y al proyecto `visualcorp-suite` (`prj_pWnjaQchg77ZPR9nNAlUucVvAVJh`). Se publicó el bundle del sitio, junto con la corrección responsive del bloque «Cajero registrado» en POS. Las rutas públicas y de operaciones respondieron HTTP 200; Cotizador y POS cargaron con sesión autenticada y Supabase conectado. No se registraron ventas ni se aplicaron migraciones.
- **Integración del código:** el lote se reconstruyó sobre el `main` vigente para conservar las mejoras remotas de perfiles, CRM y compras; el public site y los flujos POS locales se reaplicaron encima. El flujo de GitHub Actions usa instalación reproducible con npm y build de producción; las migraciones de Supabase siguen separadas del despliegue web.
- **Revisión de dependencias pendientes (23 de octubre de 2026):** el diff del checkout cambia etiquetas `latest` por rangos concretos para React, Vite, React Router, Lucide y el plugin de React; el lockfile resuelve 29 actualizaciones transitivas y añade registros de dependencias opcionales del CLI de Supabase. El análisis encontró usos directos de React, React Router, Lucide, Supabase JS, Tiptap, jsPDF, `sharp` y el CLI de Supabase. Conviene conservar las dependencias usadas y revisar el manifiesto junto con su lockfile antes de integrar. Las otras copias de trabajo consultadas tienen manifiestos más antiguos; no mezclar sus lockfiles a ciegas. Las capturas mencionadas no estuvieron disponibles en el lector de archivos, así que este análisis se basó en el diff y los imports del repositorio.
- **Siguiente paso:** corregir por etapas los errores que aún detecta `npm run typecheck` y después añadirlo al workflow de integración continua. Mantener las migraciones de Supabase como paso manual y separado.
