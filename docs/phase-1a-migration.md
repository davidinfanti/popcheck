# Phase 1A migration safety

Migration: `20260716090000_phase_1a_trust_lockdown.sql`.

## Effect on existing rows

- Adds five nullable audit columns to `public.authentications`. Existing rows receive `NULL`; they are not relabelled or backfilled.
- Adds a check constraint permitting only `physical_scan`, `listing_legacy`, or `NULL` as the analysis source.
- Adds a trigger that rejects assessment-controlled values supplied by `anon` or `authenticated` on INSERT and guards the same fields if UPDATE is ever re-granted.
- Explicitly grants `authenticated` only SELECT, INSERT, and DELETE, and revokes table UPDATE from `anon` and `authenticated`. The current browser flows only insert authentication rows, so no current UI write path depends on owner UPDATE.
- Explicitly preserves service-role SELECT and UPDATE so the Edge Function can load and complete an analysis.
- Keeps `cache_key` and `cached_from_id` for compatibility and marks both deprecated. No columns or rows are deleted.

The migration passed a clean local replay and the 16-assertion pgTAP suite. It has not been applied to a live project. Compare the target live schema with repository migrations and run the same tests in staging before production promotion.

## Rollback

If application rollback is required:

```sql
GRANT UPDATE ON public.authentications TO authenticated;
DROP TRIGGER IF EXISTS guard_authentication_assessment_fields ON public.authentications;
DROP FUNCTION IF EXISTS public.guard_authentication_assessment_fields();
ALTER TABLE public.authentications DROP CONSTRAINT IF EXISTS authentications_analysis_source_check;
ALTER TABLE public.authentications
  DROP COLUMN IF EXISTS analysis_model,
  DROP COLUMN IF EXISTS analysis_config_version,
  DROP COLUMN IF EXISTS analyzed_at,
  DROP COLUMN IF EXISTS legacy_unverified_references_used,
  DROP COLUMN IF EXISTS analysis_source;
```

If the pre-Phase-1A role grants must be restored exactly, capture them from the target environment before promotion; the repository baseline did not contain an authoritative grants export.

Dropping the additive audit columns removes only Phase 1A metadata written after deployment; it does not delete authentication rows, images, scores, or details. For the safest operational rollback, first deploy the previous application version, then restore the privilege and trigger state. Do not restore verdict-cache code.
