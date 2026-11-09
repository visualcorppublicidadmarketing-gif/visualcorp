# Plan de diseño de la web pública · v03

**Fecha:** 23 de octubre de 2026. **Estado:** implementado en el checkout para revisión visual; sin publicación.

## Objetivo y recorrido

Ayudar a una persona que llega por primera vez a reconocer a Visual Corp, encontrar una familia de servicio y enviar una solicitud con contexto suficiente. El recorrido principal es Inicio → Servicios → detalle → cotización; Contacto ofrece WhatsApp, Instagram y formulario.

## Plan aplicado

1. **Portada:** mantener el titular y las acciones existentes; sustituir la tarjeta abstracta por Visualito auténtico, integrado en una escena oscura con luz y sombra. La imagen se entrega como WebP de 720 × 1080 y 56 KB, derivada de `docs/design-v02/assets/visualito.png`; el texto y los botones siguen siendo nativos y legibles.
2. **Jerarquía y marca:** usar base negra o blanca, degradado como acento, Bebas Kai en titulares breves y DM Sans en lectura. El símbolo original aparece sin redibujarlo. Aumentar cuerpo, botones y datos que estaban demasiado pequeños.
3. **Servicios:** conservar las seis familias existentes, diferenciarlas con iconos y destacar una tarjeta sin cambiar su oferta. Mantener la aclaración sobre alcance, materiales, disponibilidad y valores por proyecto.
4. **Páginas institucionales y Contacto:** hacer consistentes las cabeceras, las acciones y el cierre de cada página. Mostrar solo la dirección y los canales confirmados; mantener los formularios y su comportamiento existente.
5. **Verificación:** revisar Inicio, Servicios, detalle, Nosotros, proceso, Contacto y cotización a 1440, 390 y 320 px; comprobar imagen, fuentes, enlaces, menú, ausencia de desbordamiento horizontal y compilación.

## Verificación realizada

- Las siete rutas cargaron sin errores de página ni desplazamiento horizontal a 320, 390, 768 y 1440 px.
- Visualito cargó completo en la portada; se revisó la composición a escala de escritorio, tableta y móvil.
- El menú móvil cerró al navegar; el detalle de Rótulos preseleccionó esa familia en cotización; el botón de Contacto llevó al formulario.
- `vite build` terminó correctamente. La comprobación fue visual y de navegación; no se envió una solicitud real desde el formulario.

## Continuidad del trabajo

- **Referencia:** `E:\VISUAL CORP\00_Guia_y_contexto\GUIA_IDENTIDAD_VISUAL_DIGITAL_v02.md` y `docs/PLAN_REDISENO_SISTEMA_VISUAL_COMPARTIDO_v02_2026-10-22.md`.
- **Versión de trabajo:** v03 sobre las mejoras previas del sitio público en este checkout.
- **Datos conservados:** servicios, contenido editable de portada, teléfono e Instagram provenientes del estado de la aplicación; dirección confirmada en la guía comercial.
- **Pendiente:** revisión estética de la propuesta por la persona responsable. No hay aprobación ni publicación registrada.

## Continuación v04 · navegación pública

**Objetivo:** que el menú sea un punto de exploración de la oferta, visible y fácil de usar sobre la portada y las demás páginas.

1. Sustituir los desplegables pequeños por una barra flotante de vidrio claro, con contraste alto, logo original y cotización destacada.
2. Mostrar las seis familias en un panel amplio con iconos, nombres, descripciones breves y acceso a la página general de Servicios. Dar a La empresa un panel propio para Nosotros y Cómo trabajamos.
3. En móvil, presentar las rutas principales en primer nivel y las especialidades en tarjetas compactas. Mantener una acción clara para iniciar una cotización.
4. Comprobar cierre al navegar, al pulsar fuera y con Escape; comprobar foco, rutas, desbordamiento, visibilidad a 1440/900/390/320 px y compilación.

**Resultado en el checkout:** barra y paneles implementados. Se verificó visualmente el menú abierto en escritorio y móvil; se corrigió un recorte del panel móvil y se aumentó la opacidad del panel de escritorio para proteger la lectura sobre la portada. A 1440, 900, 390 y 320 px no hubo desbordamiento horizontal ni errores de página. Se comprobó el cierre con Escape y al pulsar fuera, el retorno del foco, el recorrido con Tab en móvil y el enlace a cotización. `vite build` y `git diff --check` terminaron correctamente. El cambio sigue sin publicarse.

## Continuación v05 · sistema glass y contenido público

**Fecha:** 23 de octubre de 2026. **Estado:** implementado en el checkout local; pendiente verificación visual y revisión del responsable.

- Se adaptó la referencia estética de estebanico.com al sistema de Visual Corp: base oscura, vidrio translúcido, acentos medidos del degradado corporativo, DM Sans para lectura y Bebas Kai para titulares breves. No se trasladaron recursos ni textos personales de Esteban Nicola.
- Se añadieron rutas públicas para Tienda, Portafolio, Blog y Publicaciones. Tienda lee la vista segura public_catalog_products; no muestra precios y envía a cotización. Blog, publicaciones y fichas de portafolio usan site_articles con etiquetas por tipo.
- Se añadió el panel /admin/contenido para crear y mantener entradas con la tabla existente, sin migración. Las reglas RLS de autor se respetan; entradas de otra persona quedan en solo lectura.
- La vista de portafolio queda vacía hasta que existan fichas verificadas, sin presentar mockups como proyectos reales.
- vite build terminó correctamente y las rutas principales respondieron HTTP 200 desde el preview. El navegador local mostró el HTML vacío sin montar React, por lo que la verificación visual del cliente queda pendiente de resolver el preview. No se desplegó ni se aplicaron migraciones.

## Continuación v06 — corrección de montaje y publicación

**Fecha:** 23 de octubre de 2026. **Estado:** listo para publicar desde GitHub; publicación pendiente.

- Se encontró y corrigió el error que impedía montar la aplicación: el enrutador TypeScript conservaba referencias a `ProtectedPage`, pero la migración había eliminado su implementación. Se recuperó como componente modular en `src/auth/ProtectedPage.tsx`.
- La compilación de producción usa Vite y queda separada del comando `typecheck`. El chequeo de tipos del checkout sigue reportando errores heredados en varios TSX que se renombraron desde JSX; se conserva como comando independiente para resolverlos por módulos sin bloquear el empaquetado. No se afirma que el chequeo de tipos esté limpio.
- Se verificó en navegador que Inicio, `/admin`, `/tienda` y `/blog` montan React y muestran su contenido o estado vacío esperado. No se enviaron formularios ni se crearon ventas o datos operativos.
- La lista remota de Supabase contiene las 37 migraciones del conjunto del proyecto; una entrada fue renombrada (`phase3_pos_parked_orders`/`pos_parked_orders`). No hay cambio de esquema en esta entrega y no se reaplicaron migraciones ya registradas.
- La publicación por API de Vercel requiere volver a autorizar el equipo `visual19`; el repositorio está conectado a despliegues automáticos desde `main`. La compilación de Vercel anterior falló por el paso de TypeScript indicado arriba.

## Continuación v07 — corrección de textos y verificación responsive

**Fecha:** 23 de octubre de 2026. **Estado:** correcciones aplicadas y verificadas en el checkout local; pendiente revisión estética y publicación.

- Se reparó la codificación de textos españoles en `PublicSite.tsx`, `content.ts` y `public-site-v2.css`; ya no aparecen las secuencias de caracteres dañados en esos archivos.
- Se añadió el import faltante de `useMemo` que impedía montar `/cotizador` en navegador.
- La navegación de 11 rutas públicas se verificó a 320, 390, 768 y 1440 px (44 combinaciones). Todas montaron su encabezado principal y no hubo desplazamiento horizontal del documento.
- En móvil, el menú abre y cierra con Escape. Desde `/servicios/rotulos`, “Solicitar cotización” abre el cotizador con “Rótulos y fachadas” seleccionado. El formulario no se envió.
- `npm run build` y `git diff --check` terminaron correctamente después de las correcciones. Vite conserva un aviso de paquete JavaScript de 627.73 kB sin comprimir.
- No se desplegó ni se publicó. El typecheck señalado en v06 permanece pendiente; esta verificación no lo vuelve a ejecutar.

## Continuación v08 — typecheck, carga modular y revisión visual

**Fecha:** 23 de octubre de 2026. **Estado:** verificado en el checkout local; pendiente revisión del responsable y publicación.

- Se corrigieron las incidencias del chequeo de TypeScript en los módulos activos. `npm run typecheck` termina sin errores.
- Se cargan bajo demanda las áreas administrativas menos frecuentes y se separaron dependencias de React, Supabase, editor de texto, PDF y enrutador. El chunk de entrada pasó de 627.73 kB a 254.37 kB; el build ya no advierte sobre un chunk de más de 500 kB.
- Se revisó la composición actual en escritorio y móvil. En el preview de producción respondieron Inicio, Servicios, Cotizador, Portafolio y Contacto a 390 y 1440 px, sin desbordamiento horizontal, imágenes rotas ni errores de consola.
- `npm run build` y `git diff --check` terminaron correctamente. No se enviaron formularios, no se desplegó y no se publicó.

## Continuación v09 — ejemplos prácticos en el portafolio

**Fecha:** 7 de noviembre de 2026. **Estado:** verificado en el checkout local y publicado en `main` mediante #219.

- Se conectaron cinco ejemplos prácticos ya preparados en el sitio: ambientación de temporada, campaña en punto de venta, cuadernos corporativos, recuerdos en acrílico y exhibición para ferias.
- Las tarjetas usan muestras conceptuales existentes y declaran que no representan proyectos de clientes ni trabajos ejecutados. Los casos reales quedan separados y requieren descripción, evidencia y autorización de publicación confirmadas.
- Cada ejemplo enlaza a contacto; no se añadieron dependencias, activos nuevos, registros ni cambios de base de datos.
- Se consultaron las guías oficiales de tarjetas de Magic UI, shadcn y HeroUI. Se mantuvieron las tarjetas propias del sitio porque el proyecto ya usa React, CSS y patrones visuales existentes; no se justificó incorporar otra biblioteca.
- Se verificó `/portafolio` en el navegador local en temas oscuro y claro; los cinco ejemplos y sus enlaces de contacto aparecen y los casos documentados siguen en un bloque separado.
- `npm run build` y `git diff --check` terminaron correctamente. Vite advierte que el chunk principal supera 500 kB. `npm run build:checked` no pasa por errores TypeScript en `OperationsQuotePage.tsx`, archivo modificado fuera de esta tarea.
- La sincronización del contexto terminó correctamente. Los ejemplos se publicaron con #219.

## Continuación v10 — animaciones de contacto

**Fecha:** 7 de noviembre de 2026. **Estado:** verificado en el checkout local.

- Las vías de contacto aparecen escalonadas; el formulario y la ubicación se revelan al entrar en pantalla; el contenido del mapa y su leyenda tienen una transición breve al cambiar de vista.
- Se respetan `prefers-reduced-motion` y `useReducedMotion`. Se reutilizan Motion y `AnimatedList`, ya presentes en el proyecto; no se añadió biblioteca ni servicio.
- Se revisaron los patrones oficiales Blur Fade de Magic UI, Accordion de shadcn y Animation de HeroUI. Se eligió el sistema Motion existente por su integración con el sitio y sus controles de movimiento reducido.
- En el navegador local se revisó la página Contacto y se probó el cambio entre Google Maps y el mapa ilustrado. No se envió el formulario.
- `npm run build:checked` y `git diff --check` terminaron correctamente. Vite mantiene el aviso de chunk principal de 630.12 kB.
- La sincronización del contexto terminó correctamente. El despliegue se verifica por separado en Vercel.

## Continuidad · navegación refinada · 7 de noviembre de 2026

Pedido: mejorar funcionamiento y estética del menú público después de publicar la agrupación de rutas.

Implementado en `codex/public-nav-refine-20261107`: paneles con contraste específico para claro/oscuro, jerarquía tipográfica más legible, enlaces de empresa sin numeración decorativa y cierre visible persistente. El menú de escritorio se conserva por encima de 1100 px; tabletas y móviles usan la barra inferior. Flechas izquierda/derecha y Home/End recorren la navegación; flecha abajo entra al panel; Escape restaura el foco; salir con Tab cierra el panel.

Comprobado: compilación, TypeScript, anchos 320–1920 px sin overflow, apertura/cierre con teclado y ratón, seis servicios y tres enlaces de empresa, tema claro mediante el control real. Capturas locales en `artifacts/navigation/`. Sigue pendiente de publicación esta nueva iteración.

Referencias consultadas: shadcn Navigation Menu, HeroUI Dropdown, Magic UI Dock y W3C Disclosure Navigation. Se conserva la implementación nativa sin dependencias nuevas; el Dock con magnificación no encaja en una navegación estable. MCP de esos catálogos y guía de Obsidian no disponibles en esta sesión; se consultó documentación oficial. Siguiente paso: publicar la iteración preparada cuando se solicite.
