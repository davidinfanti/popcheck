# Phase 1B.1 migration design

The new migration is additive to the approved Phase 1B migration.

## Structured guidance

- Preserve `ai_guidance_versions` and `assessment_runs.guidance_version_id` as inactive legacy history.
- Create `structured_guidance_versions` with closed values for guidance type, inspection area, action, priority, reference requirement, and note template.
- Store no executable admin prose. Product UUID, variant UUID, and release-year range are optional applicability data only.
- Add `assessment_runs.structured_guidance_version_id` for new lineage and retain the legacy guidance foreign key.
- Revoke authenticated execution of `create_ai_guidance_version`; expose only the structured admin RPC.

## Atomic completion

- Add a nullable `completion_token` to `assessment_runs` plus a partial unique index per submission.
- `complete_phase_1b_assessment` is executable only by `service_role` and verifies the active database/JWT role.
- Lock the authentication row, return an existing run for the same completion token, reject a stale expected-prior-run value, insert the run, update the compatibility snapshot, and return the run in one PostgreSQL transaction.
- Any insert, trigger, constraint, or snapshot-update failure rolls back the complete function call.

## Legacy backfill

- Add an operator-only idempotent `backfill_legacy_assessment_runs` function using the existing unique partial index and `ON CONFLICT DO NOTHING`.
- Execute it once during migration; tests execute it twice on dedicated fixtures.

## Rollback

Prefer application rollback while retaining audit history. If schema rollback is mandatory:

1. Revoke and drop the atomic and structured-guidance RPCs.
2. Drop the structured-guidance append-only trigger and table only after exporting new lineage.
3. Drop the `assessment_runs` structured-guidance foreign key column and completion-token index/column only after confirming no application depends on them.
4. Optionally re-grant the legacy free-text RPC only when rolling back to the approved Phase 1B application; this reopens the reviewed guidance weakness.

Rollback must not update/delete assessment runs, source authentication rows, or legacy guidance rows.
