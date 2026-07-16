-- Phase 1B.1: closed structured guidance and atomic assessment completion.
-- Additive to the approved Phase 1B migration. Existing runs/guidance remain unchanged.

CREATE TABLE public.structured_guidance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  guidance_type text NOT NULL CHECK (guidance_type IN (
    'inspection_priority', 'comparison_instruction', 'evidence_requirement',
    'known_limitation', 'release_specific_note'
  )),
  inspection_area text NOT NULL CHECK (inspection_area IN (
    'front_box', 'rear_box', 'left_side', 'right_side', 'top', 'bottom',
    'barcode', 'production_code', 'sticker', 'logo', 'typography',
    'character_image', 'packaging_geometry', 'copyright_footer'
  )),
  action text NOT NULL CHECK (action IN (
    'inspect', 'compare', 'request_additional_evidence',
    'reduce_assessability', 'mark_not_applicable'
  )),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  applicable_product_id uuid,
  applicable_variant_id uuid,
  applicable_release_range int4range CHECK (
    applicable_release_range IS NULL OR (
      NOT isempty(applicable_release_range)
      AND lower(applicable_release_range) >= 1900
      AND upper(applicable_release_range) <= 2101
    )
  ),
  reference_requirement text NOT NULL CHECK (
    reference_requirement IN ('verified', 'verified_or_legacy', 'none')
  ),
  structured_note text NOT NULL DEFAULT 'none' CHECK (structured_note IN (
    'none', 'glare_may_obscure_detail', 'compression_may_reduce_legibility',
    'angle_may_hide_edge', 'release_variants_may_differ',
    'reference_provenance_required', 'physical_detail_not_visible_in_image'
  )),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  previous_version_id uuid REFERENCES public.structured_guidance_versions(id),
  CHECK (action <> 'compare' OR reference_requirement <> 'none'),
  CHECK (
    (guidance_type = 'inspection_priority' AND action = 'inspect')
    OR (guidance_type = 'comparison_instruction' AND action = 'compare')
    OR (guidance_type = 'evidence_requirement' AND action = 'request_additional_evidence')
    OR (
      guidance_type = 'known_limitation'
      AND action IN ('reduce_assessability', 'mark_not_applicable')
      AND structured_note <> 'none'
    )
    OR (
      guidance_type = 'release_specific_note'
      AND action IN ('inspect', 'compare', 'mark_not_applicable')
      AND (
        applicable_product_id IS NOT NULL
        OR applicable_variant_id IS NOT NULL
        OR applicable_release_range IS NOT NULL
      )
    )
  )
);

ALTER TABLE public.structured_guidance_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read structured guidance history"
  ON public.structured_guidance_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON public.structured_guidance_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.structured_guidance_versions TO authenticated, service_role;

CREATE TRIGGER structured_guidance_versions_are_append_only
  BEFORE UPDATE OR DELETE ON public.structured_guidance_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

ALTER TABLE public.assessment_runs
  ADD COLUMN structured_guidance_version_id uuid
    REFERENCES public.structured_guidance_versions(id),
  ADD COLUMN completion_token uuid,
  ADD CONSTRAINT assessment_runs_one_guidance_lineage CHECK (
    NOT (guidance_version_id IS NOT NULL AND structured_guidance_version_id IS NOT NULL)
  );

CREATE UNIQUE INDEX assessment_runs_completion_token_unique
  ON public.assessment_runs (authentication_id, completion_token)
  WHERE completion_token IS NOT NULL;

-- The approved Phase 1B free-text table and lineage stay immutable for history,
-- but no authenticated client can append new executable free-text guidance.
REVOKE EXECUTE ON FUNCTION public.create_ai_guidance_version(text, text) FROM authenticated;

COMMENT ON TABLE public.ai_guidance_versions IS
  'Inactive legacy free-text guidance retained only for immutable Phase 1B history. Phase 1B.1 does not load it.';
COMMENT ON FUNCTION public.create_ai_guidance_version(text, text) IS
  'Inactive legacy function. Authenticated execution revoked by Phase 1B.1.';
COMMENT ON TABLE public.structured_guidance_versions IS
  'Append-only closed-schema inspection guidance. No executable admin prose is stored.';
COMMENT ON COLUMN public.assessment_runs.guidance_version_id IS
  'Legacy Phase 1B free-text guidance lineage; retained unchanged and inactive for new runs.';
COMMENT ON COLUMN public.assessment_runs.structured_guidance_version_id IS
  'Phase 1B.1 closed structured-guidance version that influenced inspection coverage.';
COMMENT ON COLUMN public.assessment_runs.completion_token IS
  'Backend idempotency token. Unique per submission when present.';

CREATE OR REPLACE FUNCTION public.create_structured_guidance_version(
  p_guidance_type text,
  p_inspection_area text,
  p_action text,
  p_priority text,
  p_applicable_product_id uuid,
  p_applicable_variant_id uuid,
  p_release_year_from integer,
  p_release_year_to integer,
  p_reference_requirement text,
  p_structured_note text
)
RETURNS public.structured_guidance_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prior public.structured_guidance_versions;
  created public.structured_guidance_versions;
  release_range int4range;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF (p_release_year_from IS NULL) <> (p_release_year_to IS NULL) THEN
    RAISE EXCEPTION 'release range requires both start and end years' USING ERRCODE = '22023';
  END IF;
  IF p_release_year_from IS NOT NULL THEN
    IF p_release_year_from < 1900 OR p_release_year_to > 2100 OR p_release_year_from > p_release_year_to THEN
      RAISE EXCEPTION 'release range is invalid' USING ERRCODE = '22023';
    END IF;
    release_range := int4range(p_release_year_from, p_release_year_to + 1, '[)');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.structured_guidance_versions'));

  SELECT * INTO prior
  FROM public.structured_guidance_versions
  ORDER BY version DESC
  LIMIT 1;

  BEGIN
    INSERT INTO public.structured_guidance_versions (
      version, guidance_type, inspection_area, action, priority,
      applicable_product_id, applicable_variant_id, applicable_release_range,
      reference_requirement, structured_note, created_by, previous_version_id
    ) VALUES (
      COALESCE(prior.version, 0) + 1,
      p_guidance_type, p_inspection_area, p_action, p_priority,
      p_applicable_product_id, p_applicable_variant_id, release_range,
      p_reference_requirement, p_structured_note, auth.uid(), prior.id
    )
    RETURNING * INTO created;
  EXCEPTION WHEN check_violation OR invalid_text_representation THEN
    RAISE EXCEPTION 'structured guidance does not match the closed contract'
      USING ERRCODE = '22023';
  END;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_structured_guidance_version(
  text, text, text, text, uuid, uuid, integer, integer, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_structured_guidance_version(
  text, text, text, text, uuid, uuid, integer, integer, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_phase_1b_assessment(
  p_authentication_id uuid,
  p_user_id uuid,
  p_expected_previous_run_id uuid,
  p_completion_token uuid,
  p_created_at timestamptz,
  p_model text,
  p_prompt_version text,
  p_decision_engine_version text,
  p_observation_schema_version text,
  p_source text,
  p_candidate_identity jsonb,
  p_structured_observations jsonb,
  p_dimensions jsonb,
  p_verdict jsonb,
  p_limitations jsonb,
  p_missing_evidence jsonb,
  p_structured_guidance_version_id uuid,
  p_legacy_unverified_references_used boolean,
  p_snapshot jsonb
)
RETURNS public.assessment_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.assessment_runs;
  current_previous_run_id uuid;
  inserted public.assessment_runs;
  snapshot_with_run_id jsonb;
BEGIN
  IF current_user <> 'service_role' OR COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_completion_token IS NULL THEN
    RAISE EXCEPTION 'completion token is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'snapshot must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_created_at IS NULL OR p_model = '' OR p_prompt_version = ''
     OR p_decision_engine_version = '' OR p_observation_schema_version = '' THEN
    RAISE EXCEPTION 'completion version metadata is required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.authentications authentication
  WHERE authentication.id = p_authentication_id
    AND authentication.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owned authentication not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing
  FROM public.assessment_runs run
  WHERE run.authentication_id = p_authentication_id
    AND run.completion_token = p_completion_token;
  IF FOUND THEN
    RETURN existing;
  END IF;

  SELECT run.id INTO current_previous_run_id
  FROM public.assessment_runs run
  WHERE run.authentication_id = p_authentication_id
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1;

  IF current_previous_run_id IS DISTINCT FROM p_expected_previous_run_id THEN
    RAISE EXCEPTION 'stale assessment completion; latest run changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.assessment_runs (
    authentication_id, run_kind, created_at, model, prompt_version,
    decision_engine_version, observation_schema_version, source,
    candidate_identity, structured_observations, dimensions, verdict,
    limitations, missing_evidence, structured_guidance_version_id,
    completion_token
  ) VALUES (
    p_authentication_id, 'phase_1b', p_created_at, p_model, p_prompt_version,
    p_decision_engine_version, p_observation_schema_version, p_source,
    p_candidate_identity, p_structured_observations, p_dimensions, p_verdict,
    p_limitations, p_missing_evidence, p_structured_guidance_version_id,
    p_completion_token
  )
  RETURNING * INTO inserted;

  snapshot_with_run_id := jsonb_set(
    p_snapshot,
    '{assessmentRunId}',
    to_jsonb(inserted.id),
    true
  );

  UPDATE public.authentications authentication
  SET
    pop_name = COALESCE(NULLIF(p_candidate_identity->>'popName', ''), authentication.pop_name),
    pop_number = COALESCE(NULLIF(p_candidate_identity->>'popNumber', ''), authentication.pop_number),
    details = snapshot_with_run_id,
    status = 'completed',
    analysis_model = p_model,
    analysis_config_version = p_prompt_version,
    analyzed_at = p_created_at,
    legacy_unverified_references_used = p_legacy_unverified_references_used,
    analysis_source = p_source,
    cached_from_id = NULL
  WHERE authentication.id = p_authentication_id
    AND authentication.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'compatibility snapshot update failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_phase_1b_assessment(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_phase_1b_assessment(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean, jsonb
) TO service_role;

COMMENT ON FUNCTION public.complete_phase_1b_assessment(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean, jsonb
) IS 'Service-role-only atomic insert of an immutable run plus compatibility snapshot update.';

CREATE OR REPLACE FUNCTION public.backfill_legacy_assessment_runs()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count bigint;
BEGIN
  INSERT INTO public.assessment_runs (
    authentication_id, run_kind, created_at, model, prompt_version,
    decision_engine_version, observation_schema_version, source,
    candidate_identity, structured_observations, dimensions, verdict,
    limitations, missing_evidence
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
      'title', 'Legacy V-STAMP score - uncalibrated historical data'
    ),
    jsonb_build_array(
      'This historical score is not a calibrated authenticity probability and is not used by the Phase 1B decision engine.'
    ),
    '[]'::jsonb
  FROM public.authentications authentication
  WHERE authentication.status = 'completed'
    AND authentication.score IS NOT NULL
  ON CONFLICT (authentication_id) WHERE run_kind = 'legacy' DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_legacy_assessment_runs() FROM PUBLIC, anon, authenticated, service_role;

-- Re-run safely to cover any eligible rows created between Phase 1B and Phase 1B.1.
SELECT public.backfill_legacy_assessment_runs();
