CREATE POLICY "Users can delete their own authentications"
ON public.authentications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);