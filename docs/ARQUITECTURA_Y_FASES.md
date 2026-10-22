# Arquitectura y fases — suite web Visual Corp

## Objetivo de producto

Una suite modular con tres superficies para personas distintas:

1. **Público:** conocer capacidades, consultar el catálogo y solicitar contacto o cotización.
2. **Administración web:** mantener mensajes, servicios visibles, solicitudes, catálogo y planificación de marketing.
3. **Operaciones:** atender CRM, preparar cotizaciones, registrar movimientos POS y controlar inventario.

Las superficies se construyen en un mismo monorepo para compartir tipos y contratos. El sitio público tiene su propio módulo `src/public-site/` y su navegación: inicio, servicios y subpáginas por familia, empresa, proceso, contacto y cotizador. Admin y Operaciones siguen en rutas separadas (`/admin/*` y `/operaciones/*`) y no aparecen en la navegación pública. Al desplegar, podrán publicarse como dominios o aplicaciones distintas con una capa de datos compartida.

## Modelo local usado en esta etapa

`src/app/workspace.jsx` es la única puerta de persistencia. Su estado se guarda bajo `visualcorp-suite-local-v1` y contiene:

- `settings`, `services`: contenido que administra `/admin/sitio` y consume el sitio público; servicios desactivados se ocultan de la navegación pública.
- `leads`: solicitudes del sitio y oportunidades iniciadas desde cotizador; CRM cambia su etapa.
- `catalog`: productos importados del cotizador Visual Corp, separados de las existencias y con tarifas pendientes.
- `quotes`: conceptos, cantidad, total (nulo cuando la tarifa no se confirmó), etapa y referencia al lead opcional.
- `customers`: directorio local con nombre, teléfono, correo, notas y origen; los campos son opcionales salvo el nombre.
- `inventory`: artículos por sucursal/área con variante, ubicación, unidad, SKU, mínimo y estado de verificación del conteo.
- `inventoryMovements`: bitácora de entradas, salidas por consumo/merma/venta, ajustes de conteo, transferencias, recepciones y faltantes; guarda actor, motivo, referencia, fecha, sucursales y cantidad.
- `sales`: total manual, forma de pago, cliente, concepto, cantidad del artículo opcional y referencia del movimiento de inventario.
- `campaigns`: borradores y estado editorial; no hay API de publicación.

No hay una migración de datos GigaPrint ni de Iglesia Jerusalén. La importación del catálogo se limita a `apps/visual-cotizador/data/catalog.json` de Visual Corp; todas sus tarifas inician sin validar.

## Contratos previstos para Supabase

Antes de crear tablas, confirmar las reglas de acceso con el responsable. Posibles dominios: `profiles`, `site_settings`, `services`, `catalog_items`, `leads`, `quotes`, `inventory_items`, `inventory_movements`, `sales`, `campaigns` y `audit_events`. Deben usarse claves UUID, fechas de creación/actualización, estado de borrado lógico donde corresponda y referencias explícitas entre lead, quote y sale.

Roles por confirmar con negocio: superadministrador, administración de inventario, responsable de sucursal, asesora/caja, operador por área y auditoría de solo lectura. Las asesoras verían disponibilidad y registrarían ventas/clientes, sin ver costos ni ajustar saldos; operadores registrarían uso ligado a orden/responsable; costos, ajustes y transferencias tendrían permisos delegados. Políticas RLS deben limitar el acceso por rol, sucursal y área; ninguna tabla privada debe permitir lectura o escritura a cualquier usuario autenticado. La idea de credencial individual semanal para asesoras queda por diseñar con vencimiento/revocación y auditoría; no usar una clave compartida. Las credenciales de servicio nunca van al navegador.

## Fases

### Fase local — disponible

- Interfaces públicas, administrativas y operativas con navegación modular.
- Persistencia local de los flujos definidos arriba.
- Recorrido público → CRM; cotizador → CRM; POS → inventario y clientes cuando el operador asocia artículo/persona.
- Conteos iniciales pendientes de confirmación, bitácora y transferencias entre Visual Corp/GigaPrint en navegador local.
- Marca Visual Corp y lista de tarifas con confirmación manual.

### Fase de validación de negocio — pendiente

- Confirmar productos/servicios publicables, tarifas actuales, impuestos, reglas de cotización, materiales y unidades, métodos de pago, etapas CRM, campañas, responsables y permisos.
- Revisar textos, términos de privacidad y aviso para captación de contactos antes de publicación.

### Fase de persistencia compartida y seguridad — pendiente

- Crear proyecto Supabase y migraciones exclusivas para Visual Corp.
- Implementar login, sesiones, roles y RLS; decidir auditoría, respaldos, retención y restauración.
- Sustituir el repositorio `localStorage` por adaptadores de datos remotos con estado de carga, reintento y error.
- Definir estrategia de sincronización para ventas e inventario y protección ante doble registro.

### Fase de despliegue — pendiente

- Crear repositorio privado de Visual Corp, pipeline de revisión y ambientes de prueba/producción.
- Configurar una app o dominio para público, administración y operaciones; restringir las dos áreas internas.
- Revisar rutas SPA, dominio, variables de entorno, protección de despliegue, observabilidad, accesibilidad y pruebas de recorridos antes de publicar.

## Fuentes de referencia

- Código y arquitectura general de Giga: `E:\CODE\Giga` (reutilización autorizada por el usuario el 22-10-2026; originales intactos).
- Patrones de CRM de Iglesia Jerusalén: `E:\CODE\Iglesia Jerusalén` (solo referencia conceptual; sus permisos SQL observados no se reutilizaron).
- Catálogo de Visual Corp: `E:\VISUAL CORP\apps\visual-cotizador\data\catalog.json`.
- Identidad, alcance y datos de contacto: `E:\VISUAL CORP\00_Guia_y_contexto\CONTEXTO_MAESTRO.md` y `DATOS_COMERCIALES_CON_FUENTE.md`.
- Navegación agrupada y páginas de contenido: `https://estebanico.com/` y su proyecto local `E:\CODE\Esteban Nicola`; se adaptó el patrón de organización, sin reutilizar textos ni identidad visual.
