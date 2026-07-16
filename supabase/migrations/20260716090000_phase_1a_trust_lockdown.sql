-- Phase 1A: protect assessment output and add minimum auditability.
-- Additive and backward-compatible: existing rows remain unchanged and no data is deleted.

ALTER TABLE public.authentications
  ADD COLUMN IF NOT EXISTS analysis_model text,
  ADD COLUMN IF NOT EXISTS analysis_config_version text,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_unverified_references_used boolean,
  ADD COLUMN IF NOT EXISTS analysis_source text;

ALTER TABLE public.authentications
  DROP CONSTRAINT IF EXISTS authentications_analysis_source_check;

ALTER TABLE public.authentications
  ADD CONSTRAINT authentications_analysis_source_check
  CHECK (analysis_source IS NULL OR analysis_source IN ('physical_scan', 'listing_legacy'));

CREATE OR REPLACE FUNCTION public.guard_authentication_assessment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_role text := COALESCE(auth.role(), current_user);
BEGIN
  IF request_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'analyzing')
      OR NEW.score IS NOT NULL
      OR NEW.details IS NOT NULL
      OR NEW.pop_name IS NOT NULL
      OR NEW.pop_number IS NOT NULL
      OR NEW.cache_key IS NOT NULL
      OR NEW.cached_from_id IS NOT NULL
      OR NEW.analysis_model IS NOT NULL
      OR NEW.analysis_config_version IS NOT NULL
      OR NEW.analyzed_at IS NOT NULL
      OR NEW.legacy_unverified_references_used IS NOT NULL
      OR NEW.analysis_source IS NOT NULL
    THEN
      RAISE EXCEPTION 'assessment-controlled fields may only be written by the analysis backend'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.score IS DISTINCT FROM OLD.score
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.details IS DISTINCT FROM OLD.details
      OR NEW.pop_name IS DISTINCT FROM OLD.pop_name
      OR NEW.pop_number IS DISTINCT FROM OLD.pop_number
      OR NEW.cache_key IS DISTINCT FROM OLD.cache_key
      OR NEW.cached_from_id IS DISTINCT FROM OLD.cached_from_id
      OR NEW.analysis_model IS DISTINCT FROM OLD.analysis_model
      OR NEW.analysis_config_version IS DISTINCT FROM OLD.analysis_config_version
      OR NEW.analyzed_at IS DISTINCT FROM OLD.analyzed_at
      OR NEW.legacy_unverified_references_used IS DISTINCT FROM OLD.legacy_unverified_references_used
      OR NEW.analysis_source IS DISTINCT FROM OLD.analysis_source
      OR NEW.image_urls IS DISTINCT FROM OLD.image_urls
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'assessment-controlled fields may only be written by the analysis backend'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_authentication_assessment_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_authentication_assessment_fields() TO service_role;

DROP TRIGGER IF EXISTS guard_authentication_assessment_fields
  ON public.authentications;

CREATE TRIGGER guard_authentication_assessment_fields
  BEFORE INSERT OR UPDATE ON public.authentications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_authentication_assessment_fields();

-- The current browser has no legitimate authentication-row UPDATE use case.
-- RLS remains in place for defense in depth if UPDATE is deliberately re-granted later.
GRANT SELECT, INSERT, DELETE ON public.authentications TO authenticated;
REVOKE UPDATE ON public.authentications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.authentications TO service_role;

COMMENT ON COLUMN public.authentications.cache_key IS
  'Deprecated Phase 1A compatibility column. Must not influence analysis or results.';
COMMENT ON COLUMN public.authentications.cached_from_id IS
  'Deprecated Phase 1A compatibility column. Verdict reuse is prohibited.';
COMMENT ON COLUMN public.authentications.analysis_model IS
  'Exact model identifier used for the completed analysis.';
COMMENT ON COLUMN public.authentications.analysis_config_version IS
  'Version of the prompt/configuration used for the completed analysis.';
COMMENT ON COLUMN public.authentications.legacy_unverified_references_used IS
  'True when pre-provenance admin reference data was included in analysis context.';
COMMENT ON COLUMN public.authentications.analysis_source IS
  'physical_scan for owned Mode A storage evidence; listing_legacy for isolated Mode B listing evidence.';
