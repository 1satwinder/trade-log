# Phase 1 — Auth and the core domain

Record of how Phase 1 is being built. Progress lives in [roadmap.md](../roadmap.md); this
file holds the order, mechanism and traps the roadmap's checklist omits. It is updated at
each milestone checkpoint.

## Scope changes made up front

- **Minimal organisations move in from Phase 2** (ADR-0008). Every policy resolves tenancy
  through `memberships`, so it cannot wait.
- **One signup trigger provisions each user** (ADR-0009): profile, personal org, owner
  membership and a default account, in the signup's own transaction.
- **RLS tests are pgTAP** (ADR-0010), with no community test helpers.
- **Explicit grants on every table** (ADR-0011), found while starting: Supabase no longer
  exposes new `public` tables to the Data API by default, and staging will be a new
  project.
- **`trades.stop_price`** added, since an R multiple needs the initial risk.
- **Pages at `/app/trades`** for now; they move under `/app/[org]/` in Phase 2.

## Milestones

| Milestone                        | State   |
| -------------------------------- | ------- |
| M0 Housekeeping                  | done    |
| M1 Tables as code                | done    |
| M2 Authorisation in the database | done    |
| M3 Signup trigger and seed       | pending |
| M4 Pure calculations             | pending |
| M5 Auth in the app               | pending |
| M6 Trades API                    | pending |
| M7 Pages                         | pending |
| M8 Staging and Render            | pending |
| M9 Close-out                     | pending |

## M0 to M2 — what was built

- `zod` 4.6.5 and `vitest` 5.0.2 installed; scripts `db:generate`, `db:types`, `test`,
  `test:db` added.
- [supabase/config.toml](../../supabase/config.toml): `site_url` is now
  `http://localhost:3000`, the only redirect URL is `http://localhost:3000/confirm`, and
  `auto_expose_new_tables = false`.
- [server/db/schema.ts](../../server/db/schema.ts): three enums and seven tables, with
  check constraints and every index from [data-model.md](../data-model.md).
- [supabase/migrations/20260927170337_create_core_tables.sql](../../supabase/migrations/20260927170337_create_core_tables.sql):
  the generated DDL, then the `private` schema, helpers, the `updated_at` trigger, grants,
  RLS and 20 policies, in one file.
- [supabase/tests/rls_catalogue.test.sql](../../supabase/tests/rls_catalogue.test.sql) (9
  assertions) and [supabase/tests/rls_tenancy.test.sql](../../supabase/tests/rls_tenancy.test.sql)
  (35 assertions).

## Decisions taken while building

- **`auto_expose_new_tables` only applies to a freshly initialised database.** Restarting
  the stack restored the old volume with the old default privileges; only
  `supabase db reset` picked the setting up.
- **The remaining default privileges include `truncate`.** Even with auto-expose off, `anon`
  and `authenticated` keep `truncate`, `references`, `trigger` and `maintain` on new
  tables. `truncate` ignores RLS, so each migration revokes all before granting.
- **`is_org_manager(org_id)` became `my_managed_org_ids()`.** Wrapping a call in
  `(select …)` only makes it an InitPlan when it takes no column of the current row. A
  helper that takes `org_id` is a correlated subquery, re-run per row. Returning a set of
  org ids keeps every policy call argument-free.
- **No API role has usage on the `private` schema.** Policies still work, because the
  function in a stored policy is resolved when the policy is created; only execute is
  checked at run time. So `authenticated` cannot even name the schema in ad hoc SQL.
- **`trades` has a single composite foreign key** on `(account_id, org_id, user_id)`. It
  replaces a policy subquery that would otherwise check that the account is the caller's,
  and carries cascades from both `organizations` and `auth.users`.
- **Tests assert outcomes, not mechanisms.** Granting update on `trades.user_id` by hand
  did not turn the suite red, because the update policy's `with check` still refused the
  reassignment. That is defence in depth working, so descriptions were reworded to name
  the guarantee rather than the layer.
- **Drizzle output is unquoted as well as lowercased.** Every identifier is already
  lowercase snake_case, so the quotes carried nothing.

## Verified

- `npm run db:reset` rebuilds from scratch and applies the migration cleanly.
- `npm run db:generate` reports "No schema changes" afterwards.
- `npm run test:db` passes 44 of 44. Loosening the accounts select policy to
  `using (true)` by hand failed tests 2 and 31, as it should.
- `supabase db advisors --local` reports no issues.
- Anonymous REST `GET /rest/v1/trades` returns `42501 permission denied`, and
  `POST /rest/v1/rpc/my_org_ids` returns `PGRST202`, because `private` is not exposed.
- `npm run lint` and `npm run typecheck` are clean.

## Left for M3 onwards

- The signup trigger, and its test.
- `seed.sql`: `db reset` currently warns that it is missing.
- The trades read policy exercise from the plan's M2 "try it" step.
