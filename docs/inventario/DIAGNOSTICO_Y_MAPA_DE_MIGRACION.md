# Diagnóstico y mapa de migración del inventario Visual Corp

**Fecha del análisis:** 22 de octubre de 2026  
**Estado:** diagnóstico + borrador de migración; no se ha cargado stock en la app.  
**Proyecto:** `apps/visualcorp-suite`  

## Decisión de seguridad de datos

Los libros existentes mezclan conteos antiguos, campos de estado, fórmulas, unidades escritas como texto y cantidades vacías. Se conservan como evidencia de origen, pero no se usan para afirmar disponibilidad actual. La app parte con inventario operativo vacío hasta que cada artículo se normalice y se cuente físicamente. Los conteos nuevos quedan señalados como pendientes hasta confirmarse en el flujo de ajuste.

## Fuentes examinadas

| Fuente | Cobertura observada | Evaluación |
|---|---|---|
| `Administración/Inventario/VisualCorp Inventario Actualizado.xlsx` (archivo modificado 27-jul-2026) | 675 filas con contenido en 6 hojas: Impresión, Sublimación, Troquelado, Láser, Taller y NEONES. | Estructuras distintas por área; encabezados duplicados o genéricos; IDs repetidos entre áreas; cantidad en números y textos como “5 cartuchos”, “31 Plancha” o “50x40”; fechas/estados no bastan como conteo actual; hay cachés de fórmula con error. |
| `Administración/Inventario/GigaPrint Inventario Actualizado.xlsx` (archivo modificado 17-jun-2025) | 74 filas con contenido en 3 hojas: Giga-Impresión, Giga-Recursos y Herramientas. | Libro con estructura y nivel de detalle diferente; cantidades ausentes en Giga-Impresión y medidas incrustadas en texto; hoja de herramientas tiene notas y campos no tabulares. |
| Dos libros compartidos por OneDrive, identificados por el usuario como actualizados: “INVENTARIO DE TALLER” e “INVENTARIO SUBLIMACION 1”. | Se revisaron los enlaces y capturas disponibles para entender la estructura: taller con tipo/detalle/características/unidad/stock y sublimación con tipo/color/talla/stock (por ejemplo, tazas metalizadas por color). | No se pudo obtener una copia descargable de sus filas completas desde esta sesión. Las capturas sirven para el diseño y las categorías visibles, no para importar ni verificar todos los saldos. Las cifras de las capturas no deben tratarse como vigentes al momento del conteo. |
| Google Sheets “VisualCorp Inventario Actualizado” (indicado como no actualizado). | Se inspeccionó la pestaña Impresión y los encabezados/hojas; la hoja incluye áreas similares al libro local. | Contiene filas con campos de cantidad o ID vacíos y fechas antiguas; aparece al menos una fecha 21-oct-2026, por lo que el libro sí muestra alguna actualización reciente. No hay evidencia suficiente para certificar la vigencia de todo el archivo. |
| `Administración/Asesores/2026` | 12 carpetas mensuales, 43 libros semanales; hojas por asesora/ventas. | Son registros de ventas, no un kardex completo de inventario: no prueban por sí mismos salida por artículo, unidad, sucursal, responsable de almacén y saldo posterior. No se convertirán en consumos automáticos. |

## Revisión por hoja de los dos libros locales

| Sucursal | Hoja | Filas con contenido | Sin nombre | Stock vacío | Stock texto/mixto | Error visible en fórmula |
|---|---:|---:|---:|---:|---:|---:|
| Visual Corp | Impresión | 21 | 4 | 11 | 7 | 0 |
| Visual Corp | Sublimación | 196 | 53 | 1 | 1 | 1 |
| Visual Corp | Troquelado | 30 | 1 | 11 | 5 | 0 |
| Visual Corp | Láser | 30 | 13 | 13 | 1 | 0 |
| Visual Corp | Taller | 199 | 191 | 196 | 0 | 0 |
| Visual Corp | NEONES  | 199 | 189 | 196 | 0 | 0 |
| GigaPrint | Giga-Impresión | 20 | 6 | 20 | 0 | 0 |
| GigaPrint | Giga-Recursos | 30 | 12 | 12 | 4 | 0 |
| GigaPrint | Herramientas | 24 | 24 | 24 | 0 | 0 |

Las cifras cuentan filas con contenido después del encabezado y son diagnósticos de calidad, no conteos de artículos únicos. Las claves locales se repiten entre áreas y no deben ser claves globales.

## Conversión recomendada

1. **Artículo maestro:** nombre normalizado, SKU global nuevo, categoría/subcategoría, área responsable, unidad base, unidad de compra, factor de conversión, variantes (color/medida/ancho/calibre/talla), código de barras opcional y estado activo.
2. **Existencia por ubicación:** artículo + sucursal + bodega/estante + cantidad base + mínimo + punto de reposición + lote opcional. Separar Visual Corp y GigaPrint sin duplicar la identidad del producto.
3. **Trazabilidad inmutable:** entrada, consumo, merma, venta, reserva, liberación, ajuste, transferencia de salida y recepción; cantidad y unidad; empleado; cliente/orden/venta; sucursal origen/destino; fecha; motivo; usuario que registró; referencia. Las correcciones se anotan como movimientos inversos o ajustes, no borrando el historial.
4. **Reservas y venta urgente:** el POS comprueba disponibilidad por variante y sucursal. Si es insuficiente, ofrece continuar con “compra urgente pendiente” y crea el faltante separado; el saldo no baja de cero. Un faltante no es una transferencia/recepción real.
5. **Costos y permisos:** costos, costo promedio, compras y márgenes se reservan para roles autorizados. Asesoras ven disponibilidad y aviso de compra sin precio de costo. Permisos se validan en servidor/BD al conectar, no en el navegador.
6. **Conteo inicial:** mantener saldo anterior solo como referencia. Hacer conteo físico por sucursal, ubicación y variante, registrar responsable y fecha, confirmar; luego ese movimiento pasa a ser saldo inicial operativo. No reconstruir saldo usando solo “En stock/Agotado” ni notas de asesores.
7. **Material por rollo y corte:** registrar especificación (p. ej., lona estándar, ancho 120 cm o 310 cm) como variante independiente. Definir unidad de compra “rollo” y unidad base de consumo “metro lineal” con longitud real confirmada por rollo. No convertir hasta levantar las medidas reales.
8. **Catálogo de sublimación:** color y talla como variantes distintas (p. ej., tipo Taza metalizada + color Rosa). No colapsar por nombre genérico.
9. **Herramientas/equipos:** separar activos duraderos del inventario consumible. Para máquinas y herramientas: custodio, ubicación, estado, mantenimiento y préstamos; no descontar permanentemente al prestarlas.
10. **Ventas de asesoras:** importar como ventas históricas con estado de conciliación y relación cliente; asignar consumo de materiales solo con detalle de producto/orden y regla de receta de producción confirmada.

## Mapa de campos

| Origen | Destino canónico | Tratamiento |
|---|---|---|
| `Nombre del elemento`, `Nombre`, `Recursos` | `item.name` | Limpiar espacios/capitalización sin fusionar variantes automáticamente. |
| `Tipo` | `category` + `subcategory` | Revisión manual; no usarlo como área sin confirmar. |
| Hoja (Impresión, Sublimación, etc.) | `area_id` | Propuesta de área; conservar `sourceSheet` hasta validar. |
| Nombre/sucursal del libro | `branch_id` | Visual Corp o GigaPrint según libro; validar cada recurso compartido antes de fusionarlo. |
| `Cantidad`, `Stock`, `Stock Actual`, `Stock Disponible` | `quantity_raw` | Conservar texto original; convertir a cantidad/unidad solo con regla confirmada. |
| `Estado`, `Días`, fecha de abastecimiento, reserva | campos históricos/notas | No calculan saldo vigente. No reutilizar los días almacenados como edad actual. |
| `Observaciones` | `notes` / evidencia | Preservar, revisar privacidad y datos personales antes de migración amplia. |
| `Id` / `ITEM` | `legacy_code` | Conservar como referencia de fuente, no como ID global único. |

## Funcionalidad preparada en la app local

- Catálogo por área, sucursal, ubicación, variante, SKU, unidad y mínimo; búsqueda y alertas por bajo stock.
- Catálogo inicial con 70 artículos sugeridos (10 por área: Impresión, Sublimación, Troquelado, Láser, Taller, Neones y Bodega general), cada uno con ID legible `VC-INV-<AREA>-<NÚMERO>`, existencia 0 y estado `Catálogo sugerido · existencia por verificar`. Incluye consumibles y materiales frecuentes; medidas, formatos, compatibilidad, colores y presentaciones quedan expresamente por confirmar. No es un registro de compras ni de existencias físicas. El alta manual asigna el siguiente ID libre del área.
- Bitácora de movimientos con responsable, motivo y referencia; entradas, consumo, merma, venta, ajustes, traspasos y faltantes urgentes.
- El ajuste fija la cantidad física contada y queda en historial. El traspaso disponible crea/actualiza el mismo artículo en sucursal destino y registra ambos lados.
- POS: selección de cliente guardado o alta en la venta, selección de artículo/variante/sucursal, cantidad vendida y confirmación de venta con compra pendiente si falta stock; descuenta solo el saldo disponible.
- Directorio local de clientes separado del CRM de solicitudes.
- Precios/costos siguen ocultos en el inventario hasta que existan autenticación y permisos seguros.

## Límites y pendientes para la siguiente etapa

- No hay sincronización entre navegadores/dispositivos; persistencia actual es `localStorage` local.
- No se han conectado GitHub, Supabase ni Vercel, de acuerdo con la instrucción del usuario.
- No hay ingreso de roles autenticados, PIN semanal, seguridad de costos o permisos; no exponer esta instancia en internet como sistema de producción.
- Falta recibir/descargar los dos `.xlsx` actuales de OneDrive para auditar cada fila y hacer importación con revisión.
- Falta conteo físico y definición de mínimos, equivalencias/unidades, ubicaciones, lotes y costos.
- La app local no agrega compras ni emite comprobantes tributarios; los faltantes son alertas/pendientes operativos.

## Archivos de apoyo

`borrador_migracion_local.json` conserva 749 filas fuente no vacías de los dos libros locales, con archivo/hoja/fila, valores originales, campos sugeridos y `mappingStatus=review_required`. Sirve para revisar y cotejar; no es un import listo ni cambia el stock de la app.

## Matriz inicial de permisos para definir con la empresa

| Perfil | Consulta existencias | Registra ventas/clientes | Consumo y conteo | Traspasos/compras | Ve costos/precios de compra | Administra usuarios y permisos |
|---|---:|---:|---:|---:|---:|---:|
| Dueño / superadministrador | Sí, ambas sucursales | Sí | Sí | Aprueba y corrige | Sí | Sí |
| Administración de inventario | Sí, ambas sucursales | Si está autorizado | Sí | Registra y aprueba según delegación | Sí | No |
| Encargado de sucursal | Solo sucursal asignada y compartida autorizada | Sí | Sí, sucursal asignada | Solicita/recibe y traspasa con registro | Según permiso | No |
| Asesora / caja | Disponibilidad, variantes y alertas | Sí; crea o elige cliente | No ajusta inventario | Solicita compra urgente; no confirma recepción | No | No |
| Operador de área/taller | Materiales asignados a su área | No | Registra uso ligado a orden/persona | Solicita reposición | No | No |
| Auditoría / lectura | Sí, según alcance autorizado | Lectura | Lee movimientos | Lee solicitudes | Solo si se concede expresamente | No |

La matriz es una propuesta para configurar con Esteban; no crea cuentas ni reemplaza la revisión de roles usada en GigaPrint. La autorización final por área, sucursal y función queda pendiente de aprobación empresarial.

### Credencial semanal de asesoras

Diseñar credenciales individuales por asesora, con vencimiento semanal, revocación inmediata, registro de accesos/ventas y pausa de sesión. No usar una contraseña semanal compartida por todo el equipo: no permite atribuir quién registró un movimiento. Antes de conectar, definir quién emite y renueva las credenciales y el flujo de recuperación. La pantalla local actual no implementa autenticación; su nombre de responsable es texto de registro, no identidad verificada.

## Reglas que faltan confirmar antes de importación

- Quién autoriza ajustes, mermas, salidas sin suficiente stock y compras urgentes.
- Si “GigaPrint” recibe traspasos como transferencia entre ubicaciones propias o como salida/venta interna con valorización; por ahora la app solo registra traspaso físico.
- Unidad real y longitud/ancho por rollo, retazos aprovechables, reservas para órdenes de trabajo y si la disponibilidad debe descontar reservas.
- Niveles mínimos por artículo/sucursal, proveedores y costos vigentes.
- Cuándo un contacto del CRM se convierte en cliente y qué datos de identificación/contacto son obligatorios.
- Nombre del responsable verificado al registrar cada movimiento, no solo texto libre.

## Enlaces de las fuentes en línea

- [Inventario de taller compartido](https://onedrive.live.com/:x:/g/personal/8f3105de0180f5e8/IQB00R-0xJQkTpGSN6alIAJJAQ1wng99iTjTEkwmlOcbSds?rtime=WKWa7Jkv30g&nav=MTVfezU3OUNFRUZELTkzQjItNDk3MC1CQzcyLTIyNDUzM0JEMjlFMH0&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy84ZjMxMDVkZTAxODBmNWU4L0lRQjAwUi0weEpRa1RwR1NONmFsSUFKSkFRMXduZzk5aVRqVEVrd21sT2NiU2RzP2U9eUxKdG84Jm5hdj1NVFZmZXpVM09VTkZSVVpFTFRrelFqSXRORGszTUMxQ1F6Y3lMVEl5TkRVek0wSkVNamxGTUgw)
- [Inventario de sublimación compartido](https://onedrive.live.com/:x:/g/personal/8F3105DE0180F5E8/IQCOET4eOwtZQrKkmK-5araHAZlR6bGmPmXB7KGOLQI6ny8?resid=8F3105DE0180F5E8!s1e3e118e0b3b4259b2a498afb96ab687&ithint=file%2Cxlsx&e=iAEcwB&nav=MTVfezNFRUU3NjIxLTU4MjYtNEFERi1CRjc3LTIxMDkzQjUyQzk4RH0&migratedtospo=true&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy84ZjMxMDVkZTAxODBmNWU4L0lRQ09FVDRlT3d0WlFyS2ttSy01YXJhSEFabFI2YkdtUG1YQjdLR09MUUk2bnk4P2U9aUFFY3dCJm5hdj1NVFZmZXpORlJVVTNOakl4TFRVNE1qWXRORGszTUMxQ1F6Y3lMVEl5TkRVek0wSkVNamxGTUgw)
- [Google Sheets: inventario señalado como no actualizado](https://docs.google.com/spreadsheets/d/1Sqguh2awbRb0HgJ_xq_HpB-c85yvErVjioZFH6XZnQg/edit?usp=sharing)

La revisión de OneDrive en esta sesión se limitó a los datos que la vista compartida mostró y a las capturas entregadas; el libro no expuso un archivo local descargado para auditar todas sus filas. Este diagnóstico no registra cambios en esas fuentes.
