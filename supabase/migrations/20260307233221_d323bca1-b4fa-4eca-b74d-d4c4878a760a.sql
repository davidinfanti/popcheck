
-- 1. App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. RLS on user_roles: admins can read all, users can read own
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. Expert training table (user flagged reports)
CREATE TABLE public.expert_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.authentications(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_comment TEXT,
  detected_fake_trait TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expert_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own flags" ON public.expert_training
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own flags" ON public.expert_training
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all flags" ON public.expert_training
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update flags" ON public.expert_training
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. AI settings table (global system instructions)
CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ai_settings" ON public.ai_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update ai_settings" ON public.ai_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ai_settings" ON public.ai_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Insert default system instructions
INSERT INTO public.ai_settings (key, value) VALUES (
  'system_instructions_override',
  ''
);

-- 8. Negative reference library for validated fakes
CREATE TABLE public.negative_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.authentications(id),
  training_id UUID REFERENCES public.expert_training(id),
  fake_trait TEXT NOT NULL,
  description TEXT,
  image_urls TEXT[],
  pop_name TEXT,
  pop_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.negative_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read negative_references" ON public.negative_references
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert negative_references" ON public.negative_references
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. Admin can view ALL authentications
CREATE POLICY "Admins can view all authentications" ON public.authentications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
