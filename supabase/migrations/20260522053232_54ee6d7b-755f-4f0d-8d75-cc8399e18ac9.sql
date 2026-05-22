
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS catalogus_type text NOT NULL DEFAULT 'algemeen',
  ADD COLUMN IF NOT EXISTS catalogus_label text;

ALTER TABLE public.referentieprijzen
  ADD COLUMN IF NOT EXISTS catalogus_type text NOT NULL DEFAULT 'algemeen',
  ADD COLUMN IF NOT EXISTS catalogus_label text;

DROP INDEX IF EXISTS public.import_batches_one_active_per_verzekeraar;

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_one_active_per_verzekeraar_catalogus
  ON public.import_batches (verzekeraar, catalogus_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS referentieprijzen_catalogus_idx
  ON public.referentieprijzen (verzekeraar, catalogus_type);
