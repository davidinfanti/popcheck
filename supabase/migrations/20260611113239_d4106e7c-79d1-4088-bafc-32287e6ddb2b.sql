
-- ai_settings: explicit admin DELETE
CREATE POLICY "Admins can delete ai settings"
ON public.ai_settings FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- negative_references: admin UPDATE + DELETE
CREATE POLICY "Admins can update negative references"
ON public.negative_references FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete negative references"
ON public.negative_references FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- reference_pops: admin write policies
CREATE POLICY "Admins can insert reference pops"
ON public.reference_pops FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update reference pops"
ON public.reference_pops FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete reference pops"
ON public.reference_pops FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- pop_reference_library: admin write policies
CREATE POLICY "Admins can insert pop reference library"
ON public.pop_reference_library FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pop reference library"
ON public.pop_reference_library FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pop reference library"
ON public.pop_reference_library FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- expert_training: admin DELETE
CREATE POLICY "Admins can delete expert training"
ON public.expert_training FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
