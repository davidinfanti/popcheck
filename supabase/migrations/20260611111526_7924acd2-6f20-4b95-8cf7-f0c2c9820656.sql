ALTER TABLE public.authentications
  ADD COLUMN IF NOT EXISTS cache_key text,
  ADD COLUMN IF NOT EXISTS cached_from_id uuid REFERENCES public.authentications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS authentications_cache_key_idx
  ON public.authentications (cache_key)
  WHERE cache_key IS NOT NULL AND status = 'completed';