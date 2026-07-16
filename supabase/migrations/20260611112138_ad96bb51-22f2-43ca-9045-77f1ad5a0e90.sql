
-- Add UPDATE policy for funko-images bucket
CREATE POLICY "Users can update their own funko images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'funko-images' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'funko-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Restrict ai_settings SELECT to admins
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid='public.ai_settings'::regclass AND polcmd='r' LOOP
    EXECUTE format('DROP POLICY %I ON public.ai_settings', r.polname);
  END LOOP;
END $$;

CREATE POLICY "Admins can read ai settings"
ON public.ai_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
