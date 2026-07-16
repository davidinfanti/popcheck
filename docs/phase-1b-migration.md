# Phase 1B migration safety

Migration: `20260716120000_phase_1b_verdict_integrity.sql`.

## Row impact

- Creates `assessment_runs` and `ai_guidance_versions`; no existing table or column is removed.
- Does not update or delete any `authentications` row.
- Inserts exactly one immutable `legacy` run for each existing completed authentication with a non-null score. The original score, timestamp, model/config label, source, and identity remain on the source row and are copied into an explicitly uncalibrated compatibility record.
- New Phase 1B runs are service-role INSERT-only. UPDATE and DELETE are prohibited by both privileges and an append-only trigger.
- An authentication row with assessment history cannot be deleted because its history foreign key uses `ON DELETE RESTRICT`.
- Authenticated owners can read runs through RLS; share-token readers use a token-gated security-definer RPC. No client can create or mutate a run.
- The Phase 1A assessment-field trigger, ownership policies, and grants are not changed.

## Admin guidance safety

The legacy mutable `ai_settings.system_instructions_override` remains for historical compatibility but Phase 1B ignores it. New guidance is appended through an admin-only RPC, records version/editor/time/previous version, accepts only observation categories, and rejects scoring, probability, verdict, certification, fabrication, bypass, or uncertainty-disabling instructions. A run records the guidance version that influenced its observation request.

## Rollback

Prefer leaving append-only history in place when rolling the application back. If schema rollback is required, export both new tables first, then run:

```sql
DROP FUNCTION IF EXISTS public.get_shared_assessment_runs(uuid, uuid);
DROP FUNCTION IF EXISTS public.create_ai_guidance_version(text, text);
DROP TRIGGER IF EXISTS assessment_runs_are_append_only ON public.assessment_runs;
DROP TRIGGER IF EXISTS ai_guidance_versions_are_append_only ON public.ai_guidance_versions;
DROP FUNCTION IF EXISTS public.prevent_append_only_mutation();
DROP TABLE IF EXISTS public.assessment_runs;
DROP TABLE IF EXISTS public.ai_guidance_versions;
```

This removes only Phase 1B history/guidance copies. It does not change or delete any authentication row or legacy score. Dropping `assessment_runs` does permanently discard Phase 1B run history unless exported first.
