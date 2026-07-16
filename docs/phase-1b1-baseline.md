# Phase 1B.1 baseline

Baseline commit: `bc62fd89a5a4cfda5a85b0cd3764d8f117e6d0e1`

Branch: `hardening/phase-1b1-guidance-and-atomicity`

## Executable baseline

- Vitest: 8 files, 61 tests passed.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: passed with the inherited CSS import-order and large-chunk warnings.
- Migration replay: all 23 Phase 1A/1B migrations applied.
- pgTAP: retained Phase 1A and Phase 1B suites passed 38/38.

## Review defects confirmed

1. `ai_guidance_versions.guidance` is unrestricted text. `create_ai_guidance_version` attempts to constrain it with a regular expression, and the Edge Function appends the text to the model prompt. Paraphrases can therefore express unsafe semantics without matching the filter.
2. The Edge Function inserts `assessment_runs` and then separately updates `authentications`. A snapshot failure can leave a committed authoritative run and a stale compatibility row.
3. The Phase 1B legacy backfill is idempotent by partial unique index and `ON CONFLICT`, but no behavioral test executes the backfill twice against eligible and ineligible rows.
4. A low-severity observed risk can intentionally remain in `no_material_anomaly_detected`; the current explanation does not explicitly say that minor observations may still exist.
5. Root and nested environment files are ignored, but `.env.example` and explicit safe archive/export instructions are absent. An ignored local function environment file exists and must never be read, copied, archived, or committed.

## Security boundaries retained

- Phase 1A JWT, ownership, canonical-evidence, protected-field trigger, and service-role controls.
- Phase 1B strict model-output validation, deterministic verdict rules, append-only run triggers, owner-read RLS, and no numeric scoring/certification presentation.
- Existing assessment-run guidance lineage and legacy free-text rows remain immutable historical data.
