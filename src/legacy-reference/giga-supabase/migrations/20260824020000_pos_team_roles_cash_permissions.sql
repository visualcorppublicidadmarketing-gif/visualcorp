-- Gigaprint POS: separa caja, metas comerciales y coordinación por rol.

ALTER TABLE public.pos_advisors
  ADD COLUMN IF NOT EXISTS can_open_cash BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_sales_goal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'coordination';

UPDATE public.pos_advisors
SET
  can_open_cash = role IN ('asesora', 'admin', 'super_admin'),
  has_sales_goal = role = 'asesora',
  workspace_type = CASE WHEN role IN ('asesora', 'admin', 'super_admin') THEN 'cash' ELSE 'coordination' END,
  weekly_goal = CASE WHEN role = 'asesora' THEN COALESCE(weekly_goal, 0) ELSE 0 END,
  assigned_area = COALESCE(assigned_area, CASE role
    WHEN 'asesora' THEN 'ventas'
    WHEN 'encargado_local' THEN 'sucursal'
    WHEN 'coordinador_taller' THEN 'taller'
    WHEN 'disenador' THEN 'diseno'
    WHEN 'operador_impresion' THEN 'impresion'
    WHEN 'operador_sublimacion' THEN 'sublimacion'
    WHEN 'operador_corte_laser' THEN 'corte_laser'
    WHEN 'operador_taller' THEN 'taller'
    WHEN 'instalador' THEN 'entrega'
    ELSE 'gerencia'
  END);

CREATE OR REPLACE FUNCTION public.pos_normalize_team_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.can_open_cash := NEW.role IN ('asesora', 'admin', 'super_admin');
  NEW.has_sales_goal := NEW.role = 'asesora';
  NEW.workspace_type := CASE WHEN NEW.can_open_cash THEN 'cash' ELSE 'coordination' END;
  IF NOT NEW.has_sales_goal THEN NEW.weekly_goal := 0; END IF;
  IF NEW.assigned_area IS NULL OR NEW.assigned_area = '' THEN
    NEW.assigned_area := CASE NEW.role
      WHEN 'asesora' THEN 'ventas'
      WHEN 'encargado_local' THEN 'sucursal'
      WHEN 'coordinador_taller' THEN 'taller'
      WHEN 'disenador' THEN 'diseno'
      WHEN 'operador_impresion' THEN 'impresion'
      WHEN 'operador_sublimacion' THEN 'sublimacion'
      WHEN 'operador_corte_laser' THEN 'corte_laser'
      WHEN 'operador_taller' THEN 'taller'
      WHEN 'instalador' THEN 'entrega'
      ELSE 'gerencia'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_normalize_team_role ON public.pos_advisors;
CREATE TRIGGER trg_pos_normalize_team_role
BEFORE INSERT OR UPDATE OF role, weekly_goal, assigned_area ON public.pos_advisors
FOR EACH ROW EXECUTE FUNCTION public.pos_normalize_team_role();

-- El administrador local del POS necesita identidad propia para registrar arqueos.
INSERT INTO public.pos_advisors (
  id, name, pin, weekly_pin, weekly_password, role, assigned_area,
  weekly_goal, is_active, can_open_cash, has_sales_goal, workspace_type
)
VALUES (
  'adv-admin', 'Administrador General',
  lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
  lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
  encode(gen_random_bytes(18), 'hex'), 'super_admin', 'gerencia',
  0, true, true, false, 'cash'
)
ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin', assigned_area = 'gerencia', weekly_goal = 0,
  is_active = true, can_open_cash = true, has_sales_goal = false, workspace_type = 'cash';

CREATE OR REPLACE FUNCTION public.pos_validate_cash_shift_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_advisors
    WHERE id = NEW.advisor_id AND is_active = TRUE AND can_open_cash = TRUE
  ) THEN
    RAISE EXCEPTION 'El integrante seleccionado no tiene permiso para abrir caja';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_validate_cash_shift_owner ON public.pos_cash_shifts;
CREATE TRIGGER trg_pos_validate_cash_shift_owner
BEFORE INSERT OR UPDATE OF advisor_id ON public.pos_cash_shifts
FOR EACH ROW EXECUTE FUNCTION public.pos_validate_cash_shift_owner();

CREATE OR REPLACE FUNCTION public.rotate_advisor_weekly_credentials(p_force BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  advisor_id TEXT, advisor_name TEXT, new_weekly_pin TEXT,
  new_weekly_password TEXT, week_code TEXT, rotated_at DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week TEXT := to_char(CURRENT_DATE, 'IYYY-"W"IW');
  v_monday DATE := date_trunc('week', CURRENT_DATE)::date;
BEGIN
  RETURN QUERY
  UPDATE public.pos_advisors AS a
  SET
    weekly_pin = lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
    weekly_password = lower(regexp_replace(split_part(a.name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) || '-' || lpad((floor(random() * 900000 + 100000))::text, 6, '0'),
    current_week_code = v_current_week,
    pin_last_rotated_at = v_monday,
    updated_at = now()
  WHERE a.is_active = TRUE
    AND a.can_open_cash = TRUE
    AND (p_force OR a.current_week_code IS NULL OR a.current_week_code <> v_current_week)
  RETURNING a.id, a.name, a.weekly_pin, a.weekly_password, a.current_week_code, a.pin_last_rotated_at;
END;
$$;

DROP VIEW IF EXISTS public.pos_active_weekly_credentials;
CREATE VIEW public.pos_active_weekly_credentials AS
SELECT id, name, email, phone, role, assigned_area, workspace_type,
  can_open_cash, has_sales_goal, weekly_pin, weekly_password,
  current_week_code, pin_last_rotated_at, weekly_goal, is_active
FROM public.pos_advisors
WHERE is_active = TRUE AND can_open_cash = TRUE
ORDER BY name;

GRANT SELECT ON public.pos_active_weekly_credentials TO authenticated, anon;

COMMENT ON COLUMN public.pos_advisors.can_open_cash IS 'Solo asesoras, administradores y superadministradores pueden abrir caja.';
COMMENT ON COLUMN public.pos_advisors.has_sales_goal IS 'La meta comercial semanal aplica únicamente a asesoras.';
COMMENT ON COLUMN public.pos_advisors.workspace_type IS 'Destino de inicio: cash o coordination.';
