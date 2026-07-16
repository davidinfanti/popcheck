# Environment hygiene

`.env` and `.env.*` are ignored, while the repository's `.env.example` contains placeholders only. Source archives are produced with `git archive`; `.gitattributes` excludes root and nested environment files, including Supabase Function environment files. See `docs/source-archive.md` for the creation and verification procedure.

## Operator rotation checklist

The supplied archive circulated a Supabase client/anon publishable credential. Before staging or production deployment, an authorized operator must rotate or replace that credential and update the approved clients.

Separately rotate every credential that was ever included in a repository copy, terminal log, attachment, or shared archive, including:

- Supabase service-role and publishable/anon keys;
- database passwords and connection credentials;
- AI-provider and gateway credentials;
- scraping-provider credentials;
- deployment, CI, webhook, and storage credentials.

Invalidate old values, update managed secret stores and deployments, then verify the old credentials no longer authenticate. Do not paste secret values into issues, pull requests, fixtures, reports, archive manifests, or command output.
