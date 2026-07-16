# Phase 1A implementation plan

1. Remove the verdict-cache pre-pass and every assessment-copy/write path; make each invocation dispatch a fresh model analysis.
2. Add an additive migration that records minimum audit metadata, rejects client-supplied assessment values on INSERT, and revokes authenticated row UPDATE while preserving service-role writes.
3. Load canonical evidence and identity metadata from the owned authentication row; validate Mode A storage ownership and isolate approved eBay image hosts as legacy Mode B evidence. Ignore request-body image arrays.
4. Remove DuckDuckGo retrieval and re-label retained admin reference inputs as legacy/unverified.
5. Centralize strict eBay listing validation in a pure shared function and use it in the Edge Function and browser UI.
6. Enable platform JWT verification for both Edge Functions while retaining explicit in-function authentication and ownership checks.
7. Add pure-function, static-regression, and SQL privilege/RLS tests; run build, lint, and tests; document migration impact and rollback; commit the completed branch.
