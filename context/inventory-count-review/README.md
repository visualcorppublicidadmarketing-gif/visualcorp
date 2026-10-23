# Conteo en capturas del 22 de octubre de 2026

Fuente: `E:\VISUAL CORP\PRECIOS\Inventario\Area Sublimación` (33 capturas) y `Area Taller` (34 capturas). Las imágenes originales permanecen en esa carpeta.

Se extrajeron 187 renglones candidatos: 85 de Sublimación y 102 de Taller. El OCR produjo una cantidad numérica candidata en 156 renglones. Ninguna se ha convertido en saldo operativo. `capture-ocr.json` conserva el texto detectado y su posición; `capture-row-candidates.json` añade la imagen de origen, su SHA-256, el renglón, los campos reconocidos y la confianza de lectura.

## Por qué falta la conciliación

- La carpeta contiene capturas, no el libro original de las tablas fotografiadas. El libro `VisualCorp Inventario Actualizado.xlsx` localizado en otra carpeta tiene otra estructura y datos anteriores; no demuestra que sea el origen de estas capturas.
- Hay cantidades no numéricas o vacías (`POCO`, `FUNDA DE 6 U/N`, etc.) y dígitos de una sola cifra que el OCR reconoce con baja confianza.
- En las capturas hay variantes por color, talla, calibre y ancho. Las 70 fichas actuales de la aplicación son en gran parte artículos generales con variante “por confirmar”. Un total general no debe absorber la cantidad de una variante específica.
- El usuario indicó usar solo una de las filas duplicadas. La preparación conserva la primera aparición por descripción y variante; las siguientes quedan identificadas en la evidencia como duplicados descartados, sin sumar cantidades.
- La ubicación física dentro de cada área no se ve en las capturas. Se requiere un código de ubicación estable antes de confirmar esos saldos.

## Uso seguro

Revisar cada candidato contra su imagen original; corregir nombre, variante, unidad y cantidad; asignar sucursal y ubicación. Después crear o seleccionar la variante exacta y registrar el conteo mediante `set_inventory_count` desde una sesión autorizada, con responsable y motivo. Solo tras esa confirmación se puede vincular un producto de venta con la variante y ubicación correctas.

Estado de esta revisión: **evidencia preparada; 187 renglones pendientes de verificación visual y conciliación**.
