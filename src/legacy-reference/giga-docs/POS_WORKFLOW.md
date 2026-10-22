# POS y flujo operativo de Gigaprint

## Resultado de la auditoría (24 de agosto de 2026)

Cada venta genera una ruta de operaciones dependientes y sincronizada mediante `pos_production_operations`.

Ruta base:

1. Asesoría y venta (se completa al registrar la venta).
2. Diseño y preparación de archivos.
3. Aprobación de arte del cliente. Esta etapa bloquea fabricación.
4. Producción por áreas: impresión, corte láser/CNC y/o sublimación. Pueden ejecutarse en paralelo.
5. Taller/armado, cuando el producto lo necesita; espera las producciones previas.
6. Control de calidad.
7. Entrega o instalación.

Una lámpara con vinil impreso, por ejemplo, se propone como `diseño → aprobación → impresión + corte láser → taller → calidad → entrega`. La asesora puede corregir las áreas sugeridas antes de registrar la venta.

## Archivos principales

- `src/lib/productionWorkflow.js`: inferencia de áreas, tiempos, dependencias, asignación y agenda laboral.
- `src/lib/posStore.js`: venta, pagos, órdenes, operaciones, sincronización y estados.
- `src/pages/pos/POSProductionControl.jsx`: tablero operativo y calendario de capacidad.
- `src/pages/pos/POSPage.jsx`: mostrador, selección de ruta y centro operativo.
- `supabase/migrations/20260824000000_pos_production_workflow_engine.sql`: esquema, índices, realtime y dependencias.
- `supabase/migrations/20260824020000_pos_team_roles_cash_permissions.sql`: capacidades de caja, metas, espacio inicial y validación de apertura por rol.
- `supabase/migrations/20260824030000_auth_pos_access_realtime.sql`: propietarios superadmin idempotentes y publicación Realtime de todas las tablas escuchadas por el POS.
- `supabase/migrations/20260824050000_pos_secure_sessions_rls.sql`: PIN cifrado, sesiones revocables, bloqueo por intentos, bitácora y cierre de RLS anónimo.
- `supabase/migrations/20260824051000_pos_atomic_sales.sql`: venta completa atómica e idempotente.
- `supabase/migrations/20260824052000_pos_public_tracking_art.sql`: rastreo y aprobación pública con datos limitados.
- `supabase/migrations/20260824060000_pos_business_operations.sql`: calidad, postventa, mantenimiento, instalaciones, recetas y automatizaciones.

## Reglas funcionales

- Una venta exige turno abierto, cliente, teléfono, artículos y ruta productiva.
- Solo `asesora`, `admin` y `super_admin` pueden abrir caja. Supabase lo valida con el trigger `trg_pos_validate_cash_shift_owner`.
- Solo `asesora` tiene meta semanal de ventas. Los demás roles conservan `weekly_goal = 0`.
- Administradores acceden a todos los espacios; coordinación asigna responsables, fechas y duración; cada operador ve y ejecuta únicamente trabajos compatibles con su área.
- Los PIN semanales de caja solo se rotan para integrantes con `can_open_cash = true`; el resto usa acceso operativo sin convertirse en cajero.
- `/admin/login` autentica propietarios con Supabase Auth y lee `role`/`display_name` desde `profiles`; el correo proviene de `auth.users`.
- En `/pos` y `/caja`, la pestaña Administrador usa las mismas credenciales Supabase. La pestaña Equipo usa el PIN de seis dígitos de cada integrante.
- Después del PIN, asesoras entran a mostrador; coordinación, diseño y operadores entran automáticamente al espacio permitido por `getRoleCapabilities`.
- Un descuento exige motivo.
- Efectivo recibido, valor aplicado y vuelto se guardan por separado.
- Los números de orden evitan colisiones entre terminales.
- Una operación se libera cuando todas sus dependencias están terminadas.
- Al avanzar operaciones se actualizan `workflow_status` y `production_stage`.
- La agenda trabaja de lunes a viernes, 08:00–17:00. El coordinador puede cambiar fecha, duración y responsable.
- Órdenes antiguas sin operaciones se reconstruyen al hidratar el POS.

## Verificación

```powershell
npm run build
$env:SUPABASE_DB_PASSWORD='<PASSWORD>'
node scripts/verify-pos-remote.mjs
node scripts/test-pos-workflow-transaction.mjs
```

La prueba transaccional usa `BEGIN/ROLLBACK` y no deja pedidos de prueba.

## Seguridad vigente

- Administradores: Supabase Auth más rol `admin`/`super_admin` en `profiles`.
- Personal operativo: PIN verificado exclusivamente en PostgreSQL; el navegador recibe un token aleatorio revocable de 12 horas.
- Los PIN se guardan con `pgcrypto` y no se devuelven en directorios, vistas ni caché local.
- Ocho intentos fallidos bloquean temporalmente la identidad durante 15 minutos.
- Las escrituras pasan por RPC según rol; las políticas anónimas de las tablas operativas fueron eliminadas.
- El catálogo activo conserva lectura pública. Rastreo y artes usan RPC limitadas, no lectura directa del POS.
- Cada venta usa una clave idempotente y una sola transacción para evitar pedidos duplicados o incompletos.

## Próxima fase recomendada

1. Crear recetas/BOM reales por familia del catálogo y reservas de material por orden.
2. Conectar la cola `pos_automation_outbox` a WhatsApp Business/Meta y correo mediante Edge Functions.
3. Añadir horarios por empleado, feriados, ausencias y capacidad por máquina.
4. Integrar facturación electrónica con un proveedor autorizado por SRI; la pantalla actual no autoriza comprobantes reales.
5. Activar backups programados, alertas de errores y analítica de uso.
6. Vincular dominio propio y Vercel cuando el propietario lo decida.
