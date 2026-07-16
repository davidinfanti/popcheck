# Environment hygiene

`.env` and `.env.*` are ignored, while `.env.example` may be committed. The circulated `.env` file has been removed from Git tracking without deleting the developer's local copy.

The supplied archive circulated a Supabase client/anon publishable credential. Rotate or replace that credential before staging or production deployment and update authorized deployments. If any service-role, Lovable AI, Firecrawl, database, or other privileged secret was ever included in a repository copy, terminal log, attachment, or shared archive, rotate it as well. No secret values should be pasted into issues, pull requests, test fixtures, reports, or command output.
