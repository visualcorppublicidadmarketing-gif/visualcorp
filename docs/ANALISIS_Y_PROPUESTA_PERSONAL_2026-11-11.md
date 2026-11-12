# Análisis integral y plan evolutivo de `/operaciones/personal` — Visual Corp Suite (2026-11-11)

## 1. Hallazgos críticos resueltos en esta entrega

1. **Consultas rotas contra el esquema real de Supabase (`3/3` corregidas):**
   - `PersonnelPage.tsx` consultaba columnas inexistentes en producción (`sale_number`, `customer_name`, `paid_total`, `balance_due`, `sold_by`, `sold_at` en `sales`; `selected_mode`, `totals` en `central_quotes`; `stage`, `responsible_name` en `production_orders`) y descartaba errores silenciosamente mostrando `0` falsos.
   - Se corrigieron las lecturas contra `sales` (`sale_code`, `advisor_id`, `customers(full_name)`, `sale_payments(amount)`), `central_quotes` (`chosen_tier`, `selected_total`, estados `'accepted' | 'converted'`) y `production_jobs` + `production_job_steps` + `areas(name,code)` + `production_orders`, mostrando avisos explícitos ante errores o permisos faltantes.
   - También se corrigió el select de `personnel_records` en `TeamAccess.tsx` (`position_title/employment_status/google_account_email/membership_id` → `email/department/job_title/status`), reparando el enlace directo `?ficha=`.

2. **Máquina de estados y permisos de deducciones (`finance_payroll_deductions`):**
   - El trigger `app_private.guard_finance_payroll_deduction()` exige 4 pasos exactos: `pending_authorization` → `authorized` (con `authorization_reference` y `evidence_reference`) → `sent_to_payroll` (con `payroll_handoff_reference`) → `applied_externally` (o `cancelled`).
   - El código anterior saltaba `sent_to_payroll`, inventaba referencias ficticias (`AUT-...`, `REG-RRHH-...`) y habilitaba botones a usuarios sin `personnel.edit_compensation` provocando `42501`. Se reemplazó por `PersonnelDeductionTransitionDialog.tsx` y validación previa estricta.

3. **Zona horaria Ecuador (`America/Guayaquil`) y cumplimiento laboral 2026:**
   - Se reemplazó `.toISOString().slice(0,10)` (UTC, se adelantaba a mañana después de las 19:00 EC) por `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' })`.
   - Se eliminó la multa arbitraria de `$5.00` al convertir atrasos en deducción, sustituyéndola por descuento proporcional exacto por tiempo no trabajado (`salario_mensual / 240 / 60 * minutos`) y controles preventivos del Art. 44 / Art. 64 del Código del Trabajo (prohibición de multas sin Reglamento Interno aprobado en el SUT y tope máximo del 10%).
   - Parametrización por año fiscal (SBU 2025 `$470`, SBU 2026 `$482` Acuerdo MDT-2025-195, IESS 9,45% personal / 12,15% patronal, Fondos de Reserva 8,33% desde mes 13, Vacaciones Art. 69 15d +1 desde año 6, Región Costa Décimo Cuarto hasta el 15 de marzo).

4. **Semiótica visual, accesibilidad WCAG 2.2 AA, tema oscuro y responsive:**
   - Nueva gramática `.vc-semiotic-badge` (forma + borde sólido/discontinuo + icono + texto + contraste AA en claro y oscuro), `tabular-nums` en cifras, signo menos tipográfico (`\u2212`), enmascaramiento de salarios con auto-bloqueo a los 60s y reemplazo de modales/pestañas artesanales por `DialogSystem`, `AnimatedTabs`, `Avatar`, `SelectDropdown` y `DatePicker`.
   - Limpieza de reglas `.personnel-*` conflictivas en `admin-dark-refinements.css` y diseño responsive sin desbordamiento desde 320px hasta 1440px (incluyendo laptops de 1280px con barra lateral desplegada).

---

## 2. Qué otras cosas siguen siendo necesarias (Pendientes recomendados)

### A. Base de datos y migraciones futuras (NO aplicadas automáticamente por historial desalineado)
> Nota: En Supabase remoto hay migraciones históricas con distinto timestamp entre local y remoto (`inventory_live_rolls_and_fast_ops` hasta `catalog_family_workflow_routes`) y 1 archivo local pendiente de aplicar (`20261111180500_cash_sales_admin_delete_rpcs.sql`; `20261111174327_admin_deletion_audits_table.sql` y `20261111174358_cash_sales_permissions_policies_and_audit_rls.sql` ya quedaron registradas en remoto). Se recomienda cotejar y alinear primero antes de ejecutar `supabase db push --linked`.

1. **Asistencia persistente multi-dispositivo (`public.personnel_attendance_logs`):**
   - Actualmente la asistencia vive en `localStorage` por navegador (la interfaz ahora lo advierte con honestidad y permite exportar CSV).
   - Propuesta SQL mínima recomendada cuando se destraben las migraciones:
     - Tabla `personnel_attendance_logs (id uuid pk, organization_id, personnel_id, work_date date, status text, check_in time, check_out time, late_minutes int, location_note text, note text, recorded_by uuid, unique (organization_id, personnel_id, work_date))` con RLS basada en `has_visualcorp_access(organization_id, 'personnel', 'view'|'edit')` + vista/auto-marcación del propio colaborador vinculado.
2. **Expediente legal EC e integración con rol externo (`public.personnel_legal_profiles`):**
   - Guardar en BD (y no solo como cálculo referencial): número de cédula, elección escrita de mensualización/acumulación de Décimo Tercero, Décimo Cuarto y Fondos de Reserva, cargas familiares verificadas para el 5% de utilidades (Art. 97), registro SUT del contrato/aviso de entrada IESS, y código/banco para transferencias.
3. **Tabla de configuración laboral por año fiscal (`public.hr_fiscal_parameters`) y política de empresa:**
   - Parametrizar en BD SBU vigente, % IESS y bandera booleana `has_approved_sut_internal_regulations` (Art. 64 para empresas con 10+ trabajadores) en lugar de depender de confirmación manual en pantalla.
4. **Cierre de brecha de datos y permisos en producción actual:**
   - Al 11 de noviembre de 2026 existen `8` perfiles/`10` membresías activas en `organization_memberships`, pero solo `1` fila en `personnel_records` y `1` vínculo en `personnel_account_links`. Conviene dar de alta y vincular las fichas restantes para activar turnos y métricas por colaborador.
   - Revisar `access_profile_permissions` para `module_key = 'personnel'`: actualmente solo `admin` (y `view` en `personal_taller`) tienen permisos explícitos; valorar habilitar `personnel.view` a `gerencia` y `encargado_local` según necesidad operativa.
   - En `OperationsFinanceControls.tsx`, alinear la creación/transición de deducciones para validar `hasPermission('personnel', 'edit_compensation')` (no solo `view_compensation`).
