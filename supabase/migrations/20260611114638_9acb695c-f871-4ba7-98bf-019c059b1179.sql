DROP POLICY IF EXISTS "Public can read negative references" ON public.negative_references;
DROP POLICY IF EXISTS "Public can read fake references" ON public.fake_references;
DROP POLICY IF EXISTS "Public can read original references" ON public.original_references;

REVOKE SELECT ON public.negative_references FROM anon;
REVOKE SELECT ON public.fake_references FROM anon;
REVOKE SELECT ON public.original_references FROM anon;