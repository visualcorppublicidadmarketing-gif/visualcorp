# Referencias visuales de materiales en rollo

Las miniaturas del inventario usan ilustraciones originales generadas para distinguir familias de material. No son fotos de compras de Visual Corp ni verifican marca, gramaje, acabado, lote o existencia. Las ocho ilustraciones se guardan en `public/inventory/catalog-materials/` como WebP con fondo transparente:

| Archivo | Referencia visual |
| --- | --- |
| `lona-estandar.webp` | Lona opaca con trama tejida |
| `lona-translucida.webp` | Lona translúcida para retroiluminación |
| `vinil-brillante.webp` | Vinil adhesivo brillante |
| `vinil-mate.webp` | Vinil adhesivo mate |
| `vinil-transparente.webp` | Vinil transparente |
| `vinil-reflectivo.webp` | Vinil reflectivo |
| `vinil-esmerilado.webp` | Vinil esmerilado/arenado |
| `vinil-microperforado.webp` | Vinil con perforaciones visibles |

Las imágenes se generaron localmente con imagegen el 11 de noviembre de 2026. La selección por SKU conocido y por nombre, descripción, categoría o tags vive en `src/data/inventoryProductImages.ts`; el mapa de SKU vive en `src/data/inventory-product-images.json`. Las referencias de materiales en rollo tienen prioridad sobre una URL de imagen guardada anteriormente; la imagen guardada y la galería quedan disponibles como alternativas.

Las páginas públicas de fabricantes se consultaron solo para entender las diferencias funcionales y orientar la representación. No se descargaron ni reutilizaron sus fotografías, marcas o diseños:

- [3M: película perforada para ventanas](https://www.3m.com/3M/en_US/p/dc/v000362122/) — patrón perforado y visibilidad unidireccional.
- [Avery Dennison: películas translúcidas](https://graphics.averydennison.com/ap-en/home/graphics-products/screen-and-cut-materials/translucent-sign-cut-films.html) — material translúcido para aplicaciones iluminadas.

## Libro operativo de rollos

La vista activa permite filtrar por sucursal, estado, máquina y ubicación; registrar recepción, medición física, traslado a máquina y devolución a bodega; y consultar el historial de cada rollo. El saldo indica si procede de medición o estimación. Los traslados y el intercambio de rollos físicos no alteran el saldo agregado: cada cambio de existencias continúa pasando por las operaciones transaccionales de inventario.

Cuando Supabase Realtime está disponible, la lista se actualiza tras cambios en rollos o su historial. Si no hay conexión en vivo, se informa la hora de la última consulta y queda disponible el botón **Actualizar**. La recepción exige sucursal y ubicación activas.

La procedencia de los archivos de entrega y sus originales generados está registrada en `00_Guia_y_contexto/Inventarios/MAPA_DE_ARCHIVOS.csv`.
