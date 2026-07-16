# Phase 1B baseline — verdict integrity

Baseline commit: `872d2e470f8435e11452cb279df5d7b2ee14c005`
Branch: `hardening/phase-1b-verdict-integrity`

## Approved Phase 1A controls retained

- Platform JWT verification plus in-function claim and ownership checks.
- Canonical evidence loaded from the owned `authentications` row; request-body image arrays do not select evidence.
- Exact storage origin/bucket/owner validation and isolated `listing_legacy` evidence.
- Authenticated UPDATE revoked; forged assessment fields on INSERT are trigger-blocked; service-role completion is permitted.
- Verdict caching and DuckDuckGo reference retrieval remain absent.
- Evidence validation persists `evidence_required` with a safe reason.

## Executable baseline

- Vitest: 5 files, 38 tests passed.
- TypeScript: passed with `npx tsc --noEmit`.
- Vite production build: passed; existing CSS import-order and large-chunk warnings remain.
- ESLint: 29 errors and 9 warnings, matching the approved pre-existing debt.
- Clean Supabase replay: all 22 Phase 1A migrations passed.
- Phase 1A pgTAP: 1 file, 16 tests passed.

## Current score and verdict behavior

The model returns four numeric category scores and a model-selected verdict band. Backend code then dynamically reweights visible categories, subtracts for code mismatches, applies multiple caps, and adds a `+15` pre-2017 “Authenticity Bias.” Free-form prose is searched for English and Italian phrases to decide whether caps or legacy exceptions apply. The resulting integer is clamped to 0–100, stored in `authentications.score`, mapped through numeric thresholds, shown as a circular gauge, and exported as a certificate-styled PDF.

Missing or unavailable evidence is represented inconsistently by `-1`, booleans, free text, or forced identity strings. A missing copyright stamp can be treated as counterfeit, stock/listing photos can force zero, and the prompt requires identity inference rather than null.

## Complete legacy behavior map

### Calculation, modification, caps, bonus, and prose interpretation

- `supabase/functions/analyze-funko/index.ts`
  - model tool schema requests category percentages, `referenceConfidence`, `verdictBand`, required boolean `copyrightStampPresent`, and forced identity fields;
  - prompt defines 0–100 categories and final FAKE/UNCERTAIN/AUTHENTIC bands;
  - `stockPhotoDetected` zeroes four category scores;
  - missing copyright stamp caps category scores;
  - `halftoneResult`, `eraDetected`, and `legalFooterResult` are searched with `includes()` for flat/solid/Italian terms, insufficient-resolution terms, year strings, Lynnwood, and 196th;
  - weighted score uses 35/25/20/20 proportions;
  - barcode and stamp mismatch deductions, extreme-risk cap, flat-logo caps, reference caps, and final 0–100 clamp apply;
  - pre-2017 prose/year matching adds the `+15` authenticity bonus;
  - model or numeric threshold selects the final legacy band;
  - score and legacy category details are written to `authentications`.
- `supabase/functions/_shared/independent-analysis.ts` labels the legacy prompt/configuration version.
- `scripts/phase1a-ai-stub.mjs` and `scripts/phase1a-service-role-integration.mjs` encode the legacy scored contract.

### Percentage, threshold, certificate, and verified rendering

- `src/pages/Results.tsx` renders the 0–100 gauge, category percentages, ≥80/≥50 verdict thresholds, penalty messages, V-STAMP breakdown, certificate download, and retry eligibility.
- `src/lib/analysisSourceDisclosure.ts` maps numeric thresholds to authenticity language.
- `src/utils/generateCertificate.ts` uses score thresholds for border/badge styling, renders the V-STAMP score, “Certificate of Authenticity,” “AI VERIFIED,” verification stamp, and prose-derived identity fallbacks.
- `src/pages/Collection.tsx` classifies rows as Original/Uncertain/Fake by ≥80/≥50, shows `/100`, score filters, score analytics, and average V-STAMP.
- `src/pages/Admin.tsx` classifies and filters scans by the same thresholds, renders `/100`, and calculates aggregate score statistics.
- `src/pages/Upload.tsx` claims “100% accuracy” for six photos and its cosmetic ticker says it compiles a V-STAMP verdict band.

### Re-analysis and overwrite/duplication behavior

- `src/pages/Results.tsx::ReanalyzeButton` inserts a new `authentications` row containing the same images, invokes the model, and navigates to the new row. It is offered only below the legacy ≥80 threshold with “Results may vary,” enabling retry-until-favorable behavior and disconnecting the earlier assessment from the new one.
- The backend updates `authentications.details` in place and has no append-only run history.

### Admin prompt override

- `src/pages/Admin.tsx` writes arbitrary text directly to `ai_settings.system_instructions_override`.
- `supabase/functions/analyze-funko/index.ts` appends that text verbatim to the system prompt.
- The setting is mutable and records only the last editor/time; no version lineage or per-run influence record exists.

## Current schema relevant to Phase 1B

- `authentications` is the submission and latest-result compatibility row. `score` and `details` are nullable legacy result fields; Phase 1A audit fields are nullable.
- Authenticated users can SELECT/INSERT/DELETE their own rows but cannot UPDATE. The assessment guard trigger blocks forged result fields on INSERT and protected changes on client UPDATE.
- `ai_settings` is a mutable key/value table with admin policies.
- No assessment-run/history table exists.

## Baseline conclusion

The additive `assessment_runs` design can be introduced without live-schema assumptions or destructive operations because every referenced table and column is present in the replayed repository schema. Phase 1A controls do not need to be weakened.
