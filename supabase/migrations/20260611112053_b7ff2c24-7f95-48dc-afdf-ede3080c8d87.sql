
-- 1. Restrict internal_forensic_manual SELECT to admins
DROP POLICY IF EXISTS "Anyone can read forensic manual" ON public.internal_forensic_manual;
CREATE POLICY "Admins can read forensic manual"
ON public.internal_forensic_manual
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Restrict reference-images storage bucket writes to admins
DROP POLICY IF EXISTS "Authenticated users can upload reference images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete reference images" ON storage.objects;

CREATE POLICY "Admins can upload reference images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete reference images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'reference-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update reference images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'reference-images' AND has_role(auth.uid(), 'admin'::app_role));

-- 3. Revoke EXECUTE from public/anon/authenticated on internal trigger functions
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Revoke anon EXECUTE on has_role (used in RLS by authenticated only)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
