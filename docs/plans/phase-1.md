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
- `trades.stop_price` added, since an R multiple needs the initial risk.
- **Pages at** `/app/trades` for now; they move under `/app/[org]/` in Phase 2.

## Milestones

| Milestone                        | State                               |
| -------------------------------- | ----------------------------------- |
| M0 Housekeeping                  | done                                |
| M1 Tables as code                | done                                |
| M2 Authorisation in the database | done                                |
| M3 Signup trigger and seed       | built                               |
| M4 Pure calculations             | built                               |
| M5 Auth in the app               | built                               |
| M6 Trades API                    | built                               |
| M7 Pages                         | built                               |
| M8 Staging and Render            | done                                |
| M9 Close-out                     | pending: checks and security review |

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

- `auto_expose_new_tables` **only applies to a freshly initialised database.** Restarting
  the stack restored the old volume with the old default privileges; only
  `supabase db reset` picked the setting up.
- **The remaining default privileges include** `truncate`**.** Even with auto-expose off, `anon`
  and `authenticated` keep `truncate`, `references`, `trigger` and `maintain` on new
  tables. `truncate` ignores RLS, so each migration revokes all before granting.
- `is_org_manager(org_id)` **became** `my_managed_org_ids()`**.** Wrapping a call in
  `(select …)` only makes it an InitPlan when it takes no column of the current row. A
  helper that takes `org_id` is a correlated subquery, re-run per row. Returning a set of
  org ids keeps every policy call argument-free.
- **No API role has usage on the** `private` **schema.** Policies still work, because the
  function in a stored policy is resolved when the policy is created; only execute is
  checked at run time. So `authenticated` cannot even name the schema in ad hoc SQL.
- `trades` **has a single composite foreign key** on `(account_id, org_id, user_id)`. It
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
- **Display name from** `full_name` **metadata, else the email local part, truncated to 80.**
  The truncation is what keeps "'s journal" inside the 100-character check on
  `organizations.name`; without it, a long name blocks the signup.
- **The seed renames Maya's trigger-created org into the Demo Desk** rather than creating
  a second org. Sam and Priya keep empty personal orgs, so the demo shows a user who
  belongs to two organisations.
- **Seed users are inserted with every GoTrue token column set to** `''`**.** GoTrue reads
  them into non-nullable strings, so `null` breaks password login for those users.
- **Trades are drawn in R multiples under** `setseed(0.42)`, so the numbers are plausible
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

- **PostgREST does not return** `numeric` **as strings.** The plan and `data-model.md` said
  it did. It sends exact JSON number literals, and `JSON.parse` makes them floats, so the
  trap is float noise, not parsing. Both documents are corrected.
- **Breakevens are excluded from the win rate**, and R uses net P&L, so both always agree
  with the sign of the P&L (ADR-0012).
- **Rounding is** `toPrecision(15)`**, then half away from zero.** Plain
  `Math.round(x * 100) / 100` turns 1.005 into 1.00, because `1.005 * 100` is
  `100.49999999999999`.
- **Fields are snake_case, mirroring the row,** so M6 and M7 can pass rows straight in.
  Once M5 generates database types, `TradeForStats` can become a `Pick` of the row type.
- `round` **became** `roundTo`**,** because Nuxt makes every `shared/utils` export a global
  in both the app and the server.

## M4 — verified

- `npm test` passes 29 of 29. Swapping in naive rounding failed 2 tests, and counting
  breakevens in the denominator failed another 2.
- `tradeStats` on Sam's trades, fetched over REST, gives a total P&L of 268.67 and 5 wins
  in 12 closed trades, matching the same calculation in SQL.
- `npm run lint`, `npm run typecheck` and `prettier --check` are clean.

## M5 and M6 — scope changes agreed before building

- **Built together**, with pages (M7) after a checkpoint.
- **Magic link plus a password form.** The magic link is the main path; the password
  form serves the seeded demo users, who all have `demo-password`, and the one-click demo
  login in [demo-script.md](../demo-script.md).
- `requireOrgRole` **built now** to match the roadmap, though its first caller is the
  `/app/[org]` routing in Phase 2. Trade create needs no org check of its own: the org
  comes from the caller's own account, and the insert policy checks membership.
- **A placeholder** `/app` **page and** `GET /api/me`, so that M5 proves the server-rendered
  cookie path end to end rather than leaving it to M7.

## M5 — what was built

- [nuxt.config.ts](../../nuxt.config.ts): the guard is on, with `include: ['/app(/*)?']`
  and `saveRedirectToCookie`, and `types` points at the generated file.
- [shared/types/database.types.ts](../../shared/types/database.types.ts): generated by
  `npm run db:types`, which now runs Prettier on its output.
- [app/composables/useAuth.ts](../../app/composables/useAuth.ts), with
  [login.vue](../../app/pages/login.vue), [confirm.vue](../../app/pages/confirm.vue),
  [app/index.vue](../../app/pages/app/index.vue) and sign-out in the default layout.
- [server/utils/require-user.ts](../../server/utils/require-user.ts),
  [require-org-role.ts](../../server/utils/require-org-role.ts) and
  [server/api/me.get.ts](../../server/api/me.get.ts).
- ADR-0013 and [flows/magic-link-login.md](../flows/magic-link-login.md); the login
  sequence in [architecture.md](../architecture.md) is corrected.

## M5 — decisions taken while building

- **The browser exchanges the code, not Nitro.** The module adds an `ssr: false` route
  rule for the callback, and its client plugin awaits `getSession()` during start-up,
  which is when `auth-js` exchanges `?code=`. So the session already exists, or the
  exchange has already failed, before `/confirm` mounts. The architecture diagram drew a
  server-side exchange and is fixed.
- `serverSupabaseUser` **returns claims via** `getClaims()`**.** Local tokens are ES256, so
  verification is a signature check against public keys cached for ten minutes,
  process-wide, with no call to Auth. `requireUser` maps `sub` to `id` and turns the
  module's status-less error into a 401 (ADR-0013).
- **Sign-out uses** `scope: 'local'`**.** The `auth-js` default is `global`, which signs the
  user out on every device.
- `requireOrgRole` **answers 404 to a non-member and 403 to a member without the role.**
  The membership is read through RLS, so a non-member cannot tell that the org exists.
- **Generated types live in** `shared/types/`**, not** `app/types/`**.** The app, the server and
  `shared/utils` all need them, and `shared/types` is auto-imported on both sides.
  `TradeForStats` is now a `Pick` of `Tables<'trades'>`.
- **The local** `email_sent = 2` **per hour limit does not apply to Mailpit.** It only
  applies once custom SMTP is enabled; three links in a row all arrived. It is still the
  M8 trap on staging's built-in sender.

## M6 — what was built

- [shared/schemas/trade.ts](../../shared/schemas/trade.ts): `tradeCreateSchema`,
  `tradeUpdateSchema` and `tradeIdParamsSchema`, with 11 Vitest cases.
- `server/api/trades/`: `index.get`, `index.post`, `[id].get`, `[id].patch`,
  `[id].delete`; and `server/api/accounts/index.get`.
- `mapDatabaseError` in [server/utils/errors.ts](../../server/utils/errors.ts).
- `withTradeStats` in `shared/utils/trade-stats.ts`, so each trade in a response carries
  `realised_pnl` and `r_multiple`.

## M6 — decisions taken while building

- **Schemas are strict objects.** A body with `user_id` or `org_id` gets a 400 instead
  of having those keys quietly stripped, so a client bug or a probe is visible.
- **Create only accepts the caller's own account.** Managers can read other members'
  accounts, so "an account the caller can see" was not enough. The composite foreign key
  would also reject it, as a less helpful 422.
- **Closing a trade needs its exit in the same PATCH; reopening clears it.** Zod handles
  the rules a patch can decide by itself. The rest, such as an exit price on a trade that
  stays open, reaches the check constraint and answers 422.
- **Zod enums read** `Constants` **from the generated types**, so they cannot drift from the
  Postgres enums.
- **The trades list has no user or org filter.** The select policy decides, so Maya
  gets all 44 Demo Desk trades and Sam gets his 14. The accounts list does filter to
  the caller, as a product choice, because those are the only accounts you can log into.
- `z.uuid()` **is strict RFC 9562.** The seed's fixed user ids (`5eed0000-0000-0000-…`)
  fail it, because their version digit is 0. No route validates a user id, and every
  other id comes from `gen_random_uuid()`, but `z.guid()` is the fallback if that changes.

## M5 and M6 — verified

- `npm test` passes 42 of 42; `npm run lint` and `npm run typecheck` are clean, and a
  planted type error in `server/` and `shared/` was caught.
- Signed out: every API route answers 401, and `/app` answers 302 to `/login`.
- In the browser: password sign-in as Sam, then magic-link signup of a new address
  through Mailpit, then a magic-link sign-in as Sam that returned to the page the guard
  had bounced him from. The `/app` HTML from the server already contained the user's name
  and organisations. A reused link showed "Email link is invalid or has expired" and kept
  the current session.
- Through the Nitro routes with seed users' cookies: Sam, Priya and Maya list 14, 14 and
  44 trades. Sam's create gets 201 with `org_id` and `user_id` filled in by the server;
  with `user_id` in the body, 400; into Priya's account, 422. Priya gets 404 on Sam's
  trade for GET, PATCH and DELETE. Maya gets 200 on GET and 404 on PATCH. Closing
  without an exit is 400, an exit on an open trade is 422, closing properly gives P&L 98
  and 1.96R, DELETE is 204, then GET is 404. A malformed id is 400, a forged cookie 401.
- `requireOrgRole`, through a temporary route since removed: Sam as owner of his journal
  gets 200, as a member of the Demo Desk 403, and Priya on Sam's journal 404.
- A deleted user's leftover cookie still passed `requireUser`; `/api/trades` returned
  `[]` and `/api/me` 404, as ADR-0013 predicts.
- Probe users, their orgs and Mailpit messages were removed afterwards.

## M7 — scope agreed before building

- **Managers see the whole list, with a Trader column and an "Only mine" toggle.** Maya
  can read 44 trades but change only her 16, so edit and delete are hidden on the rest,
  and the stats strip covers whatever is shown.
- **M8 is split.** The Dockerfile and a local run of the image are built now; the
  Supabase project and the Render service need your accounts, so they follow the runbook
  below.

## M7 — what was built

- Pages [trades/index.vue](../../app/pages/app/trades/index.vue),
  [new.vue](../../app/pages/app/trades/new.vue) and
  [[id].vue](../../app/pages/app/trades/[id].vue) (view, edit, delete with a confirm
  modal), plus [error.vue](../../app/error.vue) and a Trades link in the layout.
- `app/components/trades/`: `StatsStrip`, `Table`, `Form` and `Details`.
- [app/utils/trade-form.ts](../../app/utils/trade-form.ts): the form's own Zod schema and
  the conversion from form strings to request bodies, with 19 Vitest cases;
  `format.ts` and `fetch-error.ts` beside it.
- The list and detail routes now return `trader_name`, and the detail route embeds the
  account's name and currency. Their shapes are `TradeResponse` and
  `TradeDetailResponse` in [shared/types/trade.ts](../../shared/types/trade.ts).
- `@iconify-json/lucide`, so Nuxt UI's icons are bundled instead of fetched from the
  Iconify API at runtime.
- [flows/trade-list-render.md](../flows/trade-list-render.md).

## M7 — decisions taken while building

- **Trader names come from a second query, not an embed.** `trades.user_id` references
  `auth.users`, not `profiles`, so PostgREST has no relationship to follow. A foreign key
  to `profiles` would allow the embed, but it is a schema change made only for a join,
  and one `in (...)` query per list costs a single round trip.
- **Form fields are strings.** `UInput` bound to a number turns the text `1.0` back into
  `1` as you type, so `1.05` cannot be entered. The form's schema validates strings, and
  `toTradeCreateBody` converts once.
- **An edit sends only the fields that changed.** The `datetime-local` input shows minutes,
  so resending an untouched `entry_at` would quietly drop its seconds. A test proves an
  unchanged form produces an empty patch.
- **Dates use** `<NuxtTime>` **and numbers use a fixed locale.** The server and the browser
  can disagree on timezone and locale, and a different string at hydration is a mismatch.
  `<NuxtTime>` rewrites each date in the browser just before hydration.
- **"Only mine" is a query string**, so the server renders the filtered view, and the
  toggle is a link that works with JavaScript off.
- **A malformed id in the URL shows the 404 page.** The API answers 400 for it, but from
  the reader's side the trade simply does not exist.
- **App code imports** `shared/` **through** `#shared`**.** A relative import passed in dev and
  failed `nuxt build`; `vitest.config.ts` now maps the alias for tests.

## M7 — verified

- `npm test` passes 61 of 61; lint, typecheck and Prettier are clean; `nuxt build`
  succeeds.
- Server-rendered HTML through `curl`: Sam's list has 14 rows and a net P&L of +268.67,
  matching M4's SQL check. Maya's has 44 rows and a Trader column, and 16 with
  `?mine=1`. Maya opening Sam's trade sees "Logged by Sam Okafor" and no Edit button.
  Priya gets a 404 page for it. Signed out, `/app/trades` answers 302 to `/login`.
- In the browser as a magic-link user: empty state, field errors on an empty submit,
  then create, close with an exit (+102.60, +2.01R, as calculated by hand), and delete.
  No console warnings or errors on full loads or client navigation.
- From the Docker image in UTC: the HTML said 4:21 PM, the browser in New York showed
  12:21 PM, and Vue raised no hydration warning.

## M8 — what was built

- [Dockerfile](../../Dockerfile) and [.dockerignore](../../.dockerignore): a two-stage
  build on `node:22-slim` that copies only `.output` into the runtime stage, 236 MB.
  `npm ci --ignore-scripts`, because `postinstall` runs `nuxt prepare` before the source
  is copied in.
- Run locally with `--network host` against the local stack: `/api/health` answered ok,
  Sam's list rendered, Priya got 404 on Sam's trade, and `siteUrl` in the payload was the
  runtime value. So one image, configured at start, holds.

## M8 — runbook for the cloud steps

1. **Put the repo on GitHub.** Render deploys from a Git provider, and this repo has no

   remote yet.

2. **Create the Supabase project** `tradelog-staging` in the dashboard, in the region

   nearest the Render region you will pick. Keep the database password in a password
   manager. Touch project settings only, never the schema.

3. **Push the migrations.** `npx supabase login`, then

   `npx supabase link --project-ref <ref>`, then `npx supabase db push --dry-run` and,
   if it lists the two migrations, `npx supabase db push`. Staging is never seeded.

4. **Create the Render web service** from the repo, with the Docker runtime and health

   check path `/api/health`. The name you choose fixes the URL,
   `https://<name>.onrender.com`. Environment variables:
   - `NUXT_PUBLIC_SUPABASE_URL`: `https://<ref>.supabase.co`
   - `NUXT_PUBLIC_SUPABASE_KEY` and `NUXT_SUPABASE_SECRET_KEY`: from Project Settings,
     API Keys
   - `NUXT_DATABASE_URL`: the **session pooler** string from Connect, port 5432. The
     direct connection is IPv6-only and Render cannot reach it.
   - `NUXT_PUBLIC_SITE_URL`: the Render URL

5. **Point Auth at Render.** In Authentication, URL Configuration, set the site URL to

   the Render URL and add `<Render URL>/confirm` as the only redirect URL. Without it,
   magic links fall back to the site URL and skip `/confirm`.

6. **Check it.** `/api/health`, then two real signups by magic link, each logging a

   trade, and neither seeing the other's. The built-in sender allows only a few emails
   an hour, so space the signups out.

Traps to watch on staging:

- **JWT signing keys.** If the project still signs with the legacy shared secret,
  `getClaims()` cannot verify locally and calls Auth on every request instead (ADR-0013).
  Check Project Settings, JWT Keys; new projects should already use asymmetric keys.
- **Free instances sleep** after about 15 minutes idle and take up to a minute to wake,
  so the first request after a pause, or a magic link opened later, is slow.
- `config.toml` **does not reach staging.** Its `[auth]` settings are local only, which
  is why step 5 is done in the dashboard.

## M8 — cloud steps, as run

- Staging Supabase project `tradelog-staging` (`us-east-2`) with both migrations pushed and
  no seed. The Render service `trade-log-t4ul` runs the Docker image, and the Auth site
  URL and redirect list point at `https://trade-log-t4ul.onrender.com`.
- JWT signing keys on staging are asymmetric, so `getClaims()` verifies locally and the
  ADR-0013 trap does not apply.

## M8 — what went wrong on staging

- **Magic links opened `localhost:3000/?code=…`.** The Supabase site URL was still the
  default. `emailRedirectTo` is only honoured when it is on the redirect allow-list, and
  otherwise Supabase falls back to the site URL. Step 5 fixes it, and a link already sent
  keeps the old target.
- **`/api/health` returned 500 while `/api/trades` worked.** The two use different paths:
  trades go through PostgREST over HTTPS with the user's JWT, and health goes through
  Drizzle on `NUXT_DATABASE_URL`. A working trades page proves nothing about the database
  URL. Render's log showed Postgres error `28P01`, password authentication failed, so the
  connection string carried the wrong password. The ORM tab's string also uses port 6543,
  the transaction pooler, and the runbook needs the session pooler on 5432.
- **A password with `@` in a connection string** must be percent-encoded, or it parses as
  a different host. Resetting to letters and digits avoids the whole class.

## M8 — verified

- `GET /api/health` answers `{"status":"ok","database":"postgres",…}`, and 25 requests in
  a row all returned 200, so the pooled connections and prepared statements hold.
- Signed out, `/app/trades` answers 302 and `/api/trades` answers 401.
- Magic-link sign-in works on the Render URL. Two separate accounts each logged trades and
  neither could see the other's.
- The staging secret key is configured but unused, since no route calls
  `serverSupabaseServiceRole` yet (see invitations in Phase 2).

## M9 — what is left

- Run the Review checklist in [security.md](../security.md) over the Phase 1 routes,
  with an answer and a line of evidence for each item.
- Run `npm run lint`, `typecheck`, `test`, and `db:reset` with `test:db` and
  `supabase db advisors --local` one last time on the final tree.
- Check [data-model.md](../data-model.md) and [architecture.md](../architecture.md)
  against what shipped, in particular the 5432 and 6543 notes for the admin client.
- Write the Phase 1 entries into [learning-log.md](../learning-log.md), and commit.

## Left for later

- The trades read policy exercise from the plan's M2 "try it" step.
- The seed's share link, once `share_links` exists in Phase 3.
- Moving `/app` under `/app/[org]/` in Phase 2, which gives `requireOrgRole` its first
  caller.
- Pagination of the trade list, once a journal outgrows one screen.
- A tag picker on the trade form; `tags` and `trade_tags` have policies but no UI yet.
