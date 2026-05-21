ALTER TABLE public.import_batches
  DROP CONSTRAINT IF EXISTS import_batches_status_chk;

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_status_chk
  CHECK (status IN ('pending','active','failed','superseded'));