# Inicio del panel administrativo

Esta mejora replantea la zona de herramientas del inicio para que el equipo pueda llegar a sus tareas con menos búsqueda en el menú.

- Buscar acepta palabras en distinto orden y sin depender de acentos; los filtros permiten limitar por área.
- Cada persona puede marcar favoritos. Se almacenan por ID de usuario en el navegador. Al cambiar permisos, las rutas favoritas solo aparecen cuando siguen permitidas.
- El panel indica resultados y estados vacíos, conserva controles táctiles y de teclado y se ajusta en móvil, tablet y escritorio.
- El resumen muestra una acción para actualizar las métricas y señala cuando una consulta falló y los datos visibles son anteriores.

Se reutilizan la navegación, los permisos, React Router y los iconos existentes. La búsqueda de patrones consultó Command de shadcn, Magic Card y Search Field de HeroUI; no se añadió dependencia porque los patrones eran adaptables al sistema actual. Se prefirieron controles nativos accesibles y CSS del proyecto.

Verificación local con Playwright en un fixture aislado: filtros, acentos, teclado, estados vacíos, persistencia y aislamiento por cuenta; tema claro/oscuro y anchos 320, 390, 600, 768, 950, 1280, 1366 y 1920 px. TypeScript y diff check pasan. Una compilación Vite previa a los ajustes finales terminó; los dos intentos finales no completaron por falta de memoria nativa durante la transformación. El fixture no sustituye una verificación con la sesión real del panel.

Este cambio no altera datos persistidos ni requiere migración. Los favoritos quedan locales al navegador.
