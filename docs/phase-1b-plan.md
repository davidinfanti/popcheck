# Phase 1B implementation plan

## Scope

Preserve React/Vite/TypeScript/Supabase, the current AI provider, and every Phase 1A trust boundary. Phase 1B changes the single model call from score generation to strictly validated observations, adds a pure deterministic decision engine, stores append-only assessment runs, and changes consumer language from certification/probability to evidence-limited assessment.

## Implementation order

1. Add shared versioned TypeScript contracts for structured observations, candidate identity, derived dimensions, and six final verdict classes. Implement a strict equivalent-to-Zod runtime validator that rejects missing keys, extra keys, placeholder identity values, invalid enums, malformed output, and any model-supplied verdict.
2. Add a pure `popcheck-decision-v1` engine. It derives dimensions from typed observation status/type/severity/reference reliability and applies deterministic gates for insufficient evidence, identity ambiguity, reference reliability, observable material risk, and unavailable evidence.
3. Replace the legacy V-STAMP score tool/prompt with `popcheck-observation-v1`. The provider returns only candidate identity, structured observations, requested evidence, and factual limitations. Remove all score arithmetic, caps, bonuses, prose keyword enforcement, forced identity, and final-verdict fields.
4. Add one additive migration for append-only `assessment_runs` and versioned `ai_guidance_versions`. Backfill each completed scored legacy row once as `run_kind='legacy'` with verdict class `legacy_vstamp_score`, original score/timestamp, and explicit uncalibrated limitation. Add RLS, grants, shared-token RPC access, immutable-row triggers, and a constrained admin-guidance RPC.
5. Insert each successful Phase 1B result as a new immutable run, then update only the existing compatibility row's latest status/audit/details fields. Never write `score` in the new path. Strict-validation/provider failures persist a controlled failed state without a verdict.
6. Rewrite Results and the PDF around the latest run: verdict, reliability, evidence quality, candidate identity, supporting/risk observations, limitations, missing evidence, reference reliability, and engine/prompt versions. Keep listing disclosure. Display any historical numeric score only as uncalibrated `legacy_vstamp_score` data.
7. Change re-analysis to append a new run to the same submission. Show run history and version differences by time, verdict, reliability, engine, and prompt; never replace or relabel the earlier run.
8. Disable the raw mutable system override. Route admin guidance through versioned constrained inserts that record editor, timestamp, prior version, and the influencing guidance ID on each run. The fixed output schema and deterministic engine remain non-configurable.
9. Update Collection/Admin legacy labels and remove current-score threshold classification. Add exhaustive unit, content, append-only, pgTAP, and real service-role integration coverage.

## Additive migration safety

The migration will:

- create new tables/functions/policies/triggers/indexes only;
- reference the replayed `authentications`, `auth.users`, and existing role helper;
- preserve every legacy authentication row, score, detail object, source, and timestamp;
- backfill legacy run records without changing the source rows;
- grant authenticated users read-only owner access to runs and no insert/update/delete privilege;
- permit service-role INSERT only and prohibit UPDATE/DELETE for every role through an immutable-row trigger;
- retain Phase 1A grants and assessment-field guard unchanged.

Rollback removes only Phase 1B functions, triggers, policies, and new tables. Because the migration is additive, rollback does not alter or delete `authentications` data. If Phase 1B runs exist, export them before dropping the tables; application rollback should leave history tables in place whenever possible.

## Decision boundaries

- `unable_to_assess`: evidence quality is insufficient.
- `strong_counterfeit_indicators`: one or more observed, traceable high/critical risk indicators; never missing evidence alone.
- `elevated_counterfeit_risk`: at least one observed material medium risk inconsistency.
- `inconclusive`: limited/conflicting evidence, ambiguous/unidentified identity, or mixed/inconsistent dimensions without the traceable strong-risk gate.
- `consistent_with_verified_references`: only sufficient evidence, identified product, verified references, suitable consistency, and no material observed risk.
- `no_material_anomaly_detected`: sufficient visible evidence and no material observed anomaly, while explicitly not asserting authenticity or certification.

The model has no final-verdict field and explanatory prose never enters any branch condition.
