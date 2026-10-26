# Inicio: composición de servicios y trabajos publicados

Fecha: 26 de octubre de 2026. Estado: implementado y verificado en la rama `codex/home-components-20261026`, basada en `origin/main` (`a106669`); pendiente de revisión en vista previa y publicación.

## Continuidad del trabajo

- Pedido: aplicar la selección de componentes para mejorar Inicio, conservando su identidad y los cambios recientes del repositorio.
- Los seis servicios activos usan una composición tipo Bento: dos tarjetas destacadas y cuatro regulares. Si el número de servicios habilitados cambia, se conserva la cuadrícula regular. En tabletas y móviles la composición pasa a dos y una columnas.
- El bloque editorial de Inicio prioriza hasta tres artículos de portafolio ya publicados que tengan imagen de portada. Usa los títulos, fotos y enlaces existentes; no crea casos ni incorpora activos externos. Si no hay portafolio con imagen, conserva la selección anterior de contenido publicado.
- Consulta de solo lectura a `public.site_articles` en el proyecto Supabase `visualcorp-suite` (`iomdmclkimfmvlzcrkyz`), 26 de octubre de 2026: cero artículos publicados, cero artículos de portafolio publicados y cero artículos de portafolio publicados con imagen. Por eso la galería todavía no aparece con los datos actuales.
- No se añadieron dependencias. El layout adapta el concepto Bento de Magic UI al CSS y Motion que ya usa el sitio.

## Verificación

- `npm run build:checked` y `git diff --check`: correctos.
- Vista local `http://127.0.0.1:5194/`: seis servicios visibles, sin imágenes rotas ni desbordamiento horizontal a 320, 390, 768 y 1440 px. La tarjeta destacada de Impresión abre `/servicios/impresion` con el título correcto. Consola sin errores.
- Capturas visuales de escritorio y móvil revisadas durante la sesión. La sección de portafolio con artículos reales queda pendiente de verificar cuando se publique al menos un caso con imagen.

## Siguiente acción

Revisar esta versión visual en la vista previa de la rama antes de integrarla en `main`. Para mostrar trabajos reales en Inicio, publicar casos con imágenes y descripciones cuya procedencia y uso estén confirmados. Las ediciones locales de inventario en el checkout principal permanecen intactas.
