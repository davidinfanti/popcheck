
-- Table for expert forensic rules
CREATE TABLE public.internal_forensic_manual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.internal_forensic_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read forensic manual" ON public.internal_forensic_manual
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert forensic manual" ON public.internal_forensic_manual
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update forensic manual" ON public.internal_forensic_manual
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete forensic manual" ON public.internal_forensic_manual
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for original reference images
CREATE TABLE public.original_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_number TEXT NOT NULL,
  box_part TEXT NOT NULL,
  note TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.original_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read original references" ON public.original_references
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert original references" ON public.original_references
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete original references" ON public.original_references
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for fake reference images
CREATE TABLE public.fake_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_number TEXT NOT NULL,
  box_part TEXT NOT NULL,
  note TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.fake_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fake references" ON public.fake_references
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert fake references" ON public.fake_references
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fake references" ON public.fake_references
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
