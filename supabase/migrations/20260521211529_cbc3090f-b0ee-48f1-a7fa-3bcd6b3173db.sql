CREATE POLICY "anon read bestekken" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'bestekken');
CREATE POLICY "anon upload bestekken" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'bestekken');
CREATE POLICY "anon update bestekken" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'bestekken') WITH CHECK (bucket_id = 'bestekken');
CREATE POLICY "anon delete bestekken" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'bestekken');