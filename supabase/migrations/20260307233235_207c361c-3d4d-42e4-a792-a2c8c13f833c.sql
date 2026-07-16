ALTER TABLE public.pop_reference_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read pop_reference_library" ON public.pop_reference_library FOR SELECT TO authenticated USING (true);