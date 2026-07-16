# Phase 1B implementation - evidence, uncertainty, and verdict integrity

Baseline: `872d2e470f8435e11452cb279df5d7b2ee14c005`
Branch: `hardening/phase-1b-verdict-integrity`

## Outcome

New assessments no longer calculate, store, or render a numeric authenticity score. The AI provider returns only strictly validated candidate identity and visible observations. The shared `popcheck-decision-v1` engine deterministically derives seven categorical dimensions and one of six verdict classes. Model prose and model-supplied verdicts cannot influence the decision branch.

The Phase 1A JWT, ownership, canonical-evidence, service-role, privilege, trigger, and safe-evidence-failure controls remain in place. The AI provider and application stack are unchanged.

## Versions and contracts

- Observation schema: `popcheck-observation-schema-v1`.
- Prompt: `popcheck-observation-v1`.
- Decision engine: `popcheck-decision-v1`.
- Provider model: unchanged (`google/gemini-3-flash-preview`).

The strict observation validator rejects missing/extra properties, invalid enums, placeholder identity values, non-null references without reliability, unavailable evidence classified as risk, evidence-quality observations classified as counterfeit risk, untraceable risk indicators, invalid submitted-image indices, and model-version mismatch. Unreadable identity remains null.

## Deterministic verdict order

1. Insufficient evidence -> `unable_to_assess`.
2. Observed, traceable high/critical risk -> `strong_counterfeit_indicators`.
3. Observed, traceable medium risk -> `elevated_counterfeit_risk`.
4. Ambiguous/unidentified identity, limited evidence, or mixed material findings -> `inconclusive`.
5. Sufficient evidence, identified product, verified references, and suitable consistency -> `consistent_with_verified_references`.
6. Sufficient visible evidence with no material observed anomaly -> `no_material_anomaly_detected`.

`not_visible`, `uncertain`, missing photographs, unreadable details, and stock-photo limitations cannot create a risk indicator. No rule reads explanatory prose.

## Storage and history

Migration `20260716120000_phase_1b_verdict_integrity.sql` adds:

- `assessment_runs`: owner-readable, service-role-insert-only, append-only history with model/prompt/engine/schema/source/guidance versions, identity, observations, dimensions, verdict, limitations, and missing evidence;
- `ai_guidance_versions`: append-only admin observation guidance with editor, timestamp, and prior-version lineage;
- shared-token history RPC and constrained admin-guidance RPC;
- immutable-row triggers and supporting indexes/policies/grants.

Existing completed numeric results are copied once to a `legacy` run with class `legacy_vstamp_score`, their original timestamp/model/config/source where recoverable, and an explicit uncalibrated limitation. Source authentication rows and legacy scores are unchanged. The compatibility `authentications.details` snapshot reflects the latest successful Phase 1B run, while `assessment_runs` is authoritative history.

## UI and report

Results and the jsPDF report prioritise the categorical verdict, reliability, evidence quality, candidate identity, supporting/risk observations, limitations, missing evidence, reference reliability, and version metadata. Re-analysis appends to the same submission, history remains selectable, and a comparison identifies changes from the immediately preceding immutable run.

Numeric historical values appear only as `Legacy V-STAMP score (uncalibrated historical data)`. The listing disclosure states that the physical item was not examined and the result is not physical-item certification. Physical reports state that the AI-assisted output is not a legal or expert certificate of authenticity. Public product copy no longer advertises scores or certification.

## Admin safety

The Phase 1B backend ignores the mutable legacy `ai_settings` override and the mutable forensic-manual rows. Admins can append constrained observation guidance only. The database rejects instructions that attempt scoring, probabilities, verdict changes, certification, fabrication, schema/instruction bypass, or disabling uncertainty. A run records the guidance version that influenced it.

## Verification

- Clean replay: all 23 migrations completed from an empty local Supabase instance.
- pgTAP: 2 files, 38 tests, PASS (retained Phase 1A suite plus Phase 1B history/guidance suite).
- Vitest: 8 files, 61 tests, PASS.
- TypeScript: PASS.
- Production build: PASS with the pre-existing CSS import-order and large-chunk warnings.
- Edge runtime: function imports bundled and the worker listened successfully.
- Real HTTP/service-role integration: PASS with actual local JWT/Auth/PostgREST/service-role key path and offline AI stub; happy path, ownership, canonical evidence, two immutable runs, evidence rejection, refusal, incomplete output, and malformed output were verified; paid AI calls: 0.
- PDF render: physical and listing fixtures rendered as two-page PDFs, rasterized, and visually inspected with no clipping or overlap.
- `git diff --check`: PASS.
- ESLint: 13 errors and 9 warnings remain in inherited files/rules; baseline was 29 errors and 9 warnings. No new Phase 1B engine, report, Results, or test file lint finding was emitted.

## Remaining risks

- The repository reference material remains legacy/unverified, so `consistent_with_verified_references` should normally remain unavailable until provenance work is completed.
- The categorical rules are deterministic, not statistically calibrated. Staging still needs expert review of representative evidence before production release.
- The empty local replay proves migration reproducibility but cannot prove row counts or data quality for the live legacy backfill; take a database backup and dry-run/verify counts in staging.
- The immutable run insert and compatibility-row update are sequential backend writes rather than one database transaction. The run remains authoritative if a later compatibility update fails, but operational monitoring should alert on such divergence.
- The provider-timeout branch is implemented but not exercised with a 30-second integration delay; refusal, incomplete, malformed, and evidence failures are behaviorally covered.

## Rollback

Prefer rolling back application code while retaining the new history tables. If schema removal is required, first export both new tables, then follow `docs/phase-1b-migration.md`. Dropping the Phase 1B tables permanently deletes copied/new history but does not change or delete `authentications` rows or their legacy scores.
