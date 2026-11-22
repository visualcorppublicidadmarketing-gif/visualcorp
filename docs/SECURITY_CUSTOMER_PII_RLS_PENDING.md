# Revisión de lectura de clientes en RLS

- **Fecha de revisión:** 2026-11-22
- **Estado:** el hallazgo de acceso por mera membresía fue descartado en la política efectiva local.
- **Evidencia:** la política base `customers_read` en `20261022154601_visualcorp_core_inventory_sales.sql` es permisiva, pero `20261023215919_visualcorp_editable_access_profiles.sql` instala `vc_access_select` como política restrictiva para `customers`, con `crm.view`. PostgreSQL combina la restricción con las políticas permisivas, así que una membresía activa por sí sola no concede lectura.
- **Alcance del cambio comercial:** `20261122050821_restrict_commercial_data_read_permissions.sql` no cambia la política de `customers`. La prueba sintética RLS confirma esa exclusión, y el mismo cambio ya está aplicado al proyecto Supabase de Visual Corp.
- **Pendiente real separado:** `sale_fulfillment_details` contiene direcciones y coordenadas de instalación; está registrado como VC-RF-022 en `docs/ADMIN_RELIABILITY_BACKLOG.md` y recibe un gate local que exige permisos del flujo correspondiente.
- **Límite:** el proyecto remoto ya recibió la migración comercial; esta comprobación de `customers` sigue basada en las políticas fuente y no en una consulta autenticada a producción.
