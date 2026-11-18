# Prompts para el sitio público glass · Visual Corp

Úsalos en secuencia: prompt base + el prompt de ruta que quieras trabajar + la lista de verificación. Están pensados para el checkout local de `apps/visualcorp-suite`; no autorizan despliegues.

## 1. Prompt base · dirección de arte e implementación

```text
Actúa como diseñador frontend y desarrollador React senior dentro de E:\VISUAL CORP\apps\visualcorp-suite. Antes de cambiar la interfaz, inspecciona las rutas, los componentes, los datos, la cadena real de CSS y los tokens activos. Consulta docs/SISTEMA_VISUAL_COMPARTIDO.md, src/public-site/PLAN_DISENO_PUBLICO_v03.md y la guía de identidad visual del workspace.

Actualiza visualmente el sitio público con una dirección glassmorphism propia de Visual Corp. Usa negro o blanco como base según el tema actual y aplica el degradado corporativo como luz ambiental medida en bordes, fondos y transiciones entre secciones. Las superficies de vidrio deben mantener contraste y lectura: transparencia y blur solo cuando ayuden a separar capas. Usa DM Sans para lectura y Bebas Kai solo en titulares breves. Conserva la paleta y los tokens existentes; no conviertas cada superficie en vidrio ni cada componente en un arcoíris.

Usa las imágenes adjuntas solo como referencias de ambiente, color, luz y tratamiento glass. No copies sus textos, teléfonos, horarios, ofertas, diseños de terceros ni elementos que parezcan datos comerciales. No inventes servicios, productos, clientes, precios, plazos, materiales, disponibilidad o condiciones.

Conserva el Visualito auténtico ya incluido en el sitio. No lo redibujes, regeneres, sustituyas ni alteres sus rasgos. Mantén el logotipo original sin reconstruirlo. Deja un foco visual dominante por sección; reduce ornamentos, patrones, brillos y movimiento que distraigan del contenido o de la acción principal.

Reutiliza componentes, tokens, Motion y patrones disponibles. Añade dependencias solo si una necesidad concreta no se resuelve con lo existente. Consulta el componente exacto en los catálogos y la documentación oficial de Magic UI, shadcn y HeroUI; adapta lo pertinente a la identidad, al stack y a movimiento reducido. Mantén el contenido comercial, las rutas, los enlaces, los formularios y sus estados.

Haz que todas las vistas respondan desde 320 px hasta pantallas anchas sin overflow horizontal. Conserva foco visible, teclado, lectura, tema claro/oscuro y prefers-reduced-motion. Verifica rutas y estados relevantes, compila y reporta qué cambiaste y qué revisaste. No despliegues, publiques, envíes formularios ni cambies datos comerciales.
```

## 2. Prompt de ruta · Inicio `/`

```text
Aplica el prompt base solo a la portada pública `/`. Conserva el contenido, la escena actual y el asset original de Visualito, el orientador rápido, las seis familias de servicio, los pilares, el proceso y todas sus acciones. Mejora la jerarquía del titular, la lectura del texto, la relación entre copy y mascota, los espacios y la prioridad del llamado a cotizar. Mantén un solo foco dominante en el primer pantallazo; el orientador debe ayudar a elegir sin competir con el titular o Visualito.

Coloca el lavado de degradado detrás de la composición, no encima del contenido ni del rostro de Visualito. Usa vidrio en pocos grupos funcionales, como el orientador o una superficie de apoyo; conserva zonas tranquilas para leer. Evita patrones grandes, parallax, shimmer constante, pulso decorativo y animación que retrase el acceso al contenido. Mantén titular, texto, botones y navegación utilizables con teclado y movimiento reducido. No alteres copy, destinos ni datos. Revisa 320, 390, 768, 950, 1280 y 1440 px en tema oscuro y claro.
```

## 3. Prompt de recorrido · Servicios → ficha → cotizador

```text
Aplica el prompt base solo a `/servicios`, `/servicios/:slug` y `/cotizador`. Facilita comparar las seis familias existentes y entender el contenido de cada ficha. Ordena el contenido con títulos cortos, descripciones legibles y ejemplos que ya existan en los datos. No agregues familias, piezas, materiales, promesas, precios, tiempos ni condiciones.

Mantén cada enlace a su ficha y el destino actual de cotización. Desde una ficha, la selección del servicio debe continuar preseleccionada en el cotizador por la query string existente. Conserva el comportamiento, validaciones, campos, estados, datos y envío del formulario; no envíes solicitudes durante la revisión.

Usa tarjetas glass para agrupar información sin ocultar límites y notas de alcance. Destaca el CTA para cotizar de forma consistente y deja claro cuál es el siguiente paso. Reutiliza iconos y componentes existentes; cualquier componente de catálogo debe tener propósito concreto, buena lectura, foco y adaptación móvil. Comprueba enlaces, preselección, estados visibles del formulario y ausencia de overflow a 320, 390, 768, 950, 1280 y 1440 px en tema oscuro y claro.
```

## 4. Prompt de movimiento, accesibilidad y control visual

```text
Revisa la capa visual implementada en el sitio público, sin cambiar contenido comercial ni navegación. Mantén las animaciones cortas, escasas y ligadas a una acción o entrada significativa. No uses movimiento continuo en fondos, titulares ni tarjetas. Con prefers-reduced-motion: reduce, evita entrada y desplazamiento animado, apaga brillos que viajan y deja estáticas las superficies; no dependas solo de reducir la duración a cero si el elemento sigue oculto antes de animar.

Recorre la página con Tab, Shift+Tab, Enter y Escape. Confirma enlace para saltar al contenido, indicador de foco claro, orden lógico, enlaces con nombre comprensible y formularios con etiquetas, errores y estados perceptibles. Revisa contraste en dark/light, zoom y texto largo. Mide documentElement.scrollWidth contra innerWidth en 320, 390, 768, 950, 1280 y 1440 px para `/`, `/servicios`, una ficha real y `/cotizador`.

Deja el estado de movimiento y tema de prueba restaurado al terminar. No envíes solicitudes, no publiques y no despliegues. Resume fallos que no correspondan al cambio para no atribuirlos a esta iteración.
```

## 5. Prompt visual opcional · panel de concepto, no asset de producción

```text
Crea un panel de dirección visual para una web pública de agencia creativa, con dos encuadres de composición: escritorio panorámico y móvil vertical. Usa las imágenes adjuntas únicamente para orientar la base negra, las ondas de luz del degradado Visual Corp (cian, azul, violeta, magenta y naranja) y el tratamiento de cristal translúcido. Deja un área principal despejada para texto nativo y una zona secundaria donde el sitio pueda colocar su propia mascota autenticada.

Es una referencia de ambiente, no una captura final ni una maqueta con copy. No generes texto, letras, logotipos, teléfonos, direcciones, precios, servicios, clientes, horarios ni condiciones. No inventes ni redibujes Visualito: deja su espacio libre para insertar el asset oficial en el código. Evita brillos excesivos, múltiples focos y adornos sobre las áreas de lectura. Conserva contraste y equilibrio entre vidrio, fondo oscuro y degradado medido.
```

## Patrones revisados para trabajar estos prompts

- **Magic UI · Border Beam:** el patrón de luz perimetral está documentado con ejemplo y código en [Border Beam](https://magicui.design/docs/components/border-beam). Se reutiliza la pieza local ya presente, basada en Motion y con `useReducedMotion`; no requiere instalar Magic UI. Licencia del proyecto: MIT ([fuente](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md)).
- **shadcn · Card:** se incorporó como código editable local en `src/components/ui/card.tsx`, siguiendo la composición Header/Content/Footer del [catálogo oficial](https://ui.shadcn.com/docs/components/base/card). No añade runtime; licencia MIT ([fuente](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)).
- **HeroUI · Card:** se emplean `@heroui/styles` 3.2.7 y las clases BEM documentadas para una superficie CTA; no se importa `@heroui/react`. Así se obtiene el patrón visual de [Card](https://heroui.com/en/docs/react/components/card) sin añadir su árbol de componentes React. Licencia Apache-2.0 ([fuente](https://github.com/heroui-inc/heroui/blob/v3/LICENSE)).
- Los catálogos MCP no aparecen en el registro de herramientas de esta sesión. Las tres configuraciones globales están habilitadas y responden a la inicialización MCP por stdio; el proceso de Codex que inició esta sesión es anterior a esos cambios y no dispone de recarga en caliente. Para ver las herramientas nativas en Codex, la guía oficial indica **Settings → MCP servers → Restart** ([guía oficial](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)). Mientras tanto, esta entrega se contrastó con la documentación oficial abierta; no afirmo que los MCP estén activos aquí.
