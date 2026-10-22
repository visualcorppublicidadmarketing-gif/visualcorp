# Biblioteca de recursos de Gigaprint

La carpeta de origen entregada por el equipo se llama `Recursos (no borrar)`. Se conserva localmente y está excluida de Git para proteger originales y evitar publicar archivos pesados sin revisar.

## Copias publicables

`node scripts/optimize-resources.mjs` crea copias en:

- `public/brand/logos`: logos SVG y variantes WebP.
- `public/brand/mascot`: mascota Gigalito optimizada.
- `public/media/products`: productos y mockups.
- `public/media/seasonal/milagro`: banderas y recursos de fiestas de Milagro.
- `public/media/resources`: recursos varios.

El manifiesto consumible por el editor está en `src/data/resourceManifest.js`. Las rutas pasan por `assetPath()` para funcionar en desarrollo, GitHub Pages y un futuro dominio propio.

## Criterio de optimización

- PNG/JPG/WEBP se convierten a WebP, máximo 2400 px por lado, calidad 84.
- SVG se conserva como vector.
- Los originales no se renombran ni eliminan.
- No se guardan credenciales ni rutas del equipo en el manifiesto.
