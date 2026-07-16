
-- 1. Add share_token to authentications (auto-generated UUID per row)
ALTER TABLE public.authentications
  ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS authentications_share_token_idx
  ON public.authentications(share_token);

-- 2. Drop the overly permissive anon SELECT policy
DROP POLICY IF EXISTS "Public can view authentications by id" ON public.authentications;

-- 3. Token-gated public read RPC (SECURITY DEFINER, returns ONE row only when token matches)
CREATE OR REPLACE FUNCTION public.get_shared_authentication(p_id uuid, p_token uuid)
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

REVOKE EXECUTE ON FUNCTION public.get_shared_authentication(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_authentication(uuid, uuid) TO anon, authenticated;

-- 4. Restrictive policies on user_roles to make deny-by-default explicit and resilient
CREATE POLICY "Block client INSERT on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Block client UPDATE on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client DELETE on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
