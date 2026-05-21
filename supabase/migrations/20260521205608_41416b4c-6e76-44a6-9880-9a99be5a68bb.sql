ALTER TABLE public.referentieprijzen
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS opmerking text;

CREATE INDEX IF NOT EXISTS referentieprijzen_code_idx
  ON public.referentieprijzen (verzekeraar, code);