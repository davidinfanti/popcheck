
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create authentications table (stores analysis results)
CREATE TABLE public.authentications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pop_name TEXT,
  pop_number TEXT,
  score INTEGER,
  details JSONB,
  image_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.authentications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own authentications" ON public.authentications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own authentications" ON public.authentications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own authentications" ON public.authentications FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_authentications_updated_at
  BEFORE UPDATE ON public.authentications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for funko images
INSERT INTO storage.buckets (id, name, public) VALUES ('funko-images', 'funko-images', true);

CREATE POLICY "Users can upload funko images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'funko-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Funko images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'funko-images');
CREATE POLICY "Users can delete their own funko images" ON storage.objects FOR DELETE USING (bucket_id = 'funko-images' AND auth.uid()::text = (storage.foldername(name))[1]);
