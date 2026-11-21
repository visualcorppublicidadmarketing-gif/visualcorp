# Galería de souvenirs en la tienda

La ruta `/tienda` incluye una franja de categorías con desplazamiento horizontal. Las familias del catálogo siguen leyendo sus productos publicados; la tarjeta **Souvenirs personalizados** abre la colección editorial en `/tienda?coleccion=souvenirs`.

La colección presenta 15 ejemplos gráficos. Al seleccionar una imagen, se abre una vista ampliada que se puede cerrar con el botón, el fondo o la tecla Escape. El botón **Cotiza tu idea** lleva al cotizador general, sin crear productos, SKU ni precios de ejemplo.

## Imágenes

- Los PNG originales están en `E:\VISUAL CORP\VISUAL REFRESH\CATALOGO NAVIDAD VISUAL\Souvenirs_Personalizados_2026\Serie_15_Productos_2026-11-21\Exportaciones`.
- Las imágenes públicas optimizadas están en `public/images/store/souvenirs/`: una versión de 720 px para ampliar y otra de 400 px para tarjetas. El conjunto publicado ocupa aproximadamente 2,2 MB.
- La lista, los textos alternativos, el título de cada ejemplo y la ruta del recurso se mantienen en `src/public-site/SouvenirCollectionPage.tsx`.

Las imágenes son referencias de personalización. Los logotipos visibles no implican alianzas oficiales. Esta galería permanece separada de `public_catalog_products`, que conserva el inventario y el catálogo comercial publicados.

## Diseño y accesibilidad

La franja usa desplazamiento horizontal nativo, puntos de ajuste para gestos táctiles, botones de avance accesibles con teclado y movimiento reducido cuando el sistema lo solicita. La cuadrícula de posters baja de cinco a cuatro, tres y dos columnas según el ancho disponible.
