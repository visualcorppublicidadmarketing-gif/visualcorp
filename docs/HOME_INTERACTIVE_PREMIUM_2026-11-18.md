# Portada pública: escena interactiva premium — 18 de noviembre de 2026

## Resultado buscado

Dar a la portada pública (`/`) una primera escena más inmersiva con movimiento relacionado con el scroll y el puntero, conservando el contenido comercial, la marca y el comportamiento responsive existentes.

## Dirección visual

- **Base:** carbón `#0b0c12`, texto `#f6f5f8`, magenta `#e5007e`, cian `#54caff` y el amarillo que ya aparece en Visualito.
- **Tipografía:** DM Sans para lectura y Bebas Kai para la expresión gráfica, ambas ya usadas por la portada.
- **Composición:** el copy actual sigue siendo el punto de entrada; Visualito ocupa la escena lateral con una órbita amplia y una palabra de fondo. Las capas avanzan a distintas velocidades para dar profundidad sin sumar texto ni recursos nuevos.
- **Momento distintivo:** Visualito gira suavemente hacia el puntero y flota en profundidad con el scroll. La pastilla de contexto adopta un vidrio oscuro translúcido.
- **Límites:** sin autoplay de video, bucles de partículas o nuevos paquetes. La interacción es decorativa y no esconde información ni acciones.

## Investigación aplicada

Las guías actuales documentan dos mecanismos distintos: animación *scroll-linked*, donde el progreso visual sigue al desplazamiento, y animación *scroll-triggered*, que se reproduce al entrar en pantalla. MDN recomienda usar timelines declarativos para vincular una secuencia al scroll; Motion ofrece `useScroll`, `useTransform` y springs para componer estos valores en React. En esta portada se usa Motion, ya instalado, porque permite coordinar la misma escena con scroll y puntero; no se añadió un listener global de scroll.

La síntesis de diseño es usar profundidad en pocas capas del objeto protagonista, y reservar el resto de la página para contenido y navegación. Para mantener respuesta y accesibilidad, esta escena anima `transform`, limita el giro del puntero a una amplitud pequeña, y elimina parallax y tilt cuando el sistema pide reducir movimiento. El halo y el tilt solo responden a un puntero fino; en dispositivos táctiles queda el parallax de scroll.

### Catálogos y candidatos

- **Magic UI MCP:** se consultaron `Scroll Based Velocity` y `Floating 3D Particles`, incluidos ejemplos y código. El primero desplaza una cinta según la velocidad de scroll; el segundo mantiene un canvas con un ciclo de animación continuo. Son referencias MIT según el [LICENSE oficial del proyecto](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md), pero ninguno aporta mejor jerarquía a esta portada que animar el activo auténtico ya disponible. No se copió ni instaló código de catálogo.
- **HeroUI MCP:** se revisó la guía de animación de v3. El proyecto ya depende de `@heroui/styles` 3.2.7; sus recomendaciones CSS, transformaciones y movimiento reducido son compatibles, aunque su biblioteca de controles no cubre esta escena.
- **shadcn MCP:** no reportó registros configurados en el proyecto. Se consultaron el [directorio oficial de registros](https://ui.shadcn.com/docs/directory) y su [Message Scroller](https://ui.shadcn.com/docs/components/aria/message-scroller); el ejemplo es para filas de chat y no encaja con la portada comercial. No se inicializó `components.json` ni se añadió un registro.
- **Obsidian:** no se detectó un conector MCP disponible en esta sesión, así que no se atribuye ninguna consulta a la guía compartida.
- **Biblioteca elegida:** Motion for React, ya presente en el proyecto (`motion` 14.14.0 en `package-lock.json`, licencia MIT). Se conserva la versión fijada por el lockfile; no se añadió otra dependencia.

## Cambios

- `src/public-site/HomePage.tsx`: progreso del hero → desplazamiento vertical por capas; coordenadas locales del puntero → inclinación X/Y con spring y halo; movimiento reducido → escena sin parallax/tilt.
- `src/public-site/home-page.css`: perspectiva, orden de profundidad, vidrio translúcido y activación del halo solo en dispositivos con mouse.
- No se modificaron rutas internas, textos comerciales, imágenes fuente, tablas, contenido de clientes ni datos persistidos.

## Verificación y continuidad

- **Responsive:** reutiliza breakpoints existentes de 1100, 760, 560 y 430 px. El halo no captura eventos; el stage conserva `touch-action: pan-y`; el contenedor de portada ya recorta desbordamientos.
- **Movimiento reducido:** se respeta con `useReducedMotion` y con la regla CSS existente para `prefers-reduced-motion`; no se cambió la preferencia del sistema para esta inspección.
- **Fuentes:** [MDN, scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines), [Motion, `useScroll`](https://motion.dev/docs/react-use-scroll), [Motion, accesibilidad](https://motion.dev/docs/react-accessibility), [MDN, `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion), [Apple WebKit, scroll timelines y accesibilidad](https://developer.apple.com/videos/play/wwdc2025/233/).
- **TypeScript y producción:** `npm run typecheck` y `npm run build` pasan. Vite emite un aviso para los chunks de más de 500 kB del conjunto de la aplicación; este cambio no agregó dependencias ni código de canvas.
- **Revisión local:** la portada se abrió en `http://127.0.0.1:5190/`. Se revisó a 1265 × 718 y 648 × 681: el título y la escena se adaptan, sin desbordamiento horizontal visible. Al mover el mouse por el escenario, el giro y el halo siguen al puntero; al recorrer el hero, las capas cambian de profundidad. El tab local queda abierto para una prueba directa.
- **Estado:** versión aislada de revisión en `codex/home-interactive-premium-20261118`; no publicada ni desplegada. No se ejecutó la suite de pruebas.
- **Siguiente paso:** mantener esta iteración como propuesta local para el usuario; cualquier integración o publicación requiere su propia solicitud.
