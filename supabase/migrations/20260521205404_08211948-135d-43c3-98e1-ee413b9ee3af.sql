-- PROTOTYPE ONLY: public write policies for anon role.
-- Replace with proper Supabase Auth or service role before production deployment.

-- 1. Create import_batches table (used by Excel import module)
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  bestandsnaam text NOT NULL,
  verzekeraar text NOT NULL,
  geldig_van date,
  abex_basisindex integer,
  aantal_records integer NOT NULL DEFAULT 0,
  aantal_overgeslagen integer NOT NULL DEFAULT 0,
  uitgevoerd_door uuid,
  uitgevoerd_door_naam text
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- 2. Explicit permissive policies for anon + authenticated on all writable tables.
-- Drop any prior duplicates first to keep this migration idempotent.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['dossiers','schade_lijnen','referentieprijzen','abex_index','audit_log','klant_tokens','import_batches'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon rw %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "anon rw %I" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;