# Phase 1A — Trust Lockdown implementation

## Executive summary

Phase 1A removes cross-submission verdict reuse and makes every submission issue a fresh model request. The analysis function now authenticates the caller, loads the owned row's canonical images, validates Mode A ownership, isolates approved eBay image evidence as legacy Mode B, ignores request-body image arrays, and rejects missing or unauthorized evidence before model work.

Assessment output is protected at the database layer: authenticated row UPDATE is revoked, forged assessment values on INSERT are rejected by a trigger, and service-role completion remains available. DuckDuckGo retrieval and authoritative internet-reference language are removed. Both Edge Functions now enable platform JWT verification while retaining their explicit claim checks. Completed analyses record model, configuration version, timestamp, legacy-reference use, and physical/listing source.

## Files changed

- `supabase/functions/analyze-funko/index.ts`
- `supabase/functions/scrape-listing/index.ts`
- `supabase/functions/_shared/ebay-url.ts`
- `supabase/functions/_shared/evidence-source.ts`
- `supabase/functions/_shared/independent-analysis.ts`
- `supabase/config.toml`
- `supabase/migrations/20260716090000_phase_1a_trust_lockdown.sql`
- `supabase/tests/phase_1a_authentication_privileges.sql`
- `src/components/upload/UrlImportBar.tsx`
- `src/pages/Upload.tsx`
- `src/pages/Results.tsx`
- `src/integrations/supabase/types.ts`
- `src/test/ebay-url.test.ts`
- `src/test/evidence-source.test.ts`
- `src/test/trust-lockdown.test.ts`
- `docs/phase-1a-baseline.md`
- `docs/phase-1a-plan.md`
- `docs/phase-1a-migration.md`
- `docs/phase-1a-implementation.md`

## Migration created

`20260716090000_phase_1a_trust_lockdown.sql` is additive. It adds nullable audit columns, a constrained source label, an INSERT/UPDATE assessment guard, authenticated UPDATE revocation, explicit service-role UPDATE, and deprecation comments for cache compatibility columns. Existing rows are not modified or deleted.

See `docs/phase-1a-migration.md` for row impact and rollback SQL.

## Security behavior before and after

| Area | Before | After |
| --- | --- | --- |
| Verdict reuse | Score, identity, and details could be copied from a prior high-scoring row keyed by printed codes. | No verdict lookup or copy branch; each submission dispatches a model request. |
| Client verdict writes | Owners could update all columns through PostgREST. | Authenticated UPDATE is revoked; forged assessment fields on INSERT are trigger-blocked; service-role completion remains allowed. |
| Analysis images | Request-body `imageUrls` selected model evidence. | Owned-row `image_urls` are canonical; request arrays are ignored. |
| Mode A ownership | No storage URL ownership/domain validation. | Exact Supabase origin, bucket path, and owner folder are required. |
| Mode B | External images were silently mixed with physical scans. | Only exact `i.ebayimg.com/images/...` evidence is retained and recorded as `listing_legacy`. |
| Web reference | DuckDuckGo could provide an authoritative scoring image. | No DuckDuckGo request exists; retained admin references are labelled legacy/unverified. |
| eBay URL validation | Regex accepted attacker-controlled lookalikes. | Pure HTTPS allowlist rejects lookalikes, credentials, custom ports, and unsupported protocols. |
| Function auth | Explicit checks only; platform verification disabled. | Platform JWT verification and explicit claim/ownership checks are both enabled. |
| Auditability | Model/config/time/reference/source were not stored. | All five are written to dedicated columns and the details audit object. |

## Tests added and results

- Verdict-cache regression: identical Pop/factory metadata produces two dispatches; no prior-row lookup/details-copy branch remains.
- Cross-user details regression: completion details are built only from the current analysis.
- Canonical image source: request mismatch ignored; wrong owner, arbitrary domain, missing images, non-HTTPS, and credentials rejected; eBay evidence labelled legacy.
- Edge authentication/ownership static assertions and `verify_jwt` assertions.
- eBay allowlist: 16 accepted/rejected cases.
- DuckDuckGo and internet gold-standard absence assertions.
- Migration privilege assertions plus a pgTAP database suite for forged score/status/details, authenticated UPDATE denial, and service-role completion.

Results:

- `npm test`: passed — 4 files, 32 tests.
- `npm run build`: passed with the pre-existing CSS import-order and large-chunk warnings.
- `npx tsc --noEmit`: passed.
- Edge Function esbuild checks: passed for both functions.
- `git diff --check`: passed.
- `npm run lint`: failed with 29 errors and 9 warnings, all in pre-existing lint-debt locations. Baseline was 30 errors and 9 warnings; Phase 1A introduced no new lint finding.
- pgTAP database suite: added but not executed locally because this environment has neither Supabase CLI nor Docker. It must be run against a fresh/local Supabase database before migration promotion.

No paid AI requests were made.

## Exact implementation/verification commands

```text
git init -b main
git add .
git commit -m 'chore: import PopCheck baseline'
git switch -c hardening/phase-1a-trust-lockdown
npm ci
npm install --package-lock=false
npm run build
npm run lint
npm test
npx tsc --noEmit
npx esbuild supabase/functions/analyze-funko/index.ts --bundle --platform=neutral --external:https://* --outfile=/tmp/popcheck-analyze.js
npx esbuild supabase/functions/scrape-listing/index.ts --bundle --platform=neutral --external:https://* --outfile=/tmp/popcheck-scrape.js
git diff --check
```

`npm ci` failed because the supplied `package-lock.json` is stale. `npm install --package-lock=false` installed local dependencies without rewriting it.

## Remaining Phase 1 risks

- Both storage buckets remain marked public in `storage.buckets`; changing bucket privacy was outside the approved items.
- Legacy listing evidence is domain-isolated and disclosed but still lacks full listing/item provenance.
- Admin reference tables remain pre-provenance and can still influence the legacy model pipeline; their use is now labelled and recorded.
- The single-model scoring pipeline, prompt-injection surfaces, forced identity inference, score heuristics/bias, report/certificate language, and retry semantics remain as audited because they are outside Phase 1A.
- No live rate limiting, structured model-call observability, or deterministic evidence gate was added.
- npm reports one moderate and one high dependency vulnerability; dependency upgrades were not part of this phase.

## Known schema drift

`public.pop_reference_library` is altered and receives policies in repository migrations but is never created by a repository migration. The live schema was not queried or changed. Additional live drift is unknown and must be compared before applying the new migration.

## Recommended pull request

Title: `Phase 1A: lock down verdict trust and canonical evidence`

Description:

> Removes verdict reuse and cross-submission details copying, protects assessment fields from authenticated PostgREST writes, derives model evidence only from the owned canonical row, isolates legacy eBay listing evidence, removes DuckDuckGo reference retrieval, centralizes strict eBay validation, enables platform JWT verification, and records minimum analysis provenance. Adds 31 Phase 1A Vitest cases plus pgTAP privilege coverage. Build, TypeScript, Edge bundles, and all 32 tests pass; repository-wide lint retains pre-existing failures and the pgTAP suite requires a local Supabase runtime before migration promotion.
