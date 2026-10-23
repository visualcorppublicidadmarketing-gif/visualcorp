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
