GRANT SELECT ON public.reference_pops TO anon;
GRANT SELECT ON public.negative_references TO anon;
GRANT SELECT ON public.original_references TO anon;
GRANT SELECT ON public.fake_references TO anon;
GRANT SELECT ON public.pop_reference_library TO anon;

CREATE POLICY "Public can read reference pops"
ON public.reference_pops
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public can read negative references"
ON public.negative_references
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public can read original references"
ON public.original_references
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public can read fake references"
ON public.fake_references
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public can read pop reference library"
ON public.pop_reference_library
FOR SELECT
TO anon
USING (true);