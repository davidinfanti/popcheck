-- Allow admins to update fake_references (for Expert Delta)
CREATE POLICY "Admins can update fake references"
ON public.fake_references FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update original_references (for Expert Delta)
CREATE POLICY "Admins can update original references"
ON public.original_references FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
