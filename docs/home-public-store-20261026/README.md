# Página principal: imágenes de categorías y Visualito

Fecha: 26 de octubre de 2026. Estado: publicada en producción.

## Criterio aplicado

- Se sustituyó la hoja de categorías en magenta oscuro y marfil por cuatro escenas en negro, blanco y tonos naturales, con acentos limitados al degradado de marca observado en la guía vigente. Los valores HEX de pantalla son aproximaciones; la guía no confirma una paleta HEX de producción.
- Las imágenes son ilustrativas y no se presentan como trabajos ejecutados. Los textos y enlaces de las categorías permanecen como contenido HTML.
- Se generó una pose PNG independiente de Visualito a partir de la pose v02 ya corregida contra PERSONAJE.psd. En Inicio acompaña la descripción del catálogo y presenta las tarjetas con una palma abierta. El arte tiene alfa y el sitio carga una exportación WebP optimizada.
- La imagen del hero se conserva como está; la nueva pose evita repetir allí el mismo gesto.

## Implementación y verificación

- `src/public-site/HomePage.tsx`, `src/public-site/home-page.css`, `public/public-site/categories/category-atlas.webp` y `public/public-site/visualito-catalog-guide.webp`.
- Fuentes PNG preservadas en `src/public-site/category-assets/` y en `02_Visualito/Poses/2026-10-26_Presentacion_catalogo/`.
- `npm run build:checked` y `git diff --check`: correctos.
- Playwright local: cuatro tarjetas, todos los destinos `/tienda?familia=...`, ambas imágenes cargadas, sin desbordamiento a 390, 768 ni 1440 px; movimiento reducido deja transiciones en 0 s.
- Capturas de revisión local: `E:/VISUAL CORP/category-review.png` y `E:/VISUAL CORP/category-review-mobile.png`.
- Despliegue de producción: `https://visualcorp-suite.vercel.app` (Vercel `visualcorp-suite`, deployment `dpl_8KnF4Q3ogDmyfBcZmCM7i1KzbNak`, READY el 26-oct-2026). Publicado desde el checkout local con Vercel CLI.
- Verificación posterior en producción: Inicio y seis rutas de servicios a 390 y 1440 px; tienda con `familia=Imprenta`; imágenes cargadas, sin desbordamiento horizontal y consola sin errores ni advertencias. Las consultas de errores de runtime de Vercel no encontraron errores en el intervalo revisado.
- Vercel mostró diagnósticos de TypeScript para `process` en `middleware.ts`, aunque completó el build y marcó el despliegue READY. La compilación local `npm run build:checked` pasa.
- El código se registró en el commit local `0ce65d3` sobre `codex/public-services-release-20261026`, basada en `main` actualizado a `7190509`. No se hizo push a GitHub porque las credenciales disponibles no identificaron de forma única al propietario del remoto.

## Referencias consultadas

- Guía vigente de Visual Corp: `00_Guia_y_contexto/GUIA_IDENTIDAD_VISUAL_DIGITAL_v02.md`.
- La guía de mascotas y el índice de Visualito registran la pose 4K v02 como referencia previa, no como máster nuevo.
- Recomendaciones web: la imagen de Visualito es decorativa junto a texto equivalente y usa `alt=""`; las imágenes de este bloque están bajo el hero y se mantienen fuera de la carga prioritaria. La base técnica existente ya usa React 19, Motion y CSS local; no se añadieron dependencias.
- Catálogos revisados: Magic UI `Glare Hover` (sin dependencias, pero no aporta a estas tarjetas de imagen); documentación de Card de HeroUI v3 (depende de Tailwind CSS v4/React Aria, que no se adoptó); documentación oficial de shadcn Card (el MCP no pudo buscar registros porque el proyecto no tiene `components.json` ni registros configurados). Se conservaron las tarjetas y estilos actuales.

Estado de marca: las imágenes son ilustrativas; esta publicación no constituye aprobación de marca ni certifica trabajos ejecutados.

## Páginas de servicios y exploración del catálogo

Fecha: 26 de octubre de 2026. Estado: publicada en producción junto con Inicio.

- Se añadieron dos referencias o ideas consultables en cada una de las seis páginas de servicio: impresión, gran formato, rótulos, textil, corte/señalética y exhibición/eventos.
- Las referencias con nombre de producto corresponden a productos observados en la tienda pública durante la revisión. Los enlaces usan las familias reales que filtra la tienda; por eso el rótulo estándar publicado lleva también a Gran formato. La categoría de exhibición/eventos no estaba entre las familias publicadas; su página conecta con Gran formato.
- En corte/señalética se amplió la orientación del encargo sin atribuir disponibilidad confirmada de una máquina, material o técnica. La fuente interna `00_Guia_y_contexto/CAPACIDADES_VISUAL_CORP.md` sirve como mapa de capacidades, no como catálogo comercial vigente.
- Cada página aclara que el catálogo se actualiza y que características, disponibilidad y condiciones se verifican al revisar la solicitud. Las ideas no se muestran como proyectos ejecutados.
- Componentes: Magic UI se buscó por tarjetas de catálogo y se inspeccionó `Magic Card Demo 2`; su brillo orbital y dependencias de card/avatar no mejoran esta sección editorial. HeroUI v3 `Card` documenta estructura y accesibilidad, pero requeriría su paquete y su enfoque Tailwind; no está instalado. shadcn Card se consultó en la documentación oficial porque este repo no tiene `components.json` ni registros configurados. Se reutilizaron tarjetas CSS locales y enlaces React Router para mantener la identidad visual, sin sumar dependencias ni movimiento decorativo.
- Verificación: `npm run build:checked` y `git diff --check`; Playwright revisó las seis rutas a 390, 768 y 1440 px, con dos referencias por página y sin desbordamiento horizontal. Consola: 0 errores y 0 advertencias.

Fuentes: tienda pública de Visual Corp observada el 26-oct-2026; `00_Guia_y_contexto/CAPACIDADES_VISUAL_CORP.md`; Magic UI Registry (`Magic Card Demo 2`); [HeroUI Card v3](https://heroui.com/docs/react/components/card); [shadcn Card](https://ui.shadcn.com/docs/components/card).
