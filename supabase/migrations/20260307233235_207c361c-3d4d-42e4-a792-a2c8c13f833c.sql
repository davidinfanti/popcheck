-- Compatibility baseline repair.
-- The live-created table was absent from the migration chain. These columns and
-- nullability are reconstructed exactly from the generated Database types; no
-- unevidenced constraints, relationships, or extra columns are introduced.
CREATE TABLE IF NOT EXISTS public.pop_reference_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_notes text,
  expected_logos text,
  factory_codes text[],
  master_image_url text,
  name text,
  pop_number text,
  release_year integer
);

ALTER TABLE public.pop_reference_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read pop_reference_library" ON public.pop_reference_library FOR SELECT TO authenticated USING (true);
