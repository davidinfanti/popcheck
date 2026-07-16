-- Phase 1B: append-only assessment history and constrained, versioned observation guidance.
-- Additive only. Legacy authentication rows and scores are preserved unchanged.

CREATE TABLE public.ai_guidance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  category text NOT NULL CHECK (category IN (
    'evidence_quality', 'identity', 'reference', 'packaging', 'typography',
    'code', 'figure', 'sticker', 'listing'
  )),
  guidance text NOT NULL CHECK (char_length(guidance) BETWEEN 20 AND 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  previous_version_id uuid REFERENCES public.ai_guidance_versions(id)
);

CREATE TABLE public.assessment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authentication_id uuid NOT NULL REFERENCES public.authentications(id) ON DELETE RESTRICT,
  run_kind text NOT NULL DEFAULT 'phase_1b' CHECK (run_kind IN ('phase_1b', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL,
  prompt_version text NOT NULL,
  decision_engine_version text NOT NULL,
  observation_schema_version text NOT NULL,
  source text NOT NULL CHECK (source IN ('physical_scan', 'listing_legacy', 'legacy_unknown')),
  candidate_identity jsonb NOT NULL,
  structured_observations jsonb NOT NULL CHECK (jsonb_typeof(structured_observations) = 'array'),
  dimensions jsonb NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'),
  verdict jsonb NOT NULL CHECK (jsonb_typeof(verdict) = 'object'),
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),
  missing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_evidence) = 'array'),
  guidance_version_id uuid REFERENCES public.ai_guidance_versions(id)
);

CREATE INDEX assessment_runs_submission_created_idx
  ON public.assessment_runs (authentication_id, created_at DESC);

CREATE UNIQUE INDEX assessment_runs_one_legacy_per_submission
  ON public.assessment_runs (authentication_id)
  WHERE run_kind = 'legacy';

ALTER TABLE public.ai_guidance_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read AI guidance history"
  ON public.ai_guidance_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Owners can read assessment runs"
  ON public.assessment_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.authentications authentication
    WHERE authentication.id = assessment_runs.authentication_id
      AND authentication.user_id = auth.uid()
  ));

REVOKE ALL ON public.ai_guidance_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_guidance_versions TO authenticated;
GRANT SELECT ON public.ai_guidance_versions TO service_role;

REVOKE ALL ON public.assessment_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assessment_runs TO authenticated;
GRANT SELECT, INSERT ON public.assessment_runs TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is prohibited', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_append_only_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_append_only_mutation() TO service_role;

CREATE TRIGGER assessment_runs_are_append_only
  BEFORE UPDATE OR DELETE ON public.assessment_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

CREATE TRIGGER ai_guidance_versions_are_append_only
  BEFORE UPDATE OR DELETE ON public.ai_guidance_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION public.create_ai_guidance_version(
  p_category text,
  p_guidance text
)
RETURNS public.ai_guidance_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prior public.ai_guidance_versions;
  created public.ai_guidance_versions;
  normalized text := btrim(p_guidance);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_category NOT IN (
    'evidence_quality', 'identity', 'reference', 'packaging', 'typography',
    'code', 'figure', 'sticker', 'listing'
  ) THEN
    RAISE EXCEPTION 'unsupported guidance category' USING ERRCODE = '22023';
  END IF;

  IF char_length(normalized) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'guidance must contain between 20 and 2000 characters' USING ERRCODE = '22023';
  END IF;

  IF normalized ~* '(score|percentage|probability|verdict|authentic|certificat|fabricat|invent|bypass|ignore[^.]{0,40}(schema|instruction)|disable[^.]{0,40}uncertaint)' THEN
    RAISE EXCEPTION 'guidance may describe observations only; decision, scoring, certification, fabrication, and bypass instructions are prohibited'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.ai_guidance_versions'));

  SELECT * INTO prior
  FROM public.ai_guidance_versions
  ORDER BY version DESC
  LIMIT 1;

  INSERT INTO public.ai_guidance_versions (
    version, category, guidance, created_by, previous_version_id
  ) VALUES (
    COALESCE(prior.version, 0) + 1,
    p_category,
    normalized,
    auth.uid(),
    prior.id
  )
  RETURNING * INTO created;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_guidance_version(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ai_guidance_version(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_assessment_runs(
  p_id uuid,
  p_token uuid
)
RETURNS SETOF public.assessment_runs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT run.*
  FROM public.assessment_runs run
  WHERE run.authentication_id = p_id
    AND EXISTS (
      SELECT 1
      FROM public.authentications authentication
      WHERE authentication.id = p_id
        AND authentication.share_token = p_token
    )
  ORDER BY run.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_shared_assessment_runs(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_assessment_runs(uuid, uuid) TO anon, authenticated;

-- Preserve every existing completed score as explicitly uncalibrated legacy data.
-- The source authentication row is not changed.
INSERT INTO public.assessment_runs (
  authentication_id,
  run_kind,
  created_at,
  model,
  prompt_version,
  decision_engine_version,
  observation_schema_version,
  source,
  candidate_identity,
  structured_observations,
  dimensions,
  verdict,
  limitations,
  missing_evidence
)
SELECT
  authentication.id,
  'legacy',
  COALESCE(authentication.analyzed_at, authentication.created_at),
  COALESCE(authentication.analysis_model, 'legacy-model-unknown'),
  COALESCE(authentication.analysis_config_version, 'legacy-prompt-unknown'),
  'legacy-vstamp-score',
  'legacy-vstamp-details',
  COALESCE(authentication.analysis_source, 'legacy_unknown'),
  jsonb_build_object(
    'popName', authentication.pop_name,
    'popNumber', authentication.pop_number,
    'series', authentication.details->>'seriesLine',
    'barcode', NULL,
    'productionCode', NULL,
    'factory', authentication.details->>'factoryCode',
    'releaseYear', NULL,
    'sticker', NULL,
    'region', NULL,
    'copyrightStamp', NULL
  ),
  '[]'::jsonb,
  jsonb_build_object('legacy', true),
  jsonb_build_object(
    'class', 'legacy_vstamp_score',
    'legacyScore', authentication.score,
    'title', 'Legacy V-STAMP score — uncalibrated historical data'
  ),
  jsonb_build_array(
    'This historical score is not a calibrated authenticity probability and is not used by the Phase 1B decision engine.'
  ),
  '[]'::jsonb
FROM public.authentications authentication
WHERE authentication.status = 'completed'
  AND authentication.score IS NOT NULL
ON CONFLICT (authentication_id) WHERE run_kind = 'legacy' DO NOTHING;

COMMENT ON TABLE public.assessment_runs IS
  'Append-only assessment history. Phase 1B runs contain validated observations, deterministic dimensions, and a versioned verdict.';
COMMENT ON COLUMN public.authentications.score IS
  'Deprecated legacy V-STAMP score. Phase 1B never writes or interprets this value as an authenticity probability.';
COMMENT ON COLUMN public.authentications.details IS
  'Compatibility snapshot of the latest backend result. Authoritative Phase 1B history is append-only in assessment_runs.';
COMMENT ON TABLE public.ai_settings IS
  'Legacy mutable AI settings. system_instructions_override is ignored by Phase 1B; use versioned ai_guidance_versions.';
COMMENT ON TABLE public.ai_guidance_versions IS
  'Append-only constrained observation guidance. It cannot configure output schema, decision rules, scores, or verdict classes.';
