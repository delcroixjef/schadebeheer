-- PROTOTYPE ONLY: public write policies for anon role.
-- Replace with proper Supabase Auth or service role before production deployment.

-- 1. Align import_batches with importer contract
ALTER TABLE public.import_batches
  RENAME COLUMN bestandsnaam TO bron_bestand;

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS aangemaakt_door uuid,
  ADD COLUMN IF NOT EXISTS aangemaakt_door_naam text,
  ADD COLUMN IF NOT EXISTS aangemaakt_op timestamptz NOT NULL DEFAULT now();

-- Drop legacy columns from the earlier migration (no data yet)
ALTER TABLE public.import_batches
  DROP COLUMN IF EXISTS aantal_records,
  DROP COLUMN IF EXISTS aantal_overgeslagen,
  DROP COLUMN IF EXISTS uitgevoerd_door,
  DROP COLUMN IF EXISTS uitgevoerd_door_naam;

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_status_chk
  CHECK (status IN ('pending','active','failed'));

-- Enforce at most one active batch per insurer
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_one_active_per_verzekeraar
  ON public.import_batches (verzekeraar)
  WHERE status = 'active';

-- 2. Link referentieprijzen to its batch
ALTER TABLE public.referentieprijzen
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS referentieprijzen_batch_id_idx
  ON public.referentieprijzen (batch_id);