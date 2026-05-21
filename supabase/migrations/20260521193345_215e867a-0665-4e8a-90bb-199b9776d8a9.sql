
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS ondertekend_pdf_path text,
  ADD COLUMN IF NOT EXISTS ondertekend_op timestamptz,
  ADD COLUMN IF NOT EXISTS bezwaar_tekst text,
  ADD COLUMN IF NOT EXISTS bezwaar_op timestamptz;

ALTER TABLE public.klant_tokens
  ADD COLUMN IF NOT EXISTS handtekening_data text,
  ADD COLUMN IF NOT EXISTS bezwaar_tekst text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ondertekende-documenten', 'ondertekende-documenten', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read ondertekende-documenten"
ON storage.objects FOR SELECT
USING (bucket_id = 'ondertekende-documenten');

CREATE POLICY "Anon upload ondertekende-documenten"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ondertekende-documenten');
