-- Create reference-images storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-images', 'reference-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to reference-images
CREATE POLICY "Authenticated users can upload reference images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reference-images');

-- Allow anyone to read reference images (public bucket)
CREATE POLICY "Anyone can read reference images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'reference-images');

-- Allow authenticated users to delete reference images
CREATE POLICY "Authenticated users can delete reference images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reference-images');
