# Phase 1B.1 implementation report

Baseline: `bc62fd89a5a4cfda5a85b0cd3764d8f117e6d0e1`

Branch: `hardening/phase-1b1-guidance-and-atomicity`

Phase 1B.1 closes the two conditional-pass defects without changing the AI provider or deterministic verdict rules and without reintroducing scoring, probability, or certification language.

## Structured guidance

New admin guidance is an append-only closed database contract. Guidance type, inspection area, action, priority, reference requirement, and note are enums. Applicability uses UUIDs and a bounded year range, so certainty-implying prose cannot be encoded in identifiers. The prompt renderer emits only predefined text and labels guidance non-authoritative inspection coverage. It cannot create observations, select verdicts, change enums, disable uncertainty, or alter the decision engine.

Legacy `ai_guidance_versions` rows and `assessment_runs.guidance_version_id` remain unchanged for audit history. Authenticated execution of the legacy free-text creation RPC is revoked, and the Edge Function no longer reads legacy guidance. New runs record `structured_guidance_version_id`, preserving version/editor/timestamp/previous-version lineage.

## Atomic persistence

`complete_phase_1b_assessment` is a `SECURITY INVOKER` RPC granted only to `service_role`. It verifies both the active database role and JWT role, locks the owned authentication row, checks the expected latest run, inserts the immutable run, adds its ID to the compatibility snapshot, updates status and audit columns, and returns the run in one transaction.

A per-submission completion token makes retries idempotent. A second completion based on a stale prior-run ID receives SQLSTATE `40001` and creates no run. A forced snapshot-update trigger failure was tested behaviorally: the run insert rolled back and the source authentication row remained `analyzing` with no partial details or audit update.

## Legacy backfill and low-severity copy

The operator-only backfill function uses the existing one-legacy-run partial unique index plus `ON CONFLICT DO NOTHING`. In pgTAP, the same fixture backfill ran twice: the first call inserted one eligible legacy run and the second inserted zero. Timestamp, score label/value, source, model, and prompt were preserved; source authentication rows were unchanged; a completed null-score row produced no run.

The deterministic low-severity rule is unchanged. `no_material_anomaly_detected` now says minor or low-severity observations may remain and that the verdict does not mean zero anomalies. Results and the PDF continue to list every observed risk indicator with severity. Physical and listing fixtures were rendered to two pages each and visually inspected without clipping or overlap.

## Environment hygiene

`.env.example` contains client placeholders only. `.gitignore` excludes root and nested `.env` files, while `.gitattributes` excludes all environment files and local Supabase state from `git archive`. `docs/source-archive.md` documents manifest verification. Credential rotation remains an authorized operator task documented separately in `docs/environment-hygiene.md`.

## Verification

- Clean migration replay: all 24 migrations applied from an empty local database.
- pgTAP: 3 files, 76 tests, PASS.
- Vitest: 9 files, 68 tests, PASS.
- TypeScript: PASS.
- Production build: PASS with inherited CSS import-order and large-chunk warnings.
- Edge bundles: `analyze-funko` and `scrape-listing` PASS.
- Real HTTP/service-role integration: PASS using local Auth/JWT/PostgREST, the cached Supabase Edge runtime, the actual local service-role key, and an offline observation stub. Paid AI calls: 0.
- PDF render: physical and listing reports each rendered as two A4 pages; disclosures and low-severity findings were visually verified.
- ESLint: 13 errors and 9 warnings, identical to the Phase 1B baseline and confined to inherited lint-debt locations.
- `git diff --check`: PASS.

The Supabase CLI 2.109.1 `functions serve` router failed before loading user code with `failed to determine entrypoint`. Edge bundling passed, and the real integration was completed with the same cached Supabase Edge runtime image mounted directly to `analyze-funko`. This local CLI/router compatibility issue does not change application code but remains an environment risk to recheck in CI or staging tooling.

## Rollback

Prefer application rollback while retaining immutable audit data. If schema rollback is required, first export `structured_guidance_versions` and new `assessment_runs` lineage, revoke and drop the two Phase 1B.1 RPCs, drop the structured-guidance append-only trigger/table, then drop the structured-guidance/completion-token columns and index only after confirming no deployed application depends on them. Do not update or delete assessment runs, authentication rows, scores, or legacy guidance. Re-granting the legacy free-text RPC is only appropriate when reverting to the approved Phase 1B application and knowingly reopens the reviewed weakness.

## Recommendation

Ready for controlled staging after operator credential rotation and a target-schema/data dry run. Not ready for production until staging verifies live migration/backfill counts, representative expert-reviewed evidence, monitoring, and the deployment environment's Edge runtime startup path.
