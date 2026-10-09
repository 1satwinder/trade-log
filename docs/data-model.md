# Data model

Owner of the schema, indexes, policies and storage layout. Drizzle defines the tables;
policies, helper functions, triggers and grants are hand-written SQL. Everything is
applied by the Supabase CLI.

## Tables

Phase 1 built `profiles`, `organizations` (without the billing columns, which are Phase 4),
`memberships`, `accounts`, `trades`, `tags` and `trade_tags`. The rest is still planned.

```sql
profiles(id uuid pk -> auth.users, display_name, avatar_url, created_at)

organizations(id uuid pk, name, slug unique, plan, plan_status, seat_limit,
              stripe_customer_id, stripe_subscription_id, created_at)

memberships(org_id uuid, user_id uuid, role org_role, created_at,
            primary key (org_id, user_id))

invitations(id uuid pk, org_id, email, role, token_hash, expires_at,
            accepted_at, invited_by, created_at)

accounts(id uuid pk, org_id, user_id, name, currency, starting_balance, created_at)

trades(id uuid pk, org_id, account_id, user_id, symbol, side trade_side,
       quantity, entry_price, exit_price, stop_price, entry_at, exit_at, fees,
       status trade_status, thesis, created_at, updated_at,
       foreign key (account_id, org_id, user_id) -> accounts(id, org_id, user_id))

tags(id uuid pk, org_id, name, color, unique (org_id, name))
trade_tags(trade_id, tag_id, primary key (trade_id, tag_id))

trade_attachments(id uuid pk, org_id, trade_id, storage_path, byte_size, created_at)

share_links(id uuid pk, org_id, account_id, slug unique, expires_at,
            revoked_at, created_by, created_at)

quote_cache(symbol, as_of date, close numeric, primary key (symbol, as_of))

stripe_events(id text pk, type, processed_at)
```

Enums: `org_role` is `owner | admin | member`; `trade_status` is `open | closed`;
`trade_side` is `long | short`.

Types: prices and quantities are `numeric(20, 8)`, because forex quotes need five decimals
and crypto sizes eight; money in the account currency (`fees`, `starting_balance`) is
`numeric(16, 2)`. Never `float`, which cannot represent 0.1 exactly. PostgREST returns
`numeric` as a string, so parsing happens in one place in TypeScript.

## Design notes

**`org_id` is denormalised onto every child table.** This is intentional. It gives every
policy a single cheap predicate and avoids joining upward through `accounts` to establish
tenancy. The cost is that inserts must set it correctly, which is enforced by policy
`with check` clauses rather than trust.

**A trade's org and owner are forced to match its account's.** `trades` has one foreign
key, on `(account_id, org_id, user_id)`, targeting a unique constraint on the same three
columns of `accounts`. So a trade cannot be written into another org's account or a
colleague's account, and the policies do not have to re-check the account. The same key
carries the cascade from `organizations` and `auth.users` through `accounts`.

**`stop_price` is optional.** It is the initial risk, and an R multiple is undefined
without it, so trades logged without a stop simply have no R multiple.

**Integrity rules live in check constraints.** An open trade has no exit price or exit
time; a closed one has both, and exits cannot precede entries. Quantities and prices are
positive, fees non-negative. The database refuses bad rows from every path, including the
Drizzle admin client and the dashboard.

**P&L is computed, not stored.** Realised P&L is a function of quantity, prices, side and
fees, so it is derived in a view or in query-time SQL. Storing it invites drift. The
Vitest unit tests cover the calculation directly.

**`quote_cache` is a cache, not a source of truth.** It exists so the equity curve and
open-position marks do not hammer the price provider, and it is safe to truncate.

**`stripe_events` exists only for idempotency.** Stripe retries webhooks; inserting the
event id first and ignoring conflicts is what makes the handler safe to run twice.

## Indexes

- `memberships(user_id, org_id)` — powers the "which orgs am I in" lookup every policy
  makes
- `memberships` primary key `(org_id, user_id)` — also serves the team page's reverse
  lookup, so no separate `memberships(org_id)` index
- `trades(org_id, user_id)` — the member visibility predicate
- `trades(org_id, entry_at desc)` — the default list ordering, served from the index
- `trades(account_id)` — the composite foreign key, and cascades from `accounts`
- `accounts` unique `(org_id, user_id, name)` — the visibility predicate, via its prefix
- `accounts` unique `(id, org_id, user_id)` — exists only as the composite key's target
- `accounts(user_id)` — cascades from `auth.users`
- `tags` unique `(org_id, name)` — every per-org tag lookup and the policies
- `trade_tags(tag_id)` — "which trades carry this tag"; the primary key covers the other
  direction
- `share_links(slug)` — unique, drives the public page lookup

Rules of thumb applied throughout: every column in a policy predicate is indexed, with
`org_id` at the head of composite indexes; every foreign key column is indexed, because
Postgres does not do it automatically and cascades would otherwise scan; and an index is
dropped when a primary key or unique constraint already leads with the same columns.

## Row level security

Helpers live in a `private` schema that is **not** exposed to the API. They are `stable
security definer` and always set an empty search path with fully-qualified object names,
which prevents a search-path substitution attack.

```sql
create function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.memberships where user_id = (select auth.uid());
$$;

create function private.my_managed_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.memberships
  where user_id = (select auth.uid()) and role in ('owner','admin');
$$;

create policy "trades: read own, or all if manager" on public.trades
for select to authenticated using (
  org_id in (select private.my_org_ids())
  and (user_id = (select auth.uid()) or org_id in (select private.my_managed_org_ids()))
);

create policy "trades: insert into own org and as self" on public.trades
for insert to authenticated with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);
```

Three things make this correct and fast, and all three are easy to get wrong:

1. `security definer` stops the policy recursing into the `memberships` table's own
   policies, which would otherwise cause infinite recursion or a very slow plan.
2. Wrapping calls as `(select private.helper())` and `(select auth.uid())` turns them
   into a per-statement InitPlan instead of a per-row function call. The published
   Supabase benchmarks show this difference in orders of magnitude, not percentages. It
   only works when the call takes no column of the row being checked: a helper like
   `is_org_manager(org_id)` would be a correlated subquery, re-run per row however it is
   wrapped. That is why the helpers return sets of org ids and take no arguments.
3. Explicit `to authenticated` short-circuits anonymous requests before the rest of the
   predicate is evaluated.

Postgres grants execute on every new function to `PUBLIC`, which `anon` inherits, so the
helpers revoke from `public, anon` and grant back to `authenticated` only, because policy
expressions run as the calling role. No API role has usage on the `private` schema;
policies do not need it, because a function in a stored policy is resolved when the policy
is created.

## Grants

Grants are the layer underneath RLS: they decide whether a role may touch a table at all,
and policies then decide which rows (ADR-0011). New tables get no API grants by default
(`auto_expose_new_tables = false`, matching new cloud projects), so each table's migration
revokes everything from `anon` and `authenticated` and grants back exactly what its
policies are written for:

- `anon` — nothing, until share links in Phase 3
- `profiles` — select; update on `display_name`, `avatar_url`
- `organizations` — select; update on `name`
- `memberships` — select only
- `accounts`, `trades`, `tags` — select, insert, delete; update only on user-editable
  columns, never `id`, `org_id`, `user_id` or timestamps
- `trade_tags` — select, insert, delete
- `service_role` — select, insert, update, delete on all of them

The revoke comes first because the default privileges that remain still include
`truncate`, which RLS does not apply to. A missing grant fails loudly with `42501
permission denied`; a missing policy fails silently with zero rows.

## Policy coverage checklist

RLS is enabled on every table in `public`, with no exceptions, and each table needs its
per-operation policies deliberately chosen rather than copied:

- `profiles` — read self and fellow org members; update self only
- `organizations` — read if a member; update if owner or admin
- `memberships` — read within own orgs; write only via server routes
- `invitations` — no direct client access; server routes only
- `accounts` — read own, or all within org if manager; write own
- `trades`, `trade_tags`, `trade_attachments` — mirror the `trades` visibility rule
- `tags` — read and write within own org
- `share_links` — read and write own; the public page is served by the server, not by an
  anonymous client query
- `quote_cache` — read for authenticated users; writes only from the scheduled task
- `stripe_events` — no client access at all

## Storage

One bucket, `trade-attachments`, private. Object paths are
`{org_id}/{trade_id}/{uuid}.{ext}` so a storage policy can enforce tenancy by path
prefix. Uploads and reads go through short-lived signed URLs issued by Nitro after an
ownership check. Public journal pages never expose attachments.

## Migration workflow

1. Edit `server/db/schema.ts`.
2. `npm run db:generate` produces the DDL in `server/db/generated/`.
3. `supabase migration new <verb>_<subject>` creates the timestamped file; move the
   generated SQL into it, lowercasing keywords, and delete Drizzle's `0000_*` copy. The
   rename matters: Drizzle's default naming sorts ahead of Supabase timestamps and would
   silently reorder the migration history. Keep `server/db/generated/meta/` committed:
   drizzle-kit diffs against those snapshots, not against the SQL.
4. Append the hand-written grants, RLS, policies and any functions or triggers to the
   **same** file, so that no table exists without its policies (AGENTS.md rule 3).
   Migrations that add no table, such as a trigger, can stand alone.
5. `npm run db:reset` locally to verify a from-scratch rebuild, then `npm run test:db`.
   Re-running `npm run db:generate` should report no changes.
6. `supabase db push` to staging, then production. A migration is editable only until
   staging has applied it; after that, changes are new migrations.

## Seed data

`seed.sql` creates a demo organisation with an owner, two members, a few dozen trades
spread across several months with a realistic mix of winners and losers, tags, and one
published share link. It has to be good enough that the demo login tells a story and the
equity curve looks plausible.
