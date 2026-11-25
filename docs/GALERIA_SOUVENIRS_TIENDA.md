# Galería de souvenirs en la tienda

La ruta `/tienda` incluye una franja de categorías con desplazamiento horizontal. Las familias del catálogo siguen leyendo sus productos publicados; la tarjeta **Souvenirs personalizados** abre la colección editorial en `/tienda?coleccion=souvenirs`.

La colección presenta 10 ejemplos gráficos seleccionados, uno por tipo de producto. Al seleccionar una imagen, se abre una vista ampliada que se puede cerrar con el botón, el fondo o la tecla Escape. El botón **Cotiza tu idea** lleva al cotizador general, sin crear productos, SKU ni precios de ejemplo.

## Imágenes

- Los 15 PNG originales se conservan en `E:\VISUAL CORP\VISUAL REFRESH\CATALOGO NAVIDAD VISUAL\Souvenirs_Personalizados_2026\Serie_15_Productos_2026-11-21\Exportaciones`.
- Las imágenes públicas optimizadas están en `public/images/store/souvenirs/`: 10 versiones de 720 px para ampliar y 10 de 400 px para tarjetas. El conjunto publicado ocupa aproximadamente 1,43 MB.
- La lista, los textos alternativos, el título de cada ejemplo y la ruta del recurso se mantienen en `src/public-site/SouvenirCollectionPage.tsx`.

La galería deja una sola pieza por tipo: taza Café Sol, camiseta Tía, polo KYWI, gorra Supermaxi, bolso cambrella DeUna, pluma BIC, llavero acrílico Tía, calendario Netlife, flyer KFC y agenda Samsung. Se conserva una camiseta y una polo porque muestran prendas y acabados distintos, mientras que la mezcla de marcas reduce la sensación de repetición. Los archivos de origen que no aparecen en esta selección se conservan en la carpeta de campaña.

Las imágenes son referencias de personalización. Los logotipos visibles no implican alianzas oficiales. Esta galería permanece separada de `public_catalog_products`, que conserva el inventario y el catálogo comercial publicados.

## Diseño y accesibilidad

La franja usa desplazamiento horizontal nativo, puntos de ajuste para gestos táctiles, botones de avance accesibles con teclado y movimiento reducido cuando el sistema lo solicita. La cuadrícula de posters baja de cinco a cuatro, tres y dos columnas según el ancho disponible.
