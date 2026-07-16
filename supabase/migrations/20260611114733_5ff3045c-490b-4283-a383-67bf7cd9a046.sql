DROP POLICY IF EXISTS "Anyone can read negative_references" ON public.negative_references;
DROP POLICY IF EXISTS "Anyone can read fake references" ON public.fake_references;
DROP POLICY IF EXISTS "Anyone can read original references" ON public.original_references;
DROP POLICY IF EXISTS "Users can insert own flags" ON public.expert_training;

CREATE POLICY "Admins can read negative references"
ON public.negative_references
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can read fake references"
ON public.fake_references
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can read original references"
ON public.original_references
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can insert own report flags"
ON public.expert_training
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.authentications a
    WHERE a.id = expert_training.report_id
      AND a.user_id = auth.uid()
  )
);