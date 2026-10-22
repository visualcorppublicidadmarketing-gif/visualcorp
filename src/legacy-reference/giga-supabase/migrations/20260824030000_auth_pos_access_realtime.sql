-- Gigaprint: consolida propietarios CMS y sincronización operativa en tiempo real.

-- La promoción es idempotente y también cubre usuarios creados después de la
-- migración original de perfiles.
UPDATE public.profiles AS profile
SET role = 'super_admin', updated_at = NOW()
FROM auth.users AS app_user
WHERE profile.id = app_user.id
  AND lower(app_user.email) IN ('ecgigaprint@gmail.com', 'estebanico10@gmail.com')
  AND profile.role IS DISTINCT FROM 'super_admin';

-- El cliente POS ya escucha estas tablas. Deben pertenecer a la publicación
-- para que ventas, turnos, equipo y coordinación cambien en todos los equipos.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'pos_advisors',
    'pos_orders',
    'pos_payments',
    'pos_cash_shifts',
    'pos_customers',
    'pos_products',
    'pos_expenses',
    'pos_customer_activity_logs'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

COMMENT ON TABLE public.profiles IS
  'Perfil asociado a auth.users. El frontend obtiene email desde Auth y role/display_name desde esta tabla.';
