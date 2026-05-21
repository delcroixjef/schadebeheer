
-- Drop existing tables
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.dossiers CASCADE;
DROP TABLE IF EXISTS public.abex_index CASCADE;
DROP TABLE IF EXISTS public.insurers CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;

-- Enums
CREATE TYPE public.dossier_status AS ENUM ('concept','berekening','bestekanalyse','akkoord','afgerond','doorgestuurd_verzekeraar');
CREATE TYPE public.verzekeraar AS ENUM ('baloise','axa','vivium','ag_insurance');
CREATE TYPE public.schade_type AS ENUM ('waterschade','brandschade','glasbraak','stormschade','tuinafsluiting','andere');
CREATE TYPE public.ai_oordeel AS ENUM ('conform','licht_verhoogd','niet_conform','niet_beoordeeld');

-- Sequence for dossiernummer
CREATE SEQUENCE public.dossier_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_dossiernummer()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jaar text := to_char(now(), 'YYYY');
  nr int := nextval('public.dossier_seq');
BEGIN
  RETURN 'WZ-' || jaar || '-' || lpad(nr::text, 4, '0');
END;
$$;

-- DOSSIERS
CREATE TABLE public.dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossiernummer text UNIQUE NOT NULL DEFAULT public.generate_dossiernummer(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status public.dossier_status NOT NULL DEFAULT 'concept',
  klant_naam text NOT NULL,
  klant_adres text,
  klant_rijksregister text,
  polis_nummer text,
  verzekeraar public.verzekeraar,
  schade_datum date,
  schade_type public.schade_type,
  schade_omschrijving text,
  heeft_vrijstelling boolean NOT NULL DEFAULT false,
  vrijstelling_bedrag numeric NOT NULL DEFAULT 0,
  heeft_indirecte_verliezen boolean NOT NULL DEFAULT false,
  beheerder_id uuid,
  abex_index_gebruikt integer,
  abex_periode text
);

-- SCHADE_LIJNEN
CREATE TABLE public.schade_lijnen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  omschrijving text NOT NULL,
  eenheid text,
  hoeveelheid numeric NOT NULL DEFAULT 0,
  eenheidsprijs_excl_abex numeric NOT NULL DEFAULT 0,
  eenheidsprijs_incl_abex numeric NOT NULL DEFAULT 0,
  subtotaal numeric NOT NULL DEFAULT 0,
  referentieprijs_baloise numeric,
  afwijking_percentage numeric,
  ai_oordeel public.ai_oordeel NOT NULL DEFAULT 'niet_beoordeeld',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- REFERENTIEPRIJZEN
CREATE TABLE public.referentieprijzen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie text,
  omschrijving text NOT NULL,
  eenheid text,
  basisprijs numeric NOT NULL DEFAULT 0,
  abex_basisindex integer,
  geldig_van date,
  bron_bestand text,
  verzekeraar text NOT NULL DEFAULT 'baloise',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ABEX_INDEX
CREATE TABLE public.abex_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode text NOT NULL,
  indexwaarde integer NOT NULL,
  ingangsdatum date NOT NULL,
  bron text,
  manueel_ingevoerd boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- AUDIT_LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid,
  actie text NOT NULL,
  uitgevoerd_door uuid,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  detail_json jsonb
);

-- KLANT_TOKENS
CREATE TABLE public.klant_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  gebruikt boolean NOT NULL DEFAULT false,
  ondertekend_op timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers for updated_at
CREATE TRIGGER trg_dossiers_updated
BEFORE UPDATE ON public.dossiers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schade_lijnen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referentieprijzen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abex_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.klant_tokens ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can read/write everything
CREATE POLICY "auth all dossiers" ON public.dossiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all schade_lijnen" ON public.schade_lijnen FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all referentieprijzen" ON public.referentieprijzen FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all abex_index" ON public.abex_index FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read audit_log" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth all klant_tokens" ON public.klant_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_schade_lijnen_dossier ON public.schade_lijnen(dossier_id);
CREATE INDEX idx_audit_dossier ON public.audit_log(dossier_id);
CREATE INDEX idx_klant_tokens_dossier ON public.klant_tokens(dossier_id);
CREATE INDEX idx_dossiers_status ON public.dossiers(status);
