
-- Insurers
CREATE TABLE public.insurers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color_token TEXT NOT NULL DEFAULT 'blue',
  max_authority_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ABEX index
CREATE TABLE public.abex_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dossiers
CREATE TABLE public.dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_type TEXT,
  damage_type TEXT NOT NULL,
  damage_date DATE NOT NULL,
  insurer_id UUID REFERENCES public.insurers(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_behandeling',
  status_label TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings (single-row k/v)
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abex_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users (welzeker.be SSO tenant) have full access
CREATE POLICY "auth read insurers" ON public.insurers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write insurers" ON public.insurers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read abex" ON public.abex_index FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write abex" ON public.abex_index FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read dossiers" ON public.dossiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write dossiers" ON public.dossiers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read audit" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dossiers_touch BEFORE UPDATE ON public.dossiers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
