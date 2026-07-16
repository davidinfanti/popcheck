
-- Allow anonymous (unauthenticated) users to view any authentication report by ID
CREATE POLICY "Public can view authentications by id"
ON public.authentications
FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to read pop_reference_library
CREATE POLICY "Anon can read pop_reference_library"
ON public.pop_reference_library
FOR SELECT
TO anon
USING (true);
