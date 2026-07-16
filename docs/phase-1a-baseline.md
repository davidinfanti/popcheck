# Phase 1A baseline record

Recorded on 2026-07-16 before Phase 1A code changes.

## Repository and branch

- Source: `PopCheck.zip` supplied by the user.
- Imported baseline commit: `78df4bb` (`chore: import PopCheck baseline`).
- Working branch: `hardening/phase-1a-trust-lockdown`.
- The supplied ZIP did not contain Git metadata, so a local repository and baseline commit were created before the required branch.

## Build, lint, and tests

- `npm ci`: failed because `package-lock.json` is not synchronized with `package.json` (many direct and transitive packages are absent from the lockfile).
- `npm install --package-lock=false`: succeeded for local verification without changing the stale lockfile; npm reported one moderate and one high dependency vulnerability.
- `npm run build`: passed. Existing warnings: the Google Fonts `@import` is after Tailwind directives and the main bundle exceeds 500 kB.
- `npm run lint`: failed with 30 errors and 9 warnings. These are pre-existing, primarily `no-explicit-any`, two empty-interface errors, one CommonJS import, and React refresh/hook warnings.
- `npm test`: passed, but only the placeholder test existed (1 file, 1 test).

An earlier attempt before local dependencies were available failed because the global Vite tried to write outside the workspace and `eslint`/`vitest` were unavailable. The results above are the meaningful dependency-backed baseline.

## Supabase migrations

The repository contains these migrations, in order:

1. `20260307113448_b06e5614-51a5-4342-95be-35761149f7ec.sql`
2. `20260307121146_4f7fd630-78dd-4a7e-b41b-6662079b1b31.sql`
3. `20260307233221_d323bca1-b4fa-4eca-b74d-d4c4878a760a.sql`
4. `20260307233235_207c361c-3d4d-42e4-a792-a2c8c13f833c.sql`
5. `20260308105717_d36ec61d-6b12-4541-97ef-e9045be92b2b.sql`
6. `20260308110142_64d5b4e5-55d1-40a6-99f3-495654fbfbba.sql`
7. `20260308111505_b48244d9-fabc-4b48-b6b2-1d373b659fb5.sql`
8. `20260308111857_cb593e0c-d7a6-490d-8a08-7e45a27e1813.sql`
9. `20260308201922_39e87786-92f4-4270-8050-7849b9a04766.sql`
10. `20260309163455_901aaa81-d65a-45e1-a2af-320288c6aefd.sql`
11. `20260309192724_d46c5a16-f206-427c-a84e-72b34561fc69.sql`
12. `20260611111526_7924acd2-6f20-4b95-8cf7-f0c2c9820656.sql`
13. `20260611112053_b7ff2c24-7f95-48dc-afdf-ede3080c8d87.sql`
14. `20260611112138_ad96bb51-22f2-43ca-9045-77f1ad5a0e90.sql`
15. `20260611112934_dcd50c2d-74f6-4ddb-907d-7f13892acc72.sql`
16. `20260611113239_d4106e7c-79d1-4088-bafc-32287e6ddb2b.sql`
17. `20260611114432_ab9b3bb6-25b5-4da9-be20-fb4b00b61976.sql`
18. `20260611114529_485d5cab-5edb-4e16-aa26-db1dc20b119e.sql`
19. `20260611114611_1a16a8a9-069a-4e2e-99ba-6925873b1ade.sql`
20. `20260611114638_9acb695c-f871-4ba7-98bf-019c059b1179.sql`
21. `20260611114733_5ff3045c-490b-4283-a383-67bf7cd9a046.sql`

Known reproducibility drift: migration 4 alters and adds policies to `public.pop_reference_library`, but no repository migration creates that table. The live project was not queried, so additional live drift is unknown and no live schema assumptions are made.

## Authentication RLS and privileges

The final repository policy state for `public.authentications` includes:

- authenticated users can insert rows when `auth.uid() = user_id`;
- authenticated users can select their own rows;
- authenticated users can update their own rows with no column restrictions;
- users can delete their own rows;
- admins can select all rows;
- public direct-by-ID access was removed and replaced with a security-definer share-token RPC.

No repository migration revokes authenticated `UPDATE` on assessment columns. Consequently an owner can set `score`, `status`, `details`, `cached_from_id`, and other row fields through PostgREST.

## Storage configuration

- `funko-images` is created with `public = true`.
- `reference-images` is created with `public = true`.
- Later migrations remove broad object SELECT policies and add owner/admin SELECT policies, but do not set either bucket's `public` flag to false.
- `funko-images` writes are scoped to the authenticated user's top-level folder.
- `reference-images` writes are ultimately restricted to admins.

Bucket privacy is a remaining audit risk but is outside the approved Phase 1A items.

## Edge Function authentication

`supabase/config.toml` sets `verify_jwt = false` for both `analyze-funko` and `scrape-listing`. Both functions also perform explicit Bearer-token claim checks in code. `analyze-funko` checks ownership of the requested authentication ID, but originally analyzes request-body URLs rather than the owned row's canonical URLs.

## Verified Phase 1A findings

- `analyze-funko` performs an OCR cache pre-pass and copies another completed row's score, identity, details, status, and source ID.
- authenticated owners have unrestricted row-level UPDATE access to assessment fields.
- `imageUrls` are taken from the request body after an ID-only ownership lookup.
- DuckDuckGo Instant Answer can supply an image described to the model as the primary “gold standard.”
- server validation accepts any hostname matching `/(^|\.)ebay\./`, including attacker-controlled suffixes.
- both Edge Functions have platform JWT verification disabled.
- completed rows do not record model, configuration/prompt version, analysis timestamp, legacy-reference use, or physical/listing source.
