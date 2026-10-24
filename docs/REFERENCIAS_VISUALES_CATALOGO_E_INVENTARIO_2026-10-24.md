# Referencias visuales del catálogo e inventario

Fecha: 2026-10-24
Proyecto: Visual Corp Suite
Estado: cambios locales preparados; pendiente de integrar y aplicar la migración a Supabase.

## Catálogo de productos

La consulta de solo lectura encontró 247 registros en `public_quote_catalog_products` y 247 en `public_catalog_products`; ambos conjuntos tienen 0 registros sin imagen y comparten 42 imágenes diferentes. Las fotos internas cubren 18 familias; 74 productos del snapshot coinciden con 14 de esas familias y mostrarán la foto real interna. Para familias reconocidas por la biblioteca de mockups se usa la referencia neutral; en los demás se conserva la URL que ya estaba asignada en Supabase.

Esto no significa que las 42 imágenes de origen hayan sido revisadas una por una como fotos exactas de cada variante. La auditoría previa detectó algunos grupos con referencias genéricas. Los campos originales no se modifican en esta entrega.

## Inventario

Los 70 SKU actuales de Visual Corp se asignaron a 70 archivos WebP en `public/inventory/`. La fuente se especifica en `src/data/inventory-product-images.json`:

- 60 referencias generadas, etiquetadas en la interfaz como «Referencia generada».
- 9 muestras internas de materiales, incluida la familia de viniles y lonas.
- 1 foto local de acrílico con iluminación.

Las imágenes identifican visualmente un artículo y no confirman marca, acabado, ancho, calibre, saldo ni existencia física. En particular, las muestras impresas de vinil y lona conservan los nombres y arte de las fichas internas; deben reemplazarse por fotos del rollo físico si se necesita comprobar el lote exacto.

La app muestra las imágenes por SKU incluso antes de la sincronización de datos. La migración `20261024070000_visualcorp_inventory_reference_images.sql` completa `reference_image_url` en Supabase solo cuando ese campo sigue vacío y solo para la organización `visual-corp`. No cambia stock ni costos. A la fecha de este registro no se aplicó la migración ni se publicó esta versión.

Los formularios para crear y editar una ficha de inventario ahora exigen seleccionar una imagen existente de la biblioteca. La biblioteca indexada reúne 114 familias y 158 imágenes.

## Fuentes y archivos

- Muestras originales: `05_Produccion_y_materiales/Medidas_y_cortes/`.
- Fotos de producto originales disponibles: `03_Oferta_comercial/Catalogos_vigentes/` y referencias de tazas.
- Mapa de fotos internas del catálogo: `src/data/catalog-real-product-images.json`; copias web optimizadas en `public/images/catalog-real/`.
- Manifest por SKU: `src/data/inventory-product-images.json`.
- Resolver rutas de inventario: `src/data/inventoryProductImages.ts`.
- Imágenes finales: `public/inventory/`.
- Índice visual para la interfaz: `src/data/inventory-reference-index.json` y `public/inventory-reference-library/index.json`.
- Migración para persistir las rutas: `supabase/migrations/20261024070000_visualcorp_inventory_reference_images.sql`.
