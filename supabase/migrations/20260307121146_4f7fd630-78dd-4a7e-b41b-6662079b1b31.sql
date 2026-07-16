
CREATE TABLE public.reference_pops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  number TEXT,
  category TEXT,
  production_code_prefix TEXT,
  official_image_url TEXT,
  barcode_data TEXT,
  key_details JSONB,
  is_vaulted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reference_pops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reference_pops"
  ON public.reference_pops
  FOR SELECT
  TO authenticated
  USING (true);
