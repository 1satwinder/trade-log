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
| M3 Signup trigger and seed       | built   |
| M4 Pure calculations             | built   |
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

## M3 — what was built

- [supabase/migrations/20261010002421_add_signup_trigger.sql](../../supabase/migrations/20261010002421_add_signup_trigger.sql):
  `private.handle_new_user()` and the `on_auth_user_created` trigger. A table-free
  migration, so it stands alone.
- [supabase/tests/signup_trigger.test.sql](../../supabase/tests/signup_trigger.test.sql)
  (18 assertions): one of each row per signup, plus the inputs that could otherwise block
  a signup.
- [supabase/seed.sql](../../supabase/seed.sql): the Demo Desk with Maya (owner), Sam and
  Priya (members), 44 trades, five tags.

## M3 — decisions taken while building

- **Slug is the email local part plus six random hex characters**, retried on collision
  with `on conflict (slug) do nothing returning id` in a loop of five. The suffix stops a
  slug revealing that a name is taken; the loop avoids exception handling, which costs a
  savepoint per attempt in PL/pgSQL.
- **Display name from `full_name` metadata, else the email local part, truncated to 80.**
  The truncation is what keeps "<name>'s journal" inside the 100-character check on
  `organizations.name`; without it, a long name blocks the signup.
- **The seed renames Maya's trigger-created org into the Demo Desk** rather than creating
  a second org. Sam and Priya keep empty personal orgs, so the demo shows a user who
  belongs to two organisations.
- **Seed users are inserted with every GoTrue token column set to `''`.** GoTrue reads
  them into non-nullable strings, so `null` breaks password login for those users.
- **Trades are drawn in R multiples under `setseed(0.42)`**, so the numbers are plausible
  for a trading journal and identical after every reset.

## M3 — verified

- `npm run test:db` passes 62 of 62. Removing the account insert from the live function
  failed tests 6, 15 and 16. Test 16 originally used `lives_ok` and stayed green, because
  inserting from zero accounts inserts zero rows without error; it now asserts that a row
  came back.
- A real `POST /auth/v1/signup` through GoTrue provisioned all four rows, confirming that
  `supabase_auth_admin` needs no execute grant for the trigger to fire.
- Password login works for the seed users. Over REST, Sam and Priya each see only their
  own 14 trades, and Maya sees all 44.
- `supabase db advisors --local` reports no issues, and `npm run db:generate` reports no
  schema changes.

## M4 — what was built

- [shared/utils/trade-stats.ts](../../shared/utils/trade-stats.ts): `realisedPnl`,
  `tradeOutcome`, `rMultiple`, `tradeStats` and `roundTo`, taking objects shaped like a
  trades row.
- [shared/utils/trade-stats.test.ts](../../shared/utils/trade-stats.test.ts): 29 Vitest
  cases, colocated so they are typechecked with `shared/`.
- ADR-0012 records the definitions.

## M4 — decisions taken while building

- **PostgREST does not return `numeric` as strings.** The plan and `data-model.md` said
  it did. It sends exact JSON number literals, and `JSON.parse` makes them floats, so the
  trap is float noise, not parsing. Both documents are corrected.
- **Breakevens are excluded from the win rate**, and R uses net P&L, so both always agree
  with the sign of the P&L (ADR-0012).
- **Rounding is `toPrecision(15)`, then half away from zero.** Plain
  `Math.round(x * 100) / 100` turns 1.005 into 1.00, because `1.005 * 100` is
  `100.49999999999999`.
- **Fields are snake_case, mirroring the row,** so M6 and M7 can pass rows straight in.
  Once M5 generates database types, `TradeForStats` can become a `Pick` of the row type.
- **`round` became `roundTo`,** because Nuxt makes every `shared/utils` export a global
  in both the app and the server.

## M4 — verified

- `npm test` passes 29 of 29. Swapping in naive rounding failed 2 tests, and counting
  breakevens in the denominator failed another 2.
- `tradeStats` on Sam's trades, fetched over REST, gives a total P&L of 268.67 and 5 wins
  in 12 closed trades, matching the same calculation in SQL.
- `npm run lint`, `npm run typecheck` and `prettier --check` are clean.

## Left for M5 onwards

- The trades read policy exercise from the plan's M2 "try it" step.
- The seed's share link, once `share_links` exists in Phase 3.
- `TradeForStats` as a `Pick` of the generated row type, once `npm run db:types` runs.
