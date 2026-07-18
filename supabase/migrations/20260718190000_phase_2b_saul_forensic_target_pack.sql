-- Phase 2B: additive, private forensic-target curation infrastructure.
-- No legacy reference is copied, activated, or reclassified by this migration.

CREATE TABLE public.forensic_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  pop_number text NOT NULL,
  franchise text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id),
  validation_date date,
  UNIQUE (canonical_name, pop_number, franchise, version)
);

CREATE TABLE public.forensic_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.forensic_products(id) ON DELETE RESTRICT,
  release_label text,
  region text,
  sticker_variant text,
  legitimate_barcodes text[] NOT NULL DEFAULT '{}',
  production_factory_variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  release_year_from integer CHECK (release_year_from IS NULL OR release_year_from BETWEEN 1980 AND 2100),
  release_year_to integer CHECK (release_year_to IS NULL OR release_year_to BETWEEN 1980 AND 2100),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id),
  validation_date date,
  CHECK (release_year_to IS NULL OR release_year_from IS NULL OR release_year_to >= release_year_from)
);

CREATE TABLE public.forensic_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.forensic_products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.forensic_product_variants(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN ('original', 'counterfeit', 'general')),
  inspection_category text NOT NULL CHECK (inspection_category IN ('packaging', 'typography', 'code', 'figure', 'sticker', 'identity', 'reference')),
  image_view text NOT NULL CHECK (image_view IN ('front', 'rear', 'left', 'right', 'top', 'bottom', 'macro')),
  visible_region text NOT NULL,
  factual_observation text NOT NULL,
  severity text NOT NULL DEFAULT 'informational' CHECK (severity IN ('informational', 'low', 'medium', 'high', 'critical')),
  provenance_type text NOT NULL,
  provenance_description text NOT NULL,
  source_owner text NOT NULL,
  capture_date date,
  validator_identity text,
  validation_date date,
  reliability_tier text NOT NULL DEFAULT 'limited' CHECK (reliability_tier IN ('limited', 'verified')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'retired')),
  file_hash text CHECK (file_hash IS NULL OR file_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.counterfeit_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forensic_rule_id uuid REFERENCES public.forensic_rules(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.forensic_products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.forensic_product_variants(id) ON DELETE RESTRICT,
  classification text NOT NULL DEFAULT 'counterfeit' CHECK (classification = 'counterfeit'),
  image_view text NOT NULL CHECK (image_view IN ('front', 'rear', 'left', 'right', 'top', 'bottom', 'macro')),
  visible_region text NOT NULL,
  factual_observation text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  provenance_type text NOT NULL,
  provenance_description text NOT NULL,
  source_owner text NOT NULL,
  capture_date date,
  validator_identity text,
  validation_date date,
  reliability_tier text NOT NULL DEFAULT 'limited' CHECK (reliability_tier IN ('limited', 'verified')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'retired')),
  file_hash text CHECK (file_hash IS NULL OR file_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.verified_reference_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.forensic_products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.forensic_product_variants(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN ('original', 'counterfeit')),
  image_view text NOT NULL CHECK (image_view IN ('front', 'rear', 'left', 'right', 'top', 'bottom', 'macro')),
  visible_region text NOT NULL,
  factual_observation text NOT NULL,
  severity text NOT NULL DEFAULT 'informational' CHECK (severity IN ('informational', 'low', 'medium', 'high', 'critical')),
  provenance_type text NOT NULL,
  provenance_description text NOT NULL,
  source_owner text NOT NULL,
  capture_date date,
  validator_identity text,
  validation_date date,
  reliability_tier text NOT NULL DEFAULT 'limited' CHECK (reliability_tier IN ('limited', 'verified')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'retired')),
  storage_bucket text NOT NULL DEFAULT 'forensic-reference-files' CHECK (storage_bucket = 'forensic-reference-files'),
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^v1/[0-9a-f-]+/[0-9a-f-]+$'),
  file_hash text CHECK (file_hash IS NULL OR file_hash ~ '^[a-f0-9]{64}$'),
  file_mime_type text CHECK (file_mime_type IS NULL OR file_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.known_counterfeit_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.forensic_products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.forensic_product_variants(id) ON DELETE RESTRICT,
  reference_image_id uuid NOT NULL UNIQUE REFERENCES public.verified_reference_images(id) ON DELETE RESTRICT,
  classification text NOT NULL DEFAULT 'counterfeit' CHECK (classification = 'counterfeit'),
  image_view text NOT NULL CHECK (image_view IN ('front', 'rear', 'left', 'right', 'top', 'bottom', 'macro')),
  visible_region text NOT NULL,
  factual_observation text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  provenance_type text NOT NULL,
  provenance_description text NOT NULL,
  source_owner text NOT NULL,
  capture_date date,
  validator_identity text NOT NULL,
  validation_date date NOT NULL,
  reliability_tier text NOT NULL CHECK (reliability_tier IN ('limited', 'verified')),
  status text NOT NULL CHECK (status IN ('verified', 'retired')),
  file_hash text NOT NULL CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  validated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX forensic_product_variants_product_idx ON public.forensic_product_variants(product_id, status);
CREATE INDEX forensic_reference_images_eligible_idx ON public.verified_reference_images(product_id, variant_id, image_view, status);
CREATE INDEX forensic_rules_eligible_idx ON public.forensic_rules(product_id, variant_id, image_view, status);
CREATE INDEX counterfeit_indicators_eligible_idx ON public.counterfeit_indicators(product_id, variant_id, image_view, status);

CREATE OR REPLACE FUNCTION public.forensic_knowledge_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.forensic_knowledge_touch_version()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_forensic_knowledge_record()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'verified' THEN
    IF NULLIF(btrim(NEW.provenance_type), '') IS NULL
      OR NULLIF(btrim(NEW.provenance_description), '') IS NULL
      OR NULLIF(btrim(NEW.source_owner), '') IS NULL
      OR NULLIF(btrim(NEW.validator_identity), '') IS NULL
      OR NEW.validation_date IS NULL
      OR NEW.validated_by IS NULL
    THEN RAISE EXCEPTION 'verified forensic knowledge requires provenance and a named validator' USING ERRCODE = '23514'; END IF;
    IF NEW.reliability_tier <> 'verified' THEN RAISE EXCEPTION 'verified status requires verified reliability tier' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_forensic_reference_image()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'verified' THEN
    IF NULLIF(btrim(NEW.provenance_type), '') IS NULL
      OR NULLIF(btrim(NEW.provenance_description), '') IS NULL
      OR NULLIF(btrim(NEW.source_owner), '') IS NULL
      OR NULLIF(btrim(NEW.validator_identity), '') IS NULL
      OR NEW.validation_date IS NULL
      OR NEW.validated_by IS NULL
      OR NEW.reliability_tier <> 'verified'
      OR NEW.file_hash IS NULL OR NEW.file_mime_type IS NULL OR NEW.file_size_bytes IS NULL
    THEN RAISE EXCEPTION 'verified reference images require provenance, validator, verified reliability, and a validated private file' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_known_counterfeit_example()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.classification = 'counterfeit' AND NEW.status = 'verified' THEN
    INSERT INTO public.known_counterfeit_examples (
      product_id, variant_id, reference_image_id, image_view, visible_region, factual_observation, severity,
      provenance_type, provenance_description, source_owner, capture_date, validator_identity, validation_date,
      reliability_tier, status, file_hash, created_by, validated_by
    ) VALUES (
      NEW.product_id, NEW.variant_id, NEW.id, NEW.image_view, NEW.visible_region, NEW.factual_observation,
      CASE WHEN NEW.severity = 'informational' THEN 'low' ELSE NEW.severity END,
      NEW.provenance_type, NEW.provenance_description, NEW.source_owner, NEW.capture_date, NEW.validator_identity,
      NEW.validation_date, NEW.reliability_tier, 'verified', NEW.file_hash, NEW.created_by, NEW.validated_by
    ) ON CONFLICT (reference_image_id) DO UPDATE SET
      product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id, image_view = EXCLUDED.image_view,
      visible_region = EXCLUDED.visible_region, factual_observation = EXCLUDED.factual_observation,
      severity = EXCLUDED.severity, provenance_type = EXCLUDED.provenance_type,
      provenance_description = EXCLUDED.provenance_description, source_owner = EXCLUDED.source_owner,
      capture_date = EXCLUDED.capture_date, validator_identity = EXCLUDED.validator_identity,
      validation_date = EXCLUDED.validation_date, reliability_tier = EXCLUDED.reliability_tier,
      status = 'verified', file_hash = EXCLUDED.file_hash, validated_by = EXCLUDED.validated_by,
      updated_at = now(), version = public.known_counterfeit_examples.version + 1;
  ELSIF OLD.classification = 'counterfeit' THEN
    UPDATE public.known_counterfeit_examples SET status = 'retired', updated_at = now(), version = version + 1
      WHERE reference_image_id = NEW.id AND status <> 'retired';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_known_counterfeit_example()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE reference_row public.verified_reference_images;
BEGIN
  SELECT * INTO reference_row FROM public.verified_reference_images WHERE id = NEW.reference_image_id;
  IF NOT FOUND OR reference_row.classification <> 'counterfeit'
    OR reference_row.product_id <> NEW.product_id OR reference_row.variant_id <> NEW.variant_id
  THEN RAISE EXCEPTION 'known counterfeit examples must reference the matching counterfeit image' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forensic_products_touch BEFORE UPDATE ON public.forensic_products FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER forensic_variants_touch BEFORE UPDATE ON public.forensic_product_variants FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER forensic_rules_touch BEFORE UPDATE ON public.forensic_rules FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER counterfeit_indicators_touch BEFORE UPDATE ON public.counterfeit_indicators FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER forensic_reference_images_touch BEFORE UPDATE ON public.verified_reference_images FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER known_counterfeit_examples_touch BEFORE UPDATE ON public.known_counterfeit_examples FOR EACH ROW EXECUTE FUNCTION public.forensic_knowledge_touch_version();
CREATE TRIGGER forensic_rules_validate BEFORE INSERT OR UPDATE ON public.forensic_rules FOR EACH ROW EXECUTE FUNCTION public.validate_forensic_knowledge_record();
CREATE TRIGGER counterfeit_indicators_validate BEFORE INSERT OR UPDATE ON public.counterfeit_indicators FOR EACH ROW EXECUTE FUNCTION public.validate_forensic_knowledge_record();
CREATE TRIGGER forensic_reference_images_validate BEFORE INSERT OR UPDATE ON public.verified_reference_images FOR EACH ROW EXECUTE FUNCTION public.validate_forensic_reference_image();
CREATE TRIGGER known_counterfeit_examples_validate BEFORE INSERT OR UPDATE ON public.known_counterfeit_examples FOR EACH ROW EXECUTE FUNCTION public.validate_known_counterfeit_example();
CREATE TRIGGER forensic_reference_images_sync_counterfeit AFTER INSERT OR UPDATE ON public.verified_reference_images FOR EACH ROW EXECUTE FUNCTION public.sync_known_counterfeit_example();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('forensic-reference-files', 'forensic-reference-files', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE POLICY "Admins can upload private forensic references" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'forensic-reference-files' AND public.has_role(auth.uid(), 'admin'::public.app_role) AND (storage.foldername(name))[1] = 'v1');
CREATE POLICY "Admins can update private forensic references" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'forensic-reference-files' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'forensic-reference-files' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can read private forensic reference metadata" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'forensic-reference-files' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.create_forensic_reference_draft(
  p_product_id uuid, p_variant_id uuid, p_classification text, p_image_view text, p_visible_region text,
  p_factual_observation text, p_severity text, p_provenance_type text, p_provenance_description text,
  p_source_owner text, p_capture_date date, p_reliability_tier text
) RETURNS public.verified_reference_images
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE reference_row public.verified_reference_images;
BEGIN
  PERFORM public.forensic_knowledge_require_admin();
  INSERT INTO public.verified_reference_images (
    product_id, variant_id, classification, image_view, visible_region, factual_observation, severity,
    provenance_type, provenance_description, source_owner, capture_date, reliability_tier, storage_path, created_by
  ) VALUES (
    p_product_id, p_variant_id, p_classification, p_image_view, p_visible_region, p_factual_observation, p_severity,
    p_provenance_type, p_provenance_description, p_source_owner, p_capture_date, p_reliability_tier,
    'v1/' || p_variant_id::text || '/' || gen_random_uuid()::text, auth.uid()
  ) RETURNING * INTO reference_row;
  RETURN reference_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_forensic_reference_upload(p_reference_id uuid, p_file_hash text)
RETURNS public.verified_reference_images
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage, pg_temp AS $$
DECLARE reference_row public.verified_reference_images; object_metadata jsonb; actual_mime text; actual_size bigint;
BEGIN
  PERFORM public.forensic_knowledge_require_admin();
  SELECT * INTO reference_row FROM public.verified_reference_images WHERE id = p_reference_id FOR UPDATE;
  IF NOT FOUND OR reference_row.status <> 'draft' THEN RAISE EXCEPTION 'only draft references may receive an upload' USING ERRCODE = '23514'; END IF;
  IF p_file_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'file hash must be a SHA-256 hex digest' USING ERRCODE = '23514'; END IF;
  SELECT metadata INTO object_metadata FROM storage.objects WHERE bucket_id = reference_row.storage_bucket AND name = reference_row.storage_path;
  IF object_metadata IS NULL THEN RAISE EXCEPTION 'private reference object was not found' USING ERRCODE = '23514'; END IF;
  actual_mime := COALESCE(object_metadata->>'mimetype', object_metadata->>'contentType');
  IF actual_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE EXCEPTION 'reference MIME type is not allowed' USING ERRCODE = '23514'; END IF;
  actual_size := NULLIF(object_metadata->>'size', '')::bigint;
  IF actual_size IS NULL OR actual_size < 1 OR actual_size > 10485760 THEN RAISE EXCEPTION 'reference file size is invalid' USING ERRCODE = '23514'; END IF;
  UPDATE public.verified_reference_images SET file_hash = lower(p_file_hash), file_mime_type = actual_mime, file_size_bytes = actual_size
    WHERE id = p_reference_id RETURNING * INTO reference_row;
  RETURN reference_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_forensic_reference_status(
  p_reference_id uuid, p_status text, p_validator_identity text DEFAULT NULL, p_validation_date date DEFAULT NULL
) RETURNS public.verified_reference_images
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE reference_row public.verified_reference_images;
BEGIN
  PERFORM public.forensic_knowledge_require_admin();
  IF p_status NOT IN ('draft', 'verified', 'retired') THEN RAISE EXCEPTION 'unsupported forensic reference status' USING ERRCODE = '23514'; END IF;
  IF p_status = 'draft' THEN RAISE EXCEPTION 'references cannot be returned to draft after curation begins' USING ERRCODE = '23514'; END IF;
  UPDATE public.verified_reference_images SET
    status = p_status,
    validator_identity = CASE WHEN p_status = 'verified' THEN NULLIF(btrim(p_validator_identity), '') ELSE validator_identity END,
    validation_date = CASE WHEN p_status = 'verified' THEN COALESCE(p_validation_date, current_date) ELSE validation_date END,
    validated_by = CASE WHEN p_status = 'verified' THEN auth.uid() ELSE validated_by END
  WHERE id = p_reference_id RETURNING * INTO reference_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'forensic reference was not found' USING ERRCODE = 'P0002'; END IF;
  RETURN reference_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.forensic_reference_is_eligible(
  p_reference public.verified_reference_images, p_variant_id uuid, p_image_view text, p_visible_region text
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT p_reference.status = 'verified'
    AND p_reference.variant_id = p_variant_id
    AND p_reference.reliability_tier = 'verified'
    AND p_reference.provenance_type <> ''
    AND p_reference.provenance_description <> ''
    AND p_reference.source_owner <> ''
    AND p_reference.validator_identity IS NOT NULL
    AND p_reference.validation_date IS NOT NULL
    AND p_reference.file_hash IS NOT NULL
    AND p_reference.image_view = p_image_view
    AND (p_visible_region = '' OR p_reference.visible_region = p_visible_region);
$$;

ALTER TABLE public.forensic_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counterfeit_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_counterfeit_examples ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['forensic_products', 'forensic_product_variants', 'forensic_rules', 'counterfeit_indicators', 'verified_reference_images', 'known_counterfeit_examples'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', table_name);
    EXECUTE format('CREATE POLICY "Admins curate %s" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))', table_name, table_name);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.forensic_knowledge_require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_forensic_reference_draft(uuid, uuid, text, text, text, text, text, text, text, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_forensic_reference_upload(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_forensic_reference_status(uuid, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forensic_reference_is_eligible(public.verified_reference_images, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_forensic_reference_draft(uuid, uuid, text, text, text, text, text, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_forensic_reference_upload(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_forensic_reference_status(uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forensic_reference_is_eligible(public.verified_reference_images, uuid, text, text) TO service_role;

COMMENT ON TABLE public.verified_reference_images IS 'Private Phase 2B reference files. Draft/retired or variant-mismatched references are never analysis-eligible; no public image URL is stored.';
COMMENT ON TABLE public.known_counterfeit_examples IS 'Derived only from a validated counterfeit reference image; never from an original reference.';
