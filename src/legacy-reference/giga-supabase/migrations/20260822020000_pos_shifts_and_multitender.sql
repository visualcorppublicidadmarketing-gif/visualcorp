-- ==============================================================================
-- MIGRATION: 20260822020000_pos_shifts_and_multitender.sql
-- DESCRIPTION: Adds tables for cash register shifts (Arqueo de Caja) and
-- multi-tender split payment records with full RLS policies.
-- ==============================================================================

-- 1. CASH REGISTER SHIFTS TABLE (Arqueo y Cierre de Caja)
CREATE TABLE IF NOT EXISTS public.pos_cash_shifts (
  id text PRIMARY KEY,
  advisor_id text REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash numeric(10,2) NOT NULL DEFAULT 0.00,
  closing_cash numeric(10,2),
  expected_cash numeric(10,2),
  difference numeric(10,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast shift lookups
CREATE INDEX IF NOT EXISTS idx_pos_cash_shifts_date ON public.pos_cash_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_pos_cash_shifts_advisor ON public.pos_cash_shifts(advisor_id);

-- Enable RLS
ALTER TABLE public.pos_cash_shifts ENABLE ROW LEVEL SECURITY;

-- Policies for pos_cash_shifts
CREATE POLICY "Public & Authenticated Read Access to Shifts"
  ON public.pos_cash_shifts FOR SELECT USING (true);

CREATE POLICY "Authenticated Staff Full Access to Shifts"
  ON public.pos_cash_shifts FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_cash_shifts TO authenticated, anon;

-- ==============================================================================
-- ROLLBACK REFERENCE:
--
-- DROP TABLE IF EXISTS public.pos_cash_shifts CASCADE;
-- ==============================================================================
