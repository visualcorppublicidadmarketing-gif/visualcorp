# Plan de rediseño del sistema visual compartido

**Fecha:** 22 de octubre de 2026
**Estado:** propuesta para revisión; no implementada ni aprobada.
**Alcance:** sitio público, administración web y punto de venta/operaciones de Visual Corp.

## 1. Objetivo

Unificar la experiencia digital de Visual Corp para que el sitio público, el panel administrativo y el POS se sientan parte de la misma marca, aunque cada espacio tenga necesidades y densidad de información distintas. El rediseño debe mejorar claridad, confianza, navegación y consistencia sin sacrificar velocidad de lectura ni precisión operativa.

El sistema debe ofrecer tema claro, oscuro y automático según el sistema operativo, con selector manual persistente. Debe funcionar en escritorio, tableta y móvil, y conservar rutas y acciones actuales mientras se actualizan las interfaces.

## 2. Punto de partida encontrado

La suite local `apps/visualcorp-suite` agrupa el sitio público, administración y operaciones/POS. El código ya separa el sitio público en `src/public-site/`, incluye sus propios estilos y carga el wordmark y símbolo desde `public/brand/`. Hay tipografía Bebas Kai en `public/fonts/`; el diseño de marca también prescribe DM Sans para lectura.

La navegación pública ya agrupa servicios y páginas institucionales, y ofrece contacto y cotización. En la parte interna hay componentes de panel, formularios, tablas, estados, flujos POS y estilos responsive. El árbol también incluye un calendario reutilizable y herramientas de cotización/cálculo; el alcance y exactitud de las calculadoras depende de reglas comerciales confirmadas.

El sistema visual de la suite hoy está repartido entre varios archivos de estilos y presenta una interfaz administrativa clara. Se recomienda consolidar tokens y componentes compartidos antes de aplicar acabados globales. El repositorio tiene cambios locales sin seguimiento en `public/images/` y una migración SQL; deben preservarse y revisarse por separado al implementar.

## 3. Dirección visual propuesta

### 3.1 Identidad y jerarquía

- Mantener negro/grafito como base principal de marca y blanco como tema claro. Usar el degradado corporativo existente en acentos, bordes seleccionados, indicadores y momentos de marca; no reconstruirlo ni recolorear el logo.
- Usar el wordmark auténtico completo en cabeceras de marketing y accesos internos donde tenga espacio. Usar el símbolo auténtico en favicons, avatares de marca, menús compactos y estados sin contenido. Respetar contraste, proporción y zona despejada; el nombre no se recompone con tipografía.
- Aplicar DM Sans a navegación, controles, tablas, etiquetas y texto corrido. Aplicar Bebas Kai a titulares breves y destacados de marca, sobre todo en el sitio público; reservarlo de los datos densos del POS.
- Integrar a Visualito en el hero público, ayuda contextual, bienvenida o estados vacíos seleccionados, con poses y tamaño adecuados. No ponerlo en cada tarjeta ni junto a formularios/datos sensibles; no debe ocupar espacio ni distraer de caja o inventario.
- Añadir recursos propios de la V/globo solo desde curvas verificadas. El recurso verde y su equivalencia geométrica siguen pendientes; no simularlos mediante recolor del logo.

### 3.2 Acabados y efectos

- Degradados: preferir halos ambientales, líneas cortas, selección activa y detalles de marca. Evitar rellenos arcoíris extensos bajo texto.
- Glassmorphism: utilizarlo en navegación flotante, filtros superpuestos, diálogos y paneles destacados con una superficie opaca suficiente. En tablas, formularios, caja y cifras usar fondos sólidos para mantener separación y contraste.
- Desenfoque gaussiano: limitado a fondos decorativos detrás de superficies; nunca aplicar al texto, logo, controles o contenido con el que se trabaja.
- Ruido: textura muy leve en fondos amplios o hero, opcional y desactivable con `prefers-reduced-motion`/modo de bajo consumo; no usar sobre tablas ni fotografiar datos.
- Sombras y brillos: sobrios, mate/satinados y coherentes. Evitar resplandores fuertes, exceso de bordes luminosos y animaciones continuas.

### 3.3 Capas de apariencia según tarea

Compartir identidad, tipografía, color, radios, iconografía y estados. Adaptar densidad por contexto:

- **Sitio público:** composición editorial, imágenes de trabajos/productos verificadas o ilustración conceptual claramente no documental, titulares expresivos, amplitud y llamadas de acción visibles.
- **Administración:** superficies limpias, navegación persistente, tablas legibles, filtros claros, indicadores de estado y formularios con jerarquía consistente.
- **POS/operaciones:** lectura a distancia, contraste alto, controles táctiles grandes, flujo rápido, cifras tabulares y poco movimiento. Priorizar el estado de la venta, el total y la acción siguiente.

## 4. Temas claro, oscuro y del sistema

Definir `light`, `dark` y `system`. `system` seguirá `prefers-color-scheme` y actualizará al cambiar la preferencia del dispositivo. La elección manual prevalecerá sobre el sistema y persistirá en el perfil o, mientras siga la persistencia local, en el navegador.

Implementar ambos esquemas con variables semánticas, no con inversión automática de colores. Mínimos: `canvas`, `surface`, `surface-raised`, `text-primary`, `text-secondary`, `border`, `brand-accent`, `focus-ring`, `success`, `warning`, `danger`, `info`, `overlay` y `shadow`. Documentar cada token con valores comprobados; no declarar valores HEX normativos de marca a partir de una imagen.

Mantener gráficos, chips y estados con significado equivalente en ambos modos. Probar foco de teclado, hover, selección, deshabilitado, error, confirmación y datos pendientes. Ajustar logos por variante auténtica y verificar que el símbolo se distinga en fondos claros y oscuros.

## 5. Sistema de componentes

Construir una biblioteca compartida desde tokens y piezas pequeñas hacia patrones completos. Componentes propuestos:

### Base

- `Button` y enlaces de acción: primario, secundario, sutil, peligro y solo icono; tamaños compacto/normal/táctil; estados de carga y deshabilitado.
- `Field`: texto, teléfono, correo, número, área, selector, fecha/hora y búsqueda; etiqueta, ayuda, requerido, error y contador accesibles.
- `Badge/Status`, `Tooltip`, `Toast/Alert`, `Avatar`, `IconButton`, `Divider`, `Skeleton`, `EmptyState` y `ConfirmDialog`.
- `Card/Panel` con variantes sólida, elevada y translúcida; evitar una tarjeta por cada bloque sin necesidad.

### Navegación

- `PublicHeader`: wordmark, navegación agrupada, CTA de cotización y menú móvil accesible.
- `AppShell`: cabecera, migas de pan, panel lateral expandible/compacto, selector de área y perfil.
- `MobileNavigation`: navegación táctil coherente y acceso al menú completo; no depender solo de iconos sin nombre accesible.
- `PageHeader`: título, descripción, estado y acciones primarias consistentes.
- `ThemeControl`: claro/oscuro/sistema, disponible desde sitio y áreas internas según el contexto.

### Datos y operación

- `DataTable`: ordenar, filtrar, paginar, seleccionar filas, vacíos, carga, error y diseño móvil alternativo.
- `SearchFilterBar` y filtros guardables; `StatusTimeline` para CRM, cotizaciones, producción y pedidos.
- `MetricCard`, `ActivityFeed`, `InventoryStatus`, `MoneyAmount` y `QuantityControl`, con formatos localizados para Ecuador y sin convertir valores desconocidos en ceros.
- `Calendar`: vistas mes/semana/agenda, rango seleccionado, hoy, filtros por tipo, teclado, eventos compactos y panel de detalle. Los eventos requieren fuente real y permisos adecuados; las fechas propuestas no se presentan como confirmadas.
- `Calculator/QuoteBuilder`: campos de dimensiones/cantidad/unidad, selección de familia/material y resumen de fórmula/resultado. Tarifas no confirmadas permanecen como pendientes; validar límites, redondeo y supuestos antes de mostrar total. Si no existe una fórmula aprobada, mostrar cálculo de medidas/cantidades y solicitud de revisión, no precio inventado.
- `POSCart/Checkout`: búsqueda rápida, selección de cliente/producto, cantidades, forma de pago, total, faltantes y confirmación antes de registrar; reflejar con claridad el estado de persistencia.
- `Wizard/Stepper` para cotizaciones, alta de productos, conteo y otras tareas de varios pasos, con guardado y recuperación cuando proceda.

### Marca y contenido

- `BrandLogo` con variantes auténticas y tamaños semánticos; `MascotMoment` para apariciones puntuales de Visualito; `GradientAccent` para tratamientos de marca.
- `ServiceCard`, `ContactBlock`, `QuoteCallout`, `MediaFrame` y `ContentSection` para el sitio público. La imagen de un caso debe identificarse como trabajo real solo con evidencia; los renders se rotulan como concepto.

## 6. Estructura de información y navegación

### Sitio público

Mantener el recorrido principal: Inicio → Servicios/familias → detalle → cotización o contacto. Hacer el CTA de cotizar fácil de encontrar sin competir con el contenido. Proponer una búsqueda/índice de familias si el catálogo confirmado resulta extenso. Añadir navegación de retorno y relación con servicios en el formulario. Optimizar para lectura móvil y carga rápida.

### Administración

Agrupar por tarea: Sitio y contenido; Solicitudes/CRM; Cotizaciones y catálogo; Marketing; Respaldo y ajustes. Mostrar acciones según capacidad/permiso y diferenciar borrador, pendiente, confirmado y publicado. Evitar que un elemento sea visible al público hasta que el flujo de aprobación correspondiente exista y se active.

### POS y operaciones

Priorizar búsqueda, registro y salida de la operación. Separar Caja/POS, Clientes, Inventario, Producción y reportes según roles confirmados. En caja, mantener carrito y total visibles; en inventario, ubicación, unidad, conteo y bitácora; en producción, etapa, responsable y siguiente acción. Asegurar que los controles principales funcionen con teclado y pantalla táctil.

## 7. Accesibilidad, respuesta y privacidad

- Objetivo de diseño: WCAG 2.2 AA como referencia de revisión, incluyendo contraste, foco visible, teclado, etiquetas, errores comprensibles, tamaños táctiles y zoom.
- Respetar movimiento reducido, contraste alto del sistema y navegación sin ratón. El ruido/blur/degradado no puede reducir contraste ni bloquear interacción.
- Especificar estados de carga, éxito, error, sin resultados, sin permisos, sin conexión y conflicto de sincronización. Formularios indican propósito y uso de los datos; recoger solo lo necesario.
- Probar anchos móvil/tableta/escritorio, contenido largo, tablas anchas, zoom, fecha/moneda en español de Ecuador y controles de POS en pantalla táctil.
- Nunca mostrar al público datos de clientes, notas internas, inventario privado o cifras sin permiso.

## 8. Fases de trabajo sugeridas

### Fase 0 — Validación y línea base

Inventariar rutas y flujos reales; seleccionar páginas de referencia; confirmar servicios y contenido publicable, permisos, reglas de precios/cotización y calendario. Capturar pantallas base y anotar problemas de navegación/lectura. No publicar ni sustituir contenido comercial durante esta fase.

### Fase 1 — Fundamentos compartidos

Crear tokens y tema claro/oscuro/sistema; incorporar familias tipográficas y logo; unificar foco, botones, campos, estados, contenedores, iconos y respuesta. Definir reglas para glass, blur, ruido, movimiento y contraste. Mantener una sola fuente de verdad para la apariencia común.

### Fase 2 — Navegación y estructura

Unificar cabeceras, navegación lateral, móvil, migas de pan, encabezados de página y selector de tema. Revisar etiquetas y rutas para usuario público, administración y operación.

### Fase 3 — Sitio público

Actualizar inicio, servicios, fichas, empresa, proceso, contacto y cotizador; integrar Visualito en momentos seleccionados; revisar logo y jerarquía; optimizar CTA y formularios.

### Fase 4 — Administración

Aplicar sistema común a paneles, tablas, formularios, calendario, catálogo, CRM y estados editoriales. Reducir ruido visual y mejorar búsqueda, filtros y densidad.

### Fase 5 — POS y operación

Ajustar caja, carrito, lectura de totales, inventario, conteo, calendario/agenda y flujos táctiles. Revisar con usuarios de caja/operación y escenarios de error; no cambiar reglas de registro al hacer una renovación visual.

### Fase 6 — Revisión integral y salida

Recorrer los flujos de extremo a extremo en ambos temas y resoluciones; comprobar contenido real, permisos, privacidad, accesibilidad, persistencia, rendimiento, enlaces y estados. Preparar una versión candidata y notas de cambios. El despliegue requiere infraestructura y controles de acceso listos; la suite local actual no debe exponerse públicamente sin autenticación y permisos.

## 9. Criterios para aceptar el rediseño

1. El mismo token produce el mismo significado y apariencia base en las tres superficies.
2. Claro, oscuro y automático funcionan; la selección manual persiste y el cambio del sistema se refleja en `system`.
3. Logo y tipografías se presentan correctamente, sin alteraciones del recurso original.
4. Visualito aparece con función y conserva su identidad; las pantallas operativas siguen priorizando la tarea.
5. Menú, navegación, calendario y calculadora funcionan con teclado y tacto, con carga, error y vacío definidos.
6. El calendario distingue evento real de propuesta; la calculadora explica sus entradas y no presenta tarifas no confirmadas como definitivas.
7. El contraste, el foco, la legibilidad y el orden se mantienen en ambas apariencias y en móvil.
8. Las rutas existentes y los datos se conservan; el rediseño no modifica ventas, saldos, precios o permisos sin una decisión aparte.
9. Las imágenes y afirmaciones comerciales tienen fuente y estado identificables.
10. La revisión final cubre recorridos de sitio público, admin y POS, no solo una captura de portada.

## 10. Decisiones y datos pendientes

- Confirmar qué servicios, textos, fotografías/casos y llamadas pueden quedar publicados.
- Confirmar las variantes maestras de logo y las curvas reutilizables de marca; las guías aún dejan pendientes el maestro definitivo y el recurso verde.
- Seleccionar poses auténticas de Visualito adecuadas a web y áreas internas.
- Confirmar reglas de cálculo, tarifas, impuestos, unidades y redondeo; mantener pendientes las no verificadas.
- Acordar vistas y usos del calendario, fuentes de eventos, permisos, roles administrativos y de POS.
- Decidir dónde se guarda la preferencia de tema una vez exista autenticación compartida.
- Revisar aviso de privacidad, retención y permisos para formularios con nombre, teléfono, empresa y notas.
- La suite local utiliza almacenamiento del navegador en varios flujos y su arquitectura/documentación indica que aún faltan autenticación y roles para poner admin/POS en internet. Es requisito de arquitectura antes de despliegue, separado del rediseño visual.

## Referencias consultadas

- `00_Guia_y_contexto/CONTEXTO_MAESTRO.md`
- `00_Guia_y_contexto/INDICE.md`
- `00_Guia_y_contexto/GUIA_IDENTIDAD_VISUAL_DIGITAL_v02.md`
- `00_Guia_y_contexto/CAPACIDADES_VISUAL_CORP.md`
- `apps/visualcorp-suite/README.md`
- `apps/visualcorp-suite/docs/ARQUITECTURA_Y_FASES.md`
- `apps/visualcorp-suite/src/public-site/PublicSite.jsx` y estilos del sitio
- `apps/visualcorp-suite/src/theme.css`, `src/app.css` y componentes existentes
