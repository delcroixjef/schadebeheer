
-- Storage bucket for bestek uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('bestekken', 'bestekken', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read bestekken" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bestekken');
CREATE POLICY "auth upload bestekken" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bestekken');
CREATE POLICY "auth update bestekken" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bestekken');
CREATE POLICY "auth delete bestekken" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bestekken');

-- Add columns to track bestek analysis on dossiers
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS bestek_storage_path text,
  ADD COLUMN IF NOT EXISTS bestek_filename text,
  ADD COLUMN IF NOT EXISTS bestek_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_score integer,
  ADD COLUMN IF NOT EXISTS ai_aanbeveling text,
  ADD COLUMN IF NOT EXISTS ai_verdacht_label text,
  ADD COLUMN IF NOT EXISTS ai_analyse_op timestamptz;
