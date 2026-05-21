ALTER TABLE public.schade_lijnen
  ADD COLUMN IF NOT EXISTS beheerder_oordeel text,
  ADD COLUMN IF NOT EXISTS beheerder_oordeel_op timestamptz,
  ADD COLUMN IF NOT EXISTS beheerder_oordeel_door uuid;

ALTER TABLE public.schade_lijnen
  DROP CONSTRAINT IF EXISTS schade_lijnen_beheerder_oordeel_check;
ALTER TABLE public.schade_lijnen
  ADD CONSTRAINT schade_lijnen_beheerder_oordeel_check
  CHECK (beheerder_oordeel IS NULL OR beheerder_oordeel IN ('goedgekeurd','afgekeurd'));