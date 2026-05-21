
-- Fix function search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Replace permissive write policies
DROP POLICY IF EXISTS "auth write insurers" ON public.insurers;
DROP POLICY IF EXISTS "auth write abex" ON public.abex_index;
DROP POLICY IF EXISTS "auth write dossiers" ON public.dossiers;
DROP POLICY IF EXISTS "auth write audit" ON public.audit_log;
DROP POLICY IF EXISTS "auth write settings" ON public.settings;

CREATE POLICY "auth write insurers" ON public.insurers FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth write abex" ON public.abex_index FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth write dossiers" ON public.dossiers FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth write audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth write settings" ON public.settings FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
