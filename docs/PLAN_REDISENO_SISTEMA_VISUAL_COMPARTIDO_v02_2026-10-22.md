# Plan v02 — diseño compartido de Visual Corp

Fecha: 22 de octubre de 2026. Estado: propuesta de diseño y ejecución, pendiente de revisión visual. Sustituye como plan de trabajo a v01, que se conserva como antecedente. No implica implementación ni publicación.

## 1. Resultado buscado y alcance

Crear una identidad digital reconocible en web pública, administración y POS: misma marca, controles y lenguaje; composición y densidad adaptadas a cada tarea. El entregable de implementación será un sistema reutilizable, sus pantallas migradas y una galería interna de componentes en claro y oscuro.

Prioridades: encontrar servicios y solicitar cotización en web; gestionar solicitudes y contenido en admin; registrar operaciones con claridad y precisión en POS. Medir éxito mediante tareas completadas, errores y tiempo del recorrido, comparando con una línea base; no fijar mejoras porcentuales sin medir el estado inicial.

La primera entrega visual debe mostrar juntas tres pantallas representativas —inicio web, solicitudes admin y caja POS— en ambos temas. Así se evalúa la coherencia desde el comienzo.

## 2. Diagnóstico actualizado y alcance de la evidencia

Revisión de archivos locales, sin auditoría visual del sitio desplegado:

- `src/main.jsx` carga `app.css`; `App.jsx` añade `public-site/deployment.css`, y el sitio público carga su CSS propio. Antes de migrar, documentar la cascada real: no asumir que todo archivo llamado theme está activo.
- `App.jsx` ya importa AuthProvider, usa acceso por correo y comprueba roles mediante ProtectedPage. Corregimos la afirmación de v01 sobre ausencia de autenticación. Estas referencias no verifican permisos del servidor ni despliegue; el rediseño debe respetar lo existente.
- Hay calendario y otras herramientas en el árbol. Su existencia no demuestra que estén activas o completas: rastrear imports y rutas antes de reutilizarlas.
- En los estilos revisados hay texto operativo de 9–12 px y colores directos repetidos; priorizar legibilidad y sustitución gradual por variables compartidas.
- La portada pública usa una composición abstracta con símbolo; es candidata a una escena de Visualito que presente el trabajo de la empresa con más personalidad.
- El código está cambiando durante el trabajo. Inventariar rutas y cambios vigentes al empezar cada etapa; no basar decisiones de arquitectura en el README anterior sin cotejarlo.

## 3. Dirección creativa: base sobria, color localizado y volumen

Negro/grafito en oscuro, blanco y grises suaves en claro. Degradado corporativo auténtico en identidad y acentos. DM Sans para interfaz y lectura; Bebas Kai para titulares públicos breves. La marca debe reconocerse aun sin mascota, por tipografía, logo, color y composición.

| Recurso | Web pública | Admin | POS |
|---|---|---|---|
| Degradado | Hero, remates, acento del CTA | Selección activa y cabecera puntual | Marca y selección puntual |
| Vidrio | Cabecera y un panel destacado | Menús y paneles superpuestos | Solo navegación si conserva legibilidad |
| Desenfoque | Halos de fondo localizados | Superposiciones puntuales | Evitar en superficies de trabajo |
| Ruido estático | Hero y fondos expresivos | Opcional en bienvenida | Omitir en caja |
| Visualito | Hero, orientación y confirmación | Bienvenida, ayuda y vacíos seleccionados | Ayuda inicial o vacío; nunca tapar total |
| Iconos | Línea funcional; 3D en contenido | Una familia de línea | Iconos grandes y etiquetas |

Ningún efecto se aplica al logo ni a texto, cifras o fotografías documentales. Las cifras de las siguientes secciones son propuestas para interfaz, no normas oficiales de marca.

## 4. Especificación visual inicial

### Colores y superficies

| Variable | Claro propuesto | Oscuro propuesto |
|---|---|---|
| Fondo general | #F6F7F9 | #0B0C10 |
| Superficie | #FFFFFF | #14161C |
| Superficie elevada | #FFFFFF | #1C1F27 |
| Texto principal | #191B22 | #F5F6FA |
| Texto secundario | #555D6C | #AFB7C6 |
| Separador decorativo | #E0E3EA | #343A47 |

Los bordes de controles y foco requieren contraste propio: no usar el separador decorativo como única señal de un campo. Definir además éxito, advertencia, error e información con icono y texto; el color nunca será su única distinción. Tomar el degradado de los recursos auténticos y documentar su adaptación digital; no declarar una paleta normativa deducida del PNG. Elegir un acento interactivo legible por tema y comprobar contraste antes de adoptarlo.

### Tipografía, medidas y composición

- Cuerpo web: 16–18 px; interfaz y tablas: 14–16 px; notas secundarias: 12–13 px. Evitar datos necesarios a 9 px. Interlineado de lectura 1,5; titulares entre 1 y 1,15 según longitud.
- Titular web: escala fluida de 40–72 px, con revisión en móvil. Títulos de panel: 24–32 px. Cifras y moneda con números tabulares.
- Espaciado: escala 4, 8, 12, 16, 24, 32, 48 y 64 px. Una sola escala entre productos.
- Radios: controles 10 px, paneles 16 px, secciones destacadas 24 px; cápsulas solo para chips y estados.
- Controles normales: 44 px de alto; POS táctil: 48–56 px. Variante compacta para escritorio cuando sea útil y mantenga área de interacción suficiente.
- Web: contenido máximo inicial 1200 px y márgenes 20/32 px. Admin: lateral 240 px o compacto 72 px. Ajustar al contenido real y zoom.
- Iconos funcionales: 20/24 px, misma familia y grosor. No mezclar emojis como controles.

### Recetas de efectos

- Vidrio: fondo con 85–94% de opacidad, desenfoque de fondo 12–20 px y borde tenue. Fallback sólido cuando no exista soporte. Validar contra el fondo más complejo, no solo contra un fondo vacío.
- Halos: blur de 48–96 px en elementos decorativos recortados al contenedor; máximo dos en el hero. Reducir o sustituir por imagen estática si el dispositivo pierde fluidez.
- Ruido: textura estática al 1–3% de opacidad, sin animación, limitada a fondos expresivos. Movimiento reducido no significa automáticamente menos transparencia: ofrecer la alternativa sólida y atender preferencias compatibles por separado.
- Movimiento: controles 120–180 ms; apertura de paneles 180–240 ms. Usar opacidad/transformación moderada. Sin paralaje obligatorio, flashes ni degradados continuamente animados. Respetar movimiento reducido.
- Capas documentadas: contenido, navegación, menú, overlay, diálogo y notificación; evitar z-index arbitrarios que tapen acciones.

## 5. Claro, oscuro y automático

Valor inicial: Sistema. Selector explícito de tres opciones; guardar la elección, no solo el tema resuelto. Seguir cambios del sistema únicamente en automático. Aplicar el tema antes del primer pintado para evitar destello y sincronizar pestañas del mismo origen.

La preferencia local puede compartirse en las rutas actuales. Si después existen dominios distintos, localStorage no basta: definir preferencia de cuenta para usuarios autenticados; las preferencias públicas podrán seguir siendo locales. Tema y densidad son ajustes diferentes.

Usar variables semánticas en componentes y conservar el color natural de imágenes. Elegir wordmark auténtico adecuado al contraste, con fallback legible. Formularios nativos, scrollbars, gráficos, diálogos, menús y toasts deben seguir el tema. Impresión y recibos tendrán una hoja clara específica.

## 6. Integración de logo y Visualito

BrandLogo reúne wordmark y símbolo, con variantes según fondo. Propuesta inicial: wordmark de 140–180 px en cabecera y símbolo de 32–40 px en navegación compacta, sujetos a lectura visual. No recortar el wordmark para simular el símbolo ni reconstruir letras.

Preparar tres poses iniciales desde referencias auténticas: bienvenida, orientación y confirmación. Conservar rostro, cresta, cola, colores y proporciones. La escena hero puede integrar a Visualito trabajando con un producto conceptual, con iluminación y sombra coherentes. Textos y botones permanecerán nativos en la página.

En móvil, reorganizar mascota después del mensaje y CTA; evitar que desplace la primera acción fuera de pantalla innecesariamente. Ayuda cerrable, sin burbujas insistentes ni animación perpetua. No presentar un personaje decorativo como asistente inteligente si esa función no existe. Imágenes decorativas con alternativa vacía; las informativas con descripción pertinente.

Activos de salida: variantes optimizadas para tamaño de uso, fuente conservada, procedencia y dimensiones registradas. Fotografías de trabajos reales y renders conceptuales se identifican correctamente.

## 7. Pantallas y recorridos propuestos

### Web

Inicio: cabecera → hero con propuesta y CTA → familias de servicios → trabajos verificables cuando existan → proceso breve → bloque de contacto → footer. Si faltan trabajos autorizados, omitir esa sección y continuar con servicios reales.

Detalle de servicio: título, imagen pertinente, descripción y ejemplos confirmados, datos útiles para solicitarlo y CTA con servicio preseleccionado. Cotización: pasos cortos para necesidad, detalles y contacto, resumen antes de enviar, validación y confirmación real de registro. Evitar mensajes técnicos sobre el CRM local en la experiencia pública.

### Admin

Solicitudes como pantalla piloto: título y acción → búsqueda/filtros → tabla/listado → panel de detalle → siguiente acción. Resumen con métricas derivadas de datos reales y estados vacíos honestos. Editor del sitio con vista previa del tema y distinción entre guardar borrador y publicar únicamente cuando esas operaciones existan.

### POS

Escritorio: búsqueda/catálogo a la izquierda y carrito/resumen a la derecha; total y acción de cobro visibles. Tableta: distribución adaptable; móvil: catálogo y carrito alternables conservando selección y resumen. Priorizar cliente, conceptos, cantidad, precio, total y estado del registro. Añadir atajos visibles y ayuda accesible; no capturarlos mientras se escribe en un campo.

El botón de perfil debe abrir perfil/menú; cerrar sesión será una acción con etiqueta explícita. Revisar los controles actuales con acciones inesperadas durante la migración.

## 8. Biblioteca de componentes y contratos

Cada componente tendrá propósito, variantes, estados, comportamiento móvil/teclado, contenido permitido y ejemplos en ambos temas. La galería interna usará datos ficticios claramente identificados.

| Familia | Primera versión | Criterio verificable |
|---|---|---|
| Botones y campos | Primario, secundario, sutil, peligro; input/select/textarea | Foco, error, ayuda, carga y prevención de doble envío |
| Navegación | Header, menú móvil, sidebar, breadcrumbs, tabs | Ruta activa, Escape, retorno de foco y nombres accesibles |
| Capas | Dialog, drawer, dropdown, tooltip, toast | Orden de capas, foco contenido cuando corresponda, cierre predecible |
| Datos | Tabla, filtros, paginación, tarjetas de métricas | Ordenación y filtros coherentes; vacío distinto de error |
| Formularios | Fecha, cantidad, dinero, búsqueda, selector | Etiqueta persistente, unidades visibles y errores junto al campo |
| Marca | Logo, acento, escena de Visualito | Variantes auténticas y contraste en ambos temas |
| Negocio | Resumen cotización, carrito, estado de inventario | Misma presentación del dato en las tres superficies |

No crear una segunda implementación por pantalla. Compartir primitivas y patrones; mantener lógica de precios, permisos y persistencia fuera del componente visual. Reutilizar React, Vite e iconos existentes; añadir dependencias solo si resuelven una carencia concreta.

### Calendario

Primera versión: mes y agenda; semana se añade cuando exista necesidad horaria. Fecha seleccionada, hoy, mes anterior/siguiente, filtros y panel de detalle. Móvil abre agenda por defecto. Zona de eventos con hora: America/Guayaquil; fechas sin hora se conservan como fechas, evitando desplazarlas por conversión UTC.

Fuentes por definir: campañas, entregas y tareas, cada una identificable por etiqueta además del color. Distinguir propuesto/confirmado. Reprogramación mediante formulario con confirmación; arrastrar será mejora posterior con alternativa de teclado. Mostrar conflicto y error de guardado sin perder la edición. No crear eventos comerciales ficticios para llenar la vista.

### Calculadora y cotizador

Separar tres usos: calculadora aritmética rápida; cálculo de medidas/unidades; cotización comercial con reglas aprobadas. Compartir teclado numérico y presentación, pero mantener fórmulas independientes y versionadas.

V1: entrada clara, borrar/retroceder, división por cero, decimales y precisión explícita; ancho/alto con unidades, cantidad válida y conversión visible; resumen de fórmula y tarifa cuando exista. Importes se redondean según regla de negocio confirmada, usando aritmética decimal o unidades monetarias mínimas. Un valor pendiente no se transforma en cero.

Ejemplo de revisión de medidas: 1,20 m × 0,80 m × 3 unidades = 2,88 m²; esto no determina automáticamente el precio. Tarifas mínimas, acabados, impuestos, desperdicio y descuentos requieren reglas independientes. El cálculo público y el interno consumirán el mismo motor cuando compartan reglas autorizadas.

## 9. Ejecución por entregables

| Orden | Trabajo | Entregable | Dependencia y salida |
|---|---|---|---|
| 0 | Auditar rutas activas, estilos, assets y flujos | Mapa actual y capturas de tres pantallas | Estado real documentado; dudas separadas |
| 1 | Diseñar fundamentos y escenas piloto | Lámina visual + seis vistas (3 pantallas × 2 temas) | Jerarquía y lectura evaluables antes de extender |
| 2 | Crear tokens, temas y primitivas | Galería interna con estados | Ambas apariencias y teclado resueltos |
| 3 | Migrar navegación y una pantalla por área | Inicio, solicitudes, caja | Coherencia comprobable en recorridos reales |
| 4 | Completar componentes de tarea | Calendario, calculadoras, tablas y formularios | Reglas y datos disponibles por módulo |
| 5 | Extender a todas las rutas activas | Matriz de cobertura por ruta | Sin pantallas con estilos aislados pendientes |
| 6 | Revisión y preparación de entrega | Evidencia visual, recorridos y pendientes concretos | Publicación como acción posterior explícita |

Prioridad P0: temas, legibilidad, logo, controles, navegación y tres pilotos. P1: Visualito, páginas restantes, calendario/agenda, calculadora y patrones de datos. P2: arrastrar eventos, personalización avanzada, animaciones adicionales y búsquedas complejas.

P0 incluye una propuesta de Visualito en el hero para juzgar la dirección artística, aunque la producción del resto de poses sea P1. No posponer toda la identidad hasta el final.

Responsabilidades propuestas, aún sin personas asignadas: diseño define y revisa; desarrollo implementa; responsable de negocio confirma contenido/reglas; usuarios de admin/caja revisan recorridos. No fijar fechas hasta estimar con el mapa de rutas. Las incógnitas comerciales no bloquean tokens ni prototipos con datos identificados como muestra.

## 10. Integración y mantenimiento

Estructura propuesta dentro de `src`: `design-system/tokens`, `design-system/theme`, `design-system/components` y `design-system/patterns`. Ajustar si la estructura vigente ofrece un lugar equivalente. Una sola definición para color, tipografía, espaciado, radios, elevación y movimiento.

Migrar por pantalla: registrar estado anterior, usar componentes compartidos, revisar recorrido, retirar únicamente reglas ya sustituidas. Evitar capas indefinidas de sobrescrituras y selectores globales que cambien pantallas no migradas. Documentar variantes; evitar copiar CSS para cada área.

Mantener lógica y datos existentes. Registrar cambios por etapa y permitir regresar a la versión anterior del diseño sin restaurar ni borrar datos de negocio. Inventariar los recursos nuevos y actualizar el contexto al cierre.

## 11. Criterios de aceptación y evidencia

- Revisar las tres superficies en claro, oscuro y automático; recarga sin destello, elección manual persistente y respuesta al cambio del sistema.
- Recorridos: servicio → solicitud → confirmación; lista admin → detalle → guardado; búsqueda POS → carrito → confirmación. Doble clic, error y reintento no duplican la operación; cualquier cambio necesario en persistencia se trata explícitamente.
- Calendario: eventos de día completo sin cambio de fecha, agenda móvil, error de guardado conservando datos. Calculadora: decimales, unidades, cero, límites y tarifa pendiente.
- Navegar con teclado; revisar foco, Escape, zoom al 200%, etiquetas, error y estados anunciados. Referencia de accesibilidad: WCAG 2.2 AA, con revisión aplicable; no declarar certificación automática.
- Anchuras de referencia: 360, 768, 1280 y 1440 px, más el dispositivo real de caja. Sin scroll horizontal de toda la página; tablas anchas con contenedor y alternativa cuando proceda.
- Revisar textos largos, ausencia de imágenes, sin resultados, sin permisos, carga lenta y fallo de red. Valores desconocidos no aparecen como ceros ni éxitos.
- Medir carga e interacción antes/después en el mismo dispositivo y condiciones. Presupuesto inicial propuesto: imagen hero optimizada ≤300 KB cuando la calidad lo permita, sin video automático, imágenes fuera de pantalla diferidas y sin blur animado de pantalla completa. Ajustar según evidencia.
- Entregar matriz ruta/componente/tema/dispositivo, capturas comparables y lista de pendientes. El aspecto visual y funcionamiento se revisan por separado; ambos deben responder al alcance.

## 12. Decisiones que requieren datos y siguiente paso

Se puede empezar con tokens, prototipos, galería y navegación usando esta propuesta. Para completar contenidos se necesitan fotos autorizadas y las variantes auténticas de logo/Visualito seleccionadas; para cotización, reglas de tarifas/unidades/redondeo; para calendario, fuente de eventos y permisos. Revisar la implementación actual de autenticación y datos al intervenir cada flujo.

Siguiente paso concreto: producir la lámina de estilos y las tres pantallas piloto en claro y oscuro, con su versión móvil, usando los recursos reales de marca. Después aplicar ese lenguaje a la biblioteca y a las rutas de la suite.

## Continuidad del trabajo

Objetivo: mejorar diseño de web, admin y POS con identidad compartida. Versión vigente: este plan v02. Correcciones sobre v01: diagnóstico de autenticación actualizado; tamaños y recetas de efectos; temas entre dominios; pantallas piloto tempranas; calendario y calculadoras separados por función; criterios de entrega y prioridades. Estado: plan entregado, diseño visual e implementación pendientes. No consta aprobación de valores propuestos ni de pantallas.

Fuentes: guías CONTEXTO_MAESTRO, INDICE y GUIA_IDENTIDAD_VISUAL_DIGITAL_v02 ya consultadas; plan v01; revisión actual de `src/main.jsx` y `src/App.jsx`. Los archivos README y arquitectura anteriores son antecedentes sujetos a contraste con código actual.
