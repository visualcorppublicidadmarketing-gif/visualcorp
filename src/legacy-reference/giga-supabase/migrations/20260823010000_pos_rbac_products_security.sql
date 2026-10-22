-- ==============================================================================
-- GIGAPRINT POS & CRM - SEGURIDAD Y CONTROL DE ROLES EN CATALOGO (RBAC)
-- Migración: 20260823010000_pos_rbac_products_security.sql
-- ==============================================================================

-- 1. Habilitar RLS en la tabla pos_products
ALTER TABLE IF EXISTS public.pos_products ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas anteriores con permisos indiscriminados
DROP POLICY IF EXISTS "POS Full Access Products" ON public.pos_products;
DROP POLICY IF EXISTS "Lectura y escritura publica o autenticada de productos" ON public.pos_products;
DROP POLICY IF EXISTS "Public Read Products" ON public.pos_products;
DROP POLICY IF EXISTS "Public & Advisor Read Products" ON public.pos_products;
DROP POLICY IF EXISTS "Admin Only Write Products" ON public.pos_products;

-- 3. Permitir LECTURA a cualquier usuario (terminal de venta, asesoras, cotizadores públicos)
CREATE POLICY "Public & Advisor Read Products"
  ON public.pos_products
  FOR SELECT
  USING (true);

-- 4. Permitir INSERT, UPDATE, DELETE EXCLUSIVAMENTE a usuarios con rol 'admin' o 'super_admin'
CREATE POLICY "Admin Only Write Products"
  ON public.pos_products
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Comentario explicativo
COMMENT ON TABLE public.pos_products IS 'Catálogo maestro de sustratos y productos Gigaprint. Solo administradores pueden modificar precios base; las asesoras tienen permiso de lectura y asignación de precios por ítem en venta.';
