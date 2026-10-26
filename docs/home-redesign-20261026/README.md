# Inicio · rediseño integral

Fecha: 26 de octubre de 2026. Estado: implementado y verificado localmente; sin publicar.

## Continuidad del trabajo

- Pedido: mejorar por completo Inicio, profesionalizar el diseño y las animaciones. El usuario indicó continuar y terminar.
- Copia aislada: `E:/VISUAL CORP/apps/visualcorp-suite-worktrees/home-redesign-20261026`, rama `codex/home-redesign-20261026`, base local `main` en `1e0ee9a`. Se preservan el checkout principal y los otros frentes.
- Dirección: negro, blanco, degradado dosificado, Bebas Kai y DM Sans; Visualito auténtico. Referencia: `00_Guia_y_contexto/GUIA_IDENTIDAD_VISUAL_DIGITAL_v02.md`.
- Resultado: portada editorial, entrada escalonada, escena con profundidad suave al mover el puntero, tarjetas de servicio con interacción, proceso de tres pasos operable con teclado, enlaces a tienda/portafolio y cierre para cotización/contacto. Animaciones de entrada finitas, sin bucles decorativos permanentes.
- Los mensajes de portada y los servicios habilitados siguen leyendo el estado existente. Los contenidos publicados siguen usando `HomeContentHighlights`, cargado cuando se aproxima a la vista. No se inventaron clientes, cifras, precios ni proyectos de portafolio.
- Nuevo módulo: `src/public-site/HomePage.tsx`; estilos aislados en `home-page.css`; `PublicSite.tsx` reexporta la página y selecciona el logo blanco solo en Inicio.
- Logo: copia binaria intacta de `E:/VISUAL CORP/01_Marca/Logos/LOGO VISUALCORP FN SF RGB.png`, mostrado mediante encuadre CSS. Original preservado. Visualito reutiliza el WebP existente.

## Verificación

- `npm run build:checked`: TypeScript y compilación Vite correctos, después del último cambio de código. `git diff --check`: correcto.
- Navegador local en `http://127.0.0.1:5192/`: 320, 390, 768 y 1440 px, un h1, sin desbordamiento horizontal ni imágenes rotas. El encabezado no tapa el contenido inicial.
- Proceso: clic en el paso 02 actualiza el panel; Enter en el paso 03 cambia `aria-pressed` y contenido. Menú móvil abre y cierra con Escape.
- Recorrido real: tarjeta Rótulos → `/servicios/rotulos` → `/cotizador?servicio=R%C3%B3tulos%20y%20fachadas`. No se enviaron formularios.
- Puntero: la escena aplica transformación de profundidad; al salir vuelve al centro. Movimiento reducido: ninguna animación activa dentro de Inicio, transiciones de 0 s y contenido legible.
- Tema claro comprobado mediante el atributo existente `data-theme`; no se añadió un selector de tema. Contraste de botón, titular y logo revisado visualmente.
- Consola: sin errores de aplicación; aviso informativo de Motion durante la prueba de movimiento reducido.
- Las capturas de revisión y los logs de la vista previa se conservan en esta carpeta local; no forman parte de la publicación del sitio.

## Entrega y siguiente paso

Vista previa local: http://127.0.0.1:5192/. Para reiniciarla desde esta carpeta de trabajo: `npm run dev -- --host 127.0.0.1 --port 5192 --strictPort`.

Implementación completa para revisión. Pendiente aprobación visual e integración/publicación explícita. Sin cambios de base de datos, sin envíos externos y sin despliegue. La verificación local no certifica publicación en el dominio.

## Subpáginas de servicio y revisión competitiva

Fecha: 26 de octubre de 2026. Estado: contenido y diseño implementados en la misma rama de trabajo; revisados localmente; sin publicar.

- Se reemplazó el detalle genérico por páginas específicas para Impresión y papelería, Gran formato, Rótulos y fachadas, Textil y promocionales, Corte/grabado/señalética y Exhibición/eventos.
- Cada página incluye ejemplos de uso, una guía breve para preparar la consulta, pasos de revisión sin prometer condiciones y enlaces a otras familias con cotización preseleccionada.
- La investigación comparó páginas públicas de VL Publicidad, Publicity-G, Imprimium, Sertex Guayas y Blum. El informe competitivo completo se conserva en el contexto interno de Visual Corp, fuera de este repositorio público.
- QA Playwright: las seis rutas tienen un solo encabezado principal y CTA de cotización en 320, 390, 768 y 1440 px; no se detectó desbordamiento horizontal.
- `npm run build:checked`: TypeScript y Vite correctos. No se enviaron formularios ni se publicó el sitio.

## Continuidad — navegación entre servicios

Fecha: 26 de octubre de 2026. Estado: aplicado localmente en la rama indicada arriba.

- Se corrigieron los enlaces de “Tu proyecto puede tomar otra forma”: antes todas las páginas mostraban las mismas tres familias por orden del catálogo; ahora cada familia propone tres rutas relacionadas con su necesidad (por ejemplo, Rótulos conecta con Corte, Gran formato e Impresión). Solo se presentan servicios habilitados.
- QA Playwright repetido tras el cambio: seis rutas en 320, 390, 768 y 1440 px; el orden de familias relacionado es contextual, cada página mantiene un h1 y no presenta desbordamiento horizontal.
- `npm run build:checked` y `git diff --check` correctos.

## Pendiente antes de publicar

- [x] Mejorar Inicio y seis páginas de servicio.
- [x] Guardar análisis competitivo fechado y enlazarlo desde la bitácora.
- [x] Verificar compilación y recorridos responsive localmente.
- [ ] Revisar visualmente el preview y validar la redacción final de cada servicio.
- [ ] Incorporar únicamente fotografías de trabajos autorizadas y datos comerciales confirmados, si se decide añadirlos.
- [ ] Revisar la rama y preparar integración con `main`.
- [ ] Publicar después de la decisión expresa correspondiente; no se ha hecho despliegue ni enviado contenido.

Vista previa para revisión: http://127.0.0.1:5192/. El estado comprobado es local; no acredita cambios en `main` ni en producción.
