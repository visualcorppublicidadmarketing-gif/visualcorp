# Encabezados corporativos — Visual Corp

Fecha de investigación e implementación: 9 de noviembre de 2026.
Rutas: `/nosotros`, `/como-trabajamos`, `/contacto`.
Base de trabajo: `9abc4ab5d22c6eb4c5f4ee682a58ded7f2873245`.

## Objetivo y dirección

Crear tres encabezados expresivos, funcionales y coherentes con Visual Corp, con temas claro/oscuro y animación accesible. Las capturas de referencia mostraban dos portadas con grandes espacios vacíos y un contacto con un gráfico orbital principalmente decorativo.

La dirección elegida es una mesa de diseño y producción: pliegos superpuestos, marcas de registro, tipografía Bebas Kai y los acentos CMYK de la marca. Cada página tiene una interacción vinculada a su propósito:

- La empresa: cartel que cambia entre Diseño, Publicidad y Producción, acompañado por una explicación breve.
- Cómo trabajamos: exploración de los tres pasos documentados y acceso al detalle de cada paso.
- Contacto: carta visual con accesos a WhatsApp, formulario y ubicación. El enlace de WhatsApp recibe el servicio seleccionado en la página.

## Investigación y fuentes primarias

| Referencia consultada | Observación / encaje | Decisión |
| --- | --- | --- |
| [BASIC/DEPT — About](https://www.basicagency.com/about) y [Contact](https://www.basicagency.com/contact) | Jerarquía tipográfica dominante y contacto organizado por intención. About se revisó visualmente en navegador. | Tomar claridad y escala, conservando la composición y los activos de Visual Corp. |
| [Instrument — About](https://www.instrument.com/about) | Mensaje breve y tipografía que lleva el peso de la portada. Revisión visual en navegador. | Un titular legible y una composición controlada, con acciones visibles. |
| [COLLINS — About](https://www.wearecollins.com/about/) | Presentación de capacidades ligada al objetivo del cliente. Consulta de contenido público. | Explicar qué puede hacer el visitante en cada sección. |
| [Magic UI — Animated Beam](https://magicui.design/docs/components/animated-beam) / [repositorio](https://github.com/magicuidesign/magicui) | Se inspeccionó el código del registro vía MCP: Motion, ResizeObserver y repetición infinita por defecto. Registro consultado en su estado del 9-nov-2026. [Licencia MIT](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md). | El patrón de conexión resulta pertinente para procesos. Se implementó una secuencia propia con animaciones finitas, sin instalar el componente ni añadir observadores. |
| [shadcn — Radix Tabs](https://ui.shadcn.com/docs/components/radix/tabs) / [repositorio](https://github.com/shadcn-ui/ui) | MCP sin registros configurados; documentación oficial usada como alternativa. [Licencia MIT](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md). | Para estos selectores basta un grupo de botones nativos con `aria-pressed`, nombres y foco. No se añade un sistema de componentes. |
| [HeroUI — Tabs](https://heroui.com/docs/react/components/tabs) y [Button](https://heroui.com/docs/react/components/button) | Catálogo MCP v3.2.7; se leyeron documentación y ejemplos. El MCP avisó de actualización de su cliente. La rama v3 publica [Apache 2.0](https://github.com/heroui-inc/heroui/blob/v3/LICENSE). | Se conserva el CSS del proyecto para evitar una integración de tema y componentes innecesaria para esta interacción. |
| [Motion — useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) / [repositorio](https://github.com/motiondivision/motion) | Versión instalada 14.9.1, React 19.3.1. [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md). | Reutilizar la dependencia existente para el cambio de paso; entrada y cartel se animan con transform/opacity en CSS. |

Los sitios de agencias son referencias de análisis visual y contenido. El código y los activos de estas portadas son propios del proyecto; no se copiaron imágenes, textos comerciales ni diseños completos de terceros. No se añadieron dependencias.

## Sistema visual y distribución

| Token | Oscuro | Claro |
| --- | --- | --- |
| Fondo | `#0b0d14` | `#f6f7fa` |
| Texto | `#f8f8fc` | `#191a24` |
| Texto secundario | `#b3b5c3` | `#5e6271` |
| Superficie | `#151822` | `#ffffff` |
| Acento de texto/foco | `#f38ac6` | `#a80065` |

Acción principal: blanco sobre `#bd006b`. Bebas Kai/VisualCorpDisplay para titulares y DM Sans existente para lectura y controles. Los pliegos conservan fondo claro y tinta oscura como objeto físico en ambos temas.

```text
Inicio / página actual                  Visual Corp / Agencia creativa
────────────────────────────────────────────────────────────────────
Titular de la sección                  Composición editorial propia
Descripción breve                      Interacción vinculada al contexto
Acciones principales                   Explicación o rutas directas
────────────────────────────────────────────────────────────────────
Ubicación o nota del proceso            Acceso al contenido siguiente
```

Hasta 900 px, la composición pasa a una columna. Controles adaptables y sin anchuras mínimas que ensanchen la página. Se reservó el espacio de la navegación flotante existente para que no tape las migas de navegación. Las áreas de proceso mantienen una altura mínima estable a 320 px; crecen si el contenido lo requiere.

## Arquitectura y comportamiento

- `CompanyHeroes.tsx`: estructura común y tres composiciones de presentación. Estado local limitado a la selección visual.
- `company-hero-content.ts`: capacidades y pasos inmutables. Los pasos del encabezado y del detalle se leen del mismo conjunto.
- `company-heroes.css`: tokens por tema, composición, estados, adaptación y movimiento reducido.
- `PublicSite.tsx`: conserva acceso a configuración, enlaces preparados y observadores de contacto; pasa las propiedades necesarias a los encabezados.
- Se aplicaron las pautas React solicitadas: datos estáticos fuera del render, componentes estables, estado mínimo, ausencia de efectos para estado derivado y limpieza preservada de observadores. La guía Flutter solicitada se usó para separar presentación, datos y responsabilidad; la implementación sigue la tecnología React del repositorio.
- Entrada de 720–800 ms, sin ciclos. El proceso transiciona en 240 ms. Con `prefers-reduced-motion`, la entrada y los desplazamientos quedan desactivados y todo el contenido es visible.
- Botones nativos con estado anunciado y orden de Tab natural. Los enlaces al detalle, formulario y ubicación tienen destinos que reciben foco; no se envían mensajes ni formularios automáticamente.

## Verificación local

Vista previa de Chromium sobre Vite local, con la configuración pública local del espacio de trabajo:

- 60 combinaciones: 3 rutas × 2 temas × 10 anchos (320, 390, 600, 768, 900, 901, 1024, 1280, 1366, 1920).
- Sin desbordamiento de página, titulares recortados, controles fuera del ancho, rutas de página tapadas ni imágenes sin cargar en estas combinaciones.
- Revisión de capturas en escritorio y móvil, en ambos temas.
- Teclado: Tab/Space/Enter cambian especialidades y pasos; el enlace del paso lleva al artículo correspondiente; formulario y ubicación reciben foco.
- Cambio de tema probado con el botón real y conservado al navegar.
- Movimiento reducido probado en las tres páginas: texto visible y ninguna animación de encabezado en ejecución.
- Contraste de los pares de tokens de texto revisados: mínimo 5.66:1; acción principal 6.22:1. Esta comprobación acotada no constituye una certificación de accesibilidad de todo el sitio.
- El servicio seleccionado se incorpora al enlace de WhatsApp del nuevo encabezado. Se inspeccionó el destino; no se envió un mensaje ni se presentó un formulario.
- `npm run build:checked` y `git diff --check`. Vite mantiene el aviso de paquetes grandes del proyecto; no se añadieron paquetes.

Las capturas y los resultados de navegador se guardan en `audits/company-heroes-20261109/` (carpeta ignorada por Git). La validación publicada debe registrarse en el PR de esta entrega después del despliegue.
