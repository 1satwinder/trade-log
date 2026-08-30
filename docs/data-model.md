# Data model

Owner of the schema, indexes, policies and storage layout. Drizzle defines the tables;
policies, helper functions, triggers and grants are hand-written SQL. Everything is
applied by the Supabase CLI.

## Tables

```sql
profiles(id uuid pk -> auth.users, display_name, avatar_url, created_at)

organizations(id uuid pk, name, slug unique, plan, plan_status, seat_limit,
              stripe_customer_id, stripe_subscription_id, created_at)

memberships(org_id uuid, user_id uuid, role org_role, created_at,
            primary key (org_id, user_id))

invitations(id uuid pk, org_id, email, role, token_hash, expires_at,
            accepted_at, invited_by, created_at)

accounts(id uuid pk, org_id, user_id, name, currency, starting_balance, created_at)

trades(id uuid pk, org_id, account_id, user_id, symbol, side,
       quantity, entry_price, exit_price, entry_at, exit_at, fees,
       status trade_status, thesis, created_at, updated_at)

tags(id uuid pk, org_id, name, color, unique (org_id, name))
trade_tags(trade_id, tag_id, primary key (trade_id, tag_id))

trade_attachments(id uuid pk, org_id, trade_id, storage_path, byte_size, created_at)

share_links(id uuid pk, org_id, account_id, slug unique, expires_at,
            revoked_at, created_by, created_at)

quote_cache(symbol, as_of date, close numeric, primary key (symbol, as_of))

stripe_events(id text pk, type, processed_at)
```

Enums: `org_role` is `owner | admin | member`; `trade_status` is `open | closed`.

## Design notes

**`org_id` is denormalised onto every child table.** This is intentional. It gives every
policy a single cheap predicate and avoids joining upward through `accounts` to establish
tenancy. The cost is that inserts must set it correctly, which is enforced by policy
`with check` clauses rather than trust.

**P&L is computed, not stored.** Realised P&L is a function of quantity, prices, side and
fees, so it is derived in a view or in query-time SQL. Storing it invites drift. The
Vitest unit tests cover the calculation directly.

**`quote_cache` is a cache, not a source of truth.** It exists so the equity curve and
open-position marks do not hammer the price provider, and it is safe to truncate.

**`stripe_events` exists only for idempotency.** Stripe retries webhooks; inserting the
event id first and ignoring conflicts is what makes the handler safe to run twice.

## Indexes

- `memberships(user_id, org_id)` — powers the "which orgs am I in" lookup
- `memberships(org_id)` — reverse lookup for the team page
- `trades(org_id, user_id)` — the member visibility predicate
- `trades(org_id, entry_at desc)` — the default list ordering, served from the index
- `accounts(org_id, user_id)`
- `share_links(slug)` — unique, drives the public page lookup

Rule of thumb applied throughout: every column that appears in a policy predicate is
indexed, with `org_id` at the head of composite indexes.

## Row level security

Helpers live in a `private` schema that is **not** exposed to the API. They are `stable
security definer` and always set an empty search path with fully-qualified object names,
which prevents a search-path substitution attack.

```sql
create function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.memberships where user_id = (select auth.uid());
$$;

create function private.is_org_manager(target_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  );
$$;

create policy "trades: read own, or all if manager" on public.trades
for select to authenticated using (
  org_id in (select private.my_org_ids())
  and (user_id = (select auth.uid()) or (select private.is_org_manager(org_id)))
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
2. Wrapping calls as `(select private.helper(...))` and `(select auth.uid())` turns them
   into a per-statement InitPlan instead of a per-row function call. The published
   Supabase benchmarks show this difference in orders of magnitude, not percentages.
3. Explicit `to authenticated` short-circuits anonymous requests before the rest of the
   predicate is evaluated.

Execute privileges on the `private` helpers are revoked from `anon`.

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
2. `drizzle-kit generate` produces the DDL.
3. Move the generated SQL into `supabase/migrations/<timestamp>_<name>.sql`. The rename
   matters: Drizzle's default `0000_*` naming sorts ahead of Supabase timestamps and
   would silently reorder the migration history.
4. Hand-write policies, functions, triggers and grants as their own migration files.
5. `supabase db reset` locally to verify a from-scratch rebuild, then run the RLS tests.
6. `supabase db push` to staging, then production.

## Seed data

`seed.sql` creates a demo organisation with an owner, two members, a few dozen trades
spread across several months with a realistic mix of winners and losers, tags, and one
published share link. It has to be good enough that the demo login tells a story and the
equity curve looks plausible.
