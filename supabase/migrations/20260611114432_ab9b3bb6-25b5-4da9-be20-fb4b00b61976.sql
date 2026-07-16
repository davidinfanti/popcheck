CREATE SCHEMA IF NOT EXISTS app_private;

GRANT USAGE ON SCHEMA app_private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, app_private
AS $$
  SELECT COALESCE(_user_id = auth.uid(), false)
    AND app_private.has_role(_user_id, _role)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.get_shared_authentication(p_id uuid, p_token uuid)
RETURNS SETOF public.authentications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.authentications
  WHERE id = p_id
    AND share_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app_private.get_shared_authentication(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_shared_authentication(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_shared_authentication(p_id uuid, p_token uuid)
RETURNS SETOF public.authentications
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, app_private
AS $$
  SELECT * FROM app_private.get_shared_authentication(p_id, p_token);
$$;

REVOKE ALL ON FUNCTION public.get_shared_authentication(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_authentication(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Funko images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read reference images" ON storage.objects;

CREATE POLICY "Users can list their own funko images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'funko-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can list reference images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'reference-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);