-- ==============================================================================
-- MIGRATION: 20260822010000_weekly_credential_rotation.sql
-- DESCRIPTION: Dynamic weekly credential & PIN rotation for commercial advisors.
-- Rotates every Monday automatically or on demand via SQL function.
-- ==============================================================================

-- 1. Extend pos_advisors table with weekly credentials tracking
ALTER TABLE IF EXISTS public.pos_advisors
  ADD COLUMN IF NOT EXISTS weekly_pin text DEFAULT '1234',
  ADD COLUMN IF NOT EXISTS weekly_password text DEFAULT 'asesora-1234',
  ADD COLUMN IF NOT EXISTS current_week_code text DEFAULT to_char(CURRENT_DATE, 'IYYY-"W"IW'),
  ADD COLUMN IF NOT EXISTS pin_last_rotated_at date DEFAULT (date_trunc('week', CURRENT_DATE)::date);

-- 2. Function to rotate credentials for all active advisors
CREATE OR REPLACE FUNCTION public.rotate_advisor_weekly_credentials(p_force boolean DEFAULT false)
RETURNS TABLE (
  advisor_id text,
  advisor_name text,
  new_weekly_pin text,
  new_weekly_password text,
  week_code text,
  rotated_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week text;
  v_monday date;
BEGIN
  v_current_week := to_char(CURRENT_DATE, 'IYYY-"W"IW');
  v_monday := date_trunc('week', CURRENT_DATE)::date;

  -- Update all active advisors if new week started or force requested
  RETURN QUERY
  UPDATE public.pos_advisors AS a
  SET
    weekly_pin = lpad((floor(random() * 9000 + 1000))::text, 4, '0'),
    weekly_password = lower(regexp_replace(split_part(a.name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) || '-' || lpad((floor(random() * 9000 + 1000))::text, 4, '0'),
    current_week_code = v_current_week,
    pin_last_rotated_at = v_monday,
    updated_at = now()
  WHERE
    a.is_active = true
    AND (p_force = true OR a.current_week_code IS NULL OR a.current_week_code != v_current_week)
  RETURNING
    a.id AS advisor_id,
    a.name AS advisor_name,
    a.weekly_pin AS new_weekly_pin,
    a.weekly_password AS new_weekly_password,
    a.current_week_code AS week_code,
    a.pin_last_rotated_at AS rotated_at;
END;
$$;

-- 3. View for easy administrative audit of current credentials
CREATE OR REPLACE VIEW public.pos_active_weekly_credentials AS
SELECT
  id,
  name,
  email,
  phone,
  role,
  weekly_pin,
  weekly_password,
  current_week_code,
  pin_last_rotated_at,
  weekly_goal,
  is_active
FROM public.pos_advisors
WHERE is_active = true
ORDER BY name ASC;

-- Grant permissions
GRANT SELECT ON public.pos_active_weekly_credentials TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rotate_advisor_weekly_credentials(boolean) TO authenticated, service_role;

-- 4. Initial seed/update for current week
UPDATE public.pos_advisors
SET
  current_week_code = to_char(CURRENT_DATE, 'IYYY-"W"IW'),
  pin_last_rotated_at = date_trunc('week', CURRENT_DATE)::date
WHERE current_week_code IS NULL;

-- ==============================================================================
-- ROLLBACK REFERENCE:
--
-- DROP VIEW IF EXISTS public.pos_active_weekly_credentials;
-- DROP FUNCTION IF EXISTS public.rotate_advisor_weekly_credentials(boolean);
-- ALTER TABLE public.pos_advisors
--   DROP COLUMN IF EXISTS weekly_pin,
--   DROP COLUMN IF EXISTS weekly_password,
--   DROP COLUMN IF EXISTS current_week_code,
--   DROP COLUMN IF EXISTS pin_last_rotated_at;
-- ==============================================================================
