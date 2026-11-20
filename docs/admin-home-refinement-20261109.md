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

La portada destaca hasta cuatro accesos a partir del orden de módulos y rutas configurado para el perfil activo. La selección sale de la lista de rutas ya filtrada por permisos; el catálogo con búsqueda y favoritos sigue disponible debajo. Las tarjetas de acceso y métricas adoptan el vidrio, el brillo al puntero y la elevación corta de las tarjetas públicas. El contador numérico se anima al entrar en vista.

Los indicadores conservan las métricas que ya devuelve `get_visualcorp_operations_summary()`: ventas confirmadas de hoy con su número de operaciones, solicitudes abiertas, cotizaciones del mes y artículos activos con alerta de nivel mínimo. Se aclaran periodos y alcance. Durante una actualización se mantienen cifras previas; si falla, cada tarjeta las marca como dato anterior. No se añadió una gráfica de tendencia porque el resumen entrega totales actuales, no una serie histórica.

La presentación se adapta al ancho útil real: una o dos columnas en laptops y pantallas intermedias; cuatro columnas solo por encima de 1260 px y con al menos 1100 px de espacio de contenido; una columna en áreas estrechas. Las interacciones respetan movimiento reducido y las superficies se vuelven sólidas con transparencia reducida. No cambian rutas, permisos ni datos y no se añade una dependencia o migración.

### Catálogos y decisión

- **Magic UI MCP:** se abrió `Magic Card`, su ejemplo y fuente. Su foco que sigue el puntero se evaluó frente a las 44 herramientas; se reutilizan `SpotlightLayer` y `updateSpotlight` propios del proyecto, sin copiar el componente ni agregar un paquete. La fuente oficial declara licencia MIT; `motion` ya está instalado en la versión 14.14.0 (MIT).
- **HeroUI MCP:** se revisaron Card y Surface v3. La aplicación tiene `@heroui/styles` 3.2.7 (Apache-2.0), pero incorporar `@heroui/react` para una tarjeta genérica no aportaba más que los componentes locales.
- **shadcn MCP:** respondió que no hay registros configurados. Se consultaron las guías oficiales de Card y Chart. La composición de Card no requiere añadirla; Chart se descartó porque el RPC no entrega puntos históricos. `recharts` 3.10.1 (MIT) ya está en el proyecto.
- **Obsidian:** no hubo un conector operativo en esta sesión.

### Verificación y límites

`npm run build:checked` terminó correctamente: TypeScript y Vite pasan. `git diff --check` también pasa. Vite conserva el aviso general de algunos paquetes mayores de 500 kB.

La revisión autenticada confirmó ambos temas en el panel local. A 390 px, atajos, métricas y herramientas usan una columna; los filtros se envuelven y el documento no desborda. A 663 y 1366 px las rejillas respetan el ancho disponible y no hay desbordamiento horizontal. Con `prefers-reduced-transparency: reduce` activo, las tarjetas adoptan superficies sólidas; al simular la preferencia normal se confirmó el efecto glass en claro y oscuro. Al activar movimiento reducido se eliminan transiciones y transformaciones. La consola del navegador no mostró errores ni advertencias.

La mejora queda lista para publicarse en Vercel; no requiere migración de datos.
