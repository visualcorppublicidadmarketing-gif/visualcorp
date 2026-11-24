# Revisión de POS de código abierto

**Fecha:** 2026-11-24
**Alcance:** revisión estática de código público y comparación con el POS de Visual Corp Suite. No se ejecutaron esos productos ni se copiaron archivos fuente.

## Hallazgos del POS actual

La ruta `/operaciones/pos` usa `CheckoutWorkspace`. Ya reúne búsqueda por nombre, SKU y descripción; navegación con flechas/Enter; favoritos por asesora; filtros de inventario; carrito; pedidos en espera; pagos divididos; y recuperación idempotente de ventas. Por eso la mejora debe reforzar el flujo existente y cubrir fallas concretas, no sustituirlo por otra pantalla.

## Referentes revisados

| Repositorio | Patrón relevante | Decisión para Visual Corp |
| --- | --- | --- |
| [Odoo POS 19](https://github.com/odoo/odoo/tree/19.0/addons/point_of_sale) | Busca por producto, referencia y código de barras; organiza selección de variantes y carga resultados por páginas. | Mantener la búsqueda rápida y el catálogo existente; usar navegación predecible, sin reemplazar el flujo de cotización, unidades y m² propio de Visual Corp. Licencia del módulo: LGPL-3. |
| [Open Source Point of Sale](https://github.com/opensourcepos/opensourcepos) | Registra ventas y distingue acciones de caja dentro del flujo del registro. Tiene licencia MIT. | Conservar los controles de turno y movimientos integrados al POS, pero endurecer el reintento para que una respuesta perdida no registre dos veces la misma entrada o retiro. |
| [X POS](https://github.com/kodlyft/xpos) | Su README describe borradores, devoluciones, pagos y recuperación después de interrupciones de red. El README también advierte que la rama `develop` atraviesa cambios grandes. | Tomar como referencia el principio de guardar y recuperar el estado de una operación, no su implementación ni una dependencia de una rama en desarrollo. |

## Accesibilidad de la búsqueda

La implementación anterior declaraba la cuadrícula de tarjetas como `listbox` y cada tarjeta como `option`, aunque dentro de cada opción había botones independientes para favoritos y agregado rápido. El patrón oficial de WAI-ARIA explica que un `listbox` no admite la interacción accesible con botones dentro de una opción; recomienda usar el patrón `grid` para listas de controles interactivos. Para conservar la cuadrícula visual y el teclado actual sin convertir cada resultado en un widget complejo, el cambio usa una lista semántica (`list`/`listitem`), con la selección principal y las acciones secundarias como botones separados y un anuncio accesible para el resultado resaltado con flechas.

Referencia: [WAI-ARIA APG: Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).

## Catálogos de componentes consultados

- **HeroUI React MCP 3.2.8:** se consultaron `ComboBox`, `SearchField` y `Kbd`. El componente de selección usa una lista de opciones convencional; adoptar HeroUI aquí requeriría añadir su capa de componentes a una interfaz ya implementada y no resolvería por sí sola las acciones interactivas de cada tarjeta.
- **shadcn:** se revisó la búsqueda MCP; el repositorio no tiene `components.json`, así que no hay registros configurados para buscar o instalar. No se inicializó uno.
- **Magic UI MCP:** se buscaron patrones para campo de búsqueda accesible, combobox y navegación de catálogo. Los resultados disponibles (como fondos animados y rejillas de tarjetas) no resuelven el flujo de caja ni el modelo de selección del POS.

Decisión: conservar React y CSS actuales, sin dependencias nuevas. Es el camino más compatible y mantenible para corregir la semántica sin rehacer la búsqueda ni alterar los filtros, favoritos y acciones existentes.

## Mejora de confiabilidad de caja

La revisión local encontró que el POS generaba una clave idempotente nueva al enviar cada entrada/retiro manual. Si el servidor guardaba el movimiento pero se perdía la respuesta, el segundo intento podía crear otra fila. El cliente ahora persiste antes del RPC el turno, sentido, monto en centavos, motivo y clave. Si falta confirmación, restaura el mismo formulario y reenvía exactamente esa operación. La nueva migración `20261124164053_pos_durable_cash_movement_recovery.sql` compara el contenido existente para esa clave, devuelve la fila original en caso de coincidencia y rechaza datos distintos; permite también confirmar un intento que sí se guardó aunque el turno ya se haya cerrado.

**Estado de publicación (2026-11-24):** la migración `20261124164053_pos_durable_cash_movement_recovery.sql` se aplicó al proyecto Supabase Visual Corp y quedó registrada remotamente como versión `20261124164616`. El [PR #382](https://github.com/visualcorppublicidadmarketing-gif/visualcorp/pull/382) se fusionó en el commit `59e403d5e68eaffec4228374cfb598268b9f9195`; Vercel marcó producción como `READY` y `/operaciones/pos` respondió HTTP 200. CI #820 pasó los checks específicos del POS, TypeScript y build.

No se registraron movimientos financieros de prueba en producción. Para un intento sin confirmación, el cliente conserva el payload y reintenta con la misma clave; la RPC devuelve el movimiento original únicamente si coincide el turno, sentido, monto, motivo y usuario.

## Límites de la investigación

La comparación se basó en archivos públicos y documentación de los repositorios, no en pruebas en vivo de sus productos. Las referencias sirven para identificar patrones; este proyecto no incorpora código fuente de esos POS.
