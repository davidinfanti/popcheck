DROP POLICY IF EXISTS "Users can insert their own authentications" ON public.authentications;
DROP POLICY IF EXISTS "Users can update their own authentications" ON public.authentications;
DROP POLICY IF EXISTS "Users can view their own authentications" ON public.authentications;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can upload funko images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own funko images" ON storage.objects;

CREATE POLICY "Users can insert their own authentications"
ON public.authentications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own authentications"
ON public.authentications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own authentications"
ON public.authentications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload funko images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'funko-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own funko images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'funko-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, app_private
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'has_role user_id must match current authenticated user';
  END IF;

  RETURN app_private.has_role(_user_id, _role);
END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;