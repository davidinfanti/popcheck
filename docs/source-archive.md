# Safe source archive procedure

Create distributable source archives only from a reviewed commit. `git archive` applies the repository's `export-ignore` rules and does not include untracked developer files.

```sh
git status --short
git archive --format=zip --output=popcheck-source.zip HEAD
```

Verify the archive manifest before distribution. The first command below must print no matches; `.env.example` is intentionally omitted from exported archives along with every root, nested, and Supabase Function environment file.

```sh
zipinfo -1 popcheck-source.zip | rg '(^|/)\.env($|\.)'
zipinfo -1 popcheck-source.zip | rg '^(supabase/\.branches|supabase/\.temp)/'
```

If either verification command prints a path, do not distribute the archive. Fix the export rules, regenerate it, and verify again. Recipients can create their own local `.env` from the placeholder-only `.env.example` in the repository checkout and obtain real values through the approved secret-management channel.
