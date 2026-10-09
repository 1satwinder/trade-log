---
name: db-migration
description: Lands a database change in trade-log end to end - Drizzle schema edit, drizzle-kit generate, renaming into supabase/migrations, grants, row level security, policies, pgTAP tests and docs. Use when adding or changing a table, column, index, enum, constraint, trigger, function, grant or RLS policy, or when the user mentions a migration, schema change, Drizzle, drizzle-kit, supabase db reset or RLS.
---

# Database migration

Every schema change ships as one file in `supabase/migrations/`, applied by the Supabase CLI
only. Drizzle generates DDL; it never applies anything. A table never exists without its
grants, RLS and policies, so they go in the same file as the table.

Also read the `supabase-postgres-best-practices` skill before writing SQL.

## Pick the path

- **Tables, columns, indexes, enums, check constraints, foreign keys** go through the
  Drizzle path, because `server/db/schema.ts` is the source of truth for them.
- **Functions, triggers, grants and policies only** (for example the signup trigger) go
  through the hand-written path. Drizzle cannot express them, and its snapshot doesn't
  record them.

## Drizzle path

```
- [ ] 1. Edit server/db/schema.ts
- [ ] 2. npm run db:generate
- [ ] 3. Move and rename the SQL into supabase/migrations/
- [ ] 4. Normalise the generated SQL
- [ ] 5. Append grants, RLS and policies (Part 2)
- [ ] 6. Verify
- [ ] 7. Tests
- [ ] 8. Docs
```

1. **Schema.** Plural `snake_case` table names (`casing: 'snake_case'` maps the camelCase
   keys). Copy `org_id` onto every tenant-owned table. Use `numeric` for money,
   `timestamptz` for time, and a named `check` for every domain rule. Add an index for
   every column a policy filters on, and for every foreign key not covered by a primary
   key or unique constraint.
2. **Generate.** `npm run db:generate` writes `server/db/generated/NNNN_<random>.sql` and
   updates `server/db/generated/meta/`. Commit `meta/`; drizzle-kit diffs against the
   snapshot there, not against the migration files. Never edit `meta/` by hand.
3. **Move and rename** (required, not optional):
   ```bash
   mv server/db/generated/NNNN_*.sql \
     supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<verb>_<subject>.sql
   ```
   Name it `<verb>_<subject>`, for example `add_trades_policies` or `create_invitations`.
4. **Normalise.** Lowercase the SQL keywords, unquote identifiers (they are all lowercase
   already), and drop the `--> statement-breakpoint` markers. Give the file a header
   comment explaining what it contains. Mark the generated section as Part 1 and the
   hand-written section as Part 2, as in
   `supabase/migrations/20260927170337_create_core_tables.sql`.
5. **Part 2.** Follow [templates.md](templates.md) to write the grants, RLS, policies and
   triggers.
6. **Verify.** See below.
7. **Tests.** See below.
8. **Docs.** Update `docs/data-model.md` (tables, columns, indexes, grants), and update the
   ER diagram in `docs/database-architecture.md` if a table or relationship changed.

## Hand-written path

```bash
npx supabase migration new <verb>_<subject>
```

Write the SQL using [templates.md](templates.md), then verify, test and update the docs
exactly as in steps 6 to 8 of the Drizzle path. Don't run `db:generate` for this path.

## Verify

Run all of these. A failure blocks the change.

```bash
npm run db:reset                    # rebuilds from scratch; restart is not enough
npm run test:db                     # pgTAP
npx supabase db advisors --local    # security and performance lints
npm run db:generate                 # must say "No schema changes"
```

If `db:generate` produces a file, `schema.ts` and the migrations have drifted. Fix the
drift; don't commit that file. From M5 onwards, also run `npm run db:types` to refresh
`app/types/database.types.ts`.

## Tests

The rule is: new policy, new test, with no exceptions.

- `supabase/tests/rls_catalogue.test.sql` already fails for a new table that is missing
  RLS, policies or grant hygiene. Don't duplicate those checks.
- Add tenant-isolation assertions for the new surface. Use
  `supabase/tests/rls_tenancy.test.sql` for core tables, or a new
  `supabase/tests/<subject>.test.sql` for a separate feature. The skeleton is in
  [templates.md](templates.md).
- Update `select plan(N)` to match the exact number of assertions.
- Then prove the test bites. Loosen the new policy by hand (for example `using (true)`),
  run `npm run db:reset && npm run test:db`, confirm it goes red, and revert.

## Traps already hit in this repo

- `auto_expose_new_tables = false` and other `config.toml` changes reach the database
  only through `db reset`. `supabase stop` and `supabase start` keep the old volume.
- Default privileges still include `truncate`, which ignores RLS. Always `revoke all`
  before granting anything.
- New functions are executable by `public`, so revoke from `public, anon`, not only from
  `anon`.
- `(select helper())` is cached per statement (an InitPlan) only when the helper takes
  no column from the current row. Return a set of ids instead of taking `org_id`.
- A `select` policy doesn't stop cross-tenant inserts. Every write policy needs a
  `with check` that pins `org_id`, and `user_id` where it applies.
- Under RLS, another user's row is invisible rather than forbidden. An update or delete on
  it affects zero rows and raises no error, so assert `is_empty(... returning id)`.
- Prefer a composite foreign key over a policy subquery for cross-table ownership. For
  example, `trades(account_id, org_id, user_id)` references
  `accounts(id, org_id, user_id)`.
- A failing trigger on `auth.users` blocks every signup with "Database error saving new
  user". Test it with pgTAP before trying it in the app.
- Once staging has applied a migration, never edit it; write a new one. Before it's
  pushed anywhere, editing it and running `db reset` is fine.

## Hard rules (from AGENTS.md)

- No dashboard edits. Every schema change goes in a migration file.
- RLS and per-operation policies go in the same migration as the table.
- SQL keywords are lowercase.
- Migrations are committed together with the code that depends on them.
