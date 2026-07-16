# `pop_reference_library` compatibility repair

## Evidence used

The original migration chain first referenced `public.pop_reference_library` by enabling RLS and adding a SELECT policy, but never created the table. The generated Supabase `Database` type supplies the complete observable row shape:

- `id: string`, optional on INSERT, which evidences a database default;
- `critical_notes: string | null`;
- `expected_logos: string | null`;
- `factory_codes: string[] | null`;
- `master_image_url: string | null`;
- `name: string | null`;
- `pop_number: string | null`;
- `release_year: number | null`;
- no relationships.

The only runtime read selects `master_image_url` and `release_year`, filtering by `pop_number` and `name`. Later migrations add RLS policies and grants but no columns or constraints.

## Repair

The first migration that referenced the missing table now creates it with exactly those eight columns: UUID primary key with `gen_random_uuid()` and seven nullable columns using the generated type's direct PostgreSQL equivalents. No unique constraints, foreign keys, timestamps, indexes, data, or inferred business rules were added.

This is a historical baseline repair because a new later migration cannot make an already-failing clean replay reach the repair. `CREATE TABLE IF NOT EXISTS` avoids changing a database where the live-created table already exists; before production promotion, the live table must still be compared column-by-column with this compatibility definition.

## Data and rollback

The repair is non-destructive and inserts, updates, and deletes no rows. On an environment created solely from the repaired chain, rollback is:

```sql
DROP TABLE IF EXISTS public.pop_reference_library;
```

Do not run that rollback against an existing/live environment because the table may contain live-created reference data. For an existing environment, the historical repair is a no-op and requires no rollback.
