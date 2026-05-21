
-- Portal users access the app with a default session (no Supabase auth login),
-- so requests hit RLS as the anon role. Open the existing permissive policies
-- to the public role for all app tables.

DROP POLICY IF EXISTS "auth all dossiers" ON public.dossiers;
CREATE POLICY "all dossiers" ON public.dossiers FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth all schade_lijnen" ON public.schade_lijnen;
CREATE POLICY "all schade_lijnen" ON public.schade_lijnen FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth all abex_index" ON public.abex_index;
CREATE POLICY "all abex_index" ON public.abex_index FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth all referentieprijzen" ON public.referentieprijzen;
CREATE POLICY "all referentieprijzen" ON public.referentieprijzen FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth all klant_tokens" ON public.klant_tokens;
CREATE POLICY "all klant_tokens" ON public.klant_tokens FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "auth insert audit_log" ON public.audit_log;
CREATE POLICY "read audit_log" ON public.audit_log FOR SELECT TO public USING (true);
CREATE POLICY "insert audit_log" ON public.audit_log FOR INSERT TO public WITH CHECK (true);
