# Phase 1B.1 implementation plan

1. Add an additive migration creating append-only structured guidance with closed enums/templates. Revoke client execution of the legacy free-text RPC while retaining the legacy table and run foreign key unchanged.
2. Add a controlled service-role-only atomic completion RPC. It locks the submission, validates the expected prior run, inserts one immutable run, updates the compatibility snapshot, and returns the inserted run in one transaction. An idempotency token returns the same run on retry; a distinct stale completion is rejected.
3. Replace Edge Function guidance loading/rendering with the structured contract and replace sequential persistence with the atomic RPC.
4. Replace the admin free-text textarea with enum/template selectors and optional constrained applicability fields.
5. Add a reusable idempotent legacy-backfill function and behavioral pgTAP coverage that calls it twice without changing source rows.
6. Clarify low-severity copy without changing decision rules; keep every observed low-severity finding visible in Results and the PDF.
7. Add placeholder-only `.env.example` and archive/export instructions that exclude root/nested environment files and local Supabase state.
8. Run clean replay, all pgTAP/regression/unit/content/PDF tests, generated types, TypeScript, build, Edge bundling, real service-role integration, lint classification, and `git diff --check`.
