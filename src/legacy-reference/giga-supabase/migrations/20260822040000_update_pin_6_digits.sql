-- =========================================================================================
-- MIGRATION: 20260822040000_update_pin_6_digits.sql
-- DESCRIPTION: Actualización del estándar de PIN de 4 a 6 dígitos para seguridad de caja POS.
-- =========================================================================================

DROP VIEW IF EXISTS public.pos_active_weekly_credentials;

ALTER TABLE IF EXISTS public.pos_advisors 
  ALTER COLUMN pin TYPE VARCHAR(6),
  ALTER COLUMN weekly_pin TYPE VARCHAR(6);

ALTER TABLE public.pos_advisors
  ALTER COLUMN weekly_pin SET DEFAULT '123456';

CREATE OR REPLACE FUNCTION public.rotate_advisor_weekly_credentials(p_force boolean DEFAULT false)
RETURNS TABLE (
  advisor_id text, advisor_name text, new_weekly_pin text,
  new_weekly_password text, week_code text, rotated_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week text := to_char(CURRENT_DATE, 'IYYY-"W"IW');
  v_monday date := date_trunc('week', CURRENT_DATE)::date;
BEGIN
  RETURN QUERY
  UPDATE public.pos_advisors AS a
  SET weekly_pin = lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
      weekly_password = lower(regexp_replace(split_part(a.name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) || '-' || lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
      current_week_code = v_current_week,
      pin_last_rotated_at = v_monday,
      updated_at = now()
  WHERE a.is_active = true
    AND (p_force OR a.current_week_code IS NULL OR a.current_week_code <> v_current_week)
  RETURNING a.id, a.name, a.weekly_pin, a.weekly_password, a.current_week_code, a.pin_last_rotated_at;
END;
$$;

CREATE VIEW public.pos_active_weekly_credentials AS
SELECT id, name, email, phone, role, weekly_pin, weekly_password,
       current_week_code, pin_last_rotated_at, weekly_goal, is_active
FROM public.pos_advisors
WHERE is_active = true
ORDER BY name;

GRANT SELECT ON public.pos_active_weekly_credentials TO authenticated, anon;

-- Comentario descriptivo de seguridad
COMMENT ON COLUMN public.pos_advisors.pin IS 'PIN maestro de 6 dígitos numéricos para desbloqueo de terminal POS';
COMMENT ON COLUMN public.pos_advisors.weekly_pin IS 'PIN rotativo semanal de 6 dígitos numéricos';

-- Actualización de PINs de demostración a 6 dígitos
UPDATE public.pos_advisors SET pin = '842190', weekly_pin = '842190', weekly_password = 'vicky-842190' WHERE id = 'adv-vicky';
UPDATE public.pos_advisors SET pin = '395214', weekly_pin = '395214', weekly_password = 'karla-395214' WHERE id = 'adv-karla';
UPDATE public.pos_advisors SET pin = '618472', weekly_pin = '618472', weekly_password = 'mariela-618472' WHERE id = 'adv-mariela';
UPDATE public.pos_advisors SET pin = '749153', weekly_pin = '749153', weekly_password = 'karen-749153' WHERE id = 'adv-karen';
UPDATE public.pos_advisors SET pin = '283506', weekly_pin = '283506', weekly_password = 'amy-283506' WHERE id = 'adv-amy';
UPDATE public.pos_advisors SET pin = '916328', weekly_pin = '916328', weekly_password = 'fernando-916328' WHERE id = 'adv-fernando';
UPDATE public.pos_advisors SET pin = '530841', weekly_pin = '530841', weekly_password = 'ventas-530841' WHERE id = 'adv-otros';
