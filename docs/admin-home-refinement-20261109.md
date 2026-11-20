# Inicio del panel administrativo

Esta mejora replantea la zona de herramientas del inicio para que el equipo pueda llegar a sus tareas con menos búsqueda en el menú.

- Buscar acepta palabras en distinto orden y sin depender de acentos; los filtros permiten limitar por área.
- Cada persona puede marcar favoritos. Se almacenan por ID de usuario en el navegador. Al cambiar permisos, las rutas favoritas solo aparecen cuando siguen permitidas.
- El panel indica resultados y estados vacíos, conserva controles táctiles y de teclado y se ajusta en móvil, tablet y escritorio.
- El resumen muestra una acción para actualizar las métricas y señala cuando una consulta falló y los datos visibles son anteriores.

Se reutilizan la navegación, los permisos, React Router y los iconos existentes. La búsqueda de patrones consultó Command de shadcn, Magic Card y Search Field de HeroUI; no se añadió dependencia porque los patrones eran adaptables al sistema actual. Se prefirieron controles nativos accesibles y CSS del proyecto.

Verificación local con Playwright en un fixture aislado: filtros, acentos, teclado, estados vacíos, persistencia y aislamiento por cuenta; tema claro/oscuro y anchos 320, 390, 600, 768, 950, 1280, 1366 y 1920 px. TypeScript y diff check pasan. Una compilación Vite previa a los ajustes finales terminó; los dos intentos finales no completaron por falta de memoria nativa durante la transformación. El fixture no sustituye una verificación con la sesión real del panel.

Este cambio no altera datos persistidos ni requiere migración. Los favoritos quedan locales al navegador.

## Refinamiento Glass para el espacio autenticado · 2026-11-18

Se extendió el lenguaje de vidrio a la navegación, al fondo del espacio de trabajo y a las superficies compartidas de paneles y tarjetas. La portada administrativa conserva una sola jerarquía principal; los brillos y degradados quedan estáticos y tenues. Los controles y las celdas de tablas mantienen fondos sólidos para proteger la lectura. Los temas claro y oscuro usan los tokens `--vc-*` existentes, con alternativas sólidas para transparencia reducida y sin transiciones para movimiento reducido.

El alcance de código se limita a `src/app/admin-glass-theme.css`, `src/app/sidebar.css` y `src/pages/admin/unified-home.css`. No cambian rutas, permisos, formularios, datos, interacciones del inicio ni dependencias. Se corrigió además el desplazamiento del bloque de hora y clima en la cabecera móvil.

La revisión del panel protegido usó un fixture visual con sus estilos y clases en 32 combinaciones: 320, 390, 600, 768, 950, 1280, 1366 y 1920 px, con los temas claro/oscuro y el sidebar expandido/compacto. No hubo scroll horizontal; el contexto queda dentro de la cabecera móvil y el foco de teclado se ve. Movimiento reducido elimina las transiciones y transparencia reducida deja superficies sólidas. La ruta local `/panel` redirigió al acceso porque no había sesión autenticada disponible, por lo que el fixture no sustituye una revisión con sesión real. `npm run build` terminó correctamente; Vite conserva su aviso general de algunos chunks mayores de 500 kB.

Magic UI y HeroUI se consultaron por MCP. El MCP de shadcn respondió, pero no tenía registros configurados; se comprobó su documentación oficial como alternativa. No se eligió ni instaló un componente externo: bastaban los componentes y tokens del proyecto.

## Accesos y métricas por perfil · 2026-11-20

La portada destaca hasta cuatro accesos a partir del orden de módulos y rutas configurado para el perfil activo. La selección sale de la lista de rutas ya filtrada por permisos; el catálogo con búsqueda y favoritos sigue disponible debajo. El acceso más prioritario ocupa una tarjeta destacada con arte geométrico, brillo y relieve; una quinta tarjeta abre el catálogo completo. Las tarjetas de acceso y métricas adoptan el vidrio y la animación breve de las tarjetas públicas. El contador numérico se anima al entrar en vista.

Los indicadores conservan las métricas que ya devuelve `get_visualcorp_operations_summary()`: ventas confirmadas de hoy con su número de operaciones, solicitudes abiertas, cotizaciones del mes y artículos activos con alerta de nivel mínimo. Se aclaran periodos y alcance. Durante una actualización se mantienen cifras previas; si falla, cada tarjeta las marca como dato anterior. La primera versión no incorporó una gráfica: el resumen solo entregaba totales actuales. Esta actualización agrega minigráficas reales de 14 días para ventas confirmadas y cotizaciones, comparando los últimos siete días con los siete anteriores. Las consultas filtran por organización, respetan permisos/RLS, usan fechas de Guayaquil y ocultan la tendencia si el límite impide recuperar todos los registros.

La presentación se adapta al ancho útil real: los accesos usan tres columnas en anchos habituales, dos en contenedores por debajo de 480 px y más columnas solo en escritorio amplio cuando el contenedor supera 1100 px. Se conserva un detalle gráfico en el atajo principal; en espacios muy estrechos se priorizan icono y nombre para evitar desbordes. Las interacciones respetan movimiento reducido y las superficies se vuelven sólidas con transparencia reducida. No cambian rutas, permisos ni esquema/datos persistidos, y no se añade una dependencia o migración.

### Catálogos y decisión

- **Magic UI MCP:** se abrieron `Bento Grid`, `Glare Hover` y `Magic Card`, con ejemplos y fuente. El bento oficial usa una cuadrícula rígida de tres columnas y dependencias ajenas al proyecto; se adaptó el motivo a los breakpoints reales. El brillo se implementó en CSS y se reutilizan `SpotlightLayer` y `updateSpotlight` propios, sin agregar paquetes. Magic UI y Motion usan licencia MIT; Motion ya está instalado.
- **HeroUI MCP:** se revisaron Card y Surface v3. La aplicación tiene `@heroui/styles` 3.2.7 (Apache-2.0), pero incorporar `@heroui/react` para una tarjeta genérica no aportaba más que los componentes locales.
- **shadcn MCP:** respondió que no hay registros configurados. Se consultó su documentación oficial; la composición local no requiere instalar Card o Chart. No se envió código del proyecto a generadores externos.
- **Obsidian:** no hubo un conector operativo en esta sesión.

### Verificación y límites

`npm run build:checked` y `git diff --check` pasan para esta actualización.

La revisión autenticada confirma que la cuadrícula mantiene contraste y lectura en temas claro y oscuro; a 539 px presenta tres columnas, y en contenedores por debajo de 480 px baja a dos. El CSS conserva la alternativa sólida para transparencia reducida, el movimiento reducido y colores de sistema para alto contraste. Otros anchos y preferencias de movimiento/transparencia no se revisaron manualmente en esta iteración.

El ajuste no requiere migración ni dependencia adicional.
